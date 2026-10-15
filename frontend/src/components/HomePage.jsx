import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  KanbanSquare,
  MessageCircle,
  Smartphone,
  Settings2,
  AlertTriangle,
  Megaphone
} from "lucide-react";
import { priorityMeta } from "./PrioritySelector.jsx";
import { getAnnouncements } from "../api.js";

const QUICK_ACCESS = [
  { key: "overview", label: "Painel", icon: LayoutDashboard },
  { key: "deals", label: "Negócios", icon: KanbanSquare },
  { key: "conversations", label: "Conversas", icon: MessageCircle },
  { key: "channels", label: "Canais", icon: Smartphone },
  { key: "settings", label: "Configurações", icon: Settings2 }
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function formatTime(iso) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function HomePage({ profile, conversations, onNavigate }) {
  const firstName = (profile?.name || "").split(" ")[0] || "Você";
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => {
    getAnnouncements().then(setAnnouncements).catch(console.error);
  }, []);

  const pending = conversations
    .filter((c) => c.status !== "resolved" && (c.priority === "urgent" || c.priority === "high"))
    .sort((a, b) => new Date(a.lastMessageAt) - new Date(b.lastMessageAt))
    .slice(0, 6);

  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);

  return (
    <div className="page">
      <div className="welcome-banner">
        <div className="welcome-greeting">
          {greeting()}, {firstName}
        </div>
        <div className="welcome-sub">
          {profile?.isSuperAdmin
            ? "Aqui está um resumo de todas as contas."
            : `Aqui está um resumo do que está acontecendo na ${profile?.accountName || "sua conta"}.`}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="card pending-panel">
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} style={{ color: "var(--danger)" }} />
            {pending.length} conversa(s) de prioridade alta aguardando
          </div>
          <div className="pending-list">
            {pending.map((c) => {
              const pMeta = priorityMeta(c.priority);
              return (
                <div
                  key={c.id}
                  className="pending-item"
                  onClick={() => onNavigate("conversations")}
                >
                  <span className="priority-dot" style={{ background: pMeta.color }} />
                  <span className="pending-name">{c.name}</span>
                  <span className="pending-time">{formatTime(c.lastMessageAt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Acessos rápidos</div>
        <div className="quick-access-grid">
          {QUICK_ACCESS.map(({ key, label, icon: Icon }) => (
            <button key={key} className="quick-access-card" onClick={() => onNavigate(key)}>
              <div className="qa-icon">
                <Icon size={20} />
              </div>
              <div className="qa-name">{label}</div>
              {key === "conversations" && unreadTotal > 0 && (
                <span className="qa-badge">{unreadTotal}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {announcements.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Megaphone size={16} style={{ color: "var(--accent)" }} />
            Comunicados
          </div>
          <div className="announcement-list">
            {announcements.map((a) => (
              <div className="announcement-item" key={a.id}>
                <div className="ann-title">{a.title}</div>
                <div className="ann-msg">{a.message}</div>
                {a.link && (
                  <a href={a.link} target="_blank" rel="noreferrer" className="ann-link ann-btn">
                    {a.buttonText || "Abrir link"}
                  </a>
                )}
                <div className="ann-meta">
                  {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
