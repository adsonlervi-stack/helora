import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare, Paperclip, MessageSquare, CalendarClock, Trash2, MessageCircle, Plus, X, Search, Flag, Tag, Send, FileText, Check
} from "lucide-react";
import { askConfirm, notify } from "../dialogs.js";
import { Sheet, Group, Row } from "./ui.jsx";
import Avatar from "./Avatar.jsx";
import {
  createTaskApi, updateTaskApi, deleteTaskApi, addTaskCommentApi, deleteTaskCommentApi, uploadTaskFileApi, deleteTaskFileApi
} from "../api.js";

export const TASK_STAGES = [
  { id: "todo", name: "A fazer", color: "#8e8e93" },
  { id: "doing", name: "Fazendo", color: "#0071e3" },
  { id: "review", name: "Em revisão", color: "#ff9500" },
  { id: "done", name: "Concluído", color: "#34c759" }
];
const PRIORITIES = {
  low: { label: "Baixa", color: "#8e8e93" },
  normal: { label: "Normal", color: "#0071e3" },
  high: { label: "Alta", color: "#ff9500" },
  urgent: { label: "Urgente", color: "#ff3b30" }
};
const LABEL_COLORS = ["#0071e3", "#34c759", "#ff9500", "#ff3b30", "#af52de", "#5ac8fa", "#ff2d55", "#8e8e93"];
const errText = (e) => e?.response?.data?.error || e?.message || "Erro";
const toLocalInput = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const rel = (v) => {
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};
function dueInfo(t) {
  if (!t.dueAt) return null;
  const d = new Date(t.dueAt);
  const done = t.stage === "done";
  const diff = d - new Date();
  const label = d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const cls = done ? "ok" : diff < 0 ? "late" : diff < 86400000 ? "soon" : "";
  return { label, cls };
}

