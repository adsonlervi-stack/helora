import { askConfirm } from "../dialogs.js";
import React, { useEffect, useState } from "react";
import { Plus, Trash2, Smartphone, QrCode, Pencil, Workflow, ChevronDown, ChevronRight, Wifi, WifiOff, RotateCw, Power, Users, Clock, Instagram, Facebook, Mail, MessageCircle , History } from "lucide-react";
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
  historyImportApi,
  historyStatusApi,
  API_BASE
} from "../api.js";
import WhatsAppConnectModal from "./WhatsAppConnectModal.jsx";
import WaTemplatesSheet from "./WaTemplates.jsx";
import { meta as metaApi, instagramApi } from "../api.js";
import { notify } from "../dialogs.js";
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

// Cadastro incorporado da Meta: abre um popup no domínio fixo do Helora (funciona em qualquer domínio de cliente)
async function waEmbeddedSignup() {
  const w = window.open("about:blank", "helora-wa", "width=620,height=760");
  let url;
  try { url = await metaApi.waSignupUrl(); } catch (e) { w?.close(); throw e; }
  if (!w) { window.location.href = url; return new Promise(() => {}); }
  w.location.href = url;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      if (ev.data?.type !== "helora-wa") return;
      if (ev.data.ok) { cleanup(); resolve(ev.data); }
    };
    const t = setInterval(() => { if (w.closed) { cleanup(); resolve({ closed: true }); } }, 700);
    const cleanup = () => { clearInterval(t); window.removeEventListener("message", onMsg); };
    window.addEventListener("message", onMsg);
  });
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
  const [metaOpen, setMetaOpen] = useState(() => new URLSearchParams(window.location.search).get("meta") || null);
  const [metaOn, setMetaOn] = useState(false);
  const [metaCfg, setMetaCfg] = useState({});
  useEffect(() => { metaApi.status().then((s) => { setMetaOn(!!s.configured); setMetaCfg(s || {}); }); }, []);
  const connectWa = async () => {
    try {
      const r = await waEmbeddedSignup();
      if (r?.ok) notify("WhatsApp conectado pela API oficial!", "success");
      load();
    } catch (e) { if (e?.message !== "cancel") notify(e?.response?.data?.error || e.message, "error"); }
  };
  const [igOn, setIgOn] = useState(false);
  useEffect(() => {
    instagramApi.status().then((s) => setIgOn(!!s.configured));
    const q = new URLSearchParams(window.location.search);
    if (q.get("ig")) {
      if (q.get("ig") === "ok") notify("Instagram conectado! As mensagens do Direct já chegam em Conversas.", "success");
      else notify(q.get("msg") || "Não foi possível conectar o Instagram.", "error");
      q.delete("ig"); q.delete("msg"); window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
    }
  }, []);
  const connectIg = async () => { try { window.location.href = await instagramApi.authUrl(); } catch (e) { notify(e?.response?.data?.error || e.message, "error"); } };
  const [qrChannel, setQrChannel] = useState(null);
  const [permChannel, setPermChannel] = useState(null);
  const [editChannel, setEditChannel] = useState(null);
  const [tplChannel, setTplChannel] = useState(null);
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
    { k: "ig", icon: Instagram, color: "#C13584", title: "Instagram Direct", sub: "Entre com a conta Profissional do Instagram", preset: { platform: "instagram" } },
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
  const importHistory = async (c) => {
    const ok = await askConfirm(`Importar as conversas dos últimos 90 dias de "${c.name}"?\n\nO WhatsApp só envia o histórico na hora de conectar, então o número vai ser desconectado e aparece um QR Code novo. Leia o QR com o mesmo celular. As mensagens antigas entram sem notificar ninguém e sem acionar o bot ou a IA. Fotos e áudios antigos aparecem só como aviso.`);
    if (!ok) return;
    try { await historyImportApi(c.id, { days: 90, reconnect: true }); setQrChannel(c); load(); } catch (e) { alert(e?.response?.data?.error || e.message); }
  };

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
                <button key={o.k} onClick={() => { setMenu(false); if (o.go) { window.history.replaceState(null, "", `${window.location.pathname}?aba=${o.go}`); window.location.reload(); } else if (o.k === "cloud" && metaCfg.waConfigId) connectWa(); else if (o.k === "ig" && igOn) connectIg(); else if ((o.k === "ig" || o.k === "fb") && metaOn) setMetaOpen("start"); else setShowNew(o.preset); }}>
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
                {wa && c.provider !== "cloud" && <HistoryButton channel={c} onImport={() => importHistory(c)} />}
                {wa && c.provider === "cloud" && <button className="ch2-btn ghost" onClick={() => setTplChannel(c)}>Templates</button>}
                <button className="ch2-btn ghost" onClick={() => setPermChannel(c)}>Permissões</button>
                <span className="ch2-sp" />
                <button className="ch2-icon del" title="Remover canal" onClick={() => handleDelete(c.id)}><Trash2 size={15} /></button>
              </div>
            </div>
          );
        })}
        {channels.length === 0 && <div className="ch2-empty">Nenhum canal ainda. Clique em <b>Adicionar canal</b>.</div>}
      </div>

      {metaOpen && <MetaConnect state={metaOpen} onManual={(platform) => { setMetaOpen(null); setShowNew({ platform }); }} onClose={() => { setMetaOpen(null); const q = new URLSearchParams(window.location.search); q.delete("meta"); q.delete("msg"); window.history.replaceState(null, "", `${window.location.pathname}?${q}`); }} onDone={() => load()} />}
      {tplChannel && <WaTemplatesSheet channel={tplChannel} onClose={() => setTplChannel(null)} />}
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

