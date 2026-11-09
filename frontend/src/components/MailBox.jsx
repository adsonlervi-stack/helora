import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Inbox, Send, PenSquare, RefreshCw, Reply, Paperclip, Search, ChevronLeft } from "lucide-react";
import { integrations } from "../api.js";
import { notify } from "../dialogs.js";

const errText = (e) => e?.response?.data?.error || e.message;
const when = (d) => {
  if (!d) return "";
  const x = new Date(d);
  return x.toDateString() === new Date().toDateString() ? x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : x.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

/** Caixa de e-mail do usuário dentro do Helora: entrada, enviados, ler, responder e escrever. */
export default function MailBox({ onClose, compose: initial }) {
  const [folder, setFolder] = useState("INBOX");
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [compose, setCompose] = useState(initial || null);
  const load = (qq = q) => { setList(null); integrations.myMessages({ folder, q: qq || undefined }).then(setList).catch((e) => { notify(errText(e), "error"); setList([]); }); };
  useEffect(() => { setOpen(null); load(); }, [folder]);
  const read = async (m) => {
    setOpen({ loading: true, uid: m.uid });
    try { const full = await integrations.myMessage(m.uid, folder); setOpen(full); setList((l) => l?.map((x) => (x.uid === m.uid ? { ...x, seen: true } : x))); }
    catch (e) { notify(errText(e), "error"); setOpen(null); }
  };
  return createPortal(
    <div className="lp-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`mb ${open ? "reading" : ""}`}>
        <aside className="mb-side">
          <button className="mb-new" onClick={() => setCompose({})}><PenSquare size={16} /> Escrever</button>
          <button className={folder === "INBOX" ? "on" : ""} onClick={() => setFolder("INBOX")}><Inbox size={16} /> Entrada</button>
          <button className={folder === "SENT" ? "on" : ""} onClick={() => setFolder("SENT")}><Send size={16} /> Enviados</button>
        </aside>
        <section className="mb-list">
          <div className="mb-top">
            <label className="mb-search"><Search size={14} /><input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} /></label>
            <button className="lp-icon" title="Atualizar" onClick={() => load()}><RefreshCw size={16} /></button>
            <button className="lp-icon mb-close-m" title="Fechar" onClick={onClose}><X size={18} /></button>
          </div>
          {!list && <div className="ap-empty">Carregando e-mails…</div>}
          {list && !list.length && <div className="ap-empty">Nenhum e-mail.</div>}
          {list?.map((m) => (
            <button key={m.uid} className={`mb-item ${m.seen ? "" : "new"} ${open?.uid === m.uid ? "on" : ""}`} onClick={() => read(m)}>
              <span className="mb-who">{m.name || m.address}<small>{when(m.date)}</small></span>
              <span className="mb-sub">{m.subject}</span>
            </button>
          ))}
        </section>
        <section className="mb-read">
          <div className="mb-read-top">
            <button className="lp-icon mb-back" onClick={() => setOpen(null)}><ChevronLeft size={18} /></button>
            <span style={{ flex: 1 }} />
            {open && !open.loading && <button className="lp-btn" onClick={() => setCompose({ to: open.fromAddress, subject: /^re:/i.test(open.subject) ? open.subject : `Re: ${open.subject}`, inReplyTo: open.messageId, quote: open })}><Reply size={15} /> Responder</button>}
            <button className="lp-icon" title="Fechar" onClick={onClose}><X size={18} /></button>
          </div>
          {!open && <div className="ap-empty">Escolha um e-mail para ler.</div>}
          {open?.loading && <div className="ap-empty">Abrindo…</div>}
          {open && !open.loading && (
            <div className="mb-msg">
              <h2>{open.subject}</h2>
              <div className="mb-meta"><strong>{open.from}</strong><small>para {open.to}{open.cc ? `, cc ${open.cc}` : ""} · {open.date ? new Date(open.date).toLocaleString("pt-BR") : ""}</small></div>
              {open.attachments?.length > 0 && <div className="mb-att">{open.attachments.map((a, i) => <span key={i}><Paperclip size={13} /> {a.name}</span>)}</div>}
              {open.html
                ? <iframe className="mb-html" title="E-mail" sandbox="" srcDoc={`<base target="_blank"><style>body{font:14px/1.5 -apple-system,Arial,sans-serif;color:#1d1d1f;margin:0;word-break:break-word}img{max-width:100%}</style>${open.html}`} />
                : <pre className="mb-text">{open.text}</pre>}
            </div>
          )}
        </section>
        {compose && <Compose initial={compose} onClose={() => setCompose(null)} onSent={() => { setCompose(null); if (folder === "SENT") load(); }} />}
      </div>
    </div>,
    document.body
  );
}

function Compose({ initial, onClose, onSent }) {
  const q = initial.quote;
  const [f, setF] = useState({ to: initial.to || "", cc: "", subject: initial.subject || "", text: q ? `\n\n\nEm ${q.date ? new Date(q.date).toLocaleString("pt-BR") : ""}, ${q.from} escreveu:\n> ${String(q.text || "").split("\n").join("\n> ")}` : (initial.text || "") });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries({ ...f, inReplyTo: initial.inReplyTo || "" }).forEach(([k, v]) => fd.append(k, v));
      files.forEach((x) => fd.append("files", x));
      await integrations.sendMyEmail(fd);
      notify("E-mail enviado.", "success");
      onSent();
    } catch (e) { notify(errText(e), "error"); }
    setBusy(false);
  };
  return (
    <div className="cl-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cl-form mb-compose">
        <h3>{initial.inReplyTo ? "Responder" : "Novo e-mail"}</h3>
        <label className="full"><span>Para</span><input value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} placeholder="cliente@email.com" autoFocus={!f.to} /></label>
        <label className="full"><span>Cc</span><input value={f.cc} onChange={(e) => setF({ ...f, cc: e.target.value })} /></label>
        <label className="full"><span>Assunto</span><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
        <label className="full"><span>Mensagem</span><textarea rows={10} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} autoFocus={!!f.to} /></label>
        <label className="full mb-files"><span><Paperclip size={14} /> Anexos {files.length ? `(${files.length})` : ""}</span><input type="file" multiple onChange={(e) => setFiles([...e.target.files])} /></label>
        <div className="cl-form-foot">
          <button className="lp-btn" onClick={onClose}>Cancelar</button>
          <button className="lp-btn primary" disabled={busy || !f.to} onClick={send}><Send size={15} /> {busy ? "Enviando…" : "Enviar"}</button>
        </div>
      </div>
    </div>
  );
}
