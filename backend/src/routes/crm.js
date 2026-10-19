import { Router } from "express";
import { supabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { enforceTabs } from "../governance.js";

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
  res.status(500).json({ error: /crm_/.test(msg) && /does not exist|schema cache/.test(msg) ? "Rode a migration 022 (CRM) no Supabase." : msg });
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
      .insert({ account_id: req.accountId, name: String(req.body?.name || "Novo funil").slice(0, 60), stages: req.body?.stages || DEFAULT_STAGES }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { fail(res, err); }
});
router.patch("/pipelines/:id", async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: "Só o gestor edita funis." });
    const patch = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name).slice(0, 60);
    if (Array.isArray(req.body?.stages)) patch.stages = req.body.stages.filter((s) => s?.id && s?.name).map((s) => ({ id: String(s.id).slice(0, 40), name: String(s.name).slice(0, 40), color: s.color || "#0a84ff" }));
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

// ---------------------------------------------------------------- Leads
const LEAD_SELECT = "*, owner:profiles!crm_leads_owner_id_fkey(name, avatar_url), crm_lead_products(id, qty, price, product_id, crm_products(name))";
function mapLead(l) {
  return {
    id: l.id, pipelineId: l.pipeline_id, stage: l.stage, name: l.name, phone: l.phone, email: l.email, company: l.company,
    value: l.value != null ? Number(l.value) : null, ownerId: l.owner_id, ownerName: l.owner?.name || null, ownerAvatar: l.owner?.avatar_url || null,
    tagIds: l.tag_ids || [], source: l.source, notes: l.notes, stageChangedAt: l.stage_changed_at, lastInteractionAt: l.last_interaction_at,
    createdAt: l.created_at, conversationId: l.conversation_id,
    products: (l.crm_lead_products || []).map((p) => ({ id: p.id, productId: p.product_id, name: p.crm_products?.name || "Produto", qty: Number(p.qty), price: Number(p.price) }))
  };
}
function leadRow(b) {
  const row = {};
  for (const [k, col] of [["name", "name"], ["phone", "phone"], ["email", "email"], ["company", "company"], ["source", "source"], ["notes", "notes"], ["stage", "stage"], ["pipelineId", "pipeline_id"]]) {
    if (b[k] !== undefined) row[col] = b[k] === "" ? null : b[k];
  }
  if (row.phone) row.phone = onlyDigits(row.phone);
  if (b.value !== undefined) row.value = b.value === "" || b.value === null ? null : Number(String(b.value).replace(/\./g, "").replace(",", ".")) || 0;
  if (b.ownerId !== undefined) row.owner_id = b.ownerId || null;
  if (b.tagIds !== undefined) row.tag_ids = Array.isArray(b.tagIds) ? b.tagIds : [];
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
    res.status(201).json(mapLead(data));
  } catch (err) { fail(res, err); }
});
router.patch("/leads/:id", async (req, res) => {
  try {
    const row = leadRow(req.body || {});
    if (row.stage) row.stage_changed_at = new Date().toISOString();
    row.last_interaction_at = new Date().toISOString();
    let q = supabase.from("crm_leads").update(row).eq("account_id", req.accountId).eq("id", req.params.id);
    if (!isManager(req)) q = q.eq("owner_id", req.userId);
    const { data, error } = await q.select(LEAD_SELECT).single();
    if (error) throw error;
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

// Importação em massa (planilha Excel já convertida em linhas no navegador)
router.post("/leads/import", async (req, res) => {
  try {
    const { pipelineId, stage, rows } = req.body || {};
    if (!pipelineId || !Array.isArray(rows) || !rows.length) return res.status(400).json({ error: "Nada para importar." });
    if (rows.length > 5000) return res.status(400).json({ error: "Máximo de 5.000 linhas por importação." });
    const { data: tags } = await supabase.from("crm_tags").select("id, name").eq("account_id", req.accountId);
    const tagMap = new Map((tags || []).map((t) => [t.name.toLowerCase(), t.id]));
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
        account_id: req.accountId, pipeline_id: pipelineId, stage: stage || "novos", owner_id: req.userId,
        name: String(r.name || r.phone).trim().slice(0, 120), phone: onlyDigits(r.phone) || null, email: r.email || null,
        company: r.company || null, source: r.source || "Importação", notes: r.notes || null,
        value: r.value ? Number(String(r.value).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")) || null : null,
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
        account_id: req.accountId, lead_id: req.params.id, product_id: i.productId, qty: Number(i.qty) || 1, price: Number(i.price) || 0
      })));
      if (error) throw error;
    }
    const total = items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.price) || 0), 0);
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
      price: Number(String(b.price || 0).replace(",", ".")) || 0, recurring: !!b.recurring, active: b.active !== false
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
    if (b.price !== undefined) patch.price = Number(String(b.price).replace(",", ".")) || 0;
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
      leadId: e.lead_id, leadName: e.crm_leads?.name || null, leadPhone: e.crm_leads?.phone || null, ownerId: e.owner_id, ownerName: e.owner?.name || null
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
    res.status(201).json(data);
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
    const { error } = await supabase.from("crm_events").delete().eq("account_id", req.accountId).eq("id", req.params.id);
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
});

export default router;
