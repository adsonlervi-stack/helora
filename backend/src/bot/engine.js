import { listAutoReplies, updateConversation, addCsatResponse, getBotFlow, getActiveFlow, getAccountSettings, getContactRouting } from "../config/db.js";
import { isOpenNow, DEFAULT_OOH_MESSAGE } from "./businessHours.js";
import { runFlow } from "./flowEngine.js";
import { runActiveFlow, runChannelAttendant } from "./flowRunner.js";
import { supabase as attDb } from "../config/db.js";

// Atendente IA ligado no canal (cache de 30s)
const attCache = new Map();
async function channelAttendant(channelId) {
  if (!channelId) return null;
  const hit = attCache.get(channelId);
  if (hit && Date.now() - hit.at < 30000) return hit.id;
  const { data, error } = await attDb.from("channels").select("ai_prompt_id").eq("id", channelId).maybeSingle();
  const id = error ? null : data?.ai_prompt_id || null;
  attCache.set(channelId, { at: Date.now(), id });
  return id;
}
export const clearAttendantCache = () => attCache.clear();

const RESTART_AFTER_MS = 60 * 60 * 1000; // fluxo terminou há mais de 1h → começa de novo

const MENU_TEXT =
  "Olá! 👋 Escolha uma opção:\n" +
  "1 - Horário de atendimento\n" +
  "2 - Falar com um atendente\n" +
  "3 - Ver nossos planos";

const CSAT_INVALID_TEXT = "Por favor, responda apenas com um número de 1 a 5. 🙏";
const CSAT_THANKS_TEXT = "Muito obrigado pela sua avaliação! 🙏";
export const CSAT_PROMPT_TEXT =
  "Antes de encerrar: de 1 a 5, como você avalia esse atendimento? (responda só com o número)";

