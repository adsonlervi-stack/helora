// Pesquisa na internet para a Helora IA (estilo buscador com fontes). Usa a Tavily (TAVILY_API_KEY no Railway).
export const webSearchConfigured = () => !!process.env.TAVILY_API_KEY;

export async function webSearch(query, { deep = false, max = 6 } = {}) {
  if (!webSearchConfigured()) throw new Error("A pesquisa na web ainda não está ativa (falta a chave TAVILY_API_KEY no servidor).");
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query: String(query).slice(0, 400), search_depth: deep ? "advanced" : "basic", max_results: Math.min(10, max), include_answer: false })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.detail?.error || d?.error || `Pesquisa na web falhou (${r.status})`);
  return (d.results || []).map((x, i) => ({ n: i + 1, title: x.title || x.url, url: x.url, content: String(x.content || "").slice(0, deep ? 2500 : 1200) }));
}
