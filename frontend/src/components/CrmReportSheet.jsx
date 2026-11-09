import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { X, Download, Filter, Columns3, LayoutList, RotateCcw } from "lucide-react";
import { crm } from "../api.js";
import { notify } from "../dialogs.js";

const errText = (e) => e?.response?.data?.error || e.message;
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toDate = (v) => (v ? new Date(String(v).length === 10 ? `${v}T12:00:00` : v) : null);
const ymd = (d) => d.toISOString().slice(0, 10);
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const ahead = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const monthStart = (off = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return ymd(d); };
const monthEnd = (off = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off + 1); d.setDate(0); return ymd(d); };

/** Colunas fixas: [chave, título, grupo, ligada por padrão] */
const BASE_COLS = [
  ["cliente", "Cliente / Segurado", "Cliente", true],
  ["documento", "CPF/CNPJ", "Cliente", true],
  ["tipoDoc", "Tipo de pessoa", "Cliente", false],
  ["empresa", "Empresa", "Cliente", true],
  ["telefone", "Telefone", "Cliente", true],
  ["email", "E-mail", "Cliente", true],
  ["pipeline", "Funil (tipo de seguro)", "Negócio", true],
  ["stage", "Etapa", "Negócio", true],
  ["situacao", "Situação", "Negócio", true],
  ["motivoPerda", "Motivo da perda", "Negócio", true],
  ["valor", "Valor", "Negócio", true],
  ["produtos", "Produtos", "Negócio", true],
  ["responsavel", "Responsável", "Negócio", true],
  ["origem", "Origem", "Negócio", true],
  ["etiquetas", "Etiquetas", "Negócio", true],
  ["observacoes", "Observações", "Negócio", false],
  ["anotacoes", "Qtd. de anotações", "Negócio", false],
  ["ultimaAnotacao", "Última anotação", "Negócio", false],
  ["criadoEm", "Criado em", "Datas", true],
  ["fechadoEm", "Ganho/perdido em", "Datas", true],
  ["previsao", "Previsão de fechamento", "Datas", false],
  ["mudouEtapaEm", "Entrou na etapa em", "Datas", false],
  ["ultimaInteracao", "Última interação", "Datas", false],
  ["diasNoFunil", "Dias no funil", "Datas", false],
  ["arquivado", "Arquivado", "Negócio", false]
];
const DATE_KEYS = ["criadoEm", "fechadoEm", "previsao", "mudouEtapaEm", "ultimaInteracao"];
const PERIODS = [
  ["", "Todo o período"], ["hoje", "Hoje"], ["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["mes", "Este mês"], ["mesant", "Mês passado"],
  ["90", "Últimos 90 dias"], ["ano", "Este ano"], ["prox30", "Próximos 30 dias"], ["prox60", "Próximos 60 dias"], ["custom", "Personalizado"]
];
const periodRange = (k, from, to) => ({
  hoje: [ymd(new Date()), ymd(new Date())], 7: [ago(7), ymd(new Date())], 30: [ago(30), ymd(new Date())], 90: [ago(90), ymd(new Date())],
  mes: [monthStart(), monthEnd()], mesant: [monthStart(-1), monthEnd(-1)], ano: [`${new Date().getFullYear()}-01-01`, `${new Date().getFullYear()}-12-31`],
  prox30: [ymd(new Date()), ahead(30)], prox60: [ymd(new Date()), ahead(60)], custom: [from, to]
}[k] || [null, null]);
const GROUPS = [["", "Sem resumo"], ["pipeline", "Funil"], ["stage", "Etapa"], ["situacao", "Situação"], ["responsavel", "Responsável"], ["origem", "Origem"], ["mes", "Mês de criação"], ["motivoPerda", "Motivo da perda"]];

/** Relatório do CRM em Excel, com filtros, colunas escolhidas e aba de resumo. */
export default function CrmReportSheet({ pipelineId, team = [], onClose }) {
  const [data, setData] = useState(null);
  const [f, setF] = useState({ pipelineId: pipelineId || "", stages: [], outcomes: [], owner: "", source: "", tag: "", dateBy: "criadoEm", period: "", from: "", to: "", min: "", max: "", archived: false, q: "" });
  const [cols, setCols] = useState(() => new Set(BASE_COLS.filter((c) => c[3]).map((c) => c[0])));
  const [custom, setCustom] = useState(null); // Set de rótulos de campos personalizados
  const [layout, setLayout] = useState({ perPipeline: true, summary: "responsavel", totals: true });
  const [tab, setTab] = useState("filtros");
  const [busy, setBusy] = useState(false);
  useEffect(() => { crm.report().then((d) => { setData(d); setCustom(new Set(d.pipelines.flatMap((p) => p.fields.map((x) => x.label)))); }).catch((e) => { notify(errText(e), "error"); onClose(); }); }, []);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggleIn = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));

  const pipe = data?.pipelines.find((p) => p.id === f.pipelineId);
  const fieldLabels = useMemo(() => (data ? [...new Set((pipe ? [pipe] : data.pipelines).flatMap((p) => p.fields.map((x) => x.label)))] : []), [data, pipe]);
  const dateFieldLabels = useMemo(() => (data ? [...new Set((pipe ? [pipe] : data.pipelines).flatMap((p) => p.fields.filter((x) => x.type === "date").map((x) => x.label)))] : []), [data, pipe]);
  const sources = useMemo(() => [...new Set((data?.rows || []).map((r) => r.origem).filter(Boolean))].sort(), [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const [a, b] = periodRange(f.period, f.from, f.to);
    const q = f.q.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (f.pipelineId && r.pipelineId !== f.pipelineId) return false;
      if (!f.archived && r.arquivado) return false;
      if (f.stages.length && !f.stages.includes(r.stageId)) return false;
      if (f.outcomes.length && !f.outcomes.includes(r.outcome)) return false;
      if (f.owner && (f.owner === "_none" ? r.ownerId : r.ownerId !== f.owner)) return false;
      if (f.source && r.origem !== f.source) return false;
      if (f.tag && !r.tagIds.includes(f.tag)) return false;
      if (f.min !== "" && !(Number(r.valor) >= Number(f.min))) return false;
      if (f.max !== "" && !(Number(r.valor) <= Number(f.max))) return false;
      if (q && !`${r.cliente} ${r.documento} ${r.telefone} ${r.email} ${r.empresa}`.toLowerCase().includes(q)) return false;
      if (a || b) {
        const raw = f.dateBy.startsWith("campo:") ? r.datas[f.dateBy.slice(6)] : r[f.dateBy];
        if (!raw) return false;
        const d = String(raw).slice(0, 10);
        if (a && d < a) return false;
        if (b && d > b) return false;
      }
      return true;
    });
  }, [data, f]);
  const total = rows.reduce((t, r) => t + (r.valor || 0), 0);
  const won = rows.filter((r) => r.outcome === "won");

  const go = () => {
    if (!rows.length) return notify("Nenhum negócio com esses filtros.", "error");
    setBusy(true);
    try {
      const chosen = BASE_COLS.filter((c) => cols.has(c[0]));
      const line = (r, labels) => {
        const o = {};
        for (const [k, t] of chosen) {
          let v = k === "diasNoFunil" ? Math.max(0, Math.round(((r.fechadoEm ? new Date(r.fechadoEm) : new Date()) - new Date(r.criadoEm)) / 86400000)) : r[k];
          if (DATE_KEYS.includes(k)) v = v ? toDate(v) : "";
          if (k === "arquivado") v = v ? "Sim" : "";
          o[t] = v ?? "";
        }
        for (const l of labels) if (custom.has(l)) o[l] = r.campos?.[l] ?? "";
        return o;
      };
      const wb = XLSX.utils.book_new();
      const used = new Set();
      const put = (name, list, labels) => {
        const body = list.map((r) => line(r, labels));
        if (layout.totals && cols.has("valor")) body.push({ [chosen[0]?.[1] || "Cliente / Segurado"]: `TOTAL (${list.length} negócios)`, Valor: list.reduce((t, r) => t + (r.valor || 0), 0) });
        const ws = XLSX.utils.json_to_sheet(body, { cellDates: true });
        const keys = Object.keys(body[0] || {});
        ws["!cols"] = keys.map((k) => ({ wch: Math.min(45, Math.max(11, k.length + 2, ...body.slice(0, 300).map((d) => (d[k] instanceof Date ? 10 : String(d[k] ?? "").length)))) }));
        const range = XLSX.utils.decode_range(ws["!ref"]);
        for (let C = range.s.c; C <= range.e.c; C++) {
          const head = keys[C];
          for (let R = 1; R <= range.e.r; R++) {
            const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
            if (!cell) continue;
            if (cell.t === "d") cell.z = "dd/mm/yyyy";
            else if (cell.t === "n" && (head === "Valor" || /valor|pr[eê]mio|comiss|parcela|franquia|import[aâ]ncia/i.test(head))) cell.z = '"R$" #,##0.00';
          }
        }
        ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, range.e.r - (layout.totals ? 1 : 0)), c: range.e.c } }) };
        let n = String(name).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Planilha", i = 2;
        while (used.has(n)) n = `${String(name).slice(0, 27)} ${i++}`;
        used.add(n);
        XLSX.utils.book_append_sheet(wb, ws, n);
      };
      if (layout.summary) {
        const key = (r) => (layout.summary === "mes" ? String(r.criadoEm).slice(0, 7).split("-").reverse().join("/") : r[layout.summary] || "(sem informação)");
        const g = new Map();
        for (const r of rows) {
          const k = key(r);
          const x = g.get(k) || { n: 0, open: 0, won: 0, lost: 0, v: 0, vw: 0 };
          x.n++; x.v += r.valor || 0; x[r.outcome === "won" ? "won" : r.outcome === "lost" ? "lost" : "open"]++; if (r.outcome === "won") x.vw += r.valor || 0;
          g.set(k, x);
        }
        const title = GROUPS.find((x) => x[0] === layout.summary)[1];
        const sum = [...g.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, x]) => ({
          [title]: k, "Negócios": x.n, "Em andamento": x.open, "Ganhos": x.won, "Perdidos": x.lost,
          "Conversão": x.won + x.lost ? x.won / (x.won + x.lost) : 0, "Valor total": x.v, "Valor ganho": x.vw, "Ticket médio": x.n ? x.v / x.n : 0
        }));
        const all = { n: rows.length, won: won.length, lost: rows.filter((r) => r.outcome === "lost").length };
        sum.push({ [title]: "TOTAL", "Negócios": all.n, "Em andamento": all.n - all.won - all.lost, "Ganhos": all.won, "Perdidos": all.lost, "Conversão": all.won + all.lost ? all.won / (all.won + all.lost) : 0, "Valor total": total, "Valor ganho": won.reduce((t, r) => t + (r.valor || 0), 0), "Ticket médio": all.n ? total / all.n : 0 });
        const ws = XLSX.utils.json_to_sheet(sum);
        ws["!cols"] = [{ wch: 28 }, ...Array(8).fill({ wch: 15 })];
        const rg = XLSX.utils.decode_range(ws["!ref"]);
        for (let R = 1; R <= rg.e.r; R++) {
          const c5 = ws[XLSX.utils.encode_cell({ r: R, c: 5 })]; if (c5) c5.z = "0%";
          for (const C of [6, 7, 8]) { const c = ws[XLSX.utils.encode_cell({ r: R, c: C })]; if (c) c.z = '"R$" #,##0.00'; }
        }
        used.add("Resumo");
        XLSX.utils.book_append_sheet(wb, ws, "Resumo");
      }
      const pipesIn = data.pipelines.filter((p) => rows.some((r) => r.pipelineId === p.id));
      if (!layout.perPipeline || pipesIn.length === 1) put(pipesIn.length === 1 ? pipesIn[0].name : "Negócios", rows, fieldLabels);
      else {
        put("Todos", rows, fieldLabels);
        for (const p of pipesIn) put(p.name, rows.filter((r) => r.pipelineId === p.id), p.fields.map((x) => x.label));
      }
      XLSX.writeFile(wb, `Relatório CRM ${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`, { cellDates: true });
      notify("Relatório baixado.", "success");
    } catch (e) { notify(`Não foi possível gerar a planilha: ${e.message}`, "error"); }
    setBusy(false);
  };

  const reset = () => setF({ pipelineId: "", stages: [], outcomes: [], owner: "", source: "", tag: "", dateBy: "criadoEm", period: "", from: "", to: "", min: "", max: "", archived: false, q: "" });
  const groups = ["Cliente", "Negócio", "Datas"];
  return createPortal(
    <div className="lp-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rp">
        <header className="rp-head">
          <div><h2>Relatório do CRM</h2><small>Escolha os filtros e as colunas. A planilha sai com uma aba de resumo e uma aba por funil.</small></div>
          <button className="lp-icon" onClick={onClose}><X size={18} /></button>
        </header>
        <nav className="rp-tabs">
          <button className={tab === "filtros" ? "on" : ""} onClick={() => setTab("filtros")}><Filter size={15} /> Filtros</button>
          <button className={tab === "colunas" ? "on" : ""} onClick={() => setTab("colunas")}><Columns3 size={15} /> Colunas</button>
          <button className={tab === "formato" ? "on" : ""} onClick={() => setTab("formato")}><LayoutList size={15} /> Formato</button>
        </nav>
        <div className="rp-body">
          {!data && <div className="ap-empty">Carregando os dados do CRM…</div>}
          {data && tab === "filtros" && (
            <div className="rp-grid">
              <label><span>Funil (tipo de seguro)</span>
                <select value={f.pipelineId} onChange={(e) => setF((x) => ({ ...x, pipelineId: e.target.value, stages: [] }))}>
                  <option value="">Todos os funis</option>{data.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></label>
              <label><span>Responsável</span>
                <select value={f.owner} onChange={(e) => set("owner", e.target.value)}>
                  <option value="">Todos</option><option value="_none">Sem responsável</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                </select></label>
              <div className="rp-full"><span>Situação</span><div className="rp-chips">
                {[["open", "Em andamento"], ["won", "Ganhos"], ["lost", "Perdidos"]].map(([k, l]) => <button key={k} className={f.outcomes.includes(k) ? "on" : ""} onClick={() => toggleIn("outcomes", k)}>{l}</button>)}
              </div></div>
              {pipe && <div className="rp-full"><span>Etapas</span><div className="rp-chips">
                {pipe.stages.map((s) => <button key={s.id} className={f.stages.includes(s.id) ? "on" : ""} onClick={() => toggleIn("stages", s.id)}>{s.name}</button>)}
              </div></div>}
              <label><span>Filtrar pela data de</span>
                <select value={f.dateBy} onChange={(e) => set("dateBy", e.target.value)}>
                  <option value="criadoEm">Criação do negócio</option><option value="fechadoEm">Ganho/perda</option><option value="previsao">Previsão de fechamento</option>
                  <option value="mudouEtapaEm">Entrada na etapa</option><option value="ultimaInteracao">Última interação</option>
                  {dateFieldLabels.map((l) => <option key={l} value={`campo:${l}`}>{l}</option>)}
                </select></label>
              <label><span>Período</span>
                <select value={f.period} onChange={(e) => set("period", e.target.value)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              {f.period === "custom" && <><label><span>De</span><input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} /></label>
                <label><span>Até</span><input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} /></label></>}
              <label><span>Valor mínimo</span><input inputMode="decimal" placeholder="R$ 0" value={f.min} onChange={(e) => set("min", e.target.value.replace(",", "."))} /></label>
              <label><span>Valor máximo</span><input inputMode="decimal" placeholder="Sem limite" value={f.max} onChange={(e) => set("max", e.target.value.replace(",", "."))} /></label>
              <label><span>Origem</span>
                <select value={f.source} onChange={(e) => set("source", e.target.value)}><option value="">Todas</option>{sources.map((s) => <option key={s}>{s}</option>)}</select></label>
              <label><span>Etiqueta</span>
                <select value={f.tag} onChange={(e) => set("tag", e.target.value)}><option value="">Todas</option>{data.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label className="rp-full"><span>Cliente específico</span><input placeholder="Nome, CPF/CNPJ, telefone ou e-mail" value={f.q} onChange={(e) => set("q", e.target.value)} /></label>
              <label className="rp-check rp-full"><input type="checkbox" checked={f.archived} onChange={(e) => set("archived", e.target.checked)} /> Incluir cards arquivados</label>
            </div>
          )}
          {data && tab === "colunas" && (
            <div className="rp-cols">
              {groups.map((g) => (
                <div key={g}>
                  <h4>{g}<button onClick={() => setCols((s) => { const n = new Set(s); const ks = BASE_COLS.filter((c) => c[2] === g).map((c) => c[0]); const all = ks.every((k) => n.has(k)); ks.forEach((k) => (all ? n.delete(k) : n.add(k))); return n; })}>marcar/desmarcar</button></h4>
                  {BASE_COLS.filter((c) => c[2] === g).map(([k, l]) => <label key={k} className="rp-check"><input type="checkbox" checked={cols.has(k)} onChange={() => setCols((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })} /> {l}</label>)}
                </div>
              ))}
              <div>
                <h4>Campos do funil<button onClick={() => setCustom((s) => (fieldLabels.every((l) => s.has(l)) ? new Set() : new Set(fieldLabels)))}>marcar/desmarcar</button></h4>
                {fieldLabels.map((l) => <label key={l} className="rp-check"><input type="checkbox" checked={custom.has(l)} onChange={() => setCustom((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n; })} /> {l}</label>)}
                {!fieldLabels.length && <small style={{ color: "#8e8e93" }}>Nenhum campo personalizado.</small>}
              </div>
            </div>
          )}
          {data && tab === "formato" && (
            <div className="rp-grid">
              <label><span>Aba de resumo agrupada por</span>
                <select value={layout.summary} onChange={(e) => setLayout({ ...layout, summary: e.target.value })}>{GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <div />
              <label className="rp-check rp-full"><input type="checkbox" checked={layout.perPipeline} onChange={(e) => setLayout({ ...layout, perPipeline: e.target.checked })} /> Uma aba para cada funil (além da aba Todos)</label>
              <label className="rp-check rp-full"><input type="checkbox" checked={layout.totals} onChange={(e) => setLayout({ ...layout, totals: e.target.checked })} /> Linha de total no fim de cada aba</label>
              <p className="rp-note rp-full">O resumo traz, para cada grupo: negócios, em andamento, ganhos, perdidos, taxa de conversão, valor total, valor ganho e ticket médio. Datas e valores saem formatados, com filtro em cada coluna.</p>
            </div>
          )}
        </div>
        <footer className="rp-foot">
          <div className="rp-sum">
            <span><b>{rows.length}</b> negócios</span><span><b>{won.length}</b> ganhos</span><span><b>{brl(total)}</b> no total</span>
          </div>
          <button className="lp-btn" onClick={reset}><RotateCcw size={14} /> Limpar</button>
          <button className="lp-btn primary" disabled={busy || !data} onClick={go}><Download size={15} /> {busy ? "Gerando…" : "Baixar Excel"}</button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
