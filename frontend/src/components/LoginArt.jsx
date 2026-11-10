import React, { useEffect, useRef, useState } from "react";

/** Rede neural em forma de cérebro: pontos que flutuam, ligações e pulsos de luz correndo. */
function NeuralBrain() {
  const ref = useRef();
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext("2d");
    let w = 0, h = 0, raf, t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => { w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    // brilho pronto (desenhar sombra em cada ponto pesa demais)
    const glow = document.createElement("canvas"); glow.width = glow.height = 32;
    const g = glow.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.25, "rgba(200,232,255,.9)"); gr.addColorStop(1, "rgba(120,190,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const inside = (x, y) => {
      const e = (cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
      return e(0.42, 0.42, 0.34, 0.27) || e(0.62, 0.45, 0.3, 0.25) || e(0.5, 0.55, 0.36, 0.2) || e(0.7, 0.66, 0.14, 0.09) || (x > 0.55 && x < 0.62 && y > 0.6 && y < 0.86);
    };
    const nodes = [];
    while (nodes.length < 170) {
      const x = Math.random(), y = Math.random();
      if (inside(x, y)) nodes.push({ x, y, ox: x, oy: y, p: Math.random() * 6.28, r: 5 + Math.random() * 6 });
    }
    const links = [];
    nodes.forEach((a, i) => nodes.forEach((b, j) => { if (j > i && Math.hypot(a.x - b.x, a.y - b.y) < 0.08) links.push([i, j]); }));
    const pulses = Array.from({ length: 30 }, () => ({ l: links[(Math.random() * links.length) | 0], k: Math.random(), s: 0.008 + Math.random() * 0.012 }));
    let last = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || now - last < 30) return; // ~33fps, leve
      last = now; t += 0.03;
      ctx.clearRect(0, 0, w, h);
      const S = Math.min(w, h * 1.25), ox = (w - S) / 2, oy = (h - S * 0.8) / 2;
      const pts = nodes.map((n) => [ox + (n.ox + Math.sin(t + n.p) * 0.004) * S, oy + (n.oy + Math.cos(t * 0.8 + n.p) * 0.004) * S * 0.8]);
      ctx.lineWidth = 0.7; ctx.strokeStyle = "rgba(170,215,255,.32)";
      ctx.beginPath();
      for (const [i, j] of links) { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); }
      ctx.stroke();
      nodes.forEach((n, i) => { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + n.p); ctx.drawImage(glow, pts[i][0] - n.r, pts[i][1] - n.r, n.r * 2, n.r * 2); });
      ctx.globalAlpha = 1;
      for (const p of pulses) {
        p.k += p.s;
        if (p.k >= 1) { p.k = 0; p.l = links[(Math.random() * links.length) | 0]; }
        const [a, b] = [pts[p.l[0]], pts[p.l[1]]];
        ctx.drawImage(glow, a[0] + (b[0] - a[0]) * p.k - 9, a[1] + (b[1] - a[1]) * p.k - 9, 18, 18);
      }
    };
    raf = requestAnimationFrame(draw);
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

function Counter({ to, d = 0 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const run = (now) => { start ??= now + d * 1000; const k = Math.min(1, Math.max(0, (now - start) / 2200)); setV(Math.round(to * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(run); };
    raf = requestAnimationFrame(run); return () => cancelAnimationFrame(raf);
  }, [to, d]);
  return <>{v.toLocaleString("pt-BR")}</>;
}

function SceneCRM() {
  return (
    <div className="la-scene la-crm">
      <span className="login2-pill la-in" style={{ "--d": "0s" }}>CRM Helora</span>
      <h2 className="la-in" style={{ "--d": ".1s" }}>Seu funil de vendas andando, sem planilha.</h2>
      <div className="la-kpis la-in" style={{ "--d": ".25s" }}>
        <div><small>Ganho no mês</small><b>R$ <Counter to={48700} d={0.6} /></b></div>
        <div><small>Negócios abertos</small><b><Counter to={37} d={0.6} /></b></div>
        <div><small>Conversão</small><b><Counter to={32} d={0.6} />%</b></div>
      </div>
      <div className="la-board la-pop" style={{ "--d": ".4s" }}>
        {["Novo", "Proposta", "Ganho"].map((c, i) => (
          <div key={c} className="la-col"><div className="la-col-h"><span className={`dot d${i}`} />{c}</div>
            <div className="la-k ghost">{["Ana Lima", "Carlos M.", "Júlia P."][i]}<small>{["Seguro auto", "Consórcio", "Saúde"][i]}</small></div>
            {i === 1 && <div className="la-k ghost">Pedro R.<small>Vida</small></div>}
          </div>
        ))}
        <div className="la-k la-mover"><b>Maria Souza</b><small>Seguro residencial · R$ 2.400</small><span className="la-won">✓ Ganho</span></div>
        <div className="la-task la-msg" style={{ "--d": "2.2s" }}>📅 Ligar para Maria hoje 14h</div>
      </div>
    </div>
  );
}

const SCENES = [SceneChat, SceneAI, SceneCRM];
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
