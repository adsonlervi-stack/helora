import React, { useEffect, useState } from "react";
import { Building2, Megaphone, Trash2, LogIn, Briefcase } from "lucide-react";
import { DashboardTab, InvoicesTab, CommercialEditor, SupportTab, brl } from "./GestaoTabs.jsx";
import {
  getAdminAccounts,
  createAdminAccount,
  updateAdminAccountApi,
  enterAccount,
  getAdminUsers,
  getAdminAnnouncements,
  createAdminAnnouncement,
  removeAdminAnnouncement
} from "../api.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const TABS = [
  { key: "dashboard", label: "Painel" },
  { key: "accounts", label: "Empresas" },
  { key: "invoices", label: "Cobranças" },
  { key: "support", label: "Suporte" },
  { key: "users", label: "Usuários" },
  { key: "announcements", label: "Comunicados" }
];

const STATUS_LABEL = { active: "Ativa", suspended: "Suspensa", trial: "Teste" };

function AccountsTab() {
  const [accounts, setAccounts] = useState([]);
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = () => getAdminAccounts().then(setAccounts).catch(console.error);

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      const r = await createAdminAccount({
        name: name.trim(),
        ownerName: ownerName.trim() || undefined,
        ownerEmail: ownerEmail.trim() || undefined,
        ownerPassword: ownerPassword || undefined
      });
      setFeedback({
        type: "success",
        text: !ownerEmail.trim()
          ? `Empresa "${name}" criada. Clique em "Entrar" para cadastrar os usuários dela.`
          : r.invited
            ? `Empresa "${name}" criada. Convite enviado para ${ownerEmail}.`
            : `Empresa "${name}" criada. O gestor já pode entrar com ${ownerEmail} e a senha definida.`
      });
      setName("");
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPassword("");
      load();
    } catch (err) {
      setFeedback({ type: "error", text: err.response?.data?.error || err.message });
    }
    setLoading(false);
  };

  const toggleStatus = async (a) => {
    setBusyId(a.id);
    try {
      await updateAdminAccountApi(a.id, { status: a.status === "suspended" ? "active" : "suspended" });
      load();
    } catch (err) {
      setFeedback({ type: "error", text: err.response?.data?.error || err.message });
    }
    setBusyId(null);
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Nova empresa</div>
        <div className="card-subtitle">
          Só o nome é obrigatório. Depois é só clicar em <strong>Entrar</strong> para configurar
          tudo por dentro (usuários, WhatsApp, setores). Se já quiser criar o gestor, preencha
          e-mail e senha; sem senha, ele recebe convite por e-mail.
        </div>

        <form className="admin-create-grid" onSubmit={handleCreate}>
          <input className="response" placeholder="Nome da empresa *" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="response" placeholder="Nome do gestor (opcional)" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
          <input className="response" type="email" placeholder="E-mail do gestor (opcional)" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
          <input className="response" type="password" placeholder="Senha do gestor (mín. 6)" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} autoComplete="new-password" />
          <button type="submit" className="connect-btn" disabled={loading || !name.trim()}>
            {loading ? "Criando..." : "Criar empresa"}
          </button>
        </form>

        {feedback && <div className={`admin-feedback ${feedback.type}`}>{feedback.text}</div>}
      </div>

      <div className="card">
        <div className="card-title">Empresas cadastradas</div>
        <div className="card-subtitle">{accounts.length} no total</div>

        <div>
          {accounts.map((a) => (
            <div className="reply-item admin-account-row" key={a.id}>
              <span className="agent-avatar" style={{ marginBottom: 0, width: 32, height: 32 }}>
                <Building2 size={15} />
              </span>
              <span className="reply-response">
                <strong>{a.name}</strong>
                <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: 12 }}>
                  {a.plan_name ? `${a.plan_name} · ` : ""}{brl(a.monthly_price)}/mês · vence dia {a.due_day ?? 10} ·{" "}
                  {a.usersCount} usuário(s) · desde {formatDate(a.created_at)}
                </span>
              </span>
              <span className={`account-status-badge ${a.status}`}>{STATUS_LABEL[a.status] || a.status}</span>
              <button className="connect-btn admin-enter-btn" onClick={() => enterAccount(a)}>
                <LogIn size={14} style={{ marginRight: 5, verticalAlign: -2 }} />
                Entrar
              </button>
              <button className="resolve-btn" onClick={() => setEditing(a)}>
                <Briefcase size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
                Comercial
              </button>
              <button className="resolve-btn" disabled={busyId === a.id} onClick={() => toggleStatus(a)}>
                {a.status === "suspended" ? "Reativar" : "Suspender"}
              </button>
            </div>
          ))}
          {accounts.length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
              Nenhuma empresa cadastrada ainda.
            </div>
          )}
        </div>
      </div>
      {editing && <CommercialEditor account={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getAdminUsers().then(setUsers).catch(console.error);
  }, []);

  const filtered = users.filter((u) =>
    `${u.name || ""} ${u.accountName || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Usuários do Helora ({users.length})</div>
        <div className="card-subtitle">Todo mundo com login, em todas as contas.</div>

        <div className="search-box" style={{ margin: "0 0 14px", maxWidth: 280 }}>
          <input
            placeholder="Buscar por nome ou conta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div>
          {filtered.map((u) => (
            <div className="reply-item" key={u.id}>
              <span className="reply-response">
                <strong>{u.name || "Sem nome"}</strong>
                <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>{u.accountName}</span>
              </span>
              <span className={`team-role-badge ${u.role}`}>
                {u.isSuperAdmin ? "Super Admin" : u.role === "owner" ? "Gestor" : "Atendente"}
              </span>
              <span className={`account-status-badge ${u.accountStatus}`} style={{ marginLeft: 8 }}>
                {u.accountStatus}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
              Nenhum usuário encontrado.
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Sobre os papéis de acesso</div>
        <div className="role-legend-grid">
          <div className="role-legend-card">
            <span className="team-role-badge owner">Super Admin</span>
            <p>Acesso a todas as contas do Helora. Cria contas novas e vê usuários de todo mundo.</p>
          </div>
          <div className="role-legend-card">
            <span className="team-role-badge owner">Gestor</span>
            <p>
              Acesso total à própria conta: setores, equipe, canais e todas as conversas, sem
              restrição.
            </p>
          </div>
          <div className="role-legend-card">
            <span className="team-role-badge agent">Atendente</span>
            <p>
              Só vê conversas do(s) próprio(s) setor(es) ou atribuídas diretamente a ele — não
              acessa Setores, Equipe nem Canais.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function AnnouncementsTab() {
  const [mode, setMode] = useState("send"); // 'send' | 'sent'
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [sent, setSent] = useState([]);
  const [form, setForm] = useState({ scope: "all", accountId: "", userId: "", title: "", message: "", link: "" });
  const [feedback, setFeedback] = useState(null);
  const [sending, setSending] = useState(false);

  const loadSent = () => getAdminAnnouncements().then(setSent).catch(console.error);

  useEffect(() => {
    getAdminAccounts().then(setAccounts).catch(console.error);
    getAdminUsers().then(setUsers).catch(console.error);
    loadSent();
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) return;
    setSending(true);
    setFeedback(null);
    try {
      await createAdminAnnouncement({
        scope: form.scope,
        accountId: form.scope === "account" ? form.accountId : undefined,
        userId: form.scope === "user" ? form.userId : undefined,
        title: form.title.trim(),
        message: form.message.trim(),
        link: form.link.trim() || undefined
      });
      setFeedback({ type: "success", text: "Comunicado enviado com sucesso." });
      setForm({ scope: "all", accountId: "", userId: "", title: "", message: "", link: "" });
      loadSent();
    } catch (err) {
      setFeedback({ type: "error", text: err.response?.data?.error || err.message });
    }
    setSending(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este comunicado? Ele some do Início de quem ainda não leu.")) return;
    await removeAdminAnnouncement(id);
    loadSent();
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={`settings-tab ${mode === "send" ? "active" : ""}`}
          onClick={() => setMode("send")}
        >
          Enviar comunicado
        </button>
        <button
          className={`settings-tab ${mode === "sent" ? "active" : ""}`}
          onClick={() => setMode("sent")}
        >
          Comunicados enviados ({sent.length})
        </button>
      </div>

      {mode === "send" && (
        <div className="card">
          <div className="card-title">Enviar comunicado</div>
          <div className="card-subtitle">
            Aparece no Início de quem se encaixa no destino escolhido — dá pra avisar sobre
            manutenções, novidades ou instabilidades.
          </div>

          <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 520 }}>
            <label className="login-field">
              <span>Destinatários</span>
              <select
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
              >
                <option value="all">Todas as contas</option>
                <option value="account">Uma conta específica</option>
                <option value="user">Um usuário específico</option>
              </select>
            </label>

            {form.scope === "account" && (
              <label className="login-field">
                <span>Conta</span>
                <select
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                >
                  <option value="">Selecione uma conta...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {form.scope === "user" && (
              <label className="login-field">
                <span>Usuário</span>
                <select
                  value={form.userId}
                  onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                >
                  <option value="">Selecione um usuário...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || "Sem nome"} — {u.accountName}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="login-field">
              <span>Título</span>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Atualização do sistema Helora"
              />
            </label>

            <label className="login-field">
              <span>Mensagem</span>
              <textarea
                rows={4}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Escreva o comunicado..."
              />
            </label>

            <label className="login-field">
              <span>Link (opcional)</span>
              <input
                type="url"
                value={form.link}
                onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                placeholder="https://..."
              />
            </label>

            {feedback && <div className={`admin-feedback ${feedback.type}`}>{feedback.text}</div>}

            <button
              type="submit"
              className="connect-btn"
              style={{ width: "auto", padding: "10px 20px", alignSelf: "flex-start" }}
              disabled={sending}
            >
              {sending ? "Enviando..." : "Enviar comunicado"}
            </button>
          </form>
        </div>
      )}

      {mode === "sent" && (
        <div className="card">
          <div className="card-title">Comunicados enviados ({sent.length})</div>

          <div>
            {sent.map((a) => (
              <div className="reply-item" key={a.id} style={{ alignItems: "flex-start" }}>
                <Megaphone size={16} style={{ marginTop: 3, color: "var(--accent)", flexShrink: 0 }} />
                <span className="reply-response" style={{ display: "block" }}>
                  <strong>{a.title}</strong>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>{a.message}</div>
                  {a.link && (
                    <a href={a.link} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 700 }}>
                      🔗 Abrir link
                    </a>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                    {new Date(a.createdAt).toLocaleDateString("pt-BR")} ·{" "}
                    {a.scope === "all"
                      ? "Todas as contas"
                      : a.scope === "account"
                        ? a.accountName || "Conta removida"
                        : a.userName || "Usuário removido"}{" "}
                    · enviado por {a.createdBy || "—"}
                  </div>
                </span>
                <button className="icon-btn" title="Excluir comunicado" onClick={() => handleDelete(a.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {sent.length === 0 && (
              <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "8px 0" }}>
                Nenhum comunicado enviado ainda.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="page">
      <div className="settings-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`settings-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "accounts" && <AccountsTab />}
      {tab === "invoices" && <InvoicesTab />}
      {tab === "support" && <SupportTab />}
      {tab === "users" && <UsersTab />}
      {tab === "announcements" && <AnnouncementsTab />}
    </div>
  );
}
