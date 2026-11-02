import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { createAvatar } from "@dicebear/core";
import * as avataaars from "@dicebear/avataaars";

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
const FEM_TOP = ["bigHair", "bob", "bun", "curly", "curvy", "longButNotTooLong", "miaWallace", "straight01", "straight02", "straightAndStrand"];
const MASC_TOP = ["shortCurly", "shortFlat", "shortRound", "shortWaved", "sides", "theCaesar", "theCaesarAndSidePart", "frizzle"];
const BG = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "c7f0d8"];
const cache = new Map();
/** "avatar:f:3" → bonequinho (SVG gerado no navegador). Sem escolha salva, usa o nome (gênero) e um número fixo. */
export function cartoonUrl(name, choice) {
  let g, n;
  const m = /^avatar:([mf]):(\d+)$/.exec(choice || "");
  if (m) { g = m[1]; n = Number(m[2]); } else { g = guessGender(name); n = hash(name || "?") % 12; }
  const key = `${g}${n}`;
  if (cache.has(key)) return cache.get(key);
  const svg = createAvatar(avataaars, {
    seed: `helora-${key}`,
    top: g === "f" ? FEM_TOP : MASC_TOP,
    facialHairProbability: g === "f" ? 0 : 30,
    accessoriesProbability: 15,
    accessories: ["prescription01", "prescription02", "round"],
    skinColor: ["614335", "d08b5b", "ae5d29", "edb98a", "ffdbb4"],
    hairColor: ["2c1b18", "4a312c", "724133", "a55728", "b58143", "d6b370"],
    facialHair: ["beardLight", "beardMedium", "moustacheFancy"],
    clothing: ["blazerAndShirt", "blazerAndSweater", "collarAndSweater", "hoodie", "shirtCrewNeck", "shirtScoopNeck", "shirtVNeck"],
    clothesColor: ["262e33", "5199e4", "25557c", "3c4f5c", "929598", "65c9ff", "ff5c5c", "e6e6e6"],
    mouth: ["smile", "default", "twinkle"],
    eyes: ["default", "happy", "wink"],
    eyebrows: ["default", "defaultNatural", "raisedExcited"],
    backgroundColor: [BG[n % BG.length]],
    backgroundType: ["solid"]
  }).toDataUri();
  cache.set(key, svg);
  return svg;
}
export const isCartoon = (url) => !url || /^avatar:/.test(url);

// Avatar genérico: mostra a foto (avatarUrl) quando existe, senão as iniciais.
// zoomable: clicar na foto abre ela em tamanho grande.
export default function Avatar({ name, url, size = 32, className = "", zoomable = false, initials: useInitials = false }) {
  const [bad, setBad] = useState(false);
  const cartoon = !useInitials && isCartoon(url) && !bad;
  const src = cartoon ? cartoonUrl(name, url) : (isCartoon(url) ? null : url);
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
        style={{ width: size, height: size, minWidth: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
        onClick={canZoom ? (e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); } : undefined}
        title={canZoom ? "Ver foto" : undefined}
      >
        {src ? <img src={src} alt={name || "Avatar"} onError={() => setBad(true)} /> : initials(name)}
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
