import React, { useEffect, useRef, useState } from "react";
import {
  Sparkles, Send, Image as ImageIcon, Palette, Workflow, Copy, Plus, Trash2, Bot, Brain, FileText, Link2, Upload, RefreshCw,
  MessageCircle, Mail, Globe, Table, Search, X, Eye, Smartphone
} from "lucide-react";
import { integrations, aiPrompts, getDepartments } from "../api.js";
import { Sheet, Group, Row, Switch, Button } from "./ui.jsx";
import { askConfirm, notify } from "../dialogs.js";

const errText = (e) => e?.response?.data?.error || e?.message || "Erro";
const copy = (t) => { navigator.clipboard?.writeText(t); notify("Copiado.", "success"); };

/** IA Helora: criar conteúdo, atendentes IA nos canais e o cérebro da empresa. */
export default function IaHeloraPage({ isManager, onGo }) {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("ia") || "criar");
  const [status, setStatus] = useState(null);
  useEffect(() => { integrations.list().then(setStatus).catch(() => setStatus({})); }, []);
  const noAI = status && !status.activeAI;
  return (
    <div className="page ih-page">
      <div className="ih-head">
        <div className="ih-title"><span className="ih-orb"><Sparkles size={20} /></span><div><h2>IA Helora</h2><p>Cria para a sua empresa, atende os clientes e aprende com o que você ensina.</p></div></div>
        <div className="ih-tabs">
          {[["criar", "Criar", Sparkles], ["atendentes", "Atendentes IA", Bot], ["cerebro", "Cérebro", Brain]].map(([k, l, I]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><I size={15} /> {l}</button>
          ))}
        </div>
      </div>
      {noAI && (
        <div className="ih-warn">Nenhuma IA conectada ainda. {isManager ? <>Conecte o <b>ChatGPT</b>, o <b>Claude</b> ou o <b>Gemini</b> na aba <button className="lp-link" onClick={() => onGo?.("connections")}>Conexões</button>.</> : "Peça ao gestor para conectar uma IA na aba Conexões."}</div>
      )}
      {tab === "criar" && <Studio canva={!!status?.integrations?.canva?.connected} isManager={isManager} />}
      {tab === "atendentes" && <Attendants isManager={isManager} />}
      {tab === "cerebro" && <BrainTab isManager={isManager} />}
    </div>
  );
}

// ------------------------------------------------------------ Criar (estúdio)
const IDEAS = [
  "Crie 3 posts para o Instagram sobre a importância do seguro de vida",
  "Escreva uma mensagem de WhatsApp para lembrar a renovação do seguro auto",
  "Monte um roteiro de vídeo curto (Reels) explicando o que é franquia",
  "Escreva um e-mail de boas-vindas para um cliente novo",
  "Crie uma proposta comercial resumida para um seguro empresarial",
  "Liste 10 ideias de conteúdo para o mês"
];

