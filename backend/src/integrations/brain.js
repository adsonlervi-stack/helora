// Cérebro da empresa: base de conhecimento guardada no próprio Helora (Postgres),
// alimentada pelas Conexões (documentos, planilhas, sites, e-mails, textos).
// A busca é por texto completo em português; a resposta é escrita pela IA conectada.
import { supabase } from "../config/db.js";
import { aiChat } from "../aiClient.js";

const MAX_DOC_CHARS = 400000;

/** Divide o texto em trechos de ~1.200 caracteres, respeitando parágrafos. */
export function chunkText(text, size = 1200) {
  const clean = String(text || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n\n+/);
  const out = [];
  let cur = "";
  for (const p of paras) {
    if (p.length > size) {
      if (cur) { out.push(cur); cur = ""; }
      for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size));
      continue;
    }
    if ((cur + "\n\n" + p).length > size && cur) { out.push(cur); cur = p; }
    else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

/** Guarda (ou atualiza, quando tem ref) um documento no cérebro. */
export async function addDoc(accountId, { source = "texto", title, url = null, ref = null, content, meta = {}, createdBy = null, agentIds = null }) {
  const text = String(content || "").slice(0, MAX_DOC_CHARS);
  if (text.trim().length < 3) throw new Error("O conteúdo está vazio — não há texto para guardar.");
  const chunks = chunkText(text);
  let doc = null;
  if (ref) {
    const { data } = await supabase.from("brain_docs").select("id").eq("account_id", accountId).eq("source", source).eq("ref", ref).maybeSingle();
    doc = data || null;
  }
  const row = { account_id: accountId, source, title: String(title || "Sem título").slice(0, 200), url, ref, chars: text.length, meta, updated_at: new Date().toISOString() };
  if (agentIds) row.agent_ids = agentIds.length ? agentIds : null;
  if (doc) {
    const { error } = await supabase.from("brain_docs").update(row).eq("id", doc.id);
    if (error) throw error;
    await supabase.from("brain_chunks").delete().eq("doc_id", doc.id);
  } else {
    const { data, error } = await supabase.from("brain_docs").insert({ ...row, created_by: createdBy }).select("id").single();
    if (error) throw error;
    doc = data;
  }
  for (let i = 0; i < chunks.length; i += 200) {
    const { error } = await supabase.from("brain_chunks").insert(chunks.slice(i, i + 200).map((c, j) => ({ doc_id: doc.id, account_id: accountId, idx: i + j, content: c })));
    if (error) throw error;
  }
  return { id: doc.id, chunks: chunks.length, chars: text.length, updated: !!ref };
}

const STOP = new Set("a o as os e de da do das dos em no na nos nas um uma uns umas para por com sem que qual quais como quando onde porque pra pro se ser ter tem foi era sao são é ao aos à às meu minha seu sua isso esse essa este esta voce você eu ele ela nos nós mais menos muito pouco já ja ou mas tambem também sobre entre ate até".split(" "));

/** Monta a busca: qualquer palavra da pergunta (com prefixo), sem palavras vazias. */
export function toTsQuery(q) {
  const words = String(q || "").toLowerCase().normalize("NFC").match(/[\p{L}\p{N}]{3,}/gu) || [];
  const uniq = [...new Set(words.filter((w) => !STOP.has(w)))].slice(0, 12);
  return uniq.map((w) => `${w.replace(/[^\p{L}\p{N}]/gu, "")}:*`).join(" | ");
}

export async function searchBrain(accountId, query, limit = 6, promptId = null) {
  const q = toTsQuery(query);
  if (!q) return [];
  const { data, error } = await supabase.rpc("brain_search", { p_account: accountId, p_query: q, p_limit: limit, p_prompt: promptId || null });
  if (error) {
    if (!/brain_search|does not exist/.test(error.message)) console.warn("[Cérebro] busca:", error.message);
    return [];
  }
  return data || [];
}

/** Texto pronto para colocar no prompt da IA do atendimento. */
export async function brainContext(accountId, query, limit = 5, promptId = null) {
  const hits = await searchBrain(accountId, query, limit, promptId).catch(() => []);
  if (!hits.length) return "";
  return hits.map((h, i) => `[${i + 1}] ${h.title}${h.url ? ` (${h.url})` : ""}\n${h.content}`).join("\n\n---\n\n");
}

/** Pergunta ao cérebro: busca os trechos e a IA responde só com base neles. */
export async function askBrain(accountId, question) {
  const hits = await searchBrain(accountId, question, 8);
  if (!hits.length) return { answer: "Não encontrei nada sobre isso no cérebro da empresa. Adicione documentos, planilhas ou sites na aba Conexões.", sources: [] };
  const ctx = hits.map((h, i) => `[${i + 1}] Fonte: ${h.title} (${h.source})\n${h.content}`).join("\n\n---\n\n");
  const answer = await aiChat({
    accountId,
    maxTokens: 700,
    system: "Você é o assistente interno da empresa. Responda em português do Brasil, de forma direta, usando SOMENTE as informações dos trechos abaixo. Cite as fontes no texto como [1], [2]. Se os trechos não responderem à pergunta, diga claramente que não encontrou essa informação.\n\nTRECHOS:\n" + ctx,
    messages: [{ role: "user", content: String(question).slice(0, 2000) }]
  });
  const seen = new Set();
  const sources = hits.map((h, i) => ({ n: i + 1, docId: h.doc_id, title: h.title, source: h.source, url: h.url })).filter((s) => !seen.has(s.docId) && seen.add(s.docId));
  return { answer, sources };
}

