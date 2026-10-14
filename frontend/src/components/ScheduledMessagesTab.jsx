import React, { useEffect, useState } from "react";
import { Clock3, X } from "lucide-react";
import {
  getScheduledMessages,
  createScheduledMessageApi,
  cancelScheduledMessageApi,
  getConversations
} from "../api.js";

const STATUS_LABELS = {
  pending: "Agendada",
  sent: "Enviada",
  failed: "Falhou",
  canceled: "Cancelada"
};

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Data/hora mínima pro input datetime-local: agora + 2 minutos, formatada
// no formato que o input espera (sem timezone, "YYYY-MM-DDTHH:mm").
function minDateTimeLocal() {
  const d = new Date(Date.now() + 2 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ScheduledMessagesTab() {
  const [items, setItems] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState("");
  const [text, setText] = useState("");
  const [sendAt, setSendAt] = useState(minDateTimeLocal());
  const [feedback, setFeedback] = useState(null);
  const [sending, setSending] = useState(false);

  const load = () => getScheduledMessages().then(setItems).catch(console.error);

  useEffect(() => {
    load();
    getConversations().then(setConversations).catch(console.error);
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!conversationId || !text.trim()) return;
    setSending(true);
    setFeedback(null);
    try {
      await createScheduledMessageApi({
        conversationId,
        text: text.trim(),
        sendAt: new Date(sendAt).toISOString()
      });
      setText("");
      setSendAt(minDateTimeLocal());
      load();
    } catch (err) {
      setFeedback({ type: "error", text: err.response?.data?.error || err.message });
    }
    setSending(false);
  };

  const handleCancel = async (id) => {
    await cancelScheduledMessageApi(id);
    load();
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Agendar mensagem</div>
        <div className="card-subtitle">
          Escolha uma conversa, escreva o texto e a data/hora — o sistema envia sozinho quando
          chegar a hora (verifica a cada minuto).
        </div>

        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
          <label className="login-field">
            <span>Conversa</span>
            <select value={conversationId} onChange={(e) => setConversationId(e.target.value)}>
              <option value="">Selecione uma conversa...</option>
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "Sem nome"} — {c.platform}
                </option>
              ))}
            </select>
          </label>

          <label className="login-field">
            <span>Mensagem</span>
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva a mensagem..." />
          </label>

          <label className="login-field">
            <span>Enviar em</span>
            <input
              type="datetime-local"
              value={sendAt}
              min={minDateTimeLocal()}
              onChange={(e) => setSendAt(e.target.value)}
            />
          </label>

          {feedback && <div className={`admin-feedback ${feedback.type}`}>{feedback.text}</div>}

          <button
            type="submit"
            className="connect-btn"
            style={{ width: "auto", padding: "10px 20px", alignSelf: "flex-start" }}
            disabled={sending}
          >
            {sending ? "Agendando..." : "Agendar"}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Agendadas ({items.length})</div>
        <div>
          {items.map((m) => (
            <div className="reply-item" key={m.id} style={{ alignItems: "flex-start" }}>
              <Clock3 size={16} style={{ marginTop: 3, color: "var(--accent)", flexShrink: 0 }} />
              <span className="reply-response" style={{ display: "block" }}>
                <strong>{m.conversationName || "Conversa removida"}</strong>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>{m.text}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                  {formatDateTime(m.sendAt)} ·{" "}
                  <span className={`sched-status ${m.status}`}>{STATUS_LABELS[m.status]}</span>
                  {m.status === "failed" && m.error ? ` · ${m.error}` : ""}
                </div>
              </span>
              {m.status === "pending" && (
                <button className="icon-btn" title="Cancelar" onClick={() => handleCancel(m.id)}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
              Nenhuma mensagem agendada ainda.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
