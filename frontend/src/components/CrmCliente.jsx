import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, History, Briefcase, Users, Plus, X, Phone, Mail, MessageCircle, Trophy, ThumbsDown } from "lucide-react";
import { crm, integrations } from "../api.js";
import { AgActivity, NoteBox, AG_TABS, EV_KIND, agIcon, EditActivity } from "./CrmLeadPage.jsx";
import MailBox from "./MailBox.jsx";
import { ClientForm } from "./CrmEmpresas.jsx";
import { notify } from "../dialogs.js";

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const errText = (e) => e?.response?.data?.error || e.message;

/** Abre a página do cliente de qualquer lugar: window.dispatchEvent(new CustomEvent("helora:client", { detail: leadId })) */
export const openClient = (leadId) => window.dispatchEvent(new CustomEvent("helora:client", { detail: leadId }));
export const openLead = (leadId) => window.dispatchEvent(new CustomEvent("helora:open-lead", { detail: leadId }));

/** Página do cliente (estilo Agendor): histórico unido, negócios e pessoas, com "Novo negócio". */
export default function CrmCliente({ leadId, ctx, onClose }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("history");
  const [adding, setAdding] = useState(false);
  const [events, setEvents] = useState([]);
  const [act, setAct] = useState("note");
  const [dealId, setDealId] = useState(leadId);
  const [edit, setEdit] = useState(null);
  const [mail, setMail] = useState(null);
  const [editing, setEditing] = useState(false);
  const loadEvents = (ids) => crm.events({}).then((l) => setEvents((l || []).filter((e) => ids.includes(e.leadId)))).catch(() => {});
  const load = () => crm.client(leadId).then((d) => { setData(d); loadEvents(d.deals.map((x) => x.id)); if (!d.deals.some((x) => x.id === dealId)) setDealId(d.deals[0]?.id); }).catch((e) => { notify(errText(e), "error"); onClose(); });
  useEffect(() => { setData(null); load(); }, [leadId]);

  const c = data?.client;
  return createPortal(
    <div className="lp-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cl">
        <header className="cl-head">
          <span className="cl-ico"><Building2 size={22} /></span>
          <div className="cl-who">
            <span className="kind-badge cliente">Cliente</span>
            <h2>{c?.name || "Carregando…"}</h2>
            <small>{[c?.doc && `${c.docType} ${fmtDoc(c.doc)}`, c?.phone && fmtPhone(c.phone), c?.email].filter(Boolean).join(" · ")}</small>
          </div>
          {data && (
            <div className="cl-kpis">
              <span><b>{data.totals.deals}</b> negócios</span>
              <span><b>{data.totals.open}</b> em andamento</span>
              <span><b>{data.totals.won}</b> ganhos</span>
              <span><b>{brl(data.totals.value)}</b></span>
            </div>
          )}
          <button className="lp-icon" onClick={onClose} title="Fechar"><X size={18} /></button>
        </header>
        <nav className="cl-tabs">
          {[["history", History, "Ver histórico"], ["deals", Briefcase, "Ver negócios"], ["people", Users, "Ver pessoas"]].map(([k, I, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><I size={15} /> {l}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button className="cl-add" onClick={() => setAdding(true)} disabled={!data}><Plus size={15} /> Adicionar negócio</button>
        </nav>
        <div className="cl-split">
        <div className="cl-body">
          {data && tab === "history" && !data.deals.length && <div className="cl-pend"><div className="ap-empty">Este cliente ainda não tem negócio. Clique em <b>Adicionar negócio</b> para começar e registrar atividades.</div></div>}
          {data && tab === "history" && data.deals.length > 0 && (
            <div className="cl-deals">
              {data.deals.map((d) => (
                <button key={d.id} className={`cl-dc ${d.outcome || "open"}`} onClick={() => { onClose(); openLead(d.id); }} title="Abrir este negócio para registrar atividades">
                  <small>{d.pipeline}</small>
                  <strong>{d.name}</strong>
                  <span className="cl-dc-row"><span className="cl-stage" style={{ "--c": d.stageColor || "#0071e3" }}>{d.outcome === "won" ? "🏆 Ganho" : d.outcome === "lost" ? "Perdido" : d.stage || "—"}</span><b>{d.value != null ? brl(d.value) : ""}</b></span>
                  <em>Abrir negócio →</em>
                </button>
              ))}
            </div>
          )}
          {!data && <div className="ap-empty">Carregando…</div>}
          {data && tab === "deals" && (
            <table className="cl-table">
              <thead><tr><th>Negócio</th><th>Funil</th><th>Situação</th><th>Etapa</th><th>Responsável</th><th className="r">Valor</th></tr></thead>
              <tbody>
                {data.deals.map((d) => (
                  <tr key={d.id} onClick={() => { onClose(); openLead(d.id); }}>
                    <td><strong>{d.name}</strong><small>{when(d.createdAt)}{d.archived ? " · arquivado" : ""}</small></td>
                    <td>{d.pipeline}</td>
                    <td><span className={`cl-st ${d.outcome || "open"}`}>{d.outcome === "won" ? <><Trophy size={12} /> Ganho</> : d.outcome === "lost" ? <><ThumbsDown size={12} /> Perdido</> : "Em andamento"}</span></td>
                    <td><span className="cl-stage" style={{ "--c": d.stageColor || "#0071e3" }}>{d.stage || "—"}</span></td>
                    <td>{d.owner || "—"}</td>
                    <td className="r">{d.value != null ? brl(d.value) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data && tab === "history" && (
            <div className="cl-hist">
              {events.filter((e) => !e.done).length > 0 && <div className="cl-pend">
                <strong>Atividades pendentes <small className="lp-muted" style={{ fontWeight: 400 }}>· clique para abrir o negócio</small></strong>
                {events.filter((e) => !e.done).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).map((e) => (
                  <div key={e.id} className="lp-focus-item">
                    <span className="lp-ag-ic">{agIcon(e.kind)}</span>
                    <div className="lp-ag-click" onClick={() => { onClose(); openLead(e.leadId); }}><small className="lp-ag-k">{EV_KIND[e.kind] || e.kind} · {e.leadName}</small><strong>{e.title}</strong>
                      <span className={`lp-ag-due ${new Date(e.startsAt) < new Date() ? "late" : ""}`}>Prazo: {when(e.startsAt)}{e.ownerName ? ` · ${e.ownerName}` : ""}</span></div>
                  </div>
                ))}
              </div>}
              {[...data.history, ...events.filter((e) => e.done).map((e) => ({ id: `ev-${e.id}`, at: e.startsAt, type: "event", ev: e, dealName: e.leadName, by: e.ownerName }))].sort((a, b) => new Date(b.at) - new Date(a.at)).map((h) => (
                <div key={h.id || h.at} className="cl-h">
                  <small className="cl-h-deal">{h.dealName}</small>
                  <div className={`cl-h-text ${h.ev ? "lp-ag-click" : ""}`} onClick={() => h.leadId && (onClose(), openLead(h.leadId))}>{h.ev ? <>{agIcon(h.ev.kind, 13)} <strong>{EV_KIND[h.ev.kind] || h.ev.kind} ✓</strong> {h.ev.notes || h.ev.title}</> : histText(h)}</div>
                  <small>{when(h.at)}{h.by ? ` · ${h.by}` : ""}</small>
                </div>
              ))}
              {!data.history.length && !events.length && <div className="ap-empty">Nada registrado ainda.</div>}
              <p className="cl-hint">Para registrar uma ligação, WhatsApp ou visita, abra o negócio acima.</p>
            </div>
          )}
          {data && tab === "people" && (
            <div className="cl-people">
              {data.people.map((p, i) => (
                <div key={i} className="cl-person">
                  <strong>{p.name}</strong>
                  <span>
                    {p.phone && <a href={`tel:+${String(p.phone).replace(/\D/g, "")}`}><Phone size={13} /> {fmtPhone(p.phone)}</a>}
                    {p.email && <a href={`mailto:${p.email}`}><Mail size={13} /> {p.email}</a>}
                    {p.conversationId && ctx?.onOpenConversation && <button onClick={() => { onClose(); ctx.onOpenConversation(p.conversationId); }}><MessageCircle size={13} /> Conversa</button>}
                  </span>
                </div>
              ))}
              {!data.people.length && <div className="ap-empty">Nenhuma pessoa cadastrada.</div>}
            </div>
          )}
        </div>
        {data && (
          <aside className="cl-side">
            <div className="cl-data">
              <h4 style={{ display: "flex", justifyContent: "space-between" }}>Dados do cliente <button className="lp-link sm" onClick={() => setEditing(true)}>{data.register ? "Editar" : "Completar cadastro"}</button></h4>
              {[[c.docType || "CPF/CNPJ", c.doc ? fmtDoc(c.doc) : ""], ["Razão social", data.register?.legalName], ["Empresa", c.company], ["Categoria", data.register?.category], ["Setor", data.register?.sector], ["Endereço", data.register?.address], ["Descrição", data.register?.description], ["Telefone", c.phone ? fmtPhone(c.phone) : ""], ["E-mail", c.email], ["Origem", data.register?.source || data.origin], ["Responsável", data.deals.find((d) => d.owner)?.owner], ["Cliente desde", data.deals.length ? new Date(data.deals.reduce((m, d) => (d.createdAt < m ? d.createdAt : m), data.deals[0].createdAt)).toLocaleDateString("pt-BR") : ""]].filter(([k, v]) => v || ["Telefone", "E-mail", "Responsável"].includes(k) || k === (c.docType || "CPF/CNPJ")).map(([k, v]) => (
                <div key={k}><span>{k}</span><strong>{v || "—"}</strong></div>
              ))}
            </div>
          </aside>
        )}
        </div>
        {edit && <EditActivity ev={edit} team={ctx?.team || []} me={ctx?.profile} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
        {editing && data && <ClientForm initial={data.register ? { ...data.register, doc: c.doc, email: c.email, phone: c.phone } : { kind: c.docType === "CPF" ? "pessoa" : "empresa", name: c.company || c.name, doc: c.doc || "", email: c.email, phone: c.phone, source: data.origin }} team={ctx?.team || []} me={ctx?.profile} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
        {mail && <MailBox compose={mail} onClose={() => setMail(null)} />}
        {adding && data && <NewDeal ctx={ctx} client={data.client} onClose={() => setAdding(false)} onDone={() => { setAdding(false); setTab("deals"); load(); }} />}
      </div>
    </div>,
    document.body
  );
}

function histText(h) {
  if (h.type === "note") return `📝 ${h.text}`;
  if (h.type === "stage") return `Mudou de etapa${h.to ? `: ${h.toName || h.to}` : ""}`;
  if (h.type === "task") return h.to === "done" ? `✅ Tarefa concluída: ${h.text}` : `Tarefa reaberta: ${h.text}`;
  if (h.type === "outcome") return h.to === "won" ? "🏆 Marcado como ganho" : h.to === "lost" ? `Marcado como perdido${h.reason ? `: ${h.reason}` : ""}` : "Negócio reaberto";
  if (h.type === "created") return "Negócio criado";
  if (h.type === "message") return `💬 ${h.text || "Mensagem enviada"}`;
  return h.text || h.type;
}

/** Novo negócio para o mesmo cliente: já leva nome, telefone, e-mail, empresa e CPF/CNPJ. */
function NewDeal({ ctx, client, onClose, onDone }) {
  const pipes = ctx?.pipelines || [];
  const [f, setF] = useState({ pipelineId: ctx?.pipelineId || pipes[0]?.id || "", ownerId: ctx?.profile?.id || "", value: "", start: "", close: "", notes: "", title: client.name });
  const [busy, setBusy] = useState(false);
  const pipe = pipes.find((p) => p.id === f.pipelineId);
  const save = async () => {
    if (!pipe) return notify("Escolha o funil.", "error");
    setBusy(true);
    try {
      const custom = {};
      const docF = (pipe.fields || []).find((x) => x.type === "document");
      if (docF && client.doc) custom[docF.id] = client.doc;
      const startF = (pipe.fields || []).find((x) => x.type === "date" && /in[ií]cio|vig[eê]ncia/i.test(x.label));
      if (startF && f.start) custom[startF.id] = f.start;
      await crm.createLead({
        name: f.title || client.name, phone: client.phone || undefined, email: client.email || undefined, company: client.company || undefined,
        pipelineId: pipe.id, stage: pipe.stages?.[0]?.id, ownerId: f.ownerId || undefined, value: f.value || undefined,
        expectedClose: f.close || undefined, notes: f.notes || undefined, custom
      });
      notify("Negócio criado para este cliente.", "success");
      onDone();
    } catch (e) { notify(errText(e), "error"); }
    setBusy(false);
  };
  return (
    <div className="cl-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cl-form">
        <h3>Adicionar negócio</h3>
        <label className="full"><span>Título do negócio</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label><span>Cliente</span><input value={client.name} disabled /></label>
        <label><span>Responsável</span>
          <select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
            <option value="">Sem responsável</option>
            {(ctx?.team || []).map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
        </label>
        <label><span>Valor estimado</span><input inputMode="decimal" placeholder="R$ 0,00" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label>
        <label><span>Funil (tipo de seguro)</span>
          <select value={f.pipelineId} onChange={(e) => setF({ ...f, pipelineId: e.target.value })}>
            {pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label><span>Data de início</span><input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
        <label><span>Data de conclusão</span><input type="date" value={f.close} onChange={(e) => setF({ ...f, close: e.target.value })} /></label>
        <label className="full"><span>Descrição</span><textarea rows={3} placeholder="Detalhes importantes sobre esta negociação" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <div className="cl-form-foot">
          <button className="lp-btn" onClick={onClose}>Cancelar</button>
          <button className="lp-btn primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

const fmtDoc = (d) => (!d ? "" : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"));
const fmtPhone = (p) => { const d = String(p || "").replace(/\D/g, "").replace(/^55/, ""); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : p || ""; };
