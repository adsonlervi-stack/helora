import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, RefreshCw, Send, Pencil, Copy, Image as ImageIc, Video, FileText, Paperclip, Link2, Phone, Reply, Ticket } from "lucide-react";
import { waTemplates } from "../api.js";
import { notify, askConfirm } from "../dialogs.js";
import { Sheet, Group, Row, Button } from "./ui.jsx";

const STATUS = { APPROVED: ["Aprovado", "#1e8e3e"], PENDING: ["Em análise", "#b26a00"], REJECTED: ["Rejeitado", "#c0392b"], PAUSED: ["Pausado", "#6e6e73"], DISABLED: ["Desativado", "#6e6e73"], IN_APPEAL: ["Em recurso", "#b26a00"] };
const CATS = { UTILITY: "Utilidade", MARKETING: "Marketing", AUTHENTICATION: "Autenticação" };
const LANGS = { pt_BR: "Português (BR)", en_US: "Inglês (EUA)", es: "Espanhol" };
const HEAD = { NONE: "Sem título", TEXT: "Texto", IMAGE: "Imagem", VIDEO: "Vídeo", DOCUMENT: "Documento" };
const MEDIA = ["IMAGE", "VIDEO", "DOCUMENT"];
const ACCEPT = { IMAGE: "image/jpeg,image/png", VIDEO: "video/mp4", DOCUMENT: "application/pdf" };
const BTN = { quick: ["Resposta rápida", Reply], url: ["Link", Link2], phone: ["Ligar", Phone], code: ["Copiar código", Ticket] };
export const SOURCES = { first: "Primeiro nome do cliente", name: "Nome completo do cliente", phone: "Telefone do cliente", fixed: "Texto que eu digitar" };
const err = (e) => e?.response?.data?.error || e?.message || "Erro";
export const varsCount = (t) => (String(t || "").match(/\{\{\d+\}\}/g) || []).length;
const comp = (t, type) => t?.components?.find((c) => c.type === type);

/** Modelos prontos para começar rápido. */
const LIBRARY = [
  { name: "boas_vindas", category: "MARKETING", body: "Olá {{1}}! Obrigado pelo contato com a {{2}}. Como podemos ajudar você hoje?", examples: ["Maria", "Helora"], buttons: [{ type: "quick", text: "Quero uma cotação" }, { type: "quick", text: "Falar com atendente" }] },
  { name: "lembrete_pagamento", category: "UTILITY", body: "Olá {{1}}, a parcela {{2}} do seu seguro vence em {{3}}. Segue o boleto em anexo.", examples: ["Maria", "3/12", "10/12"], headerType: "DOCUMENT", buttons: [{ type: "quick", text: "Já paguei" }] },
  { name: "renovacao_seguro", category: "MARKETING", body: "Oi {{1}}! Seu seguro {{2}} vence em {{3}}. Quer que a gente prepare a renovação com as melhores condições?", examples: ["Maria", "auto", "15/01"], buttons: [{ type: "quick", text: "Sim, quero renovar" }, { type: "quick", text: "Agora não" }] },
  { name: "retomar_conversa", category: "UTILITY", body: "Olá {{1}}, tudo bem? Estamos retomando seu atendimento. Podemos continuar?", examples: ["Maria"], buttons: [{ type: "quick", text: "Sim" }, { type: "quick", text: "Mais tarde" }] },
  { name: "proposta_enviada", category: "UTILITY", body: "{{1}}, sua proposta está pronta! Confira os detalhes no arquivo e fale com a gente se tiver dúvidas.", examples: ["Maria"], headerType: "DOCUMENT", buttons: [{ type: "url", text: "Ver proposta", url: "https://exemplo.com/{{1}}", example: "123" }] },
  { name: "cupom_desconto", category: "MARKETING", body: "Oi {{1}}! Preparamos um desconto especial para você. Use o código abaixo.", examples: ["Maria"], headerType: "IMAGE", buttons: [{ type: "code", example: "DESC10" }] }
];

