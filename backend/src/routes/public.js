/**
 * API aberta da Helora — para sites, landing pages e sistemas.
 * Autenticação: cabeçalho  X-API-Key: hl_...   (gerada em Configurações → API)
 *
 *   GET  /public/v1/credits      → saldo de créditos
 *   POST /public/v1/leads        → cria lead no pipeline (e, opcional, manda WhatsApp)
 *   POST /public/v1/messages     → envia uma mensagem de WhatsApp (1 crédito)
 *   POST /public/v1/campaigns    → cria e inicia uma campanha (1 crédito por mensagem)
 */
import { Router } from "express";
import {
  findApiKey,
  createDeal,
  upsertContacts,
  getCreditBalance,
  addCreditEntry,
  getPrimaryWhatsAppChannel,
  findOrCreateConversation,
  addMessage,
  createCampaign,
  updateCampaign,
  onlyDigits
} from "../config/db.js";
import { resolveWhatsAppNumber, sendWhatsAppMessage, sendWhatsAppMediaUrl } from "../whatsapp/baileysClient.js";

const router = Router();
const STAGES = ["novo_lead", "contato", "negociacao", "proposta", "fechado", "perdido"];

// Limite simples: 120 chamadas por minuto por chave
const hits = new Map();
function rateLimit(keyId) {
  const now = Date.now();
  const arr = (hits.get(keyId) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(keyId, arr);
  return arr.length <= 120;
}

router.use(async (req, res, next) => {
  const key = req.headers["x-api-key"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const found = await findApiKey(key).catch(() => null);
  if (!found) return res.status(401).json({ error: "Chave de API inválida ou revogada." });
  if (!rateLimit(found.keyId)) return res.status(429).json({ error: "Muitas requisições. Tente de novo em 1 minuto." });
  req.accountId = found.accountId;
  next();
});

router.get("/credits", async (req, res) => {
  res.json({ balance: await getCreditBalance(req.accountId) });
});

async function sendOne(accountId, phone, text, { mediaUrl, mediaType, name } = {}) {
  if ((await getCreditBalance(accountId)) <= 0) {
    const e = new Error("Sem créditos. Fale com a Helora para liberar mais.");
    e.status = 402;
    throw e;
  }
  const channelId = await getPrimaryWhatsAppChannel(accountId);
  if (!channelId) throw new Error("Nenhum WhatsApp cadastrado nesta empresa.");
  const jid = await resolveWhatsAppNumber(channelId, phone);
  const id = mediaUrl
    ? await sendWhatsAppMediaUrl(channelId, jid, { url: mediaUrl, mediaType, caption: text })
    : await sendWhatsAppMessage(channelId, jid, text);
  await addCreditEntry(accountId, -1, "api", { reference: phone });
  const conversation = await findOrCreateConversation({ accountId, platform: "whatsapp", externalId: jid, name: name || phone, channelId });
  await addMessage({ accountId, conversationId: conversation.id, direction: "out", author: "bot", text: text || "", mediaUrl: mediaUrl || null, mediaType: mediaUrl ? mediaType || "image" : null, whatsappMessageId: id });
  return { conversationId: conversation.id, messageId: id };
}

router.post("/leads", async (req, res) => {
  const b = req.body || {};
  const phone = onlyDigits(b.phone);
  if (!b.name && !phone && !b.email) return res.status(400).json({ error: "Envie pelo menos name, phone ou email." });
  try {
    const deal = await createDeal({
      accountId: req.accountId,
      title: b.title || b.name || phone || b.email,
      value: b.value ? Number(String(b.value).replace(",", ".")) : null,
      stage: STAGES.includes(b.stage) ? b.stage : "novo_lead",
      contactName: b.name,
      contactPhone: phone || null,
      contactEmail: b.email,
      source: b.source || "api",
      notes: b.notes
    });
    if (phone.length >= 10) await upsertContacts(req.accountId, null, [{ phone, name: b.name }], "importacao").catch(() => {});
    let whatsapp = null;
    if (b.message && phone.length >= 10) whatsapp = await sendOne(req.accountId, phone, String(b.message), { name: b.name }).catch((e) => ({ error: e.message }));
    res.status(201).json({ lead: { id: deal.id, title: deal.title, stage: deal.stage }, whatsapp });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/messages", async (req, res) => {
  const b = req.body || {};
  const phone = onlyDigits(b.phone);
  if (phone.length < 10) return res.status(400).json({ error: "phone inválido (use DDI + DDD + número, ex: 5584999998888)." });
  if (!b.text && !b.mediaUrl) return res.status(400).json({ error: "Envie text e/ou mediaUrl." });
  try {
    res.status(201).json(await sendOne(req.accountId, phone, b.text || "", { mediaUrl: b.mediaUrl, mediaType: b.mediaType, name: b.name }));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post("/campaigns", async (req, res) => {
  const b = req.body || {};
  if (!b.message) return res.status(400).json({ error: "message é obrigatório." });
  if (!Array.isArray(b.recipients) || !b.recipients.length) return res.status(400).json({ error: "recipients deve ser uma lista [{ phone, name }]." });
  if (b.recipients.length > 5000) return res.status(400).json({ error: "Máximo de 5000 destinatários por campanha." });
  try {
    const balance = await getCreditBalance(req.accountId);
    if (balance < b.recipients.length) return res.status(402).json({ error: `Créditos insuficientes: saldo ${balance}, necessário ${b.recipients.length}.` });
    let c = await createCampaign(req.accountId, null, { ...b, name: b.name || "Campanha via API" }, b.recipients);
    if (!b.scheduledAt) c = await updateCampaign(req.accountId, c.id, { status: "running", started_at: new Date().toISOString() });
    res.status(201).json({ campaign: { id: c.id, status: c.status, total: c.total } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
