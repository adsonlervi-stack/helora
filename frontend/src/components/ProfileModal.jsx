import React, { useEffect, useState } from "react";
import { X, UserRound, KeyRound, Mail, CalendarDays, Inbox } from "lucide-react";
import { updateMyProfileApi, changeMyPasswordApi, integrations, googleStatusApi, googleAuthUrlApi, googleDisconnectApi } from "../api.js";
import MailBox from "./MailBox.jsx";

/** Meu perfil: qualquer usuário troca o nome e a senha. O e-mail não muda. */
export default function ProfileModal({ profile, email, onClose, onSaved }) {
  const [name, setName] = useState(profile?.name || "");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("dados");
  const err = (e) => e.response?.data?.error || e.message;

  const saveName = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateMyProfileApi(name.trim());
      onSaved?.(name.trim());
      setMsg({ ok: true, text: "Nome atualizado." });
    } catch (e2) {
      setMsg({ ok: false, text: err(e2) });
    }
    setBusy(false);
  };

  const savePass = async (e) => {
    e.preventDefault();
    if (pass.length < 6) return setMsg({ ok: false, text: "A senha precisa ter pelo menos 6 caracteres." });
    if (pass !== pass2) return setMsg({ ok: false, text: "As senhas não conferem." });
    setBusy(true);
    try {
      await changeMyPasswordApi(pass);
      setPass("");
      setPass2("");
      setMsg({ ok: true, text: "Senha alterada. Use a nova senha no próximo login." });
    } catch (e2) {
      setMsg({ ok: false, text: err(e2) });
    }
    setBusy(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal lg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Meu perfil</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="pf-tabs">
          <button className={tab === "dados" ? "on" : ""} onClick={() => setTab("dados")}>Dados e senha</button>
          <button className={tab === "int" ? "on" : ""} onClick={() => setTab("int")}>Integrações</button>
        </div>
        {tab === "int" ? <Integrations /> : <>
        <form onSubmit={saveName} className="profile-block">
          <div className="fe-field-label"><UserRound size={14} /> Dados</div>
          <label className="login-field"><span>Nome</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="login-field"><span>E-mail (não pode ser alterado)</span><input value={email || ""} disabled /></label>
          <button className="connect-btn" disabled={busy || name.trim().length < 2}>Salvar nome</button>
        </form>
        <form onSubmit={savePass} className="profile-block">
          <div className="fe-field-label"><KeyRound size={14} /> Trocar senha</div>
          <label className="login-field"><span>Nova senha</span><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" /></label>
          <label className="login-field"><span>Repita a nova senha</span><input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" /></label>
          <button className="pill-btn" disabled={busy || !pass}>Alterar senha</button>
        </form>
        </>}
        {tab === "dados" && msg && <div className={`admin-feedback ${msg.ok ? "success" : "error"}`}>{msg.text}</div>}
      </div>
    </div>
  );
}

function Integrations() {
  const [mail, setMail] = useState(null);
  const [g, setG] = useState(null);
  const [f, setF] = useState({ email: "", password: "", fromName: "", imapHost: "", smtpHost: "", imapPort: "", smtpPort: "" });
  const [adv, setAdv] = useState(false);
  const [hint, setHint] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState(false);
  const err = (e) => e.response?.data?.error || e.message;
  const load = () => { integrations.myEmail().then(setMail).catch(() => setMail({ connected: false })); googleStatusApi().then(setG); };
  useEffect(load, []);
  const checkPreset = async () => {
    if (!f.email.includes("@")) return;
    const p = await integrations.emailPreset(f.email).catch(() => ({}));
    setAdv(!p.imapHost); setHint(p.note || (p.imapHost ? "" : "Não reconhecemos o provedor: preencha os servidores (o seu provedor de e-mail informa)."));
  };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await integrations.saveMyEmail(f); setMsg({ ok: true, text: "E-mail conectado." }); setF({ ...f, password: "" }); load(); }
    catch (e2) { setMsg({ ok: false, text: err(e2) }); }
    setBusy(false);
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="profile-block">
        <div className="fe-field-label"><Mail size={14} /> Conta de e-mail</div>
        {mail?.connected ? (
          <>
            <div className="pf-conn"><span className="pf-ok" /> <div><strong>{mail.email}</strong><small>Enviar e receber e-mails dentro do Helora</small></div></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="connect-btn" onClick={() => setBox(true)}><Inbox size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Abrir caixa de entrada</button>
              <button className="pill-btn" onClick={async () => { await integrations.removeMyEmail(); load(); }}>Desconectar</button>
            </div>
          </>
        ) : (
          <form onSubmit={save}>
            <label className="login-field"><span>Seu e-mail</span><input type="email" value={f.email} onChange={set("email")} onBlur={checkPreset} placeholder="voce@empresa.com.br" /></label>
            <label className="login-field"><span>Senha (Gmail e Outlook: senha de app)</span><input type="password" value={f.password} onChange={set("password")} autoComplete="new-password" /></label>
            <label className="login-field"><span>Nome que aparece para quem recebe</span><input value={f.fromName} onChange={set("fromName")} placeholder="Ex.: Carlos · Corretora Exemplo" /></label>
            {hint && <div className="pf-hint">{hint}</div>}
            {adv && (
              <div className="pf-grid">
                <label className="login-field"><span>Servidor IMAP</span><input value={f.imapHost} onChange={set("imapHost")} placeholder="imap.seudominio.com.br" /></label>
                <label className="login-field"><span>Porta</span><input value={f.imapPort} onChange={set("imapPort")} placeholder="993" /></label>
                <label className="login-field"><span>Servidor SMTP</span><input value={f.smtpHost} onChange={set("smtpHost")} placeholder="smtp.seudominio.com.br" /></label>
                <label className="login-field"><span>Porta</span><input value={f.smtpPort} onChange={set("smtpPort")} placeholder="465" /></label>
              </div>
            )}
            {!adv && <button type="button" className="lp-link sm" onClick={() => setAdv(true)}>Preencher servidores manualmente</button>}
            <button className="connect-btn" disabled={busy || !f.email || !f.password}>{busy ? "Testando conexão…" : "Conectar e-mail"}</button>
          </form>
        )}
        {msg && <div className={`admin-feedback ${msg.ok ? "success" : "error"}`}>{msg.text}</div>}
      </div>
      <div className="profile-block">
        <div className="fe-field-label"><CalendarDays size={14} /> Agenda</div>
        <div className="pf-conn">
          <span className={g?.connected ? "pf-ok" : "pf-off"} />
          <div><strong>Google Agenda</strong><small>{g?.connected ? "Conectada: reuniões do CRM entram na sua agenda com link do Meet" : g?.configured === false ? "Ainda não disponível nesta instalação" : "Reuniões do CRM vão para a sua agenda, com link do Meet"}</small></div>
          {g?.configured !== false && (g?.connected
            ? <button className="pill-btn" onClick={async () => { await googleDisconnectApi(); load(); }}>Desconectar</button>
            : <button className="connect-btn" onClick={async () => { window.location.href = await googleAuthUrlApi(); }}>Conectar</button>)}
        </div>
      </div>
      {box && <MailBox onClose={() => setBox(false)} />}
    </>
  );
}