export default function TaskBoard({
  tasks, setTasks, team, profile, isManager, scope, setScope, setLayout, openId, setOpenId, reload, onOpenConversation, onAttachScheduled
}) {
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [adding, setAdding] = useState(null);
  const [newTitle, setNewTitle] = useState("");

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (tasks || []).filter((t) =>
      (!term || `${t.title} ${t.description} ${t.conversationName || ""}`.toLowerCase().includes(term)) &&
      (!who || (who === "none" ? !t.assigneeId : t.assigneeId === who))
    );
  }, [tasks, q, who]);
  const byCol = useMemo(() => {
    const m = Object.fromEntries(TASK_STAGES.map((s) => [s.id, []]));
    for (const t of list) (m[t.stage] || m.todo).push(t);
    const prio = { urgent: 0, high: 1, normal: 2, low: 3 };
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) =>
        (a.position ?? 1e15) - (b.position ?? 1e15) ||
        (prio[a.priority] ?? 2) - (prio[b.priority] ?? 2) ||
        (a.dueAt ? new Date(a.dueAt) : 9e15) - (b.dueAt ? new Date(b.dueAt) : 9e15)
      );
    }
    m.done = m.done.sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0));
    return m;
  }, [list]);

  const patchLocal = (id, patch) => setTasks((cur) => (cur || []).map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const move = async (id, stage) => {
    const t = (tasks || []).find((x) => x.id === id);
    if (!t || t.stage === stage) return;
    patchLocal(id, { stage, status: stage === "done" ? "done" : "open", doneAt: stage === "done" ? new Date().toISOString() : null });
    try {
      const saved = await updateTaskApi(id, { stage });
      patchLocal(id, saved);
    } catch (e) { notify(errText(e), "error"); reload(); }
  };
  const quickAdd = async (stage) => {
    const title = newTitle.trim();
    if (!title) return setAdding(null);
    try {
      let t = await createTaskApi({ title, assigneeId: profile?.id || null });
      if (stage !== "todo") t = await updateTaskApi(t.id, { stage });
      setTasks((cur) => [t, ...(cur || [])]);
      setNewTitle("");
    } catch (e) { notify(errText(e), "error"); }
  };

  const open = (tasks || []).find((t) => t.id === openId) || null;

  return (
    <>
      <div className="tb-toolbar">
        <div className="tb-search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tarefa…" />
        </div>
        {isManager && (
          <>
            <div className="dash-presets">
              <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>Equipe</button>
              <button className={scope === "mine" ? "active" : ""} onClick={() => setScope("mine")}>Minhas</button>
            </div>
            {scope === "all" && (
              <select className="tb-select" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Todos os responsáveis</option>
                <option value="none">Sem responsável</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
            )}
          </>
        )}
        <div className="dash-presets" style={{ marginLeft: "auto" }}>
          <button className="active">Quadro</button>
          <button onClick={() => setLayout("list")}>Lista</button>
        </div>
      </div>

      {tasks === null ? (
        <div className="cv-muted" style={{ padding: 20 }}>Carregando…</div>
      ) : (
        <div className="tb-board">
          {TASK_STAGES.map((col) => (
            <div
              key={col.id}
              className={`tb-col ${overCol === col.id ? "over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
              onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
              onDrop={(e) => { e.preventDefault(); setOverCol(null); if (dragId) move(dragId, col.id); setDragId(null); }}
            >
              <div className="tb-col-head">
                <span className="tb-dot" style={{ background: col.color }} />
                <strong>{col.name}</strong>
                <span className="tb-count">{byCol[col.id].length}</span>
              </div>
              <div className="tb-col-body">
                {byCol[col.id].map((t) => (
                  <TaskCard
                    key={t.id} t={t}
                    onOpen={() => setOpenId(t.id)}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    dragging={dragId === t.id}
                    onToggleDone={() => move(t.id, t.stage === "done" ? "todo" : "done")}
                  />
                ))}
                {!byCol[col.id].length && <div className="tb-empty">Arraste tarefas para cá</div>}
              </div>
              {col.id !== "done" && (adding === col.id ? (
                <div className="tb-add-form">
                  <textarea
                    autoFocus rows={2} value={newTitle} placeholder="Título da tarefa…"
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); quickAdd(col.id); }
                      if (e.key === "Escape") { setAdding(null); setNewTitle(""); }
                    }}
                  />
                  <div className="tb-add-actions">
                    <button className="ap-btn primary" onClick={() => quickAdd(col.id)}>Adicionar</button>
                    <button className="icon-btn" onClick={() => { setAdding(null); setNewTitle(""); }}><X size={15} /></button>
                  </div>
                </div>
              ) : (
                <button className="tb-add" onClick={() => { setAdding(col.id); setNewTitle(""); }}><Plus size={15} /> Adicionar tarefa</button>
              ))}
            </div>
          ))}
        </div>
      )}

      {open && (
        <TaskSheet
          key={open.id} task={open} team={team} profile={profile} isManager={isManager}
          onClose={() => setOpenId(null)}
          onChange={(saved) => patchLocal(saved.id, saved)}
          onDeleted={() => { setTasks((cur) => (cur || []).filter((x) => x.id !== open.id)); setOpenId(null); }}
          onOpenConversation={onOpenConversation}
          onAttachScheduled={onAttachScheduled}
        />
      )}
    </>
  );
}

function TaskCard({ t, onOpen, onDragStart, onDragEnd, dragging, onToggleDone }) {
  const due = dueInfo(t);
  const done = t.checklist.filter((i) => i.done).length;
  const pr = PRIORITIES[t.priority] || PRIORITIES.normal;
  return (
    <div
      className={`tb-card ${dragging ? "dragging" : ""} ${t.stage === "done" ? "is-done" : ""}`}
      draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }} onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      {(t.labels.length > 0 || t.priority === "high" || t.priority === "urgent") && (
        <div className="tb-labels">
          {(t.priority === "high" || t.priority === "urgent") && <span className="tb-label" style={{ background: pr.color }}><Flag size={10} /> {pr.label}</span>}
          {t.labels.map((l, i) => <span key={i} className="tb-label" style={{ background: l.color }}>{l.text}</span>)}
        </div>
      )}
      <div className="tb-card-title">
        <button
          type="button" className={`tb-check ${t.stage === "done" ? "on" : ""}`}
          title={t.stage === "done" ? "Reabrir" : "Concluir"}
          onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
        >{t.stage === "done" && <Check size={11} strokeWidth={3} />}</button>
        <span>{t.kind === "attachment" ? "📎 " : ""}{t.title}</span>
      </div>
      {t.conversationName && <div className="tb-card-conv"><MessageCircle size={12} /> {t.conversationName}</div>}
      <div className="tb-card-foot">
        {due && <span className={`tb-badge ${due.cls}`}><CalendarClock size={12} /> {due.label}</span>}
        {t.checklist.length > 0 && <span className={`tb-badge ${done === t.checklist.length ? "ok" : ""}`}><CheckSquare size={12} /> {done}/{t.checklist.length}</span>}
        {t.attachments.length > 0 && <span className="tb-badge"><Paperclip size={12} /> {t.attachments.length}</span>}
        {t.comments.length > 0 && <span className="tb-badge"><MessageSquare size={12} /> {t.comments.length}</span>}
        {t.description && <span className="tb-badge" title="Tem descrição"><FileText size={12} /></span>}
        <span style={{ marginLeft: "auto" }}>
          {t.assigneeName ? <Avatar name={t.assigneeName} size={24} /> : <span className="tb-noowner" title="Sem responsável">?</span>}
        </span>
      </div>
    </div>
  );
}

function TaskSheet({ task, team, profile, isManager, onClose, onChange, onDeleted, onOpenConversation, onAttachScheduled }) {
  const [title, setTitle] = useState(task.title);
  const [desc, setDesc] = useState(task.description || "");
  const [editDesc, setEditDesc] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [labelText, setLabelText] = useState("");
  const [labelColor, setLabelColor] = useState(LABEL_COLORS[0]);
  const fileRef = useRef(null);

  const save = async (patch) => {
    onChange({ ...task, ...patch });
    try { onChange(await updateTaskApi(task.id, patch)); } catch (e) { notify(errText(e), "error"); }
  };
  const saveTitle = () => { const t = title.trim(); if (t && t !== task.title) save({ title: t }); else setTitle(task.title); };
  const saveDesc = () => { setEditDesc(false); if (desc !== (task.description || "")) save({ description: desc }); };

  const checklist = task.checklist || [];
  const doneCount = checklist.filter((i) => i.done).length;
  const setChecklist = (next) => save({ checklist: next });
  const addItem = () => {
    const t = newItem.trim();
    if (!t) return;
    setChecklist([...checklist, { id: Math.random().toString(36).slice(2, 10), text: t, done: false }]);
    setNewItem("");
  };

  const addFiles = async (files) => {
    setUploading(true);
    try {
      let last = null;
      for (const f of files) last = await uploadTaskFileApi(task.id, f);
      if (last) onChange(last);
    } catch (e) { notify(errText(e), "error"); }
    setUploading(false);
  };
  const delFile = async (f) => {
    if (!await askConfirm(`Remover o anexo "${f.name}"?`)) return;
    try { onChange(await deleteTaskFileApi(task.id, f.id)); } catch (e) { notify(errText(e), "error"); }
  };
  const sendComment = async () => {
    const t = comment.trim();
    if (!t) return;
    try { onChange(await addTaskCommentApi(task.id, t)); setComment(""); } catch (e) { notify(errText(e), "error"); }
  };
  const delComment = async (c) => {
    if (!await askConfirm("Apagar este comentário?")) return;
    try { onChange(await deleteTaskCommentApi(task.id, c.id)); } catch (e) { notify(errText(e), "error"); }
  };
  const addLabel = () => {
    const t = labelText.trim();
    if (!t) return;
    save({ labels: [...(task.labels || []), { text: t, color: labelColor }] });
    setLabelText("");
  };
  const remove = async () => {
    if (!await askConfirm("Excluir esta tarefa? Não dá para desfazer.", { danger: true, okText: "Excluir" })) return;
    try { await deleteTaskApi(task.id); onDeleted(); notify("Tarefa excluída."); } catch (e) { notify(errText(e), "error"); }
  };
  const stage = TASK_STAGES.find((s) => s.id === task.stage) || TASK_STAGES[0];
  const canAssign = isManager || task.createdById === profile?.id;

  return (
    <Sheet
      title={
        <input
          className="tb-title-input" value={title} onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      }
      subtitle={`em ${stage.name}${task.createdByName ? ` · criada por ${task.createdByName}` : ""} · ${rel(task.createdAt)}`}
      onClose={onClose}
      width={680}
      footer={
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 8 }}>
          <button className="ap-btn danger" onClick={remove}><Trash2 size={15} /> Excluir</button>
          <button className="ap-btn primary" onClick={onClose}>Pronto</button>
        </div>
      }
    >
      <div className="crm-actionbar">
        <button type="button" className={task.stage === "done" ? "on" : ""} onClick={() => save({ stage: task.stage === "done" ? "todo" : "done" })}>
          <CheckSquare size={16} /><span>{task.stage === "done" ? "Reabrir" : "Concluir"}</span>
        </button>
        {task.conversationId && (
          <button type="button" onClick={() => { onClose(); onOpenConversation?.(task.conversationId); }}>
            <MessageCircle size={16} /><span>Abrir conversa</span>
          </button>
        )}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Paperclip size={16} /><span>{uploading ? "Enviando…" : "Anexar"}</span>
        </button>
        {task.kind === "attachment" && task.stage !== "done" && task.scheduledMessageId && (
          <label className="pill-btn primary" style={{ cursor: "pointer" }}>
            <Paperclip size={14} /> Anexar à mensagem agendada
            <input type="file" hidden onChange={(e) => onAttachScheduled?.(task.scheduledMessageId, e.target.files?.[0])} />
          </label>
        )}
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; l.length && addFiles(l); }} />
      </div>

      <Group title="Detalhes">
        <Row label="Etapa">
          <div className="tb-stage-pick">
            {TASK_STAGES.map((s) => (
              <button key={s.id} type="button" className={task.stage === s.id ? "active" : ""} style={task.stage === s.id ? { background: s.color, color: "#fff" } : undefined} onClick={() => save({ stage: s.id })}>{s.name}</button>
            ))}
          </div>
        </Row>
        <Row label="Responsável">
          <select value={task.assigneeId || ""} disabled={!canAssign} onChange={(e) => {
            const m = team.find((x) => x.id === e.target.value);
            save({ assigneeId: e.target.value || null, assigneeName: m?.name || m?.email || null });
          }}>
            <option value="">Sem responsável</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
        </Row>
        <Row label="Prazo">
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            {dueInfo(task) && <span className={`tb-badge ${dueInfo(task).cls}`}>{dueInfo(task).cls === "late" ? "Atrasada" : dueInfo(task).cls === "soon" ? "Vence em breve" : dueInfo(task).cls === "ok" ? "Feita" : "No prazo"}</span>}
            <input type="datetime-local" value={toLocalInput(task.dueAt)} onChange={(e) => save({ dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })} style={{ width: "auto" }} />
          </span>
        </Row>
        <Row label="Prioridade">
          <div className="tb-stage-pick">
            {Object.entries(PRIORITIES).map(([k, p]) => (
              <button key={k} type="button" className={task.priority === k ? "active" : ""} style={task.priority === k ? { background: p.color, color: "#fff" } : undefined} onClick={() => save({ priority: k })}>{p.label}</button>
            ))}
          </div>
        </Row>
      </Group>

      <Group title="Etiquetas">
        <div className="tb-label-edit">
          {(task.labels || []).map((l, i) => (
            <span key={i} className="tb-label lg" style={{ background: l.color }}>
              {l.text}
              <button type="button" onClick={() => save({ labels: task.labels.filter((_, j) => j !== i) })}><X size={11} /></button>
            </span>
          ))}
          <span className="tb-label-new">
            {LABEL_COLORS.map((c) => (
              <button key={c} type="button" className={`tb-swatch ${labelColor === c ? "on" : ""}`} style={{ background: c }} onClick={() => setLabelColor(c)} />
            ))}
            <input value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="Nova etiqueta" onKeyDown={(e) => e.key === "Enter" && addLabel()} maxLength={30} />
            <button type="button" className="icon-btn" onClick={addLabel} title="Adicionar"><Tag size={14} /></button>
          </span>
        </div>
      </Group>

      <Group title="Descrição">
        {editDesc || !task.description ? (
          <div className="tb-desc-edit">
            <textarea rows={4} value={desc} autoFocus={editDesc} onChange={(e) => setDesc(e.target.value)} placeholder="Adicione mais detalhes: o que precisa ser feito, contexto, links…" onBlur={saveDesc} />
          </div>
        ) : (
          <div className="tb-desc" onClick={() => setEditDesc(true)} title="Clique para editar">{task.description}</div>
        )}
      </Group>

      <Group title={`Checklist${checklist.length ? ` · ${doneCount}/${checklist.length}` : ""}`}>
        {checklist.length > 0 && <div className="crm-progress"><span style={{ width: `${Math.round((doneCount / checklist.length) * 100)}%` }} /></div>}
        <div className="tb-checklist">
          {checklist.map((i) => (
            <div key={i.id} className={`tb-ck ${i.done ? "done" : ""}`}>
              <input type="checkbox" checked={i.done} onChange={() => setChecklist(checklist.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))} />
              <span>{i.text}</span>
              <button type="button" className="icon-btn" onClick={() => setChecklist(checklist.filter((x) => x.id !== i.id))}><X size={13} /></button>
            </div>
          ))}
          <div className="tb-ck-add">
            <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Adicionar item…" onKeyDown={(e) => e.key === "Enter" && addItem()} />
            <button type="button" className="ap-btn" onClick={addItem} disabled={!newItem.trim()}>Adicionar</button>
          </div>
        </div>
      </Group>

      <Group title={`Anexos${task.attachments.length ? ` · ${task.attachments.length}` : ""}`}>
        <div
          className="tb-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const l = [...(e.dataTransfer.files || [])]; l.length && addFiles(l); }}
        >
          {task.attachments.map((f) => (
            <div key={f.id} className="tb-file">
              {/^image\//.test(f.type || "") ? <img src={f.url} alt="" /> : <span className="tb-file-ico"><FileText size={18} /></span>}
              <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a>
              <span className="cv-muted">{f.by ? `${f.by} · ` : ""}{rel(f.at)}</span>
              <button type="button" className="icon-btn" onClick={() => delFile(f)}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="tb-drop-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Paperclip size={14} /> {uploading ? "Enviando…" : "Clique ou arraste arquivos aqui"}
          </button>
        </div>
      </Group>

      <Group title={`Comentários${task.comments.length ? ` · ${task.comments.length}` : ""}`}>
        <div className="tb-comment-new">
          <Avatar name={profile?.name || "Eu"} size={30} />
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escreva um comentário…" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendComment(); }} />
          <button type="button" className="ap-btn primary" onClick={sendComment} disabled={!comment.trim()}><Send size={14} /></button>
        </div>
        <div className="tb-comments">
          {[...task.comments].reverse().map((c) => (
            <div key={c.id} className="tb-comment">
              <Avatar name={c.by || "?"} size={30} />
              <div>
                <div className="tb-comment-head"><strong>{c.by || "Alguém"}</strong><span className="cv-muted">{rel(c.at)}</span>
                  {(isManager || c.byId === profile?.id) && <button type="button" className="tb-link" onClick={() => delComment(c)}>apagar</button>}
                </div>
                <div className="tb-comment-text">{c.text}</div>
              </div>
            </div>
          ))}
        </div>
      </Group>
    </Sheet>
  );
}
