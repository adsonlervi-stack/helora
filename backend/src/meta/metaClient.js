import axios from "axios";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v19.0";

/**
 * Envia uma mensagem de texto via Graph API.
 * Funciona tanto para Messenger quanto para Instagram Direct, pois ambos
 * usam o mesmo formato de "Send API" quando a conta do Instagram está
 * vinculada à Página do Facebook.
 *
 * @param {string} accessToken - Page Access Token da CONTA dona do canal
 *   (cada cliente tem o próprio, vindo da tabela `channels`)
 * @param {string} recipientId - PSID (Messenger) ou IGSID (Instagram) do destinatário
 * @param {string} text
 */
export async function sendMetaMessage(accessToken, recipientId, text) {
  if (!accessToken) {
    console.warn("[Meta] Nenhum access_token disponível — mensagem não enviada.");
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/messages`;

  await axios.post(
    url,
    {
      recipient: { id: recipientId },
      message: { text }
    },
    {
      params: { access_token: accessToken }
    }
  );
}
