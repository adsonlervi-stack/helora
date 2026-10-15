import { sendWhatsAppMessage, sendWhatsAppPayload } from "./whatsapp/baileysClient.js";
import { sendMetaMessage } from "./meta/metaClient.js";
import { getPrimaryWhatsAppChannel, getChannelForAccount, addMessage, updateConversation, getMessage } from "./config/db.js";

/** Texto de saída com a assinatura do atendente: "*Nome:*" em negrito numa linha antes. */
export function signText(text, senderName, sign) {
  return sign && senderName ? `*${senderName}:*\n${text}` : text;
}

async function quotedFor(accountId, conversation, quotedId) {
  if (!quotedId) return null;
  const q = await getMessage(accountId, quotedId).catch(() => null);
  if (!q || q.conversationId !== conversation.id) return null;
  return q;
}

/** Monta o objeto "quoted" que o Baileys usa para responder em cima de uma mensagem. */
export function baileysQuoted(conversation, q) {
  if (!q?.whatsappMessageId) return null;
  return {
    key: { remoteJid: conversation.externalId, id: q.whatsappMessageId, fromMe: q.direction === "out" },
    message: { conversation: q.text || "" }
  };
}

async function whatsappChannel(accountId, conversation) {
  const channelId = conversation.channelId || (await getPrimaryWhatsAppChannel(accountId));
  if (!channelId) throw new Error("Nenhum dispositivo de WhatsApp conectado.");
  return channelId;
}

/**
 * Manda um texto de saída pra uma conversa (WhatsApp via Baileys, ou
 * Messenger/Instagram via Meta), grava a mensagem no banco e marca a
 * conversa como "modo humano".
 */
export async function sendTextToConversation(
  accountId,
  conversation,
  text,
  { senderName, sign = false, quotedId = null, forwarded = false } = {}
) {
  let whatsappMessageId = null;
  const outgoing = signText(text, senderName, sign);
  const q = await quotedFor(accountId, conversation, quotedId);

  if (conversation.platform === "whatsapp") {
    const channelId = await whatsappChannel(accountId, conversation);
    whatsappMessageId = await sendWhatsAppMessage(channelId, conversation.externalId, outgoing, {
      quoted: baileysQuoted(conversation, q),
      forwarded
    });
  } else {
    const channel = await getChannelForAccount(accountId, conversation.platform);
    if (!channel) throw new Error(`Nenhum canal de ${conversation.platform} cadastrado para esta conta.`);
    await sendMetaMessage(channel.accessToken, conversation.externalId, outgoing);
  }

  const message = await addMessage({
    accountId,
    conversationId: conversation.id,
    direction: "out",
    author: "operator",
    text: outgoing, // o painel mostra igual ao que o cliente recebeu (com a assinatura em negrito)
    whatsappMessageId,
    senderName: senderName || null,
    status: "sent",
    quotedId: q?.id,
    quotedText: q ? q.text || (q.mediaType ? "📎 Anexo" : "") : null,
    quotedAuthor: q ? (q.direction === "out" ? "Você" : conversation.name) : null,
    forwarded
  });

  await updateConversation(accountId, conversation.id, { mode: "human" });
  return message;
}

/** Contato (vCard) ou localização. */
export async function sendSpecialToConversation(accountId, conversation, extra, { senderName } = {}) {
  if (conversation.platform !== "whatsapp") throw new Error("Contato e localização só funcionam no WhatsApp.");
  const channelId = await whatsappChannel(accountId, conversation);
  let payload;
  if (extra.type === "contact") {
    const phone = String(extra.phone || "").replace(/\D/g, "");
    if (!extra.name || phone.length < 10) throw new Error("Informe nome e telefone do contato.");
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${extra.name}\nTEL;type=CELL;waid=${phone}:+${phone}\nEND:VCARD`;
    payload = { contacts: { displayName: extra.name, contacts: [{ vcard }] } };
    extra = { type: "contact", name: extra.name, phone };
  } else if (extra.type === "location") {
    const lat = Number(extra.lat), lng = Number(extra.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Localização inválida.");
    payload = { location: { degreesLatitude: lat, degreesLongitude: lng, name: extra.name || undefined, address: extra.address || undefined } };
    extra = { type: "location", lat, lng, name: extra.name || null, address: extra.address || null };
  } else throw new Error("Tipo inválido.");
  const whatsappMessageId = await sendWhatsAppPayload(channelId, conversation.externalId, payload);
  const message = await addMessage({
    accountId,
    conversationId: conversation.id,
    direction: "out",
    author: "operator",
    text: "",
    whatsappMessageId,
    senderName: senderName || null,
    status: "sent",
    extra
  });
  await updateConversation(accountId, conversation.id, { mode: "human" });
  return message;
}
