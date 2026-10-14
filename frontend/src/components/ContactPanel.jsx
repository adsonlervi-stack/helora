import React from "react";
import { X } from "lucide-react";
import Accordion from "./Accordion.jsx";
import LabelPicker from "./LabelPicker.jsx";
import PrioritySelector from "./PrioritySelector.jsx";
import NotesSection from "./NotesSection.jsx";

const PLATFORM_LABELS = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram"
};

function initials(name = "") {
  return name.trim().slice(0, 2).toUpperCase();
}

export default function ContactPanel({
  conversation,
  departments = [],
  team = [],
  onSetPriority,
  onToggleLabel,
  onSetDepartment,
  onAssign,
  onClose
}) {
  return (
    <aside className="contact-panel">
      <div className="contact-panel-topbar">
        <span>Detalhes</span>
        <button className="icon-btn" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="contact-identity">
        <div className={`avatar avatar-lg ${conversation.platform}`}>
          {initials(conversation.name)}
        </div>
        <div className="contact-name">{conversation.name}</div>
        <div className="contact-meta">{PLATFORM_LABELS[conversation.platform]}</div>
        <div className="contact-meta contact-meta-id">{conversation.externalId}</div>
      </div>

      <div className="accordion-list">
        <Accordion title="Ações da conversa">
          <div className="panel-field">
            <span className="panel-field-label">Prioridade</span>
            <PrioritySelector value={conversation.priority} onChange={onSetPriority} />
          </div>

          <div className="panel-field">
            <span className="panel-field-label">Setor</span>
            <select
              className="deal-stage-select"
              value={conversation.departmentId || ""}
              onChange={(e) => onSetDepartment(e.target.value || null)}
            >
              <option value="">Sem setor</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="panel-field">
            <span className="panel-field-label">Atribuído a</span>
            <select
              className="deal-stage-select"
              value={conversation.assignedAgentId || ""}
              onChange={(e) => onAssign(e.target.value || null)}
            >
              <option value="">Ninguém</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || "Sem nome"}
                </option>
              ))}
            </select>
          </div>
        </Accordion>

        <Accordion title="Etiquetas">
          <div className="panel-labels">
            {(conversation.labels || []).map((l) => (
              <span key={l.id} className="label-chip" style={{ "--chip-color": l.color }}>
                {l.title}
              </span>
            ))}
            <LabelPicker conversation={conversation} onToggleLabel={onToggleLabel} />
          </div>
        </Accordion>

        <Accordion title="Notas internas">
          <NotesSection conversationId={conversation.id} />
        </Accordion>
      </div>
    </aside>
  );
}
