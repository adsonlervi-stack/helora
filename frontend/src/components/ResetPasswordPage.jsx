import React, { useState } from "react";
import { supabase } from "../supabaseClient.js";

/** Aberta pelo link do e-mail "recuperar senha": define a nova senha. */
export default function ResetPasswordPage({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirm) return setError("As senhas não são iguais.");
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) return setError("Link expirado ou inválido. Peça um novo em “Esqueci minha senha”.");
    setOk(true);
    window.history.replaceState(null, "", window.location.pathname);
    setTimeout(onDone, 1500);
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <img src="/brand/helora-wordmark.png" alt="Helora" className="login-logo-img" />
        <p className="login-subtitle">Crie sua nova senha</p>
        {error && <div className="login-error">{error}</div>}
        {ok && <div className="login-info">Senha alterada! Entrando…</div>}
        <label className="login-field"><span>Nova senha</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></label>
        <label className="login-field"><span>Repita a nova senha</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <button type="submit" disabled={loading || ok}>{loading ? "Salvando..." : "Salvar nova senha"}</button>
      </form>
    </div>
  );
}
