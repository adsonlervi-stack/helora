import React, { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { getContacts, startConversationApi } from "../api.js";
import Avatar from "./Avatar.jsx";

const fmtPhone = (d) => {
  const s = String(d || "");
  if (s.startsWith("55") && s.length >= 12) {
    const rest = s.slice(4);
    return `+55 (${s.slice(2, 4)}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return s ? `+${s}` : "";
};

/** Iniciar atendimento: escolhe um contato (ou digita o número) e manda a 1ª mensagem. */
export default function NewConversationModal({ onClose, onStarted, initialContact }) {
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState([]);
  const [phone, setPhone] = useState(initialContact?.phone || "55");
  const [name, setName] = useState(initialContact?.name || initialContact?.pushName || "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => getContacts(search).then((l) => setContacts(l.slice(0, 30))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [search]);

  const pick = (c) => {
    setPhone(c.phone);
    setName(c.name || c.pushName || "");
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const conv = await startConversationApi({ phone, name, text });
      onStarted(conv);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card lg-sheet newconv" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>Nova conversa</h3>
          <button className="cv-icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="cv-search">
          <Search size={15} />
          <input placeholder="Buscar nos contatos" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="newconv-list">
          {contacts.map((c) => (
            <button key={c.id} type="button" className={`newconv-item ${phone === c.phone ? "active" : ""}`} onClick={() => pick(c)}>
              <Avatar name={c.name || c.pushName || c.phone} size={34} />
              <span>
                <strong>{c.name || c.pushName || "Sem nome"}</strong>
                <small>{fmtPhone(c.phone)}</small>
              </span>
            </button>
          ))}
          {contacts.length === 0 && <div className="cv-muted" style={{ padding: 10 }}>Nenhum contato encontrado. Digite o número abaixo.</div>}
        </div>

        <form onSubmit={submit} className="newconv-form">
          <div className="newconv-grid">
            <label className="login-field">
              <span>WhatsApp (DDI + DDD + número)</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="5584999998888" />
            </label>
            <label className="login-field">
              <span>Nome (opcional)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
          <label className="login-field">
            <span>Primeira mensagem</span>
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Olá! Aqui é da ..." />
          </label>
          {error && <div className="admin-feedback error">{error}</div>}
          <button className="connect-btn" disabled={busy || phone.length < 12 || !text.trim()}>
            {busy ? "Enviando…" : "Iniciar conversa"}
          </button>
        </form>
      </div>
    </div>
  );
}
