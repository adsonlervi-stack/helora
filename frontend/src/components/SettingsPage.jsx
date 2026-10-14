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
  Pencil
} from "lucide-react";
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
  removeTeamMemberApi
} from "../api.js";

const CARDS = [
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
  }
];

export default function SettingsPage({ onGoToChannels, canManage = false }) {
  const [tab, setTab] = useState(null);

  if (tab === null) {
    return (
      <div className="page">
        <div className="settings-grid">
          {CARDS.map(({ key, label, desc, icon: Icon, external }) => (
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
      {tab === "canned" && <CannedResponsesTab />}
      {tab === "labels" && <LabelsTab />}
      {tab === "departments" && <DepartmentsTab />}
      {tab === "team" && <TeamTab canManage={canManage} />}
      {tab === "scheduled" && <ScheduledMessagesTab />}
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

function CannedResponsesTab() {
  const [items, setItems] = useState([]);
  const [shortCode, setShortCode] = useState("");
  const [content, setContent] = useState("");

  const load = () => getCannedResponses().then(setItems).catch(console.error);
  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!shortCode.trim() || !content.trim()) return;
    await createCannedResponseApi(shortCode.trim().replace(/^\//, ""), content.trim());
    setShortCode("");
    setContent("");
    load();
  };

  const handleDelete = async (id) => {
    await removeCannedResponse(id);
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

      <div>
        {items.map((r) => (
          <div className="reply-item" key={r.id}>
            <span className="reply-keyword">/{r.shortCode}</span>
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

function NewMemberForm({ onCreated }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "agent" });
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
        role: form.role
      });
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
      {msg && <div className={`admin-feedback ${msg.type}`}>{msg.text}</div>}
    </div>
  );
}

function MemberEditor({ member, onClose, onSaved }) {
  const [name, setName] = useState(member.name || "");
  const [role, setRole] = useState(member.role);
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
        <button
          className="connect-btn"
          disabled={busy || !name.trim()}
          onClick={() => run(() => updateTeamMemberApi(member.id, { name, role }), "Dados salvos.")}
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
