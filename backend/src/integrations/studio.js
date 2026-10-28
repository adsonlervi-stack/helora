// IA Helora: assistente que cria coisas para a empresa (textos, imagens, fluxos, artes no Canva),
// usando a IA que a empresa conectou e o cérebro da empresa.
import { supabase, listDepartments, createFlow } from "../config/db.js";
import { aiChat, resolveAI } from "../aiClient.js";
import { integrationsOf } from "./store.js";
import { brainContext } from "./brain.js";
import { uploadMedia } from "../storage.js";

async function companyFacts(accountId) {
  const [{ data: acc }, { count: leads }, { count: openConv }] = await Promise.all([
    supabase.from("accounts").select("name").eq("id", accountId).maybeSingle(),
    supabase.from("crm_leads").select("id", { count: "exact", head: true }).eq("account_id", accountId).is("deleted_at", null),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "open")
  ]).catch(() => [{ data: null }, { count: null }, { count: null }]);
  return { name: acc?.name || "a empresa", leads: leads ?? null, openConv: openConv ?? null };
}

/** Conversa com a IA Helora. messages = [{ role: "user"|"assistant", content }] */
export async function studioChat(accountId, messages) {
  const msgs = (messages || []).filter((m) => m && m.content).slice(-20).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 8000) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length) throw new Error("Escreva o que você precisa.");
  const last = [...msgs].reverse().find((m) => m.role === "user")?.content || "";
  const [facts, ctx, cfg] = await Promise.all([companyFacts(accountId), brainContext(accountId, last, 6), resolveAI(accountId)]);
  const system = [
    `Você é a IA Helora, assistente de criação da empresa "${facts.name}". Responda em português do Brasil, com tom profissional e próximo.`,
    "Você cria: posts e legendas para redes sociais, textos de campanha de WhatsApp, e-mails, roteiros de vídeo, propostas comerciais, respostas para clientes, scripts de atendimento, ideias de conteúdo e análises.",
    "Entregue o conteúdo pronto para usar (sem enrolação). Para redes sociais, inclua sugestão de legenda e hashtags. Mensagens de WhatsApp: curtas, com *negrito* do WhatsApp quando ajudar, sem markdown de títulos.",
    "Se o pedido for uma imagem/arte, descreva a ideia e diga que a pessoa pode clicar em \"Gerar imagem\" ou \"Criar no Canva\". Se for um fluxo de atendimento, diga que ela pode clicar em \"Criar fluxo\".",
    ctx ? `CONHECIMENTO DA EMPRESA (use quando for relevante; não invente o que não estiver aqui — preços, prazos, coberturas):\n${ctx}` : "A empresa ainda não alimentou o cérebro. Se precisar de dados específicos (preços, produtos), peça para a pessoa informar ou adicionar no Cérebro (aba Conexões).",
    facts.leads != null ? `Dados do Helora: ${facts.leads} leads no CRM, ${facts.openConv ?? 0} conversas em aberto.` : ""
  ].filter(Boolean).join("\n\n");
  const reply = await aiChat({ accountId, system, messages: msgs, maxTokens: 1500 });
  return { reply, provider: cfg?.provider || null };
}

/** Gera imagem com a IA conectada (ChatGPT/OpenAI ou Gemini). Devolve { url }. */
export async function studioImage(accountId, prompt, size = "1024x1024") {
  const map = await integrationsOf(accountId);
  const openaiKey = map.openai?.config?.apiKey || process.env.OPENAI_API_KEY;
  const geminiKey = map.gemini?.config?.apiKey || process.env.GEMINI_API_KEY;
  const pref = map.ai_default?.config?.provider;
  const p = String(prompt || "").trim().slice(0, 3000);
  if (!p) throw new Error("Descreva a imagem.");
  let buf = null;
  const useGemini = geminiKey && (pref === "gemini" || !openaiKey);
  if (!openaiKey && !geminiKey) throw new Error("Para gerar imagens, conecte o ChatGPT (OpenAI) ou o Gemini na aba Conexões. O Claude não gera imagens.");
  if (useGemini) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent", {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: p }] }] })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error?.message || `Gemini: erro ${r.status}`);
    const part = (d.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData?.data);
    if (!part) throw new Error("O Gemini não devolveu imagem. Tente descrever de outro jeito.");
    buf = Buffer.from(part.inlineData.data, "base64");
  } else {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1", prompt: p, size: ["1024x1024", "1024x1536", "1536x1024"].includes(size) ? size : "1024x1024", n: 1 })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error?.message || `OpenAI: erro ${r.status}`);
    const b64 = d.data?.[0]?.b64_json;
    if (b64) buf = Buffer.from(b64, "base64");
    else if (d.data?.[0]?.url) buf = Buffer.from(await (await fetch(d.data[0].url)).arrayBuffer());
    else throw new Error("A OpenAI não devolveu imagem.");
  }
  const url = await uploadMedia({ accountId, buffer: buf, extension: "png", contentType: "image/png" });
  return { url, buffer: buf };
}

