import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RefreshCw, Send } from "lucide-react";
import { waTemplates } from "../api.js";
import { notify, askConfirm } from "../dialogs.js";
import { Sheet, Group, Row, Button } from "./ui.jsx";

const STATUS = { APPROVED: ["Aprovado", "#1e8e3e"], PENDING: ["Em análise", "#b26a00"], REJECTED: ["Rejeitado", "#c0392b"], PAUSED: ["Pausado", "#6e6e73"], DISABLED: ["Desativado", "#6e6e73"] };
const CATS = { UTILITY: "Utilidade", MARKETING: "Marketing", AUTHENTICATION: "Autenticação" };
const bodyOf = (t) => t.components?.find((c) => c.type === "BODY")?.text || "";
export const varsCount = (text) => (String(text || "").match(/\{\{\d+\}\}/g) || []).length;

function TplCard({ t, onDelete }) {
  const [label, color] = STATUS[t.status] || [t.status, "#6e6e73"];
  const header = t.components?.find((c) => c.type === "HEADER" && c.format === "TEXT")?.text;
  const footer = t.components?.find((c) => c.type === "FOOTER")?.text;
  const btns = t.components?.find((c) => c.type === "BUTTONS")?.buttons || [];
  return (
    <div className="wat-card">
      <div className="wat-top">
        <b>{t.name}</b>
        <span className="wat-tag" style={{ color, borderColor: color }}>{label}</span>
        <span className="wat-meta">{CATS[t.category] || t.category} · {t.language}</span>
        {onDelete && <button className="ch2-icon del" title="Apagar" onClick={() => onDelete(t)}><Trash2 size={14} /></button>}
      </div>
      <div className="wat-bubble">
        {header && <div className="wat-h">{header}</div>}
        <div style={{ whiteSpace: "pre-wrap" }}>{bodyOf(t)}</div>
        {footer && <div className="wat-f">{footer}</div>}
        {btns.length > 0 && <div className="wat-btns">{btns.map((b, i) => <span key={i}>{b.text}</span>)}</div>}
      </div>
      {t.rejected_reason && t.rejected_reason !== "NONE" && <div className="wat-rej">Motivo: {t.rejected_reason}</div>}
    </div>
  );
}

