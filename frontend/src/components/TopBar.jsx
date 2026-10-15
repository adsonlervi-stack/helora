import React, { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { SECTION_TITLES } from "../navConfig.js";
import { notifyEnabled, enableNotify, disableNotify, notifySupported } from "../notifications.js";

// Topo: só o título da seção e o sino de notificações.
// (A conexão do WhatsApp fica na aba Canais.)
export default function TopBar({ section, hideNotifications }) {
  const [on, setOn] = useState(notifyEnabled());

  const toggle = async () => {
    if (on) {
      disableNotify();
      setOn(false);
    } else {
      setOn(await enableNotify());
    }
  };

  return (
    <header className="topbar lg-bar">
      <h1 className="topbar-title">{SECTION_TITLES[section]}</h1>
      <div className="topbar-right">
        {!hideNotifications && notifySupported() && (
          <button className={`pill-btn ${on ? "on" : ""}`} onClick={toggle} title={on ? "Desativar notificações" : "Ativar notificações com som"}>
            {on ? <Bell size={15} /> : <BellOff size={15} />}
            {on ? "Notificações ativas" : "Ativar notificações"}
          </button>
        )}
      </div>
    </header>
  );
}
