import React, { useEffect, useState } from "react";
import { Plus, Trash2, Smartphone, QrCode, Pencil, Workflow } from "lucide-react";
import {
  getChannels,
  createChannelApi,
  removeChannel,
  getDepartments,
  getTeam,
  getChannelPermissionsApi,
  setChannelPermissionsApi,
  getFlows,
  updateChannelApi,
  API_BASE
} from "../api.js";
import WhatsAppConnectModal from "./WhatsAppConnectModal.jsx";

const PLATFORM_LABELS = { whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram" };

function PermissionsPanel({ channel, team, onClose }) {
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    getChannelPermissionsApi(channel.id).then(setSelected).catch(console.error);
  }, [channel.id]);

  const toggle = (profileId) => {
    setSelected((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );
  };

  const save = async () => {
    await setChannelPermissionsApi(channel.id, selected);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card deal-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Quem vê "{channel.name}"</h3>
        <p>
          Sem ninguém marcado, o dispositivo fica visível pra conta inteira. Marque atendentes
          específicos pra restringir.
        </p>
        <div className="permissions-list">
          {team
            .filter((m) => m.role === "agent")
            .map((m) => (
              <label key={m.id} className="col-toggle-row">
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={() => toggle(m.id)}
                />
                {m.name || "Sem nome"}
              </label>
            ))}
          {team.filter((m) => m.role === "agent").length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Nenhum atendente cadastrado ainda.
            </div>
          )}
        </div>
        <button className="connect-btn" style={{ marginTop: 14 }} onClick={save}>
          Salvar
        </button>
        <button className="modal-close" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function NewChannelModal({ departments, flows, initial, onClose, onCreate }) {
  const editing = !!initial;
  const [platform, setPlatform] = useState(initial?.platform || "whatsapp");
  const [name, setName] = useState(initial?.name || "");
  const [departmentId, setDepartmentId] = useState(initial?.departmentId || "");
  const [flowId, setFlowId] = useState(initial?.flowId || "");
  const [provider, setProvider] = useState(initial?.provider || "baileys");
  const [externalPageId, setExternalPageId] = useState(initial?.externalPageId || "");
  const [phoneNumberId, setPhoneNumberId] = useState(initial?.phoneNumberId || "");
  const [wabaId, setWabaId] = useState(initial?.wabaId || "");
  const [accessToken, setAccessToken] = useState("");
  const isMeta = platform !== "whatsapp";
  const isCloud = platform === "whatsapp" && provider === "cloud";
  const webhookUrl = `${API_BASE.replace(/\/$/, "")}/webhook/meta`;
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Dê um apelido para o canal.");
    try {
      await onCreate({
        platform,
        name: name.trim(),
        departmentId: departmentId || null,
        flowId: flowId || null,
        provider: isCloud ? "cloud" : undefined,
        externalPageId: isMeta ? externalPageId.trim() : undefined,
        phoneNumberId: isCloud ? phoneNumberId.trim() : undefined,
        wabaId: isCloud ? wabaId.trim() : undefined,
        accessToken: accessToken.trim() || undefined
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card deal-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{editing ? "Editar canal" : "Novo canal"}</h3>
        <form onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Plataforma</span>
            <select value={platform} disabled={editing} onChange={(e) => setPlatform(e.target.value)} className="deal-stage-select">
              <option value="whatsapp">WhatsApp (QR Code ou código)</option>
              <option value="messenger">Facebook (Messenger)</option>
              <option value="instagram">Instagram Direct</option>
            </select>
          </label>
          {platform === "whatsapp" && (
            <label className="login-field">
              <span>Tipo de conexão</span>
              <select value={provider} disabled={editing} onChange={(e) => setProvider(e.target.value)} className="deal-stage-select">
                <option value="baileys">QR Code (WhatsApp normal ou Business no celular)</option>
                <option value="cloud">API oficial da Meta (WhatsApp Cloud API)</option>
              </select>
            </label>
          )}
          {isCloud && (
            <>
              <label className="login-field"><span>Phone Number ID</span><input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="Ex: 123456789012345" /></label>
              <label className="login-field"><span>WhatsApp Business Account ID (opcional)</span><input value={wabaId} onChange={(e) => setWabaId(e.target.value)} /></label>
            </>
          )}
          {isMeta && (
            <label className="login-field">
              <span>{platform === "instagram" ? "ID da conta do Instagram" : "ID da Página do Facebook"}</span>
              <input value={externalPageId} onChange={(e) => setExternalPageId(e.target.value)} placeholder="Ex: 1029384756" />
            </label>
          )}
          {(isMeta || isCloud) && (
            <>
              <label className="login-field">
                <span>Token de acesso {editing && initial?.hasToken ? "(deixe vazio para manter o atual)" : ""}</span>
                <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Token permanente do app na Meta" autoComplete="off" />
              </label>
              <div className="channel-meta-help">
                <strong>Na Meta for Developers, configure o Webhook:</strong>
                <span>URL: <code>{webhookUrl}</code></span>
                <span>Token de verificação: o valor de <code>META_VERIFY_TOKEN</code> no servidor</span>
                <span>Assinar: {isCloud ? "messages" : platform === "instagram" ? "messages (Instagram)" : "messages, messaging_postbacks"}</span>
              </div>
            </>
          )}
          <label className="login-field">
            <span>Apelido do dispositivo</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Comercial 2" autoFocus />
          </label>
          <label className="login-field">
            <span>Setor de atendimento</span>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="deal-stage-select"
            >
              <option value="">Sem setor (fica em Pendentes para todos)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <small className="cv-muted">Toda conversa nova deste número entra neste setor.</small>
          </label>
          <label className="login-field">
            <span>Fluxo de atendimento (bot)</span>
            <select value={flowId} onChange={(e) => setFlowId(e.target.value)} className="deal-stage-select">
              <option value="">Usar o fluxo ativo da empresa</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}{f.active ? " (ativo)" : ""}
                </option>
              ))}
            </select>
            <small className="cv-muted">O bot deste número segue este fluxo. Crie fluxos na aba Fluxos.</small>
          </label>
          {error && <div className="admin-feedback error">{error}</div>}
          <button type="submit" className="connect-btn" style={{ marginTop: 6 }}>
            {editing ? "Salvar" : "Criar canal"}
          </button>
        </form>
        <button className="modal-close" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [team, setTeam] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [qrChannel, setQrChannel] = useState(null);
  const [permChannel, setPermChannel] = useState(null);
  const [editChannel, setEditChannel] = useState(null);
  const [flows, setFlows] = useState([]);

  const load = () => {
    getFlows().then((f) => setFlows(Array.isArray(f) ? f : f?.flows || [])).catch(() => {});
    getChannels().then(setChannels).catch(console.error);
    getDepartments().then(setDepartments).catch(console.error);
    getTeam().then(setTeam).catch(console.error);
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      getChannels().then(setChannels).catch(console.error);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (data) => {
    const { platform, name, departmentId, flowId, ...extra } = data;
    const created = await createChannelApi(platform, name, departmentId, flowId, extra);
    setShowNew(false);
    load();
    // WhatsApp novo: já abre o QR Code, sem precisar procurar o botão.
    if (created?.platform === "whatsapp" && created.provider !== "cloud") setQrChannel(created);
  };

  const handleEdit = async (data) => {
    await updateChannelApi(editChannel.id, data);
    setEditChannel(null);
    load();
  };

  const handleDelete = async (id) => {
    await removeChannel(id);
    load();
  };

  return (
    <div className="page">
      <div className="deals-toolbar">
        <div className="card-subtitle" style={{ margin: 0 }}>
          Cada dispositivo de WhatsApp é uma conexão independente. Uma conta pode ter vários.
        </div>
        <button className="connect-btn deals-new-btn" onClick={() => setShowNew(true)}>
          <Plus size={15} style={{ marginRight: 6, verticalAlign: -3 }} />
          Novo canal
        </button>
      </div>

      <div className="agent-grid">
        {channels.map((c) => (
          <div className="agent-card" key={c.id}>
            <div className="agent-avatar">
              <Smartphone size={20} />
            </div>
            <div className="agent-name">{c.name || PLATFORM_LABELS[c.platform]}</div>
            <div className="agent-meta">
              {PLATFORM_LABELS[c.platform]}
              {c.departmentName ? ` · ${c.departmentName}` : " · sem setor"}
            </div>
            <div className="agent-meta channel-flow">
              <Workflow size={12} /> {flows.find((f) => f.id === c.flowId)?.name || "Fluxo ativo da empresa"}
            </div>

            {c.platform === "whatsapp" && (
              <div
                className="agent-status"
                style={{ color: c.status === "connected" ? "var(--success)" : "var(--text-muted)" }}
              >
                <span
                  className="status-dot"
                  style={{
                    background:
                      c.status === "connected" ? "var(--success)" : c.status === "connecting" ? "#f2a900" : "#c3c9cc"
                  }}
                />
                {c.status === "connected"
                  ? `Conectado${c.phone ? ` · +${c.phone}` : ""}`
                  : c.status === "connecting"
                    ? "Aguardando leitura do QR"
                    : "Desconectado"}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {c.platform === "whatsapp" && (
                <button
                  className="connect-btn"
                  style={{ width: "auto", padding: "8px 14px" }}
                  onClick={() => setQrChannel(c)}
                >
                  <QrCode size={14} style={{ marginRight: 5, verticalAlign: -2 }} />
                  {c.status === "connected" ? "Ver status" : "Conectar"}
                </button>
              )}
              <button className="resolve-btn" onClick={() => setEditChannel(c)} title="Setor e fluxo">
                <Pencil size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                Editar
              </button>
              <button
                className="resolve-btn"
                onClick={() => setPermChannel(c)}
              >
                Permissões
              </button>
              <button className="reply-delete" onClick={() => handleDelete(c.id)} title="Remover canal">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {channels.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
            Nenhum canal cadastrado ainda.
          </div>
        )}
      </div>

      {showNew && (
        <NewChannelModal departments={departments} flows={flows} onClose={() => setShowNew(false)} onCreate={handleCreate} />
      )}
      {editChannel && (
        <NewChannelModal departments={departments} flows={flows} initial={editChannel} onClose={() => setEditChannel(null)} onCreate={handleEdit} />
      )}

      {qrChannel && (
        <WhatsAppConnectModal
          channelId={qrChannel.id}
          channelName={qrChannel.name}
          onClose={() => {
            setQrChannel(null);
            load();
          }}
        />
      )}

      {permChannel && (
        <PermissionsPanel channel={permChannel} team={team} onClose={() => setPermChannel(null)} />
      )}
    </div>
  );
}
