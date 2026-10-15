import { sendWhatsAppMessage } from "./whatsapp/baileysClient.js";
import { sendMetaMessage } from "./meta/metaClient.js";
import { getPrimaryWhatsAppChannel, getChannelForAccount, addMessage, updateConversation } from "./config/db.js";

/**
 * Manda um texto de saída pra uma conversa (WhatsApp via Baileys, ou
 * Messenger/Instagram via Meta), grava a mensagem no banco e marca a
 * conversa como "modo humano". Usado tanto pelo envio manual do atendente
 * quanto pelo despachante de mensagens agendadas.
 */
export async function sendTextToConversation(accountId, conversation, text, { senderName, sign = false } = {}) {
  let whatsappMessageId = null;
  // Assinatura do atendente (*Nome:* em negrito no WhatsApp). O texto salvo
  // no painel fica sem ela, porque o balão já mostra quem enviou.
  const outgoing = sign && senderName ? `*${senderName}:*\n${text}` : text;

  if (conversation.platform === "whatsapp") {
    const channelId = conversation.channelId || (await getPrimaryWhatsAppChannel(accountId));
    if (!channelId) throw new Error("Nenhum dispositivo de WhatsApp conectado.");
    whatsappMessageId = await sendWhatsAppMessage(channelId, conversation.externalId, outgoing);
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
    text,
    whatsappMessageId,
    senderName: senderName || null
  });

  await updateConversation(accountId, conversation.id, { mode: "human" });

  return message;
}