/** Botão "Importar histórico" com o andamento da importação. */
function HistoryButton({ channel, onImport }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = () => historyStatusApi(channel.id).then((r) => alive && setSt(r)).catch(() => {});
    tick();
    const t = setInterval(tick, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [channel.id]);
  const label = !st ? "Importar histórico" :
    st.status === "pending" ? "Aguardando leitura do QR" :
    st.status === "running" ? `Importando… ${st.imported || 0} msgs` :
    st.status === "done" ? `Histórico: ${st.imported || 0} msgs` : "Importar histórico";
  return <button className="ch2-btn ghost" title="Trazer as conversas dos últimos 90 dias" onClick={onImport}><History size={14} /> {label}</button>;
}

/** Conectar Messenger e Instagram entrando com o Facebook, sem colar token. */
function MetaConnect({ state, onClose, onManual, onDone }) {
  const [pages, setPages] = useState(null);
  const [busy, setBusy] = useState(null);
  const errMsg = state === "erro" ? new URLSearchParams(window.location.search).get("msg") : null;
  const load = () => metaApi.pages().then(setPages).catch(() => setPages([]));
  useEffect(() => { if (state === "ok") load(); else setPages([]); }, [state]);
  const go = async () => { try { window.location.href = await metaApi.authUrl(); } catch (e) { alert(e?.response?.data?.error || e.message); } };
  const connect = async (p) => {
    setBusy(p.id);
    try { await metaApi.connect({ id: p.id, platform: p.platform }); await load(); onDone(); }
    catch (e) { alert(e?.response?.data?.error || e.message); }
    setBusy(null);
  };
  return (
    <Sheet title="Facebook e Instagram" subtitle="Entre com o Facebook e escolha a Página ou o Instagram que vai atender pelo Helora." onClose={onClose} width={560}
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}>
      {errMsg && <div className="admin-feedback error" style={{ marginBottom: 12 }}>{errMsg}</div>}
      {pages && pages.length > 0 ? (
        <Group title="Escolha o que conectar">
          {pages.map((p) => (
            <Row key={p.platform + p.id} label={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{p.platform === "instagram" ? <Instagram size={16} color="#C13584" /> : <Facebook size={16} color="#1877F2" />}{p.name}</span>}>
              {p.connected ? <span style={{ color: "#34c759", fontWeight: 600, fontSize: 14 }}>Conectado</span>
                : <Button disabled={busy === p.id} onClick={() => connect(p)}>{busy === p.id ? "Conectando…" : "Conectar"}</Button>}
            </Row>
          ))}
        </Group>
      ) : (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <button className="meta-btn" onClick={go}><Facebook size={18} /> Continuar com o Facebook</button>
          <p style={{ color: "#6e6e73", fontSize: 13, marginTop: 14 }}>Você precisa ser administrador da Página. Para o Instagram, a conta tem que ser Profissional e estar ligada à Página.</p>
        </div>
      )}
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <button className="lp-link sm" onClick={() => onManual("messenger")}>Prefiro configurar com token (avançado)</button>
      </div>
    </Sheet>
  );
}
