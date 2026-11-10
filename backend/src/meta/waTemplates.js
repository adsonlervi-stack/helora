// Templates do WhatsApp (API oficial): listar, criar, editar, apagar e enviar.
// Suporta título em texto ou anexo (imagem, vídeo, documento), variáveis no texto,
// no título e no link do botão, e botões de resposta, link, telefone e copiar código.
import { Router } from "express";
import axios from "axios";
import { supabase, getConversation, addMessage, updateConversation, getPrimaryWhatsAppChannel } from "../config/db.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";

const G = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;
const errMsg = (e) => e.response?.data?.error?.error_user_msg || e.response?.data?.error?.message || e.message;
const nVars = (t) => (String(t || "").match(/\{\{\d+\}\}/g) || []).length;
const MEDIA = ["IMAGE", "VIDEO", "DOCUMENT"];

export async function cloudChannelRow(accountId, id) {
  const { data } = await supabase.from("channels").select("id, name, provider, waba_id, phone_number_id, access_token").eq("account_id", accountId).eq("id", id).maybeSingle();
  if (!data || data.provider !== "cloud") throw new Error("Este canal não usa a API oficial do WhatsApp.");
  if (!data.waba_id) throw new Error("Informe o WABA ID do canal para usar templates.");
  return data;
}
const auth = (ch) => ({ headers: { Authorization: `Bearer ${ch.access_token}` }, timeout: 30000 });

/** Sobe o arquivo de exemplo do título para a Meta (upload retomável) e devolve o handle. */
async function sampleHandle(ch, url) {
  const file = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
  const type = String(file.headers["content-type"] || "application/octet-stream").split(";")[0];
  const buf = Buffer.from(file.data);
  const { data: s } = await axios.post(`${G()}/${process.env.META_APP_ID}/uploads`, null, { ...auth(ch), params: { file_length: buf.length, file_type: type } });
  const { data: up } = await axios.post(`${G()}/${s.id}`, buf, { headers: { Authorization: `OAuth ${ch.access_token}`, file_offset: "0", "Content-Type": type }, timeout: 60000, maxBodyLength: Infinity });
  return up.h;
}

/** Converte o formulário do Helora nos componentes da Meta. */
async function buildComponents(ch, b) {
  const comps = [];
  const fmt = String(b.headerType || (b.header ? "TEXT" : "NONE")).toUpperCase();
  if (fmt === "TEXT" && b.header) {
    comps.push({ type: "HEADER", format: "TEXT", text: b.header, ...(nVars(b.header) ? { example: { header_text: [b.headerExample || "exemplo"] } } : {}) });
  } else if (MEDIA.includes(fmt)) {
    if (!b.headerSample) throw new Error("Envie um arquivo de exemplo para o anexo do título.");
    comps.push({ type: "HEADER", format: fmt, example: { header_handle: [await sampleHandle(ch, b.headerSample)] } });
  }
  const body = String(b.body || "");
  if (!body.trim()) throw new Error("Escreva o texto do template.");
  const ex = b.examples || [];
  comps.push({ type: "BODY", text: body, ...(nVars(body) ? { example: { body_text: [Array.from({ length: nVars(body) }, (_, i) => ex[i] || `exemplo ${i + 1}`)] } } : {}) });
  if (b.footer) comps.push({ type: "FOOTER", text: b.footer });
  const btns = [];
  for (const x of (b.buttons || []).slice(0, 10)) {
    if (x.type === "code") { btns.push({ type: "COPY_CODE", example: x.example || "CODIGO10" }); continue; }
    if (!x.text) continue;
    if (x.type === "url") btns.push({ type: "URL", text: x.text, url: x.url, ...(nVars(x.url) ? { example: [String(x.url).replace(/\{\{1\}\}/, x.example || "exemplo")] } : {}) });
    else if (x.type === "phone") btns.push({ type: "PHONE_NUMBER", text: x.text, phone_number: `+${String(x.phone || "").replace(/\D/g, "")}` });
    else btns.push({ type: "QUICK_REPLY", text: x.text });
  }
  if (btns.length) comps.push({ type: "BUTTONS", buttons: btns });
  return comps;
}

