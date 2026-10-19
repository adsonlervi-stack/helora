import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, CheckCircle2, Circle, Paperclip, CalendarClock, AlertTriangle, X } from "lucide-react";
import {
  getTasksApi, createTaskApi, updateTaskApi, deleteTaskApi, getTeam,
  getScheduledMessages, cancelScheduledMessageApi, attachScheduledFileApi
} from "../api.js";

const dt = (v) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const errText = (e) => e?.response?.data?.error || e?.message || "Erro";
const recurLabel = (m) =>
  m.recurrence === "monthly" ? `Todo mês, dia ${m.recurDay}` : m.recurrence === "interval" ? `A cada ${m.recurEveryDays} dias` : "Envio único";

/** Aba Tarefas: tarefas da equipe + o que o sistema agendou e as pendências (ex.: anexar boleto). */
export default function TasksPage({ profile }) {
  const isManager = profile?.role === "owner" || profile?.isSuperAdmin;
  const [view, setView] = useState("tasks");
  const [tasks, setTasks] = useState(null);
  const [scheduled, setScheduled] = useState(null);
  const [team, setTeam] = useState([]);
  const [filter, setFilter] = useState("open");
  const [scope, setScope] = useState(isManager ? "all" : "mine");
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState(null);

  const loadTasks = () => getTasksApi(scope === "mine" ? "mine" : undefined).then(setTasks).catch((e) => { setTasks([]); setMsg({ type: "error", text: errText(e) }); });
  const loadScheduled = () => getScheduledMessages().then(setScheduled).catch(() => setScheduled([]));
  useEffect(() => { loadTasks(); }, [scope]);
  useEffect(() => {
    loadScheduled();
    getTeam().then(setTeam).catch(() => {});
  }, []);

  const pendingAttach = useMemo(() => (scheduled || []).filter((m) => m.status === "waiting_attachment"), [scheduled]);
  const upcoming = useMemo(() => (scheduled || []).filter((m) => m.status === "pending"), [scheduled]);
  const shown = (tasks || []).filter((t) => (filter === "all" ? true : t.status === filter));

  const toggle = async (t) => {
    setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: t.status === "done" ? "open" : "done" } : x)));
    try { await updateTaskApi(t.id, { status: t.status === "done" ? "open" : "done" }); } catch (e) { setMsg({ type: "error", text: errText(e) }); loadTasks(); }
  };
  const remove = async (t) => {
    if (!confirm("Excluir esta tarefa?")) return;
    await deleteTaskApi(t.id).catch(() => {});
    loadTasks();
  };
  const attach = async (scheduledId, file) => {
    if (!file) return;
    try {
      await attachScheduledFileApi(scheduledId, file);
      setMsg({ type: "success", text: "Arquivo anexado. A mensagem será enviada no horário (ou em até 1 minuto, se já passou)." });
      loadScheduled();
      loadTasks();
    } catch (e) {
      setMsg({ type: "error", text: errText(e) });
    }
  };

  return (
    <div className="page tasks-page">
      <div className="gestao-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div className="dash-presets">
          <button className={view === "tasks" ? "active" : ""} onClick={() => setView("tasks")}>Tarefas</button>
          <button className={view === "scheduled" ? "active" : ""} onClick={() => setView("scheduled")}>
            Mensagens agendadas{pendingAttach.length ? ` · ⚠️ ${pendingAttach.length}` : ""}
          </button>
        </div>
        {view === "tasks" && <button className="connect-btn" style={{ width: "auto", padding: "0 18px" }} onClick={() => setShowNew(true)}><Plus size={15} /> Nova tarefa</button>}
      </div>

      {msg && <div className={`admin-feedback ${msg.type}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      {pendingAttach.length > 0 && (
        <div className="card task-alert">
          <div className="card-title"><AlertTriangle size={17} color="#ff9500" /> Pendências antes do disparo</div>
          {pendingAttach.map((m) => (
            <div key={m.id} className="task-row">
              <div className="task-main">
                <strong>{m.conversationName || "Conversa"}</strong>
                <span className="cv-muted">{recurLabel(m)} · previsto para {dt(m.sendAt)} · "{(m.text || "").slice(0, 80)}"</span>
              </div>
              <label className="pill-btn primary" style={{ cursor: "pointer" }}>
                <Paperclip size={14} /> Anexar arquivo
                <input type="file" style={{ display: "none" }} onChange={(e) => attach(m.id, e.target.files?.[0])} />
              </label>
            </div>
          ))}
        </div>
      )}

      {view === "tasks" ? (
        <div className="card">
          <div className="gestao-row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <div className="dash-presets">
              {[["open", "Abertas"], ["done", "Concluídas"], ["all", "Todas"]].map(([k, l]) => (
                <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            {isManager && (
              <div className="dash-presets">
                <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>Equipe</button>
                <button className={scope === "mine" ? "active" : ""} onClick={() => setScope("mine")}>Minhas</button>
              </div>
            )}
          </div>
          {tasks === null && <div className="cv-muted">Carregando…</div>}
          {shown.map((t) => {
            const late = t.status === "open" && t.dueAt && new Date(t.dueAt) < new Date();
            return (
              <div key={t.id} className={`task-row ${t.status === "done" ? "done" : ""}`}>
                <button className="task-check" onClick={() => toggle(t)} title={t.status === "done" ? "Reabrir" : "Concluir"}>
                  {t.status === "done" ? <CheckCircle2 size={20} color="#34c759" /> : <Circle size={20} />}
                </button>
                <div className="task-main">
                  <strong>{t.kind === "attachment" ? "📎 " : ""}{t.title}</strong>
                  {t.description && <span className="cv-muted">{t.description}</span>}
                  <span className="task-meta">
                    {t.assigneeName ? `👤 ${t.assigneeName}` : "Sem responsável"}
                    {t.createdByName && t.createdByName !== t.assigneeName ? ` · criada por ${t.createdByName}` : ""}
                    {t.dueAt ? <span className={late ? "task-late" : ""}> · prazo {dt(t.dueAt)}</span> : null}
                    {t.conversationName ? ` · 💬 ${t.conversationName}` : ""}
                  </span>
                </div>
                {t.kind === "attachment" && t.status === "open" && t.scheduledMessageId && (
                  <label className="pill-btn primary" style={{ cursor: "pointer" }}>
                    <Paperclip size={14} /> Anexar
                    <input type="file" style={{ display: "none" }} onChange={(e) => attach(t.scheduledMessageId, e.target.files?.[0])} />
                  </label>
                )}
                <button className="icon-btn" title="Excluir" onClick={() => remove(t)}><Trash2 size={15} /></button>
              </div>
            );
          })}
          {tasks && !shown.length && <div className="cv-muted" style={{ padding: "10px 0" }}>Nenhuma tarefa aqui.</div>}
        </div>
      ) : (
        <div className="card">
          <div className="card-subtitle">Tudo o que está programado para sair automaticamente. Agende pelo chat (📎 → Agendar mensagem).</div>
          {scheduled === null && <div className="cv-muted">Carregando…</div>}
          {upcoming.map((m) => (
            <div key={m.id} className="task-row">
              <CalendarClock size={18} color="#0071e3" />
              <div className="task-main">
                <strong>{m.conversationName || "Conversa"} · {dt(m.sendAt)}</strong>
                <span className="cv-muted">{m.text}{m.fileName ? ` 📎 ${m.fileName}` : ""}</span>
                <span className="task-meta">{recurLabel(m)}{m.sign ? " · com assinatura" : ""}{m.needsAttachment ? " · anexo variável" : ""}{m.createdBy ? ` · por ${m.createdBy}` : ""}</span>
              </div>
              <button className="icon-btn" title="Cancelar" onClick={async () => { if (confirm("Cancelar este agendamento?")) { await cancelScheduledMessageApi(m.id); loadScheduled(); } }}><X size={15} /></button>
            </div>
          ))}
          {scheduled && !upcoming.length && <div className="cv-muted" style={{ padding: "10px 0" }}>Nenhuma mensagem agendada.</div>}
        </div>
      )}

      {showNew && <NewTaskModal team={team} profile={profile} isManager={isManager} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); loadTasks(); }} />}
    </div>
  );
}

function NewTaskModal({ team, profile, isManager, onClose, onSaved }) {
  const [f, setF] = useState({ title: "", description: "", assigneeId: profile?.id || "", dueAt: "" });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    try {
      await createTaskApi({ ...f, dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null, assigneeId: f.assigneeId || null });
      onSaved();
    } catch (e2) {
      setErr(errText(e2));
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal lg-modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-header"><h3>Nova tarefa</h3><button type="button" className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        <label className="login-field"><span>Título</span><input autoFocus value={f.title} onChange={set("title")} placeholder="Ex: Ligar para o cliente X" /></label>
        <label className="login-field"><span>Detalhes (opcional)</span><textarea rows={3} value={f.description} onChange={set("description")} /></label>
        <label className="login-field"><span>Responsável</span>
          <select value={f.assigneeId} onChange={set("assigneeId")}>
            <option value={profile?.id || ""}>Eu mesmo</option>
            {team.filter((m) => m.id !== profile?.id).map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select>
        </label>
        <label className="login-field"><span>Prazo (opcional)</span><input type="datetime-local" value={f.dueAt} onChange={set("dueAt")} /></label>
        {err && <div className="admin-feedback error">{err}</div>}
        <button className="connect-btn" disabled={!f.title.trim()}>Criar tarefa</button>
      </form>
    </div>
  );
}
