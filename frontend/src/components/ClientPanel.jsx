import { Group, Row, Sheet, Button } from "./ui.jsx";
import { getConversationAuditApi } from "../api.js";
import React, { useEffect, useState } from "react";
import { X, User, Briefcase, StickyNote, Plus } from "lucide-react";
import Avatar from "./Avatar.jsx";
import LabelPicker from "./LabelPicker.jsx";
import PrioritySelector from "./PrioritySelector.jsx";
import NotesSection from "./NotesSection.jsx";
import { getConversationContact, updateContactLeadApi, createConversationDealApi } from "../api.js";

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
        <Avatar name={conversation.name} url={conversation.avatarUrl} size={56} />
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
                  <Row label="WhatsApp"><input defaultValue={contact.phone || ""} inputMode="tel" placeholder="5584999998888" onBlur={(e) => { const v = e.target.value.replace(/\D/g, ""); if (v && v !== contact.phone) saveField({ phone: v }); }} /></Row>
                  <Row label="E-mail"><input defaultValue={contact.email || ""} inputMode="email" placeholder="Adicionar" onBlur={(e) => e.target.value !== (contact.email || "") && saveField({ email: e.target.value })} /></Row>
                </Group>
                <Group title="Lead" hint="Mudar o status coloca ou move o contato no Pipeline.">
                  <Row label="Origem">
                    <select value={contact.leadOrigin || ""} onChange={(e) => saveField({ leadOrigin: e.target.value })}>
                      <option value="">Escolher</option>
                      {ORIGINS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </Row>
                  <Row label="Status">
                    <select value={contact.leadStatus || ""} onChange={(e) => saveField({ leadStatus: e.target.value })}>
                      <option value="">Escolher</option>
                      {STATUSES.map((o) => <option key={o}>{o}</option>)}
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
        <Sheet title="Auditoria da conversa" subtitle="Registro inalterável de tudo que foi enviado, editado ou apagado (guardado por 120 dias)." onClose={() => setOpen(false)} width={640}>
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
