import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { crm } from "../api.js";
import { notify } from "../dialogs.js";
import { fmtDoc, docStatus, onlyDigits } from "../docs.js";

const OTHER = "__outra__";

/** Opções do campo, respeitando o campo "pai" (ex.: Produto depende do Ramo; linhas "Ramo > Produto"). */
export function fieldOptions(fd, custom = {}) {
  const raw = fd.options || [];
  if (!raw.some((o) => o.includes(" > "))) return raw;
  const parentVal = fd.parent ? String(custom[fd.parent] || "") : "";
  const out = [];
  for (const o of raw) {
    const i = o.indexOf(" > ");
    if (i < 0) { out.push(o); continue; }
    const head = o.slice(0, i);
    const tail = o.slice(i + 3);
    if (!parentVal || head === parentVal) out.push(tail);
  }
  return [...new Set(out)];
}

/**
 * Campo de lista do CRM: escolhe da lista ou, quando o campo permite,
 * escreve outra opção (ex.: seguradora ou produto que não está na lista).
 */
export function SelectField({ fd, value, onChange, custom, className, onAddOption }) {
  const free = fd.free !== false; // todo campo de lista aceita escrever outra opção
  const opts = fieldOptions(fd, custom);
  const v = value ?? "";
  const outside = !!v && !opts.includes(v);
  const [typing, setTyping] = useState(free && outside);
  const inputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (free && outside) setTyping(true); }, [outside, free]);

  if (typing) {
    return (
      <span className={`crm-free ${className || ""}`}>
        <input ref={inputRef} value={v} onChange={(e) => onChange(e.target.value)} placeholder={`Escreva ${fd.label.toLowerCase()}`} />
        {onAddOption && v.trim() && !opts.includes(v.trim()) && (
          <button type="button" className="add" disabled={saving} title="Salvar esta opção na lista do funil"
            onClick={async () => { setSaving(true); const ok = await onAddOption(fd, v.trim()); setSaving(false); if (ok) setTyping(false); }}>
            {saving ? "…" : "+ Salvar na lista"}
          </button>
        )}
        <button type="button" onClick={() => { setTyping(false); if (outside) onChange(""); }} title="Voltar para a lista">Lista</button>
      </span>
    );
  }
  return (
    <select
      className={className}
      value={v}
      onChange={(e) => {
        if (e.target.value === OTHER) { setTyping(true); onChange(""); setTimeout(() => inputRef.current?.focus(), 30); return; }
        onChange(e.target.value);
      }}
    >
      <option value="">—</option>
      {[...opts, ...(outside ? [v] : [])].map((o) => <option key={o} value={o}>{o}</option>)}
      {free && <option value={OTHER}>✏️ Escrever outra / adicionar…</option>}
    </select>
  );
}