// ------------------------------------------------------------ Leitura de fontes
const stripHtml = (html) => String(html || "")
  .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

/** Lê um link: Google Docs, Planilhas, Apresentações, arquivo do Drive ou página de site. */
export async function readUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("Cole um link começando com http:// ou https://");
  let fetchUrl = url, kind = "site";
  const doc = url.match(/docs\.google\.com\/document\/d\/([\w-]+)/);
  const sheet = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  const slides = url.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/);
  const file = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/);
  if (doc) { fetchUrl = `https://docs.google.com/document/d/${doc[1]}/export?format=txt`; kind = "google_docs"; }
  else if (sheet) { const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1]; fetchUrl = `https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv${gid ? `&gid=${gid}` : ""}`; kind = "google_sheets"; }
  else if (slides) { fetchUrl = `https://docs.google.com/presentation/d/${slides[1]}/export/txt`; kind = "google_slides"; }
  else if (file) { fetchUrl = `https://drive.google.com/uc?export=download&id=${file[1]}`; kind = "google_drive"; }
  const r = await fetch(fetchUrl, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (Helora)" } });
  if (!r.ok) {
    if (kind.startsWith("google")) throw new Error("Não consegui abrir o arquivo do Google. No Google, clique em Compartilhar → \"Qualquer pessoa com o link\" (Leitor) e tente de novo.");
    throw new Error(`Não consegui abrir o link (HTTP ${r.status}).`);
  }
  const ct = r.headers.get("content-type") || "";
  const buf = Buffer.from(await r.arrayBuffer());
  if (kind.startsWith("google") && /text\/html/.test(ct) && /accounts\.google\.com|ServiceLogin/i.test(buf.toString("utf8", 0, 4000))) {
    throw new Error("Esse arquivo do Google é privado. Clique em Compartilhar → \"Qualquer pessoa com o link\" (Leitor) e tente de novo.");
  }
  if (/pdf/.test(ct) || /\.pdf($|\?)/i.test(url)) return { kind: kind === "site" ? "pdf" : kind, title: decodeURIComponent(url.split("/").pop().split("?")[0] || "PDF"), content: await readFile(buf, "arquivo.pdf", "application/pdf").then((x) => x.content) };
  const text = buf.toString("utf8");
  if (kind === "google_sheets") return { kind, title: "Planilha do Google", content: csvToText(text) };
  if (kind === "google_docs" || kind === "google_slides") return { kind, title: (text.split("\n").find((l) => l.trim()) || "Documento do Google").trim().slice(0, 120), content: text };
  if (/text\/html/.test(ct) || /<html/i.test(text.slice(0, 500))) {
    const title = (text.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim() || new URL(url).hostname;
    return { kind, title: stripHtml(title), content: stripHtml(text) };
  }
  return { kind, title: new URL(url).hostname, content: text };
}

/** Planilha → texto legível ("Coluna: valor" por linha), que a busca entende melhor. */
export function csvToText(csv) {
  const rows = [];
  let row = [], cell = "", q = false;
  const s = String(csv || "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === "," || c === ";") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (rows.length < 2) return s;
  const head = rows[0].map((h, i) => h.trim() || `Coluna ${i + 1}`);
  return rows.slice(1).filter((r) => r.some((x) => String(x).trim()))
    .map((r) => head.map((h, i) => (String(r[i] || "").trim() ? `${h}: ${String(r[i]).trim()}` : null)).filter(Boolean).join(" · "))
    .join("\n");
}

/** Lê um arquivo enviado: PDF, Word (.docx), texto, CSV, Markdown, JSON. */
export async function readFile(buffer, name = "arquivo", mime = "") {
  const ext = (String(name).split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || /pdf/.test(mime)) {
    const { default: pdf } = await import("pdf-parse/lib/pdf-parse.js");
    const r = await pdf(buffer);
    const content = String(r.text || "").trim();
    if (content.length < 20) throw new Error("Esse PDF parece ser só imagem (escaneado). Envie um PDF com texto selecionável.");
    return { kind: "pdf", content };
  }
  if (ext === "docx" || /wordprocessingml/.test(mime)) {
    const mammoth = (await import("mammoth")).default;
    const r = await mammoth.extractRawText({ buffer });
    return { kind: "word", content: r.value || "" };
  }
  if (ext === "csv") return { kind: "planilha", content: csvToText(buffer.toString("utf8")) };
  if (["txt", "md", "json", "html", "htm"].includes(ext) || /^text\//.test(mime)) {
    const t = buffer.toString("utf8");
    return { kind: "texto", content: /htm/.test(ext) ? stripHtml(t) : t };
  }
  if (["xlsx", "xls"].includes(ext)) throw new Error("Para planilhas do Excel, salve como CSV (Arquivo → Salvar como → CSV) ou use o link do Google Planilhas.");
  throw new Error("Formato não suportado. Envie PDF, Word (.docx), TXT ou CSV.");
}
