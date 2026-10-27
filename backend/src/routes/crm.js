import { Router } from "express";
import { supabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { enforceTabs } from "../governance.js";
import { createGoogleEvent, deleteGoogleEvent } from "../google.js";
import { emitEvent } from "../webhooks.js";
import multer from "multer";
import { randomUUID } from "crypto";
import { uploadCrmFile, removeCrmFile } from "../storage.js";
import { TEMPLATES, cleanFields, cleanCustom } from "../crmTemplates.js";
import { RAMOS } from "../insuranceLists.js";
import { createZip } from "../zip.js";
import { getPrimaryWhatsAppChannel, findOrCreateConversation, updateConversation, createTask } from "../config/db.js";
import { sendTextToConversation } from "../messaging.js";
import { resolveWhatsAppNumber } from "../whatsapp/baileysClient.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/**
 * CRM (prospecção e qualificação), separado do Pipeline de atendimento.
 * Funis com colunas próprias, leads, tags, produtos/serviços e agenda.
 */
const router = Router();
router.use(requireAuth);
router.use(enforceTabs);

const isManager = (req) => req.role === "owner" || req.isSuperAdmin;
const fail = (res, err) => {
  const msg = err?.message || String(err);
  res.status(500).json({ error: /history|outcome|lost_reason|expected_close/.test(msg) ? "Rode a migration 035 no Supabase." : /crm_/.test(msg) && /does not exist|schema cache/.test(msg) ? (/custom|fields|template/.test(msg) ? "Rode a migration 031 no Supabase." : /attachments|checklist/.test(msg) ? "Rode a migration 030 no Supabase." : "Rode a migration 022 (CRM) no Supabase.") : msg });
};
const DEFAULT_STAGES = [
  { id: "novos", name: "Leads novos", color: "#0a84ff" },
  { id: "qualificacao", name: "Qualificação", color: "#bf5af2" },
  { id: "reuniao", name: "Reunião agendada", color: "#ff9f0a" },
  { id: "proposta", name: "Proposta", color: "#ffcc00" },
  { id: "ganho", name: "Ganho", color: "#30d158" },
  { id: "perdido", name: "Perdido", color: "#ff453a" }
];
const onlyDigits = (v) => String(v || "").replace(/\D/g, "");
// "1.500,00", "1500.5", 1500 → número
const money = (v) => { if (typeof v === "number") return v; const t = String(v ?? "").replace(/[^\d,.-]/g, ""); return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || 0; };

// ---------------------------------------------------------------- Automações por coluna
// Rodam quando um lead ENTRA na coluna: mensagem no WhatsApp, tarefa, follow-up na agenda, trocar responsável.
const AUTO_TYPES = ["message", "task", "followup", "owner"];
function cleanAutomations(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((a) => AUTO_TYPES.includes(a?.type)).slice(0, 10).map((a) => ({
    id: String(a.id || randomUUID()).slice(0, 40), type: a.type, active: a.active !== false,
    text: a.text ? String(a.text).slice(0, 2000) : undefined, title: a.title ? String(a.title).slice(0, 160) : undefined,
    days: a.days != null ? Math.min(365, Math.max(0, parseInt(a.days, 10) || 0)) : undefined,
    departmentId: a.departmentId || undefined, ownerId: a.ownerId || undefined
  }));
}
const fmtVal = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v).split("-").reverse().join("/") : String(v ?? ""));
const fill = (t, lead) => String(t || "")
  .replace(/\{nome\}/g, String(lead.name || "").split(" ")[0]).replace(/\{nome_completo\}/g, lead.name || "").replace(/\{empresa\}/g, lead.company || "")
  .replace(/\{([a-z0-9_]+)\}/g, (m, k) => (lead.custom && lead.custom[k] != null ? fmtVal(lead.custom[k]) : m));

/** Abre (ou reaproveita) a conversa de WhatsApp do lead e devolve a conversa. */
export async function leadConversation(accountId, lead, { departmentId, agentId } = {}) {
  const phone = onlyDigits(lead.phone);
  if (phone.length < 10) throw new Error("O lead não tem WhatsApp válido.");
  const channelId = await getPrimaryWhatsAppChannel(accountId);
  if (!channelId) throw new Error("Nenhum WhatsApp conectado nesta empresa.");
  const jid = await resolveWhatsAppNumber(channelId, phone);
  let conv = await findOrCreateConversation({ accountId, platform: "whatsapp", externalId: jid, phone: jid.split("@")[0], name: lead.name || phone, channelId });
  conv = await updateConversation(accountId, conv.id, { status: "open", mode: "human", isNew: false, ...(agentId ? { assignedAgentId: agentId } : {}), ...(departmentId ? { departmentId } : {}) });
  if (lead.conversation_id !== conv.id) await supabase.from("crm_leads").update({ conversation_id: conv.id }).eq("id", lead.id);
  return conv;
}

export async function runStageAutomations(accountId, lead, byName, opts = {}) {
  // Automações de processo do funil (quando → se → então)
  if ((opts.depth || 0) <= 3) runPipelineAutomations(accountId, lead, { type: opts.created ? "created" : "moved", stageId: lead.stage }, byName, opts.depth || 0).catch((e) => console.warn("[CRM] regras:", e.message));
  try {
    const { data: pipe } = await supabase.from("crm_pipelines").select("stages").eq("id", lead.pipeline_id).maybeSingle();
    const stage = (pipe?.stages || []).find((s) => s.id === lead.stage);
    for (const a of (stage?.automations || []).filter((x) => x.active !== false)) {
      try {
        if (a.type === "owner" && a.ownerId) {
          await supabase.from("crm_leads").update({ owner_id: a.ownerId }).eq("id", lead.id);
          lead.owner_id = a.ownerId;
        } else if (a.type === "message" && a.text) {
          const conv = await leadConversation(accountId, lead, { departmentId: a.departmentId, agentId: lead.owner_id });
          await sendTextToConversation(accountId, conv, fill(a.text, lead), { senderName: byName || null, sign: false });
        } else if (a.type === "task") {
          await createTask(accountId, {
            title: fill(a.title || `Falar com {nome_completo}`, lead), description: `Lead do CRM: ${lead.name}${lead.phone ? ` · ${lead.phone}` : ""}`,
            assigneeId: lead.owner_id || null, dueAt: new Date(Date.now() + (a.days ?? 1) * 86400000).toISOString(), kind: "manual",
            conversationId: lead.conversation_id || null
          });
        } else if (a.type === "followup") {
          const at = new Date(Date.now() + (a.days ?? 2) * 86400000);
          at.setHours(10, 0, 0, 0);
          await supabase.from("crm_events").insert({ account_id: accountId, lead_id: lead.id, title: fill(a.title || "Follow-up {nome}", lead), kind: "followup", starts_at: at.toISOString(), owner_id: lead.owner_id || null });
        }
      } catch (e) {
        console.warn("[CRM] automação falhou:", a.type, e.message);
      }
    }
  } catch (e) {
    console.warn("[CRM] automações:", e.message);
  }
}


