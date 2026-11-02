import { askConfirm } from "../dialogs.js";
import React, { useEffect, useState } from "react";
import { Plus, Trash2, Smartphone, QrCode, Pencil, Workflow, ChevronDown, ChevronRight, Wifi, WifiOff, RotateCw, Power, Users, Clock, Instagram, Facebook, Mail, MessageCircle } from "lucide-react";
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
  logoutWhatsAppApi,
  resetWhatsAppApi,
  API_BASE
} from "../api.js";
import WhatsAppConnectModal from "./WhatsAppConnectModal.jsx";
import { Sheet, Group, Row, Button } from "./ui.jsx";

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
          Sem ninguém marcado, toda a equipe vê este canal.
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

function NewChannelModal({ departments, flows, initial, preset, onClose, onCreate }) {
  const editing = !!initial;
  const [platform, setPlatform] = useState(initial?.platform || preset?.platform || "whatsapp");
  const [name, setName] = useState(initial?.name || "");
  const [departmentId, setDepartmentId] = useState(initial?.departmentId || "");
  const [flowId, setFlowId] = useState(initial?.flowId || "");
  const [provider, setProvider] = useState(initial?.provider || preset?.provider || "baileys");
  const [externalPageId, setExternalPageId] = useState(initial?.externalPageId || "");
  const [phoneNumberId, setPhoneNumberId] = useState(initial?.phoneNumberId || "");
  const [wabaId, setWabaId] = useState(initial?.wabaId || "");
  const [accessToken, setAccessToken] = useState("");
  const isMeta = platform !== "whatsapp";
  const isCloud = platform === "whatsapp" && provider === "cloud";
  const webhookUrl = `${API_BASE.replace(/\/$/, "")}/webhook/meta`;
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
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
    <Sheet
      title={editing ? "Editar canal" : "Novo canal"}
      subtitle="WhatsApp, Facebook ou Instagram da empresa."
      onClose={onClose}
      width={560}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={handleSubmit}>{editing ? "Salvar" : "Criar canal"}</Button></>}
    >
      <Group title="Conexão">
        <Row label="Plataforma">
          <select value={platform} disabled={editing} onChange={(e) => setPlatform(e.target.value)}>
            <option value="whatsapp">WhatsApp</option>
            <option value="messenger">Facebook Messenger</option>
            <option value="instagram">Instagram Direct</option>
          </select>
        </Row>
        {platform === "whatsapp" && (
          <Row label="Tipo">
            <select value={provider} disabled={editing} onChange={(e) => setProvider(e.target.value)}>
              <option value="baileys">QR Code (celular)</option>
              <option value="cloud">API oficial da Meta</option>
            </select>
          </Row>
        )}
        <Row label="Apelido"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Comercial 2" autoFocus /></Row>
      </Group>
      {isCloud && (
        <Group title="API oficial">
          <Row label="Phone Number ID"><input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="123456789012345" /></Row>
          <Row label="WABA ID"><input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="Opcional" /></Row>
        </Group>
      )}
      {isMeta && (
        <Group title={platform === "instagram" ? "Instagram" : "Facebook"}>
          <Row label={platform === "instagram" ? "ID da conta" : "ID da página"}><input value={externalPageId} onChange={(e) => setExternalPageId(e.target.value)} placeholder="1029384756" /></Row>
        </Group>
      )}
      {(isMeta || isCloud) && (
        <Group title="Token da Meta" hint={`Webhook: ${webhookUrl} · Token de verificação: META_VERIFY_TOKEN do servidor · Assinar: ${isCloud ? "messages" : platform === "instagram" ? "messages (Instagram)" : "messages, messaging_postbacks"}`}>
          <Row label="Token de acesso"><input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={editing && initial?.hasToken ? "Vazio = manter o atual" : "Token permanente"} autoComplete="off" /></Row>
        </Group>
      )}
      <Group title="Atendimento" hint="Conversas novas entram neste setor e seguem este fluxo.">
        <Row label="Setor">
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Sem setor (Pendentes)</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Row>
        <Row label="Fluxo do robô">
          <select value={flowId} onChange={(e) => setFlowId(e.target.value)}>
            <option value="">Fluxo ativo da empresa</option>
            {flows.map((f) => <option key={f.id} value={f.id}>{f.name}{f.active ? " (ativo)" : ""}</option>)}
          </select>
        </Row>
      </Group>
      {error && <div className="admin-feedback error" style={{ marginTop: 12 }}>{error}</div>}
    </Sheet>
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
    const ch = (channels || []).find?.((x) => x.id === id);
    if (!await askConfirm(`Remover o canal${ch?.name ? ` "${ch.name}"` : ""}? O número será desconectado e as mensagens dele param de chegar no Helora.`, { okText: "Sim, remover", danger: true })) return;
    await removeChannel(id);
    load();
  };

  const [menu, setMenu] = useState(false);
  const [hideOff, setHideOff] = useState(() => { try { return localStorage.getItem("helora_ch_hide") === "1"; } catch { return false; } });
  const isOn = (c) => c.status === "connected";
  const shown = channels.filter((c) => !hideOff || isOn(c));
  const ADD = [
    { k: "wa", icon: QrCode, color: "#25D366", title: "WhatsApp (QR Code)", sub: "Conecte lendo o QR Code no celular", preset: { platform: "whatsapp", provider: "baileys" } },
    { k: "cloud", icon: MessageCircle, color: "#128C7E", title: "WhatsApp Cloud API", sub: "API oficial da Meta", preset: { platform: "whatsapp", provider: "cloud" } },
    { k: "ig", icon: Instagram, color: "#C13584", title: "Instagram Direct", sub: "Mensagens do Instagram", preset: { platform: "instagram" } },
    { k: "fb", icon: Facebook, color: "#1877F2", title: "Facebook Page", sub: "Messenger da sua página", preset: { platform: "messenger" } },
    { k: "mail", icon: Mail, color: "#EA4335", title: "E-mail", sub: "Gmail, Outlook ou e-mail próprio", go: "connections" }
  ];
  const typeLabel = (c) => (c.platform === "whatsapp" ? (c.provider === "cloud" ? "Cloud API" : "WhatsApp QR") : PLATFORM_LABELS[c.platform]);
  const when = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  const disconnect = async (c) => {
    if (!await askConfirm(`Desconectar o WhatsApp do canal "${c.name}"? Para voltar será preciso ler o QR Code de novo.`, { okText: "Desconectar", danger: true })) return;
    await logoutWhatsAppApi(c.id).catch(() => {}); load();
  };
  const restart = async (c) => { await resetWhatsAppApi(c.id).catch(() => {}); load(); };

  return (
    <div className="page ch2">
      <div className="ch2-head">
        <h2>Canais</h2>
        <span className="ch2-count">{channels.filter(isOn).length}/{channels.length}</span>
        <span className="ch2-sp" />
        <label className="ch2-hide"><input type="checkbox" checked={hideOff} onChange={(e) => { setHideOff(e.target.checked); try { localStorage.setItem("helora_ch_hide", e.target.checked ? "1" : "0"); } catch {} }} /> Ocultar desconectados</label>
        <div className="ch2-add-wrap">
          <button className="ch2-add" onClick={() => setMenu((v) => !v)}><Plus size={16} /> Adicionar canal <ChevronDown size={15} /></button>
          {menu && (
            <div className="ch2-menu" onMouseLeave={() => setMenu(false)}>
              <div className="ch2-menu-t">Adicionar novo canal</div>
              {ADD.map((o) => (
                <button key={o.k} onClick={() => { setMenu(false); if (o.go) { window.history.replaceState(null, "", `${window.location.pathname}?aba=${o.go}`); window.location.reload(); } else setShowNew(o.preset); }}>
                  <span className="ch2-mi" style={{ background: o.color }}><o.icon size={18} /></span>
                  <span><strong>{o.title}</strong><small>{o.sub}</small></span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ch2-grid">
        {shown.map((c) => {
          const on = isOn(c);
          const wa = c.platform === "whatsapp";
          const Ico = c.platform === "instagram" ? Instagram : c.platform === "messenger" ? Facebook : wa ? MessageCircle : Smartphone;
          return (
            <div className={`ch2-card ${on ? "on" : wa && c.status === "connecting" ? "wait" : "off"}`} key={c.id}>
              <div className="ch2-top">
                <span className={`ch2-ico ${c.platform}`}><Ico size={18} /></span>
                <div className="ch2-id">
                  <strong title={c.name}>{c.name || PLATFORM_LABELS[c.platform]}</strong>
                  <small>{typeLabel(c)}{c.phone ? ` · +${c.phone}` : ""}</small>
                </div>
                <button className="ch2-edit" title="Editar setor e fluxo" onClick={() => setEditChannel(c)}><Pencil size={15} /></button>
              </div>
              <div className="ch2-status">
                {wa ? (on ? <><Wifi size={15} className="ok" /> Conexão estabelecida</> : c.status === "connecting" ? <><QrCode size={15} className="wait" /> Aguardando leitura do QR Code</> : <><WifiOff size={15} className="bad" /> Desconectado</>)
                  : on ? <><Wifi size={15} className="ok" /> Ativo</> : <><WifiOff size={15} className="bad" /> Falta configurar</>}
                {c.updatedAt && <span className="ch2-when"><Clock size={12} /> {when(c.updatedAt)}</span>}
              </div>
              <div className="ch2-info">
                <span><Users size={13} /> {c.departmentName || "Sem setor"}</span>
                <span><Workflow size={13} /> {flows.find((f) => f.id === c.flowId)?.name || "Fluxo ativo da empresa"}</span>
              </div>
              <div className="ch2-actions">
                {wa && c.provider !== "cloud" && (on
                  ? <button className="ch2-btn danger" onClick={() => disconnect(c)}><Power size={14} /> Desconectar</button>
                  : <button className="ch2-btn ok" onClick={() => setQrChannel(c)}><QrCode size={14} /> Conectar</button>)}
                {wa && c.provider !== "cloud" && <button className="ch2-icon" title="Reiniciar conexão" onClick={() => restart(c)}><RotateCw size={15} /></button>}
                <button className="ch2-btn ghost" onClick={() => setPermChannel(c)}>Permissões</button>
                <span className="ch2-sp" />
                <button className="ch2-icon del" title="Remover canal" onClick={() => handleDelete(c.id)}><Trash2 size={15} /></button>
              </div>
            </div>
          );
        })}
        {channels.length === 0 && <div className="ch2-empty">Nenhum canal ainda. Clique em <b>Adicionar canal</b>.</div>}
      </div>

      {showNew && (
        <NewChannelModal departments={departments} flows={flows} preset={typeof showNew === "object" ? showNew : null} onClose={() => setShowNew(false)} onCreate={handleCreate} />
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
