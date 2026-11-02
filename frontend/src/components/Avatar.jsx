import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

function initials(name = "") {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}


// ---------- Bonequinho quando não tem foto ----------
const FEM_EXC = new Set(["luca", "joshua", "nicola", "andrea", "jonatha", "elba"]);
const MASC_EXC = new Set(["beatriz", "raquel", "isabel", "ester", "rute", "miriam", "carmen", "lourdes", "ingrid", "liz", "luz", "ruth", "esther", "mercedes", "dolores", "inês", "ines", "aline", "alice", "simone", "ivone", "denise", "elaine", "jaqueline", "kelly", "suely", "sueli", "nathaly", "evelyn", "karen", "ellen", "noemi", "rosemary", "gisele", "michele", "cristiane", "viviane", "daiane", "tatiane", "eliane", "rosane", "luciane", "jane", "joyce", "janete", "ivete", "marlene", "irene", "solange", "cleide", "neide", "clarice", "adele", "rose", "nicole", "danielle", "gabrielle", "michelle", "yasmin", "lais", "thais", "iris", "cleo", "mel", "abigail"]);
const MASC_A = new Set(["luca", "joshua", "nicola", "andrea", "jonatha", "elba", "costa", "silva"]);
export function guessGender(name = "") {
  const first = String(name).trim().split(/\s+/)[0]?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
  if (!/^[a-z]+$/.test(first)) return "m";
  if (MASC_EXC.has(first)) return "f";
  if (MASC_A.has(first) || FEM_EXC.has(first)) return "m";
  return /a$/.test(first) ? "f" : "m";
}
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export const CARTOON_BG = ["#d8ecfb", "#e6dcf7", "#dfe3fb", "#fde2e7", "#feead6", "#d9f3e3"];
/** "avatar:f:3" → bonequinho 3D. Sem escolha salva, usa o nome (gênero) e um número fixo. */
export function cartoonPick(name, choice) {
  const m = /^avatar:([mf]):(\d+)$/.exec(choice || "");
  const g = m ? m[1] : guessGender(name);
  const n = (m ? Number(m[2]) : hash(name || "?")) % 12;
  return { g, n, src: `/avatars3d/${g}${n}.webp`, bg: CARTOON_BG[(n + (g === "f" ? 0 : 3)) % CARTOON_BG.length] };
}
export const cartoonUrl = (name, choice) => cartoonPick(name, choice).src;
export const isCartoon = (url) => !url || /^avatar:/.test(url);

// Avatar genérico: mostra a foto (avatarUrl) quando existe, senão as iniciais.
// zoomable: clicar na foto abre ela em tamanho grande.
export default function Avatar({ name, url, size = 32, className = "", zoomable = false, initials: useInitials = false }) {
  const [bad, setBad] = useState(false);
  const cartoon = !useInitials && isCartoon(url) && !bad;
  const pick = cartoon ? cartoonPick(name, url) : null;
  const src = cartoon ? pick.src : (isCartoon(url) ? null : url);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  const canZoom = zoomable && !!url && !isCartoon(url);
  return (
    <>
      <div
        className={`avatar-circle ${canZoom ? "avatar-zoom" : ""} ${className}`}
        style={{ width: size, height: size, minWidth: size, fontSize: Math.max(10, Math.round(size * 0.36)), ...(pick ? { background: pick.bg } : {}) }}
        onClick={canZoom ? (e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); } : undefined}
        title={canZoom ? "Ver foto" : undefined}
      >
        {src ? <img src={src} alt={name || "Avatar"} className={pick ? "av3d" : undefined} onError={() => setBad(true)} /> : initials(name)}
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
