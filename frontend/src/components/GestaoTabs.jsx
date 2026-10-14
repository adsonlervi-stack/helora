import React, { useEffect, useMemo, useState } from "react";
import { Building2, TrendingUp, AlertTriangle, Wallet, CheckCircle2, Plus } from "lucide-react";
import {
  getManagementDashboard,
  getAdminAccounts,
  updateAdminAccountApi,
  getInvoices,
  generateInvoicesApi,
  createInvoiceApi,
  updateInvoiceApi
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
