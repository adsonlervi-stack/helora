import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Network, ChevronDown, ChevronRight, FileText, RefreshCw, Maximize2 } from "lucide-react";
import { integrations } from "../api.js";

/** Categorias do cérebro (cor de cada uma no grafo). */
export const CATS = {
  texto: ["Textos", "#0071e3"],
  pdf: ["PDFs", "#ff9500"],
  word: ["Word", "#5856d6"],
  planilha: ["Planilhas", "#34c759"],
  site: ["Sites", "#5ac8fa"],
  google_docs: ["Google Docs", "#007aff"],
  google_sheets: ["Google Planilhas", "#30b158"],
  google_slides: ["Google Apresentações", "#ffb800"],
  google_drive: ["Google Drive", "#64748b"],
  email: ["E-mails", "#ff3b30"],
  formulario: ["Formulários", "#af52de"],
  conversas: ["Aprendido das conversas", "#ff2d55"],
  tema: ["Temas", "#a1a1aa"]
};
const cat = (s) => CATS[s] || [s, "#8e8e93"];

/** Cérebro em grafo: vault (lista) + mapa vivo com física, filtro por tipo e busca. */
export default function BrainGraph({ onOpenDoc }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [vq, setVq] = useState("");
  const [off, setOff] = useState(() => new Set());
  const [physics, setPhysics] = useState(true);
  const [hover, setHover] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const load = () => { setData(null); integrations.brainGraph().then(setData).catch(() => setData({ nodes: [], links: [] })); };
  useEffect(() => { load(); }, []);

  const docs = useMemo(() => (data?.nodes || []).filter((n) => n.type === "doc"), [data]);
  const counts = useMemo(() => {
    const c = {};
    for (const n of data?.nodes || []) c[n.source] = (c[n.source] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [data]);
  const tree = useMemo(() => {
    const g = {};
    for (const d of docs) {
      if (vq && !d.label.toLowerCase().includes(vq.toLowerCase())) continue;
      (g[d.source] = g[d.source] || []).push(d);
    }
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  }, [docs, vq]);

  return (
    <div className="bg-wrap">
      <aside className="bg-vault">
        <div className="bg-vault-h"><span>Vault ({docs.length})</span><button className="cx-x" title="Atualizar" onClick={load}><RefreshCw size={14} /></button></div>
        <div className="bg-search"><Search size={14} /><input placeholder="Buscar documento…" value={vq} onChange={(e) => setVq(e.target.value)} /></div>
        <div className="bg-tree">
          {tree.map(([src, list]) => {
            const isOpen = open.has(src) || !!vq;
            const [label, color] = cat(src);
            return (
              <div key={src}>
                <button className="bg-folder" onClick={() => setOpen((s) => { const n = new Set(s); n.has(src) ? n.delete(src) : n.add(src); return n; })}>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<i style={{ background: color }} />{label}<small>{list.length}</small>
                </button>
                {isOpen && list.map((d) => (
                  <button key={d.id} className={`bg-file ${hover === d.id ? "on" : ""}`} onMouseEnter={() => setHover(d.id)} onMouseLeave={() => setHover(null)} onClick={() => onOpenDoc?.(d.id)}>
                    <FileText size={13} /><span>{d.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
          {data && !docs.length && <div className="bg-empty">O cérebro ainda está vazio. Ensine a IA logo abaixo e veja o mapa crescer.</div>}
        </div>
      </aside>
      <section className="bg-graph">
        <div className="bg-top">
          <span className="bg-title"><Network size={15} /> Mapa do cérebro</span>
          <div className="bg-search sm"><Search size={14} /><input placeholder="Buscar no mapa…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <label className="bg-phys"><input type="checkbox" checked={physics} onChange={(e) => setPhysics(e.target.checked)} /> Física</label>
        </div>
        {data ? <Canvas data={data} off={off} q={q} physics={physics} hoverId={hover} onOpenDoc={onOpenDoc} /> : <div className="bg-loading">Montando o mapa…</div>}
        {!!counts.length && (
          <div className="bg-legend">
            <small>Filtrar</small>
            {counts.map(([src, n]) => {
              const [label, color] = cat(src);
              return (
                <button key={src} className={off.has(src) ? "off" : ""} onClick={() => setOff((s) => { const x = new Set(s); x.has(src) ? x.delete(src) : x.add(src); return x; })}>
                  <i style={{ background: color }} />{label}<b>{n}</b>
                </button>
              );
            })}
          </div>
        )}
        {data && <div className="bg-foot">{data.nodes.length} itens · {data.links.length} ligações</div>}
      </section>
    </div>
  );
}

/** Desenho do grafo com uma simulação de forças simples (repulsão, molas e gravidade). */
function Canvas({ data, off, q, physics, hoverId, onOpenDoc }) {
  const ref = useRef(null);
  const st = useRef(null);
  const [tip, setTip] = useState(null);

  // Monta os nós uma vez por carga (mantém posições ao filtrar).
  useEffect(() => {
    const nodes = data.nodes.map((n, i) => {
      const a = (i / Math.max(1, data.nodes.length)) * Math.PI * 2 * 7;
      const r = 40 + Math.sqrt(i) * 14;
      return { ...n, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, deg: 0 };
    });
    const idx = new Map(nodes.map((n) => [n.id, n]));
    const links = data.links.map((l) => ({ a: idx.get(l.s), b: idx.get(l.t), k: l.k })).filter((l) => l.a && l.b);
    for (const l of links) { l.a.deg++; l.b.deg++; }
    st.current = { nodes, links, view: { x: 0, y: 0, k: 1 }, drag: null, pan: null, alpha: 1 };
  }, [data]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let raf;
    const ql = q.trim().toLowerCase();
    const frame = () => {
      const s = st.current;
      if (!s) { raf = requestAnimationFrame(frame); return; }
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      const vis = s.nodes.filter((n) => !off.has(n.source));
      const visSet = new Set(vis);
      const links = s.links.filter((l) => visSet.has(l.a) && visSet.has(l.b));

      // Física
      if (physics) {
        s.alpha = Math.max(s.alpha * 0.995, 0.06);
        const A = s.alpha;
        for (let i = 0; i < vis.length; i++) {
          const a = vis[i];
          for (let j = i + 1; j < vis.length; j++) {
            const b = vis[j];
            let dx = a.x - b.x, dy = a.y - b.y;
            let d2 = dx * dx + dy * dy || 0.01;
            if (d2 > 90000) continue;
            const f = (420 * A) / d2;
            dx *= f; dy *= f;
            a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
          }
        }
        for (const l of links) {
          const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const target = l.k === "doc" ? 26 : 60;
          const f = ((d - target) / d) * 0.04 * A * 4;
          l.a.vx += dx * f; l.a.vy += dy * f; l.b.vx -= dx * f; l.b.vy -= dy * f;
        }
        const t = performance.now() / 1000;
        for (const n of vis) {
          n.vx -= n.x * 0.004 * A * 4; n.vy -= n.y * 0.004 * A * 4;
          // leve respiração para o mapa nunca parar de vez
          n.vx += Math.sin(t * 0.7 + n.x * 0.01) * 0.015; n.vy += Math.cos(t * 0.6 + n.y * 0.01) * 0.015;
          if (s.drag?.node === n) continue;
          n.vx *= 0.82; n.vy *= 0.82;
          n.x += n.vx; n.y += n.vy;
        }
      }

      // Enquadra sozinho até o usuário mexer no zoom/arrastar
      if (!s.touched && vis.length) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const n of vis) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
        const bw = Math.max(80, x1 - x0), bh = Math.max(80, y1 - y0);
        const kk = Math.min(3, Math.max(0.35, Math.min((w - 260) / bw, (h - 80) / bh) * 0.85));
        s.view.k += (kk - s.view.k) * 0.08;
        s.view.x += (-((x0 + x1) / 2) * s.view.k - 60 - s.view.x) * 0.08;
        s.view.y += (-((y0 + y1) / 2) * s.view.k - s.view.y) * 0.08;
      }
      // Desenho
      const { x: vx, y: vy, k } = s.view;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2 + vx, h / 2 + vy);
      ctx.scale(k, k);
      const focus = hoverId || s.hover?.id;
      const near = new Set();
      if (focus) for (const l of links) { if (l.a.id === focus) near.add(l.b.id); if (l.b.id === focus) near.add(l.a.id); }
      ctx.lineWidth = 0.6 / k;
      for (const l of links) {
        const hot = focus && (l.a.id === focus || l.b.id === focus);
        ctx.strokeStyle = hot ? "rgba(0,113,227,0.55)" : "rgba(60,60,67,0.10)";
        ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
      }
      for (const n of vis) {
        const color = cat(n.source)[1];
        const r = n.type === "doc" ? 5.5 + Math.min(7, Math.sqrt(n.deg)) : n.type === "tema" ? 2 + Math.min(4, n.deg * 0.6) : 3 + Math.min(2.5, n.deg * 0.25);
        const match = ql && (n.label || "").toLowerCase().includes(ql);
        const dim = (ql && !match) || (focus && n.id !== focus && !near.has(n.id));
        ctx.globalAlpha = dim ? 0.18 : 1;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
        if (n.type === "doc" || match || n.id === focus) {
          ctx.lineWidth = 1.2 / k; ctx.strokeStyle = "#fff"; ctx.stroke();
        }
        if ((n.type === "doc" && (k > 1.3 || vis.length < 60)) || (n.type === "tema" && k > 1.8) || n.id === focus || match) {
          ctx.globalAlpha = dim ? 0.25 : 0.9;
          ctx.fillStyle = "#1d1d1f";
          ctx.font = `${11 / k}px -apple-system, BlinkMacSystemFont, Inter, sans-serif`;
          ctx.fillText(String(n.label || "").slice(0, 40), n.x + r + 3 / k, n.y + 3.5 / k);
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [off, q, physics, hoverId, data]);

  // Interação: arrastar nó, arrastar fundo, zoom e clique
  const toWorld = (e) => {
    const s = st.current, r = ref.current.getBoundingClientRect();
    return { x: (e.clientX - r.left - r.width / 2 - s.view.x) / s.view.k, y: (e.clientY - r.top - r.height / 2 - s.view.y) / s.view.k };
  };
  const hit = (p) => {
    const s = st.current; let best = null, bd = 100;
    for (const n of s.nodes) {
      if (off.has(n.source)) continue;
      const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
      if (d < bd / s.view.k) { bd = d; best = n; }
    }
    return best;
  };
  const down = (e) => {
    const s = st.current; if (!s) return;
    const n = hit(toWorld(e));
    if (n) { s.drag = { node: n, moved: false }; s.alpha = Math.max(s.alpha, 0.4); }
    else { s.touched = true; s.pan = { x: e.clientX - s.view.x, y: e.clientY - s.view.y }; }
  };
  const move = (e) => {
    const s = st.current; if (!s) return;
    if (s.drag) { const p = toWorld(e); s.drag.node.x = p.x; s.drag.node.y = p.y; s.drag.node.vx = s.drag.node.vy = 0; s.drag.moved = true; return; }
    if (s.pan) { s.view.x = e.clientX - s.pan.x; s.view.y = e.clientY - s.pan.y; return; }
    const n = hit(toWorld(e));
    s.hover = n;
    setTip(n ? { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, n } : null);
    ref.current.style.cursor = n ? "pointer" : "grab";
  };
  const up = () => {
    const s = st.current; if (!s) return;
    if (s.drag && !s.drag.moved) { const n = s.drag.node; if (n.type !== "tema") onOpenDoc?.(n.type === "doc" ? n.id : n.docId); }
    s.drag = null; s.pan = null;
  };
  const wheel = (e) => {
    const s = st.current; if (!s) return;
    e.preventDefault();
    s.touched = true;
    const f = Math.exp(-e.deltaY * 0.0015);
    const k = Math.min(4, Math.max(0.3, s.view.k * f));
    const r = ref.current.getBoundingClientRect();
    const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
    s.view.x = mx - ((mx - s.view.x) * k) / s.view.k;
    s.view.y = my - ((my - s.view.y) * k) / s.view.k;
    s.view.k = k;
  };
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => cv.removeEventListener("wheel", wheel);
  });
  const reset = () => { const s = st.current; if (s) { s.touched = false; s.alpha = 1; } };

  return (
    <div className="bg-canvas-wrap">
      <canvas ref={ref} className="bg-canvas" onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={() => { up(); setTip(null); if (st.current) st.current.hover = null; }} />
      <button className="bg-reset" title="Centralizar" onClick={reset}><Maximize2 size={14} /></button>
      {tip && (
        <div className="bg-tip" style={{ left: tip.x + 14, top: tip.y + 10 }}>
          <i style={{ background: cat(tip.n.source)[1] }} />
          <strong>{tip.n.type === "doc" ? tip.n.label : tip.n.type === "tema" ? `Tema: ${tip.n.label}` : cat(tip.n.source)[0]}</strong>
          {tip.n.type === "chunk" && <span>{tip.n.excerpt}…</span>}
          {tip.n.type === "doc" && <span>{cat(tip.n.source)[0]}{tip.n.chars ? ` · ${(tip.n.chars / 1000).toFixed(1)} mil caracteres` : ""}</span>}
        </div>
      )}
    </div>
  );
}
