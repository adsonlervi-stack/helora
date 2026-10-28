import React, { useEffect, useState } from "react";
import { Plug, Check, Mail, FileText, Sheet as SheetIcon, Palette, Copy, Trash2, RefreshCw, Plus, ExternalLink, Download, Sparkles, Link2 } from "lucide-react";
import { integrations, crm } from "../api.js";
import { Sheet, Group, Row, Switch, Button } from "./ui.jsx";
import { askConfirm, notify } from "../dialogs.js";

const errText = (e) => e?.response?.data?.error || e?.message || "Erro";
const AIS = [
  { id: "openai", name: "ChatGPT", by: "OpenAI", color: "#10a37f", slug: null, keyUrl: "https://platform.openai.com/api-keys", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"], note: "Gera textos e imagens." },
  { id: "anthropic", name: "Claude", by: "Anthropic", color: "#d97757", slug: "claude", keyUrl: "https://console.anthropic.com/settings/keys", models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"], note: "Ótimo para textos e atendimento. Não gera imagens." },
  { id: "gemini", name: "Gemini", by: "Google", color: "#4285f4", slug: "googlegemini", keyUrl: "https://aistudio.google.com/apikey", models: ["gemini-2.5-flash", "gemini-2.5-pro"], note: "Gera textos e imagens." }
];
const copy = (t) => { navigator.clipboard?.writeText(t); notify("Copiado.", "success"); };

/** Logo oficial da marca (Simple Icons). Sem logo disponível → selo com a inicial na cor da marca. */
export function BrandLogo({ slug, name, color = "#8e8e93", size = 38 }) {
  const [bad, setBad] = useState(!slug);
  return (
    <span className="cx-brand" style={{ width: size, height: size }} title={name}>
      {bad
        ? <span className="cx-brand-fb" style={{ background: color }}>{String(name || "?").trim()[0]}</span>
        : <img src={`https://cdn.simpleicons.org/${slug}`} alt={name} loading="lazy" onError={() => setBad(true)} />}
    </span>
  );
}

const MAIL_BRANDS = [
  { id: "gmail", name: "Gmail", slug: "gmail", color: "#EA4335", imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 465, tip: "Use uma senha de app: Conta Google → Segurança → Verificação em duas etapas → Senhas de app." },
  { id: "outlook", name: "Outlook / Microsoft 365", color: "#0078D4", imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587, tip: "Se a conta tiver verificação em duas etapas, crie uma senha de app em account.microsoft.com → Segurança." },
  { id: "yahoo", name: "Yahoo", color: "#6001D2", imapHost: "imap.mail.yahoo.com", imapPort: 993, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, tip: "Gere uma senha de app em Conta Yahoo → Segurança da conta." },
  { id: "icloud", name: "iCloud", slug: "icloud", color: "#3693F3", imapHost: "imap.mail.me.com", imapPort: 993, smtpHost: "smtp.mail.me.com", smtpPort: 587, tip: "Use uma senha específica de app (appleid.apple.com → Iniciar sessão e segurança)." },
  { id: "zoho", name: "Zoho Mail", slug: "zoho", color: "#E42527", imapHost: "imap.zoho.com", imapPort: 993, smtpHost: "smtp.zoho.com", smtpPort: 465, tip: "Ative o acesso IMAP em Configurações do Zoho Mail → Contas de e-mail." },
  { id: "proton", name: "Proton Mail", slug: "protonmail", color: "#6D4AFF", imapHost: "127.0.0.1", imapPort: 1143, smtpHost: "127.0.0.1", smtpPort: 1025, tip: "O Proton só libera IMAP pelo Proton Bridge (programa no computador) — não funciona em servidor. Prefira outro provedor." },
  { id: "hostinger", name: "Hostinger", slug: "hostinger", color: "#673DE6", imapHost: "imap.hostinger.com", imapPort: 993, smtpHost: "smtp.hostinger.com", smtpPort: 465 },
  { id: "locaweb", name: "Locaweb", color: "#E2001A", imapHost: "email-ssl.com.br", imapPort: 993, smtpHost: "email-ssl.com.br", smtpPort: 465 },
  { id: "uol", name: "UOL", color: "#F5A100", imapHost: "imap.uol.com.br", imapPort: 993, smtpHost: "smtps.uol.com.br", smtpPort: 465 },
  { id: "titan", name: "Titan (HostGator)", color: "#2E5BFF", imapHost: "imap.titan.email", imapPort: 993, smtpHost: "smtp.titan.email", smtpPort: 465 },
  { id: "outro", name: "Outro / domínio próprio", color: "#8e8e93", tip: "Peça ao seu provedor os servidores IMAP (para ler) e SMTP (para enviar)." }
];

const FORM_BRANDS = [
  { id: "site", name: "Site (HTML)", color: "#0071e3", how: "html" },
  { id: "googleforms", name: "Google Forms", slug: "googleforms", color: "#7248B9", how: "gforms" },
  { id: "typeform", name: "Typeform", slug: "typeform", color: "#262627", how: "Typeform → Connect → Webhooks → Add a webhook → cole o link do formulário Helora e ative." },
  { id: "jotform", name: "Jotform", color: "#FF6100", how: "Jotform → Configurações → Integrações → Webhooks → cole o link do formulário Helora." },
  { id: "rdstation", name: "RD Station", color: "#19B0E0", how: "RD Station Marketing → Integrações → Webhooks → Criar → cole o link do formulário Helora (gatilho: conversão)." },
  { id: "hubspot", name: "HubSpot", slug: "hubspot", color: "#FF7A59", how: "HubSpot → Automação → Fluxo de trabalho → ação \"Enviar um webhook\" (POST) → cole o link do formulário Helora." },
  { id: "wordpress", name: "WordPress", slug: "wordpress", color: "#21759B", how: "Contact Form 7 / WPForms: use um plugin de webhook (ex.: \"CF7 to Webhook\") e cole o link do formulário Helora. Ou cole o código HTML numa página." },
  { id: "elementor", name: "Elementor", slug: "elementor", color: "#92003B", how: "Elementor → widget Formulário → Ações após envio → Webhook → cole o link do formulário Helora." },
  { id: "webflow", name: "Webflow", slug: "webflow", color: "#146EF5", how: "Webflow → Site settings → Apps & Integrations → Webhooks → Form submission → cole o link do formulário Helora." },
  { id: "wix", name: "Wix", slug: "wix", color: "#0C6EFC", how: "Wix → Automações → Quando um formulário é enviado → Enviar webhook (POST) → cole o link do formulário Helora." },
  { id: "tally", name: "Tally", color: "#000000", how: "Tally → Integrações → Webhooks → cole o link do formulário Helora." },
  { id: "fillout", name: "Fillout", slug: "fillout", color: "#FFC738", how: "Fillout → Integrate → Webhook → cole o link do formulário Helora." },
  { id: "formstack", name: "Formstack", slug: "formstack", color: "#21B573", how: "Formstack → Settings → Emails & Actions → Webhook → cole o link do formulário Helora." },
  { id: "msforms", name: "Microsoft Forms", color: "#008272", how: "Power Automate → \"Quando uma nova resposta é enviada\" → \"HTTP\" (POST, JSON com as respostas) → cole o link do formulário Helora." }
];

/** Aba Conexões: liga o Helora às ferramentas da empresa. */
export default function ConnectionsPage({ isManager }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [editAI, setEditAI] = useState(null);
  const [mailOpen, setMailOpen] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [canvaOpen, setCanvaOpen] = useState(false);
  const [gLink, setGLink] = useState("");
  const [gBusy, setGBusy] = useState(false);
  const load = () => integrations.list().then(setData).catch((e) => { setErr(errText(e)); setData({ integrations: {} }); });
  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search);
    if (q.get("canva") === "ok") notify("Canva conectado!", "success");
    if (q.get("canva") === "erro") notify(`Não foi possível conectar o Canva: ${q.get("msg") || ""}`, "error");
  }, []);
  const it = data?.integrations || {};
  const def = it.ai_default?.provider;

  const addGoogle = async () => {
    if (!gLink.trim()) return;
    setGBusy(true);
    try {
      const r = await integrations.brainAdd({ url: gLink.trim() });
      notify(`Adicionado ao cérebro (${r.chunks} trechos).`, "success");
      setGLink("");
    } catch (e) { notify(errText(e), "error"); }
    setGBusy(false);
  };

  return (
    <div className="page cx-page">
      <div className="cx-hero">
        <div className="cx-hero-ico"><Plug size={22} /></div>
        <div>
          <h2>Conexões</h2>
          <p>Ligue o Helora às ferramentas da sua empresa. Tudo o que entra aqui alimenta o <b>cérebro</b> — e a IA usa no atendimento e na IA Helora.</p>
        </div>
      </div>
      {err && <div className="admin-feedback error">{err}</div>}
      {data?.activeAI && <div className="cx-active">IA em uso: <b>{AIS.find((a) => a.id === data.activeAI.provider)?.name || data.activeAI.provider}</b>{data.activeAI.own ? " (conta da sua empresa)" : " (padrão do Helora)"}</div>}

      <h3 className="cx-h3">Inteligência artificial</h3>
      <div className="cx-grid">
        {AIS.map((a) => {
          const c = it[a.id];
          return (
            <div key={a.id} className={`cx-card ${c ? "on" : ""}`}>
              <div className="cx-card-top">
                <BrandLogo slug={a.slug} name={a.name} color={a.color} />
                <div><strong>{a.name}</strong><small>{a.by}</small></div>
                {c && <span className="cx-badge"><Check size={12} /> Conectado</span>}
              </div>
              <p className="cx-desc">{a.note}{c ? ` Modelo: ${c.model}.` : ""}</p>
              <div className="cx-actions">
                {isManager && <button className="pill-btn" onClick={() => setEditAI({ ...a, apiKey: "", model: c?.model || a.models[0], has: !!c })}>{c ? "Editar" : "Conectar"}</button>}
                {c && isManager && (def === a.id ? <span className="cx-main">IA principal</span> : <button className="pill-btn" onClick={async () => { await integrations.setDefaultAI(a.id); load(); }}>Usar como principal</button>)}
                {c && isManager && <button className="cx-x" title="Desconectar" onClick={async () => { if (await askConfirm(`Desconectar o ${a.name}?`)) { await integrations.remove(a.id); load(); } }}><Trash2 size={15} /></button>}
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="cx-h3">Documentos e dados</h3>
      <div className="cx-grid">
        <div className="cx-card on">
          <div className="cx-card-top">
            <span className="cx-pair"><BrandLogo slug="googledocs" name="Google Docs" color="#4285F4" size={30} /><BrandLogo slug="googlesheets" name="Google Planilhas" color="#34A853" size={30} /><BrandLogo slug="googledrive" name="Google Drive" color="#4285F4" size={30} /></span>
            <div><strong>Google Docs e Planilhas</strong><small>Docs, Planilhas, Apresentações e Drive</small></div>
            <span className="cx-badge"><Check size={12} /> Pronto</span>
          </div>
          <p className="cx-desc">Cole o link de um Documento, Planilha, Apresentação ou arquivo do Drive. No Google, deixe em <b>Compartilhar → Qualquer pessoa com o link</b>.</p>
          {isManager && (
            <div className="cx-inline">
              <input placeholder="https://docs.google.com/…" value={gLink} onChange={(e) => setGLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGoogle()} />
              <button className="pill-btn primary" disabled={gBusy || !gLink.trim()} onClick={addGoogle}>{gBusy ? "Lendo…" : "Adicionar"}</button>
            </div>
          )}
        </div>
        <div className={`cx-card ${it.email ? "on" : ""}`}>
          <div className="cx-card-top">
            <span className="cx-logo" style={{ background: "#0071e3" }}><Mail size={16} /></span>
            <div><strong>E-mail</strong><small>Qualquer provedor</small></div>
            {it.email && <span className="cx-badge"><Check size={12} /> Conectado</span>}
          </div>
          <div className="cx-brands">{MAIL_BRANDS.filter((b) => b.id !== "outro").map((b) => <BrandLogo key={b.id} slug={b.slug} name={b.name} color={b.color} size={26} />)}</div>
          <p className="cx-desc">{it.email ? <>Caixa <b>{it.email.email}</b>. {it.email.lastSync ? `Última leitura: ${new Date(it.email.lastSync).toLocaleString("pt-BR")}.` : "Ainda não leu os e-mails."}</> : "Lê a caixa de entrada para o cérebro e envia convites de reunião pelo e-mail da empresa."}</p>
          <div className="cx-actions">
            {isManager && <button className="pill-btn" onClick={() => setMailOpen(true)}>{it.email ? "Editar" : "Conectar"}</button>}
            {it.email && isManager && <button className="pill-btn" onClick={async () => { try { const r = await integrations.syncEmail(); notify(`${r.added} e-mail(s) lido(s) para o cérebro.`, "success"); load(); } catch (e) { notify(errText(e), "error"); } }}><RefreshCw size={14} /> Ler agora</button>}
            {it.email && isManager && <button className="cx-x" title="Desconectar" onClick={async () => { if (await askConfirm("Desconectar o e-mail?")) { await integrations.remove("email"); load(); } }}><Trash2 size={15} /></button>}
          </div>
        </div>
        <div className={`cx-card ${it.forms?.forms?.length ? "on" : ""}`}>
          <div className="cx-card-top">
            <span className="cx-logo" style={{ background: "#7248b9" }}><SheetIcon size={16} /></span>
            <div><strong>Formulários</strong><small>Site, landing page e ferramentas de formulário</small></div>
            {!!it.forms?.forms?.length && <span className="cx-badge"><Check size={12} /> {it.forms.forms.length}</span>}
          </div>
          <div className="cx-brands">{FORM_BRANDS.filter((b) => b.id !== "site").map((b) => <BrandLogo key={b.id} slug={b.slug} name={b.name} color={b.color} size={26} />)}</div>
          <p className="cx-desc">Cada formulário ganha um link. Quem preencher vira lead no CRM, no funil e etapa que você escolher.</p>
          <div className="cx-actions">{isManager && <button className="pill-btn" onClick={() => setFormsOpen(true)}>{it.forms?.forms?.length ? "Gerenciar" : "Criar formulário"}</button>}</div>
        </div>
      </div>

      <h3 className="cx-h3">Design</h3>
      <div className="cx-grid">
        <div className={`cx-card ${it.canva?.connected ? "on" : ""}`}>
          <div className="cx-card-top">
            <BrandLogo name="Canva" color="#00C4CC" />
            <div><strong>Canva</strong><small>{it.canva?.name || "Artes e designs"}</small></div>
            {it.canva?.connected && <span className="cx-badge"><Check size={12} /> Conectado</span>}
          </div>
          <p className="cx-desc">A IA Helora cria artes direto no seu Canva. Você também vê seus designs aqui e baixa em PNG ou PDF.</p>
          <div className="cx-actions">
            {!data?.canvaAvailable && !it.canva?.connected && <span className="cx-soon">Disponível em breve</span>}
            {data?.canvaAvailable && isManager && <button className="pill-btn" onClick={async () => { try { window.location.href = await integrations.canvaAuthUrl(); } catch (e) { notify(errText(e), "error"); } }}>{it.canva?.connected ? "Reconectar" : "Conectar"}</button>}
            {it.canva?.connected && <button className="pill-btn" onClick={() => setCanvaOpen(true)}>Ver designs</button>}
            {it.canva?.connected && isManager && <button className="cx-x" title="Desconectar" onClick={async () => { if (await askConfirm("Desconectar o Canva?")) { await integrations.remove("canva"); load(); } }}><Trash2 size={15} /></button>}
          </div>
        </div>
      </div>

      {editAI && <AISheet a={editAI} onClose={() => setEditAI(null)} onSaved={() => { setEditAI(null); load(); }} />}
      {mailOpen && <MailSheet current={it.email} onClose={() => setMailOpen(false)} onSaved={() => { setMailOpen(false); load(); }} />}
      {formsOpen && <FormsSheet forms={it.forms?.forms || []} onClose={() => setFormsOpen(false)} reload={load} />}
      {canvaOpen && <CanvaSheet onClose={() => setCanvaOpen(false)} />}
    </div>
  );
}

function AISheet({ a, onClose, onSaved }) {
  const [f, setF] = useState(a);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await integrations.saveAI(a.id, { apiKey: f.apiKey, model: f.model }); notify(`${a.name} conectado!`, "success"); onSaved(); }
    catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  return (
    <Sheet title={`Conectar ${a.name}`} subtitle="A chave fica guardada só no servidor do Helora e é usada apenas pela sua empresa." onClose={onClose} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={busy || (!f.apiKey && !a.has)} onClick={save}>{busy ? "Testando…" : "Testar e salvar"}</Button></>}>
      <Group title="Chave de API" hint={<>Crie a chave em <a href={a.keyUrl} target="_blank" rel="noreferrer">{a.keyUrl.replace("https://", "")}</a> e cole aqui. O custo de uso é cobrado pela {a.by} direto na sua conta.</>}>
        <Row label="Chave" stack><input type="password" autoComplete="off" placeholder={a.has ? "•••• (deixe vazio para manter a atual)" : "Cole a chave"} value={f.apiKey} onChange={(e) => setF({ ...f, apiKey: e.target.value })} /></Row>
        <Row label="Modelo">
          <select value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })}>{a.models.map((m) => <option key={m}>{m}</option>)}</select>
        </Row>
      </Group>
      {err && <div className="admin-feedback error">{err}</div>}
    </Sheet>
  );
}

