import React, { useState } from "react";
import { Phone, MessageCircle, Mail, ClipboardList, CalendarDays, Plus, Trash2, Pencil, X } from "lucide-react";
import { Sheet, Button } from "./ui.jsx";

export const CAD_KINDS = {
  call: { label: "Ligação", icon: Phone },
  whats: { label: "WhatsApp", icon: MessageCircle },
  email: { label: "E-mail", icon: Mail },
  task: { label: "Tarefa", icon: ClipboardList },
  meeting: { label: "Reunião", icon: CalendarDays }
};
const UNITS = [["min", 1, "minuto"], ["h", 60, "hora"], ["d", 1440, "dia"]];
export function afterLabel(min) {
  if (!min) return "Na hora";
  if (min % 1440 === 0) return `${min / 1440}º dia`;
  if (min % 60 === 0) return `${min / 60}ª hora`;
  return `${min}º minuto`;
}
const split = (min) => { for (const [u, f] of [...UNITS].reverse()) if (min && min % f === 0) return { n: min / f, u }; return { n: min || 0, u: "min" }; };

/** Modelo de cadência: atividades com prazo que nascem quando o card entra em cada etapa. */
export default function CadenceSheet({ pipeline, onClose, onSave }) {
  const [stages, setStages] = useState(() => (pipeline.stages || []).map((s) => ({ ...s, cadence: [...(s.cadence || [])] })));
  const [edit, setEdit] = useState(null); // { stageId, item, index }
  const [busy, setBusy] = useState(false);
  const total = stages.reduce((t, s) => t + s.cadence.length, 0);
  const put = (stageId, fn) => setStages((l) => l.map((s) => (s.id === stageId ? { ...s, cadence: fn(s.cadence) } : s)));
  const save = async () => { setBusy(true); await onSave(stages); setBusy(false); };
  return (
    <Sheet title={`Modelo de atividades · ${pipeline.name}`} subtitle={`${total} atividade(s). Elas são criadas sozinhas quando o card entra na etapa.`} onClose={onClose} width={1200}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar"}</Button></>}>
      <div className="cad-board">
        {stages.map((st) => (
          <div key={st.id} className="cad-col">
            <div className="cad-head"><i style={{ background: st.color }} /> <strong>{st.name}</strong></div>
            <div className="cad-count">{st.cadence.length} atividade(s) nesta etapa</div>
            <div className="cad-list">
              {st.cadence.map((c, i) => {
                const K = CAD_KINDS[c.kind] || CAD_KINDS.task;
                return (
                  <button key={c.id || i} className="cad-item" onClick={() => setEdit({ stageId: st.id, index: i, item: { ...c } })}>
                    <span className="cad-when">{afterLabel(c.after)}</span>
                    <K.icon size={13} />
                    <span className="cad-t">{c.title}</span>
                  </button>
                );
              })}
            </div>
            <button className="cad-add" onClick={() => setEdit({ stageId: st.id, index: -1, item: { kind: "whats", after: st.cadence.length ? st.cadence[st.cadence.length - 1].after + 30 : 5, title: "", text: "" } })}><Plus size={14} /> Nova atividade</button>
          </div>
        ))}
      </div>
      {edit && <CadenceItemEditor value={edit.item} onClose={() => setEdit(null)}
        onDelete={edit.index >= 0 ? () => { put(edit.stageId, (l) => l.filter((_, j) => j !== edit.index)); setEdit(null); } : null}
        onSave={(item) => { put(edit.stageId, (l) => (edit.index >= 0 ? l.map((x, j) => (j === edit.index ? item : x)) : [...l, item]).sort((a, b) => a.after - b.after)); setEdit(null); }} />}
    </Sheet>
  );
}

function CadenceItemEditor({ value, onClose, onSave, onDelete }) {
  const s0 = split(value.after);
  const [f, setF] = useState({ ...value, n: s0.n, u: s0.u });
  const ok = f.title.trim();
  const mins = (Number(f.n) || 0) * (UNITS.find((u) => u[0] === f.u)?.[1] || 1);
  return (
    <div className="cad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cad-modal">
        <div className="cad-modal-h"><strong>{value.title ? "Editar atividade" : "Nova atividade"}</strong><button onClick={onClose}><X size={16} /></button></div>
        <div className="cad-kinds">
          {Object.entries(CAD_KINDS).map(([k, K]) => <button key={k} className={f.kind === k ? "on" : ""} onClick={() => setF({ ...f, kind: k })}><K.icon size={15} /> {K.label}</button>)}
        </div>
        <label className="cad-l">Nome<input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex.: Abordagem inicial" /></label>
        <label className="cad-l">Quando, depois de entrar na etapa
          <span className="cad-when-in"><input type="number" min="0" value={f.n} onChange={(e) => setF({ ...f, n: e.target.value })} />
            <select value={f.u} onChange={(e) => setF({ ...f, u: e.target.value })}>{UNITS.map(([u, , l]) => <option key={u} value={u}>{l}(s)</option>)}</select></span>
        </label>
        <label className="cad-l">{f.kind === "whats" || f.kind === "email" ? "Mensagem" : "Roteiro ou instruções"}
          <textarea rows={8} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder={f.kind === "whats" ? "Bom dia, {nome}! Tudo bem?\n\nAqui é {meu_nome}…" : "O que falar e o que perguntar"} />
        </label>
        <small className="cad-tip">Use {"{nome}"}, {"{empresa}"} e os campos do card no texto.</small>
        <div className="cad-modal-f">
          {onDelete && <button className="cad-del" onClick={onDelete}><Trash2 size={14} /> Excluir</button>}
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!ok} onClick={() => onSave({ id: f.id, kind: f.kind, after: mins, title: f.title.trim(), text: f.text })}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}
