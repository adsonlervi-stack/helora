import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, PanelRight, Paperclip, Mic, Square, Hand, Undo2, Send } from "lucide-react";
import Avatar from "./Avatar.jsx";
import ContactPanel from "./ContactPanel.jsx";
import TicketActions from "./TicketActions.jsx";
import { getCannedResponses, getDepartments, getTeam } from "../api.js";

const PLATFORM_LABELS = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram"
};

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮"];

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ message, onReact }) {
  const [showReactions, setShowReactions] = useState(false);

  const authorLabel =
    message.author === "bot" ? "Bot" : message.author === "operator" ? message.senderName || "Atendente" : null;

  return (
    <div
      className={`bubble ${message.direction}`}
      onMouseEnter={() => setShowReactions(true)}
      onMouseLeave={() => setShowReactions(false)}
    >
      {message.mediaUrl && message.mediaType === "image" && (
        <img src={message.mediaUrl} alt="Anexo" className="bubble-media-image" />
      )}
      {message.mediaUrl && message.mediaType === "video" && (
        <video src={message.mediaUrl} controls className="bubble-media-video" />
      )}
      {message.mediaUrl && message.mediaType === "audio" && (
        <audio src={message.mediaUrl} controls className="bubble-media-audio" />
      )}
      {message.mediaUrl && message.mediaType === "document" && (
        <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="bubble-media-doc">
          📄 Abrir documento
        </a>
      )}

      {message.text && <div>{message.text}</div>}

      <span className="bubble-meta">
        {authorLabel ? `${authorLabel} · ` : ""}
        {formatTime(message.timestamp)}
      </span>

      {message.reactions && message.reactions.length > 0 && (
        <div className="bubble-reactions">
          {message.reactions.map((r, i) => (
            <span key={i} className="bubble-reaction-chip">
              {r.emoji}
            </span>
          ))}
        </div>
      )}

      {showReactions && (
        <div className="reaction-picker">
          {QUICK_EMOJIS.map((emoji) => (
            <button key={emoji} onClick={() => onReact(message.id, emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatWindow({
  conversation,
  messages,
  onSend,
  onSendMedia,
  onSendAudio,
  onReact,
  onSetMode,
  onSetStatus,
  onSetPriority,
  onSetDepartment,
  onAssign,
  onToggleLabel,
  onTakeOver,
  onReturnToQueue,
  currentUserId,
  onBack,
  className = ""
}) {
  const [text, setText] = useState("");
  const [panelOpen, setPanelOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 860 : true
  );
  const [cannedResponses, setCannedResponses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [team, setTeam] = useState([]);
  const [recording, setRecording] = useState(false);
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
  }, [messages]);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  const applyCannedResponse = (canned) => {
    setText(canned.content);
    inputRef.current?.focus();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onSendMedia(file);
    e.target.value = "";
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
        await onSendAudio(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      console.error("Não foi possível acessar o microfone:", err);
    }
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
          <Avatar name={conversation.name} url={conversation.avatarUrl} size={40} />
          <div>
            <div className="chat-header-name">{conversation.name}</div>
            <div className="chat-header-platform">
              {conversation.platform === "whatsapp" && /@s\.whatsapp\.net$/.test(conversation.externalId || "")
                ? `+${conversation.externalId.split("@")[0]}`
                : PLATFORM_LABELS[conversation.platform]}
              {conversation.departmentName ? ` · ${conversation.departmentName}` : ""}
              {conversation.assignedAgentName ? ` · com ${conversation.assignedAgentName}` : " · na fila"}
            </div>
          </div>
        </div>

        <div className="chat-header-right">
          {conversation.status !== "resolved" && conversation.assignedAgentId !== currentUserId && (
            <button className="pill-btn primary" onClick={onTakeOver} title="Assumir este atendimento">
              <Hand size={15} /> Assumir
            </button>
          )}
          {conversation.status !== "resolved" && conversation.assignedAgentId && (
            <button className="pill-btn" onClick={onReturnToQueue} title="Devolver para a fila">
              <Undo2 size={15} /> Fila
            </button>
          )}
          <TicketActions
            conversation={conversation}
            departments={departments}
            team={team}
            onAssign={onAssign}
            onSetDepartment={onSetDepartment}
            onSetStatus={onSetStatus}
          />

          <div className="mode-toggle">
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
          </div>

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
              <MessageBubble key={m.id} message={m} onReact={onReact} />
            ))}
          </div>

          <div className="composer-wrap">
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
            <form className="composer" onSubmit={handleSubmit}>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />
              <button
                type="button"
                className="composer-icon-btn"
                title="Anexar arquivo"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={18} />
              </button>

              <input
                ref={inputRef}
                placeholder="Mensagem  ·  / para respostas prontas"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />

              <button
                type="button"
                className={`composer-icon-btn ${recording ? "recording" : ""}`}
                title={recording ? "Parar gravação" : "Gravar áudio"}
                onClick={recording ? stopRecording : startRecording}
              >
                {recording ? <Square size={16} /> : <Mic size={18} />}
              </button>

              <button type="submit" className="composer-send" disabled={!text.trim()} title="Enviar">
                <Send size={17} />
              </button>
            </form>
          </div>
        </div>

        {panelOpen && (
          <ContactPanel
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
    </div>
  );
}
