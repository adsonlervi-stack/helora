import React from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { ACTIONS, OPERATORS, VALIDATIONS, DAYS, uid } from "./flowMeta.js";

const VAR_HINT = "Use {nome}, {telefone} ou qualquer resposta salva, ex: {email}";

function Field({ label, hint, children }) {
  return (
    <label className="fi-field">
      {label && <span className="fi-label">{label}</span>}
      {children}
      {hint && <small className="fi-hint">{hint}</small>}
    </label>
  );
}

/** Seção com título pequeno e caixa branca, como nos Ajustes do iPhone. */
function Section({ title, footer, children }) {
  return (
    <section className="fi-sec">
      {title && <div className="fi-sec-title">{title}</div>}
      <div className="fi-box">{children}</div>
      {footer && <div className="fi-sec-foot">{footer}</div>}
    </section>
  );
}

export default function NodeInspector({ node, ctx, onChange, disabled, stats }) {
  const d = node.data || {};
  const set = (k) => (e) => onChange({ [k]: e.target.value });

  return (
    <div className="fe-insp-body">
      {node.type === "trigger" && (
        <p className="fi-note">
          O fluxo começa quando chega a primeira mensagem de um cliente (ou quando uma conversa resolvida recebe mensagem nova). Ligue a saída deste bloco ao primeiro passo.
        </p>
      )}

      {(node.type === "message" || node.type === "question" || node.type === "options" || node.type === "end") && (
        <Section title={node.type === "question" ? "Pergunta" : node.type === "options" ? "Texto do menu" : "Mensagem"} footer={VAR_HINT}>
          <textarea className="fi-textarea" rows={5} value={d.text || ""} onChange={set("text")} disabled={disabled} placeholder="Escreva aqui… *negrito* e _itálico_ funcionam no WhatsApp" />
        </Section>
      )}

      {node.type === "question" && (
        <Section title="Resposta">
          <Field label="Guardar resposta como" hint="Depois use no texto entre chaves, ex: {email}">
            <input value={d.variable || ""} onChange={(e) => onChange({ variable: e.target.value.replace(/[^\w]/g, "").toLowerCase() })} disabled={disabled} />
          </Field>
          <Field label="Tipo de resposta esperada">
            <select value={d.validation || "text"} onChange={set("validation")} disabled={disabled}>
              {Object.entries(VALIDATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Se a resposta não servir">
            <input value={d.invalidText || ""} onChange={set("invalidText")} disabled={disabled} />
          </Field>
        </Section>
      )}

      {node.type === "options" && (
        <>
          <Section title="Opções" footer="O cliente pode responder com o número ou com o texto da opção.">
          {(d.options || []).map((o, i) => (
            <div key={o.id} className="fe-opt-row">
              <span className="fe-opt-num">{i + 1}</span>
              <input
                value={o.label}
                disabled={disabled}
                onChange={(e) => onChange({ options: d.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })}
              />
              {stats?.ports?.[o.id] > 0 && <span className="fe-port-count">{stats.ports[o.id]}</span>}
              <button className="fi-icon" disabled={disabled || i === 0} title="Subir"
                onClick={() => { const a = [...d.options]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; onChange({ options: a }); }}><ArrowUp size={13} /></button>
              <button className="fi-icon" disabled={disabled || i === d.options.length - 1} title="Descer"
                onClick={() => { const a = [...d.options]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; onChange({ options: a }); }}><ArrowDown size={13} /></button>
              <button className="fi-icon" disabled={disabled} title="Remover"
                onClick={() => onChange({ options: d.options.filter((x) => x.id !== o.id) })}><Trash2 size={13} /></button>
            </div>
          ))}
          {!disabled && (d.options || []).length < 10 && (
            <button type="button" className="fi-add" onClick={() => onChange({ options: [...(d.options || []), { id: uid("op"), label: `Opção ${(d.options || []).length + 1}` }] })}>
              <Plus size={14} /> Adicionar opção
            </button>
          )}
          </Section>
          <Section title="Se o cliente errar">
          <Field label="Mensagem de opção inválida">
            <input value={d.invalidText || ""} onChange={set("invalidText")} disabled={disabled} />
          </Field>
          <Field label="Tentativas antes de seguir por “Não respondeu certo”">
            <input type="number" min="0" max="5" value={d.maxRetries ?? 2} onChange={(e) => onChange({ maxRetries: parseInt(e.target.value, 10) || 0 })} disabled={disabled} />
          </Field>
          </Section>
          <Section title="Avançado">
          <Field label="Guardar a escolha como (opcional)" hint="Ex.: setor → depois use {setor} nas mensagens">
            <input value={d.variable || ""} onChange={(e) => onChange({ variable: e.target.value.replace(/[^\w]/g, "").toLowerCase() })} disabled={disabled} />
          </Field>
          </Section>
        </>
      )}

      {node.type === "hours" && (
        <>
          <Section title="Dias de atendimento">
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
          </Section>
          <Section title="Horário" footer="Horário de Brasília. Fora desses dias e horas, segue pela saída “Fechado”.">
          <div className="fe-two">
            <Field label="Abre às"><input type="time" value={d.start || "08:00"} onChange={set("start")} disabled={disabled} /></Field>
            <Field label="Fecha às"><input type="time" value={d.end || "18:00"} onChange={set("end")} disabled={disabled} /></Field>
          </div>
          </Section>
        </>
      )}

      {node.type === "condition" && (
        <Section title="Regra">
          <Field label="Resposta (variável)" hint="O nome que você usou em “Guardar resposta como”">
            <input value={d.variable || ""} onChange={(e) => onChange({ variable: e.target.value.replace(/[^\w]/g, "").toLowerCase() })} disabled={disabled} />
          </Field>
          <Field label="Condição">
            <select value={d.operator || "equals"} onChange={set("operator")} disabled={disabled}>
              {Object.entries(OPERATORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {!["not_empty", "empty"].includes(d.operator) && (
            <Field label="Valor"><input value={d.value || ""} onChange={set("value")} disabled={disabled} /></Field>
          )}
        </Section>
      )}

      {node.type === "http" && (
        <>
          <p className="fi-note">
            Consulta a API do sistema da empresa (reservas, pedidos, boletos…) e guarda os dados da resposta em variáveis para usar nas mensagens. Use {"{telefone}"} ou respostas salvas (ex.: {"{cpf}"}) no endereço.
          </p>
          <Section title="Requisição">
            <Field label="Método">
              <select value={d.method || "GET"} onChange={set("method")} disabled={disabled}>
                <option value="GET">GET (buscar)</option>
                <option value="POST">POST (enviar dados)</option>
              </select>
            </Field>
            <Field label="Endereço (URL)" hint="Ex.: https://api.suaagencia.com/reservas?telefone={telefone}">
              <input value={d.url || ""} onChange={set("url")} disabled={disabled} placeholder="https://" />
            </Field>
            <Field label="Cabeçalhos (um por linha)" hint="Ex.: Authorization: Bearer SEU_TOKEN">
              <textarea className="fi-textarea" rows={2} value={d.headers || ""} onChange={set("headers")} disabled={disabled} placeholder="Authorization: Bearer …" />
            </Field>
            {d.method === "POST" && (
              <Field label="Corpo (JSON)">
                <textarea className="fi-textarea" rows={3} value={d.body || ""} onChange={set("body")} disabled={disabled} placeholder={'{"cpf": "{cpf}"}'} />
              </Field>
            )}
          </Section>
          <Section title="Guardar da resposta" footer="Caminho no JSON da resposta. Ex.: reserva.voo.numero ou itens[0].nome">
            {(d.map || []).map((m, i) => (
              <div key={i} className="fi-map">
                <input value={m.var || ""} placeholder="variável (ex.: voo)" disabled={disabled} onChange={(e) => onChange({ map: d.map.map((x, j) => (j === i ? { ...x, var: e.target.value.replace(/[^\w]/g, "").toLowerCase() } : x)) })} />
                <span>=</span>
                <input value={m.path || ""} placeholder="caminho (ex.: dados.voo)" disabled={disabled} onChange={(e) => onChange({ map: d.map.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)) })} />
                <button type="button" className="fi-icon" disabled={disabled} onClick={() => onChange({ map: d.map.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
              </div>
            ))}
            <button type="button" className="fi-add" disabled={disabled} onClick={() => onChange({ map: [...(d.map || []), { var: "", path: "" }] })}><Plus size={14} /> Guardar outro dado</button>
          </Section>
          <Section title="Mensagem quando der certo" footer={VAR_HINT}>
            <textarea className="fi-textarea" rows={4} value={d.text || ""} onChange={set("text")} disabled={disabled} placeholder="Sua reserva {localizador}: voo {voo} saindo às {horario}." />
          </Section>
          <Section title="Mensagem se falhar">
            <textarea className="fi-textarea" rows={2} value={d.errorText || ""} onChange={set("errorText")} disabled={disabled} />
          </Section>
        </>
      )}

      {node.type === "lookup" && (
        <>
          <p className="fi-note">
            Procura no CRM o card do cliente pelo número do WhatsApp dele e responde com os dados do card. Os campos ficam disponíveis como variáveis para os próximos blocos também.
          </p>
          <Section title="Onde procurar">
            <Field label="Funil do CRM" hint="Deixe em “Todos” para procurar em qualquer funil.">
              <select value={d.pipelineId || ""} onChange={set("pipelineId")} disabled={disabled}>
                <option value="">Todos os funis</option>
                {(ctx.pipelines || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </Section>
          <Section title="Resposta quando encontrar" footer="Clique numa variável para inserir no texto.">
            <textarea className="fi-textarea" rows={6} value={d.text || ""} onChange={set("text")} disabled={disabled} />
            <div className="fi-vars">
              {[["nome", "Nome"], ["nome_completo", "Nome completo"], ["empresa", "Empresa"], ["valor", "Valor"], ["etapa", "Etapa"], ["responsavel", "Responsável"],
                ...(((ctx.pipelines || []).find((p) => p.id === d.pipelineId)?.fields) || ((ctx.pipelines || []).flatMap((p) => p.fields || []))).map((f) => [f.id, f.label])]
                .filter((v, i, a) => a.findIndex((x) => x[0] === v[0]) === i)
                .map(([k, l]) => <button type="button" key={k} disabled={disabled} onClick={() => onChange({ text: `${d.text || ""}{${k}}` })}>{l}</button>)}
            </div>
            <label className="fi-check"><input type="checkbox" checked={!!d.sendFiles} onChange={(e) => onChange({ sendFiles: e.target.checked })} disabled={disabled} /> Enviar também os anexos do card (vouchers, apólices, PDFs)</label>
          </Section>
          <Section title="Quando não encontrar">
            <textarea className="fi-textarea" rows={3} value={d.notFoundText || ""} onChange={set("notFoundText")} disabled={disabled} />
          </Section>
        </>
      )}

      {node.type === "ai" && (
        <>
          <p className="fi-note">
            A IA responde o cliente seguindo o prompt escolhido, até resolver (saída <strong>Resolveu</strong>) ou precisar de uma pessoa (saída <strong>Precisa de humano</strong>). Conversa assumida por humano nunca recebe resposta da IA.
          </p>
          <Section title="Configuração">
          <Field label="Prompt de IA" hint="Crie e edite os prompts em Fluxos → ✨ Prompts de IA.">
            <select value={d.promptId || ""} onChange={set("promptId")} disabled={disabled}>
              <option value="">Escolha um prompt…</option>
              {(ctx.prompts || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Máximo de respostas da IA nesta etapa" hint="Passando disso, a conversa vai para humano.">
            <input type="number" min="1" max="100" value={d.maxTurns || 20} onChange={(e) => onChange({ maxTurns: parseInt(e.target.value, 10) || 20 })} disabled={disabled} />
          </Field>
          </Section>
        </>
      )}

      {node.type === "wait" && (
        <Section title="Pausa" footer="Máximo 600 segundos (10 minutos).">
          <Field label="Esperar (segundos)">
            <input type="number" min="1" max="600" value={d.seconds || 5} onChange={(e) => onChange({ seconds: parseInt(e.target.value, 10) || 1 })} disabled={disabled} />
          </Field>
        </Section>
      )}

      {node.type === "action" && (
        <>
          <Section title="Ação">
          <Field label="O que fazer">
            <select value={d.action || "transfer"} onChange={set("action")} disabled={disabled}>
              {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {d.action === "transfer" && (
            <Field label="Setor" hint="A conversa vai para a Fila desse setor e o bot para de responder">
              <select value={d.departmentId || ""} onChange={(e) => onChange({ departmentId: e.target.value || null, departmentName: ctx.departments.find((x) => x.id === e.target.value)?.name })} disabled={disabled}>
                <option value="">Fila geral</option>
                {ctx.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
          )}
          {d.action === "assign" && (
            <Field label="Atendente">
              <select value={d.agentId || ""} onChange={set("agentId")} disabled={disabled}>
                <option value="">Escolha…</option>
                {ctx.team.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
          )}
          {d.action === "label" && (
            <Field label="Etiqueta" hint="Depois de etiquetar, o fluxo segue pela saída">
              <select value={d.labelId || ""} onChange={set("labelId")} disabled={disabled}>
                <option value="">Escolha…</option>
                {ctx.labels.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
            </Field>
          )}
          </Section>
          <Section title="Mensagem antes (opcional)" footer={VAR_HINT}>
            <textarea className="fi-textarea" rows={3} value={d.text || ""} onChange={set("text")} disabled={disabled} />
          </Section>
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
