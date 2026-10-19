import React, { useEffect, useState } from "react";
import { Building2, Megaphone, Trash2, LogIn, Briefcase, Plus, Pause, Play } from "lucide-react";
import { Sheet, Group, Row, Switch, Button } from "./ui.jsx";
import { DashboardTab, InvoicesTab, CommercialEditor, SupportTab, CreditsTab, PlansTab, brl } from "./GestaoTabs.jsx";
import {
  getAdminAccounts,
  createAdminAccount,
  updateAdminAccountApi,
  enterAccount,
  getAdminUsers,
  getAdminAnnouncements,
  createAdminAnnouncement,
  removeAdminAnnouncement,
  adminAccessLogs,
  adminMasters,
  adminCreateMaster,
  adminUpdateMaster,
  adminDeleteMaster
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
  const [maxUsers, setMaxUsers] = useState("");
  const [maxChannels, setMaxChannels] = useState("");
  const [allowCloud, setAllowCloud] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = () => getAdminAccounts().then(setAccounts).catch(console.error);

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    if (!name.trim()) return;
    if (!(parseInt(maxUsers, 10) >= 1) || maxChannels === "") {
      setFeedback({ type: "error", text: "Defina a quantidade de usuários e de canais de WhatsApp da empresa." });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const r = await createAdminAccount({
        name: name.trim(),
        ownerName: ownerName.trim() || undefined,
        ownerEmail: ownerEmail.trim() || undefined,
        ownerPassword: ownerPassword || undefined,
        maxUsers: parseInt(maxUsers, 10),
        maxWhatsappChannels: parseInt(maxChannels, 10),
        allowCloudApi: allowCloud
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
      setMaxUsers("");
      setMaxChannels("");
      setAllowCloud(false);
      setShowNew(false);
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

  const [showNew, setShowNew] = useState(false);
  const [q, setQ] = useState("");
  const shown = accounts.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <>
      <div className="ap-page-head">
        <div>
          <p style={{ fontSize: 15 }}>{accounts.length} {accounts.length === 1 ? "empresa cadastrada" : "empresas cadastradas"}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input className="ap-search" placeholder="Buscar empresa" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button onClick={() => { setFeedback(null); setShowNew(true); }}><Plus size={16} /> Nova empresa</Button>
        </div>
      </div>

      {feedback && !showNew && <div className={`admin-feedback ${feedback.type}`} style={{ marginBottom: 14 }}>{feedback.text}</div>}

      <div className="ap-list">
        {shown.map((a) => (
          <div className="ap-list-row" key={a.id}>
            <span className="ap-avatar">{initials(a.name) || <Building2 size={16} />}</span>
            <div className="ap-list-main">
              <strong>{a.name}</strong>
              <span>
                {a.plan_name || "Personalizado"} · {brl(a.monthly_price)}/mês · vence dia {a.due_day ?? 10} · {a.usersCount}/{a.max_users ?? "–"} usuários · desde {formatDate(a.created_at)}
              </span>
            </div>
            <span className={`ap-pill ${a.status}`}>{STATUS_LABEL[a.status] || a.status}</span>
            <div className="ap-list-actions">
              <Button onClick={() => enterAccount(a)}><LogIn size={14} /> Entrar</Button>
              <Button variant="secondary" onClick={() => setEditing(a)}><Briefcase size={14} /> Editar</Button>
              <Button variant={a.status === "suspended" ? "secondary" : "danger"} disabled={busyId === a.id} onClick={() => toggleStatus(a)}
                title={a.status === "suspended" ? "Reativar" : "Suspender"}>
                {a.status === "suspended" ? <Play size={14} /> : <Pause size={14} />}
              </Button>
            </div>
          </div>
        ))}
        {!shown.length && <div className="ap-empty">{accounts.length ? "Nenhuma empresa encontrada." : "Nenhuma empresa ainda. Clique em Nova empresa para começar."}</div>}
      </div>

      {showNew && (
        <Sheet
          title="Nova empresa"
          subtitle="Depois de criar, clique em Entrar para configurar WhatsApp, setores e equipe."
          onClose={() => setShowNew(false)}
          footer={<>
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button disabled={loading || !name.trim() || !maxUsers || maxChannels === ""} onClick={async (e) => { await handleCreate(e); }}>
              {loading ? "Criando…" : "Criar empresa"}
            </Button>
          </>}
        >
          <Group title="Empresa">
            <Row label="Nome"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Obrigatório" /></Row>
          </Group>
          <Group title="Limites do contrato" hint="Obrigatório. Dá para alterar depois em Editar.">
            <Row label="Usuários"><input type="number" min="1" inputMode="numeric" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} placeholder="Ex: 5" /></Row>
            <Row label="Números de WhatsApp"><input type="number" min="0" inputMode="numeric" value={maxChannels} onChange={(e) => setMaxChannels(e.target.value)} placeholder="Ex: 2" /></Row>
            <Row label="API oficial do WhatsApp"><Switch checked={allowCloud} onChange={setAllowCloud} /></Row>
          </Group>
          <Group title="Gestor (opcional)" hint="Com senha, o gestor já entra direto. Sem senha, ele recebe um convite por e-mail.">
            <Row label="Nome"><input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Nome do gestor" /></Row>
            <Row label="E-mail"><input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="gestor@empresa.com" /></Row>
            <Row label="Senha"><input type="password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></Row>
          </Group>
          {feedback && <div className={`admin-feedback ${feedback.type}`} style={{ marginTop: 14 }}>{feedback.text}</div>}
        </Sheet>
      )}
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
      <MastersCard />
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
  const [form, setForm] = useState({ scope: "all", accountId: "", userId: "", title: "", message: "", link: "", buttonText: "" });
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
        link: form.link.trim() || undefined,
        buttonText: form.buttonText.trim() || undefined,
        sendEmail: !!form.sendEmail
      });
      setFeedback({ type: "success", text: "Comunicado enviado com sucesso." });
      setForm({ scope: "all", accountId: "", userId: "", title: "", message: "", link: "", buttonText: "" });
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

            <div className="client-two">
              <label className="login-field">
                <span>Link do botão (opcional)</span>
                <input
                  type="url"
                  value={form.link}
                  onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                  placeholder="https://... (vazio = abre o painel)"
                />
              </label>
              <label className="login-field">
                <span>Texto do botão</span>
                <input
                  value={form.buttonText}
                  maxLength={40}
                  onChange={(e) => setForm((f) => ({ ...f, buttonText: e.target.value }))}
                  placeholder="Abrir o Helora"
                />
              </label>
            </div>

            <label className="col-toggle-row" style={{ gap: 8 }}>
              <input type="checkbox" checked={!!form.sendEmail} onChange={(e) => setForm((f) => ({ ...f, sendEmail: e.target.checked }))} />
              Também enviar por e-mail (EmailJS)
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
                      🔗 {a.buttonText || "Abrir link"}
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

// As seções da Gestão agora ficam no menu lateral (App.jsx); aqui só renderiza a escolhida.
export default function AdminPage({ tab = "dashboard" }) {
  return (
    <div className="page">

      {tab === "dashboard" && <DashboardTab />}
      {tab === "accounts" && <AccountsTab />}
      {tab === "invoices" && <InvoicesTab />}
      {tab === "support" && <SupportTab />}
      {tab === "credits" && <CreditsTab />}
      {tab === "plans" && <PlansTab />}
      {tab === "users" && <UsersTab />}
      {tab === "logs" && <LogsTab />}
      {tab === "announcements" && <AnnouncementsTab />}
    </div>
  );
}


// ---------------------------------------------------------------- Equipe da Gestora
function MastersCard() {
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => adminMasters().then(setList).catch((e) => setMsg({ type: "error", text: e.response?.data?.error || e.message }));
  useEffect(() => { load(); }, []);
  const save = async () => {
    try {
      const r = await adminCreateMaster(edit);
      setMsg({ type: "success", text: r.invited ? "Usuário criado. Convite enviado por e-mail." : "Usuário criado. Já pode entrar." });
      setEdit(null);
      load();
    } catch (e) { setMsg({ type: "error", text: e.response?.data?.error || e.message }); }
  };
  const LEVEL = { master: "Master", support: "Suporte" };
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="ap-page-head">
        <div><p style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f" }}>Equipe Helora</p><p>Master: acesso total. Suporte: empresas e chamados, sem financeiro, planos e créditos.</p></div>
        <Button onClick={() => setEdit({ name: "", email: "", password: "", level: "master" })}><Plus size={16} /> Novo usuário</Button>
      </div>
      {msg && <div className={`admin-feedback ${msg.type}`} style={{ marginBottom: 12 }}>{msg.text}</div>}
      <div className="ap-list">
        {list.map((m) => (
          <div key={m.id} className="ap-list-row">
            <span className="ap-avatar">{(m.name || "?").slice(0, 1).toUpperCase()}</span>
            <div className="ap-list-main"><strong>{m.name}{m.me ? " (você)" : ""}</strong><span>{m.email || "—"}</span></div>
            {m.me ? <span className="ap-pill">{LEVEL[m.level]}</span> : (
              <select className="ap-search" style={{ minWidth: 0, width: 120 }} value={m.level} onChange={async (e) => { await adminUpdateMaster(m.id, { level: e.target.value }); load(); }}>
                <option value="master">Master</option><option value="support">Suporte</option>
              </select>
            )}
            {!m.me && <Button variant="danger" onClick={async () => { if (confirm(`Remover o acesso de ${m.name}?`)) { await adminDeleteMaster(m.id); load(); } }}><Trash2 size={14} /></Button>}
          </div>
        ))}
        {!list.length && <div className="ap-empty">Carregando…</div>}
      </div>
      {edit && (
        <Sheet title="Novo usuário da Helora" subtitle="Acessa o Painel Helora (gestão de todas as empresas)." onClose={() => setEdit(null)} width={480}
          footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button disabled={!edit.name.trim() || !edit.email.trim()} onClick={save}>Criar usuário</Button></>}>
          <Group>
            <Row label="Nome"><input autoFocus value={edit.name} onChange={(e) => setEdit((c) => ({ ...c, name: e.target.value }))} placeholder="Nome" /></Row>
            <Row label="E-mail"><input type="email" value={edit.email} onChange={(e) => setEdit((c) => ({ ...c, email: e.target.value }))} placeholder="nome@helora.com" /></Row>
            <Row label="Senha"><input type="password" value={edit.password} onChange={(e) => setEdit((c) => ({ ...c, password: e.target.value }))} placeholder="Vazio = convite por e-mail" autoComplete="new-password" /></Row>
            <Row label="Nível">
              <select value={edit.level} onChange={(e) => setEdit((c) => ({ ...c, level: e.target.value }))}>
                <option value="master">Master (tudo)</option><option value="support">Suporte</option>
              </select>
            </Row>
          </Group>
        </Sheet>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Logs de acesso
function LogsTab() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [logs, setLogs] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { getAdminAccounts().then(setAccounts).catch(() => {}); }, []);
  useEffect(() => { setLogs(null); adminAccessLogs(accountId || undefined).then(setLogs).catch((e) => { setErr(e.response?.data?.error || e.message); setLogs([]); }); }, [accountId]);
  return (
    <>
      <div className="ap-page-head">
        <div><p style={{ fontSize: 15 }}>Registro de logins: usuário, empresa, horário e IP.</p></div>
        <select className="ap-search" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Todas as empresas</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {err && <div className="admin-feedback error" style={{ marginBottom: 12 }}>{err}</div>}
      <AccessLogList logs={logs} showAccount />
    </>
  );
}

export function AccessLogList({ logs, showAccount }) {
  const device = (ua = "") => /iphone|ipad/i.test(ua) ? "iPhone/iPad" : /android/i.test(ua) ? "Android" : /mac/i.test(ua) ? "Mac" : /windows/i.test(ua) ? "Windows" : "Navegador";
  return (
    <div className="ap-list">
      {logs === null && <div className="ap-empty">Carregando…</div>}
      {logs?.map((l) => (
        <div key={l.id} className="ap-list-row">
          <span className="ap-avatar" style={{ background: "linear-gradient(135deg,#5e5ce6,#64d2ff)" }}>{(l.userName || "?").slice(0, 1).toUpperCase()}</span>
          <div className="ap-list-main">
            <strong>{l.userName || "Usuário"}{showAccount && l.accountName ? ` · ${l.accountName}` : ""}</strong>
            <span>{new Date(l.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })} · IP {l.ip || "—"} · {device(l.userAgent)}</span>
          </div>
        </div>
      ))}
      {logs && !logs.length && <div className="ap-empty">Nenhum acesso registrado ainda.</div>}
    </div>
  );
}
