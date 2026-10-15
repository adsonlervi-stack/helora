import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, PanelRight, Paperclip, Mic, Square, Hand, Undo2, Send, PenLine, ArrowRightLeft, MailOpen, CheckCircle2,
  RotateCcw, Users, Check, CheckCheck, Clock, AlertCircle, Forward, Reply, Copy, Trash2, Ban, UserRound, MapPin, X,
  LocateFixed, FileText, WifiOff, CalendarClock, Sticker, Upload, Smile, Trash
} from "lucide-react";
import Avatar from "./Avatar.jsx";
import ClientPanel from "./ClientPanel.jsx";
import TransferModal from "./TransferModal.jsx";
import {
  getCannedResponses, getDepartments, getTeam, getConversationChannelStatus, sendTypingApi, getPresenceApi,
  getStickersApi, sendStickerApi, createScheduledMessageApi, getScheduledMessages, cancelScheduledMessageApi, getContactsPage
} from "../api.js";

// Cor fixa por pessoa no grupo (igual WhatsApp)
const GROUP_COLORS = ["#e5484d", "#0090ff", "#30a46c", "#f76b15", "#8e4ec6", "#d6409f", "#12a594", "#ad7f58", "#3e63dd", "#e54666"];
function colorFor(key = "") {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}
function fmtPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) return `+55 ${d.slice(2, 4)} ${d.slice(4, d.length - 4)}-${d.slice(-4)}`;
  return d ? `+${d}` : "";
}

const PLATFORM_LABELS = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram"
};

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Formatação do WhatsApp: *negrito*, _itálico_, ~riscado~ e quebras de linha. */
export function WaText({ text }) {
  const parts = String(text || "").split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return parts.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>;
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

function Ticks({ status }) {
  if (status === "pending") return <Clock size={12} className="tick pending" />;
  if (status === "failed") return <AlertCircle size={13} className="tick failed" />;
  if (status === "read") return <CheckCheck size={14} className="tick read" />;
  if (status === "delivered") return <CheckCheck size={14} className="tick" />;
  return <Check size={14} className="tick" />;
}

function fmtSize(b) {
  if (!b) return "";
  return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

function PendingMedia({ message, onDownload }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const p = message.extra.pendingMedia;
  const label = { image: "Foto", video: "Vídeo", document: p.fileName || "Documento" }[message.mediaType];
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onDownload(message.id);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    }
    setBusy(false);
  };
  return (
    <div className={`pending-media ${message.mediaType}`}>
      {p.thumb && <img src={p.thumb} alt="" className="pending-thumb" />}
      <button type="button" className="pending-btn" onClick={go} disabled={busy}>
        {busy ? "Baixando…" : <>⬇ Baixar {label}{p.size ? ` · ${fmtSize(p.size)}` : ""}</>}
      </button>
      {err && <small className="pending-err">{err}</small>}
    </div>
  );
}

