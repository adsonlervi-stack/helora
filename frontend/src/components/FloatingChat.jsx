import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, X, ChevronLeft, Send, ExternalLink, Search } from "lucide-react";
import Avatar from "./Avatar.jsx";
import { getConversationMessages, sendMessage } from "../api.js";

const time = (iso) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
const clean = (t) => String(t || "").replace(/^\*([^*\n]{1,60}):\*\s*/, "").replace(/\*([^*\n]+)\*/g, "$1");

/** Chat no canto da tela: responde conversas sem sair da tela atual (CRM, tarefas…). */
export default function FloatingChat({ conversations = [], onOpenFull, openId }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const unread = conversations.reduce((t, c) => t + (c.unread || 0), 0);
  const conv = conversations.find((c) => c.id === sel);
  useEffect(() => { if (openId) { setOpen(true); setSel(String(openId).split("|")[0]); } }, [openId]);
  const load = () => sel && getConversationMessages(sel, { limit: 40 }).then((d) => setMsgs(d.messages || [])).catch(() => {});
  useEffect(() => { setMsgs([]); load(); if (!sel) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [sel]);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length, sel]);
  const send = async () => {
    const t = text.trim(); if (!t || !sel) return;
    setBusy(true);
    try { await sendMessage(sel, t, true); setText(""); await load(); } catch (e) { alert(e?.response?.data?.error || e.message); }
    setBusy(false);
  };
  const list = [...conversations].filter((c) => !c.isGroup || q).filter((c) => `${c.name} ${c.phone || ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.unread || 0) - (a.unread || 0) || new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)).slice(0, 30);
  return (
    <>
      {open && (
        <div className="fchat">
          <div className="fchat-h">
            {sel ? <button className="fchat-i" onClick={() => setSel(null)}><ChevronLeft size={18} /></button> : null}
            {sel && conv ? <><Avatar name={conv.name} url={conv.avatarUrl} size={30} /><span className="fchat-n"><strong>{conv.name}</strong><small>{conv.phone ? `+${conv.phone}` : conv.channelName || ""}</small></span></>
              : sel ? <span className="fchat-n"><strong>Conversa</strong><small>Carregando…</small></span> : <span className="fchat-n"><strong>Conversas</strong><small>{unread ? `${unread} não lida(s)` : "Tudo em dia"}</small></span>}
            {sel && <button className="fchat-i" title="Abrir na aba Conversas" onClick={() => { onOpenFull?.(sel); setOpen(false); }}><ExternalLink size={16} /></button>}
            <button className="fchat-i" onClick={() => setOpen(false)}><X size={18} /></button>
          </div>
          {!sel ? (
            <>
              <div className="fchat-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversa" /></div>
              <div className="fchat-list">
                {list.map((c) => (
                  <button key={c.id} className="fchat-row" onClick={() => setSel(c.id)}>
                    <Avatar name={c.name} url={c.avatarUrl} size={36} />
                    <span className="fchat-n"><strong>{c.name}</strong><small>{clean(c.lastMessagePreview) || "…"}</small></span>
                    <span className="fchat-meta">{time(c.lastMessageAt)}{c.unread > 0 && <b>{c.unread}</b>}</span>
                  </button>
                ))}
                {!list.length && <div className="fchat-empty">Nenhuma conversa.</div>}
              </div>
            </>
          ) : (
            <>
              <div className="fchat-msgs" ref={listRef}>
                {msgs.map((m) => (m.author === "system" ? null : (
                  <div key={m.id} className={`fchat-m ${m.direction === "out" ? "out" : "in"}`}>
                    {m.mediaType && !m.text ? <em>📎 {m.mediaType === "audio" ? "Áudio" : m.mediaType === "image" ? "Imagem" : "Arquivo"}</em> : clean(m.text)}
                    <span>{time(m.timestamp)}</span>
                  </div>
                )))}
              </div>
              <div className="fchat-in">
                <textarea rows={1} value={text} spellCheck lang="pt-BR" placeholder="Mensagem" onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <button disabled={busy || !text.trim()} onClick={send}><Send size={16} /></button>
              </div>
            </>
          )}
        </div>
      )}
      <button className="fchat-fab" onClick={() => setOpen((v) => !v)} title="Conversas">
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
      </button>
    </>
  );
}
