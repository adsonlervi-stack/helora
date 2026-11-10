import React, { useState } from "react";
import { Eye, EyeOff, Check } from "lucide-react";
import { supabase } from "../supabaseClient.js";
import { forgotPasswordApi } from "../api.js";
import LoginArt from "./LoginArt.jsx";

const RULES = [
  ["8 caracteres ou mais", (p) => p.length >= 8],
  ["Uma letra maiúscula", (p) => /[A-Z]/.test(p)],
  ["Um número", (p) => /\d/.test(p)]
];

/** Aberta pelo link do e-mail "recuperar senha": define a nova senha. */
export default function ResetPasswordPage({ onDone, expired }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const passed = RULES.filter(([, fn]) => fn(password)).length;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (passed < RULES.length) return setError("A senha ainda não atende a todos os requisitos.");
    if (password !== confirm) return setError("As senhas não são iguais.");
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) return setError(/same|different/i.test(err.message) ? "A nova senha precisa ser diferente da atual." : "Link expirado ou inválido. Peça um novo abaixo.");
    setOk(true);
    setTimeout(onDone, 1500);
  };
  const resend = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { await forgotPasswordApi(email.trim()); setSent(true); } catch (x) { setError(x.response?.data?.error || "Não foi possível enviar agora."); }
    setLoading(false);
  };

  return (
    <div className="login2">
      <section className="login2-left">
        {expired ? (
          <form className="login2-form" onSubmit={resend}>
            <img src="/brand/helora-wordmark.png" alt="Helora" className="login2-logo" />
            <h1>Link expirado</h1>
            <p className="login2-sub">Por segurança, o link vale por 1 hora e só pode ser usado uma vez. Digite seu e-mail para receber um novo.</p>
            {error && <div className="login-error">{error}</div>}
            {sent && <div className="login-info">Pronto! Se o e-mail estiver cadastrado, o novo link chega em instantes. Confira também o spam.</div>}
            <label className="login-field"><span>E-mail</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" autoFocus /></label>
            <button type="submit" className="login2-submit" disabled={loading || sent}>{loading ? "Enviando..." : "Enviar novo link"}</button>
            <button type="button" className="login-link" onClick={onDone}>Voltar para o login</button>
          </form>
        ) : (
          <form className="login2-form" onSubmit={submit}>
            <img src="/brand/helora-wordmark.png" alt="Helora" className="login2-logo" />
            <h1>Crie sua nova senha</h1>
            <p className="login2-sub">Escolha uma senha forte. Você entra direto depois de salvar.</p>
            {error && <div className="login-error">{error}</div>}
            {ok && <div className="login-info">Senha alterada! Entrando…</div>}
            <label className="login-field">
              <span>Nova senha</span>
              <div className="rp-pass">
                <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="new-password" placeholder="••••••••" />
                <button type="button" onClick={() => setShow((v) => !v)} title={show ? "Esconder" : "Mostrar"}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </label>
            <div className="rp-meter"><span style={{ width: `${(passed / RULES.length) * 100}%`, background: ["#ff3b30", "#ff9f0a", "#ffcc00", "#34c759"][passed] }} /></div>
            <ul className="rp-rules">{RULES.map(([l, fn]) => <li key={l} className={fn(password) ? "ok" : ""}><Check size={13} /> {l}</li>)}</ul>
            <label className="login-field"><span>Repita a nova senha</span><input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="••••••••" /></label>
            {confirm && password !== confirm && <small className="rp-miss">As senhas não são iguais.</small>}
            <button type="submit" className="login2-submit" disabled={loading || ok}>{loading ? "Salvando..." : "Salvar nova senha"}</button>
          </form>
        )}
      </section>
      <LoginArt />
    </div>
  );
}