function Studio({ canva, isManager }) {
  const [chats, setChats] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(null);
  const [size, setSize] = useState("post");
  const endRef = useRef(null);
  const loadChats = () => integrations.studioChats().then(setChats).catch(() => {});
  useEffect(() => { loadChats(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  const open = async (id) => { try { const c = await integrations.studioChat(id); setChatId(c.id); setMsgs(c.messages || []); } catch (e) { notify(errText(e), "error"); } };
  const fresh = () => { setChatId(null); setMsgs([]); setText(""); };

  const send = async (t = text) => {
    const q = String(t).trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user", content: q }];
    setMsgs(next); setText(""); setBusy("chat");
    try {
      const r = await integrations.studioSend({ chatId, messages: next.filter((m) => !m.kind).map(({ role, content }) => ({ role, content })) });
      setMsgs([...next, { role: "assistant", content: r.reply }]);
      if (r.chatId && r.chatId !== chatId) { setChatId(r.chatId); loadChats(); }
    } catch (e) { setMsgs([...next, { role: "assistant", content: `⚠️ ${errText(e)}`, kind: "error" }]); }
    setBusy(null);
  };
  const lastPrompt = () => text.trim() || [...msgs].reverse().find((m) => m.role === "user")?.content || "";
  const image = async () => {
    const p = lastPrompt();
    if (!p) return notify("Escreva o que a imagem deve mostrar.", "error");
    setBusy("image");
    try {
      const r = await integrations.studioImage(p, size === "story" ? "1024x1536" : size === "banner" ? "1536x1024" : "1024x1024");
      setMsgs((m) => [...m, ...(text.trim() ? [{ role: "user", content: `🖼️ ${text.trim()}`, kind: "image" }] : []), { role: "assistant", content: "Imagem pronta:", image: r.url, prompt: p, kind: "image" }]);
      setText("");
    } catch (e) { notify(errText(e), "error"); }
    setBusy(null);
  };
  const toCanva = async (imageUrl, title) => {
    setBusy("canva");
    try {
      const r = await integrations.studioCanva({ title: (title || lastPrompt() || "Arte da IA Helora").slice(0, 80), size, imageUrl });
      setMsgs((m) => [...m, { role: "assistant", content: `Design criado no Canva: **${r.title || "novo design"}**`, canvaUrl: r.editUrl, kind: "canva" }]);
      if (r.editUrl) window.open(r.editUrl, "_blank");
    } catch (e) { notify(errText(e), "error"); }
    setBusy(null);
  };
  const flow = async () => {
    const p = lastPrompt();
    if (!p) return notify("Descreva o atendimento: etapas, opções e quando passar para um atendente.", "error");
    setBusy("flow");
    try {
      const r = await integrations.studioFlow(p);
      setMsgs((m) => [...m, { role: "assistant", content: `Fluxo **${r.name}** criado com ${r.blocks} blocos, como rascunho (desligado). Abra a aba Fluxos para revisar e ativar.`, kind: "flow" }]);
      setText("");
    } catch (e) { notify(errText(e), "error"); }
    setBusy(null);
  };

  return (
    <div className="ih-studio">
      <aside className="ih-chats">
        <button className="ih-new" onClick={fresh}><Plus size={15} /> Nova conversa</button>
        {chats.map((c) => (
          <div key={c.id} className={`ih-chat ${chatId === c.id ? "on" : ""}`} onClick={() => open(c.id)}>
            <span>{c.title}</span>
            <button title="Apagar" onClick={async (e) => { e.stopPropagation(); if (await askConfirm("Apagar esta conversa?")) { await integrations.studioRemoveChat(c.id); if (chatId === c.id) fresh(); loadChats(); } }}><Trash2 size={13} /></button>
          </div>
        ))}
      </aside>
      <section className="ih-main">
        <div className="ih-msgs">
          {!msgs.length && (
            <div className="ih-empty">
              <span className="ih-orb big"><Sparkles size={28} /></span>
              <h3>O que vamos criar hoje?</h3>
              <p>Textos, posts, campanhas, e-mails, imagens, artes no Canva e fluxos de atendimento — usando o que a sua empresa ensinou no Cérebro.</p>
              <div className="ih-ideas">{IDEAS.map((i) => <button key={i} onClick={() => send(i)}>{i}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`ih-msg ${m.role} ${m.kind || ""}`}>
              {m.role === "assistant" && <span className="ih-av"><Sparkles size={14} /></span>}
              <div className="ih-bubble">
                <div className="ih-text">{renderText(m.content)}</div>
                {m.image && <img className="ih-img" src={m.image} alt="" />}
                {m.role === "assistant" && m.kind !== "error" && (
                  <div className="ih-tools">
                    {!m.image && <button onClick={() => copy(m.content)}><Copy size={13} /> Copiar</button>}
                    {m.image && <a href={m.image} target="_blank" rel="noreferrer" download><ImageIcon size={13} /> Abrir/baixar</a>}
                    {m.image && canva && <button disabled={!!busy} onClick={() => toCanva(m.image, m.prompt)}><Palette size={13} /> Levar ao Canva</button>}
                    {m.canvaUrl && <a href={m.canvaUrl} target="_blank" rel="noreferrer"><Palette size={13} /> Abrir no Canva</a>}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="ih-msg assistant"><span className="ih-av"><Sparkles size={14} /></span><div className="ih-bubble ih-typing">{busy === "image" ? "Gerando a imagem…" : busy === "canva" ? "Criando no Canva…" : busy === "flow" ? "Montando o fluxo…" : "Pensando…"}<span className="dots"><i /><i /><i /></span></div></div>}
          <div ref={endRef} />
        </div>
        <div className="ih-composer">
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Peça qualquer coisa: um post, uma campanha, um e-mail, uma imagem, um fluxo…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <div className="ih-bar">
            <div className="ih-acts">
              <button disabled={!!busy} onClick={image} title="Gera a imagem com o ChatGPT ou o Gemini conectado"><ImageIcon size={15} /> Gerar imagem</button>
              {canva && <button disabled={!!busy} onClick={() => toCanva(null)}><Palette size={15} /> Criar no Canva</button>}
              {isManager && <button disabled={!!busy} onClick={flow}><Workflow size={15} /> Criar fluxo</button>}
              <select value={size} onChange={(e) => setSize(e.target.value)} title="Formato da arte">
                <option value="post">Post 1:1</option><option value="story">Story 9:16</option><option value="carrossel">Carrossel 4:5</option><option value="banner">Banner 16:9</option><option value="a4">A4</option>
              </select>
            </div>
            <button className="ih-send" disabled={!text.trim() || !!busy} onClick={() => send()}><Send size={16} /></button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Negrito com **texto** e quebras de linha. */
function renderText(t) {
  return String(t || "").split("\n").map((line, i) => (
    <React.Fragment key={i}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (/^\*\*[^*]+\*\*$/.test(p) ? <strong key={j}>{p.slice(2, -2)}</strong> : p))}
      {i < String(t || "").split("\n").length - 1 && <br />}
    </React.Fragment>
  ));
}

// ------------------------------------------------------------ Atendentes IA
const BLANK = { name: "", prompt: "", historySize: 20, maxTurns: 20, transferDepartmentId: "", transferMessageEnabled: true, transferMessage: "Vou te transferir para um dos nossos atendentes, só um instante! 😊", processImages: false, unsupportedMediaMessage: "" };

function Attendants({ isManager }) {
  const [list, setList] = useState(null);
  const [channels, setChannels] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => Promise.all([aiPrompts.list(), integrations.attendantChannels()]).then(([l, c]) => { setList(l); setChannels(c); }).catch((e) => { notify(errText(e), "error"); setList([]); });
  useEffect(() => { load(); }, []);
  const setCh = async (ch, id) => {
    try { await integrations.setChannelAttendant(ch.id, id || null); notify(id ? "Atendente IA ligado neste canal." : "Atendente IA desligado deste canal.", "success"); load(); } catch (e) { notify(errText(e), "error"); }
  };
  return (
    <div className="ih-att">
      <div className="ih-card">
        <div className="ih-card-head"><div><h3>Canais</h3><p>Escolha qual atendente IA responde em cada número. Com um atendente ligado, ele responde tudo sozinho — e passa para um humano quando o cliente pedir ou quando não souber.</p></div></div>
        {!channels.length && <div className="ap-empty">Nenhum canal cadastrado.</div>}
        {channels.map((c) => (
          <div key={c.id} className="ih-ch">
            <span className="ih-ch-ico">{c.platform === "whatsapp" ? <Smartphone size={16} /> : <MessageCircle size={16} />}</span>
            <div className="ih-ch-name"><strong>{c.name || c.platform}</strong><small>{c.phone ? `+${c.phone}` : c.platform}</small></div>
            <select disabled={!isManager} value={c.attendantId || ""} onChange={(e) => setCh(c, e.target.value)}>
              <option value="">Sem IA (usa o fluxo do canal)</option>
              {(list || []).map((p) => { const ok = String(p.prompt || "").trim().length >= 30; return <option key={p.id} value={p.id} disabled={!ok}>🤖 {p.name}{ok ? "" : " (falta o prompt)"}</option>; })}
            </select>
            {c.attendantId && <span className="ih-live">IA atendendo</span>}
          </div>
        ))}
      </div>
      <div className="ih-card">
        <div className="ih-card-head">
          <div><h3>Atendentes IA</h3><p>Cada atendente tem suas instruções e o próprio conhecimento. Ele também usa o conhecimento geral da empresa (Cérebro).</p></div>
          {isManager && <Button onClick={() => setEdit({ ...BLANK })}><Plus size={15} /> Novo atendente</Button>}
        </div>
        {list === null && <div className="ap-empty">Carregando…</div>}
        <div className="ih-att-grid">
          {(list || []).map((p) => {
            const on = channels.filter((c) => c.attendantId === p.id);
            return (
              <div key={p.id} className="ih-att-card" onClick={() => setEdit({ ...p, transferDepartmentId: p.transferDepartmentId || "" })}>
                <span className="ih-orb"><Bot size={18} /></span>
                <strong>{p.name}</strong>
                <p>{(p.prompt || "Sem instruções ainda").slice(0, 120)}</p>
                <small>{on.length ? `Atendendo em: ${on.map((c) => c.name || c.platform).join(", ")}` : "Não está ligado em nenhum canal"}</small>
              </div>
            );
          })}
        </div>
        {list && !list.length && <div className="ap-empty">Crie o primeiro atendente IA: dê um nome, escreva como ele deve atender e alimente com documentos.</div>}
      </div>
      {edit && <AttendantSheet a={edit} isManager={isManager} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function AttendantSheet({ a, isManager, onClose, onSaved }) {
  const [f, setF] = useState(a);
  const [tab, setTab] = useState("instr");
  const [deps, setDeps] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getDepartments().then(setDeps).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      if (f.id) await aiPrompts.update(f.id, f); else { const c = await aiPrompts.create(f); setF({ ...f, id: c.id }); notify("Atendente criado. Agora alimente o conhecimento e teste.", "success"); setTab("know"); setBusy(false); return; }
      notify("Salvo.", "success");
      onSaved();
    } catch (e) { notify(errText(e), "error"); }
    setBusy(false);
  };
  const del = async () => { if (await askConfirm(`Apagar o atendente "${f.name}"?`)) { await aiPrompts.remove(f.id); onSaved(); } };
  return (
    <Sheet title={f.id ? f.name : "Novo atendente IA"} onClose={onClose} width={680}
      footer={<>{f.id && isManager && <Button variant="secondary" onClick={del}><Trash2 size={14} /> Apagar</Button>}<div style={{ flex: 1 }} /><Button variant="secondary" onClick={onClose}>Fechar</Button>{isManager && tab === "instr" && <Button disabled={busy || !f.name.trim() || String(f.prompt || "").trim().length < 30} title={String(f.prompt || "").trim().length < 30 ? "Escreva o prompt de atendimento (obrigatório)" : ""} onClick={save}>{busy ? "Salvando…" : f.id ? "Salvar" : "Criar"}</Button>}</>}>
      <div className="ih-tabs sm">
        <button className={tab === "instr" ? "on" : ""} onClick={() => setTab("instr")}>Instruções</button>
        <button className={tab === "know" ? "on" : ""} disabled={!f.id} onClick={() => setTab("know")}>Conhecimento</button>
        <button className={tab === "test" ? "on" : ""} disabled={!f.id} onClick={() => setTab("test")}>Testar</button>
      </div>
      {tab === "instr" && (
        <>
          <Group title="Quem é este atendente">
            <Row label="Nome"><input value={f.name} onChange={set("name")} placeholder="Ex.: Ana — Atendimento Seguros" /></Row>
            <Row label="Prompt de atendimento (obrigatório)" stack>
              <textarea rows={9} value={f.prompt} onChange={set("prompt")} placeholder={"Ex.: Você é a Ana, da Parcer Seguros. Atenda com simpatia, pergunte o nome do cliente e qual seguro ele procura (auto, vida, residencial, empresarial). Para cotação, peça os dados necessários. Nunca informe preço sem cotação. Em caso de sinistro, transfira para um atendente."} />
            </Row>
            <div className={`ih-req ${String(f.prompt || "").trim().length >= 30 ? "ok" : ""}`}>{String(f.prompt || "").trim().length >= 30 ? "✓ Prompt preenchido" : `Obrigatório: descreva quem é o atendente, o que ele faz e o que não pode fazer (${String(f.prompt || "").trim().length}/30 caracteres no mínimo).`}</div>
          </Group>
          <Group title="Quando passar para uma pessoa" hint="O atendente transfere quando o cliente pede, está irritado ou a IA não sabe responder com segurança.">
            <Row label="Setor que recebe">
              <select value={f.transferDepartmentId || ""} onChange={set("transferDepartmentId")}><option value="">Fila geral</option>{deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </Row>
            <Row label="Avisar o cliente"><Switch checked={f.transferMessageEnabled !== false} onChange={(v) => setF({ ...f, transferMessageEnabled: v })} /></Row>
            {f.transferMessageEnabled !== false && <Row label="Mensagem" stack><input value={f.transferMessage || ""} onChange={set("transferMessage")} /></Row>}
          </Group>
        </>
      )}
      {tab === "know" && f.id && <Knowledge agentId={f.id} isManager={isManager} />}
      {tab === "test" && f.id && <TestChat id={f.id} name={f.name} />}
    </Sheet>
  );
}

function TestChat({ id, name }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user", content: q }];
    setMsgs(next); setText(""); setBusy(true);
    try {
      const r = await integrations.testAttendant(id, next.filter((m) => !m.note));
      setMsgs([...next, { role: "assistant", content: r.text || "(sem resposta)" }, ...(r.transfer ? [{ role: "assistant", note: true, content: "↪ Aqui a conversa seria transferida para um atendente humano." }] : [])]);
    } catch (e) { setMsgs([...next, { role: "assistant", note: true, content: `⚠️ ${errText(e)}` }]); }
    setBusy(false);
  };
  return (
    <div className="ih-test">
      <div className="ih-test-head"><MessageCircle size={14} /> Simule um cliente falando com {name}. Nada é enviado no WhatsApp.<button className="lp-link" onClick={() => setMsgs([])}>Recomeçar</button></div>
      <div className="ih-test-msgs">
        {!msgs.length && <div className="ap-empty">Escreva como se fosse o cliente. Ex.: "Oi, quero fazer seguro do meu carro"</div>}
        {msgs.map((m, i) => <div key={i} className={`ih-wa ${m.role} ${m.note ? "note" : ""}`}>{m.content}</div>)}
        {busy && <div className="ih-wa assistant">digitando…</div>}
      </div>
      <div className="cx-inline"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Mensagem do cliente" /><button className="pill-btn primary" disabled={busy || !text.trim()} onClick={send}><Send size={14} /></button></div>
    </div>
  );
}

// ------------------------------------------------------------ Cérebro / Conhecimento
const SRC = {
  texto: [FileText, "Texto"], pdf: [FileText, "PDF"], word: [FileText, "Word"], planilha: [Table, "Planilha"], site: [Globe, "Site"],
  google_docs: [FileText, "Google Docs"], google_sheets: [Table, "Google Planilhas"], google_slides: [FileText, "Google Apresentações"], google_drive: [FileText, "Google Drive"],
  email: [Mail, "E-mail"], formulario: [FileText, "Formulário"]
};

/** Lista + adicionar conhecimento. agentId: só deste atendente (senão, da empresa toda). */
function Knowledge({ agentId = null, isManager }) {
  const [docs, setDocs] = useState(null);
  const [mode, setMode] = useState(null);
  const [f, setF] = useState({ title: "", content: "", url: "" });
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);
  const [filter, setFilter] = useState("");
  const fileRef = useRef(null);
  const load = () => integrations.brainDocs(agentId).then(setDocs).catch((e) => { notify(errText(e), "error"); setDocs([]); });
  useEffect(() => { load(); }, [agentId]);
  const agentIds = agentId ? [agentId] : undefined;
  const add = async () => {
    setBusy(true);
    try {
      const r = mode === "link" ? await integrations.brainAdd({ url: f.url, title: f.title || undefined, agentIds }) : await integrations.brainAdd({ title: f.title, content: f.content, agentIds });
      notify(`Aprendido! (${r.chunks} trecho${r.chunks === 1 ? "" : "s"})`, "success");
      setMode(null); setF({ title: "", content: "", url: "" }); load();
    } catch (e) { notify(errText(e), "error"); }
    setBusy(false);
  };
  const upload = async (files) => {
    setBusy(true);
    for (const file of files) {
      try { const r = await integrations.brainUpload(file, { agentIds }); notify(`${file.name}: aprendido (${r.chunks} trechos).`, "success"); } catch (e) { notify(`${file.name}: ${errText(e)}`, "error"); }
    }
    setBusy(false); load();
  };
  const shown = (docs || []).filter((d) => !filter || `${d.title} ${d.source}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="ih-know">
      {isManager && (
        <div className="ih-add">
          <button className={mode === "text" ? "on" : ""} onClick={() => setMode(mode === "text" ? null : "text")}><FileText size={16} /> Escrever</button>
          <button className={mode === "link" ? "on" : ""} onClick={() => setMode(mode === "link" ? null : "link")}><Link2 size={16} /> Link (site, Google Docs/Planilhas)</button>
          <button disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} /> {busy && !mode ? "Lendo…" : "Arquivo (PDF, Word, CSV)"}</button>
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.csv,.md,.json" style={{ display: "none" }} onChange={(e) => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) upload(fs); }} />
        </div>
      )}
      {mode === "text" && (
        <div className="ih-form">
          <input placeholder="Título (ex.: Tabela de preços, Perguntas frequentes, Coberturas do seguro auto)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <textarea rows={8} placeholder="Escreva ou cole aqui tudo o que a IA precisa saber…" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} />
          <div className="ih-form-foot"><button className="pill-btn" onClick={() => setMode(null)}>Cancelar</button><button className="pill-btn primary" disabled={busy || !f.content.trim()} onClick={add}>{busy ? "Aprendendo…" : "Ensinar"}</button></div>
        </div>
      )}
      {mode === "link" && (
        <div className="ih-form">
          <input placeholder="https://… (página do site, Google Docs, Planilhas, Drive ou PDF)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          <small className="cv-muted">Google: deixe o arquivo em Compartilhar → "Qualquer pessoa com o link". Depois, use ↻ para atualizar quando o arquivo mudar.</small>
          <div className="ih-form-foot"><button className="pill-btn" onClick={() => setMode(null)}>Cancelar</button><button className="pill-btn primary" disabled={busy || !/^https?:\/\//.test(f.url.trim())} onClick={add}>{busy ? "Lendo…" : "Ler e ensinar"}</button></div>
        </div>
      )}
      <div className="ih-docs-head"><strong>{docs ? `${docs.length} item(ns) ${agentId ? "deste atendente" : "no cérebro"}` : "Carregando…"}</strong>{docs?.length > 6 && <div className="crm-search"><Search size={14} /><input placeholder="Filtrar" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>}</div>
      <div className="ih-docs">
        {shown.map((d) => {
          const [I, label] = SRC[d.source] || [FileText, d.source];
          return (
            <div key={d.id} className="ih-doc">
              <span className="ih-doc-ico"><I size={16} /></span>
              <div className="ih-doc-main">
                <strong>{d.title}</strong>
                <small>{label} · {(d.chars / 1000).toFixed(d.chars < 10000 ? 1 : 0)} mil caracteres · {new Date(d.updatedAt).toLocaleDateString("pt-BR")}{!agentId && d.agentIds?.length ? " · só de um atendente" : ""}</small>
              </div>
              <button className="cx-x" title="Ver" onClick={async () => { try { setView(await integrations.brainDoc(d.id)); } catch (e) { notify(errText(e), "error"); } }}><Eye size={15} /></button>
              {d.url && isManager && <button className="cx-x" title="Atualizar do link" onClick={async () => { try { await integrations.brainRefresh(d.id); notify("Atualizado.", "success"); load(); } catch (e) { notify(errText(e), "error"); } }}><RefreshCw size={15} /></button>}
              {isManager && <button className="cx-x" title="Esquecer" onClick={async () => { if (await askConfirm(`A IA vai esquecer "${d.title}". Continuar?`)) { await integrations.brainRemove(d.id); load(); } }}><Trash2 size={15} /></button>}
            </div>
          );
        })}
        {docs && !docs.length && <div className="ap-empty">{agentId ? "Este atendente ainda não tem conhecimento próprio. Ele já usa o conhecimento geral da empresa (Cérebro)." : "O cérebro está vazio. Ensine a IA: escreva, cole um link ou envie arquivos (tabela de preços, coberturas, perguntas frequentes, contratos…)."}</div>}
      </div>
      {view && (
        <Sheet title={view.title} subtitle={view.url || ""} onClose={() => setView(null)} width={700}>
          <pre className="ih-view">{view.content}</pre>
        </Sheet>
      )}
    </div>
  );
}

function BrainTab({ isManager }) {
  const [q, setQ] = useState("");
  const [ans, setAns] = useState(null);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    if (!q.trim()) return;
    setBusy(true); setAns(null);
    try { setAns(await integrations.brainAsk(q.trim())); } catch (e) { notify(errText(e), "error"); }
    setBusy(false);
  };
  return (
    <div className="ih-brain">
      <div className="ih-card ih-ask">
        <h3><Brain size={18} /> Pergunte ao cérebro</h3>
        <p>A IA responde só com o que a empresa ensinou, e mostra de onde tirou.</p>
        <div className="cx-inline"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder='Ex.: "Qual a carência do plano de saúde?" ou "Quais seguradoras trabalhamos?"' /><button className="pill-btn primary" disabled={busy || !q.trim()} onClick={ask}>{busy ? "Buscando…" : "Perguntar"}</button></div>
        {ans && (
          <div className="ih-answer">
            <div className="ih-text">{renderText(ans.answer)}</div>
            {!!ans.sources?.length && <div className="ih-sources">{ans.sources.map((s) => <span key={s.docId}>[{s.n}] {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</span>)}</div>}
          </div>
        )}
      </div>
      <div className="ih-card">
        <div className="ih-card-head"><div><h3>Conhecimento da empresa</h3><p>Vale para a IA Helora e para todos os atendentes IA. E-mails e Google Docs também podem entrar pela aba Conexões.</p></div></div>
        <Knowledge isManager={isManager} />
      </div>
    </div>
  );
}
