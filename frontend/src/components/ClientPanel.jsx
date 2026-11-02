import { Group, Row, Sheet, Button } from "./ui.jsx";
import { getConversationAuditApi, setConversationAvatarApi } from "../api.js";
import React, { useEffect, useState } from "react";
import { X, User, Briefcase, StickyNote, Plus, Pencil } from "lucide-react";
import Avatar, { cartoonPick, isCartoon } from "./Avatar.jsx";
import LabelPicker from "./LabelPicker.jsx";
import PrioritySelector from "./PrioritySelector.jsx";
import NotesSection from "./NotesSection.jsx";
import { getConversationContact, updateContactLeadApi, createConversationDealApi, crm, getTeam } from "../api.js";
import CrmLeadPage from "./CrmLeadPage.jsx";
import { KanbanSquare, Workflow, ExternalLink } from "lucide-react";

const STAGES = {
  novo_lead: "Novo lead", contato: "Contato", negociacao: "Negociação",
  proposta: "Proposta", fechado: "Fechado", perdido: "Perdido"
};
const ORIGINS = ["Indicação", "Instagram", "Facebook", "Google", "Site", "WhatsApp", "Campanha", "Outro"];
const STATUSES = ["Novo", "Qualificado", "Em negociação", "Cliente", "Perdido"];
const brl = (v) => (v ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");
const fmtPhone = (d) => {
  const s = String(d || "");
  if (s.startsWith("55") && s.length >= 12) {
    const rest = s.slice(4);
    return `+55 (${s.slice(2, 4)}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return s ? `+${s}` : "";
};

/** Painel do cliente (clicar na foto/nome): Perfil, Oportunidades e Notas. */
export default function ClientPanel({ conversation, departments = [], team = [], onSetPriority, onToggleLabel, onSetDepartment, onAssign, onClose, onOpenPipeline }) {
  const [tab, setTab] = useState("perfil");
  const [avOpen, setAvOpen] = useState(false);
  const [avChoice, setAvChoice] = useState(undefined);
  useEffect(() => { setAvChoice(undefined); setAvOpen(false); }, [conversation?.id]);
  const [contact, setContact] = useState(null);
  const [deals, setDeals] = useState([]);
  const [saving, setSaving] = useState(false);
  const [newDeal, setNewDeal] = useState(null);

  const load = () =>
    getConversationContact(conversation.id)
      .then((d) => {
        setContact(d.contact);
        setDeals(d.deals || []);
      })
      .catch(() => {});

  useEffect(() => {
    setContact(null);
    setDeals([]);
    setNewDeal(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  const saveField = async (patch) => {
    if (!contact) return;
    setContact({ ...contact, ...patch });
    setSaving(true);
    try {
      setContact(await updateContactLeadApi(contact.id, patch.leadStatus !== undefined ? { ...patch, conversationId: conversation.id } : patch));
    } catch {}
    setSaving(false);
  };

  const createDeal = async (e) => {
    e.preventDefault();
    await createConversationDealApi(conversation.id, newDeal);
    setNewDeal(null);
    load();
  };

  return (
    <aside className="contact-panel client-panel lg-panel">
      <div className="contact-panel-topbar">
        <span>Cliente</span>
        <button className="cv-icon-btn" onClick={onClose}><X size={15} /></button>
      </div>

      <div className="client-identity">
        <span className="av-pick-wrap">
          <Avatar name={conversation.name} url={avChoice ?? conversation.avatarUrl} size={56} zoomable />
          {isCartoon(avChoice ?? conversation.avatarUrl) && !conversation.isGroup && (
            <button className="av-pick-btn" title="Trocar boneco" onClick={() => setAvOpen((v) => !v)}><Pencil size={11} /></button>
          )}
          {avOpen && (
            <div className="av-pick">
              <div className="av-pick-t">Escolha o boneco</div>
              {["f", "m"].map((g) => (
                <div key={g} className="av-pick-row">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => {
                    const v = `avatar:${g}:${n}`;
                    return <button key={v} onClick={async () => { try { await setConversationAvatarApi(conversation.id, v); setAvChoice(v); setAvOpen(false); } catch (e) { alert(e?.response?.data?.error || e.message); } }}><img src={cartoonPick(conversation.name, v).src} alt="" style={{ background: cartoonPick(conversation.name, v).bg }} /></button>;
                  })}
                </div>
              ))}
              <button className="lp-link sm" onClick={async () => { await setConversationAvatarApi(conversation.id, null).catch(() => {}); setAvChoice(null); setAvOpen(false); }}>Automático (pelo nome)</button>
            </div>
          )}
        </span>
        <div>
          <strong>{contact?.name || conversation.name}</strong>
          <span>{conversation.isGroup ? "Grupo de WhatsApp" : fmtPhone(contact?.phone || conversation.phone || "") || "Número não informado"}</span>
        </div>
      </div>

      <div className="cv-segment client-tabs">
        <button className={tab === "perfil" ? "active" : ""} onClick={() => setTab("perfil")}><User size={13} /> Perfil</button>
        <button className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}><StickyNote size={13} /> Notas</button>
      </div>

      <div className="client-body">
        {tab === "perfil" && (
          <>
            {contact && (
              <>
                <Group title="Contato">
                  <Row label="Nome"><input defaultValue={contact.name || contact.pushName || ""} placeholder="Nome" onBlur={(e) => e.target.value !== (contact.name || "") && saveField({ name: e.target.value })} /></Row>
                  <Row label="WhatsApp"><input key={contact.phone || ""} defaultValue={fmtPhone(contact.phone || "") || ""} inputMode="tel" placeholder="5584999998888" onBlur={(e) => { const v = e.target.value.replace(/\D/g, ""); if (v && v !== contact.phone) saveField({ phone: v }); }} /></Row>
                  <Row label="E-mail"><input defaultValue={contact.email || ""} inputMode="email" placeholder="Adicionar" onBlur={(e) => e.target.value !== (contact.email || "") && saveField({ email: e.target.value })} /></Row>
                </Group>
                <FunnelBox conversation={conversation} contact={contact} saveField={saveField} />
                <Group title="Lead">
                  <Row label="Origem">
                    <select value={contact.leadOrigin || ""} onChange={(e) => saveField({ leadOrigin: e.target.value })}>
                      <option value="">Escolher</option>
                      {ORIGINS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </Row>
                  <Row label="Atendente padrão">
                    <select value={contact.defaultAgentId || ""} onChange={(e) => saveField({ defaultAgentId: e.target.value })}>
                      <option value="">Nenhum</option>
                      {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </Row>
                  <Row label="Setor padrão">
                    <select value={contact.defaultDepartmentId || ""} onChange={(e) => saveField({ defaultDepartmentId: e.target.value })}>
                      <option value="">Nenhum</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </Row>
                </Group>
                <Group title="Observações">
                  <Row label="" stack><textarea rows={3} defaultValue={contact.notes || ""} placeholder="Anotações sobre o cliente" onBlur={(e) => e.target.value !== (contact.notes || "") && saveField({ notes: e.target.value })} /></Row>
                </Group>
                {saving && <div className="cv-muted" style={{ marginTop: 6 }}>Salvando…</div>}
              </>
            )}

            <Group title="Esta conversa">
              <div className="ap-row"><span className="ap-row-label">Prioridade</span><span className="ap-row-control"><PrioritySelector value={conversation.priority} onChange={onSetPriority} /></span></div>
              <Row label="Setor">
                <select value={conversation.departmentId || ""} onChange={(e) => onSetDepartment(e.target.value || null)}>
                  <option value="">Sem setor</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Row>
              <Row label="Atendente">
                <select value={conversation.assignedAgentId || ""} onChange={(e) => onAssign(e.target.value || null)}>
                  <option value="">Ninguém (pendente)</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.name || "Sem nome"}</option>)}
                </select>
              </Row>
            </Group>
            <AuditButton conversationId={conversation.id} />
            <div className="ap-group-title" style={{ marginTop: 18 }}>Etiquetas</div>
            <div className="panel-labels">
              {(conversation.labels || []).map((l) => (
                <span key={l.id} className="cv-tag" style={{ "--tag": l.color }}>{l.title}</span>
              ))}
              <LabelPicker conversation={conversation} onToggleLabel={onToggleLabel} />
            </div>
          </>
        )}

        {tab === "deals" && (
          <>
            {!newDeal ? (
              <button className="pill-btn primary" onClick={() => setNewDeal({ title: conversation.name, value: "", stage: "novo_lead" })}>
                <Plus size={14} /> Nova oportunidade
              </button>
            ) : (
              <form className="client-deal-form" onSubmit={createDeal}>
                <label className="login-field"><span>Título</span><input value={newDeal.title} onChange={(e) => setNewDeal({ ...newDeal, title: e.target.value })} autoFocus /></label>
                <div className="client-two">
                  <label className="login-field"><span>Valor (R$)</span><input value={newDeal.value} inputMode="decimal" onChange={(e) => setNewDeal({ ...newDeal, value: e.target.value.replace(",", ".") })} /></label>
                  <label className="login-field"><span>Etapa</span>
                    <select className="deal-stage-select" value={newDeal.stage} onChange={(e) => setNewDeal({ ...newDeal, stage: e.target.value })}>
                      {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                </div>
                <div className="gestao-row">
                  <button className="pill-btn primary" disabled={!newDeal.title.trim()}>Criar no pipeline</button>
                  <button type="button" className="pill-btn" onClick={() => setNewDeal(null)}>Cancelar</button>
                </div>
              </form>
            )}
            <div className="client-deals">
              {deals.map((d) => (
                <button key={d.id} className={`client-deal stage-${d.stage}`} onClick={() => onOpenPipeline?.(d)}>
                  <span className="client-deal-stage">{STAGES[d.stage] || d.stage}</span>
                  <strong>{d.title}</strong>
                  <small>{brl(d.value)} · {new Date(d.createdAt).toLocaleDateString("pt-BR")}</small>
                </button>
              ))}
              {!deals.length && !newDeal && <div className="cv-muted" style={{ padding: "12px 0" }}>Nenhuma oportunidade ainda.</div>}
            </div>
          </>
        )}

        {tab === "notes" && <NotesSection conversationId={conversation.id} />}
      </div>
    </aside>
  );
}


const AUDIT_LABEL = { create: "Enviada", update: "Editada (texto anterior)", delete: "Excluída do banco", apagada: "Apagada no WhatsApp" };
/** Histórico inalterável da conversa (só gestor). */
function AuditButton({ conversationId }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const show = () => {
    setOpen(true);
    setRows(null);
    getConversationAuditApi(conversationId).then(setRows).catch((e) => { setErr(e.response?.status === 403 ? "Só o gestor vê a auditoria." : e.response?.data?.error || e.message); setRows([]); });
  };
  return (
    <>
      <div style={{ marginTop: 12 }}><Button variant="secondary" onClick={show}>Auditoria da conversa</Button></div>
      {open && (
        <Sheet title="Auditoria da conversa" subtitle="Tudo que foi enviado, editado ou apagado nos últimos 120 dias." onClose={() => setOpen(false)} width={640}>
          {err && <div className="admin-feedback error">{err}</div>}
          <div className="ap-group-box" style={{ marginTop: 12 }}>
            {rows === null && <div className="ap-empty">Carregando…</div>}
            {rows?.map((r) => (
              <div key={r.id} className="audit-row">
                <div className="audit-meta">
                  <strong>{r.author === "user" ? "Cliente" : r.author === "bot" ? "Robô" : r.author === "system" ? "Sistema" : r.senderName || "Atendente"}</strong>
                  <span>{new Date(r.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })} · {AUDIT_LABEL[r.action] || r.action}</span>
                </div>
                <div className="audit-text">{r.text || (r.mediaType ? `📎 ${r.mediaType}` : "—")}</div>
              </div>
            ))}
            {rows && !rows.length && !err && <div className="ap-empty">Sem registros ainda (a auditoria começa a contar a partir da atualização).</div>}
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Onde o cliente está: Pipeline (atendimento) ou CRM (funil e etapa). Se veio do CRM, já mostra o card. */
function FunnelBox({ conversation, contact, saveField }) {
  const [mode, setMode] = useState(null);
  const [pipes, setPipes] = useState(null);
  const [lead, setLead] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [openCard, setOpenCard] = useState(null);

  useEffect(() => {
    setMode(null); setLead(null); setErr(null);
    Promise.all([crm.pipelines().catch(() => null), crm.leadByConversation(conversation.id).catch(() => ({ lead: null }))]).then(([p, r]) => {
      setPipes(p);
      setLead(r?.lead || null);
      setMode(r?.lead ? "crm" : "pipeline");
    });
  }, [conversation.id]);

  const pipe = pipes?.find((p) => p.id === lead?.pipelineId) || null;
  const move = async (pipelineId, stage) => {
    setBusy(true); setErr(null);
    try { const r = await crm.setConversationLead(conversation.id, { pipelineId, stage }); setLead(r.lead); }
    catch (e) { setErr(e?.response?.data?.error || e.message); }
    setBusy(false);
  };
  const showCard = async () => {
    const [tags, products, team] = await Promise.all([crm.tags().catch(() => []), crm.products().catch(() => []), getTeam().catch(() => [])]);
    setOpenCard({ tags, products, team });
  };
  const crmAvailable = Array.isArray(pipes) && pipes.length > 0;

  return (
    <Group title="Funil">
      <div className="cp-dest">
        <button className={mode === "pipeline" ? "on" : ""} onClick={() => setMode("pipeline")}><Workflow size={14} /> Pipeline</button>
        <button className={mode === "crm" ? "on" : ""} onClick={() => setMode("crm")} disabled={!crmAvailable} title={crmAvailable ? "" : "CRM não liberado para esta empresa"}><KanbanSquare size={14} /> CRM</button>
      </div>
      {mode === "pipeline" && (
        <Row label="Etapa">
          <select value={contact.leadStatus || ""} onChange={(e) => saveField({ leadStatus: e.target.value })}>
            <option value="">Escolher</option>
            {STATUSES.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Row>
      )}
      {mode === "crm" && crmAvailable && (
        <>
          {lead && pipe ? (
            <div className="cpd">
              <div className="cpd-crumb"><span>{pipe.name}</span> › <strong>{lead.name}</strong><button title="Abrir card" onClick={showCard}><ExternalLink size={14} /></button></div>
              <div className="cpd-bar">
                {(pipe.stages || []).map((st, i) => {
                  const idx = (pipe.stages || []).findIndex((x) => x.id === lead.stage);
                  return <button key={st.id} title={st.name} disabled={busy} className={i <= idx ? "on" : ""} style={i <= idx ? { background: st.color || "#0071e3" } : undefined} onClick={() => move(lead.pipelineId, st.id)} />;
                })}
              </div>
              <div className="cpd-stage">
                <select value={lead.stage} disabled={busy} onChange={(e) => move(lead.pipelineId, e.target.value)}>
                  {(pipe.stages || []).map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
                <span>{(pipe.stages || []).findIndex((x) => x.id === lead.stage) + 1}/{(pipe.stages || []).length}</span>
              </div>
              <div className="cpd-grid">
                <div><small>Valor</small><strong>{brl(lead.value || 0)}</strong></div>
                <div><small>Dono</small><strong>{lead.ownerName || "Sem dono"}</strong></div>
              </div>
              <div className="cpd-out">
                {[["won", "Ganho"], ["lost", "Perdido"], [null, "Aberto"]].map(([k, l]) => (
                  <button key={l} className={`${(lead.outcome || null) === k ? "on" : ""} ${k || "open"}`} disabled={busy}
                    onClick={async () => { setBusy(true); try { const r = await crm.updateLead(lead.id, { outcome: k }); setLead(r.lead || r); } catch (e) { setErr(e?.response?.data?.error || e.message); } setBusy(false); }}>{l}</button>
                ))}
              </div>
              <button className="cpd-move" onClick={() => setLead({ ...lead, __pick: true })}>Trocar de funil</button>
              {lead.__pick && (
                <select autoFocus value="" disabled={busy} onChange={(e) => { const p = pipes.find((x) => x.id === e.target.value); if (p) move(p.id, p.stages?.[0]?.id); }}>
                  <option value="" disabled>Escolher funil</option>
                  {pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
          ) : (
            <>
              <Row label="Funil">
                <select value="" disabled={busy} onChange={(e) => { const p = pipes.find((x) => x.id === e.target.value); if (p) move(p.id, p.stages?.[0]?.id); }}>
                  <option value="" disabled>Escolher funil</option>
                  {pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Row>
              <div className="cv-muted" style={{ padding: "6px 14px 10px", fontSize: 12.5 }}>Escolha o funil para criar o card deste cliente no CRM.</div>
            </>
          )}
        </>
      )}
      {err && <div className="admin-feedback error" style={{ margin: 8 }}>{err}</div>}
      {openCard && lead && (
        <CrmLeadPage
          ctx={{ pipelines: pipes, tags: openCard.tags, products: openCard.products, team: openCard.team, isManager: false, loadPipelines: () => crm.pipelines().then(setPipes), loadProducts: () => crm.products(), onOpenConversation: () => {} }}
          lead={lead}
          onClose={() => { setOpenCard(null); crm.leadByConversation(conversation.id).then((r) => setLead(r.lead)).catch(() => {}); }}
        />
      )}
    </Group>
  );
}
