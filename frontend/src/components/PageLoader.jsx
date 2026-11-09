import React, { useEffect, useRef, useState } from "react";

/**
 * Barra de progresso fina no topo (degradê do Helora), estilo Safari/YouTube.
 * Começa no clique da aba, avança sozinha e completa quando os dados chegam. Não bloqueia a tela.
 */
export default function PageLoader({ section }) {
  const [p, setP] = useState(0);
  const [on, setOn] = useState(false);
  const first = useRef(true);
  const t = useRef([]);
  const clear = () => { t.current.forEach(clearTimeout); t.current = []; };
  const finish = () => { clear(); setP(100); t.current.push(setTimeout(() => { setOn(false); setP(0); }, 260)); };
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    clear(); setOn(true); setP(12);
    [[60, 35], [200, 55], [500, 70], [1000, 82], [1800, 90]].forEach(([ms, v]) => t.current.push(setTimeout(() => setP((x) => Math.max(x, v)), ms)));
    t.current.push(setTimeout(() => { if (!window.__heloraNet) finish(); }, 180));
    t.current.push(setTimeout(finish, 4000));
    return clear;
  }, [section]);
  useEffect(() => {
    const on2 = (e) => { window.__heloraNet = e.detail; if (e.detail === 0) setTimeout(() => { if (!window.__heloraNet) setOn((v) => { if (v) finish(); return v; }); }, 80); };
    window.addEventListener("helora:net", on2);
    return () => window.removeEventListener("helora:net", on2);
  }, []);
  if (!on) return null;
  return <div className="pl-bar" style={{ width: `${p}%`, opacity: p >= 100 ? 0 : 1 }} />;
}
