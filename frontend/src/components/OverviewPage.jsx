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

      <div className="kpi-grid">
        <KpiCard
          label="Conversas no período"
          value={total}
          sub="conforme os filtros acima"
          color="var(--accent-deep)"
          bg="var(--accent-soft)"
          icon={MessageSquare}
        />
        <KpiCard
          label="Resolvidas"
          value={resolvedCount}
          sub={`${total ? Math.round((resolvedCount / total) * 100) : 0}% do período`}
          color="var(--success)"
          bg="#e7f6ef"
          icon={CheckCircle2}
        />
        <KpiCard
          label="Em aberto"
          value={openCount}
          sub="dentro do período filtrado"
          color="var(--warning)"
          bg="#fdf1e2"
          icon={Inbox}
        />
        <KpiCard
          label="CSAT médio"
          value={stats.csat.average ? Number(stats.csat.average).toFixed(1) : "—"}
          sub={`${stats.csat.count} avaliação(ões)`}
          color="var(--accent-deep)"
          bg="var(--accent-soft)"
          icon={Smile}
        />
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Resolvidas pelo bot"
          value={botStage?.value ?? 0}
          sub="sem precisar de atendente"
          color="var(--accent)"
          bg="#eaf2fd"
          icon={Bot}
        />
        <KpiCard
          label="Transferidas p/ atendente"
          value={escalatedStage?.value ?? 0}
          sub="no período filtrado"
          color="var(--warning)"
          bg="#fdf1e2"
          icon={UserCheck}
        />
        <KpiCard
          label="TMR (1ª resposta)"
          value={formatMinutes(stats.stageTable[1]?.avgMinutes ?? stats.stageTable[0]?.avgMinutes)}
          sub="tempo médio até responder"
          color="var(--text-main)"
          bg="var(--bg-sunken)"
          icon={Clock3}
        />
        <KpiCard
          label="TMA (atendimento)"
          value={formatMinutes(stats.tma?.avgMinutes)}
          sub={`${stats.tma?.count ?? 0} conversa(s) resolvida(s)`}
          color="var(--text-main)"
          bg="var(--bg-sunken)"
          icon={Clock3}
        />
      </div>

      <div className="panel">
        <div className="panel-title">Ranking do período</div>
        <div className="grid-2">
          <div>
            <div className="rank-group-label">Atendente com mais conversas</div>
            {rankRows(stats.rankingByAgent)}
          </div>
          <div>
            <div className="rank-group-label">Setor com mais conversas</div>
            {rankRows(stats.rankingByDepartment)}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Funil de atendimento</div>
        <div className="card-subtitle">Da primeira mensagem até a resolução, no período filtrado</div>
        <FunnelChart funnel={stats.funnel} />
      </div>

      <div className="panel-grid">
        <div className="panel">
          <div className="panel-title">Conversas por canal</div>
          <div className="platform-legend">
            {Object.entries(stats.byPlatform).map(([platform, count]) => (
              <div className="legend-row" key={platform}>
                <span className="legend-dot" style={{ background: PLATFORM_COLORS[platform] }} />
                {PLATFORM_LABELS[platform] || platform}
                <span className="legend-count">{count}</span>
              </div>
            ))}
            {Object.keys(stats.byPlatform).length === 0 && (
              <div className="rank-empty">Sem dados neste período.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Satisfação (CSAT)</div>
          <div className="csat-display">
            <div className="csat-icon">
              <Smile size={22} />
            </div>
            <div>
              <div className="csat-value">
                {stats.csat.average ? Number(stats.csat.average).toFixed(1) : "—"}
                <span className="csat-value-max">/5</span>
              </div>
              <div className="csat-count">
                {stats.csat.count} {stats.csat.count === 1 ? "avaliação" : "avaliações"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <div className="panel-title">Mensagens nos últimos 7 dias</div>
          <MessagesChart data={stats.messagesByDay} />
        </div>

        <div className="panel">
          <div className="panel-title">TMR por estágio</div>
          <table className="stage-table">
            <thead>
              <tr>
                <th>Estágio</th>
                <th>Tempo médio</th>
                <th>Amostras</th>
              </tr>
            </thead>
            <tbody>
              {stats.stageTable.map((row) => (
                <tr key={row.stage}>
                  <td>{row.stage}</td>
                  <td>{formatMinutes(row.avgMinutes)}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
