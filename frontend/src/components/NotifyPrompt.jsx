import React, { useState } from "react";
import { Bell, X } from "lucide-react";
import { notifySupported, notifyEnabled, enableNotify } from "../notifications.js";

/** Convite discreto para ligar as notificações do navegador (aparecem no canto da tela). */
export default function NotifyPrompt() {
  const [hide, setHide] = useState(() => {
    try { return !notifySupported() || notifyEnabled() || Notification.permission === "denied" || localStorage.getItem("helora_notify_ask") === "no"; } catch { return true; }
  });
  if (hide) return null;
  return (
    <div className="notify-prompt">
      <Bell size={16} />
      <span>Receber aviso de mensagem nova no canto da tela?</span>
      <button className="pill-btn primary" onClick={async () => { await enableNotify(); setHide(true); }}>Ativar</button>
      <button className="icon-btn" title="Agora não" onClick={() => { try { localStorage.setItem("helora_notify_ask", "no"); } catch {} setHide(true); }}><X size={14} /></button>
    </div>
  );
}