/** Lista de produtos agrupada por produto principal (subprodutos dentro). */
export function ProductOptions({ products, currentId }) {
  const vis = products.filter((p) => p.active || p.id === currentId);
  const roots = vis.filter((p) => !p.parent_id || !vis.some((x) => x.id === p.parent_id));
  return roots.map((r) => {
    const kids = vis.filter((p) => p.parent_id === r.id);
    if (!kids.length) return <option key={r.id} value={r.id}>{r.name}</option>;
    return (
      <optgroup key={r.id} label={r.name}>
        <option value={r.id}>{r.name} (geral)</option>
        {kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
      </optgroup>
    );
  });
}

/** Salva uma opção nova na lista do campo do funil (fica disponível para todos os cards). */
export function makeAddOption(ctx, pipe, custom) {
  return async (fd, val) => {
    if (!pipe) return false;
    const grouped = (fd.options || []).some((o) => o.includes(" > "));
    const parentVal = fd.parent ? String(custom?.[fd.parent] || "") : "";
    const opt = grouped && parentVal ? `${parentVal} > ${val}` : val;
    const fields = (pipe.fields || []).map((x) => (x.id === fd.id ? { ...x, options: [...(x.options || []), opt] } : x));
    try {
      await crm.updatePipeline(pipe.id, { fields });
      await ctx.loadPipelines?.();
      notify(`“${val}” adicionado à lista de ${fd.label}.`, "success");
      return true;
    } catch (e) {
      notify(e?.response?.data?.error || "Só o gestor pode mudar a lista. O valor ficou só neste card.", "error");
      return false;
    }
  };
}

/**
 * Campo CPF/CNPJ: formata enquanto digita, avisa se o número é inválido e,
 * quando é um CNPJ válido, busca os dados na Receita (razão social, endereço…).
 */
export function DocumentField({ value, onChange, onCnpjData, className }) {
  const v = value ?? "";
  const st = docStatus(v);
  const [busy, setBusy] = useState(false);
  const lastLookup = useRef("");
  const lookup = async (digits) => {
    if (!onCnpjData || lastLookup.current === digits) return;
    lastLookup.current = digits;
    setBusy(true);
    try {
      const d = await crm.cnpj(digits);
      onCnpjData(d);
      notify(`CNPJ encontrado: ${d.razaoSocial || d.nomeFantasia || "empresa"}${d.situacao && !/ativa/i.test(d.situacao) ? ` (situação: ${d.situacao})` : ""}.`, "success");
    } catch (e) {
      notify(e?.response?.data?.error || "Não consegui consultar o CNPJ agora.", "error");
    }
    setBusy(false);
  };
  useEffect(() => { if (st === "cnpj") lookup(onlyDigits(v)); }, [st, v]);
  return (
    <span className={`crm-doc ${className || ""}`}>
      <input value={fmtDoc(v)} onChange={(e) => onChange(fmtDoc(e.target.value))} inputMode="numeric" placeholder="CPF ou CNPJ" />
      {busy ? <span className="crm-doc-tag wait">Buscando…</span>
        : st === "cpf" ? <span className="crm-doc-tag ok">CPF ✓</span>
        : st === "cnpj" ? <button type="button" className="crm-doc-tag ok" title="Buscar os dados de novo na Receita" onClick={() => { lastLookup.current = ""; lookup(onlyDigits(v)); }}>CNPJ ✓</button>
        : st === "invalid" ? <span className="crm-doc-tag bad">Inválido</span>
        : null}
    </span>
  );
}

/** Preenche o card com os dados do CNPJ, sem apagar o que já foi digitado. */
export function applyCnpjData(d, { f, setField, fields, custom, setCustomValue }) {
  if (!d) return;
  const empresa = d.razaoSocial || d.nomeFantasia;
  if (setField) {
    if (empresa && !String(f.company || "").trim()) setField("company", empresa);
    if (!String(f.name || "").trim() && (d.nomeFantasia || d.razaoSocial)) setField("name", d.nomeFantasia || d.razaoSocial);
    if (d.email && !String(f.email || "").trim()) setField("email", d.email);
    if (d.telefone && !String(f.phone || "").trim()) setField("phone", `55${d.telefone}`);
  }
  for (const fd of fields || []) {
    if (String(custom?.[fd.id] || "").trim()) continue;
    const l = String(fd.label || "").toLowerCase();
    const val = /endere/.test(l) ? d.endereco : /raz[aã]o/.test(l) ? d.razaoSocial : /fantasia/.test(l) ? d.nomeFantasia
      : /situa/.test(l) ? d.situacao : /atividade|cnae|ramo de atividade/.test(l) ? d.atividade : /cidade|munic/.test(l) ? d.municipio : null;
    if (val) setCustomValue(fd.id, val);
  }
}

/** Depois de ganhar/perder: arquivar, reagendar ou deixar no funil. */
export function askAfterClose(name, outcome) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    const done = (r) => { resolve(r); setTimeout(() => { root.unmount(); el.remove(); }, 0); };
    root.render(<AfterClose name={name} outcome={outcome} onDone={done} />);
  });
}
function AfterClose({ name, outcome, onDone }) {
  const d0 = new Date(); d0.setMonth(d0.getMonth() + (outcome === "won" ? 11 : 3));
  const [date, setDate] = useState(d0.toISOString().slice(0, 10));
  const [pick, setPick] = useState(false);
  return (
    <div className="modal-overlay crm-after" onClick={() => onDone({ action: "keep" })}>
      <div className="modal-card crm-after-card" onClick={(e) => e.stopPropagation()}>
        <div className="crm-after-ico">{outcome === "won" ? "🏆" : "📁"}</div>
        <h3>{outcome === "won" ? "Negócio fechado!" : "Negócio perdido"}</h3>
        <p>O que fazer com o card de <strong>{name}</strong>?</p>
        {!pick ? (
          <div className="crm-after-actions">
            <button type="button" className="primary" onClick={() => onDone({ action: "archive" })}>Arquivar card</button>
            <button type="button" onClick={() => setPick(true)}>{outcome === "won" ? "Reagendar (ex.: renovação)" : "Reagendar novo contato"}</button>
            <button type="button" className="ghost" onClick={() => onDone({ action: "keep" })}>Deixar no funil</button>
          </div>
        ) : (
          <div className="crm-after-actions">
            <label className="crm-after-date">Volta como cliente novo em
              <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
            </label>
            <button type="button" className="primary" disabled={!date} onClick={() => onDone({ action: "snooze", date: new Date(`${date}T08:00:00`).toISOString() })}>Reagendar</button>
            <button type="button" className="ghost" onClick={() => setPick(false)}>Voltar</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Aplica a escolha (arquivar / reagendar) no lead. Devolve o lead atualizado ou null. */
export async function runAfterClose(lead, outcome) {
  const r = await askAfterClose(lead.name || "este cliente", outcome);
  try {
    if (r.action === "archive") { const l = await crm.updateLead(lead.id, { archived: true }); notify("Card arquivado. Veja em Arquivados."); return l; }
    if (r.action === "snooze") { const l = await crm.updateLead(lead.id, { snoozeUntil: r.date }); notify(`Reagendado: volta como cliente novo em ${new Date(r.date).toLocaleDateString("pt-BR")}.`, "success"); return l; }
  } catch (e) { notify(e?.response?.data?.error || "Não consegui salvar.", "error"); }
  return null;
}

/** Campo de texto chamado "CPF", "CNPJ"… também vira campo de documento (com pontos). */
export const isDocField = (fd) => fd?.type === "document" || (fd?.type === "text" || !fd?.type) && /\b(cpf|cnpj)\b/i.test(String(fd?.label || ""));

/** Telefone: +55 sempre fixo na frente; guarda "55" + DDD + número. */
export function PhoneInput({ value, onChange, className }) {
  let d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  const show = d.length > 2 ? `(${d.slice(0, 2)}) ${d.length > 10 ? `${d.slice(2, 7)}-${d.slice(7, 11)}` : d.length > 6 ? `${d.slice(2, 6)}-${d.slice(6, 10)}` : d.slice(2)}` : d;
  return (
    <span className={`crm-phone ${className || ""}`}>
      <span className="crm-phone-cc">+55</span>
      <input value={show} inputMode="tel" placeholder="(61) 99999-9999"
        onChange={(e) => { let n = e.target.value.replace(/\D/g, ""); if (n.startsWith("55") && n.length > 11) n = n.slice(2); n = n.slice(0, 11); onChange(n ? `55${n}` : ""); }} />
    </span>
  );
}
