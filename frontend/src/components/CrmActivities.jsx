import React, { useEffect, useMemo, useState } from "react";
import { Plus, Clock, Building2 } from "lucide-react";
import { crm } from "../api.js";
import { notify } from "../dialogs.js";
import { EV_KIND, agIcon } from "./CrmLeadPage.jsx";

const KINDS = ["email", "call", "whatsapp", "proposta", "visita", "reuniao", "tarefa"];
const fmt = (d) => {
  const x = new Date(d), t = new Date(); t.setHours(0, 0, 0, 0);
  const day = Math.round((new Date(x).setHours(0, 0, 0, 0) - t) / 86400000);
  const h = x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return day === 0 ? `Hoje ${h}` : day === 1 ? `Amanhã ${h}` : day === -1 ? `Ontem ${h}` : `${x.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} ${h}`;
};
const PERIODS = [["", "Qualquer data"], ["atrasadas", "Atrasadas"], ["hoje", "Hoje"], ["amanha", "Amanhã"], ["semana", "Próximos 7 dias"], ["mes", "Próximos 30 dias"]];

/** Atividades (igual ao Agendor): lista por prazo, filtros por tipo, situação, responsável e data, e "Finalizar" com um clique. */
export default function CrmActivities({ ctx, onOpenLead }) {
  const me = ctx.profile?.id;
  const [list, setList] = useState(null);
  const [kinds, setKinds] = useState([]);
  const [status, setStatus] = useState("0");
  const [owner, setOwner] = useState(me || "");
  const [period, setPeriod] = useState("");
  const load = () => crm.events({ done: status || undefined, ownerId: owner || undefined }).then(setList).catch((e) => { notify(e?.response?.data?.error || e.message, "error"); setList([]); });
  useEffect(() => { setList(null); load(); }, [status, owner]);

  const rows = useMemo(() => {
    if (!list) return [];
    const now = new Date(), t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const end = (n) => { const d = new Date(t0); d.setDate(d.getDate() + n); return d; };
    return list.filter((e) => {
      if (String(e.kind).startsWith("cad_") && !kinds.length) { /* cadência entra junto */ }
      const k = String(e.kind).replace(/^cad_(meeting|task|whats)$/, (m, x) => ({ meeting: "reuniao", task: "tarefa", whats: "whatsapp" })[x]).replace("cad_call", "call").replace("cad_email", "email");
      if (kinds.length && !kinds.includes(k)) return false;
      if (owner && e.ownerId && e.ownerId !== owner) return false;
      const d = new Date(e.startsAt);
      if (period === "atrasadas") return !e.done && d < now;
      if (period === "hoje") return d >= t0 && d < end(1);
      if (period === "amanha") return d >= end(1) && d < end(2);
      if (period === "semana") return d >= t0 && d < end(7);
      if (period === "mes") return d >= t0 && d < end(30);
      return true;
    }).sort((a, b) => (status === "1" ? new Date(b.startsAt) - new Date(a.startsAt) : new Date(a.startsAt) - new Date(b.startsAt)));
  }, [list, kinds, period, owner, status]);

  const finish = async (e, done) => {
    try { await crm.updateEvent(e.id, { done }); setList((l) => (status ? l.filter((x) => x.id !== e.id) : l.map((x) => (x.id === e.id ? { ...x, done } : x)))); notify(done ? "Atividade finalizada." : "Atividade reaberta.", "success"); }
    catch (err) { notify(err?.response?.data?.error || err.message, "error"); }
  };
  const late = rows.filter((e) => !e.done && new Date(e.startsAt) < new Date()).length;

  return (
    <div className="ac">
      <div className="ac-bar">
        <div className="ac-kinds">
          {KINDS.map((k) => (
            <button key={k} title={EV_KIND[k]} className={kinds.includes(k) ? "on" : ""} onClick={() => setKinds((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))}>{agIcon(k, 17)}</button>
          ))}
        </div>
        <div className="ac-seg">
          {[["", "Todas"], ["0", "Pendentes"], ["1", "Finalizadas"]].map(([k, l]) => <button key={k} className={status === k ? "on" : ""} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
        <span style={{ flex: 1 }} />
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Todos os responsáveis</option>
          {(ctx.team || []).map((m) => <option key={m.id} value={m.id}>{m.id === me ? `Eu (${(m.name || "").split(" ")[0]})` : m.name || m.email}</option>)}
        </select>
      </div>
      <div className="ac-info">
        {status === "1" ? "mais recentes primeiro" : "mais urgentes primeiro"} · <b>{rows.length} atividades</b>{late && status !== "1" ? <> · <span className="late">{late} atrasadas</span></> : null}
        <span style={{ flex: 1 }} />
        <span className="ac-tip"><Plus size={13} /> Para criar, abra o negócio e use Ligação, WhatsApp, Visita…</span>
      </div>
      {!list && <div className="ap-empty">Carregando…</div>}
      {list && !rows.length && <div className="ap-empty">Nenhuma atividade com esses filtros.</div>}
      {rows.map((e) => {
        const isLate = !e.done && new Date(e.startsAt) < new Date();
        const today = new Date(e.startsAt).toDateString() === new Date().toDateString();
        return (
          <div key={e.id} className={`ac-card ${e.done ? "done" : ""}`}>
            {e.leadId && (
              <button className="ac-deal" onClick={() => onOpenLead(e.leadId)}>
                <Building2 size={13} /> {e.leadName}{e.leadCompany ? ` | ${e.leadCompany}` : ""}
              </button>
            )}
            <div className="ac-main">
              <span className="lp-ag-ic">{agIcon(e.kind)}</span>
              <div className="ac-t">
                <strong>{EV_KIND[e.kind] || e.kind}</strong>
                <small>{e.ownerName ? `Responsável: ${e.ownerName}` : ""}</small>
              </div>
              <span className={`ac-due ${e.done ? "ok" : isLate ? "late" : today ? "today" : ""}`}><Clock size={12} /> {e.done ? "Feita" : "Prazo"}: {fmt(e.startsAt)}</span>
              <label className="lp-fin"><input type="checkbox" checked={!!e.done} onChange={(x) => finish(e, x.target.checked)} /> Finalizar</label>
            </div>
            <div className="ac-text">{e.notes || e.title}</div>
          </div>
        );
      })}
    </div>
  );
}
