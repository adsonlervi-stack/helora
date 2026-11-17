import React, { useEffect, useRef, useState } from "react";

/** Mascote Helora: bola branca com olhos que piscam e seguem o mouse. */
export default function HeloraMascot({ size = 32, tile = true }) {
  const ref = useRef(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let t;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        if (Math.random() < 0.3) setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 120); }, 260);
        loop();
      }, 2500 + Math.random() * 3500);
    };
    loop();
    const move = (e) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.max(1, Math.hypot(dx, dy));
      const k = Math.min(1, d / 300);
      setLook({ x: (dx / d) * 9 * k, y: (dy / d) * 7 * k });
    };
    window.addEventListener("mousemove", move);
    return () => { clearTimeout(t); window.removeEventListener("mousemove", move); };
  }, []);
  const sy = blink ? 0.1 : 1;
  return (
    <svg ref={ref} className="helora-mascot" width={size} height={size} viewBox="0 0 200 200" aria-label="Helora">
      <defs>
        <linearGradient id="hmT" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stopColor="#1b7cff" /><stop offset=".55" stopColor="#0050c8" /><stop offset="1" stopColor="#0a2a8a" /></linearGradient>
        <radialGradient id="hmB" cx=".35" cy=".28" r=".85"><stop offset="0" stopColor="#fff" /><stop offset=".7" stopColor="#eef3fb" /><stop offset="1" stopColor="#cfdaeb" /></radialGradient>
      </defs>
      {tile && <rect width="200" height="200" rx="48" fill="url(#hmT)" />}
      <circle cx="100" cy="100" r={tile ? 66 : 92} fill="url(#hmB)" />
      <g style={{ transform: `translate(${look.x}px, ${look.y}px)`, transition: "transform .25s ease-out" }}>
        <g style={{ transformOrigin: "100px 94px", transform: `scaleY(${sy})`, transition: "transform .08s" }}>
          <rect x="76" y="78" width="14" height="32" rx="7" fill="#101820" />
          <rect x="110" y="78" width="14" height="32" rx="7" fill="#101820" />
        </g>
      </g>
    </svg>
  );
}
