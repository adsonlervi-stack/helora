import React from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { ACTIONS, OPERATORS, VALIDATIONS, DAYS, uid } from "./flowMeta.js";

const VAR_HINT = "Use {nome}, {telefone} ou qualquer resposta salva, ex: {email}";

function Field({ label, hint, children }) {
  return (
    <label className="login-field fe-field">
      <span>{label}</span>
      {children}
      {hint && <small className="fe-hint">{hint}</small>}
    </label>
  );
}

export default function NodeInspector({ node, ctx, onChange, disabled, stats }) {
  const d = node.data || {};
  const set = (k) => (e) => onChange({ [k]: e.target.value });

  return (
    <div className="fe-insp-body">
      {node.type === "trigger" && (
        <p className="cv-muted">
          O fluxo começa quando chega a primeira mensagem de um cliente (ou quando uma conversa resolvida recebe mensagem nova). Ligue a saída deste bloco ao primeiro passo.
        </p>
      )}

      {(node.type === "message" || node.type === "question" || node.type === "options" || node.type === "end") && (
        <Field label={node.type === "question" ? "Pergunta" : node.type === "options" ? "Texto do menu" : "Mensagem"} hint={VAR_HINT}>
          <textarea rows={5} value={d.text || ""} onChange={set("text")} disabled={disabled} placeholder="Escreva aqui… *negrito* e _itálico_ funcionam no WhatsApp" />
        </Field>
      )}

      {node.type === "question" && (
        <>
          <Field label="Guardar resposta como" hint="Depois use no texto entre chaves, ex: {email}">
            <input value={d.variable || ""} onChange={(e) => onChange({ variable: e.target.value.replace(/[^\w]/g, "").toLowerCase() })} disabled={disabled} />
          </Field>
          <Field label="Tipo de resposta esperada">
            <select className="deal-stage-select" value={d.validation || "text"} onChange={set("validation")} disabled={disabled}>
              {Object.entries(VALIDATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Se a resposta não servir">
            <input value={d.invalidText || ""} onChange={set("invalidText")} disabled={disabled} />
          </Field>
        </>
      )}

      {node.type === "options" && (
        <>
          <div className="fe-field-label">Opções (o cliente responde com o número ou o nome)</div>
          {(d.options || []).map((o, i) => (
            <div key={o.id} className="fe-opt-row">
              <span className="fe-opt-num">{i + 1}</span>
              <input
                value={o.label}
                disabled={disabled}
                onChange={(e) => onChange({ options: d.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })}
              />
              {stats?.ports?.[o.id] > 0 && <span className="fe-port-count">{stats.ports[o.id]}</span>}
              <button className="cv-icon-btn" disabled={disabled || i === 0} title="Subir"
                onClick={() => { const a = [...d.options]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; onChange({ options: a }); }}><ArrowUp size={13} /></button>
              <button className="cv-icon-btn" disabled={disabled || i === d.options.length - 1} title="Descer"
                onClick={() => { const a = [...d.options]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; onChange({ options: a }); }}><ArrowDown size={13} /></button>
              <button className="cv-icon-btn" disabled={disabled} title="Remover"
                onClick={() => onChange({ options: d.options.filter((x) => x.id !== o.id) })}><Trash2 size={13} /></button>
            </div>
          ))}
          {!disabled && (d.options || []).length < 10 && (
            <button className="pill-btn" onClick={() => onChange({ options: [...(d.options || []), { id: uid("op"), label: `Opção ${(d.options || []).length + 1}` }] })}>
              <Plus size={14} /> Adicionar opção
            </button>
          )}
          <Field label="Guardar a escolha como (opcional)" hint="Ex: setor → depois use {setor}">
            <input value={d.variable || ""} onChange={(e) => onChange({ variable: e.target.value.replace(/[^\w]/g, "").toLowerCase() })} disabled={disabled} />
          </Field>
          <Field label="Se responder algo que não é opção">
            <input value={d.invalidText || ""} onChange={set("invalidText")} disabled={disabled} />
          </Field>
          <Field label="Tentativas antes de seguir pela saída “Não respondeu certo”">
            <input type="number" min="0" max="5" value={d.maxRetries ?? 2} onChange={(e) => onChange({ maxRetries: parseInt(e.target.value, 10) || 0 })} disabled={disabled} />
          </Field>
        </>
      )}

      {node.type === "hours" && (
        <>
          <div className="fe-field-label">Dias de atendimento</div>
          <div className="fe-days-row">
            {DAYS.map((label, i) => {
              const on = (d.days || []).includes(i);
              return (
                <button key={i} className={`cv-chip ${on ? "active" : ""}`} disabled={disabled}
                  onClick={() => onChange({ days: on ? d.days.filter((x) => x !== i) : [...(d.days || []), i].sort() })}>
                  {label}
                </button>
              );
            })}
          </div>
          <div className="fe-two">
            <Field label="Abre às"><input type="time" value={d.start || "08:00"} onChange={set("start")} disabled={disabled} /></Field>
            <Field label="Fecha às"><input type="time" value={d.end || "18:00"} onChange={set("end")} disabled={disabled} /></Field>
          </div>
          <p className="cv-muted">Horário de Brasília. Fora desses dias e horas, segue pela saída “Fechado”.</p>
        </>
      )}

      {node.type === "condition" && (
        <>
          <Field label="Resposta (variável)" hint="O nome que você usou em “Guardar resposta como”">
            <input value={d.variable || ""} onChange={(e) => onChange({ variable: e.target.value.replace(/[^\w]/g, "").toLowerCase() })} disabled={disabled} />
          </Field>
          <Field label="Condição">
            <select className="deal-stage-select" value={d.operator || "equals"} onChange={set("operator")} disabled={disabled}>
              {Object.entries(OPERATORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {!["not_empty", "empty"].includes(d.operator) && (
            <Field label="Valor"><input value={d.value || ""} onChange={set("value")} disabled={disabled} /></Field>
          )}
        </>
      )}

      {node.type === "ai" && (
        <>
          <p className="cv-muted" style={{ marginTop: 0 }}>
            A IA responde o cliente sozinha, seguindo estas instruções, até resolver (saída <strong>Resolveu</strong>) ou perceber que precisa de uma pessoa (saída <strong>Precisa de humano</strong> — ligue a uma Ação de transferir). Só funciona enquanto o robô está atendendo; conversa assumida por humano nunca recebe resposta da IA.
          </p>
          <Field label="Quem é a IA e como deve atender" hint="Ex.: Você é a Ana, da corretora X. Descubra o tipo de seguro que o cliente quer, peça nome e cidade e ofereça agendar uma ligação.">
            <textarea rows={6} value={d.instructions || ""} onChange={set("instructions")} disabled={disabled} />
          </Field>
          <Field label="Base de conhecimento" hint="Cole aqui informações da empresa: serviços, horários, endereço, perguntas frequentes. A IA não inventa nada fora disto.">
            <textarea rows={8} value={d.knowledge || ""} onChange={set("knowledge")} disabled={disabled} />
          </Field>
          <Field label="Máximo de respostas da IA" hint="Passando disso, a conversa vai para humano.">
            <input type="number" min="1" max="50" value={d.maxTurns || 12} onChange={(e) => onChange({ maxTurns: parseInt(e.target.value, 10) || 12 })} disabled={disabled} />
          </Field>
        </>
      )}

      {node.type === "wait" && (
        <Field label="Esperar (segundos)" hint="Máximo 600 segundos (10 minutos)">
          <input type="number" min="1" max="600" value={d.seconds || 5} onChange={(e) => onChange({ seconds: parseInt(e.target.value, 10) || 1 })} disabled={disabled} />
        </Field>
      )}

      {node.type === "action" && (
        <>
          <Field label="O que fazer">
            <select className="deal-stage-select" value={d.action || "transfer"} onChange={set("action")} disabled={disabled}>
              {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {d.action === "transfer" && (
            <Field label="Setor" hint="A conversa vai para a Fila desse setor e o bot para de responder">
              <select className="deal-stage-select" value={d.departmentId || ""} onChange={(e) => onChange({ departmentId: e.target.value || null, departmentName: ctx.departments.find((x) => x.id === e.target.value)?.name })} disabled={disabled}>
                <option value="">Fila geral</option>
                {ctx.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
          )}
          {d.action === "assign" && (
            <Field label="Atendente">
              <select className="deal-stage-select" value={d.agentId || ""} onChange={set("agentId")} disabled={disabled}>
                <option value="">Escolha…</option>
                {ctx.team.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
          )}
          {d.action === "label" && (
            <Field label="Etiqueta" hint="Depois de etiquetar, o fluxo segue pela saída">
              <select className="deal-stage-select" value={d.labelId || ""} onChange={set("labelId")} disabled={disabled}>
                <option value="">Escolha…</option>
                {ctx.labels.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
            </Field>
          )}
          <Field label="Mensagem antes (opcional)" hint={VAR_HINT}>
            <textarea rows={3} value={d.text || ""} onChange={set("text")} disabled={disabled} />
          </Field>
        </>
      )}

      {stats && (
        <div className="fe-insp-stats">
          <div><strong>{stats.sent || 0}</strong><span>passaram aqui</span></div>
          {(node.type === "question" || node.type === "options") && (
            <>
              <div><strong>{stats.reply || 0}</strong><span>responderam</span></div>
              <div><strong>{stats.invalid || 0}</strong><span>erraram</span></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
