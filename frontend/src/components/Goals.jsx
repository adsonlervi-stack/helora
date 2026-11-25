// Metas de vendas: configuração (Config > Metas) e cartões de progresso (Início).
// O resultado vem sozinho do CRM (negócios ganhos, valor e quantidade); lançamento manual só complementa.
import React, { useEffect, useState } from "react";
import { Target, Plus, Trash2, Pencil, Trophy } from "lucide-react";
import { crm, getTeam } from "../api.js";
import { askConfirm } from "../dialogs.js";

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const PERIODS = { month: "Mês atual", quarter: "Trimestre atual", year: "Ano atual", custom: "Personalizado" };
const pct = (a, b) => (b > 0 ? Math.min(999, Math.round((a / b) * 100)) : 0);
const errText = (e) => e?.response?.data?.error || e?.message || "Erro";

function Bar({ label, done, target, projected, fmt, timePct }) {
  if (!target) return null;
  const p = pct(done, target);
  const ok = projected >= target;
  return (
    <div className="goal-bar">
      <div className="goal-bar-top"><span>{label}</span><strong>{fmt(done)} <small>de {fmt(target)}</small></strong></div>
      <div className="goal-track"><i style={{ width: Math.min(100, p) + "%" }} /><b style={{ left: Math.min(100, timePct) + "%" }} title="Onde deveria estar hoje" /></div>
      <div className="goal-bar-foot">
        <span className={p >= 100 ? "goal-ok" : ""}>{p}%{p < 100 ? ` · faltam ${fmt(target - done)}` : " · meta batida!"}</span>
        {p < 100 && <span className={ok ? "goal-ok" : "goal-warn"}>No ritmo atual: {fmt(projected)}</span>}
      </div>
    </div>
  );
}