function MessageBubble({ message, onAction, menuOpen, onToggleMenu, onRetry, onStartChat, isGroup, onDownload }) {
  const deleted = !!message.deletedAt;
  // Grupo: quem mandou (novo formato em extra.sender; antigo vinha "*Nome:* texto")
  let groupSender = null;
  let bodyText = message.text;
  if (isGroup && message.direction === "in") {
    if (message.extra?.sender) groupSender = message.extra.sender;
    else {
      const m = /^\*([^*\n]{1,60}):\*\s?/.exec(message.text || "");
      if (m) {
        groupSender = { name: m[1] };
        bodyText = message.text.slice(m[0].length);
      }
    }
  }
  const isSticker = message.mediaType === "sticker";
  const authorLabel =
    message.author === "bot" ? "Bot" : message.author === "operator" ? message.senderName || "Atendente" : null;
  const extra = message.extra;
  const pending = String(message.id).startsWith("tmp-");

  return (
    <div id={`msg-${message.id}`} className={`bubble-row ${message.direction}`}>
      <div
        className={`bubble ${message.direction} ${deleted ? "deleted" : ""} ${menuOpen ? "menu-open" : ""} ${isSticker && !deleted ? "sticker" : ""}`}
        onClick={(e) => {
          if (pending || deleted || e.target.closest("a,button,audio,video")) return;
          onToggleMenu(message.id);
        }}
        onContextMenu={(e) => {
          if (pending || deleted) return;
          e.preventDefault();
          onToggleMenu(message.id);
        }}
      >
        {groupSender && (
          <div className="bubble-sender" style={{ color: colorFor(groupSender.id || groupSender.phone || groupSender.name) }}>
            <span className="bubble-sender-name">{groupSender.name || fmtPhone(groupSender.phone) || "Participante"}</span>
            {groupSender.name && groupSender.phone && <span className="bubble-sender-phone">{fmtPhone(groupSender.phone)}</span>}
          </div>
        )}
        {message.forwarded && !deleted && <div className="bubble-forwarded"><Forward size={11} /> Encaminhada</div>}

        {message.quotedText && !deleted && (
          <button
            type="button"
            className="bubble-quote"
            onClick={() => message.quotedId && document.getElementById(`msg-${message.quotedId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            <strong>{message.quotedAuthor || "Mensagem"}</strong>
            <span><WaText text={message.quotedText} /></span>
          </button>
        )}

        {deleted ? (
          <div className="bubble-deleted"><Ban size={13} /> Mensagem apagada</div>
        ) : (
          <>
            {message.mediaUrl && message.mediaType === "image" && (
              <a href={message.mediaUrl} target="_blank" rel="noreferrer"><img src={message.mediaUrl} alt="Anexo" className="bubble-media-image" loading="lazy" /></a>
            )}
            {!message.mediaUrl && message.extra?.pendingMedia && <PendingMedia message={message} onDownload={onDownload} />}
            {message.mediaUrl && isSticker && <img src={message.mediaUrl} alt="Figurinha" className="bubble-sticker" loading="lazy" />}
            {message.mediaUrl && message.mediaType === "video" && <video src={message.mediaUrl} controls className="bubble-media-video" />}
            {message.mediaUrl && message.mediaType === "audio" && <audio src={message.mediaUrl} controls className="bubble-media-audio" />}
            {message.mediaUrl && message.mediaType === "document" && (
              <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="bubble-media-doc">📄 Abrir documento</a>
            )}
            {!message.mediaUrl && message.mediaType && pending && <div className="bubble-media-doc">📎 Enviando anexo…</div>}

            {extra?.type === "contact" && (
              <div className="bubble-contact">
                <div className="bubble-contact-head"><UserRound size={18} /> <strong>{extra.name}</strong></div>
                {extra.phone && <div className="bubble-contact-phone">+{extra.phone}</div>}
                {extra.phone && message.direction === "in" && (
                  <button type="button" className="bubble-contact-btn" onClick={() => onStartChat?.({ phone: extra.phone, name: extra.name })}>
                    Iniciar conversa
                  </button>
                )}
              </div>
            )}
            {extra?.type === "location" && (
              <a
                className="bubble-location"
                href={`https://www.google.com/maps?q=${extra.lat},${extra.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                <div className="bubble-location-map"><MapPin size={26} /></div>
                <strong>{extra.name || "Localização"}</strong>
                {extra.address && <span>{extra.address}</span>}
                <span className="bubble-location-link">Abrir no Google Maps</span>
              </a>
            )}

            {bodyText && <div className="bubble-text"><WaText text={bodyText} /></div>}
          </>
        )}

        <span className="bubble-meta">
          {authorLabel ? `${authorLabel} · ` : ""}
          {formatTime(message.timestamp)}
          {message.direction === "out" && !deleted && <Ticks status={message.status} />}
        </span>
        {message.status === "failed" && (
          <button type="button" className="bubble-retry" onClick={() => onRetry?.(message)} title={message.error || ""}>
            Não enviou{message.error ? `: ${message.error}` : ""} · Tentar de novo
          </button>
        )}

        {message.reactions && message.reactions.length > 0 && (
          <div className="bubble-reactions">
            {message.reactions.map((r, i) => (
              <span key={i} className="bubble-reaction-chip">{r.emoji}</span>
            ))}
          </div>
        )}

        {menuOpen && (
          <div className="msg-menu" onClick={(e) => e.stopPropagation()}>
            <div className="msg-menu-emojis">
              {QUICK_EMOJIS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => onAction("react", message, emoji)}>{emoji}</button>
              ))}
            </div>
            <button type="button" onClick={() => onAction("reply", message)}><Reply size={15} /> Responder</button>
            <button type="button" onClick={() => onAction("forward", message)}><Forward size={15} /> Encaminhar</button>
            {message.text && <button type="button" onClick={() => onAction("copy", message)}><Copy size={15} /> Copiar</button>}
            {message.direction === "out" && (
              <button type="button" className="danger" onClick={() => onAction("delete", message)}><Trash2 size={15} /> Apagar para todos</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Reduz a imagem no navegador antes de subir (máx. 1600px, JPEG). */
async function compressImage(file) {
  if (!file.type.startsWith("image/") || /gif|svg/.test(file.type) || file.size < 300 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function ForwardModal({ message, conversations, onClose, onSend }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const list = conversations
    .filter((c) => !c.isGroup || true)
    .filter((c) => `${c.name || ""} ${c.externalId || ""}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 60);
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const go = async () => {
    setBusy(true);
    try {
      const results = await onSend(message.id, [...picked]);
      const fails = results.filter((r) => !r.ok);
      if (!fails.length) return onClose();
      setResult(`${results.length - fails.length} enviada(s), ${fails.length} com erro: ${fails[0].error}`);
    } catch (err) {
      setResult(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal lg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>Encaminhar mensagem</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <div className="forward-preview">{message.text ? <WaText text={message.text} /> : message.mediaType ? "📎 Anexo" : message.extra?.type === "contact" ? "👤 Contato" : "📍 Localização"}</div>
        <input className="response" placeholder="Buscar conversa" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="forward-list">
          {list.map((c) => (
            <label key={c.id} className={`forward-item ${picked.has(c.id) ? "on" : ""}`}>
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
              <Avatar name={c.name} url={c.avatarUrl} size={30} />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
        {result && <div className="admin-feedback error">{result}</div>}
        <button className="connect-btn" disabled={!picked.size || busy} onClick={go}>
          {busy ? "Enviando…" : `Encaminhar${picked.size ? ` para ${picked.size}` : ""}`}
        </button>
      </div>
    </div>
  );
}

function ScheduleModal({ conversation, initialText, onClose }) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const [text, setText] = useState(initialText || "");
  const [when, setWhen] = useState(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  const [list, setList] = useState([]);
  const [err, setErr] = useState(null);
  const load = () =>
    getScheduledMessages()
      .then((all) => setList(all.filter((m) => m.conversationId === conversation.id && m.status === "pending")))
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);
  const save = async (e) => {
    e.preventDefault();
    try {
      await createScheduledMessageApi({ conversationId: conversation.id, text: text.trim(), sendAt: new Date(when).toISOString() });
      setText("");
      setErr(null);
      load();
    } catch (e2) {
      setErr(e2.response?.data?.error || e2.message);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal lg-modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-header"><h3>Agendar mensagem</h3><button type="button" className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <p className="cv-muted" style={{ margin: 0 }}>Para {conversation.name}. Enviada automaticamente no dia e hora escolhidos.</p>
        <label className="login-field"><span>Mensagem</span><textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus /></label>
        <label className="login-field"><span>Enviar em</span><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
        {err && <div className="admin-feedback error">{err}</div>}
        <button className="connect-btn" disabled={!text.trim()}>Agendar</button>
        {list.length > 0 && (
          <div className="sched-list">
            <div className="fe-field-label">Agendadas nesta conversa</div>
            {list.map((m) => (
              <div key={m.id} className="sched-item">
                <span><strong>{new Date(m.sendAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</strong> · {m.text}</span>
                <button type="button" className="icon-btn" title="Cancelar" onClick={async () => { await cancelScheduledMessageApi(m.id); load(); }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}

function StickerPicker({ onPick, onUpload, onClose }) {
  const [items, setItems] = useState(null);
  const fileRef = useRef(null);
  useEffect(() => {
    getStickersApi().then(setItems).catch(() => setItems([]));
  }, []);
  return (
    <div className="sticker-picker" onMouseLeave={onClose}>
      <div className="sticker-head">
        <strong>Figurinhas</strong>
        <button type="button" className="pill-btn" onClick={() => fileRef.current?.click()}><Upload size={13} /> Criar de uma imagem</button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(f); }} />
      </div>
      <div className="sticker-grid">
        {items === null && <span className="cv-muted">Carregando…</span>}
        {items?.length === 0 && <span className="cv-muted">As figurinhas que chegarem no WhatsApp da empresa aparecem aqui para você reutilizar.</span>}
        {items?.map((u) => (
          <button type="button" key={u} onClick={() => onPick(u)}><img src={u} alt="" loading="lazy" /></button>
        ))}
      </div>
    </div>
  );
}

function SpecialModal({ kind, onClose, onSend }) {
  const [f, setF] = useState({ name: "", phone: "", lat: "", lng: "", address: "", link: "" });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  const useMine = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setF((v) => ({ ...v, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })),
      () => setErr("Não consegui pegar sua localização. Libere a permissão do navegador ou cole um link do Google Maps.")
    );
  const fromLink = (e) => {
    const link = e.target.value;
    const m = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(link) || /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(link) || /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/.exec(link);
    setF((v) => ({ ...v, link, ...(m ? { lat: m[1], lng: m[2] } : {}) }));
  };
  // Enviar contato: só da agenda (Contatos)
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    if (kind !== "contact") return;
    const t = setTimeout(() => getContactsPage(q, 1).then((r) => setFound((r.items || []).slice(0, 30))).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q, kind]);
  const submit = (e) => {
    e.preventDefault();
    if (kind === "contact") {
      if (!picked) return setErr("Escolha um contato da sua agenda.");
      const phone = String(picked.phone || "").replace(/\D/g, "");
      onSend({ type: "contact", name: picked.name || picked.pushName || phone, phone: phone.length <= 11 ? "55" + phone : phone });
    } else {
      if (!f.lat || !f.lng) return setErr("Use sua localização ou cole um link do Google Maps.");
      onSend({ type: "location", lat: Number(f.lat), lng: Number(f.lng), name: f.name || undefined, address: f.address || undefined });
    }
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal lg-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header"><h3>{kind === "contact" ? "Enviar contato" : "Enviar localização"}</h3><button type="button" className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        {kind === "contact" ? (
          <>
            <label className="login-field"><span>Buscar na agenda</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou número" autoFocus /></label>
            <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {found.map((c) => (
                <button type="button" key={c.id} className={`sched-item${picked?.id === c.id ? " active" : ""}`}
                  style={{ border: picked?.id === c.id ? "2px solid #0071e3" : "2px solid transparent", cursor: "pointer", textAlign: "left" }}
                  onClick={() => setPicked(c)}>
                  <strong>{c.name || c.pushName || "Sem nome"}</strong><span className="cv-muted">+{c.phone}</span>
                </button>
              ))}
              {!found.length && <span className="cv-muted">Nenhum contato encontrado. Cadastre em Contatos primeiro.</span>}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="pill-btn" onClick={useMine}><LocateFixed size={14} /> Usar minha localização</button>
            <label className="login-field"><span>Ou cole o link do Google Maps / coordenadas</span><input value={f.link} onChange={fromLink} placeholder="https://maps.google.com/... ou -5.18, -37.34" /></label>
            {f.lat && <p className="cv-muted">📍 {f.lat}, {f.lng}</p>}
            <label className="login-field"><span>Nome do local (opcional)</span><input value={f.name} onChange={set("name")} placeholder="Ex: Nossa loja" /></label>
            <label className="login-field"><span>Endereço (opcional)</span><input value={f.address} onChange={set("address")} /></label>
          </>
        )}
        {err && <div className="admin-feedback error">{err}</div>}
        <button className="connect-btn">Enviar</button>
      </form>
    </div>
  );
}

const DRAFTS = new Map();
const EMOJIS = "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😜 🤪 🤗 🤭 🤔 🤨 😐 😶 🙄 😏 😬 😌 😴 😎 🤓 🥳 😕 😟 😮 😲 🥺 😢 😭 😱 😡 🤯 👍 👎 👏 🙌 🙏 🤝 💪 👋 ✌️ 🤞 👌 👉 👀 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 ✅ ❌ ⚠️ 🔥 ⭐ ✨ 🎉 🎁 📌 📞 📲 💬 📄 📅 ⏰ 💰 💳 🚗 🏠 🏥 ☀️ 🌙 🌧️ ☕ 🍕 🎂".split(" ");

export default function ChatWindow({
  conversation,
  messages,
  onSend,
  onSendMedia,
  onSendAudio,
  onReact,
  onSendSpecial,
  onDeleteMessage,
  onForwardMessage,
  onRetry,
  onStartChat,
  onStickerSent,
  onDownloadMedia,
  conversations = [],
  onSetMode,
  onSetStatus,
  onSetPriority,
  onSetDepartment,
  onAssign,
  onToggleLabel,
  onTakeOver,
  onReturnToQueue,
  onMarkUnread,
  onTransferred,
  currentUserId,
  onBack,
  className = ""
}) {
  const [text, setText] = useState(() => DRAFTS.get(conversation?.id) || "");
  // Rascunho por conversa: o que foi digitado fica na conversa certa ao trocar
  const draftConvRef = useRef(conversation?.id);
  useEffect(() => {
    if (draftConvRef.current === conversation?.id) return;
    draftConvRef.current = conversation?.id;
    setText(DRAFTS.get(conversation?.id) || "");
  }, [conversation?.id]);
  useEffect(() => {
    const id = draftConvRef.current;
    if (!id) return;
    if (text) DRAFTS.set(id, text); else DRAFTS.delete(id);
  }, [text]);
  // Dados do cliente só abrem quando o atendente clicar
  const [panelOpen, setPanelOpen] = useState(false);
  const [cannedResponses, setCannedResponses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [team, setTeam] = useState([]);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const cancelRecRef = useRef(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  const insertEmoji = (e) => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? text.length;
    handleTextChange(text.slice(0, pos) + e + text.slice(pos));
    setTimeout(() => { el?.focus(); el?.setSelectionRange(pos + e.length, pos + e.length); }, 0);
  };
  const [showTransfer, setShowTransfer] = useState(false);
  const [menuId, setMenuId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [special, setSpecial] = useState(null); // "contact" | "location"
  const [attachOpen, setAttachOpen] = useState(false);
  const [chanStatus, setChanStatus] = useState("connected");
  const [showSchedule, setShowSchedule] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [clientTyping, setClientTyping] = useState(null); // null | "typing" | "recording"
  const typingSentAt = useRef(0);
  // Assinatura (*Nome:* no começo da mensagem) — cada atendente escolhe; fica salvo no navegador.
  const [signOn, setSignOn] = useState(() => {
    try {
      return localStorage.getItem("helora_sign") !== "off";
    } catch {
      return true;
    }
  });
  const toggleSign = () =>
    setSignOn((v) => {
      try {
        localStorage.setItem("helora_sign", v ? "off" : "on");
      } catch {}
      return !v;
    });
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    getCannedResponses().then(setCannedResponses).catch(console.error);
    getDepartments().then(setDepartments).catch(console.error);
    getTeam().then(setTeam).catch(console.error);
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Troca de conversa: limpa resposta/menu
  useEffect(() => {
    setReplyTo(null);
    setMenuId(null);
  }, [conversation?.id]);

  // Fecha o menu da mensagem ao clicar fora
  useEffect(() => {
    if (!menuId) return;
    const close = (e) => !e.target.closest(".msg-menu") && !e.target.closest(".bubble") && setMenuId(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuId]);

  // WhatsApp do canal desconectado: bloqueia o campo de mensagem
  useEffect(() => {
    if (!conversation?.id || conversation.platform !== "whatsapp") {
      setChanStatus("connected");
      return;
    }
    let alive = true;
    const check = () =>
      getConversationChannelStatus(conversation.id)
        .then((r) => alive && setChanStatus(r.status || "disconnected"))
        .catch(() => {});
    check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [conversation?.id, conversation?.platform]);

  // "Digitando…" do cliente (WhatsApp)
  useEffect(() => {
    setClientTyping(null);
    if (!conversation?.id || conversation.platform !== "whatsapp" || conversation.isGroup) return;
    let alive = true;
    const poll = () =>
      getPresenceApi(conversation.id)
        .then((p) => alive && setClientTyping(p.typing ? "typing" : p.recording ? "recording" : null))
        .catch(() => {});
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [conversation?.id, conversation?.platform, conversation?.isGroup]);

  const cannedSuggestions = useMemo(() => {
    if (!text.startsWith("/") || text.length < 1) return [];
    const query = text.slice(1).toLowerCase();
    return cannedResponses.filter((c) => c.shortCode.toLowerCase().includes(query)).slice(0, 5);
  }, [text, cannedResponses]);

  if (!conversation) {
    return (
      <div className={`main-area ${className}`}>
        <div className="empty-state">Selecione uma conversa para começar</div>
      </div>
    );
  }

  const offline = chanStatus !== "connected";

  const quotedOf = (m) => ({
    id: m.id,
    text: m.text || (m.mediaType ? "📎 Anexo" : m.extra?.type === "contact" ? "👤 Contato" : m.extra?.type === "location" ? "📍 Localização" : ""),
    author: m.direction === "out" ? "Você" : conversation.name
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim() || offline) return;
    onSend(text.trim(), signOn, replyTo ? quotedOf(replyTo) : null);
    setText("");
    typingSentAt.current = 0;
    setReplyTo(null);
  };

  const handleTextChange = (v) => {
    setText(v);
    if (conversation.platform !== "whatsapp" || conversation.isGroup) return;
    const now = Date.now();
    if (v && now - typingSentAt.current > 4000) {
      typingSentAt.current = now;
      sendTypingApi(conversation.id, true);
    } else if (!v && typingSentAt.current) {
      typingSentAt.current = 0;
      sendTypingApi(conversation.id, false);
    }
  };

  const sendSticker = async (payload) => {
    setShowStickers(false);
    try {
      await sendStickerApi(conversation.id, payload);
      onStickerSent?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const handleAction = async (action, m, emoji) => {
    setMenuId(null);
    if (action === "react") return onReact(m.id, emoji);
    if (action === "reply") {
      setReplyTo(m);
      return inputRef.current?.focus();
    }
    if (action === "forward") return setForwarding(m);
    if (action === "copy") return navigator.clipboard?.writeText(m.text || "");
    if (action === "delete") {
      if (window.confirm("Apagar esta mensagem para todos?")) onDeleteMessage?.(m.id);
    }
  };

  const applyCannedResponse = (canned) => {
    setText(canned.content);
    inputRef.current?.focus();
  };

  const handleFileChange = async (e) => {
    const raw = e.target.files?.[0];
    e.target.value = "";
    if (!raw || offline) return;
    const file = await compressImage(raw);
    const q = replyTo ? quotedOf(replyTo) : null;
    setReplyTo(null);
    await onSendMedia(file, undefined, q);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        if (cancelRecRef.current) { cancelRecRef.current = false; return; }
        await onSendAudio(blob);
      };
      cancelRecRef.current = false;
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecSecs(0);
      setRecording(true);
    } catch (err) {
      console.error("Não foi possível acessar o microfone:", err);
    }
  };

  const cancelRecording = () => {
    cancelRecRef.current = true;
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className={`main-area ${className}`}>
      <div className="chat-header">
        <div className="chat-header-left">
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={20} />
          </button>
          <button className="chat-who" onClick={() => setPanelOpen(true)} title="Ver dados do cliente">
          <Avatar name={conversation.name} url={conversation.avatarUrl} size={40} />
          <div>
            <div className="chat-header-name">{conversation.name}</div>
            <div className="chat-header-platform">
              {clientTyping && <span className="header-typing">{clientTyping === "recording" ? "gravando áudio…" : "digitando…"} · </span>}
              {conversation.isGroup && <><Users size={12} style={{ verticalAlign: -2 }} /> Grupo · </>}
              {conversation.platform === "whatsapp" && conversation.phone
                ? fmtPhone(conversation.phone)
                : PLATFORM_LABELS[conversation.platform]}
              {conversation.departmentName ? ` · ${conversation.departmentName}` : ""}
              {conversation.assignedAgentName ? ` · com ${conversation.assignedAgentName}` : " · pendente"}
            </div>
          </div>
          </button>
        </div>

        <div className="chat-header-right">
          {conversation.status !== "resolved" && conversation.assignedAgentId !== currentUserId && (
            <button className="pill-btn primary" onClick={onTakeOver} title="Assumir este atendimento">
              <Hand size={15} /> Assumir
            </button>
          )}
          {conversation.status !== "resolved" && (
            <button className="pill-btn" onClick={() => setShowTransfer(true)} title="Transferir para setor ou atendente">
              <ArrowRightLeft size={15} /> Transferir
            </button>
          )}
          {conversation.status !== "resolved" && conversation.assignedAgentId && (
            <button className="cv-icon-btn" onClick={onReturnToQueue} title="Devolver para Pendentes">
              <Undo2 size={15} />
            </button>
          )}
          <button className="cv-icon-btn" onClick={onMarkUnread} title="Marcar como não lida">
            <MailOpen size={15} />
          </button>
          {conversation.status !== "resolved" ? (
            <button className="cv-icon-btn ok" onClick={() => onSetStatus("resolved")} title="Encerrar atendimento">
              <CheckCircle2 size={16} />
            </button>
          ) : (
            <button className="pill-btn" onClick={() => onSetStatus("open")} title="Reabrir atendimento">
              <RotateCcw size={15} /> Reabrir
            </button>
          )}

          {!conversation.isGroup && <div className="mode-toggle">
            <button
              className={conversation.mode === "bot" ? "active" : ""}
              onClick={() => onSetMode("bot")}
            >
              Bot
            </button>
            <button
              className={conversation.mode === "human" ? "active" : ""}
              onClick={() => onSetMode("human")}
            >
              Atendente
            </button>
          </div>}

          <button
            className={`icon-btn ${panelOpen ? "active" : ""}`}
            title="Detalhes da conversa"
            onClick={() => setPanelOpen((v) => !v)}
          >
            <PanelRight size={16} />
          </button>
        </div>
      </div>

      {conversation.labels && conversation.labels.length > 0 && (
        <div className="chat-labels-row">
          {conversation.labels.map((l) => (
            <span key={l.id} className="label-chip" style={{ "--chip-color": l.color }}>
              {l.title}
            </span>
          ))}
        </div>
      )}

      <div className="chat-body">
        <div className="chat-column">
          <div className="message-list" ref={listRef}>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                menuOpen={menuId === m.id}
                isGroup={conversation.isGroup}
                onDownload={onDownloadMedia}
                onToggleMenu={(id) => setMenuId((cur) => (cur === id ? null : id))}
                onAction={handleAction}
                onRetry={onRetry}
                onStartChat={onStartChat}
              />
            ))}
            {clientTyping && (
              <div className="bubble-row in">
                <div className="bubble in typing-bubble" title={clientTyping === "recording" ? "gravando áudio…" : "digitando…"}>
                  <span className="typing-dots"><i /><i /><i /></span>
                </div>
              </div>
            )}
          </div>

          <div className="composer-wrap">
            {offline && (
              <div className="composer-offline">
                <WifiOff size={16} />
                <span>
                  {chanStatus === "connecting" ? "WhatsApp reconectando…" : "WhatsApp desconectado."} Não é possível enviar
                  mensagens até reconectar em <strong>Canais</strong>.
                </span>
              </div>
            )}
            {replyTo && !offline && (
              <div className="composer-reply">
                <Reply size={15} />
                <div>
                  <strong>{replyTo.direction === "out" ? "Respondendo você" : `Respondendo ${conversation.name}`}</strong>
                  <span><WaText text={quotedOf(replyTo).text} /></span>
                </div>
                <button type="button" className="icon-btn" onClick={() => setReplyTo(null)}><X size={14} /></button>
              </div>
            )}
            {cannedSuggestions.length > 0 && (
              <div className="canned-suggestions">
                {cannedSuggestions.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className="canned-suggestion-item"
                    onClick={() => applyCannedResponse(c)}
                  >
                    <span className="canned-shortcode">/{c.shortCode}</span>
                    <span className="canned-preview">{c.content}</span>
                  </button>
                ))}
              </div>
            )}
            <form className={`composer ${offline ? "disabled" : ""}`} onSubmit={handleSubmit}>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
              <div className="attach-wrap">
                <button
                  type="button"
                  className="composer-icon-btn"
                  title="Anexar"
                  disabled={offline}
                  onClick={() => setAttachOpen((v) => !v)}
                >
                  <Paperclip size={18} />
                </button>
                {showStickers && (
                  <StickerPicker onClose={() => setShowStickers(false)} onPick={(url) => sendSticker({ url })} onUpload={(file) => sendSticker({ file })} />
                )}
                {attachOpen && (
                  <div className="attach-menu" onMouseLeave={() => setAttachOpen(false)}>
                    <button type="button" onClick={() => { setAttachOpen(false); fileInputRef.current?.click(); }}><FileText size={16} /> Foto, vídeo ou arquivo</button>
                    {conversation.platform === "whatsapp" && (
                      <>
                        <button type="button" onClick={() => { setAttachOpen(false); setSpecial("contact"); }}><UserRound size={16} /> Contato</button>
                        <button type="button" onClick={() => { setAttachOpen(false); setSpecial("location"); }}><MapPin size={16} /> Localização</button>
                        {!conversation.isGroup || true ? (
                          <button type="button" onClick={() => { setAttachOpen(false); setShowStickers(true); }}><Sticker size={16} /> Figurinha</button>
                        ) : null}
                        <button type="button" onClick={() => { setAttachOpen(false); setShowSchedule(true); }}><CalendarClock size={16} /> Agendar mensagem</button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                className={`composer-icon-btn sign-btn ${signOn ? "on" : ""}`}
                title={signOn ? "Assinatura ligada: o cliente vê seu nome. Clique para desligar" : "Assinatura desligada. Clique para ligar"}
                onClick={toggleSign}
              >
                <PenLine size={17} />
              </button>

              <div className="attach-wrap">
                <button type="button" className="composer-icon-btn" title="Emojis" disabled={offline || recording} onClick={() => setEmojiOpen((v) => !v)}>
                  <Smile size={18} />
                </button>
                {emojiOpen && (
                  <div className="emoji-picker" onMouseLeave={() => setEmojiOpen(false)}>
                    {EMOJIS.map((e) => <button type="button" key={e} onClick={() => insertEmoji(e)}>{e}</button>)}
                  </div>
                )}
              </div>

              {recording ? (
                <div className="rec-bar">
                  <span className="rec-dot" /> Gravando áudio… <strong>{String(Math.floor(recSecs / 60)).padStart(2, "0")}:{String(recSecs % 60).padStart(2, "0")}</strong>
                  <button type="button" className="rec-cancel" title="Descartar áudio" onClick={cancelRecording}><Trash size={15} /> Descartar</button>
                </div>
              ) : (
              <input
                ref={inputRef}
                placeholder={offline ? "WhatsApp desconectado" : "Mensagem  ·  / para respostas prontas"}
                value={text}
                disabled={offline}
                onChange={(e) => handleTextChange(e.target.value)}
              />
              )}

              <button
                type="button"
                className={`composer-icon-btn ${recording ? "recording" : ""}`}
                disabled={offline}
                title={recording ? "Enviar áudio" : "Gravar áudio"}
                onClick={recording ? stopRecording : startRecording}
              >
                {recording ? <Send size={16} /> : <Mic size={18} />}
              </button>

              <button type="submit" className="composer-send" disabled={!text.trim() || offline} title="Enviar">
                <Send size={17} />
              </button>
            </form>
          </div>
        </div>

        {panelOpen && (
          <ClientPanel
            conversation={conversation}
            departments={departments}
            team={team}
            onSetPriority={onSetPriority}
            onToggleLabel={onToggleLabel}
            onSetDepartment={onSetDepartment}
            onAssign={onAssign}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      {forwarding && (
        <ForwardModal
          message={forwarding}
          conversations={conversations.filter((c) => c.id !== conversation.id)}
          onClose={() => setForwarding(null)}
          onSend={onForwardMessage}
        />
      )}
      {showSchedule && <ScheduleModal conversation={conversation} initialText={text} onClose={() => setShowSchedule(false)} />}
      {special && <SpecialModal kind={special} onClose={() => setSpecial(null)} onSend={onSendSpecial} />}

      {showTransfer && (
        <TransferModal
          conversation={conversation}
          departments={departments}
          team={team}
          onClose={() => setShowTransfer(false)}
          onDone={onTransferred}
        />
      )}
    </div>
  );
}
