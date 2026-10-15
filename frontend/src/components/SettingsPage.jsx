import React, { useEffect, useState } from "react";
import {
  Trash2,
  ArrowLeft,
  MessageSquareText,
  MessagesSquare,
  Tag,
  Building2,
  Users,
  Clock3,
  Smartphone,
  Pencil,
  KeyRound,
  Copy
, Bell } from "lucide-react";
import ScheduledMessagesTab from "./ScheduledMessagesTab.jsx";
import {
  getAutoReplies,
  createAutoReply,
  removeAutoReply,
  getCannedResponses,
  createCannedResponseApi,
  removeCannedResponse,
  getLabels,
  createLabelApi,
  removeLabel,
  getDepartments,
  createDepartmentApi,
  removeDepartment,
  getTeam,
  setProfileDepartmentsApi,
  createTeamMemberApi,
  updateTeamMemberApi,
  setTeamMemberPasswordApi,
  removeTeamMemberApi,
  getChannels,
  getGroups,
  getMemberPermissions,
  getApiKeys,
  createApiKeyApi,
  revokeApiKeyApi,
  API_BASE,
  getAccountSettingsApi,
  updateAccountSettingsApi
} from "../api.js";
import BusinessHoursEditor from "./BusinessHoursEditor.jsx";
import { SOUNDS, NOTIFY_EVENTS, getNotifyPrefs, setNotifyPrefs, playSound, enableNotify, notifyEnabled } from "../notifications.js";

const CARDS = [
  {
    key: "attendance",
    label: "Atendimento",
    desc: "Horário de atendimento e pesquisa de satisfação",
    icon: Clock3,
    ownerOnly: true
  },
  {
    key: "notify",
    label: "Notificações e sons",
    desc: "O que avisa e qual som toca para cada tipo",
    icon: Bell
  },
  {
    key: "auto",
    label: "Respostas automáticas",
    desc: "Palavra-chave → resposta pronta do bot",
    icon: MessageSquareText
  },
  {
    key: "canned",
    label: "Respostas prontas",
    desc: "Atalhos de texto pro atendente usar no chat",
    icon: MessagesSquare
  },
  { key: "labels", label: "Etiquetas", desc: "Categorize as conversas por cor", icon: Tag },
  { key: "departments", label: "Setores", desc: "Times/filas de atendimento", icon: Building2 },
  {
    key: "team",
    label: "Equipe & Permissões",
    desc: "Quem faz parte de cada setor",
    icon: Users
  },
  {
    key: "scheduled",
    label: "Mensagens agendadas",
    desc: "Programe um envio pra data/hora futura",
    icon: Clock3
  },
  {
    key: "devices",
    label: "Dispositivos",
    desc: "WhatsApp, Messenger e Instagram conectados",
    icon: Smartphone,
    external: true
  },
  { key: "api", label: "API e integrações", desc: "Chave para site, landing page e sistemas", icon: KeyRound, ownerOnly: true }
];

