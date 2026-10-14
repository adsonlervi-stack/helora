import { Router } from "express";
import { findOrCreateConversation, addMessage, updateConversation, findChannelByPage } from "../config/db.js";
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
