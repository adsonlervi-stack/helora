import React, { useEffect, useMemo, useState } from "react";
import { Download, Users, Trophy, ThumbsDown, Percent, Wallet } from "lucide-react";
import { crm } from "../api.js";

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const WON = /ganh|fechad|vend|emitid|conclu|won/i;
const LOST = /perd|lost|cancel|recus/i;

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
function download(name, rows) {
  const blob = new Blob(["﻿" + rows.map((l) => l.map(csvCell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

/** Relatórios do CRM: por etapa, responsável, origem, produto, seguradora e mês, com exportação. */
export default function CrmReports() {
  const [pipes, setPipes] = useState([]);
  const [leads, setLeads] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({ pipelineId: "", from: daysAgo(90), to: iso(new Date()), owner: "", situ: "" });
  const [tab, setTab] = useState("stage");

  useEffect(() => { crm.pipelines().then((l) => setPipes(l || [])).catch(() => {}); }, []);
  useEffect(() => {
    setLeads(null);
    crm.leads({ include: "all", ...(f.pipelineId ? { pipelineId: f.pipelineId } : {}) })
      .then(setLeads).catch((e) => { setErr(e?.response?.data?.error || e.message); setLeads([]); });
  }, [f.pipelineId]);

  const pipeById = useMemo(() => new Map(pipes.map((p) => [p.id, p])), [pipes]);
  const stageOf = (l) => (pipeById.get(l.pipelineId)?.stages || []).find((s) => s.id === l.stage);
  const outcome = (l) => {
    if (l.outcome === "won" || l.outcome === "lost") return l.outcome;
    const n = stageOf(l)?.name || "";
    return WON.test(n) ? "won" : LOST.test(n) ? "lost" : "open";
  };
  const fieldVal = (l, re) => {
    const fd = (pipeById.get(l.pipelineId)?.fields || []).find((x) => re.test(x.label || ""));
    return fd ? String(l.custom?.[fd.id] || "").trim() : "";
  };

  const list = useMemo(() => (leads || []).filter((l) => {
    const d = String(l.createdAt || "").slice(0, 10);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (f.owner && (l.ownerName || "Sem responsável") !== f.owner) return false;
    if (f.situ === "archived" && !l.archivedAt) return false;
    if (f.situ === "snoozed" && !l.snoozeUntil) return false;
    if (f.situ === "active" && (l.archivedAt || l.snoozeUntil)) return false;
    return true;
  }), [leads, f]);

  const owners = useMemo(() => [...new Set((leads || []).map((l) => l.ownerName || "Sem responsável"))].sort(), [leads]);
  const won = list.filter((l) => outcome(l) === "won");
  const lost = list.filter((l) => outcome(l) === "lost");
  const closed = won.length + lost.length;

  const GROUPS = {
    stage: { label: "Etapa", key: (l) => `${pipes.length > 1 && !f.pipelineId ? `${pipeById.get(l.pipelineId)?.name || "?"} › ` : ""}${stageOf(l)?.name || l.stage || "—"}` },
    owner: { label: "Responsável", key: (l) => l.ownerName || "Sem responsável" },
    source: { label: "Origem", key: (l) => l.source || "Não informada" },
    product: { label: "Produto", key: (l) => (l.products?.length ? l.products.map((p) => p.name) : [fieldVal(l, /produto|tipo de seguro|tp seguro|ramo/i) || "Sem produto"]) },
    insurer: { label: "Seguradora", key: (l) => fieldVal(l, /seguradora|cia\b|companhia/i) || "Não informada" },
    month: { label: "Mês", key: (l) => String(l.createdAt || "").slice(0, 7).split("-").reverse().join("/") }
  };

  const rows = useMemo(() => {
    const g = GROUPS[tab];
    const m = new Map();
    for (const l of list) {
      const keys = [].concat(g.key(l));
      for (const k of keys) {
        const r = m.get(k) || { name: k, total: 0, won: 0, lost: 0, open: 0, value: 0, wonValue: 0 };
        const o = outcome(l);
        r.total++; r[o]++; r.value += Number(l.value) || 0;
        if (o === "won") r.wonValue += Number(l.value) || 0;
        m.set(k, r);
      }
    }
    const out = [...m.values()];
    return tab === "month" ? out.sort((a, b) => a.name.split("/").reverse().join().localeCompare(b.name.split("/").reverse().join())) : out.sort((a, b) => b.total - a.total);
  }, [list, tab, pipes]);
  const max = Math.max(1, ...rows.map((r) => r.total));

  const exportGroup = () => download(`crm-por-${GROUPS[tab].label.toLowerCase()}-${f.from}-a-${f.to}.csv`, [
    [GROUPS[tab].label, "Leads", "Ganhos", "Perdidos", "Em andamento", "Conversão %", "Valor total", "Valor ganho"],
    ...rows.map((r) => [r.name, r.total, r.won, r.lost, r.open, r.won + r.lost ? Math.round((r.won / (r.won + r.lost)) * 100) : "", r.value, r.wonValue])
  ]);
  const exportAll = () => {
    const extra = [...new Set(list.flatMap((l) => (pipeById.get(l.pipelineId)?.fields || []).map((fd) => fd.label)))];
    download(`crm-leads-${f.from}-a-${f.to}.csv`, [
      ["Nome", "Empresa", "Telefone", "E-mail", "Funil", "Etapa", "Situação", "Resultado", "Responsável", "Origem", "Produtos", "Valor", "Criado em", ...extra],
      ...list.map((l) => {
        const p = pipeById.get(l.pipelineId);
        const o = outcome(l);
        return [l.name, l.company, l.phone, l.email, p?.name, stageOf(l)?.name || l.stage, l.archivedAt ? "Arquivado" : l.snoozeUntil ? "Reagendado" : "No funil",
          o === "won" ? "Ganho" : o === "lost" ? "Perdido" : "Em andamento", l.ownerName, l.source, (l.products || []).map((x) => x.name).join(", "), l.value ?? "",
          new Date(l.createdAt).toLocaleDateString("pt-BR"),
          ...extra.map((lab) => { const fd = (p?.fields || []).find((x) => x.label === lab); return fd ? l.custom?.[fd.id] ?? "" : ""; })];
      })
    ]);
  };

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div>
      <div className="dash-filters">
        <div className="dash-presets">
          {[30, 90, 365].map((n) => (
            <button key={n} className={f.from === daysAgo(n) && f.to === iso(new Date()) ? "active" : ""} onClick={() => setF((p) => ({ ...p, from: daysAgo(n), to: iso(new Date()) }))}>{n === 365 ? "12 meses" : `${n} dias`}</button>
          ))}
        </div>
        <div className="dash-dates">
          <input type="date" value={f.from} max={f.to} onChange={set("from")} />
          <span>até</span>
          <input type="date" value={f.to} min={f.from} onChange={set("to")} />
        </div>
        <div className="dash-selects">
          <label className={`dash-pill ${f.pipelineId ? "on" : ""}`}><span>Funil</span>
            <select value={f.pipelineId} onChange={set("pipelineId")}><option value="">Todos</option>{pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          <label className={`dash-pill ${f.owner ? "on" : ""}`}><span>Responsável</span>
            <select value={f.owner} onChange={set("owner")}><option value="">Todos</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
          </label>
          <label className={`dash-pill ${f.situ ? "on" : ""}`}><span>Situação</span>
            <select value={f.situ} onChange={set("situ")}><option value="">Todas</option><option value="active">No funil</option><option value="snoozed">Reagendados</option><option value="archived">Arquivados</option></select>
          </label>
        </div>
      </div>
      {err && <div className="admin-feedback error">{err}</div>}

      <div className="kpi-grid">
        {[
          [Users, "Leads", list.length, `${list.filter((l) => !l.archivedAt && !l.snoozeUntil).length} no funil agora`],
          [Trophy, "Ganhos", won.length, brl(won.reduce((s, l) => s + (Number(l.value) || 0), 0))],
          [ThumbsDown, "Perdidos", lost.length, `${list.length - closed} em andamento`],
          [Percent, "Conversão", closed ? `${Math.round((won.length / closed) * 100)}%` : "—", "ganhos ÷ fechados"],
          [Wallet, "Valor em aberto", brl(list.filter((l) => outcome(l) === "open").reduce((s, l) => s + (Number(l.value) || 0), 0)), "soma dos cards em andamento"]
        ].map(([Icon, label, value, sub]) => (
          <div className="kpi-card" key={label}>
            <div className="kpi-card-top"><div className="kpi-label">{label}</div><Icon size={18} color="#0071e3" /></div>
            <div className="kpi-value">{leads ? value : "…"}</div>
            <div className="kpi-sub">{sub}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="gestao-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="dash-presets">
            {Object.entries(GROUPS).map(([k, g]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>Por {g.label.toLowerCase()}</button>)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="pill-btn" onClick={exportGroup} disabled={!rows.length}><Download size={14} /> Exportar tabela</button>
            <button className="pill-btn primary" onClick={exportAll} disabled={!list.length}><Download size={14} /> Exportar todos os leads</button>
          </div>
        </div>
        <div className="rep-table-wrap">
          <table className="rep-table">
            <thead><tr><th>{GROUPS[tab].label}</th><th>Leads</th><th style={{ width: "22%" }}></th><th>Ganhos</th><th>Perdidos</th><th>Andamento</th><th>Conversão</th><th>Valor ganho</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td><strong>{r.name}</strong></td><td>{r.total}</td>
                  <td><div className="db-ch-bar"><span style={{ width: `${(r.total / max) * 100}%` }} /></div></td>
                  <td>{r.won}</td><td>{r.lost}</td><td>{r.open}</td>
                  <td>{r.won + r.lost ? `${Math.round((r.won / (r.won + r.lost)) * 100)}%` : "—"}</td><td>{brl(r.wonValue)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="cv-muted">{leads ? "Nada no período." : "Carregando…"}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
