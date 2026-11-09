import React, { useEffect, useRef, useState } from "react";
import { X, Send, LifeBuoy, Bot, Clock, Search, ChevronLeft, MessageCircle, BookOpen } from "lucide-react";
import { HELP } from "../helpContent.js";
import { useTyping } from "./useTyping.js";
import { getSupportChat, sendSupportMessage } from "../api.js";

const time = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Chat flutuante "Ajuda": a empresa fala direto com o suporte da Helora. */
export default function SupportChat({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [thread, setThread] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("help");
  const listRef = useRef(null);

  const load = () =>
    getSupportChat()
      .then((d) => {
        setMessages(d.messages || []);
        setThread(d.thread || null);
      })
      .catch((e) => setError(e.response?.data?.error || e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const { othersTyping, notify } = useTyping(thread?.id, "user");

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, othersTyping]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await sendSupportMessage(text.trim());
      notify(false);
      setText("");
      load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setSending(false);
  };

  if (mode === "help") return <HelpCenter onClose={onClose} onChat={() => setMode("chat")} />;
  return (
    <div className="support-chat lg-panel">
      <div className="support-head">
        <span className="support-icon"><LifeBuoy size={18} /></span>
        <div>
          <strong>Suporte Helora</strong>
          <small>
            {thread?.status === "open" && thread.acceptedBy
              ? `Em atendimento com ${thread.acceptedBy}`
              : thread?.status === "waiting"
                ? "Aguardando um atendente"
                : "Respondemos por aqui mesmo"}
          </small>
        </div>
        <button className="cv-icon-btn" onClick={() => setMode("help")} aria-label="Dúvidas" title="Dúvidas"><BookOpen size={16} /></button>
        <button className="cv-icon-btn" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
      </div>
      {thread?.status === "waiting" && (
        <div className="support-waiting">
          <Clock size={15} />
          <span>
            Seu chamado está na fila{thread.queuePosition ? ` (posição ${thread.queuePosition})` : ""}. Pode continuar escrevendo,
            avisamos aqui quando alguém entrar.
          </span>
        </div>
      )}
      <div className="support-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="support-empty">Olá! 👋 Conte o que está acontecendo e nossa equipe responde aqui.</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`support-msg ${m.fromAdmin ? "in" : "out"} ${m.isBot ? "bot" : ""}`}>
            {m.fromAdmin && (
              <span className="support-author">
                {m.isBot && <Bot size={12} style={{ verticalAlign: -2, marginRight: 3 }} />}
                {m.authorName || "Suporte"}
              </span>
            )}
            <div style={{ whiteSpace: "pre-wrap" }}>{m.text.replace(/\*([^*]+)\*/g, "$1")}</div>
            <small>{time(m.createdAt)}</small>
          </div>
        ))}
        {othersTyping && (
          <div className="support-msg in typing-bubble"><span className="typing-dots"><i /><i /><i /></span></div>
        )}
      </div>
      {error && <div className="admin-feedback error" style={{ margin: "0 12px 8px" }}>{error}</div>}
      <form className="support-composer" onSubmit={send}>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            notify(!!e.target.value);
          }}
          placeholder="Escreva sua mensagem…"
          autoFocus
        />
        <button className="composer-send" disabled={sending || !text.trim()}><Send size={16} /></button>
      </form>
    </div>
  );
}

const norm = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Central de Dúvidas: trilhas por aba, com busca. */
function HelpCenter({ onClose, onChat }) {
  const [cat, setCat] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [q, setQ] = useState("");
  const found = q.trim() ? HELP.flatMap((c) => c.lessons.filter((l) => norm(l.t + " " + l.steps.join(" ")).includes(norm(q))).map((l) => ({ c, l }))) : null;
  const back = () => (lesson ? setLesson(null) : setCat(null));
  return (
    <div className="support-chat lg-panel help-c">
      <div className="support-head">
        {(cat || lesson) ? <button className="cv-icon-btn" onClick={back} aria-label="Voltar"><ChevronLeft size={16} /></button> : <span className="support-icon"><BookOpen size={18} /></span>}
        <div><strong>{lesson?.t || cat?.title || "Dúvidas"}</strong><small>{lesson ? cat?.title : "Aprenda a usar o Helora"}</small></div>
        <button className="cv-icon-btn" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
      </div>
      <div className="help-body">
        {lesson ? (
          <>
            <ol className="help-steps">{lesson.steps.map((s, i) => <li key={i}><span>{i + 1}</span>{s}</li>)}</ol>
            {lesson.tip && <div className="help-tip">💡 {lesson.tip}</div>}
          </>
        ) : cat ? (
          cat.lessons.map((l, i) => <button key={l.t} className="help-row" onClick={() => setLesson(l)}><span className="help-n">{i + 1}</span>{l.t}</button>)
        ) : (
          <>
            <label className="help-search"><Search size={15} /><input placeholder="Buscar dúvida" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            {found ? (
              found.length ? found.map(({ c, l }) => <button key={c.id + l.t} className="help-row" onClick={() => { setCat(c); setLesson(l); setQ(""); }}><span className="help-n">{c.icon}</span><span>{l.t}<small>{c.title}</small></span></button>)
                : <div className="support-empty">Nada encontrado. Fale com o suporte abaixo.</div>
            ) : (
              <div className="help-grid">{HELP.map((c) => <button key={c.id} onClick={() => setCat(c)}><span>{c.icon}</span><strong>{c.title}</strong><small>{c.lessons.length} aulas</small></button>)}</div>
            )}
          </>
        )}
      </div>
      <button className="help-chat" onClick={onChat}><MessageCircle size={16} /> Falar com o suporte</button>
    </div>
  );
}