const FLOW_TYPES = ["message", "question", "options", "action", "end", "ai", "hours", "wait"];

/** Cria um fluxo de atendimento (rascunho, desativado) a partir de uma descrição. */
export async function studioFlow(accountId, description) {
  const deps = await listDepartments(accountId).catch(() => []);
  const depList = deps.map((d) => `${d.id} = ${d.name}`).join("\n") || "(nenhum setor cadastrado)";
  const system = `Você monta fluxos de atendimento de WhatsApp para o Helora. Responda SOMENTE com JSON válido, sem texto fora do JSON, no formato:
{"name":"...","nodes":[{"id":"n1","type":"...","data":{...}}],"edges":[{"from":"n1","port":"...","to":"n2"}]}
O bloco de início ("start") já existe: crie uma aresta {"from":"start","port":"out","to":"<primeiro bloco>"}.
Tipos e portas de saída:
- message: data {text} → porta "out"
- question: data {text, variable} (variable em minúsculas, ex.: "nome", "email", "placa") → porta "out". Depois use {variable} nos textos.
- options: data {text, options:[{id:"o1",label:"..."}], invalidText} → uma porta para cada id de opção, e "invalid"
- hours: data {days:[1,2,3,4,5], start:"08:00", end:"18:00", timezone:"America/Sao_Paulo"} → portas "open" e "closed"
- wait: data {seconds} → "out"
- action: data {action:"transfer", departmentId, text} ou {action:"human", text} ou {action:"close", text} → "out"
- ai: data {instructions:"como a IA deve atender"} → portas "human" e "done"
- end: data {text} → sem saída
Setores disponíveis (use o id em departmentId; se não houver, use action "human"):
${depList}
Regras: textos curtos e simpáticos para WhatsApp; no máximo 25 blocos; todo caminho termina em end, action ou ai.`;
  const raw = await aiChat({ accountId, system, json: true, maxTokens: 3000, messages: [{ role: "user", content: String(description || "").slice(0, 4000) }] });
  let spec;
  try { spec = JSON.parse(String(raw).replace(/^```(?:json)?|```$/g, "").trim()); } catch { throw new Error("A IA não devolveu um fluxo válido. Tente descrever de outro jeito."); }
  const nodes = (spec.nodes || []).filter((n) => n && n.id && FLOW_TYPES.includes(n.type) && n.id !== "start").slice(0, 40);
  const ids = new Set(["start", ...nodes.map((n) => n.id)]);
  const edges = (spec.edges || []).filter((e) => e && ids.has(e.from) && ids.has(e.to)).map((e, i) => ({ id: `e${i + 1}`, from: e.from, port: e.port || "out", to: e.to }));
  if (!nodes.length) throw new Error("A IA não conseguiu montar o fluxo. Descreva as etapas com mais detalhes.");
  if (!edges.some((e) => e.from === "start")) edges.unshift({ id: "e0", from: "start", port: "out", to: nodes[0].id });
  for (const n of nodes) if (n.type === "options") n.data = { maxRetries: 2, invalidText: "Não entendi 😅 Escolha uma das opções:", ...(n.data || {}), options: (n.data?.options || []).map((o, i) => ({ id: o.id || `o${i + 1}`, label: String(o.label || `Opção ${i + 1}`).slice(0, 60) })) };
  // Posições: colunas por profundidade a partir do início
  const depth = new Map([["start", 0]]);
  const queue = ["start"];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of edges.filter((x) => x.from === cur)) if (!depth.has(e.to)) { depth.set(e.to, depth.get(cur) + 1); queue.push(e.to); }
  }
  const perCol = new Map();
  const allNodes = [{ id: "start", type: "trigger", data: {} }, ...nodes].map((n) => {
    const d = depth.get(n.id) ?? (Math.max(...depth.values()) + 1);
    const row = perCol.get(d) || 0;
    perCol.set(d, row + 1);
    return { id: n.id, type: n.type, x: 80 + d * 340, y: 80 + row * 220, data: n.data || {} };
  });
  const flow = await createFlow(accountId, { name: String(spec.name || "Fluxo criado pela IA Helora").slice(0, 80), description: `Criado pela IA Helora: ${String(description).slice(0, 200)}`, graph: { nodes: allNodes, edges } });
  return { id: flow.id, name: flow.name, blocks: allNodes.length };
}
