import { askConfirm, askPrompt, notify } from "../dialogs.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, Phone, MessageCircle, Bell, Timer, Briefcase, Clock, Upload, Download, Trash2, Pencil,
  ChevronLeft, ChevronRight, CalendarDays, Check, Tag, Package, Users, KanbanSquare, Settings2,
  Paperclip, CheckSquare, Zap, FileText, X, ExternalLink, ListChecks, MoreVertical, CheckCircle2, AlertTriangle, RefreshCw, SlidersHorizontal, GripVertical, ArrowUp, ArrowDown
} from "lucide-react";
import { crm, getTeam, getDepartments, googleStatusApi, googleAuthUrlApi, googleDisconnectApi } from "../api.js";
import { Sheet, Group, Row, Switch, Button } from "./ui.jsx";
import CrmLeadPage from "./CrmLeadPage.jsx";
import AutomationsSheet from "./CrmAutomations.jsx";
import { SelectField, ProductOptions, makeAddOption, DocumentField, applyCnpjData, runAfterClose } from "./CrmFieldBits.jsx";
import { SEGURADORAS, RAMOS, PRODUTO_OPTIONS } from "../insuranceLists.js";
import { createTaskApi } from "../api.js";

const COLORS = ["#0a84ff", "#5ac8fa", "#bf5af2", "#ff375f", "#ff9f0a", "#ffcc00", "#30d158", "#64d2ff", "#8e8e93", "#ac8e68"];
const brl = (v) => (v == null ? "R$ 0" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const errText = (e) => e?.response?.data?.error || e?.message || "Erro";
const fmtPhone = (p) => {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d ? `+${d}` : "";
};
function ago(iso) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}min`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} dia(s)`;
  if (s < 86400 * 365) return `${Math.round(s / 86400 / 30)} mês(es)`;
  return `${Math.round(s / 86400 / 365)} ano(s)`;
}
const KIND_BY_TEMPLATE = { seguros_renovacao: "Renovação", seguros_vendas: "Venda nova", seguros_sinistros: "Sinistro", seguros_saude: "Saúde", consorcio: "Consórcio", imobiliaria: "Imóvel", clinica: "Paciente" };
const fmtField = (f, v) => {
  if (v == null || v === "") return "—";
  if (f.type === "date") return String(v).split("-").reverse().join("/");
  if (f.type === "currency") return brl(Number(v));
  return String(v);
};
const daysUntil = (d) => { if (!d) return null; const t = new Date(`${d}T12:00:00`); return Math.round((t - new Date()) / 86400000); };
function DueBadge({ date }) {
  const n = daysUntil(date);
  if (n == null || isNaN(n)) return null;
  const cls = n < 0 ? "late" : n <= 15 ? "soon" : n <= 30 ? "near" : "ok";
  return <span className={`crm-due ${cls}`}>{n < 0 ? `Venceu há ${-n} dia${n === -1 ? "" : "s"}` : n === 0 ? "Vence hoje" : `Vence em ${n} dia${n === 1 ? "" : "s"}`}</span>;
}
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const TABS = [
  { key: "funnel", label: "Funil", icon: KanbanSquare },
  { key: "contacts", label: "Contatos", icon: Users },
  { key: "agenda", label: "Agenda", icon: CalendarDays },
  { key: "products", label: "Produtos", icon: Package },
  { key: "tags", label: "Tags", icon: Tag }
];

/** CRM: prospecção, qualificação e triagem de leads (independente do Pipeline de atendimento). */
export default function CrmPage({ profile, onOpenConversation }) {
  const isManager = profile?.role === "owner" || profile?.isSuperAdmin;
  const [tab, setTab] = useState("funnel");
  const [pipelines, setPipelines] = useState([]);
  const [pipelineId, setPipelineId] = useState(null);
  const [tags, setTags] = useState([]);
  const [products, setProducts] = useState([]);
  const [team, setTeam] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState(null);
  const [allMode, setAllMode] = useState(false);

  const loadPipelines = () =>
    crm.pipelines().then((l) => { setPipelines(l); setPipelineId((cur) => cur && l.some((p) => p.id === cur) ? cur : l[0]?.id); }).catch((e) => setError(errText(e)));
  const loadTags = () => crm.tags().then(setTags).catch(() => {});
  const loadProducts = () => crm.products().then(setProducts).catch(() => {});
  useEffect(() => {
    loadPipelines();
    loadTags();
    loadProducts();
    getTeam().then(setTeam).catch(() => {});
    getDepartments().then(setDepartments).catch(() => {});
  }, []);
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const ctx = { profile, isManager, pipelines, pipeline, pipelineId, setPipelineId, tags, products, team, departments, onOpenConversation, allMode, setAllMode, loadPipelines, loadTags, loadProducts, setPipelines };

  return (
    <div className="page crm-page">
      <div className="crm-tabs">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={15} /> {label}</button>
        ))}
      </div>
      {error && <div className="admin-feedback error">{error}</div>}
      {tab === "funnel" && <FunnelView ctx={ctx} />}
      {tab === "contacts" && <ContactsView ctx={ctx} />}
      {tab === "agenda" && <AgendaView ctx={ctx} />}
      {tab === "products" && <ProductsView ctx={ctx} />}
      {tab === "tags" && <TagsView ctx={ctx} />}
    </div>
  );
}

