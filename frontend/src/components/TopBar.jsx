import React from "react";
import { SECTION_TITLES } from "../navConfig.js";

// O usuário logado agora aparece no rodapé da sidebar (desktop) e no sheet
// "Mais" da barra inferior (mobile) — o topbar fica só com o título da
// seção e o status do WhatsApp, igual ao sistema de referência.
export default function TopBar({ section, whatsappStatus, onOpenConnect }) {
  const connected = whatsappStatus === "connected";

  return (
    <header className="topbar">
      <h1 className="topbar-title">{SECTION_TITLES[section]}</h1>

      <div className="topbar-right">
        <button
          className={`wa-chip ${connected ? "connected" : ""}`}
          onClick={onOpenConnect}
        >
          <span className={`status-dot ${connected ? "online" : ""}`} />
          {connected ? "WhatsApp conectado" : "Conectar WhatsApp"}
        </button>
      </div>
    </header>
  );
}