function MailSheet({ current, onClose, onSaved }) {
  const [f, setF] = useState({ email: current?.email || "", password: "", fromName: current?.fromName || "", imapHost: current?.imapHost || "", smtpHost: current?.smtpHost || "", imapPort: "", smtpPort: "", autoSync: current ? !!current.autoSync : true });
  const [preset, setPreset] = useState(null);
  const [adv, setAdv] = useState(false);
  const [brand, setBrand] = useState(null);
  const pickBrand = (b) => {
    setBrand(b);
    if (b.imapHost) setF((c) => ({ ...c, imapHost: b.imapHost, imapPort: String(b.imapPort), smtpHost: b.smtpHost, smtpPort: String(b.smtpPort) }));
    else setAdv(true);
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!/@.+\./.test(f.email)) return setPreset(null);
    const t = setTimeout(() => integrations.emailPreset(f.email).then((p) => { setPreset(p?.imapHost ? p : null); if (!p?.imapHost) setAdv(true); }).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [f.email]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true); setErr(null);
    try { await integrations.saveEmail(f); notify("E-mail conectado!", "success"); onSaved(); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  return (
    <Sheet title="Conectar e-mail" subtitle="O Helora lê a caixa de entrada para o cérebro e envia convites pelo e-mail da empresa." onClose={onClose} width={540}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={busy || !f.email || (!f.password && !current)} onClick={save}>{busy ? "Testando…" : "Testar e salvar"}</Button></>}>
      <div className="cx-pick">
        {MAIL_BRANDS.map((b) => (
          <button type="button" key={b.id} className={brand?.id === b.id ? "on" : ""} onClick={() => pickBrand(b)}>
            <BrandLogo slug={b.slug} name={b.name} color={b.color} size={26} /><span>{b.name}</span>
          </button>
        ))}
      </div>
      {brand?.tip && <div className="cx-tip">💡 {brand.tip}</div>}
      <Group title="Conta">
        <Row label="E-mail"><input value={f.email} onChange={set("email")} placeholder="contato@suaempresa.com.br" /></Row>
        <Row label="Senha"><input type="password" autoComplete="new-password" value={f.password} onChange={set("password")} placeholder={current ? "•••• (vazio = manter)" : "Senha ou senha de app"} /></Row>
        <Row label="Nome do remetente"><input value={f.fromName} onChange={set("fromName")} placeholder="Ex.: Parcer Seguros" /></Row>
        <Row label="Ler e-mails novos sozinho (a cada hora)"><Switch checked={f.autoSync} onChange={(v) => setF({ ...f, autoSync: v })} /></Row>
      </Group>
      {preset?.note && !brand?.tip && <div className="cx-tip">💡 {preset.note}</div>}
      <button type="button" className="lp-link" onClick={() => setAdv((v) => !v)}>{adv ? "Esconder" : "Mostrar"} servidores (avançado)</button>
      {adv && (
        <Group title="Servidores" hint="O seu provedor de e-mail informa esses dados (IMAP para ler, SMTP para enviar).">
          <Row label="IMAP"><input value={f.imapHost} onChange={set("imapHost")} placeholder={preset?.imapHost || "imap.seudominio.com.br"} /></Row>
          <Row label="Porta IMAP"><input value={f.imapPort} onChange={set("imapPort")} placeholder="993" /></Row>
          <Row label="SMTP"><input value={f.smtpHost} onChange={set("smtpHost")} placeholder={preset?.smtpHost || "smtp.seudominio.com.br"} /></Row>
          <Row label="Porta SMTP"><input value={f.smtpPort} onChange={set("smtpPort")} placeholder="465" /></Row>
        </Group>
      )}
      {err && <div className="admin-feedback error">{err}</div>}
    </Sheet>
  );
}