export default function SettingsPage({ onGoToChannels, canManage = false }) {
  const [tab, setTab] = useState(null);

  if (tab === null) {
    return (
      <div className="page">
        <div className="settings-grid">
          {CARDS.filter((c) => !c.ownerOnly || canManage).map(({ key, label, desc, icon: Icon, external }) => (
            <button
              key={key}
              className="settings-card"
              onClick={() => (external ? onGoToChannels?.() : setTab(key))}
            >
              <div className="settings-card-icon">
                <Icon size={20} />
              </div>
              <div className="settings-card-label">{label}</div>
              <div className="settings-card-desc">{desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const current = CARDS.find((c) => c.key === tab);

  return (
    <div className="page">
      <button className="settings-back-btn" onClick={() => setTab(null)}>
        <ArrowLeft size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
        Configurações
      </button>
      <div className="card-title" style={{ marginBottom: 16 }}>
        {current?.label}
      </div>

      {tab === "auto" && <AutoRepliesTab />}
      {tab === "canned" && <CannedResponsesTab canManage={canManage} />}
      {tab === "attendance" && canManage && <AttendanceTab />}
      {tab === "notify" && <NotifyTab />}
      {tab === "labels" && <LabelsTab />}
      {tab === "departments" && <DepartmentsTab />}
      {tab === "team" && <TeamTab canManage={canManage} />}
      {tab === "scheduled" && <ScheduledMessagesTab />}
      {tab === "api" && canManage && <ApiTab />}
    </div>
  );
}

function AutoRepliesTab() {
  const [replies, setReplies] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [response, setResponse] = useState("");

  const load = () => getAutoReplies().then(setReplies).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!keyword.trim() || !response.trim()) return;
    await createAutoReply(keyword.trim(), response.trim());
    setKeyword("");
    setResponse("");
    load();
  };

  const handleDelete = async (id) => {
    await removeAutoReply(id);
    load();
  };

  return (
    <div className="card">
      <div className="card-title">Respostas automáticas por palavra-chave</div>
      <div className="card-subtitle">
        Quando a mensagem do cliente contiver a palavra-chave, o <strong>bot</strong> responde
        sozinho (fora do fluxo de menu 1/2/3).
      </div>

      <form className="reply-form" onSubmit={handleAdd}>
        <input
          className="keyword"
          placeholder="palavra-chave"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <input
          className="response"
          placeholder="Resposta que o bot deve enviar..."
          value={response}
          onChange={(e) => setResponse(e.target.value)}
        />
        <button type="submit">Adicionar</button>
      </form>

      <div>
        {replies.map((r) => (
          <div className="reply-item" key={r.id}>
            <span className="reply-keyword">{r.keyword}</span>
            <span className="reply-response">{r.response}</span>
            <button className="reply-delete" onClick={() => handleDelete(r.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {replies.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
            Nenhuma resposta automática cadastrada ainda.
          </div>
        )}
      </div>
    </div>
  );
}

function NotifyTab() {
  const [prefs, setPrefs] = useState(getNotifyPrefs);
  const [desk, setDesk] = useState(notifyEnabled());
  const update = (k, patch) => {
    const next = { ...prefs, [k]: { ...prefs[k], ...patch } };
    setPrefs(next);
    setNotifyPrefs(next);
  };
  return (
    <div className="card">
      <div className="card-title">Notificações e sons</div>
      <div className="card-subtitle">Escolha o que deve te avisar e o som de cada aviso. Vale para este navegador/celular.</div>
      {!desk && (
        <button className="pill-btn primary" style={{ marginBottom: 12 }} onClick={async () => setDesk(await enableNotify())}>
          <Bell size={14} /> Ativar avisos na tela (mesmo com o painel minimizado)
        </button>
      )}
      <div className="notify-list">
        {Object.entries(NOTIFY_EVENTS).map(([k, ev]) => (
          <div key={k} className="notify-row">
            <label className="bh-switch">
              <input type="checkbox" checked={prefs[k].on} onChange={(e) => update(k, { on: e.target.checked })} />
              <span>{ev.label}</span>
            </label>
            <div className="notify-sound">
              <select className="deal-stage-select" value={prefs[k].sound} disabled={!prefs[k].on} onChange={(e) => { update(k, { sound: e.target.value }); playSound(e.target.value); }}>
                {Object.entries(SOUNDS).map(([sk, sv]) => <option key={sk} value={sk}>{sv.label}</option>)}
              </select>
              <button className="pill-btn" disabled={!prefs[k].on} onClick={() => playSound(prefs[k].sound)} title="Ouvir">▶</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttendanceTab() {
  const [st, setSt] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    getAccountSettingsApi().then(setSt).catch((e) => setMsg({ ok: false, text: e.response?.data?.error || e.message }));
  }, []);
  const save = async (patch) => {
    try {
      setSt(await updateAccountSettingsApi(patch));
      setMsg({ ok: true, text: "Salvo." });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || e.message });
    }
  };
  if (!st) return msg ? <div className="admin-feedback error">{msg.text}</div> : <div className="cv-muted">Carregando…</div>;
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Pesquisa de satisfação</div>
        <div className="card-subtitle">Ao encerrar um atendimento, o cliente recebe "de 1 a 5, como você avalia esse atendimento?".</div>
        <label className="bh-switch">
          <input type="checkbox" checked={st.csatEnabled} onChange={(e) => save({ csatEnabled: e.target.checked })} />
          <span>{st.csatEnabled ? "Ativada" : "Desativada"}</span>
        </label>
      </div>
      <div className="card">
        <div className="card-title">Horário de atendimento da empresa</div>
        <div className="card-subtitle">
          Fora do horário, quem mandar mensagem recebe o aviso automático (uma vez a cada 6h) e o bot não segue o fluxo.
          Um fluxo pode ter horário próprio (aba Fluxos), que vale no lugar deste.
        </div>
        <BusinessHoursEditor value={st.businessHours} onChange={(bh) => setSt({ ...st, businessHours: bh })} />
        <button className="connect-btn" style={{ marginTop: 12 }} onClick={() => save({ businessHours: st.businessHours })}>Salvar horário</button>
      </div>
      {msg && <div className={`admin-feedback ${msg.ok ? "success" : "error"}`} style={{ marginTop: 10 }}>{msg.text}</div>}
    </>
  );
}

function CannedResponsesTab({ canManage }) {
  const [items, setItems] = useState([]);
  const [personal, setPersonal] = useState(!canManage);
  const [err, setErr] = useState(null);
  const [shortCode, setShortCode] = useState("");
  const [content, setContent] = useState("");

  const load = () => getCannedResponses().then(setItems).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!shortCode.trim() || !content.trim()) return;
    try {
      await createCannedResponseApi(shortCode.trim().replace(/^\//, ""), content.trim(), personal);
      setErr(null);
    } catch (e2) {
      return setErr(e2.response?.data?.error || e2.message);
    }
    setShortCode("");
    setContent("");
    load();
  };

  const handleDelete = async (id) => {
    try {
      await removeCannedResponse(id);
    } catch (e2) {
      setErr(e2.response?.data?.error || e2.message);
    }
    load();
  };

  return (
    <div className="card">
      <div className="card-title">Respostas prontas do atendente</div>
      <div className="card-subtitle">
        Atalhos que o <strong>atendente</strong> escolhe manualmente ao digitar no chat — é só
        digitar <code>/</code> seguido do atalho e escolher na lista.
      </div>

      <form className="reply-form" onSubmit={handleAdd}>
        <input
          className="keyword"
          placeholder="atalho (ex: horario)"
          value={shortCode}
          onChange={(e) => setShortCode(e.target.value)}
        />
        <input
          className="response"
          placeholder="Texto completo da resposta..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button type="submit">Adicionar</button>
      </form>
      {canManage ? (
        <label className="bh-switch" style={{ margin: "4px 0 10px" }}>
          <input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} />
          <span>Só para mim (desmarcado = toda a equipe vê)</span>
        </label>
      ) : (
        <p className="cv-muted" style={{ margin: "4px 0 10px" }}>As respostas que você cria aqui são só suas.</p>
      )}
      {err && <div className="admin-feedback error">{err}</div>}

      <div>
        {items.map((r) => (
          <div className="reply-item" key={r.id}>
            <span className="reply-keyword">/{r.shortCode}</span>
            <span className={`canned-scope ${r.personal ? "me" : ""}`}>{r.personal ? "Só minha" : "Empresa"}</span>
            <span className="reply-response">{r.content}</span>
            <button className="reply-delete" onClick={() => handleDelete(r.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
            Nenhuma resposta pronta cadastrada ainda.
          </div>
        )}
      </div>
    </div>
  );
}

const PRESET_COLORS = ["#2b82ea", "#1f9d6b", "#dd8a1f", "#d94f4f", "#6e7a7a", "#6228d7"];

function LabelsTab() {
  const [labels, setLabels] = useState([]);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const load = () => getLabels().then(setLabels).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createLabelApi(title.trim(), color);
    setTitle("");
    load();
  };

  const handleDelete = async (id) => {
    await removeLabel(id);
    load();
  };

  return (
    <div className="card">
      <div className="card-title">Etiquetas</div>
      <div className="card-subtitle">
        Organize as conversas por assunto, urgência ou qualquer critério — aparecem na lista de
        conversas e podem ser usadas como filtro.
      </div>

      <form className="reply-form" onSubmit={handleAdd}>
        <input
          className="response"
          placeholder="Nome da etiqueta..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="label-color-row">
          {PRESET_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`label-color-dot ${color === c ? "selected" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <button type="submit">Adicionar</button>
      </form>

      <div>
        {labels.map((l) => (
          <div className="reply-item" key={l.id}>
            <span className="label-chip" style={{ "--chip-color": l.color }}>
              {l.title}
            </span>
            <span className="reply-response" />
            <button className="reply-delete" onClick={() => handleDelete(l.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {labels.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
            Nenhuma etiqueta cadastrada ainda.
          </div>
        )}
      </div>
    </div>
  );
}

function DepartmentsTab() {
  const [departments, setDepartments] = useState([]);
  const [name, setName] = useState("");

  const load = () => getDepartments().then(setDepartments).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createDepartmentApi(name.trim());
    setName("");
    load();
  };

  const handleDelete = async (id) => {
    await removeDepartment(id);
    load();
  };

  return (
    <div className="card">
      <div className="card-title">Setores</div>
      <div className="card-subtitle">
        Divisões internas (Comercial, Suporte, Financeiro...). Atendentes só veem os tickets do
        próprio setor, ou os atribuídos diretamente a eles.
      </div>

      <form className="reply-form" onSubmit={handleAdd}>
        <input
          className="response"
          placeholder="Nome do setor..."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit">Adicionar</button>
      </form>

      <div>
        {departments.map((d) => (
          <div className="reply-item" key={d.id}>
            <span className="reply-response">{d.name}</span>
            <button className="reply-delete" onClick={() => handleDelete(d.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {departments.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
            Nenhum setor cadastrado ainda.
          </div>
        )}
      </div>
    </div>
  );
}

const ROLE_LABEL = { owner: "Gestor", agent: "Atendente" };

/** Escolha de canais, setores e grupos que o usuário vê. */
function usePermissionOptions() {
  const [opts, setOpts] = useState({ channels: [], departments: [], groups: [] });
  useEffect(() => {
    Promise.all([getChannels().catch(() => []), getDepartments().catch(() => []), getGroups().catch(() => [])]).then(([channels, departments, groups]) =>
      setOpts({ channels, departments, groups })
    );
  }, []);
  return opts;
}

function PermissionPicker({ value, onChange, opts, role }) {
  const toggle = (key, id) => {
    const cur = value[key] || [];
    onChange({ ...value, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  const Block = ({ title, hint, items, k, label }) => (
    <div className="perm-block">
      <div className="perm-title">{title}</div>
      <div className="perm-hint">{hint}</div>
      <div className="cv-chip-row">
        {items.map((it) => (
          <button type="button" key={it.id} className={`cv-chip ${(value[k] || []).includes(it.id) ? "active" : ""}`} onClick={() => toggle(k, it.id)}>
            {label(it)}
          </button>
        ))}
        {!items.length && <span className="cv-muted">Nenhum cadastrado ainda.</span>}
      </div>
    </div>
  );
  if (role === "owner") {
    return <div className="perm-owner">Gestor vê todos os canais, setores e grupos da empresa e pode criar canais e usuários.</div>;
  }
  return (
    <div className="perm-picker">
      <Block title="Canais" hint="Nenhum marcado = vê todos os canais" items={opts.channels} k="channelIds" label={(c) => c.name || c.platform} />
      <Block title="Setores" hint="Vê os atendimentos destes setores (e os atribuídos a ele)" items={opts.departments} k="departmentIds" label={(d) => d.name} />
      <Block title="Grupos de WhatsApp" hint="Só vê os grupos marcados" items={opts.groups} k="groupIds" label={(g) => g.name || "Grupo"} />
    </div>
  );
}

function NewMemberForm({ onCreated }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "agent" });
  const [perms, setPerms] = useState({ channelIds: [], departmentIds: [], groupIds: [] });
  const opts = usePermissionOptions();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await createTeamMemberApi({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password || undefined,
        role: form.role,
        ...(form.role === "agent" ? perms : {})
      });
      setPerms({ channelIds: [], departmentIds: [], groupIds: [] });
      setMsg({
        type: "success",
        text: r.invited
          ? `Convite enviado para ${form.email}.`
          : `${form.name} criado. Já pode entrar com ${form.email} e a senha definida.`
      });
      setForm({ name: "", email: "", password: "", role: "agent" });
      onCreated();
    } catch (err) {
      setMsg({ type: "error", text: err.response?.data?.error || err.message });
    }
    setBusy(false);
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">Novo usuário</div>
      <div className="card-subtitle">
        Com senha, a pessoa já entra direto. Sem senha, recebe um convite por e-mail para criar a dela.
      </div>
      <form className="admin-create-grid" onSubmit={submit}>
        <input className="response" placeholder="Nome *" value={form.name} onChange={set("name")} />
        <input className="response" type="email" placeholder="E-mail de login *" value={form.email} onChange={set("email")} />
        <input className="response" type="password" placeholder="Senha (mín. 6)" value={form.password} onChange={set("password")} autoComplete="new-password" />
        <select className="deal-stage-select" value={form.role} onChange={set("role")}>
          <option value="agent">Atendente</option>
          <option value="owner">Gestor</option>
        </select>
        <button type="submit" className="connect-btn" disabled={busy || !form.name.trim() || !form.email.trim()}>
          {busy ? "Criando..." : "Criar usuário"}
        </button>
      </form>
      <PermissionPicker value={perms} onChange={setPerms} opts={opts} role={form.role} />
      {msg && <div className={`admin-feedback ${msg.type}`}>{msg.text}</div>}
    </div>
  );
}

function MemberEditor({ member, onClose, onSaved }) {
  const [name, setName] = useState(member.name || "");
  const [role, setRole] = useState(member.role);
  const [perms, setPerms] = useState({ channelIds: [], departmentIds: [], groupIds: [] });
  const opts = usePermissionOptions();
  useEffect(() => {
    getMemberPermissions(member.id).then(setPerms).catch(() => {});
  }, [member.id]);
  const [password, setPassword] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const run = async (fn, okText, close) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      onSaved();
      if (close) return onClose();
      setMsg({ type: "success", text: okText });
    } catch (err) {
      setMsg({ type: "error", text: err.response?.data?.error || err.message });
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card deal-modal team-editor" onClick={(e) => e.stopPropagation()}>
        <h3>Editar usuário</h3>
        {member.email && <p style={{ marginTop: -6 }}>Login: {member.email}</p>}

        <label className="login-field">
          <span>Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="login-field">
          <span>Papel</span>
          <select className="deal-stage-select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="agent">Atendente (vê só os setores dele)</option>
            <option value="owner">Gestor (vê tudo e administra a empresa)</option>
          </select>
        </label>
        <PermissionPicker value={perms} onChange={setPerms} opts={opts} role={role} />
        <button
          className="connect-btn"
          disabled={busy || !name.trim()}
          onClick={() => run(() => updateTeamMemberApi(member.id, { name, role, ...(role === "agent" ? perms : {}) }), "Dados salvos.")}
        >
          Salvar
        </button>

        <div className="team-editor-section">
          <label className="login-field">
            <span>Nova senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 6 caracteres" autoComplete="new-password" />
          </label>
          <button
            className="resolve-btn"
            disabled={busy || password.length < 6}
            onClick={() =>
              run(() => setTeamMemberPasswordApi(member.id, password), "Senha alterada.").then(() => setPassword(""))
            }
          >
            Definir nova senha
          </button>
        </div>

        <div className="team-editor-section">
          {!confirmRemove ? (
            <button className="reply-delete team-remove-btn" disabled={busy} onClick={() => setConfirmRemove(true)}>
              <Trash2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Remover usuário
            </button>
          ) : (
            <div className="wa-confirm">
              <span>Remover {member.name}? Ele perde o acesso; as conversas continuam na empresa.</span>
              <button className="connect-btn wa-danger" disabled={busy} onClick={() => run(() => removeTeamMemberApi(member.id), "", true)}>
                Sim, remover
              </button>
              <button className="resolve-btn" onClick={() => setConfirmRemove(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>

        {msg && msg.text && <div className={`admin-feedback ${msg.type}`}>{msg.text}</div>}

        <button className="modal-close" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function TeamTab({ canManage }) {
  const [team, setTeam] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => {
    getTeam().then(setTeam).catch(console.error);
    getDepartments().then(setDepartments).catch(console.error);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleDept = async (member, deptId) => {
    const current = member.departments.map((d) => d.id);
    const next = current.includes(deptId) ? current.filter((id) => id !== deptId) : [...current, deptId];
    await setProfileDepartmentsApi(member.id, next);
    load();
  };

  return (
    <>
      {canManage && <NewMemberForm onCreated={load} />}

      <div className="card">
        <div className="card-title">Equipe ({team.length})</div>
        <div className="card-subtitle">
          Escolha os setores de cada atendente. Quem é <strong>Gestor</strong> vê tudo e pode criar e
          editar usuários.
        </div>

        <div>
          {team.map((member) => (
            <div className="team-member-row" key={member.id}>
              <div className="team-member-info">
                <span className="team-member-name">{member.name || "Sem nome"}</span>
                <span className={`team-role-badge ${member.role}`}>
                  {member.isSuperAdmin ? "Admin do sistema" : ROLE_LABEL[member.role]}
                </span>
                {member.email && <span className="team-member-email">{member.email}</span>}
              </div>
              {member.role === "agent" ? (
                <div className="team-dept-chips">
                  {departments.map((d) => {
                    const active = member.departments.some((md) => md.id === d.id);
                    return (
                      <button
                        key={d.id}
                        className={`filter-tab ${active ? "active" : ""}`}
                        onClick={() => canManage && toggleDept(member, d.id)}
                        disabled={!canManage}
                      >
                        {d.name}
                      </button>
                    );
                  })}
                  {departments.length === 0 && (
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      Crie um setor primeiro na aba Setores.
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Acesso total à empresa</span>
              )}
              {canManage && !member.isSuperAdmin && (
                <button className="resolve-btn team-edit-btn" onClick={() => setEditing(member)}>
                  <Pencil size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
                  Editar
                </button>
              )}
            </div>
          ))}
          {team.length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
              Nenhum usuário cadastrado ainda.
            </div>
          )}
        </div>
      </div>

      {editing && <MemberEditor member={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  );
}


function ApiTab() {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);
  const [channels, setChannels] = useState([]);
  useEffect(() => {
    getChannels().then((l) => setChannels(l.filter((c) => c.platform === "whatsapp"))).catch(() => {});
  }, []);
  const base = API_BASE.replace(/\/$/, "") + "/public/v1";

  const load = () => getApiKeys().then(setKeys).catch((e) => setError(e.response?.data?.error || e.message));
  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      setCreated(await createApiKeyApi(name.trim() || "Site"));
      setName("");
      load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const copy = (t) => navigator.clipboard?.writeText(t);
  const key = created?.key || "SUA_CHAVE";
  const exLead = `curl -X POST ${base}/leads \\
  -H "X-API-Key: ${key}" -H "Content-Type: application/json" \\
  -d '{"name":"Maria Souza","phone":"5584999998888","email":"maria@email.com","title":"Seguro auto","value":1500,"source":"site","message":"Olá Maria! Recebemos seu pedido 😊"}'`;
  const exMsg = `curl -X POST ${base}/messages \\
  -H "X-API-Key: ${key}" -H "Content-Type: application/json" \\
  -d '{"phone":"5584999998888","text":"Sua apólice foi emitida!"}'`;
  const exCamp = `curl -X POST ${base}/campaigns \\
  -H "X-API-Key: ${key}" -H "Content-Type: application/json" \\
  -d '{"name":"Black Friday","message":"Olá {nome}! ...","recipients":[{"phone":"5584999998888","name":"Maria"}]}'`;
  const exForm = `<form id="lead">
  <input name="name" placeholder="Nome" required>
  <input name="phone" placeholder="WhatsApp com DDD" required>
  <button>Quero uma cotação</button>
</form>
<script>
document.getElementById("lead").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await fetch("${base}/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": "${key}" },
    body: JSON.stringify({ name: f.get("name"), phone: "55" + f.get("phone").replace(/\\D/g, ""), source: "landing page" })
  });
  alert("Recebemos! Em instantes falamos com você no WhatsApp.");
};
</script>`;

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Chaves de API</div>
        <div className="card-subtitle">
          Use em sites, landing pages e sistemas para: criar leads no pipeline, enviar mensagem e disparar campanha.
          Mensagens enviadas pela API usam 1 crédito cada.
        </div>
        <form className="admin-create-grid" onSubmit={create}>
          <input className="response" placeholder="Nome da chave (ex: Site, Landing page)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="connect-btn">Gerar nova chave</button>
        </form>
        {created && (
          <div className="api-key-new">
            <strong>Copie agora — ela não aparece de novo:</strong>
            <code>{created.key}</code>
            <button className="pill-btn" onClick={() => copy(created.key)}><Copy size={14} /> Copiar</button>
          </div>
        )}
        {error && <div className="admin-feedback error">{error}</div>}
        {keys.map((k) => (
          <div key={k.id} className="reply-item">
            <span className="reply-response">
              <strong>{k.name}</strong>
              <span className="gestao-muted"> · {k.prefix}… · criada {new Date(k.createdAt).toLocaleDateString("pt-BR")}{k.lastUsedAt ? ` · último uso ${new Date(k.lastUsedAt).toLocaleString("pt-BR")}` : " · nunca usada"}</span>
            </span>
            {k.revoked ? <span className="invoice-badge canceled">Revogada</span> : (
              <button className="resolve-btn" onClick={async () => { await revokeApiKeyApi(k.id); load(); }}>Revogar</button>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">Como usar</div>
        <div className="card-subtitle">Endereço base: <code>{base}</code> · cabeçalho <code>X-API-Key</code></div>
        {[["Criar lead no pipeline (e mandar boas-vindas no WhatsApp)", exLead], ["Enviar mensagem", exMsg], ["Disparar campanha", exCamp], ["Formulário de landing page (HTML)", exForm]].map(([t, code]) => (
          <div key={t} className="api-example">
            <div className="api-example-head"><strong>{t}</strong><button className="pill-btn" onClick={() => copy(code)}><Copy size={13} /> Copiar</button></div>
            <pre>{code}</pre>
          </div>
        ))}
        <div className="fe-field-label" style={{ marginTop: 12 }}>Escolher o número que envia (channelId)</div>
        <p className="cv-muted" style={{ marginTop: 0 }}>
          Com mais de um WhatsApp, mande <code>"channelId"</code> em /messages, /leads e /campaigns. Sem ele, usa o primeiro número.
        </p>
        {channels.map((c) => (
          <div key={c.id} className="reply-item">
            <span className="reply-response"><strong>{c.name || "WhatsApp"}</strong>{c.phone ? ` · +${c.phone}` : ""}</span>
            <code style={{ fontSize: 12 }}>{c.id}</code>
            <button className="pill-btn" onClick={() => copy(c.id)}><Copy size={13} /></button>
          </div>
        ))}
        <p className="cv-muted">Etapas aceitas em "stage": novo_lead, contato, negociacao, proposta, fechado, perdido. Respostas de erro: 401 chave inválida, 402 sem créditos, 429 muitas chamadas.</p>
      </div>
    </>
  );
}
