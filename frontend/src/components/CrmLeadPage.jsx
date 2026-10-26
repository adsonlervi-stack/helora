import React, { useEffect, useMemo, useRef, useState } from "react";
import { SelectField, ProductOptions, makeAddOption } from "./CrmFieldBits.jsx";
import { createPortal } from "react-dom";
import {
  X, ListTodo, MessageCircle, CalendarDays, Paperclip, Phone, FileText, CheckSquare, StickyNote, Trash2, MoreHorizontal, Plus, Check,
  Building2, User, Tag, Flag, Package, Mail, ChevronDown, ChevronUp, ExternalLink, Trophy, ThumbsDown, RotateCcw, ArrowRight, Clock, Send
} from "lucide-react";
import { crm, createTaskApi } from "../api.js";
import { askConfirm, askPrompt, notify } from "../dialogs.js";

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const errText = (e) => e?.response?.data?.error || e?.message || "Erro";
const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const fmtPhone = (p) => {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d ? `+${d}` : "";
};
const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso || Date.now()).getTime()) / 86400000));
const when = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Hoje às ${hm}`;
  if (d.toDateString() === y.toDateString()) return `Ontem às ${hm}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined })} às ${hm}`;
};
const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const daysUntil = (d) => { if (!d) return null; return Math.round((new Date(`${String(d).slice(0, 10)}T12:00:00`) - new Date()) / 86400000); };
const EV_KIND = { reuniao: "Reunião", call: "Ligação", followup: "Follow-up", tarefa: "Tarefa" };
const WON_RE = /fechad|ganh|vendid|conclu/i;
const LOST_RE = /perdid|cancel|desist/i;

/** Card do CRM aberto em tela cheia (modelo Pipedrive): etapas no topo, resumo à esquerda, atividades e histórico à direita. */
export default function CrmLeadPage({ ctx, lead: initial, onClose, onChanged }) {
  const { pipelines, tags, products, team, isManager } = ctx;
  const [lead, setLead] = useState(initial);
  const [f, setF] = useState(() => pick(initial));
  const [custom, setCustom] = useState(initial.custom || {});
  const [items, setItems] = useState((initial.products || []).map((p) => ({ productId: p.productId, qty: p.qty, price: p.price })));
  const [checklist, setChecklist] = useState(initial.checklist || []);
  const [events, setEvents] = useState([]);
  const [tab, setTab] = useState("note");
  const [histFilter, setHistFilter] = useState("all");
  const [saving, setSaving] = useState("");
  const [open, setOpen] = useState({ resumo: true, produtos: true, detalhes: true, contato: true });
  const [menu, setMenu] = useState(false);
  const fileRef = useRef(null);
  const dirty = useRef(false);
  const timer = useRef(null);

  const pipe = pipelines.find((p) => p.id === f.pipelineId) || pipelines[0];
  const stages = pipe?.stages || [];
  const stageIdx = stages.findIndex((s) => s.id === f.stage);
  const total = items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.price) || 0), 0);
  const value = items.length ? total : Number(String(f.value).replace(",", ".")) || 0;
  const changed = (l) => { setLead(l); onChanged?.(l); };

  useEffect(() => {
    crm.lead(initial.id).then((l) => { setLead(l); }).catch(() => {});
    loadEvents();
    const k = (e) => e.key === "Escape" && !document.querySelector(".hl-modal") && close();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, []);
  const loadEvents = () => crm.events({ leadId: initial.id }).then(setEvents).catch(() => {});

  // ---- salvamento automático ----
  const persist = async (patch) => {
    setSaving("Salvando…");
    try {
      const saved = await crm.updateLead(lead.id, patch);
      changed(saved);
      setSaving("Salvo");
      setTimeout(() => setSaving((s) => (s === "Salvo" ? "" : s)), 1500);
      return saved;
    } catch (e) { setSaving(""); notify(errText(e), "error"); return null; }
  };
  const schedule = () => {
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  };
  const latest = useRef({});
  latest.current = { f, custom, checklist, items };
  const flush = async () => {
    if (!dirty.current) return;
    dirty.current = false;
    const { f: ff, custom: cc, checklist: ck } = latest.current;
    await persist({ name: ff.name, phone: ff.phone, email: ff.email, company: ff.company, source: ff.source, value: ff.value, tagIds: ff.tagIds, custom: cc, checklist: ck, expectedClose: ff.expectedClose || null, ownerId: ff.ownerId || null });
  };
  const setField = (k, v) => { setF((c) => ({ ...c, [k]: v })); schedule(); };
  const saveProducts = async (next) => {
    setItems(next);
    try { await crm.setLeadProducts(lead.id, next.filter((i) => i.productId)); const l = await crm.lead(lead.id); changed(l); } catch (e) { notify(errText(e), "error"); }
  };
  const close = async () => { clearTimeout(timer.current); await flush(); onClose(); };

  const moveStage = async (st) => {
    if (st.id === f.stage) return;
    setF((c) => ({ ...c, stage: st.id }));
    await persist({ stage: st.id, pipelineId: f.pipelineId });
  };
  const changePipeline = async (pid) => {
    const p = pipelines.find((x) => x.id === pid);
    const st = p?.stages?.[0]?.id;
    setF((c) => ({ ...c, pipelineId: pid, stage: st }));
    await persist({ pipelineId: pid, stage: st });
  };
  const setOutcome = async (o) => {
    let reason = null;
    if (o === "lost") {
      reason = await askPrompt("Motivo da perda (opcional)", "", { okText: "Marcar como perdido" });
      if (reason === null) return;
    }
    const target = o === "won" ? stages.find((s) => WON_RE.test(s.name)) : o === "lost" ? stages.find((s) => LOST_RE.test(s.name)) : null;
    const patch = { outcome: o, ...(o === "lost" ? { lostReason: reason || null } : {}), ...(target ? { stage: target.id, pipelineId: f.pipelineId } : {}) };
    if (target) setF((c) => ({ ...c, stage: target.id }));
    const s = await persist(patch);
    if (s) notify(o === "won" ? "Negócio ganho! 🎉" : o === "lost" ? "Marcado como perdido." : "Negócio reaberto.", o === "won" ? "success" : undefined);
  };
  const remove = async () => {
    if (!await askConfirm(`Excluir o negócio "${lead.name}"? Não dá para desfazer.`)) return;
    try { await crm.deleteLead(lead.id); onChanged?.(null); onClose(); } catch (e) { notify(errText(e), "error"); }
  };
  const openConversation = async () => {
    try {
      await flush();
      const r = await crm.openLeadConversation(lead.id);
      onClose();
      ctx.onOpenConversation?.(r.conversationId);
    } catch (e) { notify(errText(e), "error"); }
  };
  const addFiles = async (list) => {
    for (const file of list) {
      try { changed(await crm.uploadLeadFile(lead.id, file)); } catch (e) { notify(errText(e), "error"); }
    }
  };
  const delFile = async (fl) => {
    if (!await askConfirm(`Remover o anexo "${fl.name}"?`)) return;
    try { changed(await crm.deleteLeadFile(lead.id, fl.id)); } catch (e) { notify(errText(e), "error"); }
  };
  const addProduct = async () => {
    if (products.length) {
      const p = products.find((x) => x.active) || products[0];
      return saveProducts([...items, { productId: p.id, qty: 1, price: p.price }]);
    }
    const name = await askPrompt("Nome do produto ou serviço", "", { okText: "Continuar" });
    if (!name || !name.trim()) return;
    const priceTxt = await askPrompt("Preço (R$)", "", { okText: "Adicionar" });
    if (priceTxt === null) return;
    const price = Number(String(priceTxt).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")) || 0;
    try {
      const prod = await crm.createProduct({ name: name.trim(), price, active: true });
      await ctx.loadProducts();
      saveProducts([...items, { productId: prod.id, qty: 1, price }]);
    } catch (e) { notify(errText(e), "error"); }
  };

  // ---- Foco e histórico ----
  const pendingEvents = events.filter((e) => !e.done).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const stageName = (pid, sid) => pipelines.find((p) => p.id === pid)?.stages?.find((s) => s.id === sid)?.name || pipelines.flatMap((p) => p.stages || []).find((s) => s.id === sid)?.name || sid || "—";
  const memberName = (id) => team.find((m) => m.id === id)?.name || "ninguém";
  const history = useMemo(() => {
    const h = (lead.history || []).map((x) => ({ ...x, cat: x.type === "note" || x.type === "whats" ? "notes" : x.type === "file" ? "files" : "changes" }));
    for (const e of events) h.push({ id: `ev-${e.id}`, type: "event", at: e.startsAt, ev: e, cat: "activities" });
    for (const a of lead.attachments || []) if (!h.some((x) => x.type === "file" && x.url === a.url)) h.push({ id: `f-${a.id}`, type: "file", text: a.name, url: a.url, by: a.by, at: a.at, cat: "files" });
    if (lead.notes && !h.some((x) => x.type === "note" && x.text === lead.notes)) h.push({ id: "legacy-note", type: "note", text: lead.notes, at: lead.createdAt, legacy: true, cat: "notes" });
    h.push({ id: "created", type: "created", at: lead.createdAt, cat: "changes" });
    return h.sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [lead, events]);
  const shownHistory = histFilter === "all" ? history : history.filter((x) => x.cat === histFilter);
  const counts = { notes: history.filter((x) => x.cat === "notes").length, activities: history.filter((x) => x.cat === "activities").length, files: history.filter((x) => x.cat === "files").length };

  const outcome = lead.outcome;
  const tagById = new Map(tags.map((t) => [t.id, t]));

  return createPortal(
    <div className="lp-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="lp">
        {/* ---------- Cabeçalho ---------- */}
        <header className="lp-head">
          <div className="lp-title">
            <input value={f.name} onChange={(e) => setField("name", e.target.value)} placeholder="Nome do negócio" />
            {outcome && <span className={`lp-outcome ${outcome}`}>{outcome === "won" ? "Ganho" : "Perdido"}{lead.lostReason ? ` · ${lead.lostReason}` : ""}</span>}
          </div>
          <div className="lp-head-right">
            <span className="lp-saving">{saving}</span>
            <label className="lp-owner" title="Responsável">
              <span className="lp-av">{initials(memberName(f.ownerId) === "ninguém" ? "?" : memberName(f.ownerId))}</span>
              <span><strong>{f.ownerId ? memberName(f.ownerId) : "Sem responsável"}</strong><small>Responsável</small></span>
              <ChevronDown size={14} />
              <select value={f.ownerId || ""} disabled={!isManager} onChange={(e) => setField("ownerId", e.target.value)}>
                <option value="">Sem responsável</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
            </label>
            {outcome ? (
              <button className="lp-btn" onClick={() => setOutcome(null)}><RotateCcw size={15} /> Reabrir</button>
            ) : (
              <>
                <button className="lp-btn won" onClick={() => setOutcome("won")}><Trophy size={15} /> Ganho</button>
                <button className="lp-btn lost" onClick={() => setOutcome("lost")}><ThumbsDown size={15} /> Perdido</button>
              </>
            )}
            <div className="lp-menu-wrap">
              <button className="lp-icon" onClick={() => setMenu((v) => !v)} title="Mais"><MoreHorizontal size={18} /></button>
              {menu && (
                <div className="lp-menu" onMouseLeave={() => setMenu(false)}>
                  <button onClick={() => { setMenu(false); remove(); }} className="danger"><Trash2 size={14} /> Excluir negócio</button>
                </div>
              )}
            </div>
            <button className="lp-icon" onClick={close} title="Fechar (Esc)"><X size={18} /></button>
          </div>
        </header>

        {/* ---------- Barra de etapas ---------- */}
        <div className="lp-stages">
          {stages.map((s, i) => (
            <button key={s.id} className={`lp-stage ${i < stageIdx ? "past" : ""} ${i === stageIdx ? "cur" : ""}`} style={i <= stageIdx ? { "--c": s.color || "#34c759" } : undefined} onClick={() => moveStage(s)} title={`Mover para ${s.name}`}>
              <span>{i === stageIdx ? `${daysSince(lead.stageChangedAt)} dia${daysSince(lead.stageChangedAt) === 1 ? "" : "s"} · ${s.name}` : s.name}</span>
            </button>
          ))}
        </div>
        <div className="lp-crumb">
          <select value={f.pipelineId} onChange={(e) => changePipeline(e.target.value)}>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ArrowRight size={13} />
          <span>{stages[stageIdx]?.name || "—"}</span>
        </div>

        <div className="lp-body">
          {/* ---------- Coluna esquerda ---------- */}
          <aside className="lp-left">
            <Section title="Resumo" open={open.resumo} onToggle={() => setOpen((o) => ({ ...o, resumo: !o.resumo }))}>
              <div className="lp-sum-row">
                <span className="lp-sum-ico">R$</span>
                {items.length ? <strong className="lp-value">{brl(total)}</strong> : (
                  <input className="lp-inline lp-value" value={f.value} onChange={(e) => setField("value", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Valor" inputMode="decimal" />
                )}
                <button className="lp-link" onClick={addProduct}><Plus size={13} /> Produtos</button>
              </div>
              <div className="lp-sum-row">
                <Building2 size={16} className="lp-sum-ico" />
                <input className="lp-inline lp-blue" value={f.company} onChange={(e) => setField("company", e.target.value)} placeholder="Adicionar empresa" />
              </div>
              <div className="lp-sum-row">
                <User size={16} className="lp-sum-ico" />
                <span className="lp-blue">{f.name || "—"}</span>
                {f.phone && <span className="lp-muted">{fmtPhone(f.phone)}</span>}
              </div>
              <div className="lp-sum-row lp-tags">
                <Tag size={16} className="lp-sum-ico" />
                <div className="lp-chips">
                  {f.tagIds.map((id) => tagById.get(id)).filter(Boolean).map((t) => (
                    <span key={t.id} className="lp-chip" style={{ "--c": t.color }}>{t.name}<button onClick={() => setField("tagIds", f.tagIds.filter((x) => x !== t.id))}><X size={10} /></button></span>
                  ))}
                  {tags.filter((t) => !f.tagIds.includes(t.id)).length > 0 && (
                    <select className="lp-tag-add" value="" onChange={(e) => e.target.value && setField("tagIds", [...f.tagIds, e.target.value])}>
                      <option value="">{f.tagIds.length ? "+" : "Adicionar etiquetas"}</option>
                      {tags.filter((t) => !f.tagIds.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                  {!tags.length && <span className="lp-muted">Crie etiquetas na aba Tags</span>}
                </div>
              </div>
              <div className="lp-sum-row">
                <Flag size={16} className="lp-sum-ico" />
                <input type="date" className="lp-inline" value={f.expectedClose || ""} onChange={(e) => setField("expectedClose", e.target.value)} title="Previsão de fechamento" />
                {f.expectedClose && <span className={`lp-due ${daysUntil(f.expectedClose) < 0 ? "late" : ""}`}>{daysUntil(f.expectedClose) < 0 ? "atrasado" : `em ${daysUntil(f.expectedClose)}d`}</span>}
              </div>
              {lead.conversationId && (
                <div className="lp-sum-row">
                  <MessageCircle size={16} className="lp-sum-ico" />
                  <button className="lp-link" onClick={openConversation}>Ver conversa no WhatsApp</button>
                </div>
              )}
            </Section>

            <Section title={`Produtos${items.length ? ` · ${items.length}` : ""}`} open={open.produtos} onToggle={() => setOpen((o) => ({ ...o, produtos: !o.produtos }))}>
              {items.map((it, i) => (
                <div key={i} className="lp-prod">
                  <select value={it.productId} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); saveProducts(items.map((x, j) => (j === i ? { ...x, productId: e.target.value, price: p?.price ?? x.price } : x))); }}>
                    <ProductOptions products={products} currentId={it.productId} />
                  </select>
                  <input type="number" min="1" value={it.qty} onChange={(e) => setItems((c) => c.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} onBlur={() => saveProducts(items)} title="Qtd" />
                  <input value={it.price} onChange={(e) => setItems((c) => c.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(",", ".") } : x)))} onBlur={() => saveProducts(items)} title="Preço" inputMode="decimal" />
                  <button className="lp-icon sm" onClick={() => saveProducts(items.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
                </div>
              ))}
              {items.length > 0 && <div className="lp-prod-total">Total <strong>{brl(total)}</strong></div>}
              <button className="lp-add" onClick={addProduct}><Package size={14} /> {products.length ? "Adicionar produto" : "Cadastrar produto"}</button>
            </Section>

            <Section title="Detalhes" open={open.detalhes} onToggle={() => setOpen((o) => ({ ...o, detalhes: !o.detalhes }))}>
              {(pipe?.fields || []).length ? pipe.fields.map((fd) => {
                const v = custom[fd.id] ?? "";
                const setV = (val) => { setCustom((c) => ({ ...c, [fd.id]: val })); schedule(); };
                return (
                  <label key={fd.id} className={`lp-field ${fd.type === "textarea" ? "stack" : ""}`}>
                    <span>{fd.label}</span>
                    {fd.type === "select" ? (
                      <SelectField fd={fd} value={v} onChange={setV} custom={custom} onAddOption={makeAddOption(ctx, pipe, custom)} />
                    ) : fd.type === "textarea" ? (
                      <textarea rows={3} value={v} onChange={(e) => setV(e.target.value)} />
                    ) : fd.type === "date" ? (
                      <input type="date" value={v} onChange={(e) => setV(e.target.value)} />
                    ) : (
                      <input value={v} onChange={(e) => setV(e.target.value)} inputMode={fd.type === "number" || fd.type === "currency" ? "decimal" : undefined} placeholder="—" />
                    )}
                  </label>
                );
              }) : <p className="lp-muted lp-pad">Este funil não tem campos personalizados. Crie em “Campos” no funil.</p>}
            </Section>

            <Section title="Pessoa" open={open.contato} onToggle={() => setOpen((o) => ({ ...o, contato: !o.contato }))}>
              <label className="lp-field"><span>Telefone</span><input value={f.phone} onChange={(e) => setField("phone", e.target.value)} inputMode="tel" placeholder="55 61 99999-9999" /></label>
              <label className="lp-field"><span>E-mail</span><input value={f.email} onChange={(e) => setField("email", e.target.value)} inputMode="email" placeholder="—" /></label>
              <label className="lp-field"><span>Origem</span><input value={f.source} onChange={(e) => setField("source", e.target.value)} placeholder="Instagram, site…" /></label>
              <div className="lp-quick">
                <button onClick={openConversation} disabled={!f.phone}><MessageCircle size={15} /> WhatsApp</button>
                {f.phone && <a href={`tel:+${String(f.phone).replace(/\D/g, "")}`}><Phone size={15} /> Ligar</a>}
                {f.email && <a href={`mailto:${f.email}`}><Mail size={15} /> E-mail</a>}
              </div>
            </Section>
          </aside>

          {/* ---------- Coluna direita ---------- */}
          <main className="lp-right">
            <div className="lp-composer">
              <div className="lp-tabs">
                {[
                  ["note", StickyNote, "Anotações"], ["task", ListTodo, "Tarefa"], ["activity", CalendarDays, "Atividade"], ["whats", MessageCircle, "WhatsApp"],
                  ["files", Paperclip, "Arquivos"], ["check", CheckSquare, "Checklist"]
                ].map(([k, Ic, l]) => (
                  <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><Ic size={15} /> {l}</button>
                ))}
              </div>
              <div className="lp-tab-body">
                {tab === "note" && <NoteBox onSave={async (t) => { try { changed(await crm.addLeadNote(lead.id, t)); return true; } catch (e) { notify(errText(e), "error"); return false; } }} />}
                {tab === "task" && (
                  <TaskBox team={team} defaultOwner={f.ownerId} leadName={f.name}
                    onSave={async (t) => {
                      try {
                        await createTaskApi({
                          title: t.title, dueAt: t.due ? new Date(t.due).toISOString() : null, assigneeId: t.assigneeId || undefined,
                          conversationId: lead.conversationId || undefined,
                          description: [t.description, `Lead do CRM: ${f.name}`, pipe?.name ? `Funil: ${pipe.name}` : "", f.phone ? `WhatsApp: ${f.phone}` : ""].filter(Boolean).join("\n")
                        });
                        try { changed(await crm.addLeadNote(lead.id, `📌 Tarefa criada: ${t.title}${t.due ? ` (prazo ${new Date(t.due).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })})` : ""}`)); } catch {}
                        notify("Tarefa criada na aba Tarefas.", "success");
                        return true;
                      } catch (e) { notify(errText(e), "error"); return false; }
                    }} />
                )}
                {tab === "activity" && <ActivityBox onSave={async (ev) => { try { await crm.createEvent({ ...ev, leadId: lead.id, startsAt: new Date(ev.startsAt).toISOString() }); loadEvents(); notify("Atividade agendada.", "success"); return true; } catch (e) { notify(errText(e), "error"); return false; } }} />}
                {tab === "whats" && (
                  <MessageBox
                    ctx={ctx} pipe={pipe} lead={lead} f={f} custom={custom} value={value} stageName={stages[stageIdx]?.name || ""} ownerName={f.ownerId ? memberName(f.ownerId) : ""}
                    onOpen={openConversation}
                    onSend={async (text) => {
                      try { await flush(); const r = await crm.sendLeadMessage(lead.id, text); changed(r.lead); notify("Mensagem enviada pelo WhatsApp.", "success"); return true; }
                      catch (e) { notify(errText(e), "error"); return false; }
                    }}
                  />
                )}
                {tab === "files" && (
                  <div className="lp-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const l = [...(e.dataTransfer.files || [])]; l.length && addFiles(l); }} onClick={() => fileRef.current?.click()}>
                    <Paperclip size={18} /> Clique ou arraste arquivos aqui (apólice, proposta, documentos…)
                  </div>
                )}
                {tab === "check" && (
                  <Checklist list={checklist} onChange={(l) => { setChecklist(l); schedule(); }} />
                )}
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; l.length && addFiles(l); }} />
              </div>
            </div>

            {/* Foco */}
            <h3 className="lp-h3">Foco</h3>
            {pendingEvents.length || checklist.some((c) => !c.done) ? (
              <div className="lp-focus">
                {pendingEvents.map((ev) => {
                  const late = new Date(ev.startsAt) < new Date();
                  return (
                    <div key={ev.id} className="lp-focus-item">
                      <button className="lp-round" onClick={async () => { await crm.updateEvent(ev.id, { done: true }); loadEvents(); }} title="Concluir" />
                      <div>
                        <strong>{ev.title}</strong>
                        <span className={late ? "late" : ""}><Clock size={12} /> {when(ev.startsAt)} · {EV_KIND[ev.kind] || ev.kind}</span>
                      </div>
                    </div>
                  );
                })}
                {checklist.filter((c) => !c.done).map((c) => (
                  <div key={c.id} className="lp-focus-item">
                    <button className="lp-round" onClick={() => { const l = checklist.map((x) => (x.id === c.id ? { ...x, done: true } : x)); setChecklist(l); schedule(); }} title="Marcar feito" />
                    <div><strong>{c.text}</strong><span><CheckSquare size={12} /> Checklist</span></div>
                  </div>
                ))}
              </div>
            ) : <div className="lp-empty">Nada pendente. Agende a próxima atividade para não perder o negócio de vista.</div>}

            {/* Histórico */}
            <h3 className="lp-h3">Histórico</h3>
            <div className="lp-hfilter">
              {[["all", "Todos"], ["notes", `Anotações (${counts.notes})`], ["activities", `Atividades (${counts.activities})`], ["files", `Arquivos (${counts.files})`], ["changes", "Alterações"]].map(([k, l]) => (
                <button key={k} className={histFilter === k ? "on" : ""} onClick={() => setHistFilter(k)}>{l}</button>
              ))}
            </div>
            <div className="lp-timeline">
              {shownHistory.map((h) => (
                <div key={h.id} className={`lp-tl ${h.type}`}>
                  <span className="lp-tl-dot">{h.type === "whats" ? <MessageCircle size={13} /> : h.type === "note" ? <StickyNote size={13} /> : h.type === "file" ? <Paperclip size={13} /> : h.type === "event" ? <CalendarDays size={13} /> : <ArrowRight size={13} />}</span>
                  <div className="lp-tl-body">
                    {h.type === "note" && (
                      <div className="lp-note">
                        <p>{h.text}</p>
                        {!h.legacy && <button className="lp-link sm" onClick={async () => { if (await askConfirm("Apagar esta anotação?")) { try { changed(await crm.deleteLeadNote(lead.id, h.id)); } catch (e) { notify(errText(e), "error"); } } }}>apagar</button>}
                      </div>
                    )}
                    {h.type === "file" && (
                      <div className="lp-file">
                        <a href={h.url} target="_blank" rel="noreferrer"><FileText size={14} /> {h.text}</a>
                        {(lead.attachments || []).find((a) => a.url === h.url) && <button className="lp-icon sm" onClick={() => delFile((lead.attachments || []).find((a) => a.url === h.url))}><Trash2 size={13} /></button>}
                      </div>
                    )}
                    {h.type === "whats" && <div className="lp-note whats"><p>{h.text}</p></div>}
                    {h.type === "event" && <div className="lp-tl-text"><strong>{h.ev.title}</strong> · {EV_KIND[h.ev.kind] || h.ev.kind}{h.ev.done ? " · feito ✓" : ""}</div>}
                    {h.type === "stage" && <div className="lp-tl-text">Etapa: {stageName(h.fromPipeline, h.from)} <ArrowRight size={12} /> <strong>{stageName(h.toPipeline, h.to)}</strong></div>}
                    {h.type === "owner" && <div className="lp-tl-text">Responsável: <strong>{memberName(h.to)}</strong></div>}
                    {h.type === "value" && <div className="lp-tl-text">Valor: {brl(h.from)} <ArrowRight size={12} /> <strong>{brl(h.to)}</strong></div>}
                    {h.type === "outcome" && <div className="lp-tl-text">{h.to === "won" ? "🏆 Marcado como ganho" : h.to === "lost" ? `Marcado como perdido${h.reason ? `: ${h.reason}` : ""}` : "Negócio reaberto"}</div>}
                    {h.type === "created" && <div className="lp-tl-text">Negócio criado{lead.source ? ` · origem: ${lead.source}` : ""}</div>}
                    <small>{when(h.at)}{h.by ? ` · ${h.by}` : ""}</small>
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>,
    document.body
  );
}

function pick(l) {
  return {
    name: l.name || "", phone: l.phone || "", email: l.email || "", company: l.company || "", value: l.value ?? "",
    ownerId: l.ownerId || "", source: l.source || "", stage: l.stage, pipelineId: l.pipelineId, tagIds: l.tagIds || [],
    expectedClose: l.expectedClose || ""
  };
}

function Section({ title, open, onToggle, children }) {
  return (
    <section className="lp-sec">
      <button className="lp-sec-head" onClick={onToggle}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {title}</button>
      {open && <div className="lp-sec-body">{children}</div>}
    </section>
  );
}

function NoteBox({ onSave }) {
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => { if (!t.trim()) return; setBusy(true); if (await onSave(t.trim())) setT(""); setBusy(false); };
  return (
    <div className="lp-notebox">
      <textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder="Escreva uma anotação: o que o cliente disse, próximos passos…" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(); }} />
      <div className="lp-row-end"><button className="lp-primary" disabled={!t.trim() || busy} onClick={go}><Send size={14} /> Salvar anotação</button></div>
    </div>
  );
}

function TaskBox({ team, defaultOwner, leadName, onSave }) {
  const tomorrow = () => { const d = new Date(Date.now() + 86400000); d.setHours(9, 0, 0, 0); return toLocalInput(d); };
  const [t, setT] = useState({ title: "", due: tomorrow(), assigneeId: defaultOwner || "", description: "" });
  const [busy, setBusy] = useState(false);
  const title = t.title.trim() || `Retornar para ${leadName || "o cliente"}`;
  return (
    <div className="lp-activity">
      <input value={t.title} onChange={(e) => setT((c) => ({ ...c, title: e.target.value }))} placeholder={title} />
      <textarea rows={2} value={t.description} onChange={(e) => setT((c) => ({ ...c, description: e.target.value }))} placeholder="Detalhes (opcional)" />
      <div className="lp-row-end">
        <select value={t.assigneeId} onChange={(e) => setT((c) => ({ ...c, assigneeId: e.target.value }))}>
          <option value="">Eu</option>
          {team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
        </select>
        <input type="datetime-local" value={t.due} onChange={(e) => setT((c) => ({ ...c, due: e.target.value }))} />
        <button className="lp-primary" disabled={busy} onClick={async () => { setBusy(true); if (await onSave({ ...t, title })) setT({ title: "", due: tomorrow(), assigneeId: defaultOwner || "", description: "" }); setBusy(false); }}><ListTodo size={14} /> Criar tarefa</button>
      </div>
    </div>
  );
}

function ActivityBox({ onSave }) {
  const [ev, setEv] = useState({ kind: "reuniao", title: "Reunião", startsAt: toLocalInput(new Date(Date.now() + 86400000)) });
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState([]);
  useEffect(() => { crm.activityKinds().then((l) => setCustom(Array.isArray(l) ? l : [])).catch(() => {}); }, []);
  const label = (k) => EV_KIND[k] || k;
  const kinds = [...Object.keys(EV_KIND).filter((k) => k !== "tarefa"), ...custom];
  const pick = (k) => setEv((c) => ({ ...c, kind: k, title: !c.title.trim() || c.title === label(c.kind) ? label(k) : c.title }));
  const addKind = async () => {
    const name = await askPrompt("Nome do novo tipo de atividade", "", { okText: "Criar" });
    const n = String(name || "").trim().slice(0, 40);
    if (!n) return;
    if (!kinds.some((k) => label(k).toLowerCase() === n.toLowerCase())) setCustom((l) => [...l, n]);
    const existing = kinds.find((k) => label(k).toLowerCase() === n.toLowerCase());
    pick(existing || n);
  };
  return (
    <div className="lp-activity">
      <div className="lp-kinds">
        {kinds.map((k) => (
          <button key={k} className={ev.kind === k ? "on" : ""} onClick={() => pick(k)}>{label(k)}</button>
        ))}
        <button onClick={addKind} title="Criar outro tipo de atividade (ex.: Visita, Vistoria, Assinatura)"><Plus size={13} /> Novo tipo</button>
      </div>
      <input value={ev.title} onChange={(e) => setEv((c) => ({ ...c, title: e.target.value }))} placeholder="Título" />
      <div className="lp-row-end">
        <input type="datetime-local" value={ev.startsAt} onChange={(e) => setEv((c) => ({ ...c, startsAt: e.target.value }))} />
        <button className="lp-primary" disabled={busy || !ev.title.trim()} onClick={async () => { setBusy(true); await onSave(ev); setBusy(false); }}><CalendarDays size={14} /> Agendar</button>
      </div>
    </div>
  );
}

function Checklist({ list, onChange }) {
  const [t, setT] = useState("");
  const add = () => { if (!t.trim()) return; onChange([...list, { id: Math.random().toString(36).slice(2, 10), text: t.trim(), done: false }]); setT(""); };
  const done = list.filter((c) => c.done).length;
  return (
    <div className="lp-check">
      {list.length > 0 && <div className="crm-progress"><span style={{ width: `${Math.round((done / list.length) * 100)}%` }} /></div>}
      {list.map((c) => (
        <div key={c.id} className={`lp-ck ${c.done ? "done" : ""}`}>
          <button className={`lp-round ${c.done ? "on" : ""}`} onClick={() => onChange(list.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}>{c.done && <Check size={11} strokeWidth={3} />}</button>
          <span>{c.text}</span>
          <button className="lp-icon sm" onClick={() => onChange(list.filter((x) => x.id !== c.id))}><X size={13} /></button>
        </div>
      ))}
      <div className="lp-row-end">
        <input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Adicionar item (ex.: pedir documentos)" style={{ flex: 1 }} />
        <button className="lp-primary" onClick={add} disabled={!t.trim()}><Plus size={14} /> Adicionar</button>
      </div>
    </div>
  );
}

const DEFAULT_MESSAGES = [
  { id: "d1", title: "Primeiro contato", text: "Olá {nome}, tudo bem? Aqui é {meu_nome}. Recebi seu contato e queria entender melhor o que você procura. Posso te ajudar agora?" },
  { id: "d2", title: "Cotação pronta", text: "Oi {nome}! Sua cotação ficou pronta. Posso te enviar os detalhes por aqui?" },
  { id: "d3", title: "Follow-up da proposta", text: "Oi {nome}, passando para saber se conseguiu avaliar a proposta. Ficou alguma dúvida que eu possa esclarecer?" },
  { id: "d4", title: "Renovação", text: "Olá {nome}, tudo bem? Seu seguro está perto do vencimento. Já posso preparar a renovação com as melhores condições para você?" }
];
const BASE_VARS = [["nome", "Primeiro nome"], ["nome_completo", "Nome completo"], ["empresa", "Empresa"], ["valor", "Valor"], ["etapa", "Etapa"], ["responsavel", "Responsável"], ["meu_nome", "Seu nome"]];

function MessageBox({ ctx, pipe, lead, f, custom, value, stageName, ownerName, onOpen, onSend }) {
  const saved = pipe?.messages || [];
  const list = saved.length ? saved : DEFAULT_MESSAGES;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState(false);
  const fieldVars = (pipe?.fields || []).map((fd) => [fd.id, fd.label]);
  const fmt = (fd, v) => (fd?.type === "date" && v ? String(v).slice(0, 10).split("-").reverse().join("/") : fd?.type === "currency" && v ? brl(v) : v);
  const fill = (t) => String(t || "")
    .replace(/\{nome\}/g, String(f.name || "").split(" ")[0])
    .replace(/\{nome_completo\}/g, f.name || "")
    .replace(/\{empresa\}/g, f.company || "")
    .replace(/\{valor\}/g, value ? brl(value) : "")
    .replace(/\{etapa\}/g, stageName || "")
    .replace(/\{responsavel\}/g, ownerName || "")
    .replace(/\{meu_nome\}/g, String(ctx.profile?.name || "").split(" ")[0])
    .replace(/\{([a-z0-9_]+)\}/g, (m, k) => { const fd = (pipe?.fields || []).find((x) => x.id === k); return fd ? (custom[k] ? fmt(fd, custom[k]) : m) : m; });
  const missing = (text.match(/\{[a-z0-9_]+\}/g) || []);
  const send = async () => { setBusy(true); if (await onSend(text.trim())) setText(""); setBusy(false); };
  return (
    <div className="lp-msgs">
      <div className="lp-msg-list">
        {list.map((m) => <button key={m.id} className="lp-msg-pill" onClick={() => setText(fill(m.text))} title={m.text}>{m.title}</button>)}
        {ctx.isManager && <button className="lp-msg-pill ghost" onClick={() => setManage(true)}>{saved.length ? "Editar mensagens" : "+ Criar mensagens do funil"}</button>}
      </div>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={f.phone ? "Escolha uma mensagem pronta acima ou escreva aqui…" : "Cadastre o telefone do cliente para enviar mensagens."} />
      {missing.length > 0 && <div className="lp-warn">Faltam dados no card: {missing.join(", ")}. Preencha o campo ou edite o texto antes de enviar.</div>}
      <div className="lp-row-end">
        <button className="lp-ghost" onClick={onOpen} disabled={!f.phone}><MessageCircle size={14} /> {lead.conversationId ? "Ver conversa" : "Abrir conversa"}</button>
        <button className="lp-primary" disabled={!f.phone || !text.trim() || busy || missing.length > 0} onClick={send}><Send size={14} /> {busy ? "Enviando…" : "Enviar pelo WhatsApp"}</button>
      </div>
      {manage && <MessagesEditor ctx={ctx} pipe={pipe} initial={saved.length ? saved : DEFAULT_MESSAGES} vars={[...BASE_VARS, ...fieldVars]} onClose={() => setManage(false)} />}
    </div>
  );
}

function MessagesEditor({ ctx, pipe, initial, vars, onClose }) {
  const [list, setList] = useState(initial.map((m) => ({ ...m })));
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(0);
  const refs = useRef([]);
  const insert = (v) => {
    const el = refs.current[focus];
    const tok = `{${v}}`;
    setList((l) => l.map((m, i) => {
      if (i !== focus) return m;
      const pos = el?.selectionStart ?? m.text.length;
      return { ...m, text: m.text.slice(0, pos) + tok + m.text.slice(pos) };
    }));
  };
  const save = async () => {
    setBusy(true);
    try { await crm.updatePipeline(pipe.id, { messages: list.filter((m) => m.title.trim() && m.text.trim()) }); await ctx.loadPipelines(); notify("Mensagens salvas.", "success"); onClose(); }
    catch (e) { notify(errText(e), "error"); }
    setBusy(false);
  };
  return createPortal(
    <div className="lp-overlay top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lp-dialog">
        <div className="lp-dialog-head"><strong>Mensagens prontas · {pipe.name}</strong><button className="lp-icon" onClick={onClose}><X size={16} /></button></div>
        <p className="lp-muted" style={{ margin: "0 0 10px" }}>Clique numa variável para inseri-la na mensagem selecionada. Ela é trocada pelos dados do card na hora de enviar.</p>
        <div className="lp-vars">{vars.map(([k, l]) => <button key={k} onClick={() => insert(k)} title={`{${k}}`}>{l}</button>)}</div>
        <div className="lp-msg-edit-list">
          {list.map((m, i) => (
            <div key={m.id || i} className={`lp-msg-edit ${focus === i ? "on" : ""}`} onClick={() => setFocus(i)}>
              <div className="lp-row-end" style={{ justifyContent: "space-between" }}>
                <input value={m.title} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Nome (ex.: Primeiro contato)" />
                <button className="lp-icon sm" onClick={() => setList((l) => l.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
              </div>
              <textarea ref={(el) => (refs.current[i] = el)} rows={3} value={m.text} onFocus={() => setFocus(i)} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder="Olá {nome}, tudo bem?…" />
            </div>
          ))}
        </div>
        <div className="lp-row-end" style={{ justifyContent: "space-between", marginTop: 12 }}>
          <button className="lp-ghost" onClick={() => { setList((l) => [...l, { id: "", title: "", text: "" }]); setFocus(list.length); }}><Plus size={14} /> Nova mensagem</button>
          <button className="lp-primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar mensagens"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
