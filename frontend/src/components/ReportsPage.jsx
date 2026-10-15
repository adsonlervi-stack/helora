import React, { useEffect, useMemo, useState } from "react";
import { Download, MessageCircle, CheckCircle2, Timer, Star, Search, Printer } from "lucide-react";
import { getReportsApi, getAttendancesApi, getDepartments, getTeam, getChannels, getLabels } from "../api.js";

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));
const dur = (s) => {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = Math.floor(s / 3600);
  return `${h}h ${Math.round((s % 3600) / 60)}min`;
};
const TABS = [
  { key: "byAgent", label: "Por atendente" },
  { key: "byDepartment", label: "Por setor" },
  { key: "byChannel", label: "Por canal" }
];

function toCsv(rows, label) {
  const head = [label, "Atendimentos", "Encerrados", "Em aberto", "Msgs recebidas", "Msgs enviadas", "1ª resposta (s)", "Duração média (s)", "Satisfação", "Avaliações"];
  const lines = rows.map((r) => [r.name, r.conversations, r.resolved, r.open, r.inMsgs, r.outMsgs, r.frt ?? "", r.aht ?? "", r.csat ?? "", r.csatCount]);
  return [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
}

/** Relatórios de atendimento (estilo ClickMassa): por atendente, setor, canal e dia. */
export default function ReportsPage() {
  const [view, setView] = useState("query");
  return (
    <div className="page reports-page">
      <div className="dash-presets" style={{ marginBottom: 14 }}>
        <button className={view === "query" ? "active" : ""} onClick={() => setView("query")}>Consultar atendimentos</button>
        <button className={view === "summary" ? "active" : ""} onClick={() => setView("summary")}>Resumo e indicadores</button>
      </div>
      {view === "query" ? <AttendanceQuery /> : <ReportsSummary />}
    </div>
  );
}

const STATUS_LABEL = { open: "Aberto", pending: "Pendente", resolved: "Fechado", closed: "Fechado" };
const dt = (v) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

function AttendanceQuery() {
  const [f, setF] = useState({ from: daysAgo(1), to: iso(new Date()), name: "", contact: "", status: "", channelId: "", agentId: "", departmentId: "", labelId: "", by: "created" });
  const [opts, setOpts] = useState({ departments: [], team: [], channels: [], labels: [] });
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    Promise.all([getDepartments().catch(() => []), getTeam().catch(() => []), getChannels().catch(() => []), getLabels().catch(() => [])]).then(
      ([departments, team, channels, labels]) => setOpts({ departments, team, channels, labels })
    );
  }, []);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const gerar = () => {
    setLoading(true);
    setError(null);
    getAttendancesApi(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))
      .then(setRows)
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };
  useEffect(gerar, []);
  const head = ["Bilhete", "Status", "Nome", "Contato", "Canal", "Agente", "Setor", "Etiquetas", "Aberto em", "Fechado em"];
  const line = (r) => [r.ticket, STATUS_LABEL[r.status] || r.status, r.name, r.phone ? "+" + r.phone : "", r.channel, r.agent || "", r.department || "", r.labels.join(", "), dt(r.createdAt), r.resolvedAt ? dt(r.resolvedAt) : ""];
  const excel = () => {
    const csv = [head, ...(rows || []).map(line)].map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `atendimentos-${f.from}-a-${f.to}.csv`;
    a.click();
  };
  const imprimir = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    w.document.write(`<html><head><title>Atendimentos</title><style>body{font-family:-apple-system,Arial;font-size:11px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#f2f6fb}</style></head><body><h2>Atendimentos · ${f.from.split("-").reverse().join("/")} a ${f.to.split("-").reverse().join("/")}</h2><table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${(rows || []).map((r) => `<tr>${line(r).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table></body></html>`);
    w.document.close();
    w.print();
  };
  const sel = (k, label, list, fmt = (x) => x.name) => (
    <label className="rq-field"><span>{label}</span>
      <select value={f[k]} onChange={set(k)}><option value="">Todos</option>{list.map((x) => <option key={x.id} value={x.id}>{fmt(x)}</option>)}</select>
    </label>
  );
  return (
    <div className="card">
      <div className="card-title">Consultar atendimentos</div>
      <div className="rq-grid">
        <label className="rq-field"><span>De</span><input type="date" value={f.from} max={f.to} onChange={set("from")} /></label>
        <label className="rq-field"><span>Até</span><input type="date" value={f.to} min={f.from} onChange={set("to")} /></label>
        <label className="rq-field"><span>Nome</span><input value={f.name} onChange={set("name")} placeholder="Nome do cliente" /></label>
        <label className="rq-field"><span>Contato</span><input value={f.contact} onChange={set("contact")} placeholder="Número" /></label>
        <label className="rq-field"><span>Status</span>
          <select value={f.status} onChange={set("status")}><option value="">Todos</option><option value="open">Aberto</option><option value="pending">Pendente</option><option value="resolved">Fechado</option></select>
        </label>
        {sel("channelId", "Canal", opts.channels, (c) => c.name || c.platform)}
        {sel("agentId", "Agente", opts.team)}
        {sel("departmentId", "Setor", opts.departments)}
        {sel("labelId", "Etiqueta", opts.labels)}
      </div>
      <div className="gestao-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        <div className="rq-radio">
          Filtrar por:
          <label><input type="radio" checked={f.by === "created"} onChange={() => setF((p) => ({ ...p, by: "created" }))} /> Data de abertura</label>
          <label><input type="radio" checked={f.by === "closed"} onChange={() => setF((p) => ({ ...p, by: "closed" }))} /> Data de fechamento</label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="pill-btn primary" onClick={gerar} disabled={loading}><Search size={14} /> {loading ? "Gerando…" : "Gerar"}</button>
          <button className="pill-btn" onClick={imprimir} disabled={!rows?.length}><Printer size={14} /> Imprimir</button>
          <button className="pill-btn" onClick={excel} disabled={!rows?.length}><Download size={14} /> Excel</button>
        </div>
      </div>
      {error && <div className="admin-feedback error">{error}</div>}
      <div className="cv-muted" style={{ margin: "10px 0 6px" }}>{rows ? `${rows.length} atendimento(s)` : ""}</div>
      <div className="rep-table-wrap">
        <table className="rep-table">
          <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {(rows || []).map((r) => (
              <tr key={r.id}>{line(r).map((v, i) => <td key={i}>{i === 2 ? <strong>{v}</strong> : v}</td>)}</tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={head.length} className="cv-muted">Nenhum atendimento com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportsSummary() {
  const [f, setF] = useState({ from: daysAgo(30), to: iso(new Date()), departmentId: "", agentId: "", channelId: "" });
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("byAgent");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [opts, setOpts] = useState({ departments: [], team: [], channels: [] });

  useEffect(() => {
    Promise.all([getDepartments().catch(() => []), getTeam().catch(() => []), getChannels().catch(() => [])]).then(
      ([departments, team, channels]) => setOpts({ departments, team, channels })
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    getReportsApi(params)
      .then(setData)
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [f]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const rows = data?.[tab] || [];
  const maxDay = useMemo(() => Math.max(1, ...(data?.byDay || []).map((d) => d.count)), [data]);

  const exportCsv = () => {
    const blob = new Blob(["﻿" + toCsv(rows, TABS.find((t) => t.key === tab).label)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-atendimento-${f.from}-a-${f.to}.csv`;
    a.click();
  };

  const t = data?.total;
  return (
    <div>
      <div className="dash-filters">
        <div className="dash-presets">
          {[["7", 7], ["30", 30], ["90", 90]].map(([k, n]) => (
            <button key={k} className={f.from === daysAgo(n) && f.to === iso(new Date()) ? "active" : ""} onClick={() => setF((p) => ({ ...p, from: daysAgo(n), to: iso(new Date()) }))}>
              {n} dias
            </button>
          ))}
        </div>
        <div className="dash-dates">
          <input type="date" value={f.from} max={f.to} onChange={set("from")} />
          <span>até</span>
          <input type="date" value={f.to} min={f.from} onChange={set("to")} />
        </div>
        <div className="dash-selects">
          <label className={`dash-pill ${f.departmentId ? "on" : ""}`}><span>Setor</span>
            <select value={f.departmentId} onChange={set("departmentId")}><option value="">Todos</option>{opts.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </label>
          <label className={`dash-pill ${f.agentId ? "on" : ""}`}><span>Atendente</span>
            <select value={f.agentId} onChange={set("agentId")}><option value="">Todos</option>{opts.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </label>
          <label className={`dash-pill ${f.channelId ? "on" : ""}`}><span>Canal</span>
            <select value={f.channelId} onChange={set("channelId")}><option value="">Todos</option>{opts.channels.map((c) => <option key={c.id} value={c.id}>{c.name || c.platform}</option>)}</select>
          </label>
        </div>
      </div>

      {error && <div className="admin-feedback error">{error}</div>}

      <div className="kpi-grid">
        {[
          [MessageCircle, "Atendimentos", t?.conversations ?? "—", `${t?.inMsgs ?? 0} msgs recebidas · ${t?.outMsgs ?? 0} enviadas`],
          [CheckCircle2, "Encerrados", t?.resolved ?? "—", `${t?.open ?? 0} em aberto`],
          [Timer, "1ª resposta (média)", dur(t?.frt), `Duração média: ${dur(t?.aht)}`],
          [Star, "Satisfação", t?.csat != null ? `${t.csat} / 5` : "—", `${t?.csatCount ?? 0} avaliação(ões)`]
        ].map(([Icon, label, value, sub]) => (
          <div className="kpi-card" key={label}>
            <div className="kpi-card-top"><div className="kpi-label">{label}</div><Icon size={18} color="#0071e3" /></div>
            <div className="kpi-value">{loading ? "…" : value}</div>
            <div className="kpi-sub">{sub}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Atendimentos por dia</div>
        <div className="rep-bars">
          {(data?.byDay || []).map((d) => (
            <div key={d.day} className="rep-bar" title={`${d.day.split("-").reverse().join("/")}: ${d.count}`}>
              <span style={{ height: `${(d.count / maxDay) * 100}%` }} />
              <small>{d.day.slice(8)}</small>
            </div>
          ))}
          {!data?.byDay?.length && <div className="cv-muted">Sem atendimentos no período.</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="gestao-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="dash-presets">
            {TABS.map((x) => <button key={x.key} className={tab === x.key ? "active" : ""} onClick={() => setTab(x.key)}>{x.label}</button>)}
          </div>
          <button className="pill-btn" onClick={exportCsv} disabled={!rows.length}><Download size={14} /> Exportar (Excel/CSV)</button>
        </div>
        <div className="rep-table-wrap">
          <table className="rep-table">
            <thead>
              <tr>
                <th>{TABS.find((x) => x.key === tab).label.replace("Por ", "")}</th>
                <th>Atendimentos</th><th>Encerrados</th><th>Em aberto</th><th>Recebidas</th><th>Enviadas</th><th>1ª resposta</th><th>Duração</th><th>Satisfação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td><strong>{r.name}</strong></td><td>{r.conversations}</td><td>{r.resolved}</td><td>{r.open}</td>
                  <td>{r.inMsgs}</td><td>{r.outMsgs}</td><td>{dur(r.frt)}</td><td>{dur(r.aht)}</td>
                  <td>{r.csat != null ? `${r.csat} ★ (${r.csatCount})` : "—"}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={9} className="cv-muted">Nada no período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
