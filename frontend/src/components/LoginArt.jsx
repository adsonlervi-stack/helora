import React, { useEffect, useRef, useState } from "react";

/** Rede neural em forma de cérebro: pontos que flutuam, ligações e pulsos de luz correndo. */
function NeuralBrain() {
  const ref = useRef();
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext("2d");
    let w = 0, h = 0, raf, t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    // Silhueta do cérebro (vista lateral) feita de dois lobos + cerebelo + tronco
    const inside = (x, y) => {
      const e = (cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
      return e(0.42, 0.42, 0.34, 0.27) || e(0.62, 0.45, 0.3, 0.25) || e(0.5, 0.55, 0.36, 0.2) || e(0.7, 0.66, 0.14, 0.09) || (x > 0.55 && x < 0.62 && y > 0.6 && y < 0.86);
    };
    const nodes = [];
    while (nodes.length < 280) {
      const x = Math.random(), y = Math.random();
      if (inside(x, y)) nodes.push({ x, y, ox: x, oy: y, p: Math.random() * 6.28, r: 1 + Math.random() * 2.2 });
    }
    const links = [];
    nodes.forEach((a, i) => nodes.forEach((b, j) => { if (j > i && Math.hypot(a.x - b.x, a.y - b.y) < 0.07) links.push([i, j]); }));
    const pulses = Array.from({ length: 40 }, () => ({ l: links[(Math.random() * links.length) | 0], k: Math.random(), s: 0.006 + Math.random() * 0.012 }));
    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      const S = Math.min(w, h * 1.25), ox = (w - S) / 2, oy = (h - S * 0.8) / 2;
      const P = (n) => [ox + n.x * S, oy + n.y * S * 0.8];
      for (const n of nodes) { n.x = n.ox + Math.sin(t + n.p) * 0.004; n.y = n.oy + Math.cos(t * 0.8 + n.p) * 0.004; }
      ctx.lineWidth = 0.7;
      for (const [i, j] of links) {
        const [x1, y1] = P(nodes[i]), [x2, y2] = P(nodes[j]);
        ctx.strokeStyle = `rgba(170,215,255,${0.28 + 0.15 * Math.sin(t * 2 + i)})`;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      for (const n of nodes) {
        const [x, y] = P(n), a = 0.55 + 0.45 * Math.sin(t * 3 + n.p);
        ctx.fillStyle = `rgba(210,235,255,${a})`;
        ctx.shadowColor = "#7cc4ff"; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(x, y, n.r, 0, 6.28); ctx.fill();
      }
      for (const p of pulses) {
        p.k += p.s;
        if (p.k >= 1) { p.k = 0; p.l = links[(Math.random() * links.length) | 0]; }
        const [x1, y1] = P(nodes[p.l[0]]), [x2, y2] = P(nodes[p.l[1]]);
        ctx.fillStyle = "#ffffff"; ctx.shadowColor = "#9fe0ff"; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(x1 + (x2 - x1) * p.k, y1 + (y2 - y1) * p.k, 2.4, 0, 6.28); ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="la-brain" />;
}

function SceneChat() {
  return (
    <div className="la-scene la-chat-scene">
      <span className="login2-pill la-in" style={{ "--d": "0s" }}>WhatsApp · Instagram · Messenger</span>
      <h2 className="la-in" style={{ "--d": ".1s" }}>Todo o atendimento da sua empresa em um só lugar.</h2>
      <p className="la-in" style={{ "--d": ".2s" }}>Bot que responde 24h, equipe por setores, pipeline de vendas e campanhas, tudo conectado ao seu WhatsApp.</p>
      <div className="login2-chat la-pop" style={{ "--d": ".3s" }}>
        <div className="lc-head">
          <span className="lc-avatar">M</span>
          <div><strong>Maria Souza</strong><small>digitando…</small></div>
          <span className="lc-tag">Comercial</span>
        </div>
        <div className="lc-msg in la-msg" style={{ "--d": ".9s" }}>Oi! Queria uma cotação do seguro do meu carro 🚗</div>
        <div className="lc-typing la-msg" style={{ "--d": "1.6s" }}><i /><i /><i /></div>
        <div className="lc-msg out bot la-msg" style={{ "--d": "2.6s" }}><b>Bot Helora</b>Olá, Maria! Já te passo para um especialista. 😊</div>
        <div className="lc-msg out la-msg" style={{ "--d": "3.8s" }}><b>Ana:</b> Oi Maria, me envia a placa que eu faço agora mesmo!</div>
        <div className="lc-ticks la-msg" style={{ "--d": "4.6s" }}>✓✓ lido</div>
      </div>
    </div>
  );
}

function SceneAI() {
  return (
    <div className="la-scene la-ai2">
      <span className="login2-pill la-in" style={{ "--d": "0s" }}>IA Helora</span>
      <h2 className="la-in" style={{ "--d": ".1s" }}>Sua equipe e a IA trabalhando juntas, sem pausa.</h2>
      <div className="la-orbit la-pop" style={{ "--d": ".3s" }}>
        <NeuralBrain />
        <div className="la-ring r1"><span>WhatsApp</span><span>Instagram</span></div>
        <div className="la-ring r2"><span>Messenger</span><span>E-mail</span></div>
        <div className="la-card c1 la-msg" style={{ "--d": "1.2s" }}>⚡ Respondeu em 2s</div>
        <div className="la-card c2 la-msg" style={{ "--d": "2s" }}>🔥 Lead quente no funil</div>
        <div className="la-card c3 la-msg" style={{ "--d": "2.8s" }}>📄 Cotação enviada</div>
      </div>
    </div>
  );
}

const SCENES = [SceneChat, SceneAI];
const STAY = 9000, OUT = 700;

/** Painel animado do login: as cenas entram, ficam, saem e voltam em ciclo. */
export default function LoginArt() {
  const [i, setI] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), STAY);
    const b = setTimeout(() => { setLeaving(false); setI((x) => (x + 1) % SCENES.length); }, STAY + OUT);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [i]);
  const Scene = SCENES[i];
  return (
    <section className={`login2-right la-root la-s${i}`} aria-hidden="true">
      <div className="login2-glow g1" />
      <div className="login2-glow g2" />
      <div className="la-grid" />
      <div key={i} className={`la-stage ${leaving ? "out" : ""}`}><Scene /></div>
      <div className="la-dots">{SCENES.map((_, j) => <span key={j} className={j === i ? "on" : ""} />)}</div>
    </section>
  );
}
