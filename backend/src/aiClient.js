/** Cliente da IA (Claude, da Anthropic). Variáveis: ANTHROPIC_API_KEY e AI_MODEL (opcional). */
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;
const MODEL = () => process.env.AI_MODEL || "claude-haiku-5-5";

export async function aiChat({ system, messages, maxTokens = 500 }) {
  if (!aiConfigured()) throw new Error("IA não configurada (ANTHROPIC_API_KEY).");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Falha na IA (${r.status})`);
  return (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
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
