import React, { useState } from "react";
import { X, UserRound, KeyRound } from "lucide-react";
import { updateMyProfileApi, changeMyPasswordApi } from "../api.js";

/** Meu perfil: qualquer usuário troca o nome e a senha. O e-mail não muda. */
export default function ProfileModal({ profile, email, onClose, onSaved }) {
  const [name, setName] = useState(profile?.name || "");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
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
        {msg && <div className={`admin-feedback ${msg.ok ? "success" : "error"}`}>{msg.text}</div>}
      </div>
    </div>
  );
}
