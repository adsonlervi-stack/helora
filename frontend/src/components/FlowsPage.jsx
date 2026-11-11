import React, { useEffect, useState } from "react";
import { Workflow, Plus, Pencil, Copy, Trash2, Search } from "lucide-react";
import { getFlows, createFlowApi, setFlowActiveApi, deleteFlowApi } from "../api.js";
import PromptsPage from "./PromptsPage.jsx";
import FlowEditor from "./FlowEditor.jsx";

const when = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function FlowsPage({ canEdit }) {
  const [view, setView] = useState("flows");
  const [flows, setFlows] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = () => getFlows().then(setFlows).catch((e) => setError(e.response?.data?.error || e.message));
  useEffect(() => {
    if (!openId) load();
  }, [openId]);

  if (openId) return <FlowEditor flowId={openId} canEdit={canEdit} onBack={() => setOpenId(null)} />;
  const switcher = (
    <div className="crm-tabs" style={{ marginBottom: 16 }}>
      <button className={view === "flows" ? "active" : ""} onClick={() => setView("flows")}>Fluxos</button>
      <button className={view === "prompts" ? "active" : ""} onClick={() => setView("prompts")}>✨ Prompts de IA</button>
    </div>
  );
  if (view === "prompts") return <div className="page">{switcher}<PromptsPage canEdit={canEdit} /></div>;

  const create = async (duplicateFrom) => {
    try {
      const src = flows.find((f) => f.id === duplicateFrom);
      const f = await createFlowApi({ name: src ? `${src.name} (cópia)` : "Novo fluxo", duplicateFrom });
      setOpenId(f.id);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const toggle = async (f) => {
    await setFlowActiveApi(f.id, !f.active).catch((e) => setError(e.response?.data?.error || e.message));
    load();
  };

  const remove = async (id) => {
    await deleteFlowApi(id).catch((e) => setError(e.response?.data?.error || e.message));
    setConfirmDel(null);
    load();
  };

  const list = flows
    .filter((f) => (filter === "all" ? true : filter === "active" ? f.active : !f.active))
    .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page">
      <div className="pg-top">
        <h1>Fluxos</h1>
        <div className="pg-tabs">
          {[["all", "Todos", flows.length], ["active", "Ativo"], ["inactive", "Inativos"]].map(([k, l, n]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}{n != null && <span>{n}</span>}</button>
          ))}
        </div>
        <span className="pg-sp" />
        <div className="pg-search"><Search size={15} /><input placeholder="Buscar fluxo" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {canEdit && <button className="pg-btn p" onClick={() => create()}><Plus size={15} /> Novo fluxo</button>}
      </div>
      <p className="pg-desc">Monte o roteiro do bot arrastando blocos. Só um fluxo fica ativo por vez e ele responde todo cliente novo.</p>

      {error && <div className="admin-feedback error" style={{ margin: "12px 0" }}>{error}</div>}

      <div className="ct-table fl-table">
        {list.map((f) => (
          <div className="contact-row fl-row" key={f.id}>
            <span className="fl-row-icon"><Workflow size={16} /></span>
            <div className="contact-info" onClick={() => setOpenId(f.id)} style={{ cursor: "pointer" }}>
              <strong>{f.name}</strong>
              <span>
                {f.graph?.nodes?.length || 0} {(f.graph?.nodes?.length || 0) === 1 ? "bloco" : "blocos"} · v{f.version} · atualizado em {when(f.updatedAt)}
              </span>
            </div>
            <button className={`pill-btn ${f.active ? "on" : ""}`} onClick={() => canEdit && toggle(f)} disabled={!canEdit}>
              <span className={`fe-dot ${f.active ? "on" : ""}`} /> {f.active ? "Ativo" : "Inativo"}
            </button>
            <button className="cv-icon-btn" title="Editar" onClick={() => setOpenId(f.id)}><Pencil size={15} /></button>
            {canEdit && (
              <>
                <button className="cv-icon-btn" title="Duplicar" onClick={() => create(f.id)}><Copy size={15} /></button>
                {confirmDel === f.id ? (
                  <button className="pill-btn wa-danger" style={{ color: "#fff" }} onClick={() => remove(f.id)}>Confirmar</button>
                ) : (
                  <button className="cv-icon-btn" title="Apagar" onClick={() => setConfirmDel(f.id)}><Trash2 size={15} /></button>
                )}
              </>
            )}
          </div>
        ))}
        {list.length === 0 && !error && (
          <div className="cv-empty">
            Nenhum fluxo ainda. {canEdit && <>Clique em <strong>Novo fluxo</strong>: ele já vem com um menu de exemplo pronto para editar.</>}
          </div>
        )}
      </div>
    </div>
  );
}