/** Componentes de envio: variáveis do título/texto, anexo do título e variáveis dos botões. */
export function sendComponents(tpl, v = {}) {
  const out = [];
  const head = tpl.components?.find((c) => c.type === "HEADER");
  if (head && MEDIA.includes(head.format)) {
    const m = v.headerMedia?.url ? v.headerMedia : { url: head.example?.header_handle?.[0] };
    if (!m.url) throw new Error("Este template tem anexo no título. Escolha o arquivo.");
    const k = head.format.toLowerCase();
    out.push({ type: "header", parameters: [{ type: k, [k]: { link: m.url, ...(k === "document" ? { filename: m.name || "documento.pdf" } : {}) } }] });
  } else if (head && nVars(head.text)) {
    out.push({ type: "header", parameters: [{ type: "text", text: String(v.header?.[0] ?? "") }] });
  }
  const body = tpl.components?.find((c) => c.type === "BODY");
  if (body && nVars(body.text)) out.push({ type: "body", parameters: Array.from({ length: nVars(body.text) }, (_, i) => ({ type: "text", text: String(v.body?.[i] ?? "") || "-" })) });
  (tpl.components?.find((c) => c.type === "BUTTONS")?.buttons || []).forEach((b, i) => {
    if (b.type === "URL" && nVars(b.url)) out.push({ type: "button", sub_type: "url", index: String(i), parameters: [{ type: "text", text: String(v.buttons?.[i] ?? "") }] });
    if (b.type === "COPY_CODE") out.push({ type: "button", sub_type: "copy_code", index: String(i), parameters: [{ type: "coupon_code", coupon_code: String(v.buttons?.[i] ?? "") }] });
  });
  return out;
}
/** Texto que fica no histórico do Helora. */
export function renderText(tpl, v = {}) {
  const fill = (t, list = []) => String(t || "").replace(/\{\{(\d+)\}\}/g, (_, i) => list[Number(i) - 1] ?? "");
  const parts = [];
  for (const c of tpl.components || []) {
    if (c.type === "HEADER" && c.format === "TEXT") parts.push(`*${fill(c.text, v.header)}*`);
    if (c.type === "BODY") parts.push(fill(c.text, v.body));
    if (c.type === "FOOTER") parts.push(`_${c.text}_`);
    if (c.type === "BUTTONS") parts.push(c.buttons.map((b) => `[ ${b.text || "Copiar código"} ]`).join("  "));
  }
  return parts.join("\n\n");
}
export async function fetchTemplate(ch, name, language) {
  const { data } = await axios.get(`${G()}/${ch.waba_id}/message_templates`, { ...auth(ch), params: { name, fields: "id,name,language,components,status" } });
  return (data.data || []).find((t) => t.name === name && (!language || t.language === language)) || null;
}
/** Envia um template para um número (usado no chat, campanhas e automações). */
export async function sendTemplateTo(ch, to, tpl, vars) {
  if (tpl.status !== "APPROVED") throw new Error("Este template ainda não foi aprovado pela Meta.");
  const { data } = await axios.post(`${G()}/${ch.phone_number_id}/messages`, {
    messaging_product: "whatsapp", to: String(to).replace(/\D/g, ""), type: "template",
    template: { name: tpl.name, language: { code: tpl.language }, components: sendComponents(tpl, vars) }
  }, auth(ch));
  return data?.messages?.[0]?.id || null;
}

const router = Router();
router.use(requireAuth);

router.get("/channels/:id/templates", async (req, res) => {
  try {
    const ch = await cloudChannelRow(req.accountId, req.params.id);
    const { data } = await axios.get(`${G()}/${ch.waba_id}/message_templates`, { ...auth(ch), params: { fields: "id,name,status,category,language,components,rejected_reason,quality_score", limit: 250 } });
    res.json(data.data || []);
  } catch (e) { res.status(400).json({ error: errMsg(e) }); }
});

router.post("/channels/:id/templates", requireOwner, async (req, res) => {
  try {
    const ch = await cloudChannelRow(req.accountId, req.params.id);
    const b = req.body || {};
    const slug = String(b.name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!slug) return res.status(400).json({ error: "Dê um nome ao template." });
    const components = await buildComponents(ch, b);
    const { data } = await axios.post(`${G()}/${ch.waba_id}/message_templates`, { name: slug, category: b.category || "UTILITY", language: b.language || "pt_BR", components, allow_category_change: true }, auth(ch));
    res.status(201).json(data);
  } catch (e) { res.status(400).json({ error: errMsg(e) }); }
});

