import React, { useEffect, useState } from "react";
import { Clock3, X } from "lucide-react";
import {
  getScheduledMessages,
  createScheduledMessageApi,
  cancelScheduledMessageApi,
  getConversations,
  getCannedResponses,
  crm
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
  const [canned, setCanned] = useState([]);
  const [many, setMany] = useState([]);
  const [q, setQ] = useState("");
  const [bday, setBday] = useState(null);

  useEffect(() => {
    load();
    getConversations().then(setConversations).catch(console.error);
    Promise.all([getCannedResponses().catch(() => []), crm.pipelines().catch(() => [])]).then(([c, p]) => {
      const fromCrm = (p || []).flatMap((x) => (x.messages || []).map((m) => ({ id: `crm-${m.id}`, title: m.title, text: m.text })));
      setCanned([...(c || []).map((r) => ({ id: r.id, title: `/${r.shortCode || r.short_code || r.title || ""}`, text: r.content })), ...fromCrm]);
    });
  }, []);
  const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";
  const fillName = (t, n) => String(t).replace(/\{nome\}/g, firstName(n)).replace(/\{nome_completo\}/g, n || "");

  // Aniversariantes do mês: busca no CRM um campo de data de nascimento e agenda no dia, às 9h
  const loadBirthdays = async (month) => {
    setBday({ month, loading: true, list: [] });
    try {
      const [pipes, leads] = await Promise.all([crm.pipelines(), crm.leads({ include: "all", light: "1" })]);
      const fieldIds = new Set(pipes.flatMap((p) => (p.fields || []).filter((f) => f.type === "date" && /nasc|anivers/i.test(f.label)).map((f) => f.id)));
      const seen = new Set();
      const list = [];
      for (const l of leads) {
        const k = Object.keys(l.custom || {}).find((id) => fieldIds.has(id) && l.custom[id]);
        if (!k || !l.phone) continue;
        const d = String(l.custom[k]).slice(0, 10);
        if (Number(d.slice(5, 7)) !== month) continue;
        if (seen.has(l.phone)) continue;
        seen.add(l.phone);
        list.push({ id: l.id, name: l.name, phone: l.phone, day: Number(d.slice(8, 10)), on: true });
      }
      list.sort((a, b) => a.day - b.day);
      setBday({ month, list, fieldsFound: fieldIds.size });
    } catch (e) { setBday({ month, list: [], error: e?.response?.data?.error || e.message }); }
  };
  const scheduleBirthdays = async () => {
    if (!text.trim()) return setFeedback({ type: "error", text: "Escreva a mensagem (use {nome} para o primeiro nome)." });
    setSending(true); setFeedback(null);
    const year = new Date().getFullYear();
    let ok = 0, fail = 0;
    for (const p of bday.list.filter((x) => x.on)) {
      try {
        const when = new Date(year, bday.month - 1, p.day, 9, 0, 0);
        if (when < new Date()) { fail++; continue; }
        const r = await crm.openLeadConversation(p.id);
        await createScheduledMessageApi({ conversationId: r.conversationId, text: fillName(text.trim(), p.name), sendAt: when.toISOString() });
        ok++;
      } catch { fail++; }
    }
    setSending(false);
    setFeedback({ type: ok ? "success" : "error", text: `${ok} mensagem(ns) agendada(s)${fail ? `, ${fail} não agendada(s) (data já passou ou sem WhatsApp)` : ""}.` });
    load();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const targets = many.length ? many : conversationId ? [conversationId] : [];
    if (!targets.length || !text.trim()) return;
    setSending(true);
    setFeedback(null);
    try {
      for (const id of targets) {
        const c = conversations.find((x) => x.id === id);
        await createScheduledMessageApi({ conversationId: id, text: fillName(text.trim(), c?.name), sendAt: new Date(sendAt).toISOString() });
      }
      if (targets.length > 1) setFeedback({ type: "success", text: `${targets.length} mensagens agendadas.` });
      setMany([]);
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
          O sistema envia sozinho na data e hora escolhidas.
        </div>

        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
          <label className="login-field">
            <span>Para quem</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversa pelo nome ou número" />
          </label>
          <div className="sch-pick">
            {conversations.filter((c) => !c.isGroup && `${c.name} ${c.phone || ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60).map((c) => (
              <label key={c.id} className={many.includes(c.id) ? "on" : ""}>
                <input type="checkbox" checked={many.includes(c.id)} onChange={(e) => setMany((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))} />
                {c.name || "Sem nome"}
              </label>
            ))}
          </div>
          {many.length > 0 && <small className="sch-n">{many.length} selecionada(s). A mesma mensagem vai para cada uma; {"{nome}"} vira o primeiro nome.</small>}

          {canned.length > 0 && (
            <label className="login-field">
              <span>Mensagem pronta</span>
              <select value="" onChange={(e) => { const m = canned.find((x) => x.id === e.target.value); if (m) setText(m.text); }}>
                <option value="">Escolher uma mensagem pronta…</option>
                {canned.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </label>
          )}

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

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Aniversariantes do mês</div>
        <div className="card-subtitle">Agenda a mensagem de parabéns para cada cliente no dia do aniversário, às 9h. Usa o campo de data de nascimento do CRM e a mensagem escrita acima.</div>
        <div className="sch-bd-bar">
          <select value={bday?.month || ""} onChange={(e) => e.target.value && loadBirthdays(Number(e.target.value))}>
            <option value="">Escolher o mês…</option>
            {["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          {bday?.list?.some((x) => x.on) && <button className="pill-btn primary" disabled={sending} onClick={scheduleBirthdays}>{sending ? "Agendando…" : `Agendar ${bday.list.filter((x) => x.on).length} parabéns`}</button>}
        </div>
        {bday?.loading && <div className="cv-muted">Procurando…</div>}
        {bday?.error && <div className="admin-feedback error">{bday.error}</div>}
        {bday && !bday.loading && bday.fieldsFound === 0 && <div className="cv-muted">Nenhum funil tem campo de data com "nascimento" ou "aniversário" no nome. Crie esse campo nos campos do funil.</div>}
        {bday && !bday.loading && bday.fieldsFound > 0 && !bday.list.length && <div className="cv-muted">Nenhum aniversariante neste mês.</div>}
        <div className="sch-pick">
          {(bday?.list || []).map((p, i) => (
            <label key={p.id} className={p.on ? "on" : ""}>
              <input type="checkbox" checked={p.on} onChange={(e) => setBday((b) => ({ ...b, list: b.list.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) }))} />
              <b>{String(p.day).padStart(2, "0")}</b> {p.name}
            </label>
          ))}
        </div>
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
