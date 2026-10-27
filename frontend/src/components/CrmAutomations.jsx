import React, { useState } from "react";
import { Plus, Trash2, Zap, Copy } from "lucide-react";
import { crm } from "../api.js";
import { notify, askConfirm } from "../dialogs.js";
import { Sheet, Button, Switch } from "./ui.jsx";

const uid = () => Math.random().toString(36).slice(2, 10);
const errText = (e) => e?.response?.data?.error || e?.message || "Erro";

const TRIGGERS = [
  ["created", "Um card é criado"],
  ["moved", "Um card entra na etapa…"],
  ["won", "Um card é ganho"],
  ["lost", "Um card é perdido"],
  ["field", "Um campo é alterado…"],
  ["idle", "Um card fica parado…"],
  ["date", "Chega uma data do card…"]
];
const ACTIONS = [
  ["message", "Enviar mensagem no WhatsApp"],
  ["move", "Mover para a etapa"],
  ["task", "Criar tarefa"],
  ["followup", "Agendar follow-up"],
  ["owner", "Trocar o responsável"],
  ["tag", "Adicionar tag"],
  ["field", "Preencher um campo"],
  ["copy", "Criar card em outro funil"],
  ["snooze", "Reagendar o card"],
  ["archive", "Arquivar o card"]
];
const OPS = [["eq", "é igual a"], ["neq", "é diferente de"], ["filled", "está preenchido"], ["empty", "está vazio"]];

function presets(pipe) {
  const st = pipe.stages || [];
  const first = st[0]?.id, second = st[1]?.id || first;
  const lost = st.find((s) => /perdid|cancel|negad/i.test(s.name))?.id;
  const date = (pipe.fields || []).find((f) => f.type === "date");
  return [
    { name: "Boas-vindas para lead novo", trigger: { type: "created" }, conditions: [], actions: [
      { type: "message", text: "Olá, {nome}! Recebemos seu contato e já vamos te atender. 😊" },
      { type: "task", title: "Primeiro contato com {nome_completo}", days: 0 }
    ] },
    { name: "Cobrar card parado", trigger: { type: "idle", stageId: second, days: 3 }, conditions: [], actions: [
      { type: "task", title: "Retomar contato com {nome_completo} (parado há 3 dias)", days: 0 }
    ] },
    ...(date ? [{ name: `Aviso de ${date.label}`, trigger: { type: "date", fieldId: date.id, days: -30 }, conditions: [], actions: [
      { type: "move", stageId: first },
      { type: "message", text: `Olá, {nome}! Faltam 30 dias para {${date.id}}. Vamos cuidar disso?` },
      { type: "task", title: `Renovar {nome_completo}`, days: 1 }
    ] }] : []),
    { name: "Ganhou: pedir indicação", trigger: { type: "won" }, conditions: [], actions: [
      { type: "message", text: "Obrigado pela confiança, {nome}! 🙏 Se conhecer alguém que precise, é só indicar." },
      { type: "followup", title: "Pós-venda {nome}", days: 30 }
    ] },
    ...(lost ? [{ name: "Perdeu: tentar de novo em 90 dias", trigger: { type: "lost" }, conditions: [], actions: [{ type: "snooze", days: 90 }] }] : [])
  ];
}