function FormsSheet({ forms, onClose, reload }) {
  const [pipes, setPipes] = useState([]);
  const [nf, setNf] = useState(null);
  const [show, setShow] = useState(null);
  const [tool, setTool] = useState({});
  useEffect(() => { crm.pipelines().then(setPipes).catch(() => {}); }, []);
  const pipeName = (id) => pipes.find((p) => p.id === id)?.name || "Primeiro funil";
  const create = async () => {
    try { await integrations.addForm(nf); setNf(null); await reload(); notify("Formulário criado.", "success"); } catch (e) { notify(errText(e), "error"); }
  };
  const html = (f) => `<form action="${f.url}" method="POST">
  <input name="nome" placeholder="Seu nome" required>
  <input name="telefone" placeholder="WhatsApp com DDD" required>
  <input name="email" type="email" placeholder="Seu e-mail">
  <textarea name="mensagem" placeholder="Como podemos ajudar?"></textarea>
  <input type="hidden" name="_redirect" value="https://seusite.com.br/obrigado">
  <button type="submit">Enviar</button>
</form>`;
  const gforms = (f) => `// Google Forms → Extensões → Apps Script → cole e salve.
// Depois: Acionadores (relógio) → Adicionar → onSubmit → "Ao enviar formulário".
function onSubmit(e) {
  var dados = {};
  e.response.getItemResponses().forEach(function (r) {
    dados[r.getItem().getTitle()] = r.getResponse();
  });
  UrlFetchApp.fetch("${f.url}", {
    method: "post", contentType: "application/json", payload: JSON.stringify(dados)
  });
}`;
  return (
    <Sheet title="Formulários" subtitle="Quem preencher vira lead no CRM. Campos com o mesmo nome dos campos do funil são preenchidos sozinhos." onClose={onClose} width={680}
      footer={<Button onClick={() => setNf({ name: "", pipelineId: pipes[0]?.id || "", stage: pipes[0]?.stages?.[0]?.id || "", toBrain: false })}><Plus size={15} /> Novo formulário</Button>}>
      {nf && (
        <Group title="Novo formulário">
          <Row label="Nome"><input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="Ex.: Cotação de seguro auto (site)" /></Row>
          <Row label="Funil">
            <select value={nf.pipelineId} onChange={(e) => { const p = pipes.find((x) => x.id === e.target.value); setNf({ ...nf, pipelineId: e.target.value, stage: p?.stages?.[0]?.id || "" }); }}>
              {pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Row>
          <Row label="Etapa">
            <select value={nf.stage} onChange={(e) => setNf({ ...nf, stage: e.target.value })}>{(pipes.find((p) => p.id === nf.pipelineId)?.stages || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Row>
          <Row label="Guardar respostas também no cérebro"><Switch checked={nf.toBrain} onChange={(v) => setNf({ ...nf, toBrain: v })} /></Row>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Button variant="secondary" onClick={() => setNf(null)}>Cancelar</Button><Button onClick={create} disabled={!nf.name.trim()}>Criar</Button></div>
        </Group>
      )}
      {!forms.length && !nf && <div className="ap-empty">Nenhum formulário ainda.</div>}
      {forms.map((f) => (
        <div key={f.id} className="cx-form">
          <div className="cx-form-head">
            <div><strong>{f.name}</strong><small>{pipeName(f.pipelineId)} · {f.count || 0} envio(s){f.lastAt ? ` · último ${new Date(f.lastAt).toLocaleString("pt-BR")}` : ""}</small></div>
            <button className="cx-x" title="Apagar" onClick={async () => { if (await askConfirm(`Apagar o formulário "${f.name}"? O link para de funcionar.`)) { await integrations.removeForm(f.id); reload(); } }}><Trash2 size={15} /></button>
          </div>
          <div className="cx-inline"><input readOnly value={f.url} /><button className="pill-btn" onClick={() => copy(f.url)}><Copy size={13} /> Copiar link</button></div>
          <div className="cx-pick sm">
            {FORM_BRANDS.map((b) => (
              <button type="button" key={b.id} className={tool[f.id] === b.id ? "on" : ""} onClick={() => setTool((t) => ({ ...t, [f.id]: t[f.id] === b.id ? null : b.id }))}>
                <BrandLogo slug={b.slug} name={b.name} color={b.color} size={22} /><span>{b.name}</span>
              </button>
            ))}
          </div>
          {(() => {
            const b = FORM_BRANDS.find((x) => x.id === tool[f.id]);
            if (!b) return <small className="cv-muted">Escolha onde está o seu formulário para ver como ligar.</small>;
            if (b.how === "html") return <div className="api-example"><div className="api-example-head"><strong>Cole no HTML do site</strong><button className="pill-btn" onClick={() => copy(html(f))}><Copy size={13} /> Copiar</button></div><pre>{html(f)}</pre></div>;
            if (b.how === "gforms") return <div className="api-example"><div className="api-example-head"><strong>Apps Script do Google Forms</strong><button className="pill-btn" onClick={() => copy(gforms(f))}><Copy size={13} /> Copiar</button></div><pre>{gforms(f)}</pre></div>;
            return <div className="cx-how"><BrandLogo slug={b.slug} name={b.name} color={b.color} size={28} /><div><strong>{b.name}</strong><p>{b.how}</p><button className="pill-btn" onClick={() => copy(f.url)}><Copy size={13} /> Copiar link do formulário</button></div></div>;
          })()}
        </div>
      ))}
    </Sheet>
  );
}

function CanvaSheet({ onClose }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const load = () => integrations.canvaDesigns(q).then(setList).catch((e) => { notify(errText(e), "error"); setList([]); });
  useEffect(() => { load(); }, []);
  const exp = async (d, format) => {
    setBusy(d.id + format);
    try { const r = await integrations.canvaExport(d.id, format); (r.urls || []).forEach((u) => window.open(u, "_blank")); } catch (e) { notify(errText(e), "error"); }
    setBusy(null);
  };
  return (
    <Sheet title="Designs do Canva" onClose={onClose} width={760}>
      <div className="cx-inline" style={{ marginBottom: 12 }}><input placeholder="Buscar design" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} /><button className="pill-btn" onClick={load}>Buscar</button></div>
      {list === null && <div className="ap-empty">Carregando…</div>}
      <div className="cx-designs">
        {(list || []).map((d) => (
          <div key={d.id} className="cx-design">
            <div className="cx-thumb">{d.thumb ? <img src={d.thumb} alt="" /> : <Palette size={22} />}</div>
            <strong title={d.title}>{d.title}</strong>
            <div className="cx-actions">
              {d.editUrl && <a className="pill-btn" href={d.editUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir</a>}
              <button className="pill-btn" disabled={!!busy} onClick={() => exp(d, "png")}><Download size={13} /> {busy === d.id + "png" ? "…" : "PNG"}</button>
              <button className="pill-btn" disabled={!!busy} onClick={() => exp(d, "pdf")}>{busy === d.id + "pdf" ? "…" : "PDF"}</button>
            </div>
          </div>
        ))}
      </div>
      {list && !list.length && <div className="ap-empty">Nenhum design encontrado.</div>}
    </Sheet>
  );
}
