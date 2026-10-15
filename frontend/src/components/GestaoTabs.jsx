import React, { useEffect, useMemo, useState } from "react";
import { Building2, TrendingUp, AlertTriangle, Wallet, CheckCircle2, Plus } from "lucide-react";
import {
  getManagementDashboard,
  getAdminAccounts,
  updateAdminAccountApi,
  getInvoices,
  generateInvoicesApi,
  createInvoiceApi,
  updateInvoiceApi,
  getSupportThreadsAdmin,
  getSupportMessagesAdmin,
  replySupportAdmin,
  setSupportStatusAdmin,
  acceptSupportApi,
  getAdminCredits,
  getAdminCreditLedger,
  setAdminMonthlyCredits,
  addAdminCredits
} from "../api.js";

export const brl = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso) => (iso ? new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR") : "—");
const currentRef = () => new Date().toISOString().slice(0, 7);
const errText = (err) => err?.response?.data?.error || err?.message || "Erro inesperado.";

// ---------------------------------------------------------------- Painel
export function DashboardTab() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getManagementDashboard().then(setD).catch((e) => setError(errText(e)));
  }, []);

  if (error)
    return (
      <div className="admin-feedback error">
        {error}
        {/invoices|column/i.test(error) && " — rode o arquivo migration_012_gestao_cobrancas.sql no Supabase."}
      </div>
    );
  if (!d) return <div className="card">Carregando…</div>;

  const cards = [
    { icon: TrendingUp, label: "Receita mensal (MRR)", value: brl(d.mrr), hint: `${d.accounts.active} empresa(s) ativa(s)` },
    { icon: CheckCircle2, label: "Recebido este mês", value: brl(d.receivedThisMonth.amount), hint: `${d.receivedThisMonth.count} pagamento(s)` },
    { icon: Wallet, label: "A receber", value: brl(d.receivable.amount), hint: `${d.receivable.count} cobrança(s) em aberto` },
    { icon: AlertTriangle, label: "Em atraso", value: brl(d.overdue.amount), hint: `${d.overdue.count} cobrança(s) vencida(s)`, danger: d.overdue.count > 0 },
    { icon: Building2, label: "Empresas", value: d.accounts.total, hint: `${d.accounts.newThisMonth} nova(s) este mês · ${d.accounts.trial} em teste · ${d.accounts.suspended} suspensa(s)` }
  ];

  return (
    <div className="gestao-cards">
      {cards.map(({ icon: Icon, label, value, hint, danger }) => (
        <div className={`card gestao-card ${danger ? "danger" : ""}`} key={label}>
          <div className="gestao-card-head">
            <Icon size={16} /> {label}
          </div>
          <div className="gestao-card-value">{value}</div>
          <div className="gestao-card-hint">{hint}</div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------- Dados comerciais da empresa
export function CommercialEditor({ account, onClose, onSaved }) {
  const [f, setF] = useState({
    planName: account.plan_name || "",
    monthlyPrice: account.monthly_price ?? 0,
    dueDay: account.due_day ?? 10,
    maxWhatsappChannels: account.max_whatsapp_channels ?? 1,
    status: account.status,
    document: account.document || "",
    contactName: account.contact_name || "",
    contactPhone: account.contact_phone || "",
    contactEmail: account.contact_email || "",
    notes: account.notes || ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateAdminAccountApi(account.id, f);
      onSaved();
      onClose();
    } catch (err) {
      setError(errText(err));
    }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card deal-modal team-editor gestao-editor" onClick={(e) => e.stopPropagation()}>
        <h3>{account.name}</h3>
        <div className="gestao-form-grid">
          <label className="login-field"><span>Plano</span><input value={f.planName} onChange={set("planName")} placeholder="Ex: Básico, Pro" /></label>
          <label className="login-field"><span>Mensalidade (R$)</span><input value={f.monthlyPrice} onChange={set("monthlyPrice")} inputMode="decimal" /></label>
          <label className="login-field"><span>Dia de vencimento</span><input type="number" min="1" max="28" value={f.dueDay} onChange={set("dueDay")} /></label>
          <label className="login-field"><span>Números de WhatsApp liberados</span><input type="number" min="0" max="50" value={f.maxWhatsappChannels} onChange={set("maxWhatsappChannels")} /><small className="cv-muted">Messenger e Instagram: 1 de cada.</small></label>
          <label className="login-field">
            <span>Situação</span>
            <select className="deal-stage-select" value={f.status} onChange={set("status")}>
              <option value="active">Ativa</option>
              <option value="trial">Em teste</option>
              <option value="suspended">Suspensa</option>
            </select>
          </label>
          <label className="login-field"><span>CNPJ / CPF</span><input value={f.document} onChange={set("document")} /></label>
          <label className="login-field"><span>Responsável</span><input value={f.contactName} onChange={set("contactName")} /></label>
          <label className="login-field"><span>Telefone</span><input value={f.contactPhone} onChange={set("contactPhone")} /></label>
          <label className="login-field"><span>E-mail financeiro</span><input value={f.contactEmail} onChange={set("contactEmail")} /></label>
        </div>
        <label className="login-field"><span>Observações</span><textarea rows={3} value={f.notes} onChange={set("notes")} /></label>
        {error && <div className="admin-feedback error">{error}</div>}
        <button className="connect-btn" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar"}</button>
        <button className="modal-close" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Cobranças
const STATUS = { pending: "Em aberto", paid: "Paga", canceled: "Cancelada" };

export function InvoicesTab() {
  const [list, setList] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filter, setFilter] = useState("open");
  const [reference, setReference] = useState(currentRef());
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [nf, setNf] = useState({ accountId: "", amount: "", dueDate: "", reference: currentRef() });

  const load = () =>
    getInvoices(filter === "open" ? { status: "pending" } : filter === "all" ? {} : { status: filter })
      .then(setList)
      .catch((e) => setMsg({ type: "error", text: errText(e) }));

  useEffect(() => {
    load();
  }, [filter]);
  useEffect(() => {
    getAdminAccounts().then(setAccounts).catch(() => {});
  }, []);

  const total = useMemo(() => list.reduce((s, i) => s + Number(i.amount), 0), [list]);

  const generate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await generateInvoicesApi(reference);
      setMsg({
        type: "success",
        text: r.eligible
          ? `${r.created} cobrança(s) nova(s) para ${reference} (as que já existiam não foram duplicadas).`
          : "Nenhuma empresa ativa com mensalidade cadastrada. Defina o valor em Empresas → Comercial."
      });
      load();
    } catch (e) {
      setMsg({ type: "error", text: errText(e) });
    }
    setBusy(false);
  };

  const setStatus = async (inv, status, paymentMethod) => {
    try {
      await updateInvoiceApi(inv.id, { status, paymentMethod });
      load();
    } catch (e) {
      setMsg({ type: "error", text: errText(e) });
    }
  };

  const createOne = async (e) => {
    e.preventDefault();
    try {
      await createInvoiceApi(nf);
      setShowNew(false);
      setNf({ accountId: "", amount: "", dueDate: "", reference: currentRef() });
      load();
    } catch (err) {
      setMsg({ type: "error", text: errText(err) });
    }
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Gerar cobranças do mês</div>
        <div className="card-subtitle">
          Cria uma cobrança para cada empresa <strong>ativa</strong> com mensalidade definida, no dia de vencimento dela.
          Pode clicar de novo sem medo: não duplica.
        </div>
        <div className="gestao-row">
          <input type="month" className="response" value={reference} onChange={(e) => setReference(e.target.value)} />
          <button className="connect-btn" style={{ width: "auto" }} disabled={busy} onClick={generate}>
            {busy ? "Gerando…" : "Gerar cobranças"}
          </button>
          <button className="resolve-btn" onClick={() => setShowNew((v) => !v)}>
            <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Cobrança avulsa
          </button>
        </div>
        {showNew && (
          <form className="admin-create-grid" onSubmit={createOne}>
            <select className="deal-stage-select" value={nf.accountId} onChange={(e) => setNf({ ...nf, accountId: e.target.value })}>
              <option value="">Empresa…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input className="response" type="month" value={nf.reference} onChange={(e) => setNf({ ...nf, reference: e.target.value })} />
            <input className="response" placeholder="Valor (R$)" inputMode="decimal" value={nf.amount} onChange={(e) => setNf({ ...nf, amount: e.target.value })} />
            <input className="response" type="date" value={nf.dueDate} onChange={(e) => setNf({ ...nf, dueDate: e.target.value })} />
            <button className="connect-btn" type="submit" disabled={!nf.accountId || !nf.amount || !nf.dueDate}>Criar</button>
          </form>
        )}
        {msg && <div className={`admin-feedback ${msg.type}`}>{msg.text}</div>}
      </div>

      <div className="card">
        <div className="gestao-row" style={{ justifyContent: "space-between" }}>
          <div className="card-title" style={{ margin: 0 }}>Cobranças · {brl(total)}</div>
          <div className="settings-tabs" style={{ margin: 0 }}>
            {[["open", "Em aberto"], ["overdue", "Atrasadas"], ["paid", "Pagas"], ["all", "Todas"]].map(([k, l]) => (
              <button key={k} className={`settings-tab ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="gestao-table">
          {list.map((i) => (
            <div className="reply-item gestao-invoice" key={i.id}>
              <span className="reply-response">
                <strong>{i.accountName}</strong>
                <span className="gestao-muted"> · ref. {i.reference} · vence {fmtDate(i.due_date)}</span>
                {i.paid_at && <span className="gestao-muted"> · paga em {fmtDate(i.paid_at.slice(0, 10))}{i.payment_method ? ` (${i.payment_method})` : ""}</span>}
              </span>
              <strong>{brl(i.amount)}</strong>
              <span className={`invoice-badge ${i.overdue ? "overdue" : i.status}`}>{i.overdue ? "Atrasada" : STATUS[i.status]}</span>
              {i.status === "pending" && (
                <>
                  <select
                    className="deal-stage-select gestao-pay"
                    defaultValue=""
                    onChange={(e) => e.target.value && setStatus(i, "paid", e.target.value)}
                  >
                    <option value="">Marcar como paga…</option>
                    <option value="pix">Pix</option>
                    <option value="boleto">Boleto</option>
                    <option value="cartao">Cartão</option>
                    <option value="transferencia">Transferência</option>
                    <option value="dinheiro">Dinheiro</option>
                  </select>
                  <button className="resolve-btn" onClick={() => setStatus(i, "canceled")}>Cancelar</button>
                </>
              )}
              {i.status !== "pending" && (
                <button className="resolve-btn" onClick={() => setStatus(i, "pending")}>Reabrir</button>
              )}
            </div>
          ))}
          {list.length === 0 && <div className="gestao-muted" style={{ padding: "10px 0" }}>Nenhuma cobrança aqui.</div>}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Suporte

export function SupportTab() {
  const [threads, setThreads] = useState([]);
  const [replyError, setReplyError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);

  const loadThreads = () => getSupportThreadsAdmin().then(setThreads).catch((e) => setError(errText(e)));
  const loadMessages = (id) => getSupportMessagesAdmin(id).then(setMessages).catch(() => {});

  useEffect(() => {
    loadThreads();
    const t = setInterval(() => {
      loadThreads();
      if (selected) loadMessages(selected.id);
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const open = (t) => {
    setSelected(t);
    loadMessages(t.id);
  };

  const reply = async (e) => {
    e.preventDefault();
    if (!text.trim() || !selected) return;
    try {
      await replySupportAdmin(selected.id, text.trim());
      setReplyError(null);
    } catch (err) {
      return setReplyError(errText(err));
    }
    notify(false);
    setText("");
    loadMessages(selected.id);
    loadThreads();
  };

  const { othersTyping, notify } = useTyping(selected?.id, "admin");
  const current = threads.find((t) => t.id === selected?.id) || selected;

  const accept = async () => {
    await acceptSupportApi(selected.id);
    setSelected({ ...selected, status: "open" });
    loadMessages(selected.id);
    loadThreads();
  };

  const toggle = async () => {
    const status = selected.status === "open" ? "closed" : "open";
    await setSupportStatusAdmin(selected.id, status);
    setSelected({ ...selected, status });
    loadThreads();
  };

  if (error)
    return (
      <div className="admin-feedback error">
        {error}
        {/support/i.test(error) && " — rode o arquivo migration_013_contatos_suporte.sql no Supabase."}
      </div>
    );

  return (
    <div className="support-admin">
      <div className="card support-admin-list">
        <div className="card-title">Chamados</div>
        {threads.map((t) => (
          <button key={t.id} className={`support-thread ${selected?.id === t.id ? "active" : ""}`} onClick={() => open(t)}>
            <span>
              <strong>{t.accountName}</strong>
              <small>{t.userName || "—"} · {t.subject || "Sem assunto"}</small>
            </span>
            {t.unread > 0 && <span className="cv-unread">{t.unread}</span>}
            {t.status === "closed" && <span className="invoice-badge canceled">Fechado</span>}
            {t.status === "waiting" && <span className="invoice-badge pending">Na fila</span>}
          </button>
        ))}
        {threads.length === 0 && <div className="gestao-muted" style={{ padding: 8 }}>Nenhum chamado ainda.</div>}
      </div>

      <div className="card support-admin-chat">
        {!selected ? (
          <div className="gestao-muted">Escolha um chamado à esquerda.</div>
        ) : (
          <>
            <div className="gestao-row" style={{ justifyContent: "space-between" }}>
              <div className="card-title" style={{ margin: 0 }}>{selected.accountName}</div>
              <div className="gestao-row">
                {current?.status === "waiting" && (
                  <button className="pill-btn primary" onClick={accept}>Aceitar chamado</button>
                )}
                {current?.status !== "waiting" && (
                  <button className="resolve-btn" onClick={toggle}>{current?.status === "open" ? "Fechar chamado" : "Reabrir"}</button>
                )}
              </div>
            </div>
            <div className="support-list" style={{ minHeight: 280 }}>
              {messages.map((m) => (
                <div key={m.id} className={`support-msg ${m.fromAdmin ? "out" : "in"} ${m.isBot ? "bot" : ""}`}>
                  {(!m.fromAdmin || m.isBot) && <span className="support-author">{m.isBot ? "🤖 Helora Bot" : m.authorName || "Cliente"}</span>}
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
                  <small>{new Date(m.createdAt).toLocaleString("pt-BR")}</small>
                </div>
              ))}
            </div>
              {othersTyping && <div className="support-msg in typing-bubble"><span className="typing-dots"><i /><i /><i /></span></div>}
            {current?.status === "waiting" && (
              <div className="support-waiting">Este chamado está na fila. Clique em <strong>Aceitar chamado</strong> para conversar com o cliente.</div>
            )}
            {replyError && <div className="admin-feedback error">{replyError}</div>}
            <form className="support-composer" onSubmit={reply}>
              <input
                value={text}
                disabled={current?.status === "waiting"}
                onChange={(e) => {
                  setText(e.target.value);
                  notify(!!e.target.value);
                }}
                placeholder={current?.status === "waiting" ? "Aceite o chamado para responder" : "Responder como Suporte Helora…"}
              />
              <button className="composer-send" disabled={!text.trim()}>➤</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}


// ---------------------------------------------------------------- Créditos
const KIND = { monthly: "Mensal", manual: "Liberado", campaign: "Campanha", api: "API", refund: "Estorno", adjust: "Ajuste" };

export function CreditsTab() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const load = () => getAdminCredits().then(setRows).catch((e) => setError(errText(e)));
  useEffect(() => {
    load();
  }, []);

  const openAcc = (r) => {
    setOpen(r);
    getAdminCreditLedger(r.id).then((d) => setLedger(d.ledger)).catch(() => {});
  };

  const saveMonthly = async (r, v) => {
    await setAdminMonthlyCredits(r.id, v).catch((e) => setError(errText(e)));
    load();
  };

  const launch = async (e) => {
    e.preventDefault();
    await addAdminCredits(open.id, parseInt(amount, 10), note).catch((err) => setError(errText(err)));
    setAmount("");
    setNote("");
    load();
    openAcc(open);
  };

  if (error && !rows.length)
    return <div className="admin-feedback error">{error}{/credit/i.test(error) && " — rode o arquivo migration_015 no Supabase."}</div>;

  return (
    <div className="support-admin">
      <div className="card">
        <div className="card-title">Créditos por empresa</div>
        <div className="card-subtitle">1 crédito = 1 mensagem de campanha ou API. A cota mensal é liberada automaticamente todo mês.</div>
        {rows.map((r) => (
          <button key={r.id} className={`support-thread ${open?.id === r.id ? "active" : ""}`} onClick={() => openAcc(r)}>
            <span>
              <strong>{r.name}</strong>
              <small>Cota: {r.creditsMonthly}/mês · usados no mês: {r.usedThisMonth}</small>
            </span>
            <span className={`invoice-badge ${r.balance > 0 ? "paid" : "overdue"}`}>{r.balance} saldo</span>
          </button>
        ))}
        {!rows.length && <div className="gestao-muted">Nenhuma empresa.</div>}
      </div>
      <div className="card">
        {!open ? (
          <div className="gestao-muted">Escolha uma empresa.</div>
        ) : (
          <>
            <div className="card-title">{open.name}</div>
            <label className="login-field">
              <span>Cota mensal de créditos</span>
              <input type="number" min="0" defaultValue={open.creditsMonthly} onBlur={(e) => saveMonthly(open, e.target.value)} key={open.id} />
              <small className="fe-hint">Liberada no 1º uso de cada mês. Mudou aqui, vale a partir do próximo mês.</small>
            </label>
            <form className="admin-create-grid" onSubmit={launch}>
              <input className="response" type="number" placeholder="Créditos avulsos (+ ou -)" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <input className="response" placeholder="Motivo (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="connect-btn" disabled={!parseInt(amount, 10)}>Lançar</button>
            </form>
            <div className="card-title" style={{ marginTop: 14 }}>Extrato</div>
            {ledger.map((l) => (
              <div key={l.id} className="reply-item">
                <span className="reply-response">
                  <strong style={{ color: l.delta > 0 ? "#248a3d" : "#c93400" }}>{l.delta > 0 ? "+" : ""}{l.delta}</strong>
                  <span className="gestao-muted"> · {KIND[l.kind] || l.kind}{l.note ? ` · ${l.note}` : ""} · {new Date(l.createdAt).toLocaleString("pt-BR")}</span>
                </span>
              </div>
            ))}
            {!ledger.length && <div className="gestao-muted">Sem movimentação.</div>}
          </>
        )}
      </div>
    </div>
  );
}
