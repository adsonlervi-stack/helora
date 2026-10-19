import {
  getDueScheduledMessages,
  markScheduledMessageSent,
  markScheduledMessageFailed,
  updateScheduledRaw,
  insertScheduledRaw,
  createTask
} from "./config/db.js";
import { sendTextToConversation, sendMediaUrlToConversation } from "./messaging.js";

const CHECK_INTERVAL_MS = 60 * 1000; // checa a cada 1 minuto

/** Próxima data de uma mensagem recorrente (mesmo horário). */
export function nextOccurrence(row, from = new Date(row.send_at)) {
  const d = new Date(from);
  if (row.recurrence === "monthly") {
    const day = Math.min(28, Math.max(1, row.recur_day || d.getUTCDate()));
    d.setUTCMonth(d.getUTCMonth() + 1, day);
    return d;
  }
  if (row.recurrence === "interval") {
    d.setUTCDate(d.getUTCDate() + Math.max(1, row.recur_every_days || 15));
    return d;
  }
  return null;
}

/** Agenda o próximo ciclo de uma recorrente (anexo variável volta a ficar vazio). */
async function scheduleNext(row) {
  const next = nextOccurrence(row);
  if (!next) return;
  const copy = {
    account_id: row.account_id,
    conversation_id: row.conversation_id,
    text: row.text,
    send_at: next.toISOString(),
    created_by: row.created_by,
    created_by_id: row.created_by_id,
    sign: row.sign,
    recurrence: row.recurrence,
    recur_day: row.recur_day,
    recur_every_days: row.recur_every_days,
    needs_attachment: row.needs_attachment
  };
  if (!row.needs_attachment && row.media_url) {
    copy.media_url = row.media_url;
    copy.media_type = row.media_type;
    copy.file_name = row.file_name;
  }
  await insertScheduledRaw(copy);
}

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

    // Recorrente com anexo que muda (ex.: boleto): não envia sem o arquivo do ciclo → vira tarefa
    if (row.needs_attachment && !row.media_url) {
      try {
        await updateScheduledRaw(row.id, { status: "waiting_attachment" });
        await createTask(conversation.account_id, {
          title: `Anexar arquivo: mensagem agendada para ${conversation.name || "cliente"}`,
          description: `A mensagem recorrente "${String(row.text || "").slice(0, 120)}" precisa do arquivo deste ciclo (ex.: boleto) para ser enviada. Anexe na aba Tarefas.`,
          assigneeId: row.created_by_id || null,
          createdById: row.created_by_id || null,
          dueAt: row.send_at,
          kind: "attachment",
          scheduledMessageId: row.id,
          conversationId: conversation.id
        });
      } catch (err) {
        console.error(`[Agendadas] Falha ao criar tarefa de anexo ${row.id}:`, err.message);
      }
      continue;
    }

    const conv = {
      id: conversation.id,
      platform: conversation.platform,
      externalId: conversation.external_id,
      channelId: conversation.channel_id,
      name: conversation.name
    };
    const opts = { senderName: row.created_by || null, sign: !!row.sign };
    try {
      if (row.media_url) {
        await sendMediaUrlToConversation(conversation.account_id, conv, { url: row.media_url, mediaType: row.media_type || "document", caption: row.text }, opts);
      } else {
        await sendTextToConversation(conversation.account_id, conv, row.text, opts);
      }
      await markScheduledMessageSent(row.id);
      if (row.recurrence && row.recurrence !== "none") await scheduleNext(row);
    } catch (err) {
      console.error(`[Agendadas] Falha ao enviar mensagem ${row.id}:`, err.message);
      await markScheduledMessageFailed(row.id, err.message);
      if (row.recurrence && row.recurrence !== "none") await scheduleNext(row).catch(() => {});
    }
  }
}

// Roda em loop enquanto o processo do backend estiver de pé — cada tick
// verifica se alguma mensagem agendada já venceu (send_at <= agora).
export function startScheduledMessagesDispatcher() {
  dispatchDueMessages().catch((err) => console.error("[Agendadas] Erro no dispatch inicial:", err));
  setInterval(() => {
    dispatchDueMessages().catch((err) => console.error("[Agendadas] Erro no dispatch:", err));
  }, CHECK_INTERVAL_MS);
}
