import React, { useEffect, useState } from "react";
import { Wallet, Receipt, Coins, Smartphone, Users, ExternalLink } from "lucide-react";
import { getBillingApi, getInvoicePixApi } from "../api.js";

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const STATUS = { pending: ["Em aberto", "pending"], paid: ["Paga", "paid"], canceled: ["Cancelada", "canceled"] };

/** Financeiro da empresa: plano, faturas, créditos e uso. */
export default function FinancePage() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [pixFor, setPixFor] = useState(null);
  const load = () => getBillingApi().then(setD).catch((e) => setError(e.response?.data?.error || e.message));
  useEffect(() => {
    load();
  }, []);
  if (error) return <div className="page"><div className="admin-feedback error">{error}</div></div>;
  if (!d) return <div className="page"><div className="cv-muted">Carregando…</div></div>;
  const today = new Date().toISOString().slice(0, 10);
  const next = d.invoices.find((i) => i.status === "pending");
  return (
    <div className="page finance-page">
      {d.account.blocked && (
        <div className="admin-feedback error" style={{ marginBottom: 16 }}>
          Seu acesso está pausado por falta de pagamento. Pague a fatura em aberto pelo PIX abaixo — a liberação é automática em poucos segundos.
        </div>
      )}
      {pixFor && <PixModal invoice={pixFor} onClose={() => setPixFor(null)} onPaid={() => { setPixFor(null); load(); setTimeout(() => window.location.reload(), 800); }} />}
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
                    <td>{(i.status === "pending" || i.status === "overdue") && <button className="pill-btn primary" onClick={() => setPixFor(i)}>Pagar com PIX</button>}
                      {i.boletoUrl && <a className="pill-btn" href={i.boletoUrl} target="_blank" rel="noreferrer">Boleto</a>}
                      {i.paymentLink && i.status === "pending" && <a className="pill-btn" href={i.paymentLink} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>}</td>
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


function PixModal({ invoice, onClose, onPaid }) {
  const [pix, setPix] = useState(null);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    getInvoicePixApi(invoice.id).then(setPix).catch((e) => setErr(e.response?.data?.error || e.message));
    // confere a cada 5s se o pagamento já caiu
    const t = setInterval(async () => {
      try {
        const b = await getBillingApi();
        if (b.invoices.find((x) => x.id === invoice.id)?.status === "paid") { clearInterval(t); onPaid(); }
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [invoice.id]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, textAlign: "center" }}>
        <div className="card-title">Pagar com PIX · {brl(invoice.amount)}</div>
        {err && <div className="admin-feedback error">{err}</div>}
        {!pix && !err && <div className="cv-muted">Gerando o PIX…</div>}
        {pix && (
          <>
            {pix.encodedImage && <img alt="QR Code PIX" src={`data:image/png;base64,${pix.encodedImage}`} style={{ width: 230, height: 230, margin: "8px auto" }} />}
            <div className="cv-muted" style={{ fontSize: 12, marginBottom: 8 }}>Abra o app do banco, escolha PIX e leia o QR Code — ou copie o código:</div>
            <textarea readOnly className="response" value={pix.payload || ""} rows={3} style={{ width: "100%", fontSize: 11 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
              <button className="pill-btn primary" onClick={() => { navigator.clipboard.writeText(pix.payload || ""); setCopied(true); }}>{copied ? "Copiado ✓" : "Copiar código PIX"}</button>
              {pix.invoiceUrl && <a className="pill-btn" href={pix.invoiceUrl} target="_blank" rel="noreferrer">Ver fatura</a>}
            </div>
            <div className="cv-muted" style={{ fontSize: 12, marginTop: 10 }}>Assim que o pagamento cair, esta janela fecha sozinha.</div>
          </>
        )}
        <button className="pill-btn" style={{ marginTop: 12 }} onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
