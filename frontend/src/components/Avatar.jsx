import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

function initials(name = "") {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

// Avatar genérico: mostra a foto (avatarUrl) quando existe, senão as iniciais.
// zoomable: clicar na foto abre ela em tamanho grande.
export default function Avatar({ name, url, size = 32, className = "", zoomable = false }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  const canZoom = zoomable && !!url;
  return (
    <>
      <div
        className={`avatar-circle ${canZoom ? "avatar-zoom" : ""} ${className}`}
        style={{ width: size, height: size, minWidth: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
        onClick={canZoom ? (e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); } : undefined}
        title={canZoom ? "Ver foto" : undefined}
      >
        {url ? <img src={url} alt={name || "Avatar"} /> : initials(name)}
      </div>
      {open && createPortal(
        <div className="avatar-lightbox" onClick={() => setOpen(false)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={url} alt={name || "Foto"} />
            {name && <figcaption>{name}</figcaption>}
          </figure>
          <button type="button" className="avatar-lightbox-x" onClick={() => setOpen(false)} aria-label="Fechar"><X size={20} /></button>
        </div>,
        document.body
      )}
    </>
  );
}
