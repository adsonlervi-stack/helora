import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Plus, Paperclip, Send, X, Check, RotateCcw, Ban, Receipt, RefreshCw } from "lucide-react";
import { crm } from "../api.js";
import { notify, askConfirm } from "../dialogs.js";
import { loadQuickReplies } from "./QuickReplies.jsx";

const errText = (e) => e?.response?.data?.error || e.message;
const brl = (v) => (v == null || v === "" ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const br = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const today = () => new Date().toISOString().slice(0, 10);
const addMonths = (ymd, n) => { if (!ymd) return ""; const [y, m, d] = ymd.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + n, d)); return t.toISOString().slice(0, 10); };
export const TIPOS = { anual: "Anual (12 meses)", prazo: "Prazo fixo", recorrente: "Recorrente (sem fim)", pontual: "Pontual (viagem, evento)" };
const PAY = { avista: "À vista", parcelado: "Parcelado", mensal: "Mensal recorrente" };
const daysTo = (ymd) => (ymd ? Math.round((new Date(`${ymd}T12:00:00`) - new Date(`${today()}T12:00:00`)) / 86400000) : null);

/** Preenche as variáveis do modelo de cobrança. */
export const fillBilling = (text, { name, amount, due, n, total, product }) => String(text || "")
  .replace(/\{nome\}/g, String(name || "").trim().split(/\s+/)[0] || "").replace(/\{nome_completo\}/g, name || "")
  .replace(/\{valor\}/g, brl(amount)).replace(/\{vencimento\}/g, br(due)).replace(/\{parcela\}/g, total ? `${n}/${total}` : "do mês").replace(/\{produto\}/g, product || "seguro");