// Editar: a Meta reanalisa o template (nome, idioma e categoria ficam iguais)
router.put("/channels/:id/templates/:tplId", requireOwner, async (req, res) => {
  try {
    const ch = await cloudChannelRow(req.accountId, req.params.id);
    const components = await buildComponents(ch, req.body || {});
    const { data } = await axios.post(`${G()}/${req.params.tplId}`, { components }, auth(ch));
    res.json(data);
  } catch (e) { res.status(400).json({ error: errMsg(e) }); }
});

router.delete("/channels/:id/templates/:name", requireOwner, async (req, res) => {
  try {
    const ch = await cloudChannelRow(req.accountId, req.params.id);
    await axios.delete(`${G()}/${ch.waba_id}/message_templates`, { ...auth(ch), params: { name: req.params.name } });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: errMsg(e) }); }
});

// Mapeamento salvo das variáveis de cada template (ex.: {{1}} = primeiro nome do cliente)
router.get("/templates/maps", async (req, res) => {
  const { data } = await supabase.from("account_integrations").select("config").eq("account_id", req.accountId).eq("provider", "wa_template_maps").maybeSingle();
  res.json(data?.config || {});
});
router.put("/templates/maps/:key", requireOwner, async (req, res) => {
  const { data } = await supabase.from("account_integrations").select("config").eq("account_id", req.accountId).eq("provider", "wa_template_maps").maybeSingle();
  const config = { ...(data?.config || {}), [req.params.key]: req.body || {} };
  await supabase.from("account_integrations").upsert({ account_id: req.accountId, provider: "wa_template_maps", status: "connected", config, updated_at: new Date().toISOString() }, { onConflict: "account_id,provider" });
  res.json(config);
});

/** Canal oficial da conversa e se a janela de 24h está aberta. */
router.get("/conversations/:id/cloud", async (req, res) => {
  const conv = await getConversation(req.accountId, req.params.id).catch(() => null);
  if (!conv || conv.platform !== "whatsapp") return res.json({ channelId: null });
  const channelId = conv.channelId || (await getPrimaryWhatsAppChannel(req.accountId).catch(() => null));
  const { data } = channelId ? await supabase.from("channels").select("provider").eq("id", channelId).maybeSingle() : { data: null };
  if (data?.provider !== "cloud") return res.json({ channelId: null });
  const { data: last } = await supabase.from("messages").select("created_at").eq("conversation_id", conv.id).eq("direction", "in").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const open = !!last && Date.now() - new Date(last.created_at).getTime() < 24 * 3600 * 1000;
  res.json({ channelId, windowOpen: open, lastInbound: last?.created_at || null });
});

router.post("/conversations/:id/template", async (req, res) => {
  try {
    const conv = await getConversation(req.accountId, req.params.id);
    if (!conv || conv.platform !== "whatsapp") return res.status(400).json({ error: "Templates só funcionam no WhatsApp." });
    const channelId = conv.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
    const ch = await cloudChannelRow(req.accountId, channelId);
    const { name, language, vars = {} } = req.body || {};
    const tpl = await fetchTemplate(ch, name, language);
    if (!tpl) return res.status(404).json({ error: "Template não encontrado." });
    const to = String(conv.externalId || "").split("@")[0].split(":")[0];
    const waId = await sendTemplateTo(ch, to, tpl, vars);
    const head = tpl.components?.find((c) => c.type === "HEADER" && MEDIA.includes(c.format));
    const message = await addMessage({
      accountId: req.accountId, conversationId: conv.id, direction: "out", author: "operator",
      text: renderText(tpl, vars), whatsappMessageId: waId, senderName: req.userName || null, status: "sent",
      ...(head && vars.headerMedia?.url ? { mediaUrl: vars.headerMedia.url, mediaType: head.format === "DOCUMENT" ? "document" : head.format.toLowerCase() } : {})
    });
    await updateConversation(req.accountId, conv.id, { mode: "human" }).catch(() => {});
    res.status(201).json(message);
  } catch (e) { res.status(400).json({ error: errMsg(e) }); }
});

export default router;
