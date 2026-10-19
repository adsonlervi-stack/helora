import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, Phone, MessageCircle, Bell, Timer, Briefcase, Clock, Upload, Download, Trash2, Pencil,
  ChevronLeft, ChevronRight, CalendarDays, Check, Tag, Package, Users, KanbanSquare, Settings2
} from "lucide-react";
import { crm, getTeam, googleStatusApi, googleAuthUrlApi, googleDisconnectApi } from "../api.js";
import { Sheet, Group, Row, Switch, Button } from "./ui.jsx";

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
export default function CrmPage({ profile }) {
  const isManager = profile?.role === "owner" || profile?.isSuperAdmin;
  const [tab, setTab] = useState("funnel");
  const [pipelines, setPipelines] = useState([]);
  const [pipelineId, setPipelineId] = useState(null);
  const [tags, setTags] = useState([]);
  const [products, setProducts] = useState([]);
  const [team, setTeam] = useState([]);
  const [error, setError] = useState(null);

  const loadPipelines = () =>
    crm.pipelines().then((l) => { setPipelines(l); setPipelineId((cur) => cur && l.some((p) => p.id === cur) ? cur : l[0]?.id); }).catch((e) => setError(errText(e)));
  const loadTags = () => crm.tags().then(setTags).catch(() => {});
  const loadProducts = () => crm.products().then(setProducts).catch(() => {});
  useEffect(() => {
    loadPipelines();
    loadTags();
    loadProducts();
    getTeam().then(setTeam).catch(() => {});
  }, []);
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const ctx = { isManager, pipelines, pipeline, pipelineId, setPipelineId, tags, products, team, loadPipelines, loadTags, loadProducts, setPipelines };

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
  const [tagFilter, setTagFilter] = useState("");
  const [open, setOpen] = useState(null); // lead | {new:true, stage}
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const [editCol, setEditCol] = useState(null);
  const [newPipe, setNewPipe] = useState(false);

  const load = () => pipelineId && crm.leads({ pipelineId }).then(setLeads).catch(() => setLeads([]));
  useEffect(() => { setLeads(null); load(); }, [pipelineId]);

  const stages = pipeline?.stages || [];
  const filtered = (leads || []).filter((l) => {
    const t = `${l.name} ${l.company || ""} ${l.phone || ""} ${l.email || ""}`.toLowerCase();
    return t.includes(search.toLowerCase()) && (!tagFilter || l.tagIds.includes(tagFilter));
  });
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const move = async (id, stage) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, stage, stageChangedAt: new Date().toISOString() } : l)));
    try { await crm.updateLead(id, { stage }); } catch { load(); }
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
    if (editCol.id) saveStages(stages.map((s) => (s.id === editCol.id ? { ...s, name, color: editCol.color } : s)));
    else saveStages([...stages, { id: name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").slice(0, 24) + "_" + Date.now().toString(36).slice(-4), name, color: editCol.color }]);
    setEditCol(null);
  };
  const moveCol = (id, dir) => {
    const i = stages.findIndex((s) => s.id === id), j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    saveStages(next);
  };
  const deleteCol = (id) => {
    if ((leads || []).some((l) => l.stage === id)) return alert("Mova os leads desta coluna antes de excluir.");
    if (confirm("Excluir esta coluna?")) saveStages(stages.filter((s) => s.id !== id));
  };

  return (
    <>
      <div className="crm-toolbar">
        <label className="crm-select">
          <span>Funil</span>
          <select value={pipelineId || ""} onChange={(e) => e.target.value === "__new" ? setNewPipe(true) : setPipelineId(e.target.value)}>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            {isManager && <option value="__new">+ Novo funil…</option>}
          </select>
        </label>
        {isManager && <Button variant="secondary" onClick={() => setEditCol({ name: "", color: COLORS[0] })}><Plus size={15} /> Coluna</Button>}
        <div className="crm-search"><Search size={15} /><input placeholder="Buscar lead" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className="crm-filter" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">Todas as tags</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <Button onClick={() => setOpen({ isNew: true, stage: stages[0]?.id })}><Plus size={15} /> Novo lead</Button>
      </div>

      <div className="crm-board">
        {stages.map((st) => {
          const items = filtered.filter((l) => l.stage === st.id);
          const sum = items.reduce((s, l) => s + (l.value || 0), 0);
          return (
            <div key={st.id} className={`crm-col ${over === st.id ? "over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(st.id); }}
              onDragLeave={() => setOver((c) => (c === st.id ? null : c))}
              onDrop={(e) => { e.preventDefault(); setOver(null); dragId && move(dragId, st.id); setDragId(null); }}>
              <div className="crm-col-head">
                <span className="crm-dot" style={{ background: st.color }} />
                <strong title={st.name}>{st.name}</strong>
                <span className="crm-count">{items.length}</span>
                {isManager && (
                  <span className="crm-col-tools">
                    <button onClick={() => moveCol(st.id, -1)} title="Mover para a esquerda"><ChevronLeft size={13} /></button>
                    <button onClick={() => moveCol(st.id, 1)} title="Mover para a direita"><ChevronRight size={13} /></button>
                    <button onClick={() => setEditCol({ id: st.id, name: st.name, color: st.color })} title="Editar"><Pencil size={12} /></button>
                    <button onClick={() => deleteCol(st.id)} title="Excluir"><Trash2 size={12} /></button>
                  </span>
                )}
                <span className="crm-sum">{brl(sum)}</span>
              </div>
              <div className="crm-cards">
                {leads === null && <div className="crm-skel" />}
                {items.map((l) => (
                  <div key={l.id} className="crm-card" draggable onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)} onClick={() => setOpen(l)}>
                    <div className="crm-card-top">
                      <span className="crm-avatar">{initials(l.name)}</span>
                      <div className="crm-card-id">
                        <strong>{l.name}</strong>
                        <span>{l.company || fmtPhone(l.phone) || l.email || "—"}</span>
                      </div>
                      <span className="crm-value">{l.value ? brl(l.value) : "+ Valor"}</span>
                    </div>
                    {l.tagIds.length > 0 && (
                      <div className="crm-tags">
                        {l.tagIds.map((id) => tagById.get(id)).filter(Boolean).map((t) => (
                          <span key={t.id} className="crm-tag" style={{ "--c": t.color }}>{t.name}</span>
                        ))}
                      </div>
                    )}
                    <div className="crm-meta">
                      <span><Timer size={12} /> {ago(l.stageChangedAt)} na coluna</span>
                      {l.products.length > 0 && <span><Briefcase size={12} /> {l.products.length} produto(s)</span>}
                      <span><Clock size={12} /> Última interação há {ago(l.lastInteractionAt || l.createdAt)}</span>
                    </div>
                    <div className="crm-card-foot" onClick={(e) => e.stopPropagation()}>
                      <span className="crm-owner" title={l.ownerName || ""}>{l.ownerAvatar ? <img src={l.ownerAvatar} alt="" /> : initials(l.ownerName)}</span>
                      {l.phone && <a href={`https://wa.me/${l.phone}`} target="_blank" rel="noreferrer" title="WhatsApp"><MessageCircle size={15} /></a>}
                      {l.phone && <a href={`tel:+${l.phone}`} title="Ligar"><Phone size={15} /></a>}
                      <span className="crm-created">Criado há {ago(l.createdAt)}</span>
                    </div>
                  </div>
                ))}
                <button className="crm-add" onClick={() => setOpen({ isNew: true, stage: st.id })}><Plus size={14} /> Adicionar</button>
              </div>
            </div>
          );
        })}
      </div>

      {open && <LeadSheet ctx={ctx} lead={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
      {editCol && (
        <Sheet title={editCol.id ? "Editar coluna" : "Nova coluna"} onClose={() => setEditCol(null)} width={440}
          footer={<><Button variant="secondary" onClick={() => setEditCol(null)}>Cancelar</Button><Button onClick={saveCol}>Salvar</Button></>}>
          <Group><Row label="Nome"><input autoFocus value={editCol.name} onChange={(e) => setEditCol((c) => ({ ...c, name: e.target.value }))} placeholder="Ex: Qualificação" /></Row></Group>
          <Group title="Cor"><ColorPicker value={editCol.color} onChange={(c) => setEditCol((x) => ({ ...x, color: c }))} /></Group>
        </Sheet>
      )}
      {newPipe && <NewPipelineSheet onClose={() => setNewPipe(false)} onCreated={(p) => { setNewPipe(false); loadPipelines().then(() => setPipelineId(p.id)); }} />}
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
  const [err, setErr] = useState(null);
  const save = async () => {
    try { onCreated(await crm.createPipeline({ name })); } catch (e) { setErr(errText(e)); }
  };
  return (
    <Sheet title="Novo funil" subtitle="Ex.: Pré-vendas, Renovações, Parcerias. Começa com as colunas padrão." onClose={onClose} width={460}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!name.trim()} onClick={save}>Criar funil</Button></>}>
      <Group><Row label="Nome"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Pré-vendas" /></Row></Group>
      {err && <div className="admin-feedback error" style={{ marginTop: 12 }}>{err}</div>}
    </Sheet>
  );
}

