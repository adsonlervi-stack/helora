import React, { useEffect, useState } from "react";
import { Search, Download, UserPlus, MessageCircle, Pencil, Trash2, X } from "lucide-react";
import { getContacts, createContactApi, updateContactApi, removeContactApi, importContactsApi } from "../api.js";
import Avatar from "./Avatar.jsx";

const fmtPhone = (d) => {
  const s = String(d || "");
  if (s.startsWith("55") && s.length >= 12) {
    const rest = s.slice(4);
    return `+55 (${s.slice(2, 4)}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return s ? `+${s}` : "";
};
const SOURCE = { whatsapp: "Agenda do WhatsApp", conversa: "Veio por conversa", manual: "Cadastrado", importacao: "Importado" };

function ContactEditor({ contact, onClose, onSaved, canDelete }) {
  const [f, setF] = useState({
    name: contact?.name || contact?.pushName || "",
    phone: contact?.phone || "55",
    email: contact?.email || "",
    notes: contact?.notes || ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: k === "phone" ? e.target.value.replace(/\D/g, "") : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      contact ? await updateContactApi(contact.id, f) : await createContactApi(f);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeContactApi(contact.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card lg-sheet" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="sheet-head">
          <h3>{contact ? "Editar contato" : "Novo contato"}</h3>
          <button type="button" className="cv-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <label className="login-field"><span>Nome</span><input value={f.name} onChange={set("name")} autoFocus /></label>
        <label className="login-field"><span>WhatsApp (DDI + DDD + número)</span><input value={f.phone} onChange={set("phone")} inputMode="numeric" /></label>
        <label className="login-field"><span>E-mail</span><input value={f.email} onChange={set("email")} /></label>
        <label className="login-field"><span>Observações</span><textarea rows={3} value={f.notes} onChange={set("notes")} /></label>
        {error && <div className="admin-feedback error">{error}</div>}
        <button className="connect-btn" disabled={busy || f.phone.length < 12}>{busy ? "Salvando…" : "Salvar"}</button>
        {contact && canDelete && (
          <button type="button" className="reply-delete team-remove-btn" style={{ marginTop: 12 }} onClick={remove} disabled={busy}>
            <Trash2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Excluir contato
          </button>
        )}
      </form>
    </div>
  );
}

export default function ContactsPage({ onStartConversation, canDelete }) {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // contato | "new" | null
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => getContacts(search).then(setList).catch((e) => setMsg({ type: "error", text: e.response?.data?.error || e.message }));

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const runImport = async () => {
    setImporting(true);
    setMsg(null);
    try {
      const r = await importContactsApi();
      setMsg({
        type: "success",
        text: `Sincronização feita: ${r.fromWhatsApp} contato(s) recebidos do WhatsApp e ${r.fromConversations} novo(s) a partir das conversas.${
          r.fromWhatsApp === 0 ? " Se a agenda não veio, desconecte e conecte o WhatsApp de novo em Canais — o celular envia a agenda ao vincular." : ""
        }`
      });
      load();
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.error || e.message });
    }
    setImporting(false);
  };

  return (
    <div className="page contacts-page">
      <div className="contacts-toolbar">
        <div className="cv-search" style={{ flex: 1, maxWidth: 420 }}>
          <Search size={15} />
          <input placeholder="Buscar por nome ou número" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="pill-btn" onClick={runImport} disabled={importing}>
          <Download size={15} /> {importing ? "Importando…" : "Importar do WhatsApp"}
        </button>
        <button className="pill-btn primary" onClick={() => setEditing("new")}>
          <UserPlus size={15} /> Novo contato
        </button>
      </div>

      {msg && <div className={`admin-feedback ${msg.type}`} style={{ marginBottom: 14 }}>{msg.text}</div>}

      <div className="lg-card contacts-list">
        <div className="contacts-count">{list.length} contato(s)</div>
        {list.map((c) => (
          <div className="contact-row" key={c.id}>
            <Avatar name={c.name || c.pushName || c.phone} size={40} />
            <div className="contact-info">
              <strong>{c.name || c.pushName || "Sem nome"}</strong>
              <span>
                {fmtPhone(c.phone)}
                {c.pushName && c.name && c.pushName !== c.name ? ` · "${c.pushName}" no WhatsApp` : ""}
              </span>
            </div>
            <span className="contact-source">{SOURCE[c.source] || c.source}</span>
            <button className="pill-btn primary" onClick={() => onStartConversation(c)}>
              <MessageCircle size={15} /> Conversar
            </button>
            <button className="cv-icon-btn" title="Editar" onClick={() => setEditing(c)}>
              <Pencil size={15} />
            </button>
          </div>
        ))}
        {list.length === 0 && (
          <div className="cv-empty">
            Nenhum contato ainda. Clique em <strong>Importar do WhatsApp</strong> ou cadastre um novo.
          </div>
        )}
      </div>

      {editing && (
        <ContactEditor contact={editing === "new" ? null : editing} canDelete={canDelete} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </div>
  );
}
