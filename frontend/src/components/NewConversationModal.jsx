import React, { useEffect, useRef, useState } from "react";
import { Search, Paperclip, X, FileText } from "lucide-react";
import { getContacts, startConversationApi, sendMediaMessage, getDepartments } from "../api.js";
import Avatar from "./Avatar.jsx";
import { Sheet, Group, Row, Button } from "./ui.jsx";

const fmtPhone = (d) => {
  const s = String(d || "");
  if (s.startsWith("55") && s.length >= 12) {
    const rest = s.slice(4);
    return `+55 (${s.slice(2, 4)}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return s ? `+${s}` : "";
};
/** Nome "de verdade": ignora nomes que são só pontos/símbolos (ex.: "+55•••••04"). */
const realName = (c) => {
  const n = String(c.name || c.pushName || "").trim();
  return n.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 2 ? n : "";
};

/** Iniciar atendimento: escolhe um contato (ou digita o número). Mensagem e anexos são opcionais. */
export default function NewConversationModal({ onClose, onStarted, initialContact }) {
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState([]);
  const [phone, setPhone] = useState(initialContact?.phone || "55");
  const [name, setName] = useState(initialContact ? realName(initialContact) : "");
  const [text, setText] = useState(initialContact?.text || "");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  useEffect(() => { getDepartments().then((l) => { setDepartments(l); if (l.length === 1) setDepartmentId(l[0].id); }).catch(() => {}); }, []);

  useEffect(() => {
    const t = setTimeout(() => getContacts(search).then((l) => setContacts(l.slice(0, 30))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [search]);

  const pick = (c) => {
    setPhone(c.phone);
    setName(realName(c));
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const conv = await startConversationApi({ phone, name, text: text.trim(), departmentId });
      for (const f of files) await sendMediaMessage(conv.id, f).catch((e) => setError(e.response?.data?.error || e.message));
      onStarted(conv);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };
  const label = text.trim() || files.length ? "Iniciar e enviar" : "Abrir conversa";

  return (
    <Sheet
      title="Nova conversa"
      subtitle="Escolha um contato ou digite o número. A mensagem é opcional."
      onClose={onClose}
      width={620}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={busy || phone.length < 12 || (departments.length > 0 && !departmentId)} onClick={submit}>{busy ? "Abrindo…" : label}</Button>
      </>}
    >
      <div className="crm-search" style={{ width: "100%", boxSizing: "border-box", marginTop: 4 }}>
        <Search size={15} />
        <input placeholder="Buscar nos contatos" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      </div>
      <div className="ap-group-box newconv-list2">
        {contacts.map((c) => {
          const n = realName(c);
          return (
            <button key={c.id} type="button" className={`newconv-row ${phone === c.phone ? "active" : ""}`} onClick={() => pick(c)}>
              <Avatar name={n || "?"} size={36} />
              <span>
                <strong>{n || fmtPhone(c.phone)}</strong>
                <small>{n ? fmtPhone(c.phone) : "Sem nome salvo"}</small>
              </span>
            </button>
          );
        })}
        {contacts.length === 0 && <div className="ap-empty" style={{ padding: 16 }}>Nenhum contato encontrado. Digite o número abaixo.</div>}
      </div>

      <Group title="Contato">
        <Row label="WhatsApp"><input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="5584999998888" /></Row>
        <Row label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Opcional" /></Row>
        {departments.length > 0 && (
          <Row label="Setor *">
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Escolha o setor</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Row>
        )}
      </Group>

      <Group title="Primeira mensagem (opcional)" hint="Deixe em branco para só abrir a conversa.">
        <Row label="" stack><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Olá! Aqui é da ..." /></Row>
        {files.map((f, i) => (
          <div key={i} className="ap-row">
            <span className="ap-row-label" style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <FileText size={15} color="#0071e3" /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
            </span>
            <span className="ap-row-control"><button type="button" className="icon-btn" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}><X size={14} /></button></span>
          </div>
        ))}
        <div style={{ padding: "6px 10px" }}>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}><Paperclip size={14} /> Anexar arquivo</Button>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; setFiles((c) => [...c, ...l].slice(0, 10)); }} />
        </div>
      </Group>
      {error && <div className="admin-feedback error" style={{ marginTop: 12 }}>{error}</div>}
    </Sheet>
  );
}
