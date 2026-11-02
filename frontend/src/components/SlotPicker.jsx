import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { crm } from "../api.js";
import Avatar from "./Avatar.jsx";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DOW = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const DOWL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Agendamento: escolhe a agenda (pessoa), o dia e um horário livre. */
export default function SlotPicker({ onPick, onClose, defaultOwner }) {
  const [agendas, setAgendas] = useState([]);
  const [who, setWho] = useState(defaultOwner || "");
  const [start, setStart] = useState(() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; });
  const [day, setDay] = useState(() => iso(new Date()));
  const [dur, setDur] = useState(null);
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState(false);
  useEffect(() => { crm.agendas().then((l) => { setAgendas(l); if (!who && l[0]) setWho(defaultOwner && l.some((x) => x.id === defaultOwner) ? defaultOwner : l[0].id); }).catch(() => {}); }, []);
  const ag = agendas.find((a) => a.id === who);
  useEffect(() => { if (!who) return; setData(null); crm.agendaSlots(who, { date: day, duration: dur || undefined }).then(setData).catch(() => setData({ slots: [] })); }, [who, day, dur, ag?.start, ag?.end, ag?.step]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; }), [start]);
  const shift = (n) => { const d = new Date(start); d.setDate(d.getDate() + n); const today = new Date(); today.setHours(12, 0, 0, 0); setStart(d < today ? today : d); };
  const sel = new Date(`${day}T12:00:00`);
  return createPortal(
    <div className="sp-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sp">
        <div className="sp-h"><strong>Agendamento</strong><button onClick={onClose}><X size={18} /></button></div>
        <div className="sp-l">Agenda de</div>
        <div className="sp-who">
          {agendas.map((a) => (
            <button key={a.id} className={a.id === who ? "on" : ""} onClick={() => setWho(a.id)}><Avatar name={a.name} url={a.avatarUrl} size={24} /> {a.name || "Sem nome"}</button>
          ))}
          {ag && <button className="sp-cfg" title="Horários desta agenda" onClick={() => setCfg(true)}><Settings2 size={15} /></button>}
        </div>
        <div className="sp-l">Dia</div>
        <div className="sp-days">
          <button className="sp-arrow" onClick={() => shift(-7)}><ChevronLeft size={16} /></button>
          {days.map((d) => (
            <button key={iso(d)} className={`sp-day ${iso(d) === day ? "on" : ""} ${ag && !ag.days.includes(d.getDay()) ? "off" : ""}`} onClick={() => setDay(iso(d))}>
              <small>{DOW[d.getDay()]}</small><strong>{d.getDate()}</strong><small>{d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</small>
            </button>
          ))}
          <button className="sp-arrow" onClick={() => shift(7)}><ChevronRight size={16} /></button>
        </div>
        <div className="sp-sub">
          <strong>{DOWL[sel.getDay()]}, {sel.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}</strong>
          <span>{data ? `${data.slots.length} horário(s) livre(s)` : "…"}</span>
          <select value={dur || ag?.duration || 60} onChange={(e) => setDur(Number(e.target.value))}>
            {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>Duração {m < 60 ? `${m} min` : `${m / 60}h${m % 60 ? "30" : ""}`}</option>)}
          </select>
        </div>
        <div className="sp-slots">
          {data?.slots.map((s) => <button key={s.time} onClick={() => onPick({ ...s, ownerId: who, ownerName: ag?.name })}>{s.time}</button>)}
          {data && !data.slots.length && <div className="sp-empty">Nenhum horário livre neste dia.</div>}
        </div>
      </div>
      {cfg && ag && <AgendaConfig a={ag} onClose={() => setCfg(false)} onSaved={(n) => { setAgendas((l) => l.map((x) => (x.id === n.id ? { ...x, ...n } : x))); setCfg(false); }} />}
    </div>,
    document.body
  );
}

function AgendaConfig({ a, onClose, onSaved }) {
  const [f, setF] = useState({ ...a });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="sp-bg" style={{ zIndex: 10061 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sp" style={{ width: 460 }}>
        <div className="sp-h"><strong>Horários de {a.name}</strong><button onClick={onClose}><X size={18} /></button></div>
        <div className="sp-l">Dias de atendimento</div>
        <div className="sp-dow">{DOW.map((d, i) => <button key={d} className={f.days.includes(i) ? "on" : ""} onClick={() => setF({ ...f, days: f.days.includes(i) ? f.days.filter((x) => x !== i) : [...f.days, i] })}>{d}</button>)}</div>
        <div className="sp-form">
          <label>Início<input type="time" value={f.start} onChange={set("start")} /></label>
          <label>Fim<input type="time" value={f.end} onChange={set("end")} /></label>
          <label>Almoço de<input type="time" value={f.lunchStart || ""} onChange={set("lunchStart")} /></label>
          <label>até<input type="time" value={f.lunchEnd || ""} onChange={set("lunchEnd")} /></label>
          <label>Intervalo<select value={f.step} onChange={set("step")}>{[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
          <label>Duração padrão<select value={f.duration} onChange={set("duration")}>{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
        </div>
        {err && <div className="admin-feedback error">{err}</div>}
        <div className="sp-foot"><button className="lp-ghost" onClick={onClose}>Cancelar</button><button className="lp-primary" onClick={async () => { try { onSaved(await crm.saveAgenda(a.id, f)); } catch (e) { setErr(e?.response?.data?.error || e.message); } }}>Salvar</button></div>
      </div>
    </div>
  );
}
