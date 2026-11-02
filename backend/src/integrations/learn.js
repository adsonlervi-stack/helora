// Cérebro que aprende sozinho: lê as conversas encerradas e guarda o que serve para atender (perguntas, respostas, preços, regras),
// separado por empresa. Nada de dados pessoais. Roda a cada 6 horas para empresas com a Helora IA ativa.
import { supabase } from "../config/db.js";
import { aiChat, aiEnabledFor, resolveAI } from "../aiClient.js";
import { addDoc } from "./brain.js";
import { getIntegration, saveIntegration } from "./store.js";

const SYSTEM = `Você organiza o conhecimento de atendimento de uma empresa brasileira.
Recebe conversas de WhatsApp entre a empresa (EMPRESA) e clientes (CLIENTE).
Extraia SÓ o que ajuda a atender outros clientes: perguntas frequentes e a resposta que a empresa deu, produtos, preços, prazos, regras, documentos pedidos, horários, objeções e como foram respondidas.
NUNCA inclua nome, telefone, CPF, e-mail, endereço ou qualquer dado pessoal de cliente.
Ignore conversas sem conteúdo útil. Não invente nada que não esteja nas conversas.
Responda em português, em tópicos curtos no formato:
P: pergunta do cliente
R: como a empresa responde
ou "Regra: …" / "Produto: …". Se não houver nada útil, responda só: NADA`;

export async function learnFromConversations(accountId, { max = 25 } = {}) {
  if (!(await aiEnabledFor(accountId)) || !(await resolveAI(accountId))) return { skipped: true };
  const st = (await getIntegration(accountId, "brain_learn"))?.config || {};
  if (st.off) return { skipped: true };
  const since = st.lastAt || new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: convs } = await supabase.from("conversations").select("id, resolved_at").eq("account_id", accountId)
    .eq("status", "resolved").eq("is_group", false).gt("resolved_at", since).order("resolved_at").limit(max);
  if (!convs?.length) return { learned: 0 };
  const parts = [];
  for (const c of convs) {
    const { data: msgs } = await supabase.from("messages").select("direction, author, text").eq("conversation_id", c.id).order("timestamp", { ascending: false }).limit(40);
    const lines = (msgs || []).reverse().filter((m) => m.text && m.author !== "system").map((m) => `${m.direction === "out" ? "EMPRESA" : "CLIENTE"}: ${String(m.text).replace(/^\*[^*\n]{1,60}:\*\s*/, "").slice(0, 600)}`);
    if (lines.length >= 3) parts.push(lines.join("\n"));
  }
  const lastAt = convs[convs.length - 1].resolved_at;
  if (!parts.length) { await saveIntegration(accountId, "brain_learn", { ...st, lastAt }); return { learned: 0 }; }
  const out = String(await aiChat({ accountId, system: SYSTEM, maxTokens: 1500, messages: [{ role: "user", content: parts.map((p, i) => `--- Conversa ${i + 1}\n${p}`).join("\n\n").slice(0, 60000) }] }) || "").trim();
  let learned = 0;
  if (out && !/^NADA\b/i.test(out)) {
    const day = new Date().toISOString().slice(0, 10);
    await addDoc(accountId, { source: "conversas", title: `Aprendido das conversas · ${day.split("-").reverse().join("/")}`, ref: `learn-${day}`, content: out, meta: { conversations: convs.length } });
    learned = 1;
  }
  await saveIntegration(accountId, "brain_learn", { ...st, lastAt, lastRun: new Date().toISOString(), total: (st.total || 0) + convs.length });
  return { learned, conversations: convs.length };
}

export function startBrainLearning() {
  const run = async () => {
    try {
      const { data: accs } = await supabase.from("accounts").select("id");
      for (const a of accs || []) await learnFromConversations(a.id).catch((e) => console.warn("[Cérebro] aprender:", e.message));
    } catch {}
  };
  setTimeout(run, 15 * 60 * 1000);
  setInterval(run, 6 * 60 * 60 * 1000);
}