// ---------------------------------------------------------------- Automações de processo (estilo Pipefy)
// Regra: { id, name, active, trigger:{ type, stageId?, fieldId?, value?, days? }, conditions:[{ fieldId, op, value }], actions:[...] }
const RULE_TRIGGERS = ["created", "moved", "won", "lost", "field", "idle", "date"];
const RULE_ACTIONS = ["move", "message", "task", "followup", "owner", "tag", "field", "archive", "snooze", "copy"];
export function cleanRules(list) {
  if (!Array.isArray(list)) return [];
  const str = (v, n = 200) => (v == null || v === "" ? undefined : String(v).slice(0, n));
  const num = (v, min = 0, max = 365) => (v == null || v === "" ? undefined : Math.min(max, Math.max(min, parseInt(v, 10) || 0)));
  return list.slice(0, 40).filter((r) => RULE_TRIGGERS.includes(r?.trigger?.type)).map((r) => ({
    id: String(r.id || randomUUID()).slice(0, 40), name: str(r.name, 80) || "Automação", active: r.active !== false,
    trigger: { type: r.trigger.type, stageId: str(r.trigger.stageId, 40), fieldId: str(r.trigger.fieldId, 40), value: str(r.trigger.value, 200), days: num(r.trigger.days, -365, 365) },
    conditions: (Array.isArray(r.conditions) ? r.conditions : []).slice(0, 6).filter((c) => c?.fieldId).map((c) => ({ fieldId: str(c.fieldId, 40), op: ["eq", "neq", "filled", "empty"].includes(c.op) ? c.op : "eq", value: str(c.value, 200) })),
    actions: (Array.isArray(r.actions) ? r.actions : []).slice(0, 8).filter((a) => RULE_ACTIONS.includes(a?.type)).map((a) => ({
      type: a.type, stageId: str(a.stageId, 40), text: str(a.text, 2000), title: str(a.title, 160), days: num(a.days, 0, 730),
      ownerId: str(a.ownerId, 40), tagId: str(a.tagId, 40), fieldId: str(a.fieldId, 40), value: str(a.value, 500),
      departmentId: str(a.departmentId, 40), pipelineId: str(a.pipelineId, 40)
    }))
  }));
}
const leadFieldValue = (lead, fieldId) => {
  if (fieldId === "__owner") return lead.owner_id || "";
  if (fieldId === "__outcome") return lead.outcome || "";
  return (lead.custom || {})[fieldId] ?? "";
};
function ruleConditionsOk(rule, lead) {
  return (rule.conditions || []).every((c) => {
    const v = String(leadFieldValue(lead, c.fieldId) ?? "").trim();
    if (c.op === "filled") return !!v;
    if (c.op === "empty") return !v;
    if (c.op === "neq") return v.toLowerCase() !== String(c.value || "").trim().toLowerCase();
    return v.toLowerCase() === String(c.value || "").trim().toLowerCase();
  });
}
async function runRuleActions(accountId, pipe, rule, lead, byName, depth) {
  for (const a of rule.actions || []) {
    try {
      if (a.type === "move" && a.stageId && a.stageId !== lead.stage && (pipe.stages || []).some((s) => s.id === a.stageId)) {
        const prev = lead.stage;
        const now = new Date().toISOString();
        const st = (pipe.stages || []).find((s) => s.id === a.stageId);
        const outcome = WON_RE.test(st?.name || "") ? "won" : LOST_RE.test(st?.name || "") ? "lost" : null;
        const patch = { stage: a.stageId, stage_changed_at: now, ...(outcome !== (lead.outcome || null) ? { outcome, outcome_at: outcome ? now : null } : {}) };
        await supabase.from("crm_leads").update(patch).eq("id", lead.id);
        Object.assign(lead, patch);
        await pushHistory(lead.id, [{ type: "stage", from: prev, to: a.stageId, fromPipeline: lead.pipeline_id, toPipeline: lead.pipeline_id, by: `Automação: ${rule.name}` }]);
        if (depth < 3) {
          await runStageAutomations(accountId, lead, byName, { depth: depth + 1 }).catch(() => {});
          if (outcome) await runPipelineAutomations(accountId, lead, { type: outcome }, byName, depth + 1);
        }
      } else if (a.type === "message" && a.text) {
        const conv = await leadConversation(accountId, lead, { departmentId: a.departmentId, agentId: lead.owner_id });
        await sendTextToConversation(accountId, conv, fill(a.text, lead), { senderName: null, sign: false });
        await pushHistory(lead.id, [{ type: "whats", text: fill(a.text, lead), by: `Automação: ${rule.name}` }]);
      } else if (a.type === "task") {
        await createTask(accountId, {
          title: fill(a.title || "Falar com {nome_completo}", lead), description: `Lead do CRM: ${lead.name}${lead.phone ? ` · ${lead.phone}` : ""}\nAutomação: ${rule.name}`,
          assigneeId: (a.ownerId && a.ownerId !== "owner" ? a.ownerId : lead.owner_id) || null, dueAt: new Date(Date.now() + (a.days ?? 1) * 86400000).toISOString(), kind: "manual",
          conversationId: lead.conversation_id || null
        });
      } else if (a.type === "followup") {
        const at = new Date(Date.now() + (a.days ?? 2) * 86400000); at.setHours(10, 0, 0, 0);
        await supabase.from("crm_events").insert({ account_id: accountId, lead_id: lead.id, title: fill(a.title || "Follow-up {nome}", lead), kind: "followup", starts_at: at.toISOString(), owner_id: lead.owner_id || null });
      } else if (a.type === "owner" && a.ownerId) {
        await supabase.from("crm_leads").update({ owner_id: a.ownerId }).eq("id", lead.id);
        lead.owner_id = a.ownerId;
        await pushHistory(lead.id, [{ type: "owner", to: a.ownerId, by: `Automação: ${rule.name}` }]);
      } else if (a.type === "tag" && a.tagId) {
        const tags = [...new Set([...(lead.tag_ids || []), a.tagId])];
        await supabase.from("crm_leads").update({ tag_ids: tags }).eq("id", lead.id);
        lead.tag_ids = tags;
      } else if (a.type === "field" && a.fieldId) {
        const custom = { ...(lead.custom || {}), [a.fieldId]: fill(a.value || "", lead) };
        await supabase.from("crm_leads").update({ custom }).eq("id", lead.id);
        lead.custom = custom;
      } else if (a.type === "archive") {
        await supabase.from("crm_leads").update({ archived_at: new Date().toISOString() }).eq("id", lead.id);
        await pushHistory(lead.id, [{ type: "archived", by: `Automação: ${rule.name}` }]);
      } else if (a.type === "snooze") {
        const until = new Date(Date.now() + (a.days ?? 30) * 86400000); until.setHours(8, 0, 0, 0);
        await supabase.from("crm_leads").update({ snooze_until: until.toISOString() }).eq("id", lead.id);
        await pushHistory(lead.id, [{ type: "snoozed", to: until.toISOString(), by: `Automação: ${rule.name}` }]);
      } else if (a.type === "copy" && a.pipelineId) {
        const { data: target } = await supabase.from("crm_pipelines").select("id, stages").eq("account_id", accountId).eq("id", a.pipelineId).maybeSingle();
        if (!target) continue;
        const stageId = (target.stages || []).some((s) => s.id === a.stageId) ? a.stageId : target.stages?.[0]?.id;
        const { data: created } = await supabase.from("crm_leads").insert({
          account_id: accountId, pipeline_id: target.id, stage: stageId, name: lead.name, phone: lead.phone, email: lead.email, company: lead.company,
          owner_id: lead.owner_id, tag_ids: lead.tag_ids || [], custom: lead.custom || {}, conversation_id: lead.conversation_id || null,
          source: `Automação: ${rule.name}`, stage_changed_at: new Date().toISOString()
        }).select("*").single();
        if (created && depth < 3) await runStageAutomations(accountId, created, byName, { created: true, depth: depth + 1 }).catch(() => {});
      }
    } catch (e) {
      console.warn(`[CRM] regra "${rule.name}" ação ${a.type} falhou:`, e.message);
    }
  }
}
/** Roda as regras do funil para um evento: created | moved | won | lost | field | idle | date */
export async function runPipelineAutomations(accountId, lead, evt, byName, depth = 0) {
  if (!lead?.pipeline_id) return;
  const { data: pipe, error } = await supabase.from("crm_pipelines").select("id, stages, automations").eq("id", lead.pipeline_id).maybeSingle();
  if (error || !pipe) return;
  for (const rule of (pipe.automations || []).filter((r) => r.active !== false)) {
    const t = rule.trigger || {};
    if (t.type !== evt.type) continue;
    if (evt.type === "moved" && t.stageId && t.stageId !== evt.stageId) continue;
    if (evt.type === "field") {
      if (!t.fieldId || !(evt.fields || []).includes(t.fieldId)) continue;
      if (t.value && String(leadFieldValue(lead, t.fieldId)).trim().toLowerCase() !== String(t.value).trim().toLowerCase()) continue;
    }
    if (evt.ruleId && evt.ruleId !== rule.id) continue;
    if (!ruleConditionsOk(rule, lead)) continue;
    await runRuleActions(accountId, pipe, rule, lead, byName, depth);
  }
}

