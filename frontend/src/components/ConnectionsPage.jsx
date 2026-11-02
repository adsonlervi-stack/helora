import React, { useEffect, useState } from "react";
import { Plug, Check, Search, Settings2, Mail, FileText, Sheet as SheetIcon, Palette, Copy, Trash2, RefreshCw, Plus, ExternalLink, Download, Sparkles, Link2 } from "lucide-react";
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
  { id: "proton", name: "Proton Mail", slug: "protonmail", color: "#6D4AFF", imapHost: "127.0.0.1", imapPort: 1143, smtpHost: "127.0.0.1", smtpPort: 1025, tip: "O Proton só libera IMAP pelo Proton Bridge (programa no computador), não funciona em servidor. Prefira outro provedor." },
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

/** Aba Conexões: catálogo simples de conectores (e-mail, Google, Canva, formulários). */
export default function ConnectionsPage({ isManager }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [mailOpen, setMailOpen] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [canvaOpen, setCanvaOpen] = useState(false);
  const [gOpen, setGOpen] = useState(null);
  const load = () => integrations.list().then(setData).catch((e) => { setErr(errText(e)); setData({ integrations: {} }); });
  useEffect(() => {
    load();
    const u = new URLSearchParams(window.location.search);
    if (u.get("canva") === "ok") notify("Canva conectado!", "success");
    if (u.get("canva") === "erro") notify(`Não foi possível conectar o Canva: ${u.get("msg") || ""}`, "error");
  }, []);
  const it = data?.integrations || {};
  const mail = it.email?.email || "";
  const isGmail = /@gmail\.com$/i.test(mail);
  const isMs = /@(outlook|hotmail|live)\./i.test(mail);
  const CONNECTORS = [
    { id: "gmail", name: "Gmail", by: "Google", slug: "gmail", color: "#EA4335", desc: "Lê a caixa de entrada para o cérebro e envia convites de reunião pelo seu e-mail.", on: !!mail && isGmail, info: isGmail ? mail : null, open: () => setMailOpen("gmail") },
    { id: "outlook", name: "Outlook", by: "Microsoft", color: "#0078D4", desc: "Conecte o Outlook ou Microsoft 365 da empresa para ler e enviar e-mails.", on: !!mail && isMs, info: isMs ? mail : null, open: () => setMailOpen("outlook") },
    { id: "email", name: "Outro e-mail", by: "IMAP / SMTP", color: "#0071e3", icon: Mail, desc: "E-mail do seu domínio (Hostinger, Locaweb, Titan, Zoho…).", on: !!mail && !isGmail && !isMs, info: !isGmail && !isMs ? mail : null, open: () => setMailOpen("outro") },
    { id: "gdocs", name: "Google Docs", by: "Google", slug: "googledocs", color: "#4285F4", desc: "Cole o link de um documento e a Helora IA aprende o conteúdo.", open: () => setGOpen("Google Docs") },
    { id: "gsheets", name: "Google Sheets", by: "Google", slug: "googlesheets", color: "#34A853", desc: "Planilhas de preços, produtos ou clientes viram conhecimento da IA.", open: () => setGOpen("Google Sheets") },
    { id: "gdrive", name: "Google Drive", by: "Google", slug: "googledrive", color: "#4285F4", desc: "Arquivos do Drive (PDF, apresentações) para o cérebro da empresa.", open: () => setGOpen("Google Drive") },
    { id: "canva", name: "Canva", by: "Canva", color: "#00C4CC", desc: "Use o Canva da sua empresa: a Helora IA cria artes direto nele.", on: !!it.canva?.connected, info: it.canva?.name || null, soon: !data?.canvaAvailable && !it.canva?.connected,
      open: () => (it.canva?.connected ? setCanvaOpen(true) : data?.canvaAvailable && integrations.canvaAuthUrl().then((u) => { window.location.href = u; }).catch((e) => notify(errText(e), "error"))) },
    { id: "forms", name: "Formulários do site", by: "Site, Google Forms, RD Station…", color: "#7248B9", icon: SheetIcon, desc: "Quem preenche vira lead no funil e na etapa que você escolher.", on: !!it.forms?.forms?.length, info: it.forms?.forms?.length ? `${it.forms.forms.length} formulário(s)` : null, open: () => setFormsOpen(true) }
  ];
  const list = CONNECTORS.filter((c) => `${c.name} ${c.by} ${c.desc}`.toLowerCase().includes(q.toLowerCase()));
  const conn = list.filter((c) => c.on), avail = list.filter((c) => !c.on);
  const card = (c) => (
    <div key={c.id} className={`cx2-card ${c.on ? "on" : ""}`}>
      {c.icon ? <span className="cx2-logo" style={{ background: c.color }}><c.icon size={18} /></span> : <BrandLogo slug={c.slug} name={c.name} color={c.color} size={40} />}
      <div className="cx2-body">
        <strong>{c.name}{c.on && <span className="cx2-ok"><Check size={11} /> Conectado</span>}</strong>
        <p>{c.on && c.info ? c.info : c.desc}</p>
        <small>por {c.by}</small>
      </div>
      {isManager && (c.soon ? <span className="cx2-soon">Em breve</span> :
        <button className="cx2-btn" title={c.on ? "Gerenciar" : "Conectar"} onClick={c.open}>{c.on ? <Settings2 size={16} /> : <Plus size={16} />}</button>)}
    </div>
  );
  return (
    <div className="page cx2">
      <h2 className="cx2-title">Conexões</h2>
      <div className="cx2-search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conector" /></div>
      {err && <div className="admin-feedback error">{err}</div>}
      <div className={`cx2-ai ${data?.heloraAI?.active ? "on" : ""}`}>
        <Sparkles size={18} />
        <div><strong>Helora IA</strong><span>{data?.heloraAI?.active ? "Ativa na sua empresa. Não precisa conectar nada." : "Não está no seu plano. Fale com o suporte para contratar."}</span></div>
      </div>
      {conn.length > 0 && <><div className="cx2-sec">Conectados <b>{conn.length}</b></div><div className="cx2-grid">{conn.map(card)}</div></>}
      <div className="cx2-sec">Disponíveis para conectar <b>{avail.length}</b></div>
      <div className="cx2-grid">{avail.map(card)}</div>
      {!list.length && <div className="ap-empty">Nenhum conector encontrado.</div>}

      {mailOpen && <MailSheet preset={mailOpen} current={it.email} onClose={() => setMailOpen(false)} onSaved={() => { setMailOpen(false); load(); }}
        onRemove={it.email ? async () => { if (await askConfirm("Desconectar o e-mail?")) { await integrations.remove("email"); setMailOpen(false); load(); } } : null}
        onSync={it.email ? async () => { try { const r = await integrations.syncEmail(); notify(`${r.added} e-mail(s) lido(s) para o cérebro.`, "success"); load(); } catch (e) { notify(errText(e), "error"); } } : null} />}
      {formsOpen && <FormsSheet forms={it.forms?.forms || []} onClose={() => setFormsOpen(false)} reload={load} />}
      {canvaOpen && <CanvaSheet onClose={() => setCanvaOpen(false)} onRemove={async () => { if (await askConfirm("Desconectar o Canva?")) { await integrations.remove("canva"); setCanvaOpen(false); load(); } }} />}
      {gOpen && <GoogleSheet kind={gOpen} onClose={() => setGOpen(null)} />}
    </div>
  );
}

