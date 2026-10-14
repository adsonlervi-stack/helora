import React, { useEffect, useState } from "react";
import { X, MessageCircle, Trophy, XCircle, Trash2, ExternalLink } from "lucide-react";
import { getDealActivities, addDealActivityApi } from "../api.js";
import { STAGES } from "./DealsPage.jsx";

const PLATFORM_LABELS = { whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram" };

function formatMoney(v) {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function timeSince(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} dia${days > 1 ? "s" : ""}`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours}h`;
  return "menos de 1h";
}

export default function DealDetailPanel({ deal, team, onUpdate, onDelete, onOpenConversation, onClose }) {
  const [activities, setActivities] = useState([]);
  const [note, setNote] = useState("");
  const [lostReasonDraft, setLostReasonDraft] = useState("");
  const [askingLostReason, setAskingLostReason] = useState(false);

  const load = () => getDealActivities(deal.id).then(setActivities).catch(console.error);

  useEffect(() => {
    load();
    setAskingLostReason(false);
    setLostReasonDraft("");
  }, [deal.id]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    await addDealActivityApi(deal.id, note.trim());
    setNote("");
    load();
  };

  const handleWin = () => onUpdate(deal.id, { stage: "fechado" });

  const handleConfirmLost = () => {
    onUpdate(deal.id, { stage: "perdido", lostReason: lostReasonDraft.trim() || null });
    setAskingLostReason(false);
  };

  const stageMeta = STAGES.find((s) => s.id === deal.stage);
  const isClosed = deal.stage === "fechado" || deal.stage === "perdido";

  return (
    <div className="deal-panel-overlay" onClick={onClose}>
      <div className="deal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="deal-panel-head">
          <div>
            <div className="deal-panel-title">{deal.title}</div>
            <span className="deal-panel-stage" style={{ background: stageMeta?.color }}>
              {stageMeta?.name}
            </span>
          </div>
          <button className="modal-close" style={{ marginTop: 0 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="deal-panel-value">{formatMoney(deal.value)}</div>

        {!isClosed && (
          <div className="deal-panel-actions">
            <button className="deal-win-btn" onClick={handleWin}>
              <Trophy size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Ganho
            </button>
            <button className="deal-lost-btn" onClick={() => setAskingLostReason((v) => !v)}>
              <XCircle size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Perdido
            </button>
          </div>
        )}

        {askingLostReason && (
          <div className="deal-lost-form">
            <input
              placeholder="Motivo da perda (opcional)"
              value={lostReasonDraft}
              onChange={(e) => setLostReasonDraft(e.target.value)}
              autoFocus
            />
            <button className="connect-btn" style={{ width: "auto", padding: "8px 16px" }} onClick={handleConfirmLost}>
              Confirmar
            </button>
          </div>
        )}

        {deal.stage === "perdido" && deal.lostReason && (
          <div className="deal-lost-reason-display">Motivo: {deal.lostReason}</div>
        )}

        <div className="deal-panel-field">
          <label>Dono do negócio</label>
          <select
            className="flow-select"
            style={{ width: "100%" }}
            value={deal.ownerId || ""}
            onChange={(e) => onUpdate(deal.id, { ownerId: e.target.value || null })}
          >
            <option value="">Sem dono definido</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name || "Sem nome"}
              </option>
            ))}
          </select>
        </div>

        <div className="deal-panel-field">
          <label>Tempo parado nesta etapa</label>
          <div className="deal-panel-static">{timeSince(deal.stageChangedAt)}</div>
        </div>

        {deal.conversationId && (
          <div className="deal-panel-field">
            <label>Conversa vinculada</label>
            <button className="deal-linked-conversation" onClick={() => onOpenConversation(deal.conversationId)}>
              <MessageCircle size={14} />
              {deal.conversationName || "Ver conversa"}
              {deal.conversationPlatform && (
                <span className="deal-origin-badge">{PLATFORM_LABELS[deal.conversationPlatform]}</span>
              )}
              <ExternalLink size={12} style={{ marginLeft: "auto" }} />
            </button>
          </div>
        )}

        <div className="deal-panel-field">
          <label>Histórico</label>
          <form className="deal-note-form" onSubmit={handleAddNote}>
            <input
              placeholder="Adicionar uma nota..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="submit">Adicionar</button>
          </form>

          <div className="deal-activity-list">
            {activities.map((a) => (
              <div className="deal-activity-item" key={a.id}>
                <div className="deal-activity-desc">{a.description}</div>
                <div className="deal-activity-meta">
                  {formatDateTime(a.createdAt)}
                  {a.createdBy ? ` · ${a.createdBy}` : ""}
                </div>
              </div>
            ))}
            {activities.length === 0 && <div className="rank-empty">Nenhum registro ainda.</div>}
          </div>
        </div>

        <button
          className="deal-delete-btn"
          onClick={() => {
            if (confirm("Excluir este negócio? Essa ação não pode ser desfeita.")) onDelete(deal.id);
          }}
        >
          <Trash2 size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
          Excluir negócio
        </button>
      </div>
    </div>
  );
}