// ---------------------------------------------------------------- Funis
router.get("/pipelines", async (req, res) => {
  try {
    let { data, error } = await supabase.from("crm_pipelines").select("*").eq("account_id", req.accountId).order("created_at");
    if (error) throw error;
    if (!data.length) {
      const ins = await supabase.from("crm_pipelines").insert({ account_id: req.accountId, name: "Vendas", stages: DEFAULT_STAGES }).select();
      if (ins.error) throw ins.error;
      data = ins.data;
    }
    res.json(data);
  } catch (err) { fail(res, err); }
});
router.post("/pipelines", async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: "Só o gestor cria funis." });
    const { data, error } = await supabase.from("crm_pipelines")
      .insert((() => {
        const t = TEMPLATES.find((x) => x.key === req.body?.template);
        return {
          account_id: req.accountId, name: String(req.body?.name || t?.name || "Novo funil").slice(0, 60),
          stages: req.body?.stages || t?.stages || DEFAULT_STAGES, fields: t ? t.fields : [], template: t?.key || null
        };
      })()).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { fail(res, err); }
});
router.patch("/pipelines/:id", async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: "Só o gestor edita funis." });
    const patch = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name).slice(0, 60);
    if (Array.isArray(req.body?.fields)) patch.fields = cleanFields(req.body.fields);
    if (Array.isArray(req.body?.automations)) patch.automations = cleanRules(req.body.automations);
    if (Array.isArray(req.body?.messages)) patch.messages = req.body.messages.slice(0, 30).map((m) => ({ id: String(m.id || randomUUID()).slice(0, 40), title: String(m.title || "").slice(0, 60), text: String(m.text || "").slice(0, 2000) })).filter((m) => m.title && m.text);
    if (Array.isArray(req.body?.stages)) patch.stages = req.body.stages.filter((s) => s?.id && s?.name).map((s) => ({ id: String(s.id).slice(0, 40), name: String(s.name).slice(0, 40), color: s.color || "#0a84ff", automations: cleanAutomations(s.automations) }));
    const { data, error } = await supabase.from("crm_pipelines").update(patch).eq("account_id", req.accountId).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { fail(res, err); }
});
router.delete("/pipelines/:id", async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: "Só o gestor exclui funis." });
    const { count } = await supabase.from("crm_leads").select("id", { count: "exact", head: true }).eq("pipeline_id", req.params.id).is("deleted_at", null);
    if (count) return res.status(400).json({ error: "Mova ou exclua os leads deste funil antes." });
    const { error } = await supabase.from("crm_pipelines").delete().eq("account_id", req.accountId).eq("id", req.params.id);
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
});

router.get("/templates", (req, res) => {
  res.json(TEMPLATES.map((t) => ({ key: t.key, name: t.name, group: t.group, description: t.description, stages: t.stages.map((s) => ({ name: s.name, color: s.color })), fields: t.fields.map((f) => f.label) })));
});

// ---------------------------------------------------------------- Leads
const LEAD_SELECT = "*, owner:profiles!crm_leads_owner_id_fkey(name, avatar_url), crm_lead_products(id, qty, price, product_id, crm_products(name))";
function mapLead(l) {
  return {
    id: l.id, pipelineId: l.pipeline_id, stage: l.stage, name: l.name, phone: l.phone, email: l.email, company: l.company,
    value: l.value != null ? Number(l.value) : null, ownerId: l.owner_id, ownerName: l.owner?.name || null, ownerAvatar: l.owner?.avatar_url || null,
    tagIds: l.tag_ids || [], source: l.source, notes: l.notes, stageChangedAt: l.stage_changed_at, lastInteractionAt: l.last_interaction_at,
    createdAt: l.created_at, conversationId: l.conversation_id,
    attachments: l.attachments || [], checklist: l.checklist || [], custom: l.custom || {},
    archivedAt: l.archived_at || null, snoozeUntil: l.snooze_until || null,
    history: l.history || [], outcome: l.outcome || null, outcomeAt: l.outcome_at || null, lostReason: l.lost_reason || null, expectedClose: l.expected_close || null,
    products: (l.crm_lead_products || []).map((p) => ({ id: p.id, productId: p.product_id, name: p.crm_products?.name || "Produto", qty: Number(p.qty), price: Number(p.price) }))
  };
}
function leadRow(b) {
  const row = {};
  for (const [k, col] of [["name", "name"], ["phone", "phone"], ["email", "email"], ["company", "company"], ["source", "source"], ["notes", "notes"], ["stage", "stage"], ["pipelineId", "pipeline_id"]]) {
    if (b[k] !== undefined) row[col] = b[k] === "" ? null : b[k];
  }
  if (row.phone) row.phone = onlyDigits(row.phone);
  if (b.value !== undefined) row.value = b.value === "" || b.value === null ? null : money(b.value);
  if (b.ownerId !== undefined) row.owner_id = b.ownerId || null;
  if (b.tagIds !== undefined) row.tag_ids = Array.isArray(b.tagIds) ? b.tagIds : [];
  if (b.conversationId !== undefined) row.conversation_id = b.conversationId || null;
  if (b.outcome !== undefined) { row.outcome = ["won", "lost"].includes(b.outcome) ? b.outcome : null; row.outcome_at = row.outcome ? new Date().toISOString() : null; }
  if (b.lostReason !== undefined) row.lost_reason = b.lostReason ? String(b.lostReason).slice(0, 300) : null;
  if (b.expectedClose !== undefined) row.expected_close = b.expectedClose || null;
  if (b.archived !== undefined) row.archived_at = b.archived ? new Date().toISOString() : null;
  if (b.snoozeUntil !== undefined) row.snooze_until = b.snoozeUntil || null;
  if (b.custom !== undefined) row.custom = cleanCustom(b.custom);
  if (Array.isArray(b.checklist)) row.checklist = b.checklist.slice(0, 50).map((c) => ({ id: String(c.id || randomUUID()).slice(0, 40), text: String(c.text || "").slice(0, 200), done: !!c.done })).filter((c) => c.text);
  return row;
}