/** Cadastro da apólice: abre quando o negócio é marcado como Ganho (ou pelo botão Registrar apólice). */
export function PolicyForm({ lead, ctx, pipe, onClose, onSaved }) {
  const products = (ctx?.products || []).filter((p) => p.active !== false);
  const fieldVal = (re) => { const fd = (pipe?.fields || []).find((x) => re.test(x.label || "")); return fd ? String(lead.custom?.[fd.id] || "") : ""; };
  const firstProd = (lead.products || [])[0];
  const prodRow = products.find((p) => p.id === firstProd?.productId);
  const [f, setF] = useState(() => {
    const tipo = prodRow?.vigencia_tipo || "anual", meses = prodRow?.vigencia_meses || 12;
    const start = /^\d{4}-\d{2}-\d{2}/.test(fieldVal(/in[ií]cio.*vig|vig[eê]ncia.*in[ií]cio/i)) ? fieldVal(/in[ií]cio.*vig|vig[eê]ncia.*in[ií]cio/i).slice(0, 10) : today();
    return {
      productId: prodRow?.id || "", product: prodRow?.name || firstProd?.name || fieldVal(/produto|ramo|tipo de seguro/i) || pipe?.name || "", insurer: fieldVal(/seguradora|companhia|cia/i), number: fieldVal(/ap[oó]lice|proposta/i),
      tipo, meses, start, end: tipo === "recorrente" ? "" : addMonths(start, tipo === "anual" ? 12 : meses), payment: tipo === "recorrente" ? "mensal" : "avista", installments: 1,
      amount: "", premium: lead.value || "", dueDay: "", commission: "", renewalDays: 60,
      billing: { enabled: false, daysBefore: 3, template: null, needsAttachment: false }
    };
  });
  const [templates, setTemplates] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadQuickReplies().then(setTemplates).catch(() => {}); }, []);
  const set = (k, v) => setF((c) => {
    const n = { ...c, [k]: v };
    if (k === "productId") { const p = products.find((x) => x.id === v); if (p) { n.product = p.name; n.tipo = p.vigencia_tipo || "anual"; n.meses = p.vigencia_meses || 12; } }
    if (["productId", "tipo", "meses", "start"].includes(k)) { n.end = n.tipo === "recorrente" ? "" : addMonths(n.start, n.tipo === "anual" ? 12 : Number(n.meses) || 12); if (n.tipo === "recorrente") n.payment = "mensal"; }
    if (k === "premium" || k === "installments" || k === "payment") { if (n.payment === "parcelado" && n.premium && n.installments) n.amount = (Number(String(n.premium).replace(",", ".")) / Number(n.installments)).toFixed(2); if (n.payment === "avista") n.amount = n.premium; }
    return n;
  });
  const b = f.billing;
  const setB = (k, v) => setF((c) => ({ ...c, billing: { ...c.billing, [k]: v } }));
  const save = async () => {
    setBusy(true);
    try { await crm.createPolicy({ ...f, leadId: lead.id }); notify(b.enabled ? "Apólice registrada e cobranças agendadas nas Atividades." : "Apólice registrada.", "success"); onSaved?.(); }
    catch (e) { notify(errText(e), "error"); }
    setBusy(false);
  };
  const preview = b.template ? fillBilling(b.template.text, { name: lead.name, amount: f.amount || f.premium, due: f.start, n: 1, total: f.payment === "parcelado" ? f.installments : null, product: f.product }) : "";
  return createPortal(
    <div className="lp-overlay" style={{ zIndex: 1300 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cl-form pf">
        <h3><FileText size={18} /> Registrar apólice <small>· {lead.name}</small></h3>
        <label><span>Produto</span>
          {products.length ? <select value={f.productId} onChange={(e) => set("productId", e.target.value)}><option value="">{f.product || "Escolha"}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            : <input value={f.product} onChange={(e) => set("product", e.target.value)} />}
        </label>
        <label><span>Seguradora</span><input value={f.insurer} onChange={(e) => set("insurer", e.target.value)} /></label>
        <label><span>Nº da apólice</span><input value={f.number} onChange={(e) => set("number", e.target.value)} /></label>
        <label><span>Tipo de vigência</span><select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>{Object.entries(TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {f.tipo === "prazo" && <label><span>Prazo (meses)</span><input type="number" min="1" value={f.meses} onChange={(e) => set("meses", e.target.value)} /></label>}
        <label><span>Início da vigência</span><input type="date" value={f.start} onChange={(e) => set("start", e.target.value)} /></label>
        {f.tipo !== "recorrente" && <label><span>Fim da vigência</span><input type="date" value={f.end} onChange={(e) => setF((c) => ({ ...c, end: e.target.value }))} /></label>}

        <div className="pf-sec full">Pagamento</div>
        <label><span>Forma</span><select value={f.payment} onChange={(e) => set("payment", e.target.value)}>{Object.entries(PAY).filter(([k]) => f.tipo !== "recorrente" || k === "mensal").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {f.payment === "parcelado" && <label><span>Nº de parcelas</span><input type="number" min="1" max="120" value={f.installments} onChange={(e) => set("installments", e.target.value)} /></label>}
        <label><span>{f.payment === "mensal" ? "Valor mensal" : "Prêmio total"}</span><input inputMode="decimal" value={f.payment === "mensal" ? f.amount : f.premium} onChange={(e) => set(f.payment === "mensal" ? "amount" : "premium", e.target.value)} placeholder="R$" /></label>
        {f.payment === "parcelado" && <label><span>Valor da parcela</span><input inputMode="decimal" value={f.amount} onChange={(e) => setF((c) => ({ ...c, amount: e.target.value }))} /></label>}
        {f.payment !== "avista" && <label><span>Dia do vencimento</span><input type="number" min="1" max="31" value={f.dueDay} onChange={(e) => setF((c) => ({ ...c, dueDay: e.target.value }))} placeholder="ex.: 10" /></label>}
        <label><span>% de comissão trabalhada</span><input inputMode="decimal" value={f.commission} onChange={(e) => setF((c) => ({ ...c, commission: e.target.value }))} placeholder="ex.: 15" /></label>
        {(f.tipo === "anual" || f.tipo === "prazo") && <label><span>Renovação</span><select value={f.renewalDays} onChange={(e) => setF((c) => ({ ...c, renewalDays: e.target.value }))}><option value="0">Não renova (avulso)</option>{[30, 45, 60, 90].map((d) => <option key={d} value={d}>Abrir {d} dias antes do fim</option>)}</select></label>}

        {f.payment !== "avista" && (
          <div className="pf-bill full">
            <label className="lp-fin"><input type="checkbox" checked={b.enabled} onChange={(e) => setB("enabled", e.target.checked)} /> <b>Agendar atividade de cobrança {f.payment === "mensal" ? "todo mês" : "de cada parcela"}</b></label>
            {b.enabled && (
              <div className="pf-bill-in">
                <label><span>Agendar quantos dias antes do vencimento</span><select value={b.daysBefore} onChange={(e) => setB("daysBefore", e.target.value)}>{[0, 1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 0 ? "No dia" : `${d} dia${d > 1 ? "s" : ""} antes`}</option>)}</select></label>
                <label><span>Modelo da mensagem</span>
                  <select value={b.template?.id || ""} onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); setB("template", t ? { id: t.id, title: t.title, text: t.text, files: t.files || [] } : null); }}>
                    <option value="">Sem modelo (escrever na hora)</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </label>
                <label className="lp-fin full"><input type="checkbox" checked={b.needsAttachment} onChange={(e) => setB("needsAttachment", e.target.checked)} /> Precisa anexar arquivo na hora de enviar (ex.: boleto)</label>
                {b.template?.files?.length > 0 && <div className="full lp-ag-files">{b.template.files.map((x, i) => <span key={i}><Paperclip size={12} /> {x.name} (vai junto)</span>)}</div>}
                {preview && <div className="full pf-prev"><small>Prévia</small>{preview}</div>}
                <small className="full lp-muted">Variáveis no modelo: {"{nome}"}, {"{valor}"}, {"{vencimento}"}, {"{parcela}"}, {"{produto}"}. Os modelos ficam em Configurações → Respostas prontas.</small>
              </div>
            )}
          </div>
        )}
        <div className="cl-form-foot full"><button className="lp-btn" onClick={onClose}>Agora não</button><button className="lp-btn primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar apólice"}</button></div>
      </div>
    </div>,
    document.body
  );
}

