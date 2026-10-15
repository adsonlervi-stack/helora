import React from "react";

const DAYS = [
  ["1", "Segunda"], ["2", "Terça"], ["3", "Quarta"], ["4", "Quinta"], ["5", "Sexta"], ["6", "Sábado"], ["0", "Domingo"]
];

export const DEFAULT_HOURS = {
  enabled: false,
  tz: "America/Sao_Paulo",
  message: "Olá! 😊 No momento estamos fora do horário de atendimento. Deixe sua mensagem que respondemos assim que voltarmos.",
  days: {
    "1": { open: true, from: "08:00", to: "18:00" },
    "2": { open: true, from: "08:00", to: "18:00" },
    "3": { open: true, from: "08:00", to: "18:00" },
    "4": { open: true, from: "08:00", to: "18:00" },
    "5": { open: true, from: "08:00", to: "18:00" },
    "6": { open: false, from: "08:00", to: "12:00" },
    "0": { open: false, from: "08:00", to: "12:00" }
  }
};

/** Editor de horário de atendimento (empresa ou fluxo). */
export default function BusinessHoursEditor({ value, onChange, enableLabel = "Usar horário de atendimento" }) {
  const v = value?.days ? { ...DEFAULT_HOURS, ...value } : { ...DEFAULT_HOURS, ...(value || {}) };
  const set = (patch) => onChange({ ...v, ...patch });
  const setDay = (k, patch) => set({ days: { ...v.days, [k]: { ...v.days[k], ...patch } } });
  return (
    <div className="bh-editor">
      <label className="bh-switch">
        <input type="checkbox" checked={!!v.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <span>{enableLabel}</span>
      </label>
      <div className={`bh-days ${v.enabled ? "" : "off"}`}>
        {DAYS.map(([k, label]) => (
          <div key={k} className="bh-row">
            <label className="bh-day">
              <input type="checkbox" checked={!!v.days[k]?.open} onChange={(e) => setDay(k, { open: e.target.checked })} />
              {label}
            </label>
            {v.days[k]?.open ? (
              <span className="bh-times">
                <input type="time" value={v.days[k].from} onChange={(e) => setDay(k, { from: e.target.value })} />
                <span>às</span>
                <input type="time" value={v.days[k].to} onChange={(e) => setDay(k, { to: e.target.value })} />
              </span>
            ) : (
              <span className="cv-muted">Fechado</span>
            )}
          </div>
        ))}
        <label className="login-field">
          <span>Mensagem automática fora do horário</span>
          <textarea rows={3} value={v.message} onChange={(e) => set({ message: e.target.value })} />
        </label>
      </div>
    </div>
  );
}
