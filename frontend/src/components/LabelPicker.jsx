import React, { useEffect, useRef, useState } from "react";
import { Tag, Plus } from "lucide-react";
import { getLabels, createLabelApi } from "../api.js";

const PRESET_COLORS = ["#2b82ea", "#1f9d6b", "#dd8a1f", "#d94f4f", "#6e7a7a", "#6228d7"];

export default function LabelPicker({ conversation, onToggleLabel }) {
  const [open, setOpen] = useState(false);
  const [allLabels, setAllLabels] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const boxRef = useRef(null);

  useEffect(() => {
    if (open) getLabels().then(setAllLabels).catch(console.error);
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeIds = new Set((conversation.labels || []).map((l) => l.id));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const label = await createLabelApi(newTitle.trim(), newColor);
    setAllLabels((prev) => [...prev, label].sort((a, b) => a.title.localeCompare(b.title)));
    setNewTitle("");
    onToggleLabel(label, true);
  };

  return (
    <div className="label-picker" ref={boxRef}>
      <button className="icon-btn" title="Etiquetas" onClick={() => setOpen((v) => !v)}>
        <Tag size={16} />
      </button>

      {open && (
        <div className="label-picker-menu">
          <div className="label-picker-title">Etiquetas</div>
          <div className="label-picker-list">
            {allLabels.map((label) => (
              <button
                key={label.id}
                className={`label-chip-toggle ${activeIds.has(label.id) ? "active" : ""}`}
                style={{ "--chip-color": label.color }}
                onClick={() => onToggleLabel(label, !activeIds.has(label.id))}
              >
                <span className="label-dot" style={{ background: label.color }} />
                {label.title}
              </button>
            ))}
            {allLabels.length === 0 && (
              <div className="label-picker-empty">Nenhuma etiqueta ainda.</div>
            )}
          </div>

          <form className="label-picker-form" onSubmit={handleCreate}>
            <input
              placeholder="Nova etiqueta..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <div className="label-color-row">
              {PRESET_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`label-color-dot ${newColor === c ? "selected" : ""}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                />
              ))}
              <button type="submit" className="label-add-btn">
                <Plus size={14} />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
