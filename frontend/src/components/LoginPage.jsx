import React, { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { forgotPasswordApi } from "../api.js";

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

      <section className="login2-right" aria-hidden="true">
        <div className="login2-glow g1" />
        <div className="login2-glow g2" />
        <div className="login2-hero">
          <span className="login2-pill">WhatsApp · Instagram · Messenger</span>
          <h2>Todo o atendimento da sua empresa, num só lugar.</h2>
          <p>Bot que responde 24h, equipe organizada por setores, pipeline de vendas e campanhas — tudo conectado ao seu WhatsApp.</p>

          <div className="login2-chat">
            <div className="lc-head">
              <span className="lc-avatar">M</span>
              <div>
                <strong>Maria Souza</strong>
                <small>digitando…</small>
              </div>
              <span className="lc-tag">Comercial</span>
            </div>
            <div className="lc-msg in">Oi! Queria uma cotação do seguro do meu carro 🚗</div>
            <div className="lc-msg out bot"><b>Bot Helora</b>Olá, Maria! Já te passo para um especialista. 😊</div>
            <div className="lc-msg out"><b>Ana:</b> Oi Maria, me envia a placa que eu faço agora mesmo!</div>
            <div className="lc-ticks">✓✓ lido</div>
          </div>

          <ul className="login2-feats">
            <li><span>🤖</span> Fluxos de bot sem código</li>
            <li><span>👥</span> Vários atendentes no mesmo número</li>
            <li><span>📈</span> Pipeline e campanhas</li>
            <li><span>📱</span> Funciona no celular como app</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