const WON_RE = /fechad|ganh|vendid|conclu|indeniz/i;
const LOST_RE = /perdid|cancel|desist|negad|n[aã]o fechou/i;
let archiveColsOk = null;
async function hasArchiveCols() {
  if (archiveColsOk !== null) return archiveColsOk;
  const { error } = await supabase.from("crm_leads").select("archived_at, deleted_at, snooze_until").limit(1);
  archiveColsOk = !error;
  if (error) setTimeout(() => { archiveColsOk = null; }, 60000);
  return archiveColsOk;
}
/** Cards reagendados cuja data chegou voltam para a 1ª coluna do funil, como cliente novo. */
async function wakeSnoozed(accountId) {
  if (!(await hasArchiveCols())) return;
  const now = new Date().toISOString();
  const { data } = await supabase.from("crm_leads").select("id, pipeline_id, stage").eq("account_id", accountId).is("deleted_at", null).lte("snooze_until", now).limit(200);
  if (!data?.length) return;
  const pids = [...new Set(data.map((l) => l.pipeline_id).filter(Boolean))];
  const { data: pipes } = pids.length ? await supabase.from("crm_pipelines").select("id, stages").in("id", pids) : { data: [] };
  for (const l of data) {
    const first = (pipes || []).find((p) => p.id === l.pipeline_id)?.stages?.[0]?.id || l.stage;
    await supabase.from("crm_leads").update({ snooze_until: null, archived_at: null, outcome: null, outcome_at: null, stage: first, stage_changed_at: now, last_interaction_at: now }).eq("id", l.id);
    await pushHistory(l.id, [{ type: "snooze_wake", to: first, by: "Reagendamento" }]);
  }
}
/** Etapa de ganho/perda: mover para ela marca o resultado; sair dela reabre. */
async function outcomeForStage(pipelineId, stageId) {
  if (!pipelineId || !stageId) return undefined;
  const { data } = await supabase.from("crm_pipelines").select("stages").eq("id", pipelineId).maybeSingle();
  const st = (data?.stages || []).find((s) => s.id === stageId);
  if (!st) return undefined;
  if (WON_RE.test(st.name)) return "won";
  if (LOST_RE.test(st.name)) return "lost";
  return null;
}

