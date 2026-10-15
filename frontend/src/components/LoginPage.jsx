import React, { useState } from "react";
import { supabase } from "../supabaseClient.js";
import { forgotPasswordApi } from "../api.js";

export default function LoginPage() {
  const [mode, setMode] = useState("login"); // login | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
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
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src="/brand/helora-wordmark.png" alt="Helora" className="login-logo-img" />
        <p className="login-subtitle">{mode === "login" ? "Entre com sua conta para continuar" : "Enviaremos um link para criar uma nova senha"}</p>

        {error && <div className="login-error">{error}</div>}
        {info && <div className="login-info">{info}</div>}

        <label className="login-field">
          <span>E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" autoFocus />
        </label>

        {mode === "login" && (
          <label className="login-field">
            <span>Senha</span>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </label>
        )}

        <button type="submit" disabled={loading}>
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
      </form>
    </div>
  );
}
