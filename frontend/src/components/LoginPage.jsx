import React, { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { forgotPasswordApi } from "../api.js";
import LoginArt from "./LoginArt.jsx";

export default function LoginPage() {
  const [mode, setMode] = useState("login"); // login | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(() => {
    try {
      if (sessionStorage.getItem("helora_session_expired")) {
        sessionStorage.removeItem("helora_session_expired");
        return "Sua sessão expirou por segurança. Entre novamente para continuar.";
      }
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    if (mode === "forgot") {
      try {
        const r = await forgotPasswordApi(email.trim());
        setInfo(r.message);
      } catch (err) {
        setError(err.response?.data?.error || "Não foi possível enviar agora. Tente de novo.");
      }
      setLoading(false);
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(/confirm/i.test(signInError.message) ? "Seu e-mail ainda não foi confirmado. Peça ao gestor para definir sua senha." : "E-mail ou senha inválidos.");
    }
    // Se der certo, o App.jsx escuta onAuthStateChange e troca de tela sozinho.
  };

  return (
    <div className="login2">
      <section className="login2-left">
        <form className="login2-form" onSubmit={handleSubmit}>
          <img src="/brand/helora-wordmark.png" alt="Helora" className="login2-logo" />
          <h1>{mode === "login" ? "Bem-vindo de volta" : "Recuperar senha"}</h1>
          <p className="login2-sub">
            {mode === "login" ? "Entre com seu e-mail e senha para acessar o painel." : "Enviaremos um link para você criar uma nova senha."}
          </p>

          {error && <div className="login-error">{error}</div>}
          {info && <div className="login-info">{info}</div>}

          <label className="login-field">
            <span>E-mail</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" autoFocus autoComplete="email" />
          </label>

          {mode === "login" && (
            <label className="login-field">
              <span>Senha</span>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </label>
          )}

          <button type="submit" className="login2-submit" disabled={loading}>
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Enviar link"}
          </button>

          <button
            type="button"
            className="login-link"
            onClick={() => {
              setMode(mode === "login" ? "forgot" : "login");
              setError(null);
              setInfo(null);
            }}
          >
            {mode === "login" ? "Esqueci minha senha" : "Voltar para o login"}
          </button>

          <p className="login2-foot">© {new Date().getFullYear()} Helora · Atendimento inteligente</p>
        </form>
      </section>

      <LoginArt />
    </div>
  );
}
