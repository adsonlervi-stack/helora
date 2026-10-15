import React, { useEffect, useState } from "react";
import { Wallet, Receipt, Coins, Smartphone, Users, ExternalLink } from "lucide-react";
import { getBillingApi } from "../api.js";

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const STATUS = { pending: ["Em aberto", "pending"], paid: ["Paga", "paid"], canceled: ["Cancelada", "canceled"] };

/** Financeiro da empresa: plano, faturas, créditos e uso. */
export default function FinancePage() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    getBillingApi().then(setD).catch((e) => setError(e.response?.data?.error || e.message));
  }, []);
  if (error) return <div className="page"><div className="admin-feedback error">{error}</div></div>;
  if (!d) return <div className="page"><div className="cv-muted">Carregando…</div></div>;
  const today = new Date().toISOString().slice(0, 10);
  const next = d.invoices.find((i) => i.status === "pending");
  return (
    <div className="page finance-page">
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-top"><div className="kpi-label">Seu plano</div><Wallet size={18} color="#0071e3" /></div>
          <div className="kpi-value">{d.plan?.name || d.account.planName || "Personalizado"}</div>
          <div className="kpi-sub">{brl(d.account.monthlyPrice)}/mês · vence dia {d.account.dueDay || 10}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-top"><div className="kpi-label">Próxima fatura</div><Receipt size={18} color="#0071e3" /></div>
          <div className="kpi-value">{next ? brl(next.amount) : "Tudo pago ✓"}</div>
          <div className="kpi-sub">{next ? `Vencimento ${date(next.dueDate)}${next.dueDate < today ? " · em atraso" : ""}` : "Nenhuma fatura em aberto"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-top"><div className="kpi-label">Créditos de campanha</div><Coins size={18} color="#0071e3" /></div>
          <div className="kpi-value">{d.credits.balance}</div>
          <div className="kpi-sub">{d.account.creditsMonthly} liberados por mês · 1 crédito = 1 mensagem</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-top"><div className="kpi-label">Uso do plano</div><Smartphone size={18} color="#0071e3" /></div>
          <div className="kpi-value">{d.usage.numbers}/{d.account.maxWhatsapp} <small style={{ fontSize: 14 }}>números</small></div>
          <div className="kpi-sub"><Users size={12} style={{ verticalAlign: -2 }} /> {d.usage.users}{d.account.maxUsers ? `/${d.account.maxUsers}` : ""} usuário(s)</div>
        </div>
      </div>

      {d.plan && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">O que está incluso</div>
          <ul className="finance-feats">{d.plan.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Faturas</div>
        <div className="rep-table-wrap">
          <table className="rep-table">
            <thead><tr><th>Referência</th><th>Valor</th><th>Vencimento</th><th>Situação</th><th>Pago em</th><th></th></tr></thead>
            <tbody>
              {d.invoices.map((i) => {
                const late = i.status === "pending" && i.dueDate < today;
                const [label, cls] = late ? ["Em atraso", "overdue"] : STATUS[i.status] || [i.status, ""];
                return (
                  <tr key={i.id}>
                    <td>{i.reference}</td><td>{brl(i.amount)}</td><td>{date(i.dueDate)}</td>
                    <td><span className={`invoice-badge ${cls}`}>{label}</span></td>
                    <td>{i.paidAt ? date(i.paidAt) : "—"}</td>
                    <td>{i.paymentLink && i.status === "pending" && <a className="pill-btn primary" href={i.paymentLink} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Pagar</a>}</td>
                  </tr>
                );
              })}
              {!d.invoices.length && <tr><td colSpan={6} className="cv-muted">Nenhuma fatura ainda.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="cv-muted" style={{ marginBottom: 0 }}>Dúvidas sobre cobrança? Fale com a gente pelo botão <strong>Ajuda</strong>.</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Movimentação de créditos</div>
        {(d.credits.ledger || []).map((l) => (
          <div key={l.id} className="reply-item">
            <span className="reply-response">{l.description || l.reason || l.kind || "Movimento"} · <span className="cv-muted">{new Date(l.created_at || l.createdAt).toLocaleString("pt-BR")}</span></span>
            <strong style={{ color: (l.amount || 0) < 0 ? "#ff3b30" : "#34c759" }}>{(l.amount || 0) > 0 ? "+" : ""}{l.amount}</strong>
          </div>
        ))}
        {!d.credits.ledger?.length && <div className="cv-muted">Sem movimentação.</div>}
      </div>
    </div>
  );
}