/** Converte um template da Meta de volta para o formulário (para editar ou duplicar). */
function toForm(t) {
  const h = comp(t, "HEADER"), b = comp(t, "BODY"), f = comp(t, "FOOTER");
  return {
    name: t.name, category: t.category, language: t.language,
    headerType: h ? h.format : "NONE", header: h?.format === "TEXT" ? h.text : "", headerExample: h?.example?.header_text?.[0] || "", headerSample: "",
    body: b?.text || "", examples: b?.example?.body_text?.[0] || [], footer: f?.text || "",
    buttons: (comp(t, "BUTTONS")?.buttons || []).map((x) => x.type === "URL" ? { type: "url", text: x.text, url: x.url, example: (x.example?.[0] || "").split("/").pop() } : x.type === "PHONE_NUMBER" ? { type: "phone", text: x.text, phone: x.phone_number } : x.type === "COPY_CODE" ? { type: "code", example: x.example || "" } : { type: "quick", text: x.text })
  };
}

/** Prévia em balão do WhatsApp. */
function Bubble({ f, fill }) {
  const fillT = (t, list) => (fill ? String(t || "").replace(/\{\{(\d+)\}\}/g, (m, i) => list?.[i - 1] || m) : t);
  const Ic = { IMAGE: ImageIc, VIDEO: Video, DOCUMENT: FileText }[f.headerType];
  return (
    <div className="wat-bubble">
      {MEDIA.includes(f.headerType) && (
        <div className="wat-media">{f.mediaUrl && f.headerType === "IMAGE" ? <img src={f.mediaUrl} alt="" /> : <><Ic size={22} /><span>{f.mediaName || HEAD[f.headerType]}</span></>}</div>
      )}
      {f.headerType === "TEXT" && f.header && <div className="wat-h">{fillT(f.header, fill?.header)}</div>}
      <div style={{ whiteSpace: "pre-wrap" }}>{fillT(f.body, fill?.body) || <span className="wat-muted">Texto da mensagem</span>}</div>
      {f.footer && <div className="wat-f">{f.footer}</div>}
      {f.buttons?.length > 0 && <div className="wat-btns">{f.buttons.map((b, i) => { const [l, I] = BTN[b.type] || BTN.quick; return <span key={i}><I size={13} /> {b.type === "code" ? "Copiar código" : b.text || l}</span>; })}</div>}
    </div>
  );
}

function FilePick({ accept, onDone, label = "Escolher arquivo" }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={ref} type="file" accept={accept} hidden onChange={async (e) => {
        const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
        setBusy(true); try { const r = await waTemplates.upload(file); onDone({ url: r.url, name: r.name }); } catch (x) { notify(err(x), "error"); } setBusy(false);
      }} />
      <button type="button" className="ch2-btn ghost" onClick={() => ref.current.click()} disabled={busy}><Paperclip size={13} /> {busy ? "Enviando..." : label}</button>
    </>
  );
}

