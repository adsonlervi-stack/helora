import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, MessageCircle, Trophy, XCircle } from "lucide-react";
import { getDeals, createDealApi, updateDealApi, removeDeal, getTeam } from "../api.js";
import DealDetailPanel from "./DealDetailPanel.jsx";

export const STAGES = [
  { id: "novo_lead", name: "Novo Lead", color: "#6e7a7a" },
  { id: "contato", name: "Primeiro Contato", color: "#2b82ea" },
  { id: "negociacao", name: "Em Negociação", color: "#6228d7" },
  { id: "proposta", name: "Proposta Enviada", color: "#dd8a1f" },
  { id: "fechado", name: "Fechado", color: "#1f9d6b" },
  { id: "perdido", name: "Perdido", color: "#d94f4f" }
];

const PLATFORM_LABELS = { whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram" };

function formatMoney(v) {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function daysInStage(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days;
}

function NewDealModal({ team, onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState("novo_lead");
  const [ownerId, setOwnerId] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({ title: title.trim(), value: value ? Number(value) : null, stage, ownerId: ownerId || null });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card deal-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Novo negócio</h3>
        <form onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Plano empresarial" autoFocus />
          </label>
          <label className="login-field">
            <span>Valor estimado (R$, opcional)</span>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="login-field">
            <span>Etapa inicial</span>
            <select value={stage} onChange={(e) => setStage(e.target.value)} className="deal-stage-select">
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="login-field">
            <span>Dono do negócio (opcional)</span>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="deal-stage-select">
              <option value="">Sem dono definido</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || "Sem nome"}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="connect-btn" style={{ marginTop: 6 }}>
            Criar negócio
          </button>
        </form>
        <button className="modal-close" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function DealsPage({ onOpenConversation }) {
  const [deals, setDeals] = useState([]);
  const [team, setTeam] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [openDealId, setOpenDealId] = useState(null);
  const draggedId = useRef(null);

  const load = () => getDeals().then(setDeals).catch(console.error);

  useEffect(() => {
    load();
    getTeam().then(setTeam).catch(console.error);
  }, []);

  const columns = useMemo(() => {
    const filtered = deals.filter((d) => {
      const matchesSearch = `${d.title} ${d.conversationName || ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesOwner = !ownerFilter || d.ownerId === ownerFilter;
      return matchesSearch && matchesOwner;
    });
    return STAGES.map((stage) => {
      const items = filtered.filter((d) => d.stage === stage.id);
      const sum = items.reduce((acc, d) => acc + (Number(d.value) || 0), 0);
      return { ...stage, items, sum };
    });
  }, [deals, search, ownerFilter]);

  const openDeal = deals.find((d) => d.id === openDealId) || null;

  const handleCreate = async (data) => {
    const deal = await createDealApi(data);
    setDeals((prev) => [deal, ...prev]);
    setShowNew(false);
  };

  const handleDelete = async (id) => {
    await removeDeal(id);
    setDeals((prev) => prev.filter((d) => d.id !== id));
    setOpenDealId(null);
  };

  const handleUpdate = async (id, patch) => {
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    try {
      const updated = await updateDealApi(id, patch);
      setDeals((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch (err) {
      console.error(err);
      load();
    }
  };

  const handleDrop = async (stageId) => {
    setDragOverStage(null);
    const id = draggedId.current;
    if (!id) return;
    const current = deals.find((d) => d.id === id);
    if (!current || current.stage === stageId) return;
    handleUpdate(id, { stage: stageId });
  };

  return (
    <div className="page deals-page">
      <div className="deals-toolbar">
        <div className="search-box" style={{ margin: 0, maxWidth: 260 }}>
          <input
            placeholder="Buscar negócio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select className="flow-select" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="">Todos os donos</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name || "Sem nome"}
            </option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        <button className="connect-btn deals-new-btn" onClick={() => setShowNew(true)}>
          <Plus size={15} style={{ marginRight: 6, verticalAlign: -3 }} />
          Novo negócio
        </button>
      </div>

      <div className="kanban-wrap">
        {columns.map((col) => (
          <div
            key={col.id}
            className={`kanban-col ${dragOverStage === col.id ? "drag-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStage(col.id);
            }}
            onDragLeave={() => setDragOverStage((cur) => (cur === col.id ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(col.id);
            }}
          >
            <div className="kanban-col-head">
              <span className="col-dot" style={{ background: col.color }} />
              <span className="col-title">{col.name}</span>
              <span className="col-count">{col.items.length}</span>
            </div>
            <div className="col-sum">{formatMoney(col.sum)}</div>

            <div className="kanban-cards">
              {col.items.map((deal) => {
                const stuckDays = daysInStage(deal.stageChangedAt);
                const isClosed = deal.stage === "fechado" || deal.stage === "perdido";
                return (
                  <div
                    key={deal.id}
                    className="deal-card"
                    draggable
                    onDragStart={(e) => {
                      draggedId.current = deal.id;
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => setOpenDealId(deal.id)}
                  >
                    <button
                      className="card-del-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(deal.id);
                      }}
                      title="Excluir"
                    >
                      <Trash2 size={12} />
                    </button>
                    <div className="deal-card-top">
                      <span className="deal-card-title">{deal.title}</span>
                    </div>
                    {deal.conversationName && (
                      <div className="deal-card-source">
                        <MessageCircle size={11} />
                        {deal.conversationName}
                        {deal.conversationPlatform && (
                          <span className="deal-origin-badge">
                            {PLATFORM_LABELS[deal.conversationPlatform]}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="deal-card-bottom">
                      <span className="deal-card-value">{formatMoney(deal.value)}</span>
                      {stuckDays >= 1 && !isClosed && (
                        <span className={`deal-stuck-badge ${stuckDays >= 5 ? "warn" : ""}`}>
                          {stuckDays}d na etapa
                        </span>
                      )}
                    </div>
                    {deal.ownerName && <div className="deal-card-owner">{deal.ownerName}</div>}

                    {!isClosed && (
                      <div className="deal-card-quick-actions">
                        <button
                          className="deal-quick-win"
                          title="Marcar como Ganho"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdate(deal.id, { stage: "fechado" });
                          }}
                        >
                          <Trophy size={12} />
                        </button>
                        <button
                          className="deal-quick-lost"
                          title="Marcar como Perdido"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdate(deal.id, { stage: "perdido" });
                          }}
                        >
                          <XCircle size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {col.items.length === 0 && <div className="kanban-empty">Sem negócios</div>}
            </div>
          </div>
        ))}
      </div>

      {showNew && <NewDealModal team={team} onClose={() => setShowNew(false)} onCreate={handleCreate} />}

      {openDeal && (
        <DealDetailPanel
          deal={openDeal}
          team={team}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onOpenConversation={(id) => {
            setOpenDealId(null);
            onOpenConversation(id);
          }}
          onClose={() => setOpenDealId(null)}
        />
      )}
    </div>
  );
}
