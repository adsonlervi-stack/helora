import { listAutoReplies, updateConversation, addCsatResponse, getBotFlow } from "../config/db.js";
import { runFlow } from "./flowEngine.js";

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
  return text
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
export async function handleIncoming(accountId, conversation, rawText) {
  // A pesquisa de satisfação tem prioridade sobre tudo — mesmo que a
  // conversa esteja em modo "Atendente", ainda queremos capturar a nota
  // que o cliente está respondendo.
  if (conversation.awaitingCsat) {
    const rating = parseInt(rawText.trim(), 10);
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
      await addCsatResponse({ accountId, conversationId: conversation.id, rating });
      await updateConversation(accountId, conversation.id, { awaitingCsat: false });
      return CSAT_THANKS_TEXT;
    }
    return CSAT_INVALID_TEXT;
  }

  if (conversation.mode === "human") {
    // Um atendente humano assumiu a conversa, o bot fica em silêncio.
    return null;
  }

  const text = normalize(rawText);
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