function normalize(text = "") {
  return String(text || "")
    // ignora a assinatura do atendente ("*Nome:*" na 1ª linha) e a formatação do WhatsApp
    .replace(/^\s*\*[^*\n]{1,60}:\*\s*\n+/, "")
    .replace(/[*_~`]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Decide a resposta do bot para uma mensagem recebida.
 * Retorna `null` quando o bot não deve responder (ex: conversa em modo humano).
 *
 * A conta pode ter um fluxo próprio configurado (Etapa 5 — construtor de
 * árvore de decisão, editável em Agentes → Fluxo do bot). Enquanto a conta
 * não configura nada, o bot usa o menu fixo abaixo — exatamente o
 * comportamento de antes dessa etapa existir, então nenhuma conta em
 * produção quebra por causa disso.
 *
 * @param {string} accountId - conta (tenant) dona dessa conversa
 * @param {object} conversation - registro da conversa (vindo do db)
 * @param {string} rawText - texto recebido do usuário
 * @returns {Promise<string|null>}
 */
export async function handleIncoming(accountId, conversation, rawText, send) {
  // A pesquisa de satisfação tem prioridade sobre tudo — mesmo que a
  // conversa esteja em modo "Atendente", ainda queremos capturar a nota
  // que o cliente está respondendo.
  if (conversation.awaitingCsat) {
    const askedAt = conversation.flowVars?.__csatAt ? new Date(conversation.flowVars.__csatAt).getTime() : 0;
    const expired = askedAt && Date.now() - askedAt > 5 * 60 * 1000;
    const rating = parseInt(rawText.trim(), 10);
    if (!expired && Number.isInteger(rating) && rating >= 1 && rating <= 5 && rawText.trim().length <= 2) {
      await addCsatResponse({ accountId, conversationId: conversation.id, rating });
      await updateConversation(accountId, conversation.id, { awaitingCsat: false });
      return CSAT_THANKS_TEXT;
    }
    // Não respondeu a nota (ou passaram 5 min): não insiste — segue o atendimento normal.
    await updateConversation(accountId, conversation.id, { awaitingCsat: false }).catch(() => {});
    conversation.awaitingCsat = false;
  }

  // Conversa resolvida que recebeu mensagem nova = novo atendimento:
  // reabre, volta pro bot e reinicia o fluxo.
  if (conversation.status === "resolved") {
    const reset = { status: "open", mode: "bot", assignedAgentId: null, botNodeId: null, flowVars: {} };
    await updateConversation(accountId, conversation.id, reset).catch(() => {});
    Object.assign(conversation, reset, { isNew: true });
  }

  // Contato com atendente/setor padrão: não passa pelo bot, vai direto.
  if (conversation.mode === "bot" && !conversation.assignedAgentId) {
    const route = await getContactRouting(accountId, conversation).catch(() => null);
    if (route) {
      const patch = { mode: "human", isNew: false };
      if (route.agentId) patch.assignedAgentId = route.agentId;
      if (route.departmentId) patch.departmentId = route.departmentId;
      await updateConversation(accountId, conversation.id, patch).catch(() => {});
      Object.assign(conversation, patch);
      return null;
    }
  }

  // Fora do horário de atendimento (do fluxo do canal ou da empresa): avisa
  // o cliente uma vez a cada 6h e o bot não segue o fluxo.
  try {
    const flowForHours = await getActiveFlow(accountId, conversation.channelId).catch(() => null);
    const hours = flowForHours?.graph?.hours?.enabled
      ? flowForHours.graph.hours
      : (await getAccountSettings(accountId)).businessHours;
    const phoneAt = conversation.flowVars?.__phoneAt ? new Date(conversation.flowVars.__phoneAt).getTime() : 0;
    const talkingByPhone = phoneAt && Date.now() - phoneAt < 12 * 3600 * 1000; // empresa falando pelo celular
    if (hours?.enabled && !isOpenNow(hours) && !talkingByPhone) {
      const vars = conversation.flowVars || {};
      const last = vars.__oohAt ? new Date(vars.__oohAt).getTime() : 0;
      if (Date.now() - last < 6 * 3600 * 1000) return null;
      await updateConversation(accountId, conversation.id, { flowVars: { ...vars, __oohAt: new Date().toISOString() } }).catch(() => {});
      return hours.message || DEFAULT_OOH_MESSAGE;
    }
  } catch (err) {
    console.error("[Horário] erro:", err.message);
  }

  if (conversation.mode === "human") {
    // Um atendente humano assumiu a conversa, o bot fica em silêncio.
    return null;
  }

  const text = normalize(rawText);

  // ---------- Atendente IA no canal: responde tudo com o que a empresa alimentou ----------
  const attendantId = await channelAttendant(conversation.channelId).catch(() => null);
  if (attendantId) {
    try {
      const reply = await runChannelAttendant({ accountId, conversation, promptId: attendantId });
      if (reply && send) { await send(reply); return null; }
      return reply;
    } catch (err) {
      console.error("[Atendente IA] erro:", err.message);
    }
  }

  // ---------- Construtor de fluxos (canvas) — tem prioridade quando há um fluxo ativo ----------
  const activeFlow = await getActiveFlow(accountId, conversation.channelId);
  if (activeFlow) {
    const vars = conversation.flowVars || {};
    if (vars.__ended && !conversation.botNodeId) {
      const endedAt = vars.__endedAt ? new Date(vars.__endedAt).getTime() : 0;
      if (Date.now() - endedAt < RESTART_AFTER_MS) return null; // acabou de terminar: não repete o menu
      conversation.flowVars = {};
    }
    const collected = [];
    const sender = send || (async (t) => collected.push(t));
    await runActiveFlow({ accountId, conversation, flow: activeFlow, text: rawText, send: sender });
    return send ? null : collected.join("\n\n") || null;
  }

  const flow = await getBotFlow(accountId);

  if (flow) {
    const flowReply = await runFlow(accountId, conversation, rawText, flow);
    if (flowReply !== null) return flowReply;
    // flowReply === null: mensagem fora do roteiro configurado — cai pras
    // respostas por palavra-chave / fallback genérico, mais abaixo.
  } else {
    // ---------- Menu padrão fixo (só roda se a conta não tem fluxo próprio) ----------
    if (conversation.isNew) {
      return MENU_TEXT;
    }
    if (text === "1") {
      return "Nosso atendimento funciona de segunda a sexta, das 9h às 18h.";
    }
    if (text === "2") {
      await updateConversation(accountId, conversation.id, { mode: "human" });
      return "Ok! Um atendente humano vai continuar essa conversa a partir de agora. 🙋";
    }
    if (text === "3") {
      return "Temos planos a partir de R$ 99/mês. Digite 'preco' para mais detalhes ou '2' para falar com um atendente.";
    }
  }

  // Respostas automáticas configuráveis por palavra-chave (funcionam com
  // ou sem um fluxo configurado — é a camada mais simples de todas).
  const autoReplies = await listAutoReplies(accountId);
  const match = autoReplies.find((a) => text.includes(a.keyword));
  if (match) {
    return match.response;
  }

  // Fallback
  return flow ? "Desculpe, não entendi. 🤔" : "Desculpe, não entendi. 🤔\n" + MENU_TEXT;
}
