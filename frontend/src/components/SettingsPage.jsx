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
  Smartphone
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
  setProfileDepartmentsApi
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

export default function SettingsPage({ onGoToChannels }) {
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
      {tab === "team" && <TeamTab />}
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

function TeamTab() {
  const [team, setTeam] = useState([]);
  const [departments, setDepartments] = useState([]);

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
    <div className="card">
      <div className="card-title">Equipe</div>
      <div className="card-subtitle">
        Escolha os setores de cada atendente. Quem é <strong>Gestor</strong> vê tudo, sem
        restrição.
      </div>

      <div>
        {team.map((member) => (
          <div className="team-member-row" key={member.id}>
            <div className="team-member-info">
              <span className="team-member-name">{member.name || "Sem nome"}</span>
              <span className={`team-role-badge ${member.role}`}>
                {member.role === "owner" ? "Gestor" : "Atendente"}
              </span>
            </div>
            {member.role === "agent" ? (
              <div className="team-dept-chips">
                {departments.map((d) => {
                  const active = member.departments.some((md) => md.id === d.id);
                  return (
                    <button
                      key={d.id}
                      className={`filter-tab ${active ? "active" : ""}`}
                      onClick={() => toggleDept(member, d.id)}
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
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Acesso total à conta</span>
            )}
          </div>
        ))}
        {team.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
            Nenhum atendente cadastrado ainda.
          </div>
        )}
      </div>
    </div>
  );
}


