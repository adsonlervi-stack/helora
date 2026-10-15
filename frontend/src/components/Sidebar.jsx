import React, { useEffect, useMemo, useState } from "react";
import { Search, SquarePen, SlidersHorizontal, X, MessageCircle, Hourglass, Users, CheckCircle2 } from "lucide-react";
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
 * Abas (igual ao ClickMassa):
 *  - Ativos:    abertas e comigo (ou de todos, com "Ver todos")
 *  - Pendentes: abertas sem atendente (bot respondendo ou esperando alguém assumir)
 *  - Grupos:    grupos de WhatsApp
 *  - Fechados:  encerradas (minhas, ou de todos com "Ver todos")
 */
const QUEUES = [
  { key: "active", label: "Ativos", icon: MessageCircle },
  { key: "pending", label: "Pendentes", icon: Hourglass },
  { key: "groups", label: "Grupos", icon: Users },
  { key: "closed", label: "Fechados", icon: CheckCircle2 }
];

function inQueue(c, q, userId, viewAll) {
  const open = c.status !== "resolved";
  if (q === "groups") return c.isGroup;
  if (c.isGroup) return false;
  const mine = c.assignedAgentId === userId;
  if (q === "active") return open && (viewAll ? !!c.assignedAgentId : mine);
  if (q === "pending") return open && !c.assignedAgentId;
  if (q === "closed") return !open && (viewAll || mine || !c.assignedAgentId);
  return false;
}

export default function Sidebar({ conversations, selectedId, onSelect, onNewConversation, currentUserId, canSeeAll = false, className = "" }) {
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState("pending");
  const [viewAll, setViewAll] = useState(() => {
    try {
      return canSeeAll && localStorage.getItem("helora_view_all") === "1";
    } catch {
      return false;
    }
  });
  const toggleViewAll = () =>
    setViewAll((v) => {
      try {
        localStorage.setItem("helora_view_all", v ? "0" : "1");
      } catch {}
      return !v;
    });
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
    if (conversations.some((c) => inQueue(c, "active", currentUserId, viewAll))) setQueue((q) => (q === "pending" ? "active" : q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length > 0]);

  const counts = useMemo(() => {
    const out = {};
    QUEUES.forEach((q) => (out[q.key] = conversations.filter((c) => inQueue(c, q.key, currentUserId, viewAll)).length));
    out.groupsUnread = conversations.filter((c) => c.isGroup && c.unread > 0).length;
    return out;
  }, [conversations, currentUserId, viewAll]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations
      .filter((c) => inQueue(c, queue, currentUserId, viewAll))
      .filter((c) => (labelFilter ? (c.labels || []).some((l) => l.id === labelFilter) : true))
      .filter((c) => (deptFilter ? c.departmentId === deptFilter : true))
      .filter((c) =>
        !term
          ? true
          : (c.name || "").toLowerCase().includes(term) ||
            (c.externalId || "").includes(term.replace(/\D/g, "") || "§") ||
            (c.lastMessagePreview || "").toLowerCase().includes(term)
      );
  }, [conversations, search, queue, labelFilter, deptFilter, currentUserId, viewAll]);

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
            <button key={q.key} className={`qtab ${queue === q.key ? "active" : ""}`} onClick={() => setQueue(q.key)} title={q.label}>
              <span className="qtab-top">
                <q.icon size={15} />
                {q.key === "groups"
                  ? counts.groupsUnread > 0 && <span className="qtab-count dot">{counts.groupsUnread}</span>
                  : counts[q.key] > 0 && q.key !== "closed" && <span className="qtab-count">{counts[q.key]}</span>}
              </span>
              <span className="qtab-label">{q.label}</span>
            </button>
          ))}
        </div>

        {canSeeAll && (
          <button className={`cv-viewall ${viewAll ? "on" : ""}`} onClick={toggleViewAll} title="Gestor: mostrar os atendimentos de toda a equipe">
            <span className="cv-switch" /> Ver atendimentos de todos
          </button>
        )}

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
          const waiting = queue === "pending" && c.mode === "human" && !c.assignedAgentId;
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
                  {queue === "pending" && c.mode === "bot" && <span className="cv-tag" style={{ "--tag": "#af52de" }}>🤖 Bot</span>}
                  {waiting && <span className="cv-tag warn">⏳ {waitingFor(c.lastMessageAt)}</span>}
                </div>
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="cv-empty">
            {queue === "active" && (viewAll ? "Ninguém da equipe está em atendimento agora." : "Nenhum atendimento com você agora. Veja em Pendentes.")}
            {queue === "pending" && "Nada pendente. Ninguém esperando atendimento. 🎉"}
            {queue === "groups" && "Nenhum grupo ainda. As mensagens de grupos do WhatsApp conectado aparecem aqui."}
            {queue === "closed" && "Nenhum atendimento encerrado ainda."}
          </div>
        )}
      </div>
    </aside>
  );
}
