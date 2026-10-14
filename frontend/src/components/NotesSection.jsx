import React, { useEffect, useState } from "react";
import { getNotes, createNote } from "../api.js";

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function NotesSection({ conversationId }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");

  const load = () => getNotes(conversationId).then(setNotes).catch(console.error);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await createNote(conversationId, text.trim());
    setText("");
    load();
  };

  return (
    <div>
      <p className="notes-panel-hint">Visíveis só para a equipe — nunca são enviadas ao cliente.</p>

      <form className="notes-form" onSubmit={handleSubmit}>
        <textarea
          placeholder="Escreva uma nota..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
        />
        <button type="submit">Adicionar nota</button>
      </form>

      <div className="notes-list">
        {notes.map((n) => (
          <div className="note-item" key={n.id}>
            <div className="note-content">{n.content}</div>
            <div className="note-meta">{formatDateTime(n.createdAt)}</div>
          </div>
        ))}
        {notes.length === 0 && <div className="notes-panel-hint">Nenhuma nota ainda.</div>}
      </div>
    </div>
  );
}
