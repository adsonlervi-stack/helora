import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, History, Briefcase, Users, Plus, X, Phone, Mail, MessageCircle, Trophy, ThumbsDown } from "lucide-react";
import { crm } from "../api.js";
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
  const [tab, setTab] = useState("deals");
  const [adding, setAdding] = useState(false);
  const load = () => crm.client(leadId).then(setData).catch((e) => { notify(errText(e), "error"); onClose(); });
  useEffect(() => { setData(null); load(); }, [leadId]);

  const c = data?.client;
  return createPortal(
    <div className="lp-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cl">
        <header className="cl-head">
          <span className="cl-ico"><Building2 size={22} /></span>
          <div className="cl-who">
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
        <div className="cl-body">
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
              {data.history.map((h) => (
                <div key={h.id || h.at} className="cl-h">
                  <small className="cl-h-deal">{h.dealName}</small>
                  <div className="cl-h-text">{histText(h)}</div>
                  <small>{when(h.at)}{h.by ? ` · ${h.by}` : ""}</small>
                </div>
              ))}
              {!data.history.length && <div className="ap-empty">Nada registrado ainda.</div>}
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
