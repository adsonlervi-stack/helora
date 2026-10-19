import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, MessageCircle, Trophy, XCircle, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { getDeals, createDealApi, updateDealApi, removeDeal, getTeam, getPipelineStagesApi, savePipelineStagesApi } from "../api.js";
import DealDetailPanel from "./DealDetailPanel.jsx";

export const STAGES = [
  { id: "novo_lead", name: "Novo Lead", color: "#0a84ff" },
  { id: "contato", name: "Primeiro Contato", color: "#bf5af2" },
  { id: "negociacao", name: "Em Negociação", color: "#ff9f0a" },
  { id: "proposta", name: "Proposta Enviada", color: "#ffcc00" },
  { id: "fechado", name: "Fechado", color: "#30d158" },
  { id: "perdido", name: "Perdido", color: "#ff453a" }
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

  const [stagesVer, setStagesVer] = useState(0);
  const [editCol, setEditCol] = useState(null); // {id?, name, color}
  useEffect(() => {
    load();
    getTeam().then(setTeam).catch(console.error);
    getPipelineStagesApi().then((st) => { if (st?.length) { STAGES.splice(0, STAGES.length, ...st); setStagesVer((v) => v + 1); } }).catch(() => {});
  }, []);
  const persistStages = async (next) => {
    STAGES.splice(0, STAGES.length, ...next);
    setStagesVer((v) => v + 1);
    try {
      const saved = await savePipelineStagesApi(next);
      STAGES.splice(0, STAGES.length, ...saved);
      setStagesVer((v) => v + 1);
    } catch (e) {
      alert(e.response?.data?.error || "Não consegui salvar as colunas (só o gestor pode editar).");
    }
  };
  const saveCol = () => {
    const name = (editCol?.name || "").trim();
    if (!name) return;
    if (editCol.id) persistStages(STAGES.map((s) => (s.id === editCol.id ? { ...s, name, color: editCol.color } : s)));
    else {
      const id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").slice(0, 30) + "_" + Date.now().toString(36).slice(-4);
      const idx = STAGES.findIndex((s) => s.id === "fechado");
      const next = [...STAGES];
      next.splice(idx < 0 ? next.length : idx, 0, { id, name, color: editCol.color });
      persistStages(next);
    }
    setEditCol(null);
  };
  const moveCol = (id, dir) => {
    const i = STAGES.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= STAGES.length) return;
    const next = [...STAGES];
    [next[i], next[j]] = [next[j], next[i]];
    persistStages(next);
  };
  const deleteCol = (id) => {
    if (deals.some((d) => d.stage === id)) return alert("Mova os negócios desta coluna antes de excluir.");
    if (!confirm("Excluir esta coluna?")) return;
    persistStages(STAGES.filter((s) => s.id !== id));
  };

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
  }, [deals, search, ownerFilter, stagesVer]);

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
        <div className="cv-search" style={{ flex: "0 1 280px" }}>
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

        <button className="pill-btn" onClick={() => setEditCol({ name: "", color: "#0a84ff" })}>
          <Plus size={14} /> Coluna
        </button>
        <button className="connect-btn deals-new-btn" onClick={() => setShowNew(true)}>
          <Plus size={15} style={{ marginRight: 6, verticalAlign: -3 }} />
          Novo negócio
        </button>
      </div>

      <div className="kanban-wrap">
        {columns.map((col) => (
          <div
            key={col.id}
            style={{ "--col": col.color }}
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
              <span className="col-title">{col.name}</span>
              <span className="col-count">{col.items.length}</span>
              {!["fechado", "perdido"].includes(col.id) && (
                <span className="col-tools">
                  <button title="Mover para a esquerda" onClick={() => moveCol(col.id, -1)}><ChevronLeft size={13} /></button>
                  <button title="Mover para a direita" onClick={() => moveCol(col.id, 1)}><ChevronRight size={13} /></button>
                  <button title="Editar coluna" onClick={() => setEditCol({ id: col.id, name: col.name, color: col.color })}><Pencil size={12} /></button>
                  <button title="Excluir coluna" onClick={() => deleteCol(col.id)}><Trash2 size={12} /></button>
                </span>
              )}
            </div>
            <div className="col-sum">{formatMoney(col.sum)}</div>

            <div className="kanban-cards">
              {col.items.map((deal) => {
                const stuckDays = daysInStage(deal.stageChangedAt);
                const isClosed = deal.stage === "fechado" || deal.stage === "perdido";
                return (
                  <div
                    key={deal.id}
                    style={{ "--col": col.color }}
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
                    {!deal.conversationName && (deal.contactName || deal.contactPhone) && (
                      <div className="deal-card-contact">
                        {deal.contactName || ""} {deal.contactPhone ? `· +${deal.contactPhone}` : ""}
                        {deal.source && <span className="deal-origin-badge">{deal.source}</span>}
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

      {editCol && (
        <div className="modal-backdrop" onClick={() => setEditCol(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header"><h3>{editCol.id ? "Editar coluna" : "Nova coluna"}</h3></div>
            <label className="login-field"><span>Nome</span><input autoFocus value={editCol.name} onChange={(e) => setEditCol((c) => ({ ...c, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && saveCol()} /></label>
            <div className="label-color-row" style={{ margin: "10px 0" }}>
              {["#0a84ff", "#bf5af2", "#ff9f0a", "#ffcc00", "#30d158", "#ff453a", "#64d2ff", "#8e8e93"].map((c) => (
                <button type="button" key={c} className={`label-color-dot ${editCol.color === c ? "selected" : ""}`} style={{ background: c }} onClick={() => setEditCol((x) => ({ ...x, color: c }))} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="pill-btn" onClick={() => setEditCol(null)}>Cancelar</button>
              <button className="pill-btn primary" onClick={saveCol}>Salvar</button>
            </div>
          </div>
        </div>
      )}
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
