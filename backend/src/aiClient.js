/**
 * Cliente da IA. Cada empresa pode conectar a própria conta (aba Conexões):
 * ChatGPT (OpenAI), Claude (Anthropic) ou Gemini (Google). Sem conexão própria,
 * usa a chave do servidor: OPENAI_API_KEY ou ANTHROPIC_API_KEY (AI_PROVIDER escolhe).
 */
import { integrationsOf } from "./integrations/store.js";

const envProvider = () => {
  const want = String(process.env.AI_PROVIDER || "").toLowerCase();
  if (want === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
};
export const DEFAULT_MODELS = { openai: "gpt-4o-mini", anthropic: "claude-haiku-5-5", gemini: "gemini-2.5-flash" };
export const aiConfigured = () => !!envProvider();
export const aiProvider = () => envProvider();

/** Qual IA usar para esta empresa: a conectada por ela (preferida) ou a do servidor. */
export async function resolveAI(accountId) {
  if (accountId) {
    const map = await integrationsOf(accountId).catch(() => ({}));
    const keys = ["openai", "anthropic", "gemini"].filter((k) => map[k]?.config?.apiKey);
    const pref = map.ai_default?.config?.provider;
    const pick = keys.includes(pref) ? pref : keys[0];
    if (pick) return { provider: pick, apiKey: map[pick].config.apiKey, model: map[pick].config.model || DEFAULT_MODELS[pick], own: true };
  }
  const p = envProvider();
  if (!p) return null;
  const apiKey = p === "openai" ? process.env.OPENAI_API_KEY : p === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.GEMINI_API_KEY;
  const model = p === "openai" ? process.env.OPENAI_MODEL || DEFAULT_MODELS.openai : p === "anthropic" ? process.env.AI_MODEL || DEFAULT_MODELS.anthropic : process.env.GEMINI_MODEL || DEFAULT_MODELS.gemini;
  return { provider: p, apiKey, model, own: false };
}
export async function aiConfiguredFor(accountId) { return !!(await resolveAI(accountId)); }

const textOf = (m) => (typeof m.content === "string" ? m.content : (m.content || []).map((c) => c.text || "").join("\n"));

/** Chamada direta a um provedor (também usada para testar a chave na hora de conectar). */
export async function callAI(cfg, { system, messages, maxTokens = 500, json = false, temperature = 0.4 }) {
  const { provider, apiKey, model } = cfg;
  if (provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || DEFAULT_MODELS.openai, max_tokens: maxTokens, temperature,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        messages: [...(system ? [{ role: "system", content: system }] : []), ...(messages || []).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: textOf(m) }))]
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || `Falha na IA (${r.status})`);
    return String(data.choices?.[0]?.message?.content || "").trim();
  }
  if (provider === "gemini") {
    const contents = (messages || []).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: textOf(m) }] }));
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || DEFAULT_MODELS.gemini)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: contents.length ? contents : [{ role: "user", parts: [{ text: "Olá" }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature, ...(json ? { responseMimeType: "application/json" } : {}) }
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || `Falha na IA (${r.status})`);
    return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: model || DEFAULT_MODELS.anthropic, max_tokens: maxTokens, temperature, system, messages: (messages || []).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: textOf(m) })) })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Falha na IA (${r.status})`);
  return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
}

export async function aiChat({ system, messages, maxTokens = 500, json = false, accountId = null }) {
  const cfg = await resolveAI(accountId);
  if (!cfg) throw new Error("IA não configurada. Conecte o ChatGPT, o Claude ou o Gemini na aba Conexões.");
  return callAI(cfg, { system, messages, maxTokens, json });
}

/** Transcreve o áudio do cliente (nota de voz) para texto. Usa OPENAI_API_KEY (Whisper). */
export const transcriptionConfigured = () => !!process.env.OPENAI_API_KEY;
export async function transcribeAudio(url) {
  if (!transcriptionConfigured() || !url) return null;
  const audio = await fetch(url);
  if (!audio.ok) throw new Error("Não consegui baixar o áudio.");
  const buf = Buffer.from(await audio.arrayBuffer());
  if (buf.length > 24 * 1024 * 1024) return null;
  const form = new FormData();
  form.append("file", new Blob([buf], { type: audio.headers.get("content-type") || "audio/ogg" }), "audio.ogg");
  form.append("model", process.env.TRANSCRIBE_MODEL || "whisper-1");
  form.append("language", "pt");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Falha na transcrição (${r.status})`);
  return String(data.text || "").trim() || null;
}