/** Criar ou editar template. */
function Editor({ channelId, initial, editId, onClose, onDone }) {
  const [f, setF] = useState(() => ({ name: "", category: "UTILITY", language: "pt_BR", headerType: "NONE", header: "", headerExample: "", headerSample: "", body: "", examples: [], footer: "", buttons: [], ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef();
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const n = varsCount(f.body);
  const insertVar = () => {
    const el = bodyRef.current, pos = el?.selectionStart ?? f.body.length, tag = `{{${n + 1}}}`;
    up("body", f.body.slice(0, pos) + tag + f.body.slice(pos));
    setTimeout(() => { el?.focus(); el?.setSelectionRange(pos + tag.length, pos + tag.length); }, 0);
  };
  const setBtn = (i, patch) => up("buttons", f.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const save = async () => {
    setBusy(true);
    try {
      const d = { ...f, header: f.headerType === "TEXT" ? f.header : "", headerSample: MEDIA.includes(f.headerType) ? f.headerSample : "" };
      if (editId) await waTemplates.update(channelId, editId, d); else await waTemplates.create(channelId, d);
      notify(editId ? "Alterações enviadas para nova análise da Meta." : "Template enviado para aprovação da Meta.", "success");
      onDone();
    } catch (e) { notify(err(e), "error"); }
    setBusy(false);
  };
  return (
    <Sheet title={editId ? "Editar template" : "Novo template"} subtitle="A Meta analisa e aprova, normalmente em minutos." onClose={onClose} width={900}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? "Enviando..." : editId ? "Salvar e reenviar" : "Enviar para aprovação"}</Button></>}>
      <div className="wat-editor">
        <div className="wat-form">
          {!editId && !initial?.name && (
            <Group title="Começar de um modelo">
              <div className="wat-lib">{LIBRARY.map((m) => <button key={m.name} type="button" onClick={() => setF((p) => ({ ...p, ...m, headerType: m.headerType || "NONE" }))}>{m.name.replace(/_/g, " ")}</button>)}</div>
            </Group>
          )}
          <Group title="Dados">
            <Row label="Nome"><input value={f.name} disabled={!!editId} onChange={(e) => up("name", e.target.value)} placeholder="lembrete_pagamento" /></Row>
            <Row label="Categoria"><select value={f.category} disabled={!!editId} onChange={(e) => up("category", e.target.value)}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Row>
            <Row label="Idioma"><select value={f.language} disabled={!!editId} onChange={(e) => up("language", e.target.value)}>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Row>
          </Group>
          <Group title="Título" hint={MEDIA.includes(f.headerType) ? "O arquivo aqui é só um exemplo para a Meta. Em cada envio você escolhe o anexo." : ""}>
            <Row label="Tipo"><select value={f.headerType} onChange={(e) => up("headerType", e.target.value)}>{Object.entries(HEAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Row>
            {f.headerType === "TEXT" && <>
              <Row label="Texto"><input value={f.header} maxLength={60} onChange={(e) => up("header", e.target.value)} placeholder="Ex: Olá {{1}}" /></Row>
              {varsCount(f.header) > 0 && <Row label="Exemplo {{1}}"><input value={f.headerExample} onChange={(e) => up("headerExample", e.target.value)} /></Row>}
            </>}
            {MEDIA.includes(f.headerType) && (
              <Row label="Exemplo">
                <div className="wat-inline">
                  <FilePick accept={ACCEPT[f.headerType]} onDone={(r) => setF((p) => ({ ...p, headerSample: r.url, mediaUrl: r.url, mediaName: r.name }))} label={f.headerSample ? "Trocar arquivo" : "Escolher arquivo"} />
                  {f.mediaName && <span className="wat-muted">{f.mediaName}</span>}
                </div>
              </Row>
            )}
          </Group>
          <Group title="Mensagem" hint="Variáveis ({{1}}, {{2}}) mudam em cada envio: nome do cliente, data, valor.">
            <Row label="Texto"><textarea ref={bodyRef} rows={6} maxLength={1024} value={f.body} onChange={(e) => up("body", e.target.value)} placeholder="Olá {{1}}, sua parcela vence em {{2}}." /></Row>
            <Row label=""><button type="button" className="ch2-btn ghost" onClick={insertVar}><Plus size={13} /> Inserir variável</button></Row>
            {Array.from({ length: n }, (_, i) => (
              <Row key={i} label={`Exemplo {{${i + 1}}}`}><input value={f.examples[i] || ""} onChange={(e) => { const a = [...f.examples]; a[i] = e.target.value; up("examples", a); }} placeholder={["Maria", "10/12", "R$ 150,00"][i] || ""} /></Row>
            ))}
            <Row label="Rodapé"><input value={f.footer} maxLength={60} onChange={(e) => up("footer", e.target.value)} placeholder="Opcional" /></Row>
          </Group>
          <Group title="Botões" hint="Até 10. Link pode terminar com {{1}} para mudar em cada envio.">
            {f.buttons.map((b, i) => (
              <div key={i} className="wat-btnrow">
                <select value={b.type} onChange={(e) => setBtn(i, { type: e.target.value })}>{Object.entries(BTN).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
                {b.type !== "code" && <input value={b.text || ""} maxLength={25} onChange={(e) => setBtn(i, { text: e.target.value })} placeholder="Texto do botão" />}
                {b.type === "url" && <input value={b.url || ""} onChange={(e) => setBtn(i, { url: e.target.value })} placeholder="https://site.com/{{1}}" />}
                {b.type === "url" && varsCount(b.url) > 0 && <input value={b.example || ""} onChange={(e) => setBtn(i, { example: e.target.value })} placeholder="Exemplo do {{1}}" />}
                {b.type === "phone" && <input value={b.phone || ""} onChange={(e) => setBtn(i, { phone: e.target.value })} placeholder="5561999999999" />}
                {b.type === "code" && <input value={b.example || ""} onChange={(e) => setBtn(i, { example: e.target.value })} placeholder="Código de exemplo" />}
                <button type="button" className="ch2-icon del" onClick={() => up("buttons", f.buttons.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
              </div>
            ))}
            {f.buttons.length < 10 && <Row label=""><button type="button" className="ch2-btn ghost" onClick={() => up("buttons", [...f.buttons, { type: "quick", text: "" }])}><Plus size={13} /> Botão</button></Row>}
          </Group>
        </div>
        <div className="wat-side"><div className="wat-side-t">Prévia</div><Bubble f={{ ...f, mediaUrl: f.mediaUrl || f.headerSample }} fill={{ header: [f.headerExample], body: f.examples }} /></div>
      </div>
    </Sheet>
  );
}

function TplCard({ t, onEdit, onCopy, onDelete }) {
  const [label, color] = STATUS[t.status] || [t.status, "#6e6e73"];
  const f = toForm(t);
  return (
    <div className="wat-card">
      <div className="wat-top">
        <b>{t.name}</b>
        <span className="wat-tag" style={{ color, borderColor: color }}>{label}</span>
        <span className="wat-meta">{CATS[t.category] || t.category} · {LANGS[t.language] || t.language}</span>
        <span className="ch2-sp" />
        <button className="ch2-icon" title="Editar" onClick={() => onEdit(t)}><Pencil size={14} /></button>
        <button className="ch2-icon" title="Duplicar" onClick={() => onCopy(t)}><Copy size={14} /></button>
        <button className="ch2-icon del" title="Apagar" onClick={() => onDelete(t)}><Trash2 size={14} /></button>
      </div>
      <Bubble f={f} />
      {t.rejected_reason && t.rejected_reason !== "NONE" && <div className="wat-rej">Motivo da rejeição: {t.rejected_reason}</div>}
    </div>
  );
}

export default function WaTemplatesSheet({ channel, onClose }) {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null); // { initial, editId }
  const [q, setQ] = useState("");
  const load = () => { setList(null); waTemplates.list(channel.id).then(setList).catch((e) => { notify(err(e), "error"); setList([]); }); };
  useEffect(load, [channel.id]);
  const del = async (t) => {
    if (!await askConfirm(`Apagar o template "${t.name}"? Ele some em todos os idiomas.`, { okText: "Apagar", danger: true })) return;
    try { await waTemplates.remove(channel.id, t.name); load(); } catch (e) { notify(err(e), "error"); }
  };
  const shown = (list || []).filter((t) => t.name.includes(q.toLowerCase()));
  return (
    <>
      <Sheet title="Templates do WhatsApp" subtitle={`${channel.name} · mensagens aprovadas pela Meta`} onClose={onClose} width={680}
        footer={<><Button variant="secondary" onClick={load}><RefreshCw size={14} /> Atualizar</Button><Button onClick={() => setEdit({})}><Plus size={14} /> Novo template</Button></>}>
        {list?.length > 4 && <input className="wat-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar template" />}
        {list === null ? <div className="ch2-empty">Carregando...</div>
          : !shown.length ? <div className="ch2-empty">Nenhum template ainda. Crie o primeiro ou comece de um modelo pronto.</div>
          : <div className="wat-list">{shown.map((t) => <TplCard key={t.id} t={t} onDelete={del} onEdit={(x) => setEdit({ initial: toForm(x), editId: x.id })} onCopy={(x) => setEdit({ initial: { ...toForm(x), name: `${x.name}_copia` } })} />)}</div>}
      </Sheet>
      {edit && <Editor channelId={channel.id} initial={edit.initial} editId={edit.editId} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </>
  );
}

/* ---------- Variáveis: ligar cada {{n}} a um dado do cliente ---------- */
const keyOf = (t) => `${t.name}|${t.language}`;
function emptyMap(t, saved) {
  const h = comp(t, "HEADER"), b = comp(t, "BODY");
  const base = {
    header: Array.from({ length: h?.format === "TEXT" ? varsCount(h.text) : 0 }, () => ({ type: "fixed", value: "" })),
    body: Array.from({ length: varsCount(b?.text) }, (_, i) => ({ type: "fixed", value: i === 0 ? "{primeiro_nome}" : "" })),
    buttons: {}
  };
  (comp(t, "BUTTONS")?.buttons || []).forEach((x, i) => { if ((x.type === "URL" && varsCount(x.url)) || x.type === "COPY_CODE") base.buttons[i] = { type: "fixed", value: "" }; });
  if (saved) {
    base.header = base.header.map((m, i) => saved.header?.[i] || m);
    base.body = base.body.map((m, i) => saved.body?.[i] || m);
    for (const k of Object.keys(base.buttons)) if (saved.buttons?.[k]) base.buttons[k] = saved.buttons[k];
  }
  return base;
}
export function resolveVar(m, r) {
  if (!m) return "";
  const first = (r?.name || "").trim().split(/\s+/)[0] || "";
  if (m.type === "first") return first;
  if (m.type === "name") return r?.name || "";
  if (m.type === "phone") return r?.phone || "";
  return String(m.value || "").replace(/\{primeiro_nome\}/gi, first).replace(/\{nome_completo\}/gi, r?.name || "").replace(/\{telefone\}/gi, r?.phone || "").replace(/\{nome\}/gi, first);
}
export const TOKENS = [["primeiro_nome", "Primeiro nome"], ["nome_completo", "Nome completo"], ["telefone", "Telefone"]];

function VarRow({ label, m, onChange, who }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef();
  const val = m.type === "fixed" ? m.value || "" : `{${m.type === "first" ? "primeiro_nome" : m.type === "name" ? "nome_completo" : "telefone"}}`;
  const put = (v) => onChange({ type: "fixed", value: v });
  const insert = (tok) => {
    const el = ref.current, pos = el?.selectionStart ?? val.length;
    const before = val.slice(0, pos).replace(/@$/, "");
    put(`${before}{${tok}}${val.slice(pos)}`); setMenu(false);
    setTimeout(() => el?.focus(), 0);
  };
  const shown = resolveVar({ type: "fixed", value: val }, who);
  return (
    <Row label={label}>
      <div className="wat-var">
        <input ref={ref} value={val} onChange={(e) => { put(e.target.value); setMenu(/@$/.test(e.target.value)); }} onBlur={() => setTimeout(() => setMenu(false), 150)} placeholder="Digite o texto ou @ para inserir um dado do cliente" />
        {menu && <div className="wat-var-menu">{TOKENS.map(([k, l]) => <button key={k} type="button" onMouseDown={(e) => { e.preventDefault(); insert(k); }}>{l}</button>)}</div>}
        {who && /\{/.test(val) && <small className="wat-muted">Vai como: {shown || "(vazio)"}</small>}
      </div>
    </Row>
  );
}

/** Editor de variáveis + anexo do envio. Usado no chat e nas campanhas. */
export function TemplateFill({ t, who, value, onChange, campaign }) {
  const h = comp(t, "HEADER"), btns = comp(t, "BUTTONS")?.buttons || [];
  const map = value.map;
  const setMap = (m) => onChange({ ...value, map: m });
  return (
    <>
      {MEDIA.includes(h?.format) && (
        <Group title={`Anexo (${HEAD[h.format].toLowerCase()})`} hint={campaign ? "O mesmo arquivo vai para todos." : "Sem trocar, vai o arquivo padrão do template."}>
          <label className="wat-toggle"><input type="checkbox" checked={!!value.customMedia} onChange={(e) => onChange({ ...value, customMedia: e.target.checked, headerMedia: e.target.checked ? value.headerMedia : null })} /> <span>Enviar outro arquivo<small>Só nesta mensagem. O padrão do template não muda.</small></span></label>
          {value.customMedia && <><Row label="Arquivo">
            <div className="wat-inline">
              <FilePick accept={ACCEPT[h.format]} label={value.headerMedia?.url ? "Trocar arquivo" : "Escolher arquivo"} onDone={(r) => onChange({ ...value, headerMedia: r })} />
              {value.headerMedia?.name && <span className="wat-muted">{value.headerMedia.name}</span>}
            </div>
          </Row>
          <Row label="ou link"><input value={value.headerMedia?.url || ""} onChange={(e) => onChange({ ...value, headerMedia: { url: e.target.value, name: e.target.value.split("/").pop() } })} placeholder="https://..." /></Row></>}
        </Group>
      )}
      {(map.header.length + map.body.length + Object.keys(map.buttons).length) > 0 && (
        <Group title="Variáveis" hint="Digite @ para inserir nome ou telefone do cliente. Fica salvo para os próximos envios.">
          {map.header.map((m, i) => <VarRow key={`h${i}`} label={`Título {{${i + 1}}}`} m={m} who={who} onChange={(x) => setMap({ ...map, header: map.header.map((y, j) => (j === i ? x : y)) })} />)}
          {map.body.map((m, i) => <VarRow key={`b${i}`} label={`{{${i + 1}}}`} m={m} who={who} onChange={(x) => setMap({ ...map, body: map.body.map((y, j) => (j === i ? x : y)) })} />)}
          {Object.entries(map.buttons).map(([k, m]) => <VarRow key={`k${k}`} label={btns[k]?.type === "COPY_CODE" ? "Código" : `Link: ${btns[k]?.text}`} m={m} who={who} onChange={(x) => setMap({ ...map, buttons: { ...map.buttons, [k]: x } })} />)}
        </Group>
      )}
    </>
  );
}
export const fillVars = (map, who, headerMedia) => ({
  header: map.header.map((m) => resolveVar(m, who)),
  body: map.body.map((m) => resolveVar(m, who)),
  buttons: Object.fromEntries(Object.entries(map.buttons).map(([k, m]) => [k, resolveVar(m, who)])),
  headerMedia: headerMedia?.url ? { ...headerMedia, kind: headerMedia.kind } : undefined
});

/** Seletor de template aprovado + variáveis. onReady recebe { tpl, map, headerMedia }. */
export function useTemplatePicker(channelId) {
  const [list, setList] = useState(null);
  const [maps, setMaps] = useState({});
  useEffect(() => {
    if (!channelId) return;
    setList(null);
    waTemplates.list(channelId).then((l) => setList(l.filter((t) => t.status === "APPROVED"))).catch(() => setList([]));
    waTemplates.maps().then(setMaps);
  }, [channelId]);
  return { list, maps };
}

const favKey = "helora_tpl_favs";
const readFavs = () => { try { return JSON.parse(localStorage.getItem(favKey) || "[]"); } catch { return []; } };

export function TemplateChooser({ channelId, who, value, onChange, campaign, wide }) {
  const { list, maps } = useTemplatePicker(channelId);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [favs, setFavs] = useState(readFavs);
  const toggleFav = (k) => { const n = favs.includes(k) ? favs.filter((x) => x !== k) : [...favs, k]; setFavs(n); try { localStorage.setItem(favKey, JSON.stringify(n)); } catch {} };
  const sel = list?.find((t) => keyOf(t) === value?.key);
  const choose = (t) => {
    const head = comp(t, "HEADER");
    onChange({ key: keyOf(t), tpl: t, map: emptyMap(t, maps[keyOf(t)]), headerMedia: null, customMedia: false, kind: MEDIA.includes(head?.format) ? head.format.toLowerCase() : null });
  };
  if (list === null) return <div className="ch2-empty">Carregando templates...</div>;
  if (!list.length) return <div className="ch2-empty">Nenhum template aprovado neste número. Crie em Canais → Templates.</div>;
  const shown = list.filter((t) => (tab === "all" || favs.includes(keyOf(t))) && t.name.includes(q.toLowerCase().replace(/\s+/g, "_")));

  if (wide) return (
    <div className="wat-wide">
      <div className="wat-wide-l">
        <div className="wat-wide-bar">
          <input className="wat-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar template" autoFocus />
          <button type="button" className={`wat-wide-chip ${tab === "all" ? "on" : ""}`} onClick={() => setTab("all")}>Todos {list.length}</button>
          <button type="button" className={`wat-wide-chip ${tab === "fav" ? "on" : ""}`} onClick={() => setTab("fav")}>★ Favoritos</button>
        </div>
        <div className="wat-wide-grid">
          {shown.map((t) => {
            const btns = comp(t, "BUTTONS")?.buttons || [];
            return (
              <div key={t.id} className={`wat-card ${sel && keyOf(sel) === keyOf(t) ? "on" : ""}`} onClick={() => choose(t)}>
                <div className="wat-card-h"><b>{t.name}</b><button type="button" className={`wat-star ${favs.includes(keyOf(t)) ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); toggleFav(keyOf(t)); }}>★</button></div>
                <small>{CATS[t.category] || t.category} · {LANGS[t.language] || t.language}{MEDIA.includes(comp(t, "HEADER")?.format) ? ` · ${HEAD[comp(t, "HEADER").format]}` : ""}</small>
                <p>{comp(t, "BODY")?.text}</p>
                {btns.slice(0, 2).map((x, i) => <span key={i} className="wat-card-btn">↳ {x.text}</span>)}
              </div>
            );
          })}
          {!shown.length && <div className="ch2-empty">{tab === "fav" ? "Marque a estrela dos templates que você mais usa." : "Nenhum template encontrado."}</div>}
        </div>
      </div>
      <div className="wat-wide-r">
        {sel && value ? (
          <>
            <div className="wat-side-t">Como o cliente vai ver</div>
            <div className="wat-wide-prev"><Bubble f={{ ...toForm(sel), mediaUrl: value.headerMedia?.url || comp(sel, "HEADER")?.example?.header_handle?.[0], mediaName: value.headerMedia?.name }} fill={fillVars(value.map, who || { name: "Maria Silva", phone: "5561999999999" })} /></div>
            <TemplateFill t={sel} who={who} value={value} onChange={onChange} campaign={campaign} />
          </>
        ) : <div className="wat-wide-empty">Escolha um template ao lado para ver como o cliente vai receber.</div>}
      </div>
    </div>
  );  return (
    <>
      {!sel ? (
        <div className="wat-pick">
          <input className="wat-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar template" autoFocus />
          <div className="wat-tabs">
            <button type="button" className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>Todos <span>{list.length}</span></button>
            <button type="button" className={tab === "fav" ? "on" : ""} onClick={() => setTab("fav")}>Favoritos <span>{favs.filter((k) => list.some((t) => keyOf(t) === k)).length}</span></button>
          </div>
          <div className="wat-pick-list">
            {shown.map((t) => (
              <div key={t.id} className="wat-pick-row" onClick={() => choose(t)}>
                <div><b>{t.name}</b><small>{CATS[t.category] || t.category} · {LANGS[t.language] || t.language}{MEDIA.includes(comp(t, "HEADER")?.format) ? ` · ${HEAD[comp(t, "HEADER").format]}` : ""}</small><p>{comp(t, "BODY")?.text}</p></div>
                <button type="button" className={`wat-star ${favs.includes(keyOf(t)) ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); toggleFav(keyOf(t)); }}>★</button>
              </div>
            ))}
            {!shown.length && <div className="ch2-empty">{tab === "fav" ? "Marque a estrela dos templates que você mais usa." : "Nenhum template encontrado."}</div>}
          </div>
        </div>
      ) : (
        <div className="wat-chosen"><b>{sel.name}</b><span>{CATS[sel.category]}</span><button type="button" className="ch2-btn ghost" onClick={() => onChange(null)}>Trocar</button></div>
      )}
      {sel && value && <TemplateFill t={sel} who={who} value={value} onChange={onChange} campaign={campaign} />}
      {sel && value && (
        <div className="wat-preview"><div className="wat-side-t">Prévia</div>
          <Bubble f={{ ...toForm(sel), mediaUrl: value.headerMedia?.url || comp(sel, "HEADER")?.example?.header_handle?.[0], mediaName: value.headerMedia?.name }} fill={fillVars(value.map, who || { name: "Maria Silva", phone: "5561999999999" })} />
        </div>
      )}
    </>
  );
}

/** Enviar template na conversa. */
export function SendTemplateSheet({ conversation, channelId, onClose, onSent }) {
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const who = { name: conversation.name || conversation.pushName || "", phone: String(conversation.externalId || "").split("@")[0].split(":")[0] };
  const send = async () => {
    setBusy(true);
    try {
      await waTemplates.send(conversation.id, { name: v.tpl.name, language: v.tpl.language, vars: fillVars(v.map, who, v.headerMedia && { ...v.headerMedia, kind: v.kind }) });
      waTemplates.saveMap(v.key, v.map).catch(() => {});
      notify("Template enviado.", "success"); onSent?.(); onClose();
    } catch (e) { notify(err(e), "error"); }
    setBusy(false);
  };
  return (
    <Sheet title="Enviar template" subtitle="Para iniciar conversa ou falar depois de 24h sem resposta do cliente." onClose={onClose} width={620}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={send} disabled={!v || busy}><Send size={14} /> {busy ? "Enviando..." : "Enviar"}</Button></>}>
      <TemplateChooser channelId={channelId} who={who} value={v} onChange={setV} />
    </Sheet>
  );
}
