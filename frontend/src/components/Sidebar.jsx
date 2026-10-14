import React, { useEffect, useMemo, useState } from "react";
import { getLabels } from "../api.js";
import { priorityMeta } from "./PrioritySelector.jsx";

const PLATFORM_LABELS = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram"
};

const PLATFORM_COLORS = {
  whatsapp: "var(--wa)",
  messenger: "var(--messenger)",
  instagram: "var(--instagram-2)"
};

function initials(name = "") {
  return name.trim().slice(0, 2).toUpperCase();
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function Sidebar({
  conversations,
  selectedId,
  onSelect,
  whatsappStatus,
  onOpenConnect,
  className = ""
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [queue, setQueue] = useState("open"); // 'open' | 'resolved'
  const [allLabels, setAllLabels] = useState([]);
  const [labelFilter, setLabelFilter] = useState(null);

  useEffect(() => {
    getLabels().then(setAllLabels).catch(console.error);
  }, []);

  const openCount = conversations.filter((c) => c.status !== "resolved").length;
  const resolvedCount = conversations.filter((c) => c.status === "resolved").length;

  const filtered = useMemo(() => {
    return conversations
      .filter((c) => (queue === "open" ? c.status !== "resolved" : c.status === "resolved"))
      .filter((c) => (filter === "all" ? true : c.platform === filter))
      .filter((c) => (labelFilter ? (c.labels || []).some((l) => l.id === labelFilter) : true))
      .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  }, [conversations, search, filter, labelFilter, queue]);

  return (
    <aside className={`conv-panel ${className}`}>
      <div className="conv-panel-header">
        <p className="conv-panel-title">Conversas</p>

        <div className="status-strip">
          <div className="status-pill">
            <span
              className={`status-dot ${whatsappStatus === "connected" ? "online" : ""}`}
            />
            WhatsApp
          </div>
          <div className="status-pill">
            <span className="status-dot" />
            Messenger
          </div>
          <div className="status-pill">
            <span className="status-dot" />
            Instagram
          </div>
        </div>

        <button className="connect-btn" onClick={onOpenConnect}>
          {whatsappStatus === "connected" ? "WhatsApp conectado ✓" : "Conectar WhatsApp (QR Code)"}
        </button>
      </div>

      <div className="queue-tabs">
        <button
          className={`queue-tab ${queue === "open" ? "active" : ""}`}
          onClick={() => setQueue("open")}
        >
          Abertas
          <span className="queue-tab-count">{openCount}</span>
        </button>
        <button
          className={`queue-tab ${queue === "resolved" ? "active" : ""}`}
          onClick={() => setQueue("resolved")}
        >
          Resolvidas
          <span className="queue-tab-count">{resolvedCount}</span>
        </button>
      </div>

      <div className="search-box">
        <input
          placeholder="Buscar conversa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="filter-tabs">
        {["all", "whatsapp", "messenger", "instagram"].map((f) => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Todos" : PLATFORM_LABELS[f]}
          </button>
        ))}
      </div>

      {allLabels.length > 0 && (
        <div className="filter-tabs label-filter-tabs">
          {allLabels.map((l) => (
            <button
              key={l.id}
              className={`filter-tab label-filter-tab ${labelFilter === l.id ? "active" : ""}`}
              style={labelFilter === l.id ? { background: l.color, borderColor: l.color } : {}}
              onClick={() => setLabelFilter((cur) => (cur === l.id ? null : l.id))}
            >
              <span className="label-dot" style={{ background: l.color }} />
              {l.title}
            </button>
          ))}
        </div>
      )}

      <div className="conversation-list">
        {filtered.map((c) => {
          const pMeta = priorityMeta(c.priority);
          return (
            <div
              key={c.id}
              className={`conversation-item ${selectedId === c.id ? "active" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <div className={`avatar ${c.platform}`}>
                {c.priority && (
                  <span className="priority-corner-dot" style={{ background: pMeta.color }} />
                )}
                {initials(c.name)}
                <span
                  className="platform-dot"
                  style={{ background: PLATFORM_COLORS[c.platform] }}
                />
              </div>
              <div className="conv-meta">
                <div className="conv-name">{c.name}</div>
                <div className="conv-preview">
                  {c.mode === "human" ? "Atendimento humano" : "Bot ativo"}
                </div>
                {c.labels && c.labels.length > 0 && (
                  <div className="conv-label-row">
                    {c.labels.slice(0, 3).map((l) => (
                      <span key={l.id} className="label-chip-mini" style={{ background: l.color }} />
                    ))}
                  </div>
                )}
              </div>
              <div className="conv-side">
                <span className="conv-time">{formatTime(c.lastMessageAt)}</span>
                {c.unread > 0 && <span className="unread-badge">{c.unread}</span>}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="conv-empty">
            {queue === "open" ? "Nenhuma conversa aberta por aqui." : "Nenhuma conversa resolvida ainda."}
          </div>
        )}
      </div>
    </aside>
  );
}
