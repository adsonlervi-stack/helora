import React, { useState } from "react";
import { X, ArrowRightLeft } from "lucide-react";
import { transferConversationApi } from "../api.js";

/** Janela de transferência (setor e/ou atendente + observação), como no ClickMassa. */
export default function TransferModal({ conversation, departments, team, onClose, onDone }) {
  const [departmentId, setDepartmentId] = useState(conversation.departmentId || "");
  const [agentId, setAgentId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const agents = team.filter((m) => !m.isSuperAdmin);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await transferConversationApi(conversation.id, { departmentId: departmentId || null, agentId: agentId || null, note: note.trim() || null });
      onDone();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card lg-sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-head">
          <h3><ArrowRightLeft size={18} style={{ verticalAlign: -3, marginRight: 6 }} />Transferir atendimento</h3>
          <button type="button" className="cv-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="cv-muted" style={{ marginTop: 0 }}>{conversation.name}</p>

        <label className="login-field">
          <span>Setor</span>
          <select className="deal-stage-select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Sem setor (fila geral)</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="login-field">
          <span>Atendente (opcional)</span>
          <select className="deal-stage-select" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">Deixar em Pendentes para o setor assumir</option>
            {agents.map((m) => <option key={m.id} value={m.id}>{m.name || "Sem nome"}</option>)}
          </select>
        </label>
        <label className="login-field">
          <span>Observação para quem vai receber (opcional)</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: cliente quer cotação de seguro auto, já mandou CNH" />
        </label>
        {error && <div className="admin-feedback error">{error}</div>}
        <button className="connect-btn" disabled={busy || (!departmentId && !agentId)}>
          {busy ? "Transferindo…" : "Transferir"}
        </button>
      </form>
    </div>
  );
}
