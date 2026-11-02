import React, { useEffect, useRef, useState } from "react";
import { Search, ShieldCheck, AlarmClock, AlertTriangle, Users, Wallet, ChevronDown, ChevronRight, ExternalLink, Download } from "lucide-react";
import { crm } from "../api.js";
import Avatar from "./Avatar.jsx";

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDoc = (d) => (!d ? "" : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"));
const fmtDate = (s) => (s ? s.split("-").reverse().join("/") : "");
const fmtPhone = (p) => { const d = String(p || "").replace(/\D/g, "").replace(/^55/, ""); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : p || ""; };
const STATUS = {
  ativa: ["Vigente", "ok"], a_vencer: ["Vence em breve", "warn"], vencida: ["Vencida", "bad"], cancelado: ["Cancelado", "off"], sem_vigencia: ["Sem vigência", "off"]
};

/** Carteira de clientes: busca por CPF/CNPJ e mostra o que está vigente de cada cliente. */
export default function CrmCarteira() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [data, setData] = useState(null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState(null);
  const t = useRef(null);
  const load = (opts = {}) => {
    const p = opts.page ?? 0;
    setErr(null);
    if (!p) setData(null);
    crm.carteira({ q: opts.q ?? q, filter: opts.filter ?? filter, page: p })
      .then((r) => setData((cur) => (p && cur ? { ...r, clients: [...cur.clients, ...r.clients] } : r)))
      .catch((e) => { setErr(e?.response?.data?.error || e.message); setData({ totals: {}, clients: [], count: 0 }); });
    setPage(p);
  };
  useEffect(() => { load(); }, []);
  const onQ = (v) => { setQ(v); clearTimeout(t.current); t.current = setTimeout(() => load({ q: v }), 350); };
  const tot = data?.totals || {};
  const exportCsv = () => {
    const rows = [["Cliente", "CPF/CNPJ", "Telefone", "E-mail", "Funil", "Etapa", "Status", "Vigência", "Valor", "Detalhes"]];
    for (const c of data?.clients || []) for (const i of c.items) rows.push([c.name, fmtDoc(c.doc), fmtPhone(c.phone), c.email || "", i.pipeline, i.stage, STATUS[i.status]?.[0], i.vigencia ? fmtDate(i.vigencia.date) : "", i.value ?? "", i.details.map((d) => `${d.label}: ${d.value}`).join(" | ")]);
    const blob = new Blob(["﻿" + rows.map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "carteira-de-clientes.csv"; a.click();
  };
  const openLead = (id) => window.open(`${window.location.pathname}?aba=crm&lead=${id}`, "_blank");

  return (
    <div className="cart">
      <div className="cart-kpis">
        {[
          ["", Users, "Clientes", tot.clients ?? "—"],
          ["ativos", ShieldCheck, "Vigentes", tot.active ?? "—"],
          ["a_vencer", AlarmClock, "Vencem em 30 dias", tot.dueSoon ?? "—"],
          ["vencidos", AlertTriangle, "Vencidas", tot.expired ?? "—"],
          [null, Wallet, "Valor vigente", tot.activeValue != null ? brl(tot.activeValue) : "—"]
        ].map(([k, I, l, v]) => (
          <button key={l} className={`cart-kpi ${k !== null && filter === k ? "on" : ""}`} disabled={k === null} onClick={() => { setFilter(k); load({ filter: k }); }}>
            <I size={16} /><span>{l}</span><strong>{v}</strong>
          </button>
        ))}
      </div>

      <div className="cart-bar">
        <div className="cart-search">
          <Search size={16} />
          <input autoFocus value={q} onChange={(e) => onQ(e.target.value)} placeholder="Buscar cliente por CPF, CNPJ, nome ou telefone" />
        </div>
        <button className="pill-btn" onClick={exportCsv} disabled={!data?.clients?.length}><Download size={14} /> Excel</button>
      </div>
      {err && <div className="admin-feedback error">{err}</div>}
      {tot.clients > 0 && tot.withDoc < tot.clients && !q && (
        <div className="cart-hint">{tot.clients - tot.withDoc} cliente(s) sem CPF/CNPJ no card. Para juntar as apólices do mesmo cliente, crie um campo do tipo “CPF / CNPJ” no funil e preencha.</div>
      )}

      <div className="cart-list">
        {data === null && <div className="cart-empty">Carregando…</div>}
        {data && !data.clients.length && <div className="cart-empty">Nenhum cliente encontrado.</div>}
        {(data?.clients || []).map((c) => {
          const isOpen = open === c.key;
          return (
            <div key={c.key} className={`cart-client ${isOpen ? "open" : ""}`}>
              <button className="cart-row" onClick={() => setOpen(isOpen ? null : c.key)}>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <Avatar name={c.name} size={36} />
                <span className="cart-who">
                  <strong>{c.name}</strong>
                  <small>{[c.doc && `${c.docType} ${fmtDoc(c.doc)}`, fmtPhone(c.phone), c.company].filter(Boolean).join(" · ") || "Sem documento"}</small>
                </span>
                <span className="cart-pills">
                  {c.active > 0 && <span className="cart-st ok">{c.active} vigente{c.active > 1 ? "s" : ""}</span>}
                  {c.dueSoon > 0 && <span className="cart-st warn">{c.dueSoon} a vencer</span>}
                  {c.expired > 0 && <span className="cart-st bad">{c.expired} vencida{c.expired > 1 ? "s" : ""}</span>}
                  {!c.active && !c.expired && <span className="cart-st off">{c.items.length} negócio{c.items.length > 1 ? "s" : ""}</span>}
                </span>
                <span className="cart-next">{c.nextDue ? <>Próx. vencimento<br /><b>{fmtDate(c.nextDue)}</b></> : ""}</span>
                <span className="cart-val">{c.activeValue ? brl(c.activeValue) : ""}</span>
              </button>
              {isOpen && (
                <div className="cart-items">
                  <div className="cart-contact">{c.email && <span>{c.email}</span>}{c.phone && <span>{fmtPhone(c.phone)}</span>}</div>
                  {c.items.map((i) => {
                    const [label, cls] = STATUS[i.status] || ["", "off"];
                    return (
                      <div key={i.id} className="cart-item">
                        <span className={`cart-st ${cls}`}>{label}</span>
                        <div className="cart-item-main">
                          <strong>{i.details.find((d) => d.type === "select")?.value || i.pipeline}</strong>
                          <small>{i.pipeline} · {i.stage}{i.archived ? " · arquivado" : ""}</small>
                          {i.details.length > 0 && <div className="cart-det">{i.details.map((d) => <span key={d.label}><em>{d.label}:</em> {d.type === "currency" ? brl(d.value) : String(d.value)}</span>)}</div>}
                        </div>
                        <div className="cart-item-vig">
                          {i.vigencia ? <>{i.vigencia.label}<br /><b>{fmtDate(i.vigencia.date)}</b>{i.vigencia.days != null && <small>{i.vigencia.days >= 0 ? `faltam ${i.vigencia.days} dia(s)` : `venceu há ${-i.vigencia.days} dia(s)`}</small>}</> : "—"}
                        </div>
                        <div className="cart-item-val">{i.value ? brl(i.value) : ""}</div>
                        <button className="icon-btn" title="Abrir card" onClick={() => openLead(i.id)}><ExternalLink size={14} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {data && data.clients.length < data.count && (
          <button className="pill-btn cart-more" onClick={() => load({ page: page + 1 })}>Mostrar mais ({data.count - data.clients.length})</button>
        )}
      </div>
    </div>
  );
}
