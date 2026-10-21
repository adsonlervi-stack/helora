import { askConfirm, askPrompt } from "../dialogs.js";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Save, Play, Plus, Minus, Maximize2, Trash2, Copy, X, RotateCcw, Send, Clock3 } from "lucide-react";
import BusinessHoursEditor from "./BusinessHoursEditor.jsx";
import { crm, getFlowApi, saveFlowApi, setFlowActiveApi, simulateFlowApi, getDepartments, getTeam, getLabels, aiPrompts } from "../api.js";
import {
  TYPES, PALETTE_GROUPS, NODE_W, HEAD_H, BODY_H, PORT_H, PORT_TOP_PAD,
  portsOf, nodeHeight, portPoint, inputPoint, summary, newNode, uid
} from "./flowMeta.js";
import NodeInspector from "./FlowNodeInspector.jsx";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function curve(a, b) {
  const dx = Math.max(60, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export default function FlowEditor({ flowId, onBack, canEdit }) {
  const [flow, setFlow] = useState(null);
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [stats, setStats] = useState({});
  const [days, setDays] = useState(7);
  const [dirty, setDirty] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [selected, setSelected] = useState(null); // { kind: 'node'|'edge', id }
  const [view, setView] = useState({ x: 40, y: 40, zoom: 1 });
  const [connecting, setConnecting] = useState(null); // { from, port, x, y }
  const [showSim, setShowSim] = useState(false);
  const [ctx, setCtx] = useState({ departments: [], team: [], labels: [] });

  const wrapRef = useRef(null);
  const dragRef = useRef(null);

  // ---------- carregar ----------
  const load = useCallback(() => {
    getFlowApi(flowId, days)
      .then((f) => {
        setFlow(f);
        setGraph(f.graph || { nodes: [], edges: [] });
        setStats(f.stats || {});
        setDirty(false);
      })
      .catch((e) => setMsg({ type: "error", text: e.response?.data?.error || e.message }));
  }, [flowId, days]);

  useEffect(load, [load]);
  useEffect(() => {
    Promise.all([getDepartments().catch(() => []), getTeam().catch(() => []), getLabels().catch(() => []), aiPrompts.list().catch(() => []), crm.pipelines().catch(() => [])]).then(
      ([departments, team, labels, prompts, pipelines]) => setCtx({ departments, team, labels, prompts, pipelines })
    );
  }, []);

  // Avisa antes de sair com alterações não salvas
  useEffect(() => {
    const h = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const mutate = (fn) => {
    setGraph((g) => fn(structuredClone(g)));
    setDirty(true);
  };

  // ---------- coordenadas ----------
  // Zoom da interface (o sistema reduz para 90% em telas de computador): converte pixels da tela em pixels do canvas
  const uiZ = () => {
    const el = wrapRef.current;
    if (!el || !el.offsetWidth) return 1;
    return el.getBoundingClientRect().width / el.offsetWidth || 1;
  };
  const toCanvas = (clientX, clientY) => {
    const r = wrapRef.current.getBoundingClientRect();
    const z = uiZ();
    return { x: ((clientX - r.left) / z - view.x) / view.zoom, y: ((clientY - r.top) / z - view.y) / view.zoom };
  };

  const fit = useCallback(() => {
    const nodes = graph.nodes;
    if (!nodes.length || !wrapRef.current) return;
    const r = { width: wrapRef.current.offsetWidth, height: wrapRef.current.offsetHeight };
    const minX = Math.min(...nodes.map((n) => n.x)) - 40;
    const minY = Math.min(...nodes.map((n) => n.y)) - 40;
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_W)) + 40;
    const maxY = Math.max(...nodes.map((n) => n.y + nodeHeight(n))) + 40;
    const zoom = clamp(Math.min(r.width / (maxX - minX), r.height / (maxY - minY)), 0.3, 1.2);
    setView({ zoom, x: -minX * zoom + (r.width - (maxX - minX) * zoom) / 2, y: -minY * zoom + (r.height - (maxY - minY) * zoom) / 2 });
  }, [graph.nodes]);

  const fittedOnce = useRef(false);
  useEffect(() => {
    if (flow && !fittedOnce.current) {
      fittedOnce.current = true;
      setTimeout(fit, 30);
    }
  }, [flow, fit]);

  // ---------- interação ----------
  const onBgPointerDown = (e) => {
    if (e.button !== 0) return;
    setSelected(null);
    dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onNodePointerDown = (e, node) => {
    e.stopPropagation();
    setSelected({ kind: "node", id: node.id });
    if (!canEdit) return;
    dragRef.current = { kind: "node", id: node.id, sx: e.clientX, sy: e.clientY, nx: node.x, ny: node.y, moved: false };
  };

  const onPortPointerDown = (e, node, port) => {
    e.stopPropagation();
    if (!canEdit) return;
    const p = toCanvas(e.clientX, e.clientY);
    setConnecting({ from: node.id, port, x: p.x, y: p.y });
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (connecting) {
      const p = toCanvas(e.clientX, e.clientY);
      setConnecting((c) => c && { ...c, x: p.x, y: p.y });
      return;
    }
    if (!d) return;
    if (d.kind === "pan") {
      const z = uiZ();
      setView((v) => ({ ...v, x: d.vx + (e.clientX - d.sx) / z, y: d.vy + (e.clientY - d.sy) / z }));
    } else if (d.kind === "node") {
      const z = uiZ();
      const dx = (e.clientX - d.sx) / z / view.zoom;
      const dy = (e.clientY - d.sy) / z / view.zoom;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      setGraph((g) => ({
        ...g,
        nodes: g.nodes.map((n) => (n.id === d.id ? { ...n, x: Math.round(d.nx + dx), y: Math.round(d.ny + dy) } : n))
      }));
    }
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    if (d?.kind === "node" && d.moved) setDirty(true);
    dragRef.current = null;
    if (connecting) {
      const p = toCanvas(e.clientX, e.clientY);
      const target = graph.nodes.find(
        (n) => n.id !== connecting.from && n.type !== "trigger" && p.x >= n.x - 12 && p.x <= n.x + NODE_W && p.y >= n.y - 12 && p.y <= n.y + nodeHeight(n)
      );
      if (target) {
        mutate((g) => {
          g.edges = g.edges.filter((ed) => !(ed.from === connecting.from && (ed.port || "out") === connecting.port));
          g.edges.push({ id: uid("e"), from: connecting.from, port: connecting.port, to: target.id });
          return g;
        });
      }
      setConnecting(null);
    }
  };

  const onWheel = (e) => {
    e.preventDefault();
    const r = wrapRef.current.getBoundingClientRect();
    const z = uiZ();
    const mx = (e.clientX - r.left) / z;
    const my = (e.clientY - r.top) / z;
    setView((v) => {
      const zoom = clamp(v.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.25, 2);
      return { zoom, x: mx - ((mx - v.x) / v.zoom) * zoom, y: my - ((my - v.y) / v.zoom) * zoom };
    });
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const zoomBy = (f) =>
    setView((v) => {
      const mx = wrapRef.current.offsetWidth / 2, my = wrapRef.current.offsetHeight / 2;
      const zoom = clamp(v.zoom * f, 0.25, 2);
      return { zoom, x: mx - ((mx - v.x) / v.zoom) * zoom, y: my - ((my - v.y) / v.zoom) * zoom };
    });

  // ---------- ações ----------
  const addNode = (type) => {
    const r = wrapRef.current.getBoundingClientRect();
    const z = uiZ();
    const c = toCanvas(r.left + r.width / 2 - 120 * z, r.top + r.height / 2 - 60 * z);
    const n = newNode(type, c.x + (Math.random() * 40 - 20), c.y + (Math.random() * 40 - 20));
    mutate((g) => {
      // não nasce em cima de outro bloco: anda para a direita/baixo até achar espaço livre
      for (let i = 0; i < 40 && g.nodes.some((o) => Math.abs(o.x - n.x) < NODE_W + 30 && Math.abs(o.y - n.y) < 150); i++) {
        if (i % 4 === 3) { n.x -= (NODE_W + 60) * 3; n.y += 190; } else n.x += NODE_W + 60;
      }
      g.nodes.push(n);
      // liga automaticamente do bloco selecionado (saída livre) para o novo
      if (selected?.kind === "node") {
        const src = g.nodes.find((x) => x.id === selected.id);
        if (src) {
          const free = portsOf(src).find((p) => !g.edges.some((ed) => ed.from === src.id && (ed.port || "out") === p.id));
          if (free) {
            g.edges.push({ id: uid("e"), from: src.id, port: free.id, to: n.id });
            n.x = src.x + NODE_W + 90;
            n.y = src.y;
          }
        }
      }
      return g;
    });
    setSelected({ kind: "node", id: n.id });
  };

  const removeSelected = useCallback(() => {
    if (!selected || !canEdit) return;
    if (selected.kind === "edge") {
      mutate((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== selected.id) }));
    } else {
      const node = graph.nodes.find((n) => n.id === selected.id);
      if (!node || node.type === "trigger") return;
      mutate((g) => ({
        nodes: g.nodes.filter((n) => n.id !== selected.id),
        edges: g.edges.filter((e) => e.from !== selected.id && e.to !== selected.id)
      }));
    }
    setSelected(null);
  }, [selected, graph.nodes, canEdit]);

  const duplicateSelected = () => {
    const node = graph.nodes.find((n) => n.id === selected?.id);
    if (!node || node.type === "trigger") return;
    const copy = structuredClone(node);
    copy.id = uid(node.type);
    copy.x += 40;
    copy.y += 40;
    if (copy.type === "options") copy.data.options = copy.data.options.map((o) => ({ ...o, id: uid("op") }));
    mutate((g) => {
      g.nodes.push(copy);
      return g;
    });
    setSelected({ kind: "node", id: copy.id });
  };

  useEffect(() => {
    const h = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") removeSelected();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const updateNodeData = (id, patch) =>
    mutate((g) => {
      const n = g.nodes.find((x) => x.id === id);
      if (n) n.data = { ...n.data, ...patch };
      // opções removidas levam junto as ligações delas
      if (n?.type === "options") {
        const ids = new Set((n.data.options || []).map((o) => o.id).concat("invalid"));
        g.edges = g.edges.filter((e) => e.from !== id || ids.has(e.port || "out"));
      }
      return g;
    });

  const save = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const f = await saveFlowApi(flowId, { graph, name: flow.name });
      setFlow((p) => ({ ...p, ...f }));
      setDirty(false);
      setMsg({ type: "success", text: "Fluxo salvo." });
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.error || e.message });
    }
    setSaving(false);
  };

  const toggleActive = async () => {
    try {
      if (dirty) await save();
      const f = await setFlowActiveApi(flowId, !flow.active);
      setFlow((p) => ({ ...p, active: f.active }));
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.error || e.message });
    }
  };

  // Avisos simples de configuração
  const warnings = useMemo(() => {
    const w = {};
    for (const n of graph.nodes) {
      const d = n.data || {};
      const outs = portsOf(n).filter((p) => p.id !== "invalid");
      const linked = outs.filter((p) => graph.edges.some((e) => e.from === n.id && (e.port || "out") === p.id));
      if ((n.type === "message" || n.type === "question") && !String(d.text || "").trim()) w[n.id] = "Texto vazio";
      else if (n.type === "options" && !(d.options || []).length) w[n.id] = "Sem opções";
      else if (n.type === "action" && d.action === "transfer" && !d.departmentId && ctx.departments.length) w[n.id] = "Sem setor (vai para a fila geral)";
      else if (n.type === "trigger" && !linked.length) w[n.id] = "Ligue o início a um bloco";
      else if (n.type !== "trigger" && !graph.edges.some((e) => e.to === n.id)) w[n.id] = "Bloco solto (nada chega aqui)";
    }
    return w;
  }, [graph, ctx.departments.length]);

  if (!flow) {
    return (
      <div className="page">
        {msg ? <div className={`admin-feedback ${msg.type}`}>{msg.text}</div> : <div className="cv-muted">Carregando fluxo…</div>}
      </div>
    );
  }

  const selNode = selected?.kind === "node" ? graph.nodes.find((n) => n.id === selected.id) : null;
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));

  return (
    <div className="fe">
      {/* Barra superior */}
      <div className="fe-top lg-bar">
        <button className="cv-icon-btn" onClick={async () => (!dirty || await askConfirm("Sair sem salvar as alterações?")) && onBack()} title="Voltar">
          <ArrowLeft size={16} />
        </button>
        <input
          className="fe-name"
          value={flow.name}
          disabled={!canEdit}
          onChange={(e) => {
            setFlow({ ...flow, name: e.target.value });
            setDirty(true);
          }}
        />
        <span className={`fe-status ${dirty ? "dirty" : ""}`}>{dirty ? "Alterações não salvas" : "Tudo salvo"}</span>
        <div className="fe-top-right">
          <select className="deal-stage-select fe-days" value={days} onChange={(e) => setDays(+e.target.value)} title="Período dos números">
            <option value={1}>Hoje</option>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </select>
          <button className={`pill-btn ${flow.active ? "on" : ""}`} onClick={toggleActive} disabled={!canEdit}>
            <span className={`fe-dot ${flow.active ? "on" : ""}`} /> {flow.active ? "Ativo" : "Inativo"}
          </button>
          <button className={`pill-btn ${graph.hours?.enabled ? "on" : ""}`} onClick={() => setShowHours(true)} title="Horário de atendimento deste fluxo">
            <Clock3 size={14} /> Horário
          </button>
          <button className="pill-btn" onClick={() => setShowSim((v) => !v)}>
            <Play size={14} /> Testar
          </button>
          <button className="pill-btn primary" onClick={save} disabled={!canEdit || saving || !dirty}>
            <Save size={14} /> {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
      {msg && <div className={`admin-feedback ${msg.type} fe-msg`}>{msg.text}</div>}
      {showHours && (
        <div className="modal-backdrop" onClick={() => setShowHours(false)}>
          <div className="modal lg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Horário deste fluxo</h3><button className="icon-btn" onClick={() => setShowHours(false)}><X size={16} /></button></div>
            <p className="cv-muted" style={{ margin: 0 }}>Se ligado, vale no lugar do horário da empresa para os números que usam este fluxo. Depois clique em Salvar.</p>
            <BusinessHoursEditor
              value={graph.hours}
              enableLabel="Horário próprio neste fluxo"
              onChange={(hours) => {
                if (!canEdit) return;
                setGraph((g) => ({ ...g, hours }));
                setDirty(true);
              }}
            />
            <button className="connect-btn" onClick={() => setShowHours(false)}>Pronto</button>
          </div>
        </div>
      )}

      <div className="fe-body">
        {/* Paleta */}
        {canEdit && (
          <div className="fe-palette lg-panel">
            {PALETTE_GROUPS.map((g) => (
              <div key={g} className="fe-pal-group">
                <div className="fe-pal-title">{g}</div>
                {Object.entries(TYPES)
                  .filter(([, t]) => t.group === g)
                  .map(([type, t]) => {
                    const Icon = t.icon;
                    return (
                      <button key={type} className="fe-pal-item" onClick={() => addNode(type)} title={t.desc}>
                        <span className="fe-pal-icon" style={{ background: t.color }}>
                          <Icon size={14} />
                        </span>
                        <span>
                          <strong>{t.label}</strong>
                          <small>{t.desc}</small>
                        </span>
                      </button>
                    );
                  })}
              </div>
            ))}
            <div className="fe-pal-hint">
              Dica: selecione um bloco e clique num item acima para já criar ligado a ele. Arraste da bolinha à direita de um bloco até outro para ligar. Delete apaga o selecionado.
            </div>
          </div>
        )}

        {/* Canvas */}
        <div
          className={`fe-canvas ${connecting ? "connecting" : ""}`}
          ref={wrapRef}
          onPointerDown={onBgPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${22 * view.zoom}px ${22 * view.zoom}px` }}
        >
          <div className="fe-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            <svg className="fe-edges" width="1" height="1">
              {graph.edges.map((e) => {
                const a = byId[e.from];
                const b = byId[e.to];
                if (!a || !b) return null;
                const p1 = portPoint(a, e.port || "out");
                const p2 = inputPoint(b);
                const sel = selected?.kind === "edge" && selected.id === e.id;
                const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                return (
                  <g key={e.id}>
                    <path d={curve(p1, p2)} className="fe-edge-hit" onPointerDown={(ev) => { ev.stopPropagation(); setSelected({ kind: "edge", id: e.id }); }} />
                    <path d={curve(p1, p2)} className={`fe-edge ${sel ? "sel" : ""}`} style={{ "--edge": TYPES[a.type]?.color }} />
                    {sel && canEdit && (
                      <g className="fe-edge-del" transform={`translate(${mid.x - 11}, ${mid.y - 11})`} onPointerDown={(ev) => { ev.stopPropagation(); removeSelected(); }}>
                        <circle cx="11" cy="11" r="11" />
                        <path d="M7 7 L15 15 M15 7 L7 15" />
                      </g>
                    )}
                  </g>
                );
              })}
              {connecting && byId[connecting.from] && (
                <path d={curve(portPoint(byId[connecting.from], connecting.port), { x: connecting.x, y: connecting.y })} className="fe-edge drawing" />
              )}
            </svg>

            {graph.nodes.map((n) => {
              const t = TYPES[n.type] || TYPES.message;
              const Icon = t.icon;
              const st = stats[n.id] || {};
              const sel = selected?.kind === "node" && selected.id === n.id;
              return (
                <div
                  key={n.id}
                  className={`fe-node ${sel ? "sel" : ""}`}
                  style={{ left: n.x, top: n.y, width: NODE_W, "--node": t.color }}
                  onPointerDown={(e) => onNodePointerDown(e, n)}
                >
                  <div className="fe-node-head" style={{ height: HEAD_H }}>
                    {n.type !== "trigger" && <span className="fe-in" />}
                    <span className="fe-node-icon"><Icon size={13} /></span>
                    <span className="fe-node-title">{t.label}</span>
                    <span className="fe-node-stats" title="Enviadas · Respostas">
                      {st.sent || 0}
                      {(n.type === "question" || n.type === "options") && <> · {st.reply || 0}</>}
                    </span>
                  </div>
                  <div className="fe-node-body" style={{ height: BODY_H }}>
                    {summary(n, ctx)}
                    {warnings[n.id] && <span className="fe-warn" title={warnings[n.id]}>!</span>}
                  </div>
                  <div className="fe-ports" style={{ paddingTop: PORT_TOP_PAD }}>
                    {portsOf(n).map((p) => (
                      <div key={p.id} className={`fe-port ${p.muted ? "muted" : ""}`} style={{ height: PORT_H }}>
                        <span className="fe-port-label">{p.label}</span>
                        {st.ports?.[p.id] > 0 && <span className="fe-port-count">{st.ports[p.id]}</span>}
                        <span className="fe-out" onPointerDown={(e) => onPortPointerDown(e, n, p.id)} title="Arraste até outro bloco" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="fe-zoom lg-panel" onPointerDown={(e) => e.stopPropagation()}>
            <button onClick={() => zoomBy(1.15)} title="Aproximar"><Plus size={15} /></button>
            <span>{Math.round(view.zoom * 100)}%</span>
            <button onClick={() => zoomBy(1 / 1.15)} title="Afastar"><Minus size={15} /></button>
            <button onClick={fit} title="Enquadrar tudo"><Maximize2 size={14} /></button>
          </div>
        </div>

        {/* Painel direito: edição do bloco ou simulador */}
        {showSim ? (
          <Simulator flowId={flowId} graph={graph} onClose={() => setShowSim(false)} />
        ) : selNode ? (
          <div className="fe-inspector lg-panel">
            <div className="fe-insp-head">
              <span className="fe-node-icon" style={{ background: TYPES[selNode.type].color }}>
                {React.createElement(TYPES[selNode.type].icon, { size: 13 })}
              </span>
              <strong>{TYPES[selNode.type].label}</strong>
              {canEdit && selNode.type !== "trigger" && (
                <>
                  <button className="cv-icon-btn" title="Duplicar" onClick={duplicateSelected}><Copy size={14} /></button>
                  <button className="cv-icon-btn" title="Apagar" onClick={removeSelected}><Trash2 size={14} /></button>
                </>
              )}
              <button className="cv-icon-btn" onClick={() => setSelected(null)} title="Fechar"><X size={14} /></button>
            </div>
            {warnings[selNode.id] && <div className="fe-insp-warn">⚠️ {warnings[selNode.id]}</div>}
            <NodeInspector node={selNode} ctx={ctx} disabled={!canEdit} onChange={(patch) => updateNodeData(selNode.id, patch)} stats={stats[selNode.id]} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Simulator({ flowId, graph, onClose }) {
  const [log, setLog] = useState([]);
  const [state, setState] = useState({});
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [log.length]);

  const send = async (e) => {
    e?.preventDefault();
    const t = text.trim() || "Oi";
    setText("");
    setLog((l) => [...l, { from: "user", text: t }]);
    try {
      const r = await simulateFlowApi(flowId, { graph, state, text: t });
      setState(r.state);
      setLog((l) => [...l, ...r.messages.map((m) => ({ from: "bot", text: m })), ...(r.ended ? [{ from: "sys", text: "Fim do roteiro do bot" }] : [])]);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const reset = () => {
    setLog([]);
    setState({});
  };

  return (
    <div className="fe-inspector lg-panel fe-sim">
      <div className="fe-insp-head">
        <Play size={15} />
        <strong>Testar fluxo</strong>
        <button className="cv-icon-btn" onClick={reset} title="Recomeçar"><RotateCcw size={14} /></button>
        <button className="cv-icon-btn" onClick={onClose} title="Fechar"><X size={14} /></button>
      </div>
      <div className="cv-muted" style={{ padding: "0 14px 8px" }}>
        Simula como cliente, usando o fluxo da tela (mesmo sem salvar). Nada é enviado de verdade.
      </div>
      <div className="support-list" ref={listRef}>
        {log.length === 0 && <div className="support-empty">Mande "Oi" para começar.</div>}
        {log.map((m, i) =>
          m.from === "sys" ? (
            <div key={i} className="fe-sim-sys">{m.text}</div>
          ) : (
            <div key={i} className={`support-msg ${m.from === "user" ? "out" : "in"}`} style={{ whiteSpace: "pre-wrap" }}>
              {m.text}
            </div>
          )
        )}
      </div>
      {error && <div className="admin-feedback error" style={{ margin: "0 12px 8px" }}>{error}</div>}
      <form className="support-composer" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Responder como cliente…" autoFocus />
        <button className="composer-send"><Send size={15} /></button>
      </form>
    </div>
  );
}