// ================================================================ Lead
function LeadSheet({ ctx, lead, onClose, onSaved }) {
  const { pipeline, pipelines, tags, products, team, isManager } = ctx;
  const isNew = !!lead.isNew;
  const [f, setF] = useState({
    name: lead.name || "", phone: lead.phone || "", email: lead.email || "", company: lead.company || "",
    value: lead.value ?? "", ownerId: lead.ownerId || "", source: lead.source || "", notes: lead.notes || "",
    stage: lead.stage || pipeline?.stages?.[0]?.id, pipelineId: lead.pipelineId || pipeline?.id, tagIds: lead.tagIds || []
  });
  const [items, setItems] = useState((lead.products || []).map((p) => ({ productId: p.productId, qty: p.qty, price: p.price })));
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
      const body = { ...f, ownerId: f.ownerId || undefined };
      const saved = isNew ? await crm.createLead(body) : await crm.updateLead(lead.id, body);
      const prev = JSON.stringify((lead.products || []).map((p) => [p.productId, p.qty, p.price]));
      const now = JSON.stringify(items.map((i) => [i.productId, Number(i.qty), Number(i.price)]));
      if (prev !== now) await crm.setLeadProducts(saved.id, items);
      onSaved();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const remove = async () => {
    if (!confirm(`Excluir o lead "${lead.name}"?`)) return;
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
      <Group title="Contato">
        <Row label="Nome"><input autoFocus={isNew} value={f.name} onChange={set("name")} placeholder="Obrigatório" /></Row>
        <Row label="Empresa"><input value={f.company} onChange={set("company")} placeholder="Opcional" /></Row>
        <Row label="WhatsApp"><input value={f.phone} onChange={set("phone")} placeholder="55 61 99999-9999" inputMode="tel" /></Row>
        <Row label="E-mail"><input value={f.email} onChange={set("email")} placeholder="email@empresa.com" inputMode="email" /></Row>
        <Row label="Origem"><input value={f.source} onChange={set("source")} placeholder="Instagram, indicação…" /></Row>
      </Group>
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
              {products.filter((p) => p.active || p.id === it.productId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" min="1" value={it.qty} onChange={(e) => setItems((c) => c.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} title="Quantidade" />
            <input value={it.price} onChange={(e) => setItems((c) => c.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(",", ".") } : x)))} title="Preço" inputMode="decimal" />
            <button type="button" className="icon-btn" onClick={() => setItems((c) => c.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
        ))}
        <div style={{ padding: "8px 12px" }}>
          <Button variant="ghost" onClick={() => setItems((c) => [...c, { productId: "", qty: 1, price: 0 }])} disabled={!products.length}><Plus size={14} /> Adicionar produto</Button>
        </div>
      </Group>
      {!isNew && (
        <Group title="Agenda">
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
        </Group>
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
        <Button variant="secondary" onClick={() => setImporting(true)}><Upload size={15} /> Importar Excel</Button>
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
      {open && <LeadSheet ctx={ctx} lead={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
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

  const readFile = async (file) => {
    setErr(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      if (!data.length) throw new Error("A planilha está vazia.");
      const hs = Object.keys(data[0]);
      const guess = {};
      for (const [field, keys] of Object.entries(FIELD_GUESS)) {
        const h = hs.find((x) => keys.some((k) => x.toLowerCase().trim().includes(k)));
        if (h) guess[field] = h;
      }
      setHeaders(hs);
      setMap(guess);
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
      </Group>
      {rows && (
        <>
          <Group title="Colunas da planilha" hint="Confira qual coluna vai para cada campo. Tags separadas por vírgula viram tags do CRM.">
            {Object.keys(FIELD_GUESS).map((field) => (
              <Row key={field} label={FIELD_LABEL[field]}>
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
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
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
          ? <Button variant="secondary" title={g.email || ""} onClick={async () => { if (confirm("Desconectar sua conta Google?")) { await googleDisconnectApi(); setG((x) => ({ ...x, connected: false })); } }}>🟢 Google Agenda</Button>
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
                  <button className="crm-event-del" onClick={async (ev) => { ev.stopPropagation(); if (confirm("Excluir este agendamento?")) { await crm.deleteEvent(e.id); load(); } }}><Trash2 size={11} /></button>
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

// ================================================================ Produtos
function ProductsView({ ctx }) {
  const { products, loadProducts, isManager } = ctx;
  const [edit, setEdit] = useState(null);
  const save = async () => {
    try {
      if (edit.id) await crm.updateProduct(edit.id, edit); else await crm.createProduct(edit);
      setEdit(null);
      loadProducts();
    } catch (e) { alert(errText(e)); }
  };
  return (
    <>
      <div className="crm-toolbar">
        <span className="cv-muted">Portfólio da empresa. Vincule produtos aos leads para calcular o valor do negócio.</span>
        <div style={{ flex: 1 }} />
        {isManager && <Button onClick={() => setEdit({ name: "", price: "", description: "", recurring: false, active: true })}><Plus size={15} /> Novo produto</Button>}
      </div>
      <div className="ap-list">
        {products.map((p) => (
          <div key={p.id} className="ap-list-row" style={{ cursor: isManager ? "pointer" : "default", opacity: p.active ? 1 : 0.5 }} onClick={() => isManager && setEdit({ ...p })}>
            <span className="ap-avatar" style={{ background: "linear-gradient(135deg,#30d158,#64d2ff)" }}><Package size={17} /></span>
            <div className="ap-list-main"><strong>{p.name}</strong><span>{p.description || (p.recurring ? "Cobrança recorrente" : "Venda única")}{!p.active ? " · inativo" : ""}</span></div>
            <span className="crm-value">{brl(p.price)}{p.recurring ? "/mês" : ""}</span>
          </div>
        ))}
        {!products.length && <div className="ap-empty">Nenhum produto cadastrado.</div>}
      </div>
      {edit && (
        <Sheet title={edit.id ? "Editar produto" : "Novo produto"} onClose={() => setEdit(null)} width={480}
          footer={<>
            {edit.id && <Button variant="danger" style={{ marginRight: "auto" }} onClick={async () => { if (confirm("Excluir este produto?")) { await crm.deleteProduct(edit.id); setEdit(null); loadProducts(); } }}><Trash2 size={14} /></Button>}
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button disabled={!edit.name?.trim()} onClick={save}>Salvar</Button>
          </>}>
          <Group>
            <Row label="Nome"><input autoFocus value={edit.name} onChange={(e) => setEdit((c) => ({ ...c, name: e.target.value }))} placeholder="Ex: Plano Profissional" /></Row>
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
            {edit.id && <Button variant="danger" style={{ marginRight: "auto" }} onClick={async () => { if (confirm("Excluir esta tag?")) { await crm.deleteTag(edit.id); setEdit(null); loadTags(); } }}><Trash2 size={14} /></Button>}
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button disabled={!edit.name?.trim()} onClick={save}>Salvar</Button>
          </>}>
          <Group><Row label="Nome"><input autoFocus value={edit.name} onChange={(e) => setEdit((c) => ({ ...c, name: e.target.value }))} placeholder="Ex: MQL" /></Row></Group>
          <Group title="Cor"><ColorPicker value={edit.color} onChange={(c) => setEdit((x) => ({ ...x, color: c }))} /></Group>
        </Sheet>
      )}
    </>
  );
}
