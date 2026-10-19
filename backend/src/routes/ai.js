import { Router } from "express";
import { supabase, getConversation, listMessages } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

/**
 * IA nativa (Claude, da Anthropic): sugerir resposta, melhorar/corrigir texto e resumir a conversa.
 * Variáveis na Railway: ANTHROPIC_API_KEY (obrigatória) e AI_MODEL (opcional).
 */
const router = Router();
router.use(requireAuth);

const MODEL = () => process.env.AI_MODEL || "claude-haiku-5-5";
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

async function companyAllowsAi(accountId) {
  const { data } = await supabase.from("accounts").select("enabled_tabs, name").eq("id", accountId).maybeSingle();
  return { ok: !Array.isArray(data?.enabled_tabs) || data.enabled_tabs.includes("ai"), name: data?.name || "a empresa" };
}

async function ask(system, user, maxTokens = 600) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Falha na IA (${r.status})`);
  return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
}

function transcript(messages, customerName) {
  return messages
    .filter((m) => m.author !== "system" && (m.text || m.mediaType))
    .slice(-30)
    .map((m) => `${m.direction === "in" ? customerName || "Cliente" : m.author === "bot" ? "Robô" : "Atendente"}: ${m.text || `[${m.mediaType}]`}`)
    .join("\n");
}

async function guard(req, res) {
  if (!aiConfigured()) { res.status(503).json({ error: "IA ainda não configurada. Peça ao suporte Helora para ativar." }); return null; }
  const c = await companyAllowsAi(req.accountId);
  if (!c.ok && !req.isSuperAdmin) { res.status(403).json({ error: "O módulo de IA não está liberado para a sua empresa." }); return null; }
  return c;
}

router.get("/status", async (req, res) => {
  const c = await companyAllowsAi(req.accountId).catch(() => ({ ok: false }));
  res.json({ configured: aiConfigured(), enabled: aiConfigured() && (c.ok || req.isSuperAdmin) });
});

// Sugere a próxima resposta do atendente com base na conversa
router.post("/suggest", async (req, res) => {
  try {
    const c = await guard(req, res);
    if (!c) return;
    const conv = await getConversation(req.accountId, req.body?.conversationId);
    if (!conv) return res.status(404).json({ error: "Conversa não encontrada." });
    const msgs = await listMessages(req.accountId, conv.id);
    const text = await ask(
      `Você é um atendente de ${c.name} respondendo no WhatsApp. Escreva APENAS a próxima mensagem do atendente, em português do Brasil, curta, cordial e objetiva, sem inventar preços, prazos ou políticas que não estejam na conversa. Não use saudação se a conversa já começou. Não coloque aspas nem assinatura.`,
      `Conversa até agora:\n${transcript(msgs, conv.name)}\n\n${req.body?.hint ? `Orientação do atendente: ${req.body.hint}\n\n` : ""}Próxima mensagem do atendente:`,
      400
    );
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Melhora / corrige / ajusta o tom de um texto digitado
router.post("/rewrite", async (req, res) => {
  try {
    const c = await guard(req, res);
    if (!c) return;
    const input = String(req.body?.text || "").slice(0, 4000);
    if (!input.trim()) return res.status(400).json({ error: "Digite um texto primeiro." });
    const MODES = {
      fix: "Corrija ortografia, acentuação e pontuação, mantendo o texto e o tom originais.",
      formal: "Reescreva com tom mais formal e profissional, mantendo o sentido.",
      friendly: "Reescreva com tom mais simpático e acolhedor, mantendo o sentido.",
      short: "Deixe mais curto e direto, mantendo as informações importantes."
    };
    const text = await ask(
      `Você revisa mensagens de atendimento por WhatsApp em português do Brasil. ${MODES[req.body?.mode] || MODES.fix} Responda APENAS com o texto final, sem comentários nem aspas.`,
      input,
      600
    );
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resumo da conversa (para transferência ou para o gestor)
router.post("/summary", async (req, res) => {
  try {
    const c = await guard(req, res);
    if (!c) return;
    const conv = await getConversation(req.accountId, req.body?.conversationId);
    if (!conv) return res.status(404).json({ error: "Conversa não encontrada." });
    const msgs = await listMessages(req.accountId, conv.id);
    const text = await ask(
      "Resuma conversas de atendimento em português do Brasil, em até 5 tópicos curtos: o que o cliente quer, o que já foi feito/respondido, pendências e próximo passo sugerido. Não invente nada.",
      transcript(msgs, conv.name),
      500
    );
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
