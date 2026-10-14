import {
  getDueScheduledMessages,
  markScheduledMessageSent,
  markScheduledMessageFailed
} from "./config/db.js";
import { sendTextToConversation } from "./messaging.js";

const CHECK_INTERVAL_MS = 60 * 1000; // checa a cada 1 minuto

async function dispatchDueMessages() {
  let due;
  try {
    due = await getDueScheduledMessages();
  } catch (err) {
    console.error("[Agendadas] Falha ao buscar mensagens vencidas:", err.message);
    return;
  }

  for (const row of due) {
    const conversation = row.conversations;
    if (!conversation) {
      await markScheduledMessageFailed(row.id, "Conversa vinculada não existe mais.");
      continue;
    }

    try {
      await sendTextToConversation(
        conversation.account_id,
        {
          id: conversation.id,
          platform: conversation.platform,
          externalId: conversation.external_id,
          channelId: conversation.channel_id
        },
        row.text
      );
      await markScheduledMessageSent(row.id);
    } catch (err) {
      console.error(`[Agendadas] Falha ao enviar mensagem ${row.id}:`, err.message);
      await markScheduledMessageFailed(row.id, err.message);
    }
  }
}

// Roda em loop enquanto o processo do backend estiver de pé — cada tick
// verifica se alguma mensagem agendada já venceu (send_at <= agora) e, se
// sim, dispara e marca o resultado. Simples e suficiente pro volume de
// uma ferramenta de atendimento (não precisa de um worker separado).
export function startScheduledMessagesDispatcher() {
  dispatchDueMessages().catch((err) => console.error("[Agendadas] Erro no dispatch inicial:", err));
  setInterval(() => {
    dispatchDueMessages().catch((err) => console.error("[Agendadas] Erro no dispatch:", err));
  }, CHECK_INTERVAL_MS);
}
