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

export async function runStageAutomations(accountId, lead, byName) {
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
    const { count } = await supabase.from("crm_leads").select("id", { count: "exact", head: true }).eq("pipeline_id", req.params.id);
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
  if (b.custom !== undefined) row.custom = cleanCustom(b.custom);
  if (Array.isArray(b.checklist)) row.checklist = b.checklist.slice(0, 50).map((c) => ({ id: String(c.id || randomUUID()).slice(0, 40), text: String(c.text || "").slice(0, 200), done: !!c.done })).filter((c) => c.text);
  return row;
}

router.get("/leads", async (req, res) => {
  try {
    let q = supabase.from("crm_leads").select(LEAD_SELECT).eq("account_id", req.accountId).order("created_at", { ascending: false }).limit(2000);
    if (req.query.pipelineId) q = q.eq("pipeline_id", req.query.pipelineId);
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
    runStageAutomations(req.accountId, data, req.userName);
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
    const { data: before } = await supabase.from("crm_leads").select("stage, pipeline_id, owner_id, value").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (row.stage) {
      if (before && before.stage === row.stage && (!row.pipeline_id || row.pipeline_id === before.pipeline_id)) delete row.stage;
      else row.stage_changed_at = new Date().toISOString();
    }
    const hist = [];
    const by = req.userName || null;
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
    if (hist.length) { await pushHistory(data.id, hist); data.history = [...(data.history || []), ...hist.map((h) => ({ ...h, at: new Date().toISOString() }))]; }
    res.json(mapLead(data));
  } catch (err) { fail(res, err); }
});
router.delete("/leads/:id", async (req, res) => {
  try {
    let q = supabase.from("crm_leads").delete().eq("account_id", req.accountId).eq("id", req.params.id);
    if (!isManager(req)) q = q.eq("owner_id", req.userId);
    const { error } = await q;
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
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
  let { data: lead } = await supabase.from("crm_leads").select(LEAD_SELECT).eq("account_id", accountId).eq("conversation_id", convId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const phone = onlyDigits(conv.phone || String(conv.external_id || "").split("@")[0]);
  if (!lead && phone.length >= 10) {
    const tail = phone.slice(-8);
    ({ data: lead } = await supabase.from("crm_leads").select(LEAD_SELECT).eq("account_id", accountId).ilike("phone", `%${tail}`).order("created_at", { ascending: false }).limit(1).maybeSingle());
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
      price: money(b.price), recurring: !!b.recurring, active: b.active !== false
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { fail(res, err); }
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
router.post("/events", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.startsAt) return res.status(400).json({ error: "Escolha data e hora." });
    const { data, error } = await supabase.from("crm_events").insert({
      account_id: req.accountId, lead_id: b.leadId || null, title: String(b.title || "Reunião").slice(0, 120), kind: b.kind || "reuniao",
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