function NewTemplate({ channelId, onClose, onDone }) {
  const [f, setF] = useState({ name: "", category: "UTILITY", language: "pt_BR", header: "", body: "", footer: "", buttons: [] });
  const [ex, setEx] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const n = varsCount(f.body);
  const addVar = () => setF({ ...f, body: `${f.body}{{${n + 1}}}` });
  const save = async () => {
    setBusy(true);
    try { await waTemplates.create(channelId, { ...f, examples: ex }); notify("Template enviado para aprovação da Meta.", "success"); onDone(); }
    catch (e) { notify(e?.response?.data?.error || e.message, "error"); }
    setBusy(false);
  };
  return (
    <Sheet title="Novo template" subtitle="A Meta analisa e aprova em alguns minutos." onClose={onClose} width={560}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? "Enviando..." : "Enviar para aprovação"}</Button></>}>
      <Group title="Dados">
        <Row label="Nome"><input value={f.name} onChange={set("name")} placeholder="Ex: lembrete_pagamento" /></Row>
        <Row label="Categoria">
          <select value={f.category} onChange={set("category")}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Row>
        <Row label="Idioma">
          <select value={f.language} onChange={set("language")}><option value="pt_BR">Português (BR)</option><option value="en_US">Inglês (EUA)</option><option value="es">Espanhol</option></select>
        </Row>
      </Group>
      <Group title="Mensagem" hint="Use {{1}}, {{2}} para partes que mudam, como o nome do cliente.">
        <Row label="Título"><input value={f.header} onChange={set("header")} placeholder="Opcional" maxLength={60} /></Row>
        <Row label="Texto"><textarea rows={5} value={f.body} onChange={set("body")} placeholder="Olá {{1}}, sua parcela vence em {{2}}." maxLength={1024} /></Row>
        <Row label=""><button type="button" className="ch2-btn ghost" onClick={addVar}><Plus size={13} /> Variável</button></Row>
        {Array.from({ length: n }, (_, i) => (
          <Row key={i} label={`Exemplo {{${i + 1}}}`}><input value={ex[i] || ""} onChange={(e) => { const a = [...ex]; a[i] = e.target.value; setEx(a); }} placeholder={i === 0 ? "Maria" : "10/12"} /></Row>
        ))}
        <Row label="Rodapé"><input value={f.footer} onChange={set("footer")} placeholder="Opcional" maxLength={60} /></Row>
      </Group>
      <Group title="Botões" hint="Até 3. Resposta rápida ou link.">
        {f.buttons.map((b, i) => (
          <Row key={i} label={`Botão ${i + 1}`}>
            <div style={{ display: "flex", gap: 6, width: "100%" }}>
              <input value={b.text} onChange={(e) => { const a = [...f.buttons]; a[i] = { ...b, text: e.target.value }; setF({ ...f, buttons: a }); }} placeholder="Texto" maxLength={25} />
              <input value={b.url || ""} onChange={(e) => { const a = [...f.buttons]; a[i] = { ...b, url: e.target.value }; setF({ ...f, buttons: a }); }} placeholder="Link (opcional)" />
              <button type="button" className="ch2-icon del" onClick={() => setF({ ...f, buttons: f.buttons.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
            </div>
          </Row>
        ))}
        {f.buttons.length < 3 && <Row label=""><button type="button" className="ch2-btn ghost" onClick={() => setF({ ...f, buttons: [...f.buttons, { text: "" }] })}><Plus size={13} /> Botão</button></Row>}
      </Group>
    </Sheet>
  );
}

export default function WaTemplatesSheet({ channel, onClose }) {
  const [list, setList] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = () => { setList(null); waTemplates.list(channel.id).then(setList).catch((e) => { notify(e?.response?.data?.error || e.message, "error"); setList([]); }); };
  useEffect(load, [channel.id]);
  const del = async (t) => {
    if (!await askConfirm(`Apagar o template "${t.name}"? Ele some de todos os idiomas.`, { okText: "Apagar", danger: true })) return;
    try { await waTemplates.remove(channel.id, t.name); load(); } catch (e) { notify(e?.response?.data?.error || e.message, "error"); }
  };
  return (
    <>
      <Sheet title="Templates do WhatsApp" subtitle={`${channel.name} · mensagens aprovadas pela Meta para iniciar conversas`} onClose={onClose} width={620}
        footer={<><Button variant="secondary" onClick={load}><RefreshCw size={14} /> Atualizar</Button><Button onClick={() => setAdding(true)}><Plus size={14} /> Novo template</Button></>}>
        {list === null ? <div className="ch2-empty">Carregando...</div>
          : list.length === 0 ? <div className="ch2-empty">Nenhum template ainda. Crie o primeiro.</div>
          : <div className="wat-list">{list.map((t) => <TplCard key={t.id} t={t} onDelete={del} />)}</div>}
      </Sheet>
      {adding && <NewTemplate channelId={channel.id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </>
  );
}

/** Enviar um template aprovado na conversa (usado no chat). */
export function SendTemplateSheet({ conversation, channelId, onClose, onSent }) {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [vars, setVars] = useState({ header: [], body: [] });
  const [busy, setBusy] = useState(false);
  useEffect(() => { waTemplates.list(channelId).then((l) => setList(l.filter((t) => t.status === "APPROVED"))).catch(() => setList([])); }, [channelId]);
  const header = sel?.components?.find((c) => c.type === "HEADER" && c.format === "TEXT")?.text || "";
  const body = sel ? bodyOf(sel) : "";
  const preview = useMemo(() => body.replace(/\{\{(\d+)\}\}/g, (m, i) => vars.body[i - 1] || m), [body, vars]);
  const send = async () => {
    setBusy(true);
    try { await waTemplates.send(conversation.id, { name: sel.name, language: sel.language, vars }); notify("Template enviado.", "success"); onSent?.(); onClose(); }
    catch (e) { notify(e?.response?.data?.error || e.message, "error"); }
    setBusy(false);
  };
  return (
    <Sheet title="Enviar template" subtitle="Use para iniciar ou retomar conversa depois de 24h sem resposta do cliente." onClose={onClose} width={560}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={send} disabled={!sel || busy}><Send size={14} /> {busy ? "Enviando..." : "Enviar"}</Button></>}>
      {list === null ? <div className="ch2-empty">Carregando...</div>
        : list.length === 0 ? <div className="ch2-empty">Nenhum template aprovado. Crie em Canais → Templates.</div>
        : (
          <Group title="Template">
            <Row label="Escolha">
              <select value={sel ? `${sel.name}|${sel.language}` : ""} onChange={(e) => { setSel(list.find((t) => `${t.name}|${t.language}` === e.target.value) || null); setVars({ header: [], body: [] }); }}>
                <option value="">Selecione...</option>
                {list.map((t) => <option key={t.id} value={`${t.name}|${t.language}`}>{t.name} ({t.language})</option>)}
              </select>
            </Row>
            {Array.from({ length: varsCount(header) }, (_, i) => (
              <Row key={`h${i}`} label={`Título {{${i + 1}}}`}><input value={vars.header[i] || ""} onChange={(e) => { const a = [...vars.header]; a[i] = e.target.value; setVars({ ...vars, header: a }); }} /></Row>
            ))}
            {Array.from({ length: varsCount(body) }, (_, i) => (
              <Row key={`b${i}`} label={`{{${i + 1}}}`}><input value={vars.body[i] || ""} onChange={(e) => { const a = [...vars.body]; a[i] = e.target.value; setVars({ ...vars, body: a }); }} placeholder={i === 0 ? conversation.name || "" : ""} /></Row>
            ))}
          </Group>
        )}
      {sel && <div className="wat-bubble" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{header && <div className="wat-h">{header}</div>}{preview}</div>}
    </Sheet>
  );
}
