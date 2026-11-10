// Templates do WhatsApp (API oficial): listar, criar, apagar e enviar para uma conversa.
import { Router } from "express";
import axios from "axios";
import { supabase, getConversation, addMessage, updateConversation, getPrimaryWhatsAppChannel } from "../config/db.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";

const G = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;
const errMsg = (e) => e.response?.data?.error?.error_user_msg || e.response?.data?.error?.message || e.message;

async function cloudChannel(accountId, id) {
  const { data } = await supabase.from("channels").select("id, name, provider, waba_id, phone_number_id, access_token").eq("account_id", accountId).eq("id", id).maybeSingle();
  if (!data || data.provider !== "cloud") throw new Error("Este canal não usa a API oficial do WhatsApp.");
  if (!data.waba_id) throw new Error("Informe o WABA ID do canal para usar templates.");
  return data;
}
const auth = (ch) => ({ headers: { Authorization: `Bearer ${ch.access_token}` }, timeout: 20000 });

/** Monta os componentes de envio a partir das variáveis {{1}}, {{2}}... */
function sendComponents(tpl, vars = {}) {
  const out = [];
  for (const c of tpl.components || []) {
    const n = (String(c.text || "").match(/\{\{\d+\}\}/g) || []).length;
    if (!n || !["HEADER", "BODY"].includes(c.type)) continue;
    if (c.type === "HEADER" && c.format && c.format !== "TEXT") continue;
    const list = vars[c.type.toLowerCase()] || [];
    out.push({ type: c.type.toLowerCase(), parameters: Array.from({ length: n }, (_, i) => ({ type: "text", text: String(list[i] ?? "") })) });
  }
  return out;
}
/** Texto que aparece no painel (template com as variáveis preenchidas). */
function renderText(tpl, vars = {}) {
  const fill = (t, list = []) => String(t || "").replace(/\{\{(\d+)\}\}/g, (_, i) => list[Number(i) - 1] ?? "");
  const parts = [];
  for (const c of tpl.components || []) {
    if (c.type === "HEADER" && c.format === "TEXT") parts.push(`*${fill(c.text, vars.header)}*`);
    if (c.type === "BODY") parts.push(fill(c.text, vars.body));
    if (c.type === "FOOTER") parts.push(`_${c.text}_`);
  }
  return parts.join("\n\n");
}

const router = Router();
router.use(requireAuth);

router.get("/channels/:id/templates", async (req, res) => {
  try {
    const ch = await cloudChannel(req.accountId, req.params.id);
    const { data } = await axios.get(`${G()}/${ch.waba_id}/message_templates`, { ...auth(ch), params: { fields: "id,name,status,category,language,components,rejected_reason", limit: 200 } });
    res.json(data.data || []);
  } catch (e) { res.status(400).json({ error: errMsg(e) }); }
});

router.post("/channels/:id/templates", requireOwner, async (req, res) => {
  try {
    const ch = await cloudChannel(req.accountId, req.params.id);
    const { name, category = "UTILITY", language = "pt_BR", header, body, footer, buttons = [], examples = [] } = req.body || {};
    const slug = String(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!slug || !body) return res.status(400).json({ error: "Informe o nome e o texto do template." });
    const components = [];
    if (header) components.push({ type: "HEADER", format: "TEXT", text: header });
    const nVars = (body.match(/\{\{\d+\}\}/g) || []).length;
    components.push({ type: "BODY", text: body, ...(nVars ? { example: { body_text: [Array.from({ length: nVars }, (_, i) => examples[i] || `exemplo ${i + 1}`)] } } : {}) });
    if (footer) components.push({ type: "FOOTER", text: footer });
    const btns = buttons.filter((b) => b?.text).slice(0, 3).map((b) => (b.url ? { type: "URL", text: b.text, url: b.url } : { type: "QUICK_REPLY", text: b.text }));
    if (btns.length) components.push({ type: "BUTTONS", buttons: btns });
    const { data } = await axios.post(`${G()}/${ch.waba_id}/message_templates`, { name: slug, category, language, components }, auth(ch));
    res.status(201).json(data);
  } catch (e) { res.status(400).json({ error: errMsg(e) }); }
});

router.delete("/channels/:id/templates/:name", requireOwner, async (req, res) => {
  try {
    const ch = await cloudChannel(req.accountId, req.params.id);
    await axios.delete(`${G()}/${ch.waba_id}/message_templates`, { ...auth(ch), params: { name: req.params.name } });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: errMsg(e) }); }
});

/** Canal oficial ligado à conversa (para listar templates no chat). */
router.get("/conversations/:id/cloud", async (req, res) => {
  const conv = await getConversation(req.accountId, req.params.id).catch(() => null);
  if (!conv || conv.platform !== "whatsapp") return res.json({ channelId: null });
  const channelId = conv.channelId || (await getPrimaryWhatsAppChannel(req.accountId).catch(() => null));
  const { data } = channelId ? await supabase.from("channels").select("provider").eq("id", channelId).maybeSingle() : { data: null };
  res.json({ channelId: data?.provider === "cloud" ? channelId : null });
});

router.post("/conversations/:id/template", async (req, res) => {
  try {
    const conv = await getConversation(req.accountId, req.params.id);
    if (!conv || conv.platform !== "whatsapp") return res.status(400).json({ error: "Templates só funcionam no WhatsApp." });
    const channelId = conv.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
    const ch = await cloudChannel(req.accountId, channelId);
    const { name, language = "pt_BR", vars = {} } = req.body || {};
    const { data: list } = await axios.get(`${G()}/${ch.waba_id}/message_templates`, { ...auth(ch), params: { name, fields: "name,language,components,status" } });
    const tpl = (list.data || []).find((t) => t.name === name && t.language === language) || (list.data || [])[0];
    if (!tpl) return res.status(404).json({ error: "Template não encontrado." });
    if (tpl.status !== "APPROVED") return res.status(400).json({ error: "Este template ainda não foi aprovado pela Meta." });
    const to = String(conv.externalId || "").split("@")[0].split(":")[0];
    const { data } = await axios.post(`${G()}/${ch.phone_number_id}/messages`, {
      messaging_product: "whatsapp", to, type: "template",
      template: { name: tpl.name, language: { code: tpl.language }, components: sendComponents(tpl, vars) }
    }, auth(ch));
    const message = await addMessage({
      accountId: req.accountId, conversationId: conv.id, direction: "out", author: "operator",
      text: renderText(tpl, vars), whatsappMessageId: data?.messages?.[0]?.id || null, senderName: req.userName || null, status: "sent"
    });
    await updateConversation(req.accountId, conv.id, { mode: "human" }).catch(() => {});
    res.status(201).json(message);
  } catch (e) { res.status(400).json({ error: errMsg(e) }); }
});

export default router;
