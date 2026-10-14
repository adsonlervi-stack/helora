import React from "react";

function initials(name = "") {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

// Avatar genérico: mostra a foto do usuário (avatarUrl) quando existe,
// senão cai pras iniciais do nome — usado na sidebar, no sheet mobile e em
// qualquer lugar que hoje mostra "bolinha com iniciais".
export default function Avatar({ name, url, size = 32, className = "" }) {
  return (
    <div
      className={`avatar-circle ${className}`}
      style={{ width: size, height: size, minWidth: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {url ? <img src={url} alt={name || "Avatar"} /> : initials(name)}
    </div>
  );
}
