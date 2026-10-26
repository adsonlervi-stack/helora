import React, { useEffect, useRef, useState } from "react";

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
export function SelectField({ fd, value, onChange, custom, className }) {
  const opts = fieldOptions(fd, custom);
  const v = value ?? "";
  const outside = !!v && !opts.includes(v);
  const [typing, setTyping] = useState(fd.free && outside);
  const inputRef = useRef(null);
  useEffect(() => { if (fd.free && outside) setTyping(true); }, [outside, fd.free]);

  if (typing) {
    return (
      <span className={`crm-free ${className || ""}`}>
        <input ref={inputRef} value={v} onChange={(e) => onChange(e.target.value)} placeholder={`Escreva ${fd.label.toLowerCase()}`} />
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
      {fd.free && <option value={OTHER}>✏️ Outra (escrever)…</option>}
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
