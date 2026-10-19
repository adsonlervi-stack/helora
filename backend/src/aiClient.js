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