export default function AutomationsSheet({ pipeline, pipelines, tags, team, departments, onClose, onSaved }) {
  const [rules, setRules] = useState(() => (pipeline.automations || []).map((r) => ({ ...r, conditions: r.conditions || [], actions: r.actions || [] })));
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);
  const stages = pipeline.stages || [];
  const fields = pipeline.fields || [];
  const fieldOpts = [...fields.map((f) => [f.id, f.label]), ["__owner", "Responsável"], ["__outcome", "Resultado (ganho/perdido)"]];
  const upd = (id, patch) => setRules((l) => l.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const updT = (r, patch) => upd(r.id, { trigger: { ...r.trigger, ...patch } });
  const updA = (r, i, patch) => upd(r.id, { actions: r.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const updC = (r, i, patch) => upd(r.id, { conditions: r.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const add = (base) => { const r = { id: uid(), active: true, name: "Nova automação", trigger: { type: "created" }, conditions: [], actions: [{ type: "message", text: "" }], ...base, ...(base ? { id: uid(), active: true } : {}) }; setRules((l) => [...l, r]); setOpenId(r.id); };
  const save = async () => {
    setBusy(true);
    try {
      await crm.updatePipeline(pipeline.id, { automations: rules });
      notify("Automações salvas.", "success");
      onSaved?.();
    } catch (e) { notify(/automations/.test(errText(e)) ? "Rode a migration 038 no Supabase." : errText(e), "error"); }
    setBusy(false);
  };
  const stageName = (id) => stages.find((s) => s.id === id)?.name || "qualquer etapa";
  const summary = (r) => {
    const t = r.trigger || {};
    const q = t.type === "moved" ? `entra em ${stageName(t.stageId)}` : t.type === "idle" ? `parado ${t.days ?? 3} dia(s) em ${stageName(t.stageId)}` : t.type === "date" ? `${Math.abs(t.days ?? 0)} dia(s) ${Number(t.days) < 0 ? "antes de" : Number(t.days) > 0 ? "depois de" : "no dia de"} ${fields.find((f) => f.id === t.fieldId)?.label || "data"}` : t.type === "field" ? `${fields.find((f) => f.id === t.fieldId)?.label || "campo"} muda${t.value ? ` para "${t.value}"` : ""}` : TRIGGERS.find((x) => x[0] === t.type)?.[1].replace("Um card ", "").replace("…", "");
    return `Quando ${q} → ${r.actions.map((a) => ACTIONS.find((x) => x[0] === a.type)?.[1].toLowerCase()).join(", ") || "nada"}`;
  };

  return (
    <Sheet title={`Automações · ${pipeline.name}`} subtitle="Regras de processo: QUANDO algo acontece, SE as condições batem, ENTÃO o Helora faz as ações sozinho." onClose={onClose} width={720}
      footer={<><Button variant="secondary" onClick={onClose}>Fechar</Button><Button disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar automações"}</Button></>}>
      <div className="au-list">
        {rules.map((r) => (
          <div key={r.id} className={`au-rule ${openId === r.id ? "open" : ""} ${r.active === false ? "off" : ""}`}>
            <div className="au-head" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
              <span className="au-ico"><Zap size={15} /></span>
              <div className="au-title">
                <strong>{r.name || "Automação"}</strong>
                <small>{summary(r)}</small>
              </div>
              <span onClick={(e) => e.stopPropagation()}><Switch checked={r.active !== false} onChange={(v) => upd(r.id, { active: v })} /></span>
            </div>
            {openId === r.id && (
              <div className="au-body">
                <input className="au-name" value={r.name} onChange={(e) => upd(r.id, { name: e.target.value })} placeholder="Nome da automação" />

                <div className="au-block">
                  <span className="au-tag q">QUANDO</span>
                  <div className="au-row">
                    <select value={r.trigger.type} onChange={(e) => updT(r, { type: e.target.value })}>
                      {TRIGGERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    {(r.trigger.type === "moved" || r.trigger.type === "idle") && (
                      <select value={r.trigger.stageId || ""} onChange={(e) => updT(r, { stageId: e.target.value || undefined })}>
                        <option value="">{r.trigger.type === "idle" ? "em qualquer etapa" : "qualquer etapa"}</option>
                        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                    {r.trigger.type === "idle" && <label className="au-days">por <input type="number" min="1" max="365" value={r.trigger.days ?? 3} onChange={(e) => updT(r, { days: e.target.value })} /> dia(s)</label>}
                    {r.trigger.type === "field" && (
                      <>
                        <select value={r.trigger.fieldId || ""} onChange={(e) => updT(r, { fieldId: e.target.value })}>
                          <option value="">Escolha o campo…</option>
                          {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                        </select>
                        <input value={r.trigger.value || ""} onChange={(e) => updT(r, { value: e.target.value })} placeholder="para o valor (opcional)" />
                      </>
                    )}
                    {r.trigger.type === "date" && (
                      <>
                        <label className="au-days"><input type="number" min="0" max="365" value={Math.abs(r.trigger.days ?? 30)} onChange={(e) => updT(r, { days: (Number(r.trigger.days) > 0 ? 1 : -1) * Math.abs(parseInt(e.target.value, 10) || 0) })} /> dia(s)</label>
                        <select value={Number(r.trigger.days ?? -30) > 0 ? "after" : Number(r.trigger.days) === 0 ? "on" : "before"} onChange={(e) => { const n = Math.abs(Number(r.trigger.days ?? 30)) || 1; updT(r, { days: e.target.value === "after" ? n : e.target.value === "on" ? 0 : -n }); }}>
                          <option value="before">antes de</option><option value="on">no dia de</option><option value="after">depois de</option>
                        </select>
                        <select value={r.trigger.fieldId || ""} onChange={(e) => updT(r, { fieldId: e.target.value })}>
                          <option value="">Escolha a data…</option>
                          {fields.filter((f) => f.type === "date").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                        </select>
                      </>
                    )}
                  </div>
                </div>

                <div className="au-block">
                  <span className="au-tag s">SE</span>
                  {!r.conditions.length && <span className="au-muted">Sempre (sem condição)</span>}
                  {r.conditions.map((c, i) => (
                    <div key={i} className="au-row">
                      <select value={c.fieldId} onChange={(e) => updC(r, i, { fieldId: e.target.value })}>
                        {fieldOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      <select value={c.op} onChange={(e) => updC(r, i, { op: e.target.value })}>
                        {OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      {(c.op === "eq" || c.op === "neq") && (c.fieldId === "__owner" ? (
                        <select value={c.value || ""} onChange={(e) => updC(r, i, { value: e.target.value })}>
                          <option value="">—</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                        </select>
                      ) : c.fieldId === "__outcome" ? (
                        <select value={c.value || ""} onChange={(e) => updC(r, i, { value: e.target.value })}>
                          <option value="">Em andamento</option><option value="won">Ganho</option><option value="lost">Perdido</option>
                        </select>
                      ) : (
                        <input value={c.value || ""} onChange={(e) => updC(r, i, { value: e.target.value })} placeholder="valor" list={`au-${r.id}-${i}`} />
                      ))}
                      <datalist id={`au-${r.id}-${i}`}>{(fields.find((f) => f.id === c.fieldId)?.options || []).slice(0, 80).map((o) => <option key={o} value={o.includes(" > ") ? o.split(" > ")[1] : o} />)}</datalist>
                      <button type="button" className="fi-icon" onClick={() => upd(r.id, { conditions: r.conditions.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <button type="button" className="au-add" onClick={() => upd(r.id, { conditions: [...r.conditions, { fieldId: fieldOpts[0]?.[0], op: "eq", value: "" }] })}><Plus size={13} /> Condição</button>
                </div>

                <div className="au-block">
                  <span className="au-tag e">ENTÃO</span>
                  {r.actions.map((a, i) => (
                    <div key={i} className="au-action">
                      <div className="au-row">
                        <span className="au-step">{i + 1}</span>
                        <select value={a.type} onChange={(e) => updA(r, i, { type: e.target.value })}>
                          {ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                        {(a.type === "move" || a.type === "copy") && (
                          <>
                            {a.type === "copy" && (
                              <select value={a.pipelineId || ""} onChange={(e) => updA(r, i, { pipelineId: e.target.value, stageId: undefined })}>
                                <option value="">Escolha o funil…</option>
                                {pipelines.filter((p) => p.id !== pipeline.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            )}
                            <select value={a.stageId || ""} onChange={(e) => updA(r, i, { stageId: e.target.value })}>
                              <option value="">{a.type === "copy" ? "1ª etapa" : "Escolha a etapa…"}</option>
                              {(a.type === "copy" ? pipelines.find((p) => p.id === a.pipelineId)?.stages || [] : stages).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </>
                        )}
                        {(a.type === "task" || a.type === "followup" || a.type === "snooze") && <label className="au-days">{a.type === "snooze" ? "volta em" : "em"} <input type="number" min="0" max="730" value={a.days ?? (a.type === "snooze" ? 30 : 1)} onChange={(e) => updA(r, i, { days: e.target.value })} /> dia(s)</label>}
                        {a.type === "owner" && (
                          <select value={a.ownerId || ""} onChange={(e) => updA(r, i, { ownerId: e.target.value })}>
                            <option value="">Escolha…</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                          </select>
                        )}
                        {a.type === "tag" && (
                          <select value={a.tagId || ""} onChange={(e) => updA(r, i, { tagId: e.target.value })}>
                            <option value="">Escolha a tag…</option>{tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        )}
                        {a.type === "field" && (
                          <>
                            <select value={a.fieldId || ""} onChange={(e) => updA(r, i, { fieldId: e.target.value })}>
                              <option value="">Campo…</option>{fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                            </select>
                            <input value={a.value || ""} onChange={(e) => updA(r, i, { value: e.target.value })} placeholder="valor" />
                          </>
                        )}
                        <button type="button" className="fi-icon" onClick={() => upd(r.id, { actions: r.actions.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
                      </div>
                      {a.type === "message" && (
                        <>
                          <textarea rows={3} value={a.text || ""} onChange={(e) => updA(r, i, { text: e.target.value })} placeholder="Olá, {nome}! …  (use {nome}, {nome_completo}, {empresa} e os campos do card, ex.: {vigencia})" />
                          {departments.length > 0 && (
                            <select value={a.departmentId || ""} onChange={(e) => updA(r, i, { departmentId: e.target.value || undefined })}>
                              <option value="">Setor da conversa: manter</option>{departments.map((d) => <option key={d.id} value={d.id}>Setor: {d.name}</option>)}
                            </select>
                          )}
                        </>
                      )}
                      {(a.type === "task" || a.type === "followup") && (
                        <div className="au-row">
                          <input value={a.title || ""} onChange={(e) => updA(r, i, { title: e.target.value })} placeholder={a.type === "task" ? "Falar com {nome_completo}" : "Follow-up {nome}"} />
                          {a.type === "task" && (
                            <select value={a.ownerId || ""} onChange={(e) => updA(r, i, { ownerId: e.target.value || undefined })}>
                              <option value="">Para o responsável do card</option>{team.map((m) => <option key={m.id} value={m.id}>Para {m.name || m.email}</option>)}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <button type="button" className="au-add" onClick={() => upd(r.id, { actions: [...r.actions, { type: "task", title: "", days: 1 }] })}><Plus size={13} /> Ação</button>
                </div>

                <div className="au-foot">
                  <button type="button" className="au-link" onClick={() => add({ ...r, name: `${r.name} (cópia)` })}><Copy size={13} /> Duplicar</button>
                  <button type="button" className="au-link danger" onClick={async () => { if (await askConfirm(`Excluir a automação "${r.name}"?`)) setRules((l) => l.filter((x) => x.id !== r.id)); }}><Trash2 size={13} /> Excluir</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!rules.length && <div className="au-empty">Nenhuma automação neste funil ainda. Comece por um modelo pronto ou crie a sua.</div>}
      </div>
      <div className="au-new">
        <Button onClick={() => add()}><Plus size={15} /> Nova automação</Button>
      </div>
      <div className="au-presets">
        <div className="fi-sec-title">Modelos prontos</div>
        <div className="au-preset-grid">
          {presets(pipeline).map((p) => (
            <button key={p.name} type="button" onClick={() => add(p)}>
              <strong>{p.name}</strong>
              <small>{p.actions.map((a) => ACTIONS.find((x) => x[0] === a.type)?.[1]).join(" · ")}</small>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
