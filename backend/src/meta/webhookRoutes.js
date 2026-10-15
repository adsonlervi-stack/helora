import { Router } from "express";
import {
  findOrCreateConversation,
  addMessage,
  updateConversation,
  findChannelByPage,
  findCloudChannelByPhoneId,
  updateMessageStatusByWaId,
  getMessageByWhatsAppId
} from "../config/db.js";
import { cloudSendText, cloudMarkRead, cloudDownloadMedia } from "./cloudClient.js";
import { uploadMedia } from "../storage.js";
import { handleIncoming } from "../bot/engine.js";
import { sendMetaMessage } from "./metaClient.js";

const router = Router();
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "changeme";

// 1) Verificação do webhook (o Meta chama esse GET uma vez, ao configurar)
// Como TODAS as contas apontam pra essa mesma URL de webhook, o verify
// token é único e compartilhado (definido no .env do backend).
router.get("/webhook/meta", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[Meta] Webhook verificado com sucesso.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2) Recebimento de eventos (mensagens do Messenger e do Instagram)
router.post("/webhook/meta", async (req, res) => {
  const body = req.body;

  // Responde rápido pro Meta não reenviar o evento
  res.sendStatus(200);

  if (!body.object) return;

  // WhatsApp API oficial (Cloud API)
  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        try {
          await handleCloudChange(change.value || {});
        } catch (err) {
          console.error("[WhatsApp Cloud] erro:", err.message);
        }
      }
    }
    return;
  }

  // body.object é 'page' (Messenger) ou 'instagram'
  const platform = body.object === "instagram" ? "instagram" : "messenger";

  for (const entry of body.entry || []) {
    // O ID da página/conta do Instagram identifica de qual CLIENTE (conta)
    // essa mensagem é — é assim que uma única URL de webhook atende todo
    // mundo, sem precisar de um endpoint por cliente.
    const pageId = entry.id;
    const channel = pageId ? await findChannelByPage(platform, pageId) : null;

    if (!channel) {
      console.warn(`[Meta] Nenhuma conta cadastrada para ${platform} page_id=${pageId} — ignorando evento.`);
      continue;
    }

    const { id: channelId, accountId, accessToken } = channel;
    const events = entry.messaging || [];

    for (const event of events) {
      const senderId = event.sender?.id;
      const text = event.message?.text;

      if (!senderId || !text) continue;
      if (event.message?.is_echo) continue; // ignora eco de mensagens enviadas por nós mesmos

      const conversation = await findOrCreateConversation({
        accountId,
        platform,
        externalId: senderId,
        name: senderId,
        channelId
      });

      await addMessage({
        accountId,
        conversationId: conversation.id,
        direction: "in",
        author: "user",
        text
      });

      const reply = await handleIncoming(accountId, conversation, text);

      if (conversation.isNew) {
        await updateConversation(accountId, conversation.id, { isNew: false });
      }

      if (reply) {
        try {
          await sendMetaMessage(accessToken, senderId, reply);
        } catch (err) {
          console.error(
            `[Meta] Falha ao enviar resposta (${platform}, conta ${accountId}):`,
            err.response?.data || err.message
          );
        }
        await addMessage({
          accountId,
          conversationId: conversation.id,
          direction: "out",
          author: "bot",
          text: reply
        });
      }
    }
  }
});

export default router;


const CLOUD_MEDIA = { image: "image", video: "video", audio: "audio", document: "document", sticker: "sticker" };
const STATUS_MAP = { sent: "sent", delivered: "delivered", read: "read", failed: "failed" };

async function handleCloudChange(value) {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;
  const channel = await findCloudChannelByPhoneId(phoneNumberId);
  if (!channel) return console.warn(`[WhatsApp Cloud] Nenhum canal com phone_number_id=${phoneNumberId}.`);
  const { id: channelId, accountId } = channel;

  // Tiques (enviado / entregue / lido)
  for (const st of value.statuses || []) {
    if (STATUS_MAP[st.status]) await updateMessageStatusByWaId(st.id, STATUS_MAP[st.status]).catch(() => {});
  }

  const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
  for (const m of value.messages || []) {
    const phone = m.from;
    const jid = `${phone}@s.whatsapp.net`;
    let text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "";
    let mediaType = null;
    let mediaUrl = null;
    let extra = null;
    if (CLOUD_MEDIA[m.type] && m[m.type]?.id) {
      mediaType = CLOUD_MEDIA[m.type];
      text = m[m.type].caption || text;
      try {
        const { buffer, mimetype } = await cloudDownloadMedia(channel, m[m.type].id);
        const ext = (m[m.type].filename || "").split(".").pop() || (mimetype || "").split("/")[1]?.split(";")[0] || "bin";
        mediaUrl = await uploadMedia({ accountId, buffer, extension: ext, contentType: mimetype });
      } catch (err) {
        console.error("[WhatsApp Cloud] falha ao baixar mídia:", err.message);
      }
    }
    if (m.type === "location") extra = { type: "location", lat: m.location.latitude, lng: m.location.longitude, name: m.location.name, address: m.location.address };
    if (m.type === "contacts") {
      const c = m.contacts?.[0];
      extra = { type: "contact", name: c?.name?.formatted_name || "Contato", phone: c?.phones?.[0]?.wa_id || c?.phones?.[0]?.phone?.replace(/\D/g, "") };
    }
    if (m.type === "reaction") continue;
    if (!text && !mediaUrl && !extra) continue;

    const conversation = await findOrCreateConversation({ accountId, platform: "whatsapp", externalId: jid, name: names[phone] || phone, channelId });
    let quoted = {};
    if (m.context?.id) {
      const original = await getMessageByWhatsAppId(accountId, m.context.id).catch(() => null);
      if (original) quoted = { quotedId: original.id, quotedText: original.text, quotedAuthor: original.direction === "out" ? "Você" : conversation.name };
    }
    await addMessage({ accountId, conversationId: conversation.id, direction: "in", author: "user", text, mediaUrl, mediaType, whatsappMessageId: m.id, extra, ...quoted });
    cloudMarkRead(channel, m.id);

    if (text) {
      const send = async (t) => {
        const id = await cloudSendText(channel, jid, t);
        await addMessage({ accountId, conversationId: conversation.id, direction: "out", author: "bot", text: t, whatsappMessageId: id, status: "sent" });
      };
      try {
        const reply = await handleIncoming(accountId, conversation, text, send);
        if (reply) await send(reply);
      } catch (err) {
        console.error("[WhatsApp Cloud] bot:", err.message);
      }
    }
    if (conversation.isNew) await updateConversation(accountId, conversation.id, { isNew: false }).catch(() => {});
  }
}