export function GoalCard({ g, filters }) {
  const [open, setOpen] = useState(false);
  const deals = g.deals || [];
  return (
    <div className="goal-card">
      {filters && <div className={`goal-filters ${filters.none ? "warn" : ""}`}>{filters.text}</div>}
      <div className="goal-head"><Target size={16} /><strong>{g.name}</strong><span className="goal-days">{g.daysLeft} dia(s) restantes</span></div>
      <Bar label="Valor vendido" done={g.value} target={g.targetValue} projected={g.projectedValue} fmt={brl} timePct={g.timePct} />
      <Bar label="Vendas" done={g.count} target={g.targetCount} projected={g.projectedCount} fmt={(n) => String(n)} timePct={g.timePct} />
      <button type="button" className="goal-deals-btn" onClick={() => setOpen((v) => !v)}>{open ? "Ocultar vendas" : `Ver vendas desta meta (${deals.length + (g.entries?.length || 0)})`}</button>
      {open && (
        <div className="goal-deals">
          {!deals.length && !g.entries?.length && <small>Nenhuma venda ganha neste período.</small>}
          {deals.map((d) => (
            <div key={d.id}><span><strong>{d.name}{d.company ? <small style={{ fontWeight: 400 }}> · {d.company}</small> : null}</strong><small>{new Date(d.wonAt).toLocaleDateString("pt-BR")}{d.owner ? ` · ${d.owner}` : ""}</small></span><b>{brl(d.value)}</b></div>
          ))}
          {(g.entries || []).map((e) => (
            <div key={e.id}><span><strong>Lançamento manual</strong>{e.note ? ` · ${e.note}` : ""}<small>{new Date(e.date + "T12:00:00").toLocaleDateString("pt-BR")} · {e.count} venda(s)</small></span><b>{brl(e.value)}</b></div>
          ))}
        </div>
      )}
      {g.ranking?.length > 1 && (
        <div className="goal-rank">
          {g.ranking.slice(0, 5).map((r, i) => (
            <div key={r.ownerId || i}>{i === 0 ? <Trophy size={13} /> : <span className="goal-pos">{i + 1}</span>}<span>{r.name}</span><small>{r.count} · {brl(r.value)}</small></div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Cartões no Início; some se não houver metas. */
export function GoalsWidget() {
  const [list, setList] = useState(null);
  useEffect(() => { crm.goalsProgress().then(setList).catch(() => setList([])); }, []);
  if (!list?.length) return null;
  return (
    <>
      <div className="home2-label">Metas</div>
      <div className="goal-grid">{list.map((g) => <GoalCard key={g.id} g={g} />)}</div>
    </>
  );
}

const empty = { name: "", period: "month", start: "", end: "", ownerId: "", pipelineId: "", tagId: "", productId: "", targetValue: "", targetCount: "" };

/** Config > Metas */
export function GoalsTab({ canManage = true }) {
  const [progress, setProgress] = useState([]);
  const [team, setTeam] = useState([]);
  const [pipes, setPipes] = useState([]);
  const [tags, setTags] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(null);
  const [entry, setEntry] = useState(null);
  const [err, setErr] = useState("");
  const load = () => crm.goalsProgress().then(setProgress).catch((e) => setErr(errText(e)));
  useEffect(() => {
    load();
    getTeam().then((t) => setTeam(Array.isArray(t) ? t : t?.members || [])).catch(() => {});
    crm.pipelines().then(setPipes).catch(() => {});
    crm.tags().then(setTags).catch(() => {});
    crm.products().then((p) => setProducts(Array.isArray(p) ? p : [])).catch(() => {});
  }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async () => {
    if (!form.name.trim()) return setErr("Dê um nome à meta.");
    if (!Number(form.targetValue) && !Number(form.targetCount)) return setErr("Informe a meta em valor, em quantidade ou nos dois.");
    const body = { ...form, ownerId: form.ownerId || null, pipelineId: form.pipelineId || null, tagId: form.tagId || null, productId: form.productId || null };
    try { form.id ? await crm.updateGoal(form.id, body) : await crm.createGoal(body); setForm(null); setErr(""); load(); } catch (e) { setErr(errText(e)); }
  };
  const remove = async (g) => { if (await askConfirm(`Excluir a meta "${g.name}"?`)) { await crm.deleteGoal(g.id); load(); } };
  const addEntry = async () => {
    try { await crm.addGoalEntry(entry.goal.id, { value: Number(String(entry.value).replace(",", ".")) || 0, count: Number(entry.count) || 0, note: entry.note, date: entry.date }); setEntry(null); load(); } catch (e) { setErr(errText(e)); }
  };
  const nameOf = (id) => team.find((m) => m.id === id)?.name;
  const filtersOf = (g) => {
    const parts = [g.productId && (products.find((p) => p.id === g.productId)?.name || "Produto"), g.pipelineId && `Funil ${pipes.find((p) => p.id === g.pipelineId)?.name || ""}`, g.tagId && `Etiqueta ${tags.find((t) => t.id === g.tagId)?.name || ""}`].filter(Boolean);
    return parts.length ? { text: "Conta só: " + parts.join(" · ") } : { none: true, text: "Sem filtro: conta todas as vendas ganhas" + (g.ownerId ? " do vendedor" : " da empresa") + ". Edite para escolher o produto." };
  };

  return (
    <div className="goals-tab">
      {canManage && <p className="goals-intro">O resultado é calculado sozinho a partir dos negócios <strong>ganhos</strong> no CRM (valor e quantidade, pela data em que foram ganhos). Use “Lançar resultado” só para vendas feitas fora do CRM.</p>}
      {err && <div className="admin-feedback error">{err}</div>}
      {!form && canManage && <button className="goals-btn" onClick={() => { setErr(""); setForm({ ...empty }); }}><Plus size={15} /> Nova meta</button>}

      {form && (
        <div className="card goals-form">
          <label>Nome<input value={form.name} onChange={set("name")} placeholder="Ex.: Vendas de novembro" /></label>
          <div className="goals-row">
            <label>Período<select value={form.period} onChange={set("period")}>{Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {form.period === "custom" && <><label>De<input type="date" value={form.start || ""} onChange={set("start")} /></label><label>Até<input type="date" value={form.end || ""} onChange={set("end")} /></label></>}
          </div>
          <div className="goals-row">
            <label>Meta em valor (R$)<input inputMode="decimal" value={form.targetValue} onChange={set("targetValue")} placeholder="100000" /></label>
            <label>Meta em quantidade<input inputMode="numeric" value={form.targetCount} onChange={set("targetCount")} placeholder="20" /></label>
          </div>
          <div className="goals-row">
            <label>Vendedor<select value={form.ownerId || ""} onChange={set("ownerId")}><option value="">Empresa toda</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}</select></label>
            <label>Funil<select value={form.pipelineId || ""} onChange={set("pipelineId")}><option value="">Todos</option>{pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Produto / ramo<select value={form.productId || ""} onChange={set("productId")}><option value="">Todos</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Etiqueta<select value={form.tagId || ""} onChange={set("tagId")}><option value="">Todas</option>{tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          </div>
          <div className="goals-actions"><button className="goals-btn" onClick={save}>Salvar</button><button className="goals-btn ghost" onClick={() => setForm(null)}>Cancelar</button></div>
        </div>
      )}

      {entry && (
        <div className="card goals-form">
          <strong>Lançar resultado em “{entry.goal.name}”</strong>
          <div className="goals-row">
            <label>Valor (R$)<input inputMode="decimal" value={entry.value} onChange={(e) => setEntry({ ...entry, value: e.target.value })} /></label>
            <label>Quantidade<input inputMode="numeric" value={entry.count} onChange={(e) => setEntry({ ...entry, count: e.target.value })} /></label>
            <label>Data<input type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} /></label>
          </div>
          <label>Observação<input value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} placeholder="Ex.: venda no balcão" /></label>
          <div className="goals-actions"><button className="goals-btn" onClick={addEntry}>Lançar</button><button className="goals-btn ghost" onClick={() => setEntry(null)}>Cancelar</button></div>
        </div>
      )}

      {progress.length === 0 && !form && <div className="goals-empty">Nenhuma meta ainda.</div>}
      <div className="goal-grid">
        {progress.map((g) => (
          <div key={g.id}>
            <GoalCard g={g} filters={filtersOf(g)} />
            <div className="goal-meta">
              {PERIODS[g.period]}{g.ownerId ? ` · ${nameOf(g.ownerId) || "Vendedor"}` : " · Empresa toda"}
              <span className="home2-sp" />
              {canManage && <>
              <button title="Lançar resultado" onClick={() => setEntry({ goal: g, value: "", count: "1", note: "", date: new Date().toISOString().slice(0, 10) })}><Plus size={14} /></button>
              <button title="Editar" onClick={() => { const { id, name, period, ownerId, pipelineId, tagId, productId, targetValue, targetCount } = g; window.scrollTo({ top: 0, behavior: "smooth" }); setForm({ ...empty, id, name, period, ownerId: ownerId || "", pipelineId: pipelineId || "", tagId: tagId || "", productId: productId || "", targetValue, targetCount, start: g.period === "custom" ? g.start.slice(0, 10) : "", end: g.period === "custom" ? g.end.slice(0, 10) : "" }); }}><Pencil size={14} /></button>
              <button title="Excluir" onClick={() => remove(g)}><Trash2 size={14} /></button>
              </>}
            </div>
            {g.entries?.length > 0 && <div className="goal-entries">{g.entries.map((e) => <div key={e.id}>{new Date(e.date + "T12:00:00").toLocaleDateString("pt-BR")} · {brl(e.value)} · {e.count} {e.note && `· ${e.note}`}<button onClick={async () => { await crm.deleteGoalEntry(g.id, e.id); load(); }}><Trash2 size={12} /></button></div>)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
