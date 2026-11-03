import React, { useEffect, useState } from "react";
import { getCannedResponses, crm } from "../api.js";

let cache = null;
/** Todas as respostas prontas da empresa: as do chat (/atalho) e as do CRM, numa lista só. */
export function loadQuickReplies() {
  if (!cache) cache = Promise.all([getCannedResponses().catch(() => []), crm.pipelines().catch(() => [])]).then(([c, p]) => {
    const out = (c || []).map((r) => ({ id: `c-${r.id}`, code: r.shortCode || "", title: r.shortCode ? `/${r.shortCode}` : "Resposta", text: r.content || "" }));
    for (const pipe of p || []) for (const m of pipe.messages || []) out.push({ id: `m-${pipe.id}-${m.id}`, code: m.title.toLowerCase().replace(/\s+/g, ""), title: m.title, text: m.text || "", files: m.files || [] });
    return out;
  }).finally(() => setTimeout(() => { cache = null; }, 60000));
  return cache;
}
export const fillVars = (t, name) => String(t || "").replace(/\{nome\}/g, String(name || "").trim().split(/\s+/)[0] || "").replace(/\{nome_completo\}/g, name || "");

/** Lista que abre ao digitar "/" (ou pelo botão) para escolher uma resposta pronta. */
export default function QuickReplies({ text, onPick, name, open: forceOpen, onClose }) {
  const [all, setAll] = useState([]);
  useEffect(() => { loadQuickReplies().then(setAll); }, []);
  const slash = /^\/\S*$/.test(String(text || "").trim());
  const open = forceOpen || slash;
  if (!open) return null;
  const q = slash ? String(text).trim().slice(1).toLowerCase() : "";
  const list = all.filter((r) => !q || r.code.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.text.toLowerCase().includes(q)).slice(0, 12);
  return (
    <div className="qr-pop">
      <div className="qr-h">Respostas prontas {forceOpen && <button type="button" onClick={onClose}>Fechar</button>}</div>
      {!list.length && <div className="qr-empty">{all.length ? "Nada com esse atalho." : "Nenhuma resposta pronta. Crie em Configurações → Respostas prontas."}</div>}
      {list.map((r) => (
        <button type="button" key={r.id} className="qr-item" onClick={() => onPick(fillVars(r.text, name), r)}>
          <strong>{r.title}</strong><span>{r.text}</span>
        </button>
      ))}
    </div>
  );
}
