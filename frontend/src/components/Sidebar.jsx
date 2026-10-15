import React, { useEffect, useMemo, useState } from "react";
import { Search, SquarePen, SlidersHorizontal, X } from "lucide-react";
import { getLabels, getDepartments } from "../api.js";
import { priorityMeta } from "./PrioritySelector.jsx";
import Avatar from "./Avatar.jsx";

const PLATFORM_COLORS = { whatsapp: "#25d366", messenger: "#0084ff", instagram: "#e1306c" };

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function waitingFor(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ${mins % 60}m` : `${Math.floor(h / 24)}d`;
}

/**
 * Filas (inspiradas no fluxo de atendimento de mercado):
 *  - Meus:       abertas e atribuídas a mim
 *  - Fila:       abertas, no modo humano, sem ninguém atribuído (esperando alguém assumir)
 *  - Bot:        abertas, ainda com o bot respondendo
 *  - Todas:      todas as abertas (gestor)
 *  - Resolvidas
 */
const QUEUES = [
  { key: "mine", label: "Meus" },
  { key: "queue", label: "Fila" },
  { key: "bot", label: "Bot" },
  { key: "all", label: "Todas" },
  { key: "resolved", label: "Resolvidas" }
];

function inQueue(c, q, userId) {
  const open = c.status !== "resolved";
  if (q === "resolved") return !open;
  if (!open) return false;
  if (q === "mine") return c.assignedAgentId === userId;
  if (q === "queue") return c.mode === "human" && !c.assignedAgentId;
  if (q === "bot") return c.mode === "bot" && !c.assignedAgentId;
  return true;
}

export default function Sidebar({ conversations, selectedId, onSelect, onNewConversation, currentUserId, className = "" }) {
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState("queue");
  const [showFilters, setShowFilters] = useState(false);
  const [labels, setLabels] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [labelFilter, setLabelFilter] = useState(null);
  const [deptFilter, setDeptFilter] = useState(null);

  useEffect(() => {
    getLabels().then(setLabels).catch(() => {});
    getDepartments().then(setDepartments).catch(() => {});
  }, []);

  // Começa em "Meus" se eu já tenho conversa; senão na fila.
  useEffect(() => {
    if (conversations.some((c) => inQueue(c, "mine", currentUserId))) setQueue((q) => (q === "queue" ? "mine" : q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length > 0]);

  const counts = useMemo(() => {
    const out = {};
    QUEUES.forEach((q) => (out[q.key] = conversations.filter((c) => inQueue(c, q.key, currentUserId)).length));
    return out;
  }, [conversations, currentUserId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations
      .filter((c) => inQueue(c, queue, currentUserId))
      .filter((c) => (labelFilter ? (c.labels || []).some((l) => l.id === labelFilter) : true))
      .filter((c) => (deptFilter ? c.departmentId === deptFilter : true))
      .filter((c) =>
        !term
          ? true
          : (c.name || "").toLowerCase().includes(term) ||
            (c.externalId || "").includes(term.replace(/\D/g, "") || "§") ||
            (c.lastMessagePreview || "").toLowerCase().includes(term)
      );
  }, [conversations, search, queue, labelFilter, deptFilter, currentUserId]);

  const activeFilters = (labelFilter ? 1 : 0) + (deptFilter ? 1 : 0);

  return (
    <aside className={`conv-panel lg-panel ${className}`}>
      <div className="cv-head">
        <div className="cv-head-row">
          <h2 className="cv-title">Conversas</h2>
          <button className="cv-icon-btn primary" title="Nova conversa" onClick={onNewConversation}>
            <SquarePen size={17} />
          </button>
        </div>

        <div className="cv-search">
          <Search size={15} />
          <input placeholder="Buscar nome, número ou mensagem" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Limpar">
              <X size={14} />
            </button>
          )}
          <button
            className={`cv-filter-btn ${showFilters || activeFilters ? "on" : ""}`}
            title="Filtros"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal size={15} />
            {activeFilters > 0 && <span className="cv-dot-count">{activeFilters}</span>}
          </button>
        </div>

        <div className="cv-segment" role="tablist">
          {QUEUES.map((q) => (
            <button key={q.key} className={queue === q.key ? "active" : ""} onClick={() => setQueue(q.key)}>
              {q.label}
              {counts[q.key] > 0 && q.key !== "resolved" && <span className="cv-seg-count">{counts[q.key]}</span>}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="cv-filters">
            {departments.length > 0 && (
              <div className="cv-chip-row">
                <span className="cv-chip-label">Setor</span>
                {departments.map((d) => (
                  <button
                    key={d.id}
                    className={`cv-chip ${deptFilter === d.id ? "active" : ""}`}
                    onClick={() => setDeptFilter((cur) => (cur === d.id ? null : d.id))}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}
            {labels.length > 0 && (
              <div className="cv-chip-row">
                <span className="cv-chip-label">Etiqueta</span>
                {labels.map((l) => (
                  <button
                    key={l.id}
                    className={`cv-chip ${labelFilter === l.id ? "active" : ""}`}
                    style={labelFilter === l.id ? { background: l.color, borderColor: l.color, color: "#fff" } : {}}
                    onClick={() => setLabelFilter((cur) => (cur === l.id ? null : l.id))}
                  >
                    <span className="label-dot" style={{ background: l.color }} />
                    {l.title}
                  </button>
                ))}
              </div>
            )}
            {!departments.length && !labels.length && (
              <div className="cv-muted">Crie setores e etiquetas em Configurações para filtrar aqui.</div>
            )}
          </div>
        )}
      </div>

      <div className="conversation-list cv-list">
        {filtered.map((c) => {
          const pMeta = c.priority ? priorityMeta(c.priority) : null;
          const waiting = queue === "queue" && c.mode === "human" && !c.assignedAgentId;
          return (
            <button
              key={c.id}
              className={`cv-item ${selectedId === c.id ? "active" : ""} ${c.unread > 0 ? "unread" : ""} ${waiting ? "waiting" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <div className="cv-avatar">
                <Avatar name={c.name} url={c.avatarUrl} size={46} />
                <span className="cv-platform" style={{ background: PLATFORM_COLORS[c.platform] }} />
              </div>
              <div className="cv-body">
                <div className="cv-row">
                  <span className="cv-name">{c.name}</span>
                  <span className="cv-time">{formatWhen(c.lastMessageAt)}</span>
                </div>
                <div className="cv-row">
                  <span className="cv-preview">
                    {c.lastMessagePreview || (c.mode === "bot" ? "Bot em atendimento" : "Atendimento humano")}
                  </span>
                  {c.unread > 0 && <span className="cv-unread">{c.unread}</span>}
                </div>
                <div className="cv-tags">
                  {pMeta && (
                    <span className="cv-tag" style={{ "--tag": pMeta.color }}>
                      {pMeta.label}
                    </span>
                  )}
                  {c.departmentName && <span className="cv-tag neutral">{c.departmentName}</span>}
                  {c.assignedAgentName && <span className="cv-tag blue">{c.assignedAgentName}</span>}
                  {(c.labels || []).slice(0, 2).map((l) => (
                    <span key={l.id} className="cv-tag" style={{ "--tag": l.color }}>
                      {l.title}
                    </span>
                  ))}
                  {waiting && <span className="cv-tag warn">⏳ {waitingFor(c.lastMessageAt)}</span>}
                </div>
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="cv-empty">
            {queue === "mine" && "Nenhuma conversa com você agora."}
            {queue === "queue" && "Fila vazia. Ninguém esperando atendimento. 🎉"}
            {queue === "bot" && "Nenhuma conversa com o bot no momento."}
            {queue === "all" && "Nenhuma conversa aberta."}
            {queue === "resolved" && "Nenhuma conversa resolvida ainda."}
          </div>
        )}
      </div>
    </aside>
  );
}
