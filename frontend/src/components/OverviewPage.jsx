import React, { useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  Bot,
  UserCheck,
  CheckCircle2,
  Smile,
  Clock3,
  Inbox
} from "lucide-react";
import FunnelChart from "./FunnelChart.jsx";
import MessagesChart from "./MessagesChart.jsx";
import { getOverviewStats, getDepartments, getTeam, getChannels } from "../api.js";

const PLATFORM_LABELS = { whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram" };
const PLATFORM_COLORS = { whatsapp: "var(--wa)", messenger: "var(--messenger)", instagram: "var(--instagram-2)" };

function formatMinutes(mins) {
  if (mins === null || mins === undefined) return "—";
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}min`;
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function defaultRange() {
  return { from: isoDaysAgo(30), to: todayISO() };
}

function KpiCard({ label, value, sub, color, bg, icon: Icon }) {
  return (
    <div className="kpi-card">
      <div className="kpi-card-top">
        <div className="kpi-label">{label}</div>
        <div className="kpi-icon" style={{ background: bg, color }}>
          <Icon size={15} strokeWidth={2.3} />
        </div>
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function rankRows(list) {
  if (!list || list.length === 0) {
    return <div className="rank-empty">Sem dados neste período.</div>;
  }
  return (
    <div className="rank-list">
      {list.slice(0, 5).map((row, i) => (
        <div className="rank-row" key={row.name}>
          <span className="rank-idx">{i + 1}</span>
          <span className="rank-name">{row.name}</span>
          <span className="rank-val">{row.count}</span>
        </div>
      ))}
    </div>
  );
}


/** Anel de progresso (taxa em %). */
function Ring({ value }) {
  const r = 46, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="db-ring-wrap">
      <svg viewBox="0 0 120 120" width="120" height="120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(118,118,128,.14)" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="url(#dbRing)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 60 60)" />
        <defs><linearGradient id="dbRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0071e3" /><stop offset="60%" stopColor="#5ac8fa" /><stop offset="100%" stopColor="#34c759" /></linearGradient></defs>
      </svg>
      <div className="db-ring-val">{v}%</div>
    </div>
  );
}
function Mini({ icon: Icon, label, value, sub }) {
  return (
    <div className="db-mini">
      <div className="db-mini-top"><span className="db-mini-ico"><Icon size={14} /></span>{label}</div>
      <div className="db-mini-val">{value}</div>
      <div className="db-mini-sub">{sub}</div>
    </div>
  );
}
function RankTable({ title, list }) {
  const rows = (list || []).slice(0, 6);
  const max = Math.max(1, ...rows.map((r) => r.count || 0));
  return (
    <div className="db-card">
      <div className="db-card-title">{title} com mais conversas</div>
      {!rows.length ? <div className="rank-empty">Sem dados neste período.</div> : (
        <table className="db-table">
          <thead><tr><th>Nome</th><th>Conversas</th><th style={{ width: "40%" }}></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td><span className="db-av">{String(r.name || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>{r.name}</td>
                <td><strong>{r.count}</strong></td>
                <td><div className="db-ch-bar"><span style={{ width: `${(r.count / max) * 100}%` }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const PRESETS = [
  { key: "0", label: "Hoje", days: 0 },
  { key: "7", label: "7 dias", days: 7 },
  { key: "30", label: "30 dias", days: 30 },
  { key: "90", label: "90 dias", days: 90 },
  { key: "custom", label: "Personalizado", days: null }
];

export default function OverviewPage({ refreshKey }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState(defaultRange());
  const [departmentId, setDepartmentId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [departments, setDepartments] = useState([]);
  const [team, setTeam] = useState([]);
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    getDepartments().then(setDepartments).catch(console.error);
    getTeam().then(setTeam).catch(console.error);
    getChannels().then(setChannels).catch(console.error);
  }, []);

  useEffect(() => {
    getOverviewStats({
      dateFrom: period.from,
      dateTo: period.to,
      departmentId: departmentId || undefined,
      agentId: agentId || undefined,
      channelId: channelId || undefined
    })
      .then(setStats)
      .catch(console.error);
  }, [refreshKey, period, departmentId, agentId, channelId]);

  const isDefaultRange = useMemo(() => {
    const d = defaultRange();
    return period.from === d.from && period.to === d.to;
  }, [period]);

  const hasFilters = departmentId || agentId || channelId;

  const resetFilters = () => {
    setPeriod(defaultRange());
    setDepartmentId("");
    setAgentId("");
    setChannelId("");
  };

  if (!stats) {
    return <div className="page">Carregando estatísticas...</div>;
  }

  const total = stats.totals.conversations;
  const resolvedStage = stats.funnel.find((f) => f.key === "resolved");
  const escalatedStage = stats.funnel.find((f) => f.key === "escalated");
  const botStage = stats.funnel.find((f) => f.key === "bot");
  const resolvedCount = resolvedStage?.value ?? 0;
  const openCount = total - resolvedCount;

  const activePreset = customOpen
    ? "custom"
    : period.to === todayISO()
      ? (PRESETS.find((p) => p.days !== null && period.from === isoDaysAgo(p.days))?.key ?? "custom")
      : "custom";

  return (
    <div className="page">
      <div className="dash-filters">
        <div className="dash-presets">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={activePreset === p.key ? "active" : ""}
              onClick={() => (p.days === null ? setCustomOpen(true) : (setCustomOpen(false), setPeriod({ from: isoDaysAgo(p.days), to: todayISO() })))}
            >
              {p.label}
            </button>
          ))}
        </div>

        {(customOpen || activePreset === "custom") && (
          <div className="dash-dates">
            <input type="date" value={period.from} max={period.to} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} />
            <span>até</span>
            <input type="date" value={period.to} min={period.from} max={todayISO()} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} />
          </div>
        )}

        <div className="dash-selects">
          <label className={`dash-pill ${departmentId ? "on" : ""}`}>
            <span>Setor</span>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Todos</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className={`dash-pill ${agentId ? "on" : ""}`}>
            <span>Atendente</span>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">Todos</option>
              {team.map((t) => <option key={t.id} value={t.id}>{t.name || "Sem nome"}</option>)}
            </select>
          </label>
          <label className={`dash-pill ${channelId ? "on" : ""}`}>
            <span>Canal</span>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Todos</option>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.name || PLATFORM_LABELS[c.platform] || c.platform}</option>)}
            </select>
          </label>
          {(!isDefaultRange || hasFilters) && (
            <button className="dash-clear" onClick={() => { setCustomOpen(false); resetFilters(); }}>
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ===== Destaques ===== */}
      <div className="db-bento">
        <div className="db-hero blue">
          <div className="db-hero-top"><MessageSquare size={15} /> Conversas</div>
          <div className="db-hero-val">{total.toLocaleString("pt-BR")}</div>
          <div className="db-hero-sub">no período filtrado</div>
        </div>
        <div className="db-hero light">
          <div className="db-hero-top"><CheckCircle2 size={15} /> Resolvidas</div>
          <div className="db-hero-val">{resolvedCount.toLocaleString("pt-BR")}</div>
          <div className="db-hero-sub">{openCount.toLocaleString("pt-BR")} em aberto</div>
        </div>
        <div className="db-card db-ring">
          <div className="db-card-title">Taxa de resolução</div>
          <Ring value={total ? Math.round((resolvedCount / total) * 100) : 0} />
        </div>
        <div className="db-card db-line">
          <div className="db-card-title">Mensagens · 7 dias</div>
          <div className="db-line-val">{(stats.messagesByDay || []).reduce((s2, d) => s2 + (d.count || 0), 0).toLocaleString("pt-BR")}</div>
          <MessagesChart data={stats.messagesByDay || []} />
        </div>
      </div>

      {/* ===== Números rápidos ===== */}
      <div className="db-minis">
        <Mini icon={Smile} label="CSAT médio" value={stats.csat.average ? `${Number(stats.csat.average).toFixed(1)}/5` : "—"} sub={`${stats.csat.count} avaliação(ões)`} />
        <Mini icon={Bot} label="Resolvidas pelo bot" value={botStage?.value ?? 0} sub="sem atendente" />
        <Mini icon={UserCheck} label="Para atendente" value={escalatedStage?.value ?? 0} sub="transferidas" />
        <Mini icon={Clock3} label="1ª resposta" value={formatMinutes(stats.stageTable[1]?.avgMinutes ?? stats.stageTable[0]?.avgMinutes)} sub="tempo médio" />
        <Mini icon={Clock3} label="Atendimento" value={formatMinutes(stats.tma?.avgMinutes)} sub={`${stats.tma?.count ?? 0} resolvida(s)`} />
        <Mini icon={Inbox} label="Em aberto" value={openCount} sub="aguardando" />
      </div>

      {/* ===== Gráficos ===== */}
      <div className="db-grid2">
        <div className="db-card">
          <div className="db-card-title">Funil de atendimento</div>
          <div className="card-subtitle">Da primeira mensagem até a resolução</div>
          <FunnelChart funnel={stats.funnel} />
        </div>
        <div className="db-card">
          <div className="db-card-title">Conversas por canal</div>
          <div className="db-channels">
            {Object.entries(stats.byPlatform).map(([platform, count]) => {
              const max = Math.max(1, ...Object.values(stats.byPlatform));
              return (
                <div className="db-ch" key={platform}>
                  <div className="db-ch-head"><span className="legend-dot" style={{ background: PLATFORM_COLORS[platform] }} />{PLATFORM_LABELS[platform] || platform}<strong>{count}</strong></div>
                  <div className="db-ch-bar"><span style={{ width: `${(count / max) * 100}%`, background: PLATFORM_COLORS[platform] }} /></div>
                </div>
              );
            })}
            {Object.keys(stats.byPlatform).length === 0 && <div className="rank-empty">Sem dados neste período.</div>}
          </div>
        </div>
      </div>

      {/* ===== Ranking em tabela ===== */}
      <div className="db-grid2">
        <RankTable title="Atendentes" list={stats.rankingByAgent} />
        <RankTable title="Setores" list={stats.rankingByDepartment} />
      </div>

      <div className="db-card">
        <div className="db-card-title">Tempo de resposta por estágio</div>
        <table className="db-table">
          <thead><tr><th>Estágio</th><th>Tempo médio</th><th>Amostras</th></tr></thead>
          <tbody>
            {stats.stageTable.map((row) => (
              <tr key={row.stage}><td>{row.stage}</td><td>{formatMinutes(row.avgMinutes)}</td><td>{row.count}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