// ================================================================ Funil
function FunnelView({ ctx }) {
  const { pipelines, pipeline, pipelineId, setPipelineId, tags, isManager, loadPipelines } = ctx;
  const [leads, setLeads] = useState(null);
  const [search, setSearch] = useState("");
  const [flt, setFlt] = useState({ owner: "", tag: "", outcome: "", fields: {} });
  const [fltOpen, setFltOpen] = useState(false);
  const [view, setView] = useState("board"); // board | snoozed | archived
  const [side, setSide] = useState(null); // leads arquivados / reagendados
  const [exporting, setExporting] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [open, setOpen] = useState(null); // lead | {new:true, stage}
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const [editCol, setEditCol] = useState(null);
  const [newPipe, setNewPipe] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editFields, setEditFields] = useState(false);
  const modelFields = pipeline?.fields || [];
  const cardFields = modelFields.filter((f) => f.card).slice(0, 4);
  const kindField = modelFields.find((f) => f.kind);

  const all = !!ctx.allMode;
  const pipeById = useMemo(() => new Map(pipelines.map((p) => [p.id, p])), [pipelines]);
  const normName = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  // "Perdido" e "Perdidos", "Lead novo" e "Leads novos" viram a mesma coluna
  const colKey = (x) => normName(x).split(/\s+/).map((w) => (w.length > 3 ? w.replace(/s$/, "") : w)).join(" ");
  const load = () => (all ? crm.leads() : pipelineId ? crm.leads({ pipelineId }) : Promise.resolve([])).then(setLeads).catch(() => setLeads([]));
  const deletePipeline = async () => {
    const n = (leads || []).length;
    if (!(await askConfirm(`Apagar o funil "${pipeline.name}"?${n ? `\n\n${n} lead(s) deste funil também serão apagados.` : ""}\nEssa ação não pode ser desfeita.`, { okText: "Apagar funil", danger: true }))) return;
    try {
      for (const l of leads || []) await crm.deleteLead(l.id);
      await crm.deletePipeline(pipeline.id);
      setPipelineId(null);
      await loadPipelines();
      notify("Funil apagado.");
    } catch (e) { notify(errText(e), "error"); }
  };
  useEffect(() => { setLeads(null); load(); }, [pipelineId, all]);
  const loadSide = () => {
    if (view === "board") return setSide(null);
    setSide(null);
    const params = { ...(all || !pipelineId ? {} : { pipelineId }), ...(view === "archived" ? { archived: "1" } : { snoozed: "1" }) };
    crm.leads(params).then(setSide).catch(() => setSide([]));
  };
  useEffect(() => { loadSide(); }, [view, pipelineId, all]);

  // Em "todos os funis" as colunas com o mesmo nome viram uma só
  const stages = useMemo(() => {
    if (!all) return pipeline?.stages || [];
    // ordena pela posição da coluna em cada funil: as primeiras colunas de todos os funis ficam lado a lado
    const out = [];
    for (const p of pipelines) (p.stages || []).forEach((st, i) => {
      const key = colKey(st.name);
      const ex = out.find((x) => x.id === key);
      if (ex) ex.pos = Math.min(ex.pos, i);
      else out.push({ id: key, name: st.name, color: st.color, pos: i, seq: out.length });
    });
    return out.sort((a, b) => a.pos - b.pos || a.seq - b.seq);
  }, [all, pipeline, pipelines]);
  const colOf = (l) => (all ? colKey(pipeById.get(l.pipelineId)?.stages?.find((st) => st.id === l.stage)?.name || l.stage) : l.stage);
  const fieldsOf = (l) => (all ? pipeById.get(l.pipelineId)?.fields || [] : modelFields);
  const fltCount = (flt.owner ? 1 : 0) + (flt.tag ? 1 : 0) + (flt.outcome ? 1 : 0) + Object.values(flt.fields).filter(Boolean).length;
  const filtered = (leads || []).filter((l) => {
    const t = `${l.name} ${l.company || ""} ${l.phone || ""} ${l.email || ""} ${Object.values(l.custom || {}).join(" ")}`.toLowerCase();
    if (!t.includes(search.toLowerCase())) return false;
    if (flt.tag && !l.tagIds.includes(flt.tag)) return false;
    if (flt.owner && (flt.owner === "none" ? l.ownerId : l.ownerId !== flt.owner)) return false;
    if (flt.outcome && (flt.outcome === "open" ? l.outcome : l.outcome !== flt.outcome)) return false;
    for (const [k, v] of Object.entries(flt.fields)) if (v && String(l.custom?.[k] || "") !== v) return false;
    return true;
  });
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const move = async (id, col) => {
    const lead = leads.find((l) => l.id === id);
    let stage = col;
    if (all && lead) {
      const target = pipeById.get(lead.pipelineId)?.stages?.find((st) => colKey(st.name) === col);
      if (!target) return notify(`O funil "${pipeById.get(lead.pipelineId)?.name}" não tem a coluna "${stages.find((x) => x.id === col)?.name}".`, "error");
      stage = target.id;
    }
    if (!lead || lead.stage === stage) return;
    setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, stage, stageChangedAt: new Date().toISOString() } : l)));
    let saved = null;
    try { saved = await crm.updateLead(id, { stage }); } catch { return load(); }
    // Entrou em Fechado/Ganho ou Perdido: pergunta se arquiva ou reagenda
    if (saved?.outcome && saved.outcome !== lead.outcome) {
      const l = await runAfterClose(saved, saved.outcome);
      if (l && (l.archivedAt || l.snoozeUntil)) setLeads((cur) => cur.filter((x) => x.id !== id));
    }
  };
  const openConv = async (l) => {
    try {
      const r = await crm.openLeadConversation(l.id);
      ctx.onOpenConversation?.(r.conversationId);
    } catch (e) { notify(errText(e), "error"); }
  };
  const saveStages = async (next) => {
    try {
      await crm.updatePipeline(pipeline.id, { stages: next });
      loadPipelines();
    } catch (e) { alert(errText(e)); }
  };
  const saveCol = () => {
    const name = (editCol?.name || "").trim();
    if (!name) return;
    if (editCol.id) saveStages(stages.map((s) => (s.id === editCol.id ? { ...s, name, color: editCol.color, automations: editCol.automations || [] } : s)));
    else saveStages([...stages, { id: name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").slice(0, 24) + "_" + Date.now().toString(36).slice(-4), name, color: editCol.color, automations: editCol.automations || [] }]);
    setEditCol(null);
  };
  const moveCol = (id, dir) => {
    const i = stages.findIndex((s) => s.id === id), j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    saveStages(next);
  };
  const deleteCol = async (id) => {
    if ((leads || []).some((l) => l.stage === id)) return alert("Mova os leads desta coluna antes de excluir.");
    if (await askConfirm("Excluir esta coluna?")) saveStages(stages.filter((s) => s.id !== id));
  };

  return (
    <>
      <div className="crm-toolbar">
        <label className="crm-select">
          <span>Funil</span>
          <select value={all ? "__all" : pipelineId || ""} onChange={(e) => { const v = e.target.value; if (v === "__new") return setNewPipe(true); if (v === "__all") return ctx.setAllMode(true); ctx.setAllMode(false); setPipelineId(v); }}>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            {pipelines.length > 1 && <option value="__all">Todos os funis</option>}
            {isManager && <option value="__new">+ Novo funil…</option>}
          </select>
        </label>
        {isManager && !all && <Button variant="secondary" onClick={() => setEditCol({ name: "", color: COLORS[0] })}><Plus size={15} /> Coluna</Button>}
        {isManager && !all && pipeline && pipelines.length > 1 && <Button variant="secondary" title="Apagar este funil" onClick={deletePipeline}><Trash2 size={15} /></Button>}
        {isManager && !all && pipeline && <Button variant="secondary" onClick={() => setAutoOpen(true)}><Zap size={15} /> Automações{pipeline.automations?.filter((r) => r.active !== false).length ? ` (${pipeline.automations.filter((r) => r.active !== false).length})` : ""}</Button>}
        {isManager && !all && pipeline && <Button variant="secondary" onClick={() => setEditFields(true)}><SlidersHorizontal size={15} /> Campos{pipeline.fields?.length ? ` (${pipeline.fields.length})` : ""}</Button>}
        <div className="crm-search"><Search size={15} /><input placeholder="Buscar lead" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="crm-flt-wrap">
          <button type="button" className={`crm-flt-btn ${fltCount ? "on" : ""}`} onClick={() => setFltOpen((v) => !v)}>
            <SlidersHorizontal size={15} /> Filtros{fltCount ? ` · ${fltCount}` : ""}
          </button>
          {fltOpen && (
            <div className="crm-flt-pop" onMouseLeave={() => setFltOpen(false)}>
              <label><span>Responsável</span>
                <select value={flt.owner} onChange={(e) => setFlt((c) => ({ ...c, owner: e.target.value }))}>
                  <option value="">Todos</option><option value="none">Sem responsável</option>
                  {(ctx.team || []).map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                </select>
              </label>
              <label><span>Situação</span>
                <select value={flt.outcome} onChange={(e) => setFlt((c) => ({ ...c, outcome: e.target.value }))}>
                  <option value="">Todas</option><option value="open">Em andamento</option><option value="won">Ganhos</option><option value="lost">Perdidos</option>
                </select>
              </label>
              {tags.length > 0 && (
                <label><span>Tag</span>
                  <select value={flt.tag} onChange={(e) => setFlt((c) => ({ ...c, tag: e.target.value }))}>
                    <option value="">Todas</option>
                    {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              )}
              {!all && modelFields.filter((f) => f.type === "select").map((f) => {
                const vals = [...new Set((leads || []).map((l) => l.custom?.[f.id]).filter(Boolean))].sort();
                if (!vals.length) return null;
                return (
                  <label key={f.id}><span>{f.label}</span>
                    <select value={flt.fields[f.id] || ""} onChange={(e) => setFlt((c) => ({ ...c, fields: { ...c.fields, [f.id]: e.target.value } }))}>
                      <option value="">Todos</option>
                      {vals.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </label>
                );
              })}
              {fltCount > 0 && <button type="button" className="crm-flt-clear" onClick={() => setFlt({ owner: "", tag: "", outcome: "", fields: {} })}>Limpar filtros</button>}
            </div>
          )}
        </div>
        <div className="crm-views">
          {[["board", "Funil"], ["snoozed", "Reagendados"], ["archived", "Arquivados"]].map(([k, l]) => (
            <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {!all && <Button variant="secondary" onClick={() => setImporting(true)}><Upload size={15} /> Importar planilha</Button>}
        {isManager && <Button variant="secondary" onClick={() => setExporting(true)} title="Baixar o CRM com anexos, em pastas"><Download size={15} /> Baixar CRM</Button>}
        {!all && <Button onClick={() => setOpen({ isNew: true, stage: stages[0]?.id })}><Plus size={15} /> Novo lead</Button>}
      </div>

      {view !== "board" && (
        <div className="crm-side-list">
          {side === null && <div className="cv-muted" style={{ padding: 16 }}>Carregando…</div>}
          {side && !side.length && <div className="ap-empty">{view === "archived" ? "Nenhum card arquivado." : "Nenhum card reagendado."}</div>}
          {(side || []).filter((l) => `${l.name} ${l.company || ""} ${l.phone || ""}`.toLowerCase().includes(search.toLowerCase())).map((l) => {
            const p = pipeById.get(l.pipelineId);
            const st = p?.stages?.find((x) => x.id === l.stage);
            return (
              <div key={l.id} className="crm-side-row" onClick={() => setOpen(l)}>
                <span className="crm-side-av">{initials(l.name)}</span>
                <div className="crm-side-main">
                  <strong>{l.name}</strong>
                  <span>{[l.company, p?.name, st?.name, l.outcome === "won" ? "Ganho" : l.outcome === "lost" ? "Perdido" : null].filter(Boolean).join(" · ")}</span>
                </div>
                <span className="crm-side-date">{view === "archived" ? `Arquivado ${l.archivedAt ? new Date(l.archivedAt).toLocaleDateString("pt-BR") : ""}` : `Volta em ${l.snoozeUntil ? new Date(l.snoozeUntil).toLocaleDateString("pt-BR") : ""}`}</span>
                <button type="button" className="ap-btn" onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await crm.updateLead(l.id, view === "archived" ? { archived: false } : { snoozeUntil: null });
                    notify(view === "archived" ? "Card voltou para o funil." : "Card voltou para o funil agora.");
                    loadSide(); load();
                  } catch (err) { notify(errText(err), "error"); }
                }}>{view === "archived" ? "Desarquivar" : "Trazer agora"}</button>
              </div>
            );
          })}
        </div>
      )}
      <div className="crm-board" style={view !== "board" ? { display: "none" } : undefined}>
        {stages.map((st) => {
          const items = filtered.filter((l) => colOf(l) === st.id);
          return (
            <div key={st.id} className={`crm-col ${over === st.id ? "over" : ""}`} style={{ "--col-c": st.color || "#0071e3" }}
              onDragOver={(e) => { e.preventDefault(); setOver(st.id); }}
              onDragLeave={() => setOver((c) => (c === st.id ? null : c))}
              onDrop={(e) => { e.preventDefault(); setOver(null); dragId && move(dragId, st.id); setDragId(null); }}>
              <div className="crm-col-head">
                <span className="crm-dot" style={{ background: st.color }} />
                <strong title={st.name}>{st.name}</strong>
                {(st.automations || []).some((a) => a.active !== false) && <span className="crm-auto-ind" title="Esta coluna tem automações"><Zap size={12} /></span>}
                <span className="crm-count">{items.length}</span>
                {isManager && !all && (
                  <span className="crm-col-tools">
                    <button onClick={() => moveCol(st.id, -1)} title="Mover para a esquerda"><ChevronLeft size={13} /></button>
                    <button onClick={() => moveCol(st.id, 1)} title="Mover para a direita"><ChevronRight size={13} /></button>
                    <button onClick={() => setEditCol({ id: st.id, name: st.name, color: st.color, automations: st.automations || [] })} title="Editar"><Pencil size={12} /></button>
                    <button onClick={() => deleteCol(st.id)} title="Excluir"><Trash2 size={12} /></button>
                  </span>
                )}
              </div>
              <div className="crm-cards">
                {leads === null && <div className="crm-skel" />}
                {items.map((l) => (
                  <div key={l.id} className="crm-card cc" draggable onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)} onClick={() => setOpen(l)}>
                    {(() => {
                      const flds = fieldsOf(l);
                      const kf = flds.find((f) => f.kind);
                      const kind = kf && l.custom?.[kf.id];
                      const chipsF = flds.filter((f) => f.card && l.custom?.[f.id]).slice(0, 4);
                      const overdue = flds.some((f) => f.alert && l.custom?.[f.id] && daysUntil(l.custom[f.id]) < 0);
                      const tagsL = l.tagIds.map((id) => tagById.get(id)).filter(Boolean);
                      const done = (l.checklist || []).filter((c) => c.done).length;
                      return (
                        <>
                          <div className="cc-head">
                            <button type="button" className="cc-menu" title="Abrir" onClick={(e) => { e.stopPropagation(); setOpen(l); }}><MoreVertical size={15} /></button>
                            <span className="cc-avatar">{initials(l.name)}</span>
                            <div className="cc-id">
                              <strong title={l.name}>{l.name}</strong>
                              <span>{fmtPhone(l.phone) || l.company || l.email || "Sem contato"}</span>
                            </div>
                            <span className={`cc-value ${l.value ? "" : "empty"}`}>{l.value ? brl(l.value) : "+ Valor"}</span>
                          </div>
                          {(all || kind || chipsF.length > 0) && (
                            <div className="cc-chips">
                              {all && <span className="cc-chip pipe">{pipeById.get(l.pipelineId)?.name}</span>}
                              {kind && <span className="cc-chip kind">{/renova/i.test(kind) ? <RefreshCw size={10} /> : <Tag size={10} />} {kind}</span>}
                              {chipsF.map((f) => (
                                f.alert ? <DueBadge key={f.id} date={l.custom[f.id]} /> : <span key={f.id} className="cc-chip" title={f.label}>{fmtField(f, l.custom[f.id])}</span>
                              ))}
                            </div>
                          )}
                          <div className="cc-sep" />
                          <div className="cc-tags">
                            {tagsL.map((t) => <span key={t.id} className="cc-tag" style={{ "--c": t.color }}>{t.name}</span>)}
                            <button type="button" className="cc-tag-add" title="Tags" onClick={(e) => { e.stopPropagation(); setOpen(l); }}><Plus size={12} /></button>
                          </div>
                          <div className="cc-meta">
                            <span><Timer size={13} /> {ago(l.stageChangedAt)} na coluna</span>
                            {l.products.length > 0 && <span><Briefcase size={13} /> {l.products.length} produto{l.products.length > 1 ? "s" : ""}</span>}
                            <span><Clock size={13} /> Última interação há {ago(l.lastInteractionAt || l.createdAt)}</span>
                          </div>
                          <div className="cc-sep" />
                          <div className="cc-foot" onClick={(e) => e.stopPropagation()}>
                            <span className="cc-owner" title={l.ownerName || "Sem responsável"}>{l.ownerAvatar ? <img src={l.ownerAvatar} alt="" /> : initials(l.ownerName)}</span>
                            <button type="button" className="cc-ico" title="Abrir conversa" disabled={!l.phone} onClick={() => openConv(l)}><MessageCircle size={15} /></button>
                            {l.phone ? <a className="cc-ico" href={`tel:+${l.phone}`} title="Ligar"><Phone size={15} /></a> : <span className="cc-ico off"><Phone size={15} /></span>}
                            {l.attachments?.length > 0 && <span className="cc-ico" title="Anexos"><Paperclip size={14} /><small>{l.attachments.length}</small></span>}
                            <span className="cc-created">Criado há {ago(l.createdAt)}</span>
                            {l.checklist?.length > 0 && <span className={`cc-check ${done === l.checklist.length ? "ok" : ""}`} title="Checklist"><CheckCircle2 size={14} /> {done}/{l.checklist.length}</span>}
                            {overdue && <span className="cc-warn" title="Vigência vencida"><AlertTriangle size={13} /></span>}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
                {!all && <button className="crm-add" onClick={() => setOpen({ isNew: true, stage: st.id })}><Plus size={14} /> Adicionar</button>}
              </div>
            </div>
          );
        })}
      </div>

      {open && (open.isNew
        ? <LeadSheet ctx={ctx} lead={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />
        : <CrmLeadPage ctx={ctx} lead={open} onClose={() => { setOpen(null); load(); loadSide(); }} />)}
      {editCol && (
        <Sheet title={editCol.id ? "Editar coluna" : "Nova coluna"} subtitle="Automações rodam sempre que um card entra nesta coluna." onClose={() => setEditCol(null)} width={560}
          footer={<><Button variant="secondary" onClick={() => setEditCol(null)}>Cancelar</Button><Button onClick={saveCol}>Salvar</Button></>}>
          <Group><Row label="Nome"><input autoFocus value={editCol.name} onChange={(e) => setEditCol((c) => ({ ...c, name: e.target.value }))} placeholder="Ex: Qualificação" /></Row></Group>
          <Group title="Cor"><ColorPicker value={editCol.color} onChange={(c) => setEditCol((x) => ({ ...x, color: c }))} /></Group>
          <AutomationsEditor ctx={ctx} list={editCol.automations || []} onChange={(automations) => setEditCol((x) => ({ ...x, automations }))} />
        </Sheet>
      )}
      {importing && <ImportSheet ctx={ctx} onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); ctx.loadTags(); }} />}
      {autoOpen && pipeline && <AutomationsSheet pipeline={pipeline} pipelines={pipelines} tags={tags} team={ctx.team || []} departments={ctx.departments || []} onClose={() => setAutoOpen(false)} onSaved={() => { setAutoOpen(false); loadPipelines(); }} />}
      {exporting && <ExportSheet pipelines={pipelines} pipelineId={all ? "" : pipelineId} onClose={() => setExporting(false)} />}
      {editFields && <FieldsSheet pipeline={pipeline} onClose={() => setEditFields(false)} onSaved={() => { setEditFields(false); loadPipelines(); }} />}
      {newPipe && <NewPipelineSheet onClose={() => setNewPipe(false)} onCreated={(p) => { setNewPipe(false); loadPipelines().then(() => setPipelineId(p.id)); }} />}
    </>
  );
}

const AUTO_META = {
  message: { label: "Enviar mensagem no WhatsApp", hint: "Abre a conversa com o lead e manda o texto. Use {nome} e {empresa}." },
  task: { label: "Criar tarefa para o responsável", hint: "Aparece em Tarefas, com prazo." },
  followup: { label: "Agendar follow-up", hint: "Entra na Agenda do CRM às 10h do dia." },
  owner: { label: "Passar para outro responsável", hint: "Troca o dono do card automaticamente." }
};
function AutomationsEditor({ ctx, list, onChange }) {
  const upd = (id, patch) => onChange(list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const add = (type) => onChange([...list, { id: Math.random().toString(36).slice(2, 10), type, active: true, days: type === "followup" ? 2 : 1, text: type === "message" ? "Olá {nome}! " : undefined }]);
  return (
    <>
      <Group title="Automações" hint={list.length ? "Rodam na ordem, sempre que um card entra nesta coluna." : "Ex.: ao entrar em “Proposta”, mandar a mensagem e criar uma tarefa de retorno em 2 dias."}>
        {list.map((a) => (
          <div key={a.id} className="crm-auto">
            <div className="crm-auto-head">
              <span className="crm-auto-ico"><Zap size={13} /></span>
              <strong>{AUTO_META[a.type]?.label}</strong>
              <Switch checked={a.active !== false} onChange={(v) => upd(a.id, { active: v })} />
              <button type="button" className="fi-icon" onClick={() => onChange(list.filter((x) => x.id !== a.id))} title="Remover"><Trash2 size={14} /></button>
            </div>
            {a.type === "message" && (
              <>
                <textarea rows={3} value={a.text || ""} onChange={(e) => upd(a.id, { text: e.target.value })} placeholder="Olá {nome}! Recebemos seu pedido…" />
                {(ctx.departments || []).length > 0 && (
                  <select value={a.departmentId || ""} onChange={(e) => upd(a.id, { departmentId: e.target.value || undefined })}>
                    <option value="">Setor da conversa: manter</option>
                    {ctx.departments.map((d) => <option key={d.id} value={d.id}>Setor: {d.name}</option>)}
                  </select>
                )}
              </>
            )}
            {(a.type === "task" || a.type === "followup") && (
              <div className="crm-auto-two">
                <input value={a.title || ""} onChange={(e) => upd(a.id, { title: e.target.value })} placeholder={a.type === "task" ? "Falar com {nome}" : "Follow-up {nome}"} />
                <label>em <input type="number" min="0" max="365" value={a.days ?? 1} onChange={(e) => upd(a.id, { days: e.target.value })} /> dia(s)</label>
              </div>
            )}
            {a.type === "owner" && (
              <select value={a.ownerId || ""} onChange={(e) => upd(a.id, { ownerId: e.target.value || undefined })}>
                <option value="">Escolha o responsável…</option>
                {(ctx.team || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            <small>{AUTO_META[a.type]?.hint}</small>
          </div>
        ))}
        <div className="crm-auto-add">
          {Object.entries(AUTO_META).map(([k, m]) => (
            <button type="button" key={k} onClick={() => add(k)}><Plus size={13} /> {m.label}</button>
          ))}
        </div>
      </Group>
    </>
  );
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="ap-chips">
      {COLORS.map((c) => <button type="button" key={c} className={`crm-color ${value === c ? "on" : ""}`} style={{ background: c }} onClick={() => onChange(c)} />)}
    </div>
  );
}

function NewPipelineSheet({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [templates, setTemplates] = useState([]);
  const [tpl, setTpl] = useState("corretora");
  const [err, setErr] = useState(null);
  useEffect(() => { crm.templates().then(setTemplates).catch(() => {}); }, []);
  const cur = templates.find((t) => t.key === tpl);
  const save = async () => {
    try { onCreated(await crm.createPipeline({ name: name.trim() || cur?.name, template: tpl })); } catch (e) { setErr(errText(e)); }
  };
  const groups = [...new Set(templates.map((t) => t.group))];
  return (
    <Sheet title="Novo funil" subtitle="Comece de um modelo pronto ou em branco. Tudo pode ser ajustado depois (colunas, campos e automações)." onClose={onClose} width={640}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save}>Criar funil</Button></>}>
      {groups.map((g) => (
        <div key={g} className="crm-tpl-group">
          <div className="fi-sec-title">{g}</div>
          <div className="crm-tpl-grid">
            {templates.filter((t) => t.group === g).map((t) => (
              <button type="button" key={t.key} className={`crm-tpl ${tpl === t.key ? "on" : ""}`} onClick={() => setTpl(t.key)}>
                <strong>{t.name}</strong>
                <span>{t.description}</span>
                <div className="crm-tpl-stages">{t.stages.map((st) => <i key={st.name} style={{ background: st.color }} title={st.name} />)}</div>
                {t.fields.length > 0 && <small>{t.fields.slice(0, 4).join(" · ")}{t.fields.length > 4 ? ` +${t.fields.length - 4}` : ""}</small>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Group><Row label="Nome do funil"><input value={name} onChange={(e) => setName(e.target.value)} placeholder={cur?.name || "Pré-vendas"} /></Row></Group>
      {err && <div className="admin-feedback error" style={{ marginTop: 12 }}>{err}</div>}
    </Sheet>
  );
}

const FIELD_TYPE_LABEL = { text: "Texto", textarea: "Texto longo", number: "Número", currency: "Valor (R$)", date: "Data", select: "Lista de opções", document: "CPF / CNPJ" };
function FieldsSheet({ pipeline, onClose, onSaved }) {
  const [list, setList] = useState(() => (pipeline.fields || []).map((f) => ({ ...f, options: (f.options || []).join("\n") })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [openI, setOpenI] = useState(null);
  const [picker, setPicker] = useState(false);
  const TYPE_ICON = { text: "Aa", textarea: "¶", number: "#", currency: "R$", date: "📅", select: "☰", document: "ID" };
  const TYPE_HINT = { text: "Nome, apólice, placa…", textarea: "Observações, negociação", number: "Nº de vidas, parcelas", currency: "Prêmio, comissão", date: "Vigência, nascimento", select: "Seguradora, ramo, status", document: "Valida e busca dados do CNPJ" };
  const upd = (i, patch) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i, d) => setList((l) => { const a = [...l]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const save = async () => {
    setBusy(true);
    try {
      await crm.updatePipeline(pipeline.id, { fields: list.filter((f) => f.label.trim()).map((f) => ({ ...f, options: f.type === "select" ? String(f.options || "").split("\n") : undefined })) });
      onSaved();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  return (
    <Sheet title={`Campos · ${pipeline.name}`} subtitle="Campos dos cards deste funil. “No card” mostra o campo na frente do card (até 4). “Etiqueta no topo” vira o tipo do card (ex.: Renovação, Venda nova)." onClose={onClose} width={640}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar campos"}</Button></>}>
      <Group>
        {list.map((f, i) => (
          <div key={f.id || i} className="crm-field-edit">
            <div className="crm-field-row">
              <span className="crm-field-order">
                <button type="button" className="fi-icon" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={13} /></button>
                <button type="button" className="fi-icon" onClick={() => move(i, 1)} disabled={i === list.length - 1}><ArrowDown size={13} /></button>
              </span>
              <span className="crm-field-ico" title={FIELD_TYPE_LABEL[f.type]}>{TYPE_ICON[f.type] || "Aa"}</span>
              <input className="crm-field-label" value={f.label} onChange={(e) => upd(i, { label: e.target.value })} onFocus={() => setOpenI(i)} placeholder="Nome do campo (ex.: Apólice)" />
              {f.card && <span className="crm-field-chip">No card</span>}
              {f.kind && <span className="crm-field-chip">Etiqueta</span>}
              <button type="button" className="fi-icon" onClick={() => setOpenI(openI === i ? null : i)} title={openI === i ? "Fechar" : "Configurar"}>{openI === i ? <ChevronLeft size={14} style={{ transform: "rotate(90deg)" }} /> : <Settings2 size={14} />}</button>
              <select value={f.type} onChange={(e) => upd(i, { type: e.target.value })}>
                {Object.entries(FIELD_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button type="button" className="fi-icon" onClick={() => setList((l) => l.filter((_, j) => j !== i))} title="Remover"><Trash2 size={14} /></button>
            </div>
            {openI === i && (<div className="crm-field-body">
            {f.type === "select" && <textarea rows={3} value={f.options || ""} onChange={(e) => upd(i, { options: e.target.value })} placeholder={f.parent ? "Uma por linha: Ramo > Produto\nAutomóvel > Auto passeio\nVida > Vida individual" : "Uma opção por linha\nAllianz\nPorto Seguro"} />}
            {f.type === "select" && (
              <div className="crm-field-flags">
                <label>Depende de
                  <select value={f.parent || ""} onChange={(e) => upd(i, { parent: e.target.value || undefined })} style={{ marginLeft: 6 }}>
                    <option value="">— nenhum —</option>
                    {list.filter((x, j) => j !== i && x.type === "select" && x.id).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </label>
              </div>
            )}
            <div className="crm-field-flags">
              <label><Switch checked={!!f.card} onChange={(v) => upd(i, { card: v })} /> No card</label>
              {f.type === "date" && <label><Switch checked={!!f.alert} onChange={(v) => upd(i, { alert: v })} /> Contagem de vencimento</label>}
              {f.type === "select" && <label><Switch checked={f.free !== false} onChange={(v) => upd(i, { free: v })} /> Permitir escrever outra</label>}
              {f.type === "select" && <label><Switch checked={!!f.kind} onChange={(v) => setList((l) => l.map((x, j) => ({ ...x, kind: j === i ? v : false })))} /> Etiqueta no topo do card</label>}
            </div>
            {f.type === "date" && (
              <div className="crm-reminders">
                {(f.reminders || []).map((r, k) => (
                  <div key={k} className="crm-rem">
                    <div className="crm-rem-head">
                      <span>Enviar no WhatsApp</span>
                      <input type="number" value={r.days} min="-60" max="365" onChange={(e) => upd(i, { reminders: f.reminders.map((x, n) => (n === k ? { ...x, days: e.target.value } : x)) })} />
                      <span>{Number(r.days) < 0 ? "dia(s) depois" : "dia(s) antes"} de “{f.label || "data"}”</span>
                      <button type="button" className="fi-icon" onClick={() => upd(i, { reminders: f.reminders.filter((_, n) => n !== k) })} title="Remover"><Trash2 size={13} /></button>
                    </div>
                    <textarea rows={3} value={r.text} onChange={(e) => upd(i, { reminders: f.reminders.map((x, n) => (n === k ? { ...x, text: e.target.value } : x)) })} placeholder={`Olá, {nome}! Faltam ${r.days || 3} dias. Segue seu voucher.`} />
                    <label className="crm-rem-files"><input type="checkbox" checked={!!r.sendFiles} onChange={(e) => upd(i, { reminders: f.reminders.map((x, n) => (n === k ? { ...x, sendFiles: e.target.checked } : x)) })} /> Enviar também os anexos do card</label>
                  </div>
                ))}
                {(f.reminders || []).length < 5 && (
                  <button type="button" className="fi-add" onClick={() => upd(i, { reminders: [...(f.reminders || []), { days: 3, text: "", sendFiles: false }] })}><Bell size={14} /> Lembrete automático por esta data</button>
                )}
              </div>
            )}
            </div>)}
          </div>
        ))}
        {picker ? (
          <div className="crm-type-grid">
            {Object.entries(FIELD_TYPE_LABEL).map(([k, v]) => (
              <button type="button" key={k} onClick={() => { setList((l) => { setOpenI(l.length); return [...l, { id: "", label: "", type: k, card: false, ...(k === "select" ? { free: true } : {}) }]; }); setPicker(false); }}>
                <span className="crm-field-ico">{TYPE_ICON[k]}</span>
                <strong>{v}</strong>
                <small>{TYPE_HINT[k]}</small>
              </button>
            ))}
            <button type="button" className="crm-type-cancel" onClick={() => setPicker(false)}>Cancelar</button>
          </div>
        ) : (
          <button type="button" className="fi-add" onClick={() => setPicker(true)}><Plus size={15} /> Adicionar campo</button>
        )}
        <button type="button" className="fi-add" onClick={() => setList((l) => {
          // Lista completa de seguradoras, ramos e produtos (com opção de escrever outra)
          const norm = (x) => String(x.label || "").toLowerCase();
          const put = (arr, fld, match) => {
            const k = arr.findIndex((x) => match.includes(norm(x)));
            const cur = k >= 0 ? arr[k] : null;
            const next = { card: false, ...cur, ...fld, id: cur?.id || fld.id };
            if (k >= 0) { const a = [...arr]; a[k] = next; return a; }
            return [...arr, next];
          };
          let a = put(l, { id: "seguradora", label: "Seguradora", type: "select", free: true, options: SEGURADORAS.join("\n") }, ["seguradora", "seguradoras", "cia", "companhia"]);
          a = put(a, { id: "tipo_seguro", label: "Ramo", type: "select", free: true, options: Object.keys(RAMOS).join("\n") }, ["ramo", "tipo de seguro", "tp seguro", "tipo seguro"]);
          const ramoId = a.find((x) => norm(x) === "ramo")?.id || "tipo_seguro";
          a = put(a, { id: "produto_seguro", label: "Produto", type: "select", free: true, parent: ramoId, options: PRODUTO_OPTIONS.join("\n") }, ["produto", "produto do seguro"]);
          notify("Seguradoras, ramos e produtos adicionados. Clique em Salvar campos.", "success");
          return a;
        })}><Package size={15} /> Usar lista completa de seguradoras, ramos e produtos</button>
      </Group>
      <p className="cv-muted" style={{ margin: "12px 4px 0", fontSize: 12.5 }}>Lembretes saem sozinhos, das 8h às 20h, uma vez por card. Use 0 para o próprio dia e número negativo para depois da data (ex.: -1 = pesquisa no dia seguinte). Dica: use os campos nas mensagens automáticas das colunas, ex.: “Sua apólice {"{apolice}"} vence em {"{vigencia}"}”.</p>
      {err && <div className="admin-feedback error" style={{ marginTop: 12 }}>{err}</div>}
    </Sheet>
  );
}

// ================================================================ Lead
function LeadSheet({ ctx, lead, onClose, onSaved }) {
  const { pipeline, pipelines, tags, products, team, isManager } = ctx;
  const isNew = !!lead.isNew;
  const [files, setFiles] = useState(lead.attachments || []);
  const [checklist, setChecklist] = useState(lead.checklist || []);
  const [custom, setCustom] = useState(lead.custom || {});
  const [newItem, setNewItem] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const agendaRef = useRef(null);
  const doneCount = checklist.filter((c) => c.done).length;
  const addFiles = async (list) => {
    setUploading(true);
    for (const file of list) {
      try { const l = await crm.uploadLeadFile(lead.id, file); setFiles(l.attachments || []); } catch (e) { setErr(errText(e)); }
    }
    setUploading(false);
  };
  const delFile = async (f) => {
    if (!await askConfirm(`Remover o anexo "${f.name}"?`)) return;
    try { const l = await crm.deleteLeadFile(lead.id, f.id); setFiles(l.attachments || []); } catch (e) { setErr(errText(e)); }
  };
  const openConversation = async () => {
    try {
      const r = await crm.openLeadConversation(lead.id);
      onClose();
      ctx.onOpenConversation?.(r.conversationId);
    } catch (e) { notify(errText(e), "error"); }
  };
  // Sem produtos cadastrados: cria um na hora e já vincula ao lead
  const addProduct = async () => {
    if (products.length) return setItems((c) => [...c, { productId: products.find((p) => p.active)?.id || products[0].id, qty: 1, price: (products.find((p) => p.active) || products[0]).price }]);
    const name = await askPrompt("Nome do produto ou serviço", "", { okText: "Continuar" });
    if (!name || !name.trim()) return;
    const priceTxt = await askPrompt("Preço (R$)", "", { okText: "Adicionar" });
    if (priceTxt === null) return;
    const price = Number(String(priceTxt).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")) || 0;
    try {
      const prod = await crm.createProduct({ name: name.trim(), price, active: true });
      await ctx.loadProducts();
      setItems((c) => [...c, { productId: prod.id, qty: 1, price }]);
      notify(`Produto "${name.trim()}" cadastrado.`, "success");
    } catch (e) { setErr(errText(e)); }
  };
  const addItem = () => {
    const t = newItem.trim();
    if (!t) return;
    setChecklist((c) => [...c, { id: Math.random().toString(36).slice(2, 10), text: t, done: false }]);
    setNewItem("");
  };
  const [f, setF] = useState({
    name: lead.name || "", phone: lead.phone || "", email: lead.email || "", company: lead.company || "",
    value: lead.value ?? "", ownerId: lead.ownerId || "", source: lead.source || "", notes: lead.notes || "",
    stage: lead.stage || pipeline?.stages?.[0]?.id, pipelineId: lead.pipelineId || pipeline?.id, tagIds: lead.tagIds || []
  });
  const [items, setItems] = useState((lead.products || []).map((p) => ({ productId: p.productId, qty: p.qty, price: p.price })));
  // Ao criar o lead: já gera a tarefa de primeiro contato na aba Tarefas
  const [task, setTask] = useState(() => {
    const d = new Date(Date.now() + 86400000); d.setHours(9, 0, 0, 0);
    return { on: true, title: "", due: toLocalInput(d) };
  });
  const [events, setEvents] = useState([]);
  const [newEv, setNewEv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const curPipe = pipelines.find((p) => p.id === f.pipelineId) || pipeline;
  useEffect(() => { if (!isNew) crm.events({ leadId: lead.id }).then(setEvents).catch(() => {}); }, []);
  const total = items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.price) || 0), 0);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = { ...f, ownerId: f.ownerId || undefined, checklist, custom };
      const saved = isNew ? await crm.createLead(body) : await crm.updateLead(lead.id, body);
      if (isNew && task.on) {
        try {
          await createTaskApi({
            title: (task.title.trim() || `Primeiro contato com ${f.name.trim()}`).slice(0, 200),
            dueAt: task.due ? new Date(task.due).toISOString() : null,
            assigneeId: f.ownerId || undefined,
            conversationId: saved.conversationId || undefined,
            description: [`Lead do CRM: ${f.name.trim()}`, curPipe?.name ? `Funil: ${curPipe.name}` : "", f.phone ? `WhatsApp: ${f.phone}` : ""].filter(Boolean).join("\n")
          });
        } catch (e) { notify(`Lead criado, mas a tarefa não: ${errText(e)}`, "error"); }
      }
      const prev = JSON.stringify((lead.products || []).map((p) => [p.productId, p.qty, p.price]));
      const now = JSON.stringify(items.map((i) => [i.productId, Number(i.qty), Number(i.price)]));
      if (prev !== now) await crm.setLeadProducts(saved.id, items);
      onSaved();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const remove = async () => {
    if (!await askConfirm(`Excluir o lead "${lead.name}"?`)) return;
    await crm.deleteLead(lead.id).catch(() => {});
    onSaved();
  };
  const addEvent = async () => {
    try {
      await crm.createEvent({ ...newEv, leadId: lead.id, startsAt: new Date(newEv.startsAt).toISOString() });
      setNewEv(null);
      crm.events({ leadId: lead.id }).then(setEvents);
    } catch (e) { setErr(errText(e)); }
  };

  return (
    <Sheet title={isNew ? "Novo lead" : lead.name} subtitle={isNew ? "Cadastre um contato no funil." : `${curPipe?.name || ""} · criado há ${ago(lead.createdAt)}`} onClose={onClose} width={640}
      footer={<>
        {!isNew && <Button variant="danger" onClick={remove} style={{ marginRight: "auto" }}><Trash2 size={14} /> Excluir</Button>}
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={busy || !f.name.trim()} onClick={save}>{busy ? "Salvando…" : isNew ? "Criar lead" : "Salvar"}</Button>
      </>}>
      {!isNew && (
        <div className="crm-actionbar">
          <button type="button" onClick={openConversation} disabled={!f.phone}><MessageCircle size={16} /><span>{lead.conversationId ? "Ver conversa" : "Abrir conversa"}</span></button>
          <button type="button" onClick={() => { setNewEv({ kind: "reuniao", title: "Reunião", startsAt: toLocalInput(new Date(Date.now() + 86400000)) }); setTimeout(() => agendaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}><CalendarDays size={16} /><span>Agendar</span></button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}><Paperclip size={16} /><span>{uploading ? "Enviando…" : "Anexar"}</span></button>
          {f.phone && <a href={`tel:+${String(f.phone).replace(/\D/g, "")}`}><Phone size={16} /><span>Ligar</span></a>}
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; l.length && addFiles(l); }} />
        </div>
      )}
      <Group title="Negócio">
        <Row label="Funil">
          <select value={f.pipelineId} onChange={(e) => { const p = pipelines.find((x) => x.id === e.target.value); setF((c) => ({ ...c, pipelineId: e.target.value, stage: p?.stages?.[0]?.id })); }}>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        <Row label="Etapa">
          <select value={f.stage} onChange={set("stage")}>
            {(curPipe?.stages || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Row>
        <Row label="Responsável">
          <select value={f.ownerId} onChange={set("ownerId")} disabled={!isManager}>
            <option value="">{isNew ? "Eu" : "—"}</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
        </Row>
        <Row label="Valor (R$)"><input value={items.length ? total.toLocaleString("pt-BR") : f.value} onChange={set("value")} disabled={items.length > 0} inputMode="decimal" placeholder="0" /></Row>
      </Group>
      {(curPipe?.fields || []).length > 0 && (
        <Group title={`Dados · ${curPipe.name}`}>
          {curPipe.fields.map((fd) => {
            const v = custom[fd.id] ?? "";
            const setV = (val) => setCustom((c) => ({ ...c, [fd.id]: val }));
            return (
              <Row key={fd.id} label={fd.label} stack={fd.type === "textarea"}>
                {fd.type === "select" ? (
                  <SelectField fd={fd} value={v} onChange={setV} custom={custom} onAddOption={makeAddOption(ctx, curPipe, custom)} />
                ) : fd.type === "document" ? (
                  <DocumentField value={v} onChange={setV} onCnpjData={(d) => applyCnpjData(d, { f, setField: (k, val) => setF((c) => ({ ...c, [k]: val })), fields: curPipe?.fields, custom, setCustomValue: (id, val) => setCustom((c) => ({ ...c, [id]: val })) })} />
                ) : fd.type === "textarea" ? (
                  <textarea rows={3} value={v} onChange={(e) => setV(e.target.value)} />
                ) : fd.type === "date" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                    {fd.alert && v && <DueBadge date={v} />}
                    <input type="date" value={v} onChange={(e) => setV(e.target.value)} style={{ width: "auto" }} />
                  </span>
                ) : (
                  <input value={v} onChange={(e) => setV(fd.type === "number" || fd.type === "currency" ? e.target.value.replace(/[^\d.,-]/g, "") : e.target.value)} inputMode={fd.type === "number" || fd.type === "currency" ? "decimal" : undefined} placeholder={fd.type === "currency" ? "R$ 0,00" : ""} />
                )}
              </Row>
            );
          })}
        </Group>
      )}
      <Group title="Contato">
        <Row label="Nome"><input autoFocus={isNew} value={f.name} onChange={set("name")} placeholder="Obrigatório" /></Row>
        <Row label="Empresa"><input value={f.company} onChange={set("company")} placeholder="Opcional" /></Row>
        <Row label="WhatsApp"><input value={f.phone} onChange={set("phone")} placeholder="55 61 99999-9999" inputMode="tel" /></Row>
        <Row label="E-mail"><input value={f.email} onChange={set("email")} placeholder="email@empresa.com" inputMode="email" /></Row>
        <Row label="Origem"><input value={f.source} onChange={set("source")} placeholder="Instagram, indicação…" /></Row>
      </Group>
      <Group title={`Checklist${checklist.length ? ` · ${doneCount}/${checklist.length}` : ""}`}>
        {checklist.length > 0 && (
          <div className="crm-progress"><span style={{ width: `${Math.round((doneCount / checklist.length) * 100)}%` }} /></div>
        )}
        {checklist.map((c) => (
          <div key={c.id} className={`crm-check-row ${c.done ? "done" : ""}`}>
            <button type="button" className={`crm-ev-check ${c.done ? "on" : ""}`} onClick={() => setChecklist((l) => l.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}>{c.done && <Check size={12} />}</button>
            <input value={c.text} onChange={(e) => setChecklist((l) => l.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))} />
            <button type="button" className="fi-icon" onClick={() => setChecklist((l) => l.filter((x) => x.id !== c.id))} title="Remover"><X size={14} /></button>
          </div>
        ))}
        <div className="crm-check-row add">
          <Plus size={15} />
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} placeholder="Adicionar item (ex.: pedir documentos, enviar cotação)" />
          {newItem.trim() && <button type="button" className="ap-btn primary" style={{ height: 30, padding: "0 12px" }} onClick={addItem}>Adicionar</button>}
        </div>
      </Group>
      {!isNew && (
        <Group title={`Anexos${files.length ? ` · ${files.length}` : ""}`}>
          {files.map((fl) => (
            <div key={fl.id} className="crm-file-row">
              {/^image\//.test(fl.type || "") ? <img src={fl.url} alt="" /> : <span className="crm-file-ico"><FileText size={18} /></span>}
              <a href={fl.url} target="_blank" rel="noreferrer" className="crm-file-name">
                <strong>{fl.name}</strong>
                <small>{fl.size ? `${(fl.size / 1024 / 1024).toFixed(fl.size > 1048576 ? 1 : 2)} MB · ` : ""}{new Date(fl.at).toLocaleDateString("pt-BR")}{fl.by ? ` · ${fl.by}` : ""}</small>
              </a>
              <a href={fl.url} target="_blank" rel="noreferrer" className="fi-icon" title="Abrir"><ExternalLink size={14} /></a>
              <button type="button" className="fi-icon" onClick={() => delFile(fl)} title="Remover"><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="fi-add" onClick={() => fileRef.current?.click()} disabled={uploading}><Paperclip size={15} /> {uploading ? "Enviando…" : "Anexar arquivo (apólice, proposta, documentos…)"}</button>
        </Group>
      )}
      {isNew && (
        <Group title="Tarefa" hint="Cria a tarefa na aba Tarefas junto com o lead.">
          <Row label="Gerar tarefa"><Switch checked={task.on} onChange={(v) => setTask((t) => ({ ...t, on: v }))} /></Row>
          {task.on && <>
            <Row label="Título"><input value={task.title} onChange={(e) => setTask((t) => ({ ...t, title: e.target.value }))} placeholder={`Primeiro contato com ${f.name.trim() || "o lead"}`} /></Row>
            <Row label="Prazo"><input type="datetime-local" value={task.due} onChange={(e) => setTask((t) => ({ ...t, due: e.target.value }))} style={{ width: "auto" }} /></Row>
          </>}
        </Group>
      )}
      {isNew && <p className="cv-muted" style={{ margin: "14px 4px 0", fontSize: 13 }}>Depois de criar o lead você poderá anexar arquivos, abrir a conversa e agendar.</p>}
      <Group title="Tags">
        <div className="ap-chips">
          {tags.map((t) => {
            const on = f.tagIds.includes(t.id);
            return <button type="button" key={t.id} className={`crm-tag-pick ${on ? "on" : ""}`} style={{ "--c": t.color }}
              onClick={() => setF((c) => ({ ...c, tagIds: on ? c.tagIds.filter((x) => x !== t.id) : [...c.tagIds, t.id] }))}>{t.name}</button>;
          })}
          {!tags.length && <span className="cv-muted">Crie tags na aba Tags.</span>}
        </div>
      </Group>
      <Group title="Produtos / serviços" hint={items.length ? `Total do negócio: ${brl(total)}` : "Vincule produtos para calcular o valor automaticamente."}>
        {items.map((it, i) => (
          <div key={i} className="crm-prod-row">
            <select value={it.productId} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); setItems((c) => c.map((x, j) => (j === i ? { ...x, productId: e.target.value, price: p?.price ?? x.price } : x))); }}>
              <option value="">Escolha…</option>
              <ProductOptions products={products} currentId={it.productId} />
            </select>
            <input type="number" min="1" value={it.qty} onChange={(e) => setItems((c) => c.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} title="Quantidade" />
            <input value={it.price} onChange={(e) => setItems((c) => c.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(",", ".") } : x)))} title="Preço" inputMode="decimal" />
            <button type="button" className="icon-btn" onClick={() => setItems((c) => c.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
        ))}
        <div style={{ padding: "8px 12px" }}>
          <Button variant="ghost" onClick={addProduct}><Plus size={14} /> {products.length ? "Adicionar produto" : "Cadastrar e adicionar produto"}</Button>
        </div>
      </Group>
      {!isNew && (
        <div ref={agendaRef}><Group title="Agenda">
          {events.map((ev) => (
            <div key={ev.id} className="crm-ev-row">
              <button className={`crm-ev-check ${ev.done ? "on" : ""}`} onClick={async () => { await crm.updateEvent(ev.id, { done: !ev.done }); crm.events({ leadId: lead.id }).then(setEvents); }}>{ev.done && <Check size={12} />}</button>
              <div><strong>{ev.title}</strong><span>{new Date(ev.startsAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span></div>
            </div>
          ))}
          {newEv ? (
            <div className="crm-ev-new">
              <select value={newEv.kind} onChange={(e) => setNewEv((c) => ({ ...c, kind: e.target.value }))}>
                <option value="reuniao">Reunião</option><option value="call">Call</option><option value="followup">Follow-up</option>
              </select>
              <input value={newEv.title} onChange={(e) => setNewEv((c) => ({ ...c, title: e.target.value }))} placeholder="Título" />
              <input type="datetime-local" value={newEv.startsAt} onChange={(e) => setNewEv((c) => ({ ...c, startsAt: e.target.value }))} />
              <Button onClick={addEvent}>Agendar</Button>
            </div>
          ) : (
            <div style={{ padding: "8px 12px" }}>
              <Button variant="ghost" onClick={() => setNewEv({ kind: "reuniao", title: "Reunião", startsAt: toLocalInput(new Date(Date.now() + 86400000)) })}><Plus size={14} /> Agendar reunião / call</Button>
            </div>
          )}
        </Group></div>
      )}
      <Group title="Anotações"><Row label="" stack><textarea rows={3} value={f.notes} onChange={set("notes")} placeholder="Observações sobre o lead" /></Row></Group>
      {err && <div className="admin-feedback error" style={{ marginTop: 12 }}>{err}</div>}
    </Sheet>
  );
}

// ================================================================ Contatos
function ContactsView({ ctx }) {
  const { tags, pipelines } = ctx;
  const [leads, setLeads] = useState(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [importing, setImporting] = useState(false);
  const load = () => crm.leads(search ? { search } : {}).then(setLeads).catch(() => setLeads([]));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [search]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const stageName = (l) => pipelines.find((p) => p.id === l.pipelineId)?.stages?.find((s) => s.id === l.stage)?.name || l.stage;

  const exportCsv = () => {
    const head = ["Nome", "Empresa", "Telefone", "E-mail", "Etapa", "Valor", "Tags", "Origem", "Responsável"];
    const rows = (leads || []).map((l) => [l.name, l.company, l.phone, l.email, stageName(l), l.value ?? "", l.tagIds.map((id) => tagById.get(id)?.name).filter(Boolean).join(", "), l.source, l.ownerName]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "leads-crm.csv";
    a.click();
  };

  return (
    <>
      <div className="crm-toolbar">
        <div className="crm-search" style={{ flex: 1, maxWidth: 360 }}><Search size={15} /><input placeholder="Buscar por nome, empresa, telefone ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" onClick={exportCsv} disabled={!leads?.length}><Download size={15} /> Exportar</Button>
        <Button variant="secondary" onClick={() => setImporting(true)}><Upload size={15} /> Importar planilha</Button>
        <Button onClick={() => setOpen({ isNew: true })}><Plus size={15} /> Novo lead</Button>
      </div>
      <div className="ap-list">
        {leads === null && <div className="ap-empty">Carregando…</div>}
        {leads?.map((l) => (
          <div key={l.id} className="ap-list-row" style={{ cursor: "pointer" }} onClick={() => setOpen(l)}>
            <span className="ap-avatar">{initials(l.name)}</span>
            <div className="ap-list-main">
              <strong>{l.name}{l.company ? ` · ${l.company}` : ""}</strong>
              <span>{[fmtPhone(l.phone), l.email, stageName(l), l.ownerName].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="crm-tags" style={{ maxWidth: 280, justifyContent: "flex-end" }}>
              {l.tagIds.slice(0, 3).map((id) => tagById.get(id)).filter(Boolean).map((t) => <span key={t.id} className="crm-tag" style={{ "--c": t.color }}>{t.name}</span>)}
            </div>
            <span className="crm-value" style={{ minWidth: 80, textAlign: "right" }}>{l.value ? brl(l.value) : ""}</span>
          </div>
        ))}
        {leads && !leads.length && <div className="ap-empty">Nenhum lead ainda. Cadastre ou importe uma planilha.</div>}
      </div>
      {open && (open.isNew
        ? <LeadSheet ctx={ctx} lead={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />
        : <CrmLeadPage ctx={ctx} lead={open} onClose={() => { setOpen(null); load(); }} />)}
      {importing && <ImportSheet ctx={ctx} onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); ctx.loadTags(); }} />}
    </>
  );
}

const FIELD_GUESS = {
  name: ["nome", "name", "cliente", "lead", "contato"],
  phone: ["telefone", "celular", "whatsapp", "phone", "fone", "numero", "número"],
  email: ["email", "e-mail", "mail"],
  company: ["empresa", "company", "razao", "razão", "organização"],
  value: ["valor", "value", "preço", "preco", "ticket"],
  tags: ["tags", "tag", "etiquetas", "segmento"],
  source: ["origem", "source", "canal", "fonte"],
  notes: ["obs", "observação", "observacoes", "notas", "notes"],
  due: ["vencimento", "vigência", "vigencia", "renovação", "renovacao", "validade"],
  owner: ["responsável", "responsavel", "vendedor", "corretor", "consultor", "atendente"]
};
const FIELD_LABEL = { name: "Nome", phone: "Telefone", email: "E-mail", company: "Empresa", value: "Valor", tags: "Tags", source: "Origem", notes: "Observações", due: "Vencimento", owner: "Responsável (por linha)" };
const KINDS = ["Venda nova", "Renovação", "Indicação"];

function ImportSheet({ ctx, onClose, onDone }) {
  const { pipelines, pipeline, team = [] } = ctx;
  const [rows, setRows] = useState(null);
  const [ownerId, setOwnerId] = useState("");
  const [kind, setKind] = useState("");
  const [headers, setHeaders] = useState([]);
  const [map, setMap] = useState({});
  const [pipeId, setPipeId] = useState(pipeline?.id || pipelines[0]?.id);
  const [stage, setStage] = useState(pipeline?.stages?.[0]?.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const curPipe = pipelines.find((p) => p.id === pipeId);
  const norm = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const customFields = curPipe?.fields || [];
  // campos do modelo primeiro (ex.: Vigência, Apólice), depois os padrões
  const allFields = [
    ...[["name", "Nome"], ["phone", "Telefone"], ["email", "E-mail"], ["company", "Empresa"]],
    ...customFields.map((f) => [`custom.${f.id}`, f.label]),
    ...[["value", "Valor"], ["tags", "Tags"], ["source", "Origem"], ["owner", "Responsável (por linha)"], ["notes", "Observações"]],
    ...(customFields.some((f) => f.type === "date") ? [] : [["due", "Vencimento"]])
  ];
  const guessMap = (hs) => {
    const used = new Set();
    const guess = {};
    const take = (field, keys) => {
      const h = hs.find((x) => !used.has(x) && keys.some((k) => norm(x) === norm(k)))
        || hs.find((x) => !used.has(x) && keys.some((k) => norm(k).length > 2 && norm(x).includes(norm(k))));
      if (h) { guess[field] = h; used.add(h); }
    };
    for (const f of customFields) take(`custom.${f.id}`, [f.label, f.label.replace(/\s*\(.*\)$/, ""), f.id.replace(/_/g, " "), ...(f.type === "date" && f.alert ? ["vencimento", "vigencia", "fim vigencia"] : [])]);
    for (const [field, keys] of Object.entries(FIELD_GUESS)) if (allFields.some(([k]) => k === field)) take(field, keys);
    return guess;
  };
  useEffect(() => { if (headers.length) setMap(guessMap(headers)); }, [pipeId]);
  const downloadModel = async () => {
    const XLSX = await import("xlsx");
    const cols = allFields.filter(([k]) => !["tags", "source", "due"].includes(k)).map(([, label]) => label.replace(" (por linha)", ""));
    const sample = { Nome: "Maria Souza", Telefone: "5561999998888", "E-mail": "maria@email.com", Empresa: "", Valor: "", Responsável: team[0]?.name || "", Observações: "" };
    for (const f of customFields) sample[f.label] = f.type === "date" ? "21/11/2026" : f.type === "select" ? (f.options?.[0] || "") : f.type === "currency" ? "1500,00" : "";
    const ws = XLSX.utils.json_to_sheet([Object.fromEntries(cols.map((c) => [c, sample[c] ?? ""]))], { header: cols });
    ws["!cols"] = cols.map((c) => ({ wch: Math.max(14, c.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, `modelo-${norm(curPipe?.name || "crm").replace(/[^a-z0-9]+/g, "-")}.xlsx`);
  };

  const readFile = async (file) => {
    setErr(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      if (!data.length) throw new Error("A planilha está vazia.");
      const hs = Object.keys(data[0]);
      setHeaders(hs);
      setMap(guessMap(hs));
      setRows(data);
    } catch (e) { setErr(e.message || "Não consegui ler o arquivo."); }
  };
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const out = rows.map((r) => Object.fromEntries(Object.entries(map).filter(([, h]) => h).map(([f, h]) => [f, r[h]])));
      const res = await crm.importLeads({ pipelineId: pipeId, stage, rows: out, ownerId: ownerId || null, kind: kind || null });
      alert(`${res.imported} lead(s) importado(s).`);
      onDone();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <Sheet title="Importar leads" subtitle="Planilha Excel (.xlsx, .xls) ou CSV. A primeira linha deve ter os títulos das colunas." onClose={onClose} width={600}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!rows || !map.name && !map.phone || busy} onClick={run}>{busy ? "Importando…" : rows ? `Importar ${rows.length} linha(s)` : "Importar"}</Button></>}>
      <Group>
        <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={15} /> Escolher arquivo</Button>
          <span className="cv-muted">{rows ? `${rows.length} linha(s) encontradas` : "Nenhum arquivo selecionado"}</span>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        </div>
        <button type="button" className="fi-add" onClick={downloadModel}><Download size={15} /> Baixar planilha-modelo do funil “{curPipe?.name}”</button>
      </Group>
      {rows && (
        <>
          <Group title="Colunas da planilha" hint="Confira qual coluna vai para cada campo. Tags separadas por vírgula viram tags do CRM.">
            {allFields.map(([field, label]) => (
              <Row key={field} label={label}>
                <select value={map[field] || ""} onChange={(e) => setMap((m) => ({ ...m, [field]: e.target.value }))}>
                  <option value="">— não importar —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </Row>
            ))}
          </Group>
          <Group title="Responsável e tipo" hint="Vale para a lista toda. Se a planilha tiver a coluna Responsável, ela tem prioridade (busca pelo nome ou e-mail do usuário).">
            <Row label="Responsável">
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">Eu mesmo</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Row>
            <Row label="Tipo">
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Não definir</option>
                {((customFields.find((f) => f.kind)?.options) || KINDS).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Row>
          </Group>
          <Group title="Destino">
            <Row label="Funil">
              <select value={pipeId} onChange={(e) => { setPipeId(e.target.value); setStage(pipelines.find((p) => p.id === e.target.value)?.stages?.[0]?.id); }}>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Row>
            <Row label="Etapa">
              <select value={stage} onChange={(e) => setStage(e.target.value)}>
                {(curPipe?.stages || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Row>
          </Group>
        </>
      )}
      {err && <div className="admin-feedback error" style={{ marginTop: 12 }}>{err}</div>}
    </Sheet>
  );
}

// ================================================================ Agenda
function AgendaView({ ctx }) {
  const [weekStart, setWeekStart] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; });
  const [events, setEvents] = useState([]);
  const [leads, setLeads] = useState([]);
  const [newEv, setNewEv] = useState(null);
  const [g, setG] = useState({ configured: false, connected: false });
  useEffect(() => { googleStatusApi().then(setG); }, []);
  const connectGoogle = async () => {
    try { window.location.href = await googleAuthUrlApi(); } catch (e) { alert(errText(e)); }
  };
  const days = [...Array(7)].map((_, i) => new Date(weekStart.getTime() + i * 86400000));
  const load = () => crm.events({ from: weekStart.toISOString(), to: new Date(weekStart.getTime() + 7 * 86400000).toISOString() }).then(setEvents).catch(() => {});
  useEffect(() => { load(); }, [weekStart]);
  useEffect(() => { crm.leads().then(setLeads).catch(() => {}); }, []);
  const KIND = { reuniao: "Reunião", call: "Call", followup: "Follow-up" };
  const save = async () => {
    try {
      const ev = await crm.createEvent({ ...newEv, startsAt: new Date(newEv.startsAt).toISOString(), leadId: newEv.leadId || null });
      setNewEv(null);
      load();
      if (ev.googleError) alert(ev.googleError);
      else if (ev.meet_link) { navigator.clipboard?.writeText(ev.meet_link).catch(() => {}); alert(`Reunião criada no Google Agenda.\nLink do Meet (copiado): ${ev.meet_link}`); }
    } catch (e) { alert(errText(e)); }
  };
  const today = new Date().toDateString();
  return (
    <>
      <div className="crm-toolbar">
        <Button variant="secondary" onClick={() => setWeekStart((d) => new Date(d.getTime() - 7 * 86400000))}><ChevronLeft size={15} /></Button>
        <Button variant="secondary" onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setWeekStart(d); }}>Hoje</Button>
        <Button variant="secondary" onClick={() => setWeekStart((d) => new Date(d.getTime() + 7 * 86400000))}><ChevronRight size={15} /></Button>
        <strong style={{ fontSize: 17 }}>{days[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – {days[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</strong>
        <div style={{ flex: 1 }} />
        {g.configured && (g.connected
          ? <Button variant="secondary" title={g.email || ""} onClick={async () => { if (await askConfirm("Desconectar sua conta Google?")) { await googleDisconnectApi(); setG((x) => ({ ...x, connected: false })); } }}>🟢 Google Agenda</Button>
          : <Button variant="secondary" onClick={connectGoogle}>Conectar Google Agenda</Button>)}
        <Button onClick={() => setNewEv({ kind: "reuniao", title: "Reunião", startsAt: toLocalInput(new Date(Date.now() + 3600000)), leadId: "", google: g.connected, meet: true, inviteLead: true })}><Plus size={15} /> Agendar</Button>
      </div>
      <div className="crm-week">
        {days.map((d) => {
          const list = events.filter((e) => new Date(e.startsAt).toDateString() === d.toDateString());
          return (
            <div key={d.toISOString()} className={`crm-day ${d.toDateString() === today ? "today" : ""}`}>
              <div className="crm-day-head"><span>{d.toLocaleDateString("pt-BR", { weekday: "short" })}</span><strong>{d.getDate()}</strong></div>
              {list.map((e) => (
                <div key={e.id} className={`crm-event ${e.kind} ${e.done ? "done" : ""}`} onClick={async () => { await crm.updateEvent(e.id, { done: !e.done }); load(); }} title="Clique para marcar como feito">
                  <span className="crm-event-time">{new Date(e.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {KIND[e.kind] || e.kind}</span>
                  <strong>{e.title}</strong>
                  {e.leadName && <span>{e.leadName}</span>}
                  {e.meetLink && <a href={e.meetLink} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="crm-meet">🎥 Entrar no Meet</a>}
                  <button className="crm-event-del" onClick={async (ev) => { ev.stopPropagation(); if (await askConfirm("Excluir este agendamento?")) { await crm.deleteEvent(e.id); load(); } }}><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {newEv && (
        <Sheet title="Novo agendamento" onClose={() => setNewEv(null)} width={480}
          footer={<><Button variant="secondary" onClick={() => setNewEv(null)}>Cancelar</Button><Button onClick={save}>Agendar</Button></>}>
          <Group>
            <Row label="Tipo">
              <select value={newEv.kind} onChange={(e) => setNewEv((c) => ({ ...c, kind: e.target.value }))}>
                <option value="reuniao">Reunião</option><option value="call">Call</option><option value="followup">Follow-up</option>
              </select>
            </Row>
            <Row label="Título"><input value={newEv.title} onChange={(e) => setNewEv((c) => ({ ...c, title: e.target.value }))} /></Row>
            <Row label="Quando"><input type="datetime-local" value={newEv.startsAt} onChange={(e) => setNewEv((c) => ({ ...c, startsAt: e.target.value }))} /></Row>
            <Row label="Lead">
              <select value={newEv.leadId} onChange={(e) => setNewEv((c) => ({ ...c, leadId: e.target.value }))}>
                <option value="">Nenhum</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Row>
            <Row label="Notas" stack><textarea rows={2} value={newEv.notes || ""} onChange={(e) => setNewEv((c) => ({ ...c, notes: e.target.value }))} /></Row>
          </Group>
          <Group title="Google Agenda" hint={g.connected ? `Conectado como ${g.email || "sua conta"}.` : g.configured ? "Conecte sua conta Google no topo da Agenda para usar." : "Integração ainda não ativada pela Helora."}>
            <Row label="Salvar no Google Agenda"><Switch checked={!!newEv.google} disabled={!g.connected} onChange={(v) => setNewEv((c) => ({ ...c, google: v }))} /></Row>
            <Row label="Criar link do Google Meet"><Switch checked={!!newEv.meet} disabled={!g.connected || !newEv.google} onChange={(v) => setNewEv((c) => ({ ...c, meet: v }))} /></Row>
            <Row label="Enviar convite ao e-mail do lead"><Switch checked={!!newEv.inviteLead} disabled={!g.connected || !newEv.google || !newEv.leadId} onChange={(v) => setNewEv((c) => ({ ...c, inviteLead: v }))} /></Row>
          </Group>
        </Sheet>
      )}
    </>
  );
}


// ================================================================ Exportar
const EXPORT_LEVELS = [["mes", "Mês"], ["seguradora", "Seguradora"], ["produto", "Produto"], ["etapa", "Etapa"], ["responsavel", "Responsável"]];
function ExportSheet({ pipelines, pipelineId, onClose }) {
  const [pid, setPid] = useState(pipelineId || "");
  const [levels, setLevels] = useState(["mes", "seguradora", "produto"]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [files, setFiles] = useState(true);
  const [archived, setArchived] = useState(true);
  const [busy, setBusy] = useState(false);
  const toggle = (k) => setLevels((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));
  const go = async () => {
    setBusy(true);
    try {
      const r = await crm.exportZip({ pipelineId: pid || undefined, levels: levels.join(","), from: from || undefined, to: to || undefined, files: files ? "1" : "0", archived: archived ? "1" : "0" });
      const name = decodeURIComponent((r.headers?.["content-disposition"] || "").match(/filename="([^"]+)"/)?.[1] || `CRM ${new Date().toISOString().slice(0, 10)}.zip`);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      notify("CRM baixado.", "success");
      onClose();
    } catch (e) {
      let msg = errText(e);
      try { if (e?.response?.data instanceof Blob) msg = JSON.parse(await e.response.data.text()).error || msg; } catch {}
      notify(msg, "error");
    }
    setBusy(false);
  };
  const preview = ["CRM", ...levels.map((k) => EXPORT_LEVELS.find((x) => x[0] === k)?.[1]), "Cliente"].join(" › ");
  return (
    <Sheet title="Baixar CRM" subtitle="Um arquivo .zip com uma pasta por cliente (dados do card + anexos) e uma planilha geral. Nada é apagado do Helora." onClose={onClose} width={560}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={go}><Download size={15} /> {busy ? "Gerando o arquivo…" : "Baixar .zip"}</Button></>}>
      <Group>
        <Row label="Funil">
          <select value={pid} onChange={(e) => setPid(e.target.value)}>
            <option value="">Todos os funis</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        <Row label="Criados de"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "auto" }} /></Row>
        <Row label="até"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "auto" }} /></Row>
        <Row label="Incluir anexos"><Switch checked={files} onChange={setFiles} /></Row>
        <Row label="Incluir arquivados"><Switch checked={archived} onChange={setArchived} /></Row>
      </Group>
      <Group title="Organizar as pastas por" hint={`Ordem das pastas: ${preview}`}>
        <div className="crm-exp-levels">
          {EXPORT_LEVELS.map(([k, l]) => {
            const i = levels.indexOf(k);
            return <button key={k} type="button" className={i >= 0 ? "on" : ""} onClick={() => toggle(k)}>{i >= 0 && <b>{i + 1}</b>}{l}</button>;
          })}
        </div>
      </Group>
    </Sheet>
  );
}

// ================================================================ Produtos
function ProductsView({ ctx }) {
  const { products, loadProducts, isManager } = ctx;
  const [edit, setEdit] = useState(null);
  const [importing, setImporting] = useState(false);
  const [openIds, setOpenIds] = useState({});
  const save = async () => {
    try {
      const body = { ...edit, parentId: edit.parentId || null };
      if (edit.id) await crm.updateProduct(edit.id, body); else await crm.createProduct(body);
      setEdit(null);
      loadProducts();
    } catch (e) { alert(errText(e)); }
  };
  const importRamos = async () => {
    if (!await askConfirm("Cadastrar todos os ramos de seguro (Automóvel, Vida, Saúde, Residencial…) com os produtos de cada um? Os que já existem não são duplicados.")) return;
    setImporting(true);
    try {
      const r = await crm.importRamos();
      await loadProducts();
      notify(r.created ? `${r.created} produtos cadastrados.` : "Todos os ramos já estavam cadastrados.", "success");
    } catch (e) { notify(errText(e), "error"); }
    setImporting(false);
  };
  const roots = products.filter((p) => !p.parent_id || !products.some((x) => x.id === p.parent_id));
  const kidsOf = (id) => products.filter((p) => p.parent_id === id);
  const newProduct = (parentId = null) => setEdit({ name: "", price: "", description: "", recurring: false, active: true, parentId });
  const row = (p, sub) => (
    <div key={p.id} className="ap-list-row" style={{ cursor: isManager ? "pointer" : "default", opacity: p.active ? 1 : 0.5, paddingLeft: sub ? 46 : undefined }} onClick={() => isManager && setEdit({ ...p, parentId: p.parent_id || null })}>
      <span className="ap-avatar" style={{ background: sub ? "linear-gradient(135deg,#8e8e93,#c7c7cc)" : "linear-gradient(135deg,#30d158,#64d2ff)", width: sub ? 28 : undefined, height: sub ? 28 : undefined }}><Package size={sub ? 14 : 17} /></span>
      <div className="ap-list-main"><strong>{p.name}</strong><span>{p.description || (p.recurring ? "Cobrança recorrente" : sub ? "Subproduto" : "Venda única")}{!p.active ? " · inativo" : ""}</span></div>
      {!sub && kidsOf(p.id).length > 0 && (
        <button type="button" className="ap-btn" style={{ height: 28, padding: "0 10px" }} onClick={(e) => { e.stopPropagation(); setOpenIds((o) => ({ ...o, [p.id]: !o[p.id] })); }}>
          {kidsOf(p.id).length} {openIds[p.id] ? "▲" : "▼"}
        </button>
      )}
      {!sub && isManager && <button type="button" className="ap-btn" style={{ height: 28, padding: "0 10px" }} title="Novo subproduto" onClick={(e) => { e.stopPropagation(); setOpenIds((o) => ({ ...o, [p.id]: true })); newProduct(p.id); }}><Plus size={13} /> Sub</button>}
      <span className="crm-value">{p.price ? `${brl(p.price)}${p.recurring ? "/mês" : ""}` : ""}</span>
    </div>
  );
  return (
    <>
      <div className="crm-toolbar">
        <span className="cv-muted">Produtos e subprodutos da empresa (ex.: Automóvel › Auto passeio). Vincule aos leads para calcular o valor do negócio.</span>
        <div style={{ flex: 1 }} />
        {isManager && <Button variant="secondary" disabled={importing} onClick={importRamos}>{importing ? "Cadastrando…" : "Importar ramos de seguro"}</Button>}
        {isManager && <Button onClick={() => newProduct()}><Plus size={15} /> Novo produto</Button>}
      </div>
      <div className="ap-list">
        {roots.map((p) => (
          <React.Fragment key={p.id}>
            {row(p, false)}
            {openIds[p.id] && kidsOf(p.id).map((k) => row(k, true))}
          </React.Fragment>
        ))}
        {!products.length && <div className="ap-empty">Nenhum produto cadastrado. Use “Importar ramos de seguro” para começar com todos os ramos.</div>}
      </div>
      {edit && (
        <Sheet title={edit.id ? "Editar produto" : edit.parentId ? "Novo subproduto" : "Novo produto"} onClose={() => setEdit(null)} width={480}
          footer={<>
            {edit.id && <Button variant="danger" style={{ marginRight: "auto" }} onClick={async () => { if (await askConfirm(kidsOf(edit.id).length ? "Excluir este produto e todos os subprodutos dele?" : "Excluir este produto?")) { await crm.deleteProduct(edit.id); setEdit(null); loadProducts(); } }}><Trash2 size={14} /></Button>}
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button disabled={!edit.name?.trim()} onClick={save}>Salvar</Button>
          </>}>
          <Group>
            <Row label="Nome"><input autoFocus value={edit.name} onChange={(e) => setEdit((c) => ({ ...c, name: e.target.value }))} placeholder={edit.parentId ? "Ex: Auto passeio" : "Ex: Automóvel"} /></Row>
            <Row label="Dentro de">
              <select value={edit.parentId || ""} onChange={(e) => setEdit((c) => ({ ...c, parentId: e.target.value || null }))}>
                <option value="">— produto principal —</option>
                {roots.filter((r) => r.id !== edit.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Row>
            <Row label="Preço (R$)"><input value={edit.price} onChange={(e) => setEdit((c) => ({ ...c, price: e.target.value }))} inputMode="decimal" placeholder="0,00" /></Row>
            <Row label="Recorrente (mensal)"><Switch checked={edit.recurring} onChange={(v) => setEdit((c) => ({ ...c, recurring: v }))} /></Row>
            <Row label="Ativo"><Switch checked={edit.active} onChange={(v) => setEdit((c) => ({ ...c, active: v }))} /></Row>
            <Row label="Descrição" stack><textarea rows={2} value={edit.description || ""} onChange={(e) => setEdit((c) => ({ ...c, description: e.target.value }))} /></Row>
          </Group>
        </Sheet>
      )}
    </>
  );
}

// ================================================================ Tags
function TagsView({ ctx }) {
  const { tags, loadTags } = ctx;
  const [edit, setEdit] = useState(null);
  const save = async () => {
    try {
      if (edit.id) await crm.updateTag(edit.id, edit); else await crm.createTag(edit);
      setEdit(null);
      loadTags();
    } catch (e) { alert(errText(e)); }
  };
  return (
    <>
      <div className="crm-toolbar">
        <span className="cv-muted">Tags exclusivas do CRM para segmentar os leads (ex.: MQL, Agência, tem_base).</span>
        <div style={{ flex: 1 }} />
        <Button onClick={() => setEdit({ name: "", color: COLORS[0] })}><Plus size={15} /> Nova tag</Button>
      </div>
      <div className="ap-group-box" style={{ padding: 16 }}>
        <div className="crm-tags" style={{ gap: 10 }}>
          {tags.map((t) => <button key={t.id} className="crm-tag big" style={{ "--c": t.color }} onClick={() => setEdit({ ...t })}>{t.name} <Pencil size={11} /></button>)}
          {!tags.length && <span className="cv-muted">Nenhuma tag ainda.</span>}
        </div>
      </div>
      {edit && (
        <Sheet title={edit.id ? "Editar tag" : "Nova tag"} onClose={() => setEdit(null)} width={440}
          footer={<>
            {edit.id && <Button variant="danger" style={{ marginRight: "auto" }} onClick={async () => { if (await askConfirm("Excluir esta tag?")) { await crm.deleteTag(edit.id); setEdit(null); loadTags(); } }}><Trash2 size={14} /></Button>}
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button disabled={!edit.name?.trim()} onClick={save}>Salvar</Button>
          </>}>
          <Group><Row label="Nome"><input autoFocus value={edit.name} onChange={(e) => setEdit((c) => ({ ...c, name: e.target.value }))} placeholder="Ex: MQL" /></Row></Group>
          <Group title="Cor"><ColorPicker value={edit.color} onChange={(c) => setEdit((x) => ({ ...x, color: c }))} /></Group>
        </Sheet>
      )}
    </>
  );
}