router.get("/leads", async (req, res) => {
  try {
    await wakeSnoozed(req.accountId).catch(() => {});
    let q = supabase.from("crm_leads").select(LEAD_SELECT).eq("account_id", req.accountId).order("created_at", { ascending: false }).limit(3000);
    if (req.query.pipelineId) q = q.eq("pipeline_id", req.query.pipelineId);
    // Dados do CRM nunca são apagados: "excluídos" só somem da tela
    if (await hasArchiveCols()) {
      q = q.is("deleted_at", null);
      if (req.query.archived === "1") q = q.not("archived_at", "is", null);
      else if (req.query.snoozed === "1") q = q.is("archived_at", null).not("snooze_until", "is", null);
      else if (req.query.include !== "all") q = q.is("archived_at", null).is("snooze_until", null);
    }
    if (!isManager(req)) q = q.eq("owner_id", req.userId);
    if (req.query.search) {
      const s = String(req.query.search).replace(/[%,()]/g, "");
      q = q.or(`name.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${onlyDigits(s) || s}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data.map(mapLead));
  } catch (err) { fail(res, err); }
});
router.post("/leads", async (req, res) => {
  try {
    const b = req.body || {};
    if (!String(b.name || "").trim()) return res.status(400).json({ error: "Informe o nome do lead." });
    const row = { ...leadRow(b), account_id: req.accountId, owner_id: b.ownerId || req.userId, stage_changed_at: new Date().toISOString() };
    const { data, error } = await supabase.from("crm_leads").insert(row).select(LEAD_SELECT).single();
    if (error) throw error;
    emitEvent(req.accountId, "lead.criado", mapLead(data));
    runStageAutomations(req.accountId, data, req.userName, { created: true });
    res.status(201).json(mapLead(data));
  } catch (err) { fail(res, err); }
});
// Histórico do card (mudanças, anotações). Falha silenciosa se a migration 035 não rodou.
async function pushHistory(leadId, entries) {
  if (!entries.length) return;
  try {
    const { data } = await supabase.from("crm_leads").select("history").eq("id", leadId).maybeSingle();
    if (!data) return;
    const at = new Date().toISOString();
    const list = [...(data.history || []), ...entries.map((e) => ({ id: randomUUID(), at, ...e }))].slice(-300);
    await supabase.from("crm_leads").update({ history: list }).eq("id", leadId);
  } catch {}
}
router.patch("/leads/:id", async (req, res) => {
  try {
    const row = leadRow(req.body || {});
    const { data: before } = await supabase.from("crm_leads").select("stage, pipeline_id, owner_id, value, custom, outcome").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (row.stage) {
      if (before && before.stage === row.stage && (!row.pipeline_id || row.pipeline_id === before.pipeline_id)) delete row.stage;
      else row.stage_changed_at = new Date().toISOString();
    }
    if (row.stage && req.body?.outcome === undefined) {
      const o = await outcomeForStage(row.pipeline_id || before?.pipeline_id, row.stage).catch(() => undefined);
      if (o !== undefined) {
        const { data: cur } = await supabase.from("crm_leads").select("outcome").eq("id", req.params.id).maybeSingle();
        if ((cur?.outcome || null) !== o) { row.outcome = o; row.outcome_at = o ? new Date().toISOString() : null; }
      }
    }
    const hist = [];
    const by = req.userName || null;
    if (row.archived_at !== undefined) hist.push({ type: row.archived_at ? "archived" : "unarchived", by });
    if (row.snooze_until) hist.push({ type: "snoozed", to: row.snooze_until, by });
    if (before && row.stage) hist.push({ type: "stage", from: before.stage, to: row.stage, fromPipeline: before.pipeline_id, toPipeline: row.pipeline_id || before.pipeline_id, by });
    if (before && row.owner_id !== undefined && row.owner_id !== before.owner_id) hist.push({ type: "owner", to: row.owner_id, by });
    if (before && row.value !== undefined && Number(row.value || 0) !== Number(before.value || 0)) hist.push({ type: "value", from: before.value, to: row.value, by });
    if (row.outcome !== undefined) hist.push({ type: "outcome", to: row.outcome, reason: row.lost_reason || null, by });
    row.last_interaction_at = new Date().toISOString();
    let q = supabase.from("crm_leads").update(row).eq("account_id", req.accountId).eq("id", req.params.id);
    if (!isManager(req)) q = q.eq("owner_id", req.userId);
    const { data, error } = await q.select(LEAD_SELECT).single();
    if (error) throw error;
    emitEvent(req.accountId, "lead.atualizado", mapLead(data));
    if (row.stage) runStageAutomations(req.accountId, data, req.userName);
    if (before && row.outcome !== undefined && row.outcome && row.outcome !== before.outcome) runPipelineAutomations(req.accountId, data, { type: row.outcome }, req.userName).catch(() => {});
    if (before && row.custom !== undefined) {
      const changedF = [...new Set([...Object.keys(before.custom || {}), ...Object.keys(row.custom || {})])].filter((k) => String((before.custom || {})[k] ?? "") !== String((row.custom || {})[k] ?? ""));
      if (changedF.length) runPipelineAutomations(req.accountId, data, { type: "field", fields: changedF }, req.userName).catch(() => {});
    }
    if (hist.length) { await pushHistory(data.id, hist); data.history = [...(data.history || []), ...hist.map((h) => ({ ...h, at: new Date().toISOString() }))]; }
    res.json(mapLead(data));
  } catch (err) { fail(res, err); }
});
router.delete("/leads/:id", async (req, res) => {
  try {
    // Nunca apaga de verdade: os dados do CRM ficam guardados enquanto a empresa for cliente
    const soft = await hasArchiveCols();
    let q = soft
      ? supabase.from("crm_leads").update({ deleted_at: new Date().toISOString() }).eq("account_id", req.accountId).eq("id", req.params.id)
      : supabase.from("crm_leads").delete().eq("account_id", req.accountId).eq("id", req.params.id);
    if (!isManager(req)) q = q.eq("owner_id", req.userId);
    const { error } = await q;
    if (soft) await pushHistory(req.params.id, [{ type: "deleted", by: req.userName || null }]);
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
});

// Consulta CNPJ (dados públicos da Receita via BrasilAPI) para preencher o card
router.get("/cnpj/:cnpj", async (req, res) => {
  try {
    const n = onlyDigits(req.params.cnpj);
    if (n.length !== 14) return res.status(400).json({ error: "CNPJ precisa ter 14 números." });
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${n}`, { headers: { "User-Agent": "Helora/1.0" } });
    if (r.status === 404) return res.status(404).json({ error: "CNPJ não encontrado na Receita." });
    if (!r.ok) return res.status(502).json({ error: "Consulta de CNPJ indisponível agora. Tente de novo em instantes." });
    const d = await r.json();
    const addr = [d.descricao_tipo_de_logradouro, d.logradouro, d.numero, d.complemento, d.bairro, d.municipio && `${d.municipio}/${d.uf}`, d.cep].filter(Boolean).join(", ");
    res.json({
      cnpj: n, razaoSocial: d.razao_social || null, nomeFantasia: d.nome_fantasia || null, situacao: d.descricao_situacao_cadastral || null,
      abertura: d.data_inicio_atividade || null, atividade: d.cnae_fiscal_descricao || null, endereco: addr || null,
      telefone: onlyDigits(d.ddd_telefone_1 || "") || null, email: d.email ? String(d.email).toLowerCase() : null, municipio: d.municipio || null, uf: d.uf || null
    });
  } catch (err) { res.status(502).json({ error: "Consulta de CNPJ indisponível agora." }); }
});

// Abre a conversa do lead no WhatsApp (sem mandar mensagem)
router.post("/leads/:id/conversation", async (req, res) => {
  try {
    const { data: lead } = await supabase.from("crm_leads").select("*").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
    // Já tem conversa vinculada e ela ainda existe: só abre, sem reatribuir
    if (lead.conversation_id && !req.body?.departmentId) {
      const { data: ex } = await supabase.from("conversations").select("id").eq("account_id", req.accountId).eq("id", lead.conversation_id).maybeSingle();
      if (ex) return res.json({ conversationId: ex.id });
    }
    const conv = await leadConversation(req.accountId, lead, { departmentId: req.body?.departmentId, agentId: req.userId });
    res.json({ conversationId: conv.id });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ---- Card do CRM ligado a uma conversa (painel do cliente) ----
async function leadForConversation(accountId, convId) {
  const { data: conv } = await supabase.from("conversations").select("id, name, phone, external_id").eq("account_id", accountId).eq("id", convId).maybeSingle();
  if (!conv) return { conv: null, lead: null };
  let { data: lead } = await supabase.from("crm_leads").select(LEAD_SELECT).eq("account_id", accountId).eq("conversation_id", convId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const phone = onlyDigits(conv.phone || String(conv.external_id || "").split("@")[0]);
  if (!lead && phone.length >= 10) {
    const tail = phone.slice(-8);
    ({ data: lead } = await supabase.from("crm_leads").select(LEAD_SELECT).eq("account_id", accountId).ilike("phone", `%${tail}`).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle());
  }
  return { conv, lead, phone };
}
router.get("/by-conversation/:convId", async (req, res) => {
  try {
    const { lead } = await leadForConversation(req.accountId, req.params.convId);
    res.json({ lead: lead ? mapLead(lead) : null });
  } catch (err) { fail(res, err); }
});
router.post("/by-conversation/:convId", async (req, res) => {
  try {
    const { pipelineId, stage } = req.body || {};
    if (!pipelineId || !stage) return res.status(400).json({ error: "Escolha o funil e a etapa." });
    const { conv, lead, phone } = await leadForConversation(req.accountId, req.params.convId);
    if (!conv) return res.status(404).json({ error: "Conversa não encontrada." });
    let data;
    if (lead) {
      const changedStage = lead.stage !== stage || lead.pipeline_id !== pipelineId;
      ({ data } = await supabase.from("crm_leads").update({ pipeline_id: pipelineId, stage, conversation_id: conv.id, ...(changedStage ? { stage_changed_at: new Date().toISOString() } : {}) }).eq("id", lead.id).select(LEAD_SELECT).single());
      if (changedStage) { await pushHistory(lead.id, [{ type: "stage", from: lead.stage, to: stage, fromPipeline: lead.pipeline_id, toPipeline: pipelineId, by: req.userName || null }]); runStageAutomations(req.accountId, data, req.userName); }
    } else {
      const { data: created, error } = await supabase.from("crm_leads").insert({
        account_id: req.accountId, pipeline_id: pipelineId, stage, name: conv.name || phone || "Contato", phone: phone || null,
        conversation_id: conv.id, owner_id: req.userId, source: "WhatsApp", stage_changed_at: new Date().toISOString()
      }).select(LEAD_SELECT).single();
      if (error) throw error;
      data = created;
      emitEvent(req.accountId, "lead.criado", mapLead(data));
      runStageAutomations(req.accountId, data, req.userName);
    }
    res.json({ lead: mapLead(data) });
  } catch (err) { fail(res, err); }
});

// Enviar mensagem (pronta ou livre) para o cliente do card pelo WhatsApp
router.post("/leads/:id/message", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim().slice(0, 4000);
    if (!text) return res.status(400).json({ error: "Escreva a mensagem." });
    const { data: lead } = await supabase.from("crm_leads").select("*").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
    const conv = await leadConversation(req.accountId, lead, { agentId: req.userId });
    await sendTextToConversation(req.accountId, conv, text, { senderName: req.userName || null });
    await pushHistory(lead.id, [{ type: "whats", text, by: req.userName || null }]);
    await supabase.from("crm_leads").update({ last_interaction_at: new Date().toISOString() }).eq("id", lead.id);
    const { data } = await supabase.from("crm_leads").select(LEAD_SELECT).eq("id", lead.id).single();
    res.json({ conversationId: conv.id, lead: mapLead(data) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Anotações do card (ficam no histórico)
router.post("/leads/:id/notes", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim().slice(0, 4000);
    if (!text) return res.status(400).json({ error: "Escreva a anotação." });
    const { data: lead } = await supabase.from("crm_leads").select("id").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
    await pushHistory(lead.id, [{ type: "note", text, by: req.userName || null, byId: req.userId }]);
    const { data, error } = await supabase.from("crm_leads").update({ last_interaction_at: new Date().toISOString() }).eq("id", lead.id).select(LEAD_SELECT).single();
    if (error) throw error;
    if (!data.history) return res.status(500).json({ error: "Rode a migration 035 no Supabase." });
    res.status(201).json(mapLead(data));
  } catch (err) { fail(res, err); }
});
router.delete("/leads/:id/notes/:noteId", async (req, res) => {
  try {
    const { data: lead } = await supabase.from("crm_leads").select("id, history").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
    const { data, error } = await supabase.from("crm_leads").update({ history: (lead.history || []).filter((h) => h.id !== req.params.noteId) }).eq("id", lead.id).select(LEAD_SELECT).single();
    if (error) throw error;
    res.json(mapLead(data));
  } catch (err) { fail(res, err); }
});
router.get("/leads/:id", async (req, res) => {
  try {
    const { data, error } = await supabase.from("crm_leads").select(LEAD_SELECT).eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Lead não encontrado." });
    res.json(mapLead(data));
  } catch (err) { fail(res, err); }
});

// Anexos do card
router.post("/leads/:id/files", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Envie um arquivo." });
    const { data: lead } = await supabase.from("crm_leads").select("id, attachments").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
    if ((lead.attachments || []).length >= 30) return res.status(400).json({ error: "Máximo de 30 anexos por card." });
    const name = Buffer.from(req.file.originalname || "arquivo", "latin1").toString("utf8").slice(0, 120);
    const ext = (name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    const url = await uploadCrmFile({ accountId: req.accountId, buffer: req.file.buffer, extension: ext, contentType: req.file.mimetype || "application/octet-stream" });
    const file = { id: randomUUID(), name, url, size: req.file.size, type: req.file.mimetype || null, at: new Date().toISOString(), by: req.userName || null };
    const { data, error } = await supabase.from("crm_leads").update({ attachments: [...(lead.attachments || []), file], last_interaction_at: file.at }).eq("id", lead.id).select(LEAD_SELECT).single();
    if (error) throw error;
    await pushHistory(lead.id, [{ type: "file", text: name, url, by: req.userName || null }]);
    if (data.history) data.history = [...data.history, { type: "file", text: name, url, by: req.userName || null, at: file.at }];
    res.status(201).json(mapLead(data));
  } catch (err) { fail(res, err); }
});
router.delete("/leads/:id/files/:fileId", async (req, res) => {
  try {
    const { data: lead } = await supabase.from("crm_leads").select("id, attachments").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
    const f = (lead.attachments || []).find((x) => x.id === req.params.fileId);
    if (f) await removeCrmFile(f.url);
    const { data, error } = await supabase.from("crm_leads").update({ attachments: (lead.attachments || []).filter((x) => x.id !== req.params.fileId) }).eq("id", lead.id).select(LEAD_SELECT).single();
    if (error) throw error;
    res.json(mapLead(data));
  } catch (err) { fail(res, err); }
});

// Datas vindas do Excel ("21/10/2026" ou "2026-10-21") viram AAAA-MM-DD
function normDate(v) {
  const s = String(v ?? "").trim();
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return s;
}

// Importação em massa (planilha Excel já convertida em linhas no navegador)
router.post("/leads/import", async (req, res) => {
  try {
    const { pipelineId, stage, rows, ownerId, kind } = req.body || {};
    if (!pipelineId || !Array.isArray(rows) || !rows.length) return res.status(400).json({ error: "Nada para importar." });
    if (rows.length > 5000) return res.status(400).json({ error: "Máximo de 5.000 linhas por importação." });
    const { data: tags } = await supabase.from("crm_tags").select("id, name").eq("account_id", req.accountId);
    const tagMap = new Map((tags || []).map((t) => [t.name.toLowerCase(), t.id]));
    const { data: team } = await supabase.from("profiles").select("id, name").eq("account_id", req.accountId);
    const norm = (v) => String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const findOwner = (v) => {
      const n = norm(v);
      if (!n) return null;
      const t = (team || []).find((u) => norm(u.email) === n || norm(u.name) === n) || (team || []).find((u) => norm(u.name).startsWith(n) || n.startsWith(norm(u.name).split(" ")[0] + " "));
      return t?.id || null;
    };
    const defaultOwner = ownerId && (team || []).some((u) => u.id === ownerId) ? ownerId : req.userId;
    const { data: pipeRow } = await supabase.from("crm_pipelines").select("fields").eq("account_id", req.accountId).eq("id", pipelineId).maybeSingle();
    const kindField = (pipeRow?.fields || []).find((f) => f.kind);
    if (kind) rows.forEach((r) => {
      if (kindField) { if (!r[`custom.${kindField.id}`]) r[`custom.${kindField.id}`] = kind; }
      else r.tags = [r.tags, kind].filter(Boolean).join(",");
    });
    const newTags = new Set();
    for (const r of rows) String(r.tags || "").split(/[,;|]/).map((t) => t.trim()).filter(Boolean).forEach((t) => !tagMap.has(t.toLowerCase()) && newTags.add(t));
    if (newTags.size) {
      const { data: created } = await supabase.from("crm_tags").insert([...newTags].map((name) => ({ account_id: req.accountId, name, color: "#0a84ff" }))).select("id, name");
      (created || []).forEach((t) => tagMap.set(t.name.toLowerCase(), t.id));
    }
    const now = new Date().toISOString();
    const inserts = rows
      .filter((r) => String(r.name || r.phone || "").trim())
      .map((r) => ({
        account_id: req.accountId, pipeline_id: pipelineId, stage: stage || "novos", owner_id: findOwner(r.owner) || defaultOwner,
        name: String(r.name || r.phone).trim().slice(0, 120), phone: onlyDigits(r.phone) || null, email: r.email || null,
        company: r.company || null, source: r.source || kind || "Importação",
        notes: [r.due ? `Vencimento: ${r.due}` : null, r.notes || null].filter(Boolean).join("\n") || null,
        value: r.value ? Number(String(r.value).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")) || null : null,
        custom: cleanCustom(Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith("custom.")).map(([k, v]) => [k.slice(7), normDate(v)]))),
        tag_ids: String(r.tags || "").split(/[,;|]/).map((t) => tagMap.get(t.trim().toLowerCase())).filter(Boolean),
        stage_changed_at: now
      }));
    let done = 0;
    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await supabase.from("crm_leads").insert(inserts.slice(i, i + 500));
      if (error) throw error;
      done += Math.min(500, inserts.length - i);
    }
    res.json({ imported: done });
  } catch (err) { fail(res, err); }
});

// Produtos vinculados ao negócio (o valor do lead vira a soma)
router.put("/leads/:id/products", async (req, res) => {
  try {
    const items = (req.body?.items || []).filter((i) => i.productId);
    await supabase.from("crm_lead_products").delete().eq("lead_id", req.params.id).eq("account_id", req.accountId);
    if (items.length) {
      const { error } = await supabase.from("crm_lead_products").insert(items.map((i) => ({
        account_id: req.accountId, lead_id: req.params.id, product_id: i.productId, qty: Number(i.qty) || 1, price: money(i.price)
      })));
      if (error) throw error;
    }
    const total = items.reduce((s, i) => s + (Number(i.qty) || 1) * money(i.price), 0);
    const { data, error } = await supabase.from("crm_leads").update({ value: items.length ? total : null }).eq("account_id", req.accountId).eq("id", req.params.id).select(LEAD_SELECT).single();
    if (error) throw error;
    res.json(mapLead(data));
  } catch (err) { fail(res, err); }
});

// ---------------------------------------------------------------- Tags
router.get("/tags", async (req, res) => {
  try {
    const { data, error } = await supabase.from("crm_tags").select("*").eq("account_id", req.accountId).order("name");
    if (error) throw error;
    res.json(data);
  } catch (err) { fail(res, err); }
});
router.post("/tags", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Dê um nome para a tag." });
    const { data, error } = await supabase.from("crm_tags").insert({ account_id: req.accountId, name: name.slice(0, 40), color: req.body?.color || "#0a84ff" }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { fail(res, err); }
});
router.patch("/tags/:id", async (req, res) => {
  try {
    const patch = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name).trim().slice(0, 40);
    if (req.body?.color !== undefined) patch.color = req.body.color;
    const { data, error } = await supabase.from("crm_tags").update(patch).eq("account_id", req.accountId).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { fail(res, err); }
});
router.delete("/tags/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("crm_tags").delete().eq("account_id", req.accountId).eq("id", req.params.id);
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
});


// ---------------------------------------------------------------- Exportar CRM (ZIP com pastas e anexos)
// ?pipelineId=&levels=mes,seguradora,produto&from=yyyy-mm-dd&to=yyyy-mm-dd&files=1&archived=1
router.get("/export", async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: "Só o gestor pode baixar o CRM." });
    const levels = String(req.query.levels || "mes,seguradora,produto").split(",").filter((x) => ["mes", "seguradora", "produto", "etapa", "responsavel"].includes(x)).slice(0, 4);
    const withFiles = req.query.files !== "0";
    let q = supabase.from("crm_leads").select(LEAD_SELECT).eq("account_id", req.accountId).order("created_at", { ascending: true }).limit(10000);
    if (req.query.pipelineId) q = q.eq("pipeline_id", req.query.pipelineId);
    if (req.query.from) q = q.gte("created_at", `${req.query.from}T00:00:00`);
    if (req.query.to) q = q.lte("created_at", `${req.query.to}T23:59:59`);
    if (await hasArchiveCols()) { q = q.is("deleted_at", null); if (req.query.archived === "0") q = q.is("archived_at", null); }
    const { data: leads, error } = await q;
    if (error) throw error;
    const { data: pipes } = await supabase.from("crm_pipelines").select("id, name, stages, fields").eq("account_id", req.accountId);
    const { data: acc } = await supabase.from("accounts").select("name").eq("id", req.accountId).maybeSingle();
    const pipeOf = new Map((pipes || []).map((p) => [p.id, p]));
    const safe = (x, fb = "Sem nome") => String(x || fb).replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || fb;
    const MESES = ["01 Janeiro", "02 Fevereiro", "03 Março", "04 Abril", "05 Maio", "06 Junho", "07 Julho", "08 Agosto", "09 Setembro", "10 Outubro", "11 Novembro", "12 Dezembro"];
    const fieldVal = (l, re) => {
      const fields = pipeOf.get(l.pipeline_id)?.fields || [];
      const f = fields.find((x) => re.test(x.id) || re.test(x.label || ""));
      return f ? (l.custom || {})[f.id] : null;
    };
    const levelName = (l, lv) => {
      if (lv === "mes") { const d = new Date(l.created_at); return `${d.getFullYear()}/${MESES[d.getMonth()]}`; }
      if (lv === "seguradora") return safe(fieldVal(l, /seguradora|^cia$|companhia/i), "Sem seguradora");
      if (lv === "produto") return safe(fieldVal(l, /^produto|produto/i) || fieldVal(l, /ramo|tipo_seguro|tipo de seguro/i) || l.crm_lead_products?.[0]?.crm_products?.name, "Sem produto");
      if (lv === "etapa") return safe(pipeOf.get(l.pipeline_id)?.stages?.find((s) => s.id === l.stage)?.name || l.stage, "Sem etapa");
      if (lv === "responsavel") return safe(l.owner?.name, "Sem responsável");
      return "Outros";
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const root = safe(`CRM ${acc?.name || ""} ${stamp}`);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(root)}.zip"`);
    const zip = createZip(res);
    // Planilha geral (abre no Excel)
    const allFields = [...new Map((pipes || []).flatMap((p) => p.fields || []).map((f) => [f.id, f])).values()];
    const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Nome", "Empresa", "Telefone", "E-mail", "Funil", "Etapa", "Situação", "Responsável", "Valor", "Criado em", "Arquivado", ...allFields.map((f) => f.label), "Produtos"];
    const rows = [head.map(csvCell).join(";")];
    let totalBytes = 0;
    for (const l of leads || []) {
      const p = pipeOf.get(l.pipeline_id);
      const stage = p?.stages?.find((s) => s.id === l.stage)?.name || l.stage || "";
      const situ = l.outcome === "won" ? "Ganho" : l.outcome === "lost" ? "Perdido" : "Em andamento";
      const prods = (l.crm_lead_products || []).map((x) => x.crm_products?.name).filter(Boolean).join(", ");
      rows.push([l.name, l.company, l.phone, l.email, p?.name, stage, situ, l.owner?.name, l.value, new Date(l.created_at).toLocaleDateString("pt-BR"), l.archived_at ? "Sim" : "",
        ...allFields.map((f) => (l.custom || {})[f.id]), prods].map(csvCell).join(";"));
      const folder = [root, ...levels.map((lv) => levelName(l, lv)), safe(`${l.name}${l.company && l.company !== l.name ? ` - ${l.company}` : ""}`)].join("/");
      const lines = [
        `CLIENTE: ${l.name || ""}`, l.company ? `Empresa: ${l.company}` : null, l.phone ? `Telefone: ${l.phone}` : null, l.email ? `E-mail: ${l.email}` : null,
        `Funil: ${p?.name || ""}`, `Etapa: ${stage}`, `Situação: ${situ}${l.lost_reason ? ` (${l.lost_reason})` : ""}`, l.owner?.name ? `Responsável: ${l.owner.name}` : null,
        l.value != null ? `Valor: R$ ${Number(l.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : null,
        `Criado em: ${new Date(l.created_at).toLocaleString("pt-BR")}`, "", "DADOS DO CARD",
        ...(p?.fields || []).map((f) => `${f.label}: ${(l.custom || {})[f.id] ?? ""}`),
        prods ? `Produtos: ${prods}` : null, "", "HISTÓRICO",
        ...(l.history || []).filter((h) => h.type === "note" || h.type === "whats" || h.type === "stage" || h.type === "outcome").map((h) =>
          `${h.at ? new Date(h.at).toLocaleString("pt-BR") : ""} · ${h.type === "note" ? "Anotação" : h.type === "whats" ? "WhatsApp" : h.type === "stage" ? "Mudou de etapa" : "Resultado"}${h.by ? ` (${h.by})` : ""}${h.text ? `: ${h.text}` : ""}`),
        ...(l.checklist || []).length ? ["", "CHECKLIST", ...(l.checklist || []).map((c) => `[${c.done ? "x" : " "}] ${c.text}`)] : []
      ].filter((x) => x !== null);
      await zip.add(`${folder}/Dados do cliente.txt`, "\ufeff" + lines.join("\r\n"));
      if (withFiles) {
        for (const a of l.attachments || []) {
          if (!a?.url || totalBytes > 1500 * 1024 * 1024) continue;
          try {
            const r = await fetch(a.url);
            if (!r.ok) continue;
            const buf = Buffer.from(await r.arrayBuffer());
            totalBytes += buf.length;
            await zip.add(`${folder}/Anexos/${safe(a.name, "arquivo")}`, buf);
          } catch {}
        }
      }
    }
    await zip.add(`${root}/Planilha geral.csv`, "\ufeff" + rows.join("\r\n"));
    await zip.finish();
  } catch (err) {
    if (!res.headersSent) fail(res, err); else try { res.end(); } catch {}
  }
});

// ---------------------------------------------------------------- Produtos / serviços
router.get("/products", async (req, res) => {
  try {
    const { data, error } = await supabase.from("crm_products").select("*").eq("account_id", req.accountId).order("name");
    if (error) throw error;
    res.json(data.map((p) => ({ ...p, price: Number(p.price) })));
  } catch (err) { fail(res, err); }
});
router.post("/products", async (req, res) => {
  try {
    const b = req.body || {};
    if (!String(b.name || "").trim()) return res.status(400).json({ error: "Dê um nome ao produto." });
    const { data, error } = await supabase.from("crm_products").insert({
      account_id: req.accountId, name: String(b.name).trim().slice(0, 120), description: b.description || null,
      price: money(b.price), recurring: !!b.recurring, active: b.active !== false,
      ...(b.parentId ? { parent_id: b.parentId } : {})
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { fail(res, err); }
});
// Importa todos os ramos de seguro como produtos, com os subprodutos dentro (não duplica)
router.post("/products/import-ramos", async (req, res) => {
  try {
    const { data: cur, error } = await supabase.from("crm_products").select("id, name, parent_id").eq("account_id", req.accountId);
    if (error) throw error;
    const key = (n) => String(n || "").trim().toLowerCase();
    let created = 0;
    for (const [ramo, subs] of Object.entries(RAMOS)) {
      let parent = cur.find((p) => !p.parent_id && key(p.name) === key(ramo));
      if (!parent) {
        const { data: np, error: e1 } = await supabase.from("crm_products").insert({ account_id: req.accountId, name: ramo, price: 0, active: true }).select("id, name, parent_id").single();
        if (e1) throw e1;
        parent = np; cur.push(np); created++;
      }
      const missing = subs.filter((sname) => !cur.some((p) => p.parent_id === parent.id && key(p.name) === key(sname)));
      if (missing.length) {
        const { data: ins, error: e2 } = await supabase.from("crm_products")
          .insert(missing.map((sname) => ({ account_id: req.accountId, name: sname, price: 0, active: true, parent_id: parent.id }))).select("id, name, parent_id");
        if (e2) throw e2;
        cur.push(...ins); created += ins.length;
      }
    }
    res.json({ created });
  } catch (err) {
    if (/parent_id/.test(err.message || "")) return res.status(500).json({ error: "Rode a migration 036 no Supabase (subprodutos)." });
    fail(res, err);
  }
});
router.patch("/products/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    if (b.name !== undefined) patch.name = String(b.name).slice(0, 120);
    if (b.description !== undefined) patch.description = b.description;
    if (b.price !== undefined) patch.price = money(b.price);
    if (b.recurring !== undefined) patch.recurring = !!b.recurring;
    if (b.active !== undefined) patch.active = !!b.active;
    if (b.parentId !== undefined) patch.parent_id = b.parentId && b.parentId !== req.params.id ? b.parentId : null;
    const { data, error } = await supabase.from("crm_products").update(patch).eq("account_id", req.accountId).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { fail(res, err); }
});
router.delete("/products/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("crm_products").delete().eq("account_id", req.accountId).eq("id", req.params.id);
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
});

// ---------------------------------------------------------------- Agenda
router.get("/events", async (req, res) => {
  try {
    let q = supabase.from("crm_events").select("*, crm_leads(name, phone), owner:profiles!crm_events_owner_id_fkey(name)").eq("account_id", req.accountId).order("starts_at");
    if (req.query.from) q = q.gte("starts_at", req.query.from);
    if (req.query.to) q = q.lte("starts_at", req.query.to);
    if (req.query.leadId) q = q.eq("lead_id", req.query.leadId);
    if (!isManager(req)) q = q.eq("owner_id", req.userId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data.map((e) => ({
      id: e.id, title: e.title, kind: e.kind, startsAt: e.starts_at, endsAt: e.ends_at, done: e.done, notes: e.notes,
      leadId: e.lead_id, leadName: e.crm_leads?.name || null, leadPhone: e.crm_leads?.phone || null, ownerId: e.owner_id, ownerName: e.owner?.name || null,
      meetLink: e.meet_link || null, googleEventId: e.google_event_id || null
    })));
  } catch (err) { fail(res, err); }
});
// Tipos de atividade criados pela equipe (os que já foram usados em alguma atividade)
const BASE_KINDS = ["reuniao", "call", "followup", "tarefa"];
router.get("/activity-kinds", async (req, res) => {
  try {
    const { data, error } = await supabase.from("crm_events").select("kind").eq("account_id", req.accountId).order("created_at", { ascending: false }).limit(3000);
    if (error) throw error;
    const seen = new Map();
    for (const r of data || []) {
      const k = String(r.kind || "").trim();
      if (!k || BASE_KINDS.includes(k) || seen.has(k.toLowerCase())) continue;
      seen.set(k.toLowerCase(), k);
    }
    res.json([...seen.values()].slice(0, 30));
  } catch (err) { fail(res, err); }
});
router.post("/events", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.startsAt) return res.status(400).json({ error: "Escolha data e hora." });
    const { data, error } = await supabase.from("crm_events").insert({
      account_id: req.accountId, lead_id: b.leadId || null, title: String(b.title || "Reunião").slice(0, 120), kind: String(b.kind || "reuniao").trim().slice(0, 40) || "reuniao",
      starts_at: b.startsAt, ends_at: b.endsAt || null, notes: b.notes || null, owner_id: b.ownerId || req.userId
    }).select().single();
    if (error) throw error;
    if (b.leadId) await supabase.from("crm_leads").update({ last_interaction_at: new Date().toISOString() }).eq("id", b.leadId);
    // Google Agenda + Meet (se o usuário conectou a conta Google)
    let google = null, googleError = null;
    if (b.google) {
      try {
        let attendee = null, leadName = "";
        if (b.leadId) {
          const { data: lead } = await supabase.from("crm_leads").select("name, email").eq("id", b.leadId).maybeSingle();
          attendee = b.inviteLead ? lead?.email || null : null;
          leadName = lead?.name || "";
        }
        google = await createGoogleEvent(req.userId, {
          title: leadName ? `${data.title} · ${leadName}` : data.title, startsAt: data.starts_at, endsAt: data.ends_at,
          description: data.notes || "", attendeeEmail: attendee, meet: b.meet !== false
        });
        if (google) await supabase.from("crm_events").update({ google_event_id: google.eventId, meet_link: google.meetLink }).eq("id", data.id);
        else googleError = "Conecte sua conta Google (CRM → Agenda) para criar o evento com Meet.";
      } catch (err) { googleError = err.message; }
    }
    res.status(201).json({ ...data, meet_link: google?.meetLink || null, googleError });
  } catch (err) { fail(res, err); }
});
router.patch("/events/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    for (const [k, col] of [["title", "title"], ["kind", "kind"], ["startsAt", "starts_at"], ["endsAt", "ends_at"], ["notes", "notes"], ["done", "done"]]) if (b[k] !== undefined) patch[col] = b[k];
    const { data, error } = await supabase.from("crm_events").update(patch).eq("account_id", req.accountId).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { fail(res, err); }
});
router.delete("/events/:id", async (req, res) => {
  try {
    const { data: ev } = await supabase.from("crm_events").select("google_event_id, owner_id").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (ev?.google_event_id) deleteGoogleEvent(ev.owner_id || req.userId, ev.google_event_id);
    const { error } = await supabase.from("crm_events").delete().eq("account_id", req.accountId).eq("id", req.params.id);
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
});

export default router;