/** Bloco "Apólices" do card: vigência, parcelas (pagar) e status. */
export function PoliciesSection({ lead, ctx, pipe, refreshKey, onChanged }) {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(false);
  const load = () => crm.policies({ leadId: lead.id }).then((r) => setList(r.missing ? "missing" : r.policies)).catch(() => setList([]));
  useEffect(() => { load(); }, [lead.id, refreshKey]);
  const paid = async (p, i) => { try { await crm.setInstallmentPaid(i.id, !i.paidAt); load(); onChanged?.(); } catch (e) { notify(errText(e), "error"); } };
  const status = async (p, st) => { if (!await askConfirm(st === "cancelada" ? "Cancelar a apólice? As cobranças futuras saem das Atividades." : "Reativar?")) return; await crm.updatePolicy(p.id, { status: st }); load(); onChanged?.(); };
  if (list === "missing") return <p className="lp-muted lp-pad">Para registrar apólices, rode a migration 043 no Supabase.</p>;
  return (
    <div className="pol">
      {list?.map((p) => {
        const dl = daysTo(p.end);
        const late = p.parcels.filter((i) => !i.paidAt && i.due < today()).length;
        return (
          <div key={p.id} className={`pol-it ${p.status}`}>
            <div className="pol-h"><strong>{p.product || "Seguro"}</strong><span className={`pol-st ${p.status}`}>{p.status}</span></div>
            <small>{[p.insurer, p.number && `nº ${p.number}`].filter(Boolean).join(" · ")}</small>
            <div className="pol-v">
              {p.tipo === "recorrente" ? <span>Recorrente desde {br(p.start)}</span> : <span>Vigência {br(p.start)} → <b className={dl != null && dl <= 60 ? (dl < 0 ? "late" : "warn") : ""}>{br(p.end)}</b>{dl != null && p.status === "ativa" ? ` (${dl < 0 ? `venceu há ${-dl}d` : `${dl}d`})` : ""}</span>}
              <span>{PAY[p.payment]}{p.payment === "parcelado" ? ` ${p.installments}x` : ""}{p.amount ? ` · ${brl(p.amount)}` : p.premium ? ` · ${brl(p.premium)}` : ""}{p.commission ? ` · ${String(p.commission).replace(".", ",")}% com.` : ""}</span>
              {p.billing?.enabled && <span className="pol-bill"><Receipt size={12} /> Cobrança agendada {p.billing.daysBefore ? `${p.billing.daysBefore}d antes` : "no dia"}{p.billing.needsAttachment ? " · com anexo" : ""}</span>}
              {p.renewalLeadId && <span className="pol-bill"><RefreshCw size={12} /> Renovação aberta</span>}
            </div>
            {p.parcels.length > 1 && (
              <details className="pol-parc">
                <summary>Parcelas · {p.parcels.filter((i) => i.paidAt).length}/{p.parcels.length} pagas{late ? <b className="late"> · {late} atrasada{late > 1 ? "s" : ""}</b> : null}</summary>
                {p.parcels.map((i) => (
                  <div key={i.id} className={`pol-pi ${i.paidAt ? "paid" : i.due < today() ? "late" : ""}`}>
                    <span>{i.total ? `${i.n}/${i.total}` : br(i.due).slice(3)}</span><span>{br(i.due)}</span><span>{brl(i.amount)}</span>
                    <button onClick={() => paid(p, i)}>{i.paidAt ? <><Check size={12} /> Paga</> : "Marcar paga"}</button>
                  </div>
                ))}
              </details>
            )}
            <div className="pol-acts">
              {p.status === "ativa" ? <button onClick={() => status(p, "cancelada")}><Ban size={12} /> Cancelar apólice</button> : <button onClick={() => status(p, "ativa")}><RotateCcw size={12} /> Reativar</button>}
            </div>
          </div>
        );
      })}
      <button className="pol-add" onClick={() => setForm(true)}><Plus size={14} /> Registrar apólice</button>
      {form && <PolicyForm lead={lead} ctx={ctx} pipe={pipe} onClose={() => setForm(false)} onSaved={() => { setForm(false); load(); onChanged?.(); }} />}
    </div>
  );
}

