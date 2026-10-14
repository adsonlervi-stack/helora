import React, { useEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";

const PRIORITIES = [
  { value: null, label: "Sem prioridade", color: "#6e7a7a" },
  { value: "low", label: "Baixa", color: "#6e7a7a" },
  { value: "medium", label: "Média", color: "#2b82ea" },
  { value: "high", label: "Alta", color: "#dd8a1f" },
  { value: "urgent", label: "Urgente", color: "#d94f4f" }
];

export function priorityMeta(value) {
  return PRIORITIES.find((p) => p.value === value) || PRIORITIES[0];
}

export default function PrioritySelector({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const current = priorityMeta(value);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="priority-picker" ref={boxRef}>
      <button
        className="priority-btn"
        style={{ "--priority-color": current.color }}
        onClick={() => setOpen((v) => !v)}
      >
        <Flag size={14} />
        {current.label}
      </button>

      {open && (
        <div className="priority-menu">
          {PRIORITIES.map((p) => (
            <button
              key={p.label}
              className={`priority-option ${value === p.value ? "active" : ""}`}
              onClick={() => {
                onChange(p.value);
                setOpen(false);
              }}
            >
              <span className="priority-dot" style={{ background: p.color }} />
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