function GoogleSheet({ kind, onClose }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { const r = await integrations.brainAdd({ url: link.trim() }); notify(`Adicionado ao cérebro (${r.chunks} trechos).`, "success"); setLink(""); }
    catch (e) { notify(errText(e), "error"); }
    setBusy(false);
  };
  return (
    <Sheet title={kind} subtitle="No Google, deixe o arquivo em Compartilhar → Qualquer pessoa com o link." onClose={onClose} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>Fechar</Button><Button disabled={busy || !link.trim()} onClick={add}>{busy ? "Lendo…" : "Adicionar"}</Button></>}>
      <Group><Row label="Link" stack><input autoFocus value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && link.trim() && add()} placeholder="https://docs.google.com/…" /></Row></Group>
    </Sheet>
  );
}

function MailSheet({ current, preset: presetBrand, onClose, onSaved, onRemove, onSync }) {
  const [f, setF] = useState({ email: current?.email || "", password: "", fromName: current?.fromName || "", imapHost: current?.imapHost || "", smtpHost: current?.smtpHost || "", imapPort: "", smtpPort: "", autoSync: current ? !!current.autoSync : true });
  const [preset, setPreset] = useState(null);
  const [adv, setAdv] = useState(false);
  const [brand, setBrand] = useState(() => MAIL_BRANDS.find((b) => b.id === presetBrand) || null);
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
    <Sheet title="Conectar e-mail" subtitle="Lê a caixa de entrada e envia convites pelo e-mail da empresa." onClose={onClose} width={540}
      footer={<>{onRemove && <Button variant="secondary" onClick={onRemove}>Desconectar</Button>}{onSync && <Button variant="secondary" onClick={onSync}>Ler agora</Button>}<Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={busy || !f.email || (!f.password && !current)} onClick={save}>{busy ? "Testando…" : "Testar e salvar"}</Button></>}>
      <div className="cx-pick">
        {MAIL_BRANDS.filter((b) => (presetBrand === "gmail" || presetBrand === "outlook" ? b.id === presetBrand : presetBrand === "outro" ? !["gmail", "outlook"].includes(b.id) : true)).map((b) => (
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
        <Group title="Servidores" hint="Seu provedor de e-mail informa esses dados.">
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
    <Sheet title="Formulários" subtitle="Quem preencher vira lead no CRM." onClose={onClose} width={680}
      footer={<Button onClick={() => setNf({ name: "", pipelineId: pipes[0]?.id || "", stage: pipes[0]?.stages?.[0]?.id || "", toBrain: false })}><Plus size={15} /> Novo formulário</Button>}>
      {nf && (
        <Group title="Novo formulário">
          <Row label="Nome"><input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="Ex.: Cotação de seguro auto (site)" /></Row>
          <Row label="Funil do CRM onde o lead vai cair">
            <select value={nf.pipelineId} onChange={(e) => { const p = pipes.find((x) => x.id === e.target.value); setNf({ ...nf, pipelineId: e.target.value, stage: p?.stages?.[0]?.id || "" }); }}>
              {pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Row>
          <Row label="Etapa de entrada">
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
          <div className="cx-dest">
            <span>Os leads caem em</span>
            <select value={f.pipelineId || pipes[0]?.id || ""} onChange={async (e) => { const p = pipes.find((x) => x.id === e.target.value); try { await integrations.updateForm(f.id, { pipelineId: e.target.value, stage: p?.stages?.[0]?.id || null }); await reload(); notify("Funil atualizado.", "success"); } catch (er) { notify(errText(er), "error"); } }}>
              {pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span>na etapa</span>
            <select value={f.stage || ""} onChange={async (e) => { try { await integrations.updateForm(f.id, { stage: e.target.value }); await reload(); notify("Etapa atualizada.", "success"); } catch (er) { notify(errText(er), "error"); } }}>
              {(pipes.find((p) => p.id === (f.pipelineId || pipes[0]?.id))?.stages || []).map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
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

function CanvaSheet({ onClose, onRemove }) {
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
    <Sheet title="Designs do Canva" onClose={onClose} width={760} footer={onRemove ? <Button variant="secondary" onClick={onRemove}>Desconectar Canva</Button> : null}>
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