/** Enviar a cobrança pelo WhatsApp a partir da atividade: usa o modelo escolhido e pede o anexo se for obrigatório. */
export function BillingSend({ ev, lead, onClose, onDone }) {
  const b = ev.billing || {};
  const [text, setText] = useState(() => fillBilling(b.template?.text || "Olá {nome}! Passando para lembrar do vencimento da parcela {parcela} do seu {produto}, no valor de {valor}, com vencimento em {vencimento}.", { name: lead?.name || ev.leadName, amount: b.amount, due: b.due, n: b.n, total: b.total, product: (ev.notes || "").split(" · ")[0] }));
  const [files, setFiles] = useState(b.template?.files || []);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const send = async (markPaid) => {
    if (b.needsAttachment && !files.some((x) => !(b.template?.files || []).some((t) => t.url === x.url))) return notify("Esta cobrança precisa de anexo (ex.: boleto). Anexe o arquivo.", "error");
    setBusy(true);
    try {
      await crm.sendLeadMessage(ev.leadId, text, files);
      await crm.updateEvent(ev.id, { done: true });
      if (markPaid && b.installmentId) await crm.setInstallmentPaid(b.installmentId, true);
      notify("Cobrança enviada pelo WhatsApp.", "success");
      onDone();
    } catch (e) { notify(errText(e), "error"); }
    setBusy(false);
  };
  return createPortal(
    <div className="lp-overlay" style={{ zIndex: 1300 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cl-form" style={{ gridTemplateColumns: "1fr", width: "min(560px,94vw)" }}>
        <h3><Receipt size={18} /> Enviar cobrança <small>· {lead?.name || ev.leadName}</small></h3>
        <small className="lp-muted">{ev.title} · vence {br(b.due)}</small>
        <label><span>Mensagem</span><textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <div className="lp-ag-files">{files.map((x, i) => <span key={i}><Paperclip size={12} /> {x.name}<button onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}><X size={11} /></button></span>)}</div>
        <button className={`lp-ghost ${b.needsAttachment && !files.length ? "need" : ""}`} onClick={() => ref.current?.click()}><Paperclip size={14} /> {b.needsAttachment ? "Anexar boleto/arquivo (obrigatório)" : "Anexar arquivo"}</button>
        <input ref={ref} type="file" hidden onChange={async (e) => { const fl = e.target.files?.[0]; e.target.value = ""; if (!fl) return; try { const r = await crm.uploadMessageFile(fl); setFiles((l) => [...l, r]); } catch (er) { notify(errText(er), "error"); } }} />
        <div className="cl-form-foot">
          <button className="lp-btn" onClick={onClose}>Cancelar</button>
          <button className="lp-btn" disabled={busy} onClick={() => send(true)}>Enviar e marcar paga</button>
          <button className="lp-btn primary" disabled={busy} onClick={() => send(false)}><Send size={14} /> {busy ? "Enviando…" : "Enviar"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Relatório de apólices (Relatórios → CRM): vencendo, parcelas atrasadas, recorrentes e comissão trabalhada. */
export function PoliciesReport() {
  const [data, setData] = useState(null);
  const [win, setWin] = useState(60);
  useEffect(() => { crm.policies({ summary: 1 }).then((r) => setData(r.missing ? "missing" : r.policies)).catch(() => setData([])); }, []);
  const s = useMemo(() => {
    if (!Array.isArray(data)) return null;
    const act = data.filter((p) => p.status === "ativa");
    const vencendo = act.filter((p) => { const d = daysTo(p.end); return d != null && d >= 0 && d <= win; }).sort((a, b) => a.end.localeCompare(b.end));
    const vencidas = act.filter((p) => { const d = daysTo(p.end); return d != null && d < 0; });
    const late = act.flatMap((p) => p.parcels.filter((i) => !i.paidAt && i.due < today()).map((i) => ({ ...i, p })));
    const rec = act.filter((p) => p.payment === "mensal" || p.tipo === "recorrente");
    const comm = act.filter((p) => p.commission != null);
    return { act, vencendo, vencidas, late, rec, recSum: rec.reduce((t, p) => t + (p.amount || 0), 0), avgComm: comm.length ? comm.reduce((t, p) => t + p.commission, 0) / comm.length : null, premium: act.reduce((t, p) => t + (p.premium || p.amount || 0), 0) };
  }, [data, win]);
  if (data === "missing" || !s) return null;
  const xls = async () => {
    const XLSX = await import("xlsx");
    const rows = data.map((p) => ({ Cliente: p.leadName, Produto: p.product, Seguradora: p.insurer, "Nº apólice": p.number, Vigência: TIPOS[p.tipo], Início: br(p.start), Fim: br(p.end), Pagamento: PAY[p.payment], Parcelas: p.installments, "Valor parcela": p.amount, Prêmio: p.premium, "Comissão %": p.commission, "Parcelas pagas": p.parcels.filter((i) => i.paidAt).length, "Parcelas atrasadas": p.parcels.filter((i) => !i.paidAt && i.due < today()).length, Status: p.status, Responsável: p.ownerName }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Apólices"); XLSX.writeFile(wb, `Apólices ${br(today()).replace(/\//g, "-")}.xlsx`);
  };
  return (
    <div className="prp">
      <div className="prp-h"><h3>Apólices e cobranças</h3><button className="pill-btn" onClick={xls}>Exportar apólices (Excel)</button></div>
      <div className="sp-col prp-k">
        {[["Apólices ativas", s.act.length, brl(s.premium) + " em prêmios"], [`Vencendo em ${win} dias`, s.vencendo.length, "renovações a trabalhar"], ["Parcelas atrasadas", s.late.length, brl(s.late.reduce((t, i) => t + (i.amount || 0), 0))], ["Recorrentes", s.rec.length, brl(s.recSum) + "/mês"], ["Comissão média trabalhada", s.avgComm != null ? `${s.avgComm.toFixed(1).replace(".", ",")}%` : "—", "das apólices ativas"]].map(([l, n, sub]) => (
          <div key={l} className="sp-card"><h4>{l}</h4><b className="sp-n" style={{ fontSize: 30 }}>{n}</b><small className="sp-d">{sub}</small></div>
        ))}
      </div>
      <div className="prp-lists">
        <div className="sp-card">
          <h4>Vencendo <select value={win} onChange={(e) => setWin(Number(e.target.value))}>{[30, 60, 90].map((d) => <option key={d} value={d}>próximos {d} dias</option>)}</select></h4>
          {s.vencendo.slice(0, 50).map((p) => <div key={p.id} className="prp-row"><span>{p.leadName}<small>{p.product}{p.insurer ? ` · ${p.insurer}` : ""}</small></span><b className={daysTo(p.end) <= 30 ? "late" : ""}>{br(p.end)}</b></div>)}
          {!s.vencendo.length && <small className="lp-muted">Nenhuma no período.</small>}
        </div>
        <div className="sp-card">
          <h4>Parcelas em atraso</h4>
          {s.late.slice(0, 50).map((i) => <div key={i.id} className="prp-row"><span>{i.p.leadName}<small>{i.p.product} · {i.total ? `parcela ${i.n}/${i.total}` : "mensalidade"}</small></span><b className="late">{br(i.due)} · {brl(i.amount)}</b></div>)}
          {!s.late.length && <small className="lp-muted">Nenhuma parcela atrasada. 👏</small>}
        </div>
      </div>
    </div>
  );
}
