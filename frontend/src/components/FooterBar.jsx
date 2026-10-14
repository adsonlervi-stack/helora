import React, { useState } from "react";
import { Pencil } from "lucide-react";
import { updateFooterNote } from "../api.js";

export default function FooterBar({ note, canEdit, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note || "");

  if (!note && !canEdit) return null;

  const save = async () => {
    const updated = await updateFooterNote(draft.trim() || null);
    onUpdated(updated.footer_note);
    setEditing(false);
  };

  return (
    <>
      <div className="footer-bar">
        <span className="footer-bar-text">
          {note || (canEdit ? "Clique para adicionar um aviso, versão ou data de atualização" : "")}
        </span>
        {canEdit && (
          <button className="footer-bar-edit" onClick={() => setEditing(true)} title="Editar rodapé">
            <Pencil size={11} />
          </button>
        )}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal-card deal-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Rodapé do sistema</h3>
            <p>Visível para todos os usuários da sua conta.</p>
            <textarea
              className="footer-note-textarea"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ex: Helora v1.0 — atualizado em 08/07/2026"
              autoFocus
            />
            <button className="connect-btn" style={{ marginTop: 12 }} onClick={save}>
              Salvar
            </button>
            <button className="modal-close" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
