// Conexões, Cérebro, Atendentes IA por canal e IA Helora (criação).
import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { supabase } from "../config/db.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { integrationsOf, saveIntegration, deleteIntegration, mask, getIntegration } from "../integrations/store.js";
import { callAI, DEFAULT_MODELS, resolveAI } from "../aiClient.js";
import { addDoc, readUrl, readFile, askBrain } from "../integrations/brain.js";
import { testMail, syncMail, mailPreset } from "../integrations/mail.js";
import { canvaAuthUrl, canvaConfigured, listDesigns, createDesign, exportDesign, CANVA_SIZES } from "../integrations/canva.js";
import { studioChat, studioImage, studioFlow } from "../integrations/studio.js";
import { testAttendant } from "../bot/flowRunner.js";
import { clearAttendantCache } from "../bot/engine.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const router = Router();
router.use(requireAuth);
const fail = (res, err) => {
  const msg = err?.message || String(err);
  const mig = /account_integrations|brain_|ai_studio_chats|ai_prompt_id|agent_ids|brain_search/.test(msg) && /does not exist|schema cache|column/.test(msg);
  res.status(err?.status || 400).json({ error: mig ? "Rode a migration 041 no Supabase." : msg });
};
const isManager = (req) => req.role === "owner" || req.isSuperAdmin;

// ------------------------------------------------------------ Conexões
const AI_PROVIDERS = { openai: "ChatGPT (OpenAI)", anthropic: "Claude (Anthropic)", gemini: "Gemini (Google)" };
const BACKEND = () => (process.env.BACKEND_PUBLIC_URL || "https://backend-production-b42a.up.railway.app").replace(/\/$/, "");

router.get("/", async (req, res) => {
  try {
    const map = await integrationsOf(req.accountId);
    const out = {};
    for (const [k, v] of Object.entries(map)) {
      const c = v.config || {};
      if (AI_PROVIDERS[k]) out[k] = { connected: true, model: c.model || DEFAULT_MODELS[k], key: mask(c.apiKey), at: v.updated_at };
      else if (k === "email") out[k] = { connected: true, email: c.email, fromName: c.fromName || "", imapHost: c.imapHost || "", smtpHost: c.smtpHost || "", autoSync: !!c.autoSync, lastSync: c.lastSync || null, at: v.updated_at };
      else if (k === "canva") out[k] = { connected: !!c.accessToken, name: c.name || null, at: v.updated_at };
      else if (k === "forms") out[k] = { connected: true, forms: (c.forms || []).map((f) => ({ ...f, url: `${BACKEND()}/public/forms/${f.token}` })) };
      else if (k === "ai_default") out[k] = { provider: c.provider || null };
    }
    const ai = await resolveAI(req.accountId).catch(() => null);
    res.json({ integrations: out, activeAI: ai ? { provider: ai.provider, own: ai.own } : null, canvaAvailable: canvaConfigured() });
  } catch (err) { fail(res, err); }
});

// IA: ChatGPT / Claude / Gemini — testa a chave antes de salvar
router.put("/ai/:provider", requireOwner, async (req, res) => {
  try {
    const provider = req.params.provider;
    if (!AI_PROVIDERS[provider]) return res.status(400).json({ error: "Provedor desconhecido." });
    const old = await getIntegration(req.accountId, provider);
    const apiKey = String(req.body?.apiKey || "").trim() || old?.config?.apiKey;
    const model = String(req.body?.model || "").trim() || old?.config?.model || DEFAULT_MODELS[provider];
    if (!apiKey) return res.status(400).json({ error: "Cole a chave de API." });
    try {
      await callAI({ provider, apiKey, model }, { messages: [{ role: "user", content: "Responda só: ok" }], maxTokens: 10 });
    } catch (e) {
      return res.status(400).json({ error: `A chave não funcionou: ${e.message}` });
    }
    await saveIntegration(req.accountId, provider, { apiKey, model });
    const def = await getIntegration(req.accountId, "ai_default");
    if (!def?.config?.provider) await saveIntegration(req.accountId, "ai_default", { provider });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});
router.put("/ai-default", requireOwner, async (req, res) => {
  try {
    const provider = req.body?.provider;
    if (!AI_PROVIDERS[provider]) return res.status(400).json({ error: "Escolha ChatGPT, Claude ou Gemini." });
    await saveIntegration(req.accountId, "ai_default", { provider });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

// E-mail (IMAP/SMTP)
router.get("/email/preset", (req, res) => res.json(mailPreset(req.query.email) || {}));
router.put("/email", requireOwner, async (req, res) => {
  try {
    const old = await getIntegration(req.accountId, "email");
    const b = req.body || {};
    const cfg = { ...(old?.config || {}), ...b, password: b.password || old?.config?.password };
    const full = await testMail(cfg);
    await saveIntegration(req.accountId, "email", { ...full, fromName: b.fromName || old?.config?.fromName || "", autoSync: b.autoSync !== undefined ? !!b.autoSync : !!old?.config?.autoSync, lastSync: old?.config?.lastSync || null });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});
router.post("/email/sync", requireOwner, async (req, res) => {
  try {
    const r = await syncMail(req.accountId, { limit: Math.min(200, Number(req.body?.limit) || 40) });
    const it = await getIntegration(req.accountId, "email");
    if (it) await saveIntegration(req.accountId, "email", { ...it.config, lastSync: new Date().toISOString() });
    res.json(r);
  } catch (err) { fail(res, err); }
});

// Formulários: cada formulário tem um link próprio que cria o lead no CRM
router.post("/forms", requireOwner, async (req, res) => {
  try {
    const it = await getIntegration(req.accountId, "forms");
    const forms = it?.config?.forms || [];
    const b = req.body || {};
    if (forms.length >= 30) return res.status(400).json({ error: "Máximo de 30 formulários." });
    forms.push({ id: crypto.randomUUID(), token: crypto.randomBytes(18).toString("hex"), name: String(b.name || "Formulário do site").slice(0, 80), pipelineId: b.pipelineId || null, stage: b.stage || null, toBrain: !!b.toBrain, createdAt: new Date().toISOString(), count: 0 });
    await saveIntegration(req.accountId, "forms", { forms });
    res.status(201).json({ ok: true });
  } catch (err) { fail(res, err); }
});
router.patch("/forms/:id", requireOwner, async (req, res) => {
  try {
    const it = await getIntegration(req.accountId, "forms");
    const forms = (it?.config?.forms || []).map((f) => (f.id === req.params.id ? { ...f, ...["name", "pipelineId", "stage", "toBrain"].reduce((o, k) => (req.body?.[k] !== undefined ? { ...o, [k]: req.body[k] } : o), {}) } : f));
    await saveIntegration(req.accountId, "forms", { forms });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});
router.delete("/forms/:id", requireOwner, async (req, res) => {
  try {
    const it = await getIntegration(req.accountId, "forms");
    await saveIntegration(req.accountId, "forms", { forms: (it?.config?.forms || []).filter((f) => f.id !== req.params.id) });
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
});

// Canva
router.get("/canva/auth-url", requireOwner, (req, res) => {
  try { res.json({ url: canvaAuthUrl(req.accountId) }); } catch (err) { fail(res, err); }
});
router.get("/canva/designs", async (req, res) => {
  try { res.json(await listDesigns(req.accountId, String(req.query.q || ""))); } catch (err) { fail(res, err); }
});
router.get("/canva/sizes", (req, res) => res.json(CANVA_SIZES));
router.post("/canva/designs/:id/export", async (req, res) => {
  try { res.json({ urls: await exportDesign(req.accountId, req.params.id, req.body?.format || "png") }); } catch (err) { fail(res, err); }
});

router.delete("/:provider", requireOwner, async (req, res) => {
  try {
    await deleteIntegration(req.accountId, req.params.provider);
    if (req.params.provider === "ai_default") return res.sendStatus(204);
    const def = await getIntegration(req.accountId, "ai_default");
    if (def?.config?.provider === req.params.provider) await deleteIntegration(req.accountId, "ai_default");
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
});

// ------------------------------------------------------------ Cérebro
const docOut = (d) => ({ id: d.id, source: d.source, title: d.title, url: d.url, chars: d.chars, agentIds: d.agent_ids || [], createdAt: d.created_at, updatedAt: d.updated_at });
router.get("/brain/docs", async (req, res) => {
  try {
    let q = supabase.from("brain_docs").select("id, source, title, url, chars, agent_ids, created_at, updated_at").eq("account_id", req.accountId).order("updated_at", { ascending: false }).limit(500);
    if (req.query.agent) q = q.contains("agent_ids", [req.query.agent]);
    const { data, error } = await q;
    if (error) throw error;
    res.json((data || []).map(docOut));
  } catch (err) { fail(res, err); }
});
const agentIdsOf = (v) => {
  const arr = Array.isArray(v) ? v : String(v || "").split(",");
  return arr.map((x) => String(x).trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
};
router.post("/brain/docs", requireOwner, upload.single("file"), async (req, res) => {
  try {
    const b = req.body || {};
    const agentIds = agentIdsOf(b.agentIds);
    let r;
    if (req.file) {
      const name = Buffer.from(req.file.originalname || "arquivo", "latin1").toString("utf8");
      const x = await readFile(req.file.buffer, name, req.file.mimetype);
      r = await addDoc(req.accountId, { source: x.kind, title: b.title || name, content: x.content, createdBy: req.userId, agentIds });
    } else if (b.url) {
      const x = await readUrl(b.url);
      r = await addDoc(req.accountId, { source: x.kind, title: b.title || x.title, url: b.url, ref: b.url, content: x.content, createdBy: req.userId, agentIds });
    } else {
      r = await addDoc(req.accountId, { source: "texto", title: b.title || "Anotação", content: b.content, createdBy: req.userId, agentIds });
    }
    res.status(201).json(r);
  } catch (err) { fail(res, err); }
});
router.post("/brain/docs/:id/refresh", requireOwner, async (req, res) => {
  try {
    const { data: d } = await supabase.from("brain_docs").select("*").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (!d?.url) return res.status(400).json({ error: "Só dá para atualizar itens que vieram de um link." });
    const x = await readUrl(d.url);
    res.json(await addDoc(req.accountId, { source: d.source, title: d.title, url: d.url, ref: d.ref || d.url, content: x.content }));
  } catch (err) { fail(res, err); }
});
router.patch("/brain/docs/:id", requireOwner, async (req, res) => {
  try {
    const patch = {};
    if (req.body?.title !== undefined) patch.title = String(req.body.title).slice(0, 200);
    if (req.body?.agentIds !== undefined) { const a = agentIdsOf(req.body.agentIds); patch.agent_ids = a.length ? a : null; }
    const { error } = await supabase.from("brain_docs").update(patch).eq("account_id", req.accountId).eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});
router.get("/brain/docs/:id", async (req, res) => {
  try {
    const { data: d } = await supabase.from("brain_docs").select("*").eq("account_id", req.accountId).eq("id", req.params.id).maybeSingle();
    if (!d) return res.status(404).json({ error: "Não encontrado." });
    const { data: ch } = await supabase.from("brain_chunks").select("content").eq("doc_id", d.id).order("idx").limit(400);
    res.json({ ...docOut(d), content: (ch || []).map((c) => c.content).join("\n\n") });
  } catch (err) { fail(res, err); }
});
router.delete("/brain/docs/:id", requireOwner, async (req, res) => {
  try {
    await supabase.from("brain_docs").delete().eq("account_id", req.accountId).eq("id", req.params.id);
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
});
router.post("/brain/ask", async (req, res) => {
  try { res.json(await askBrain(req.accountId, String(req.body?.question || "").trim())); } catch (err) { fail(res, err); }
});

// ------------------------------------------------------------ Atendentes IA nos canais
router.get("/attendants/channels", async (req, res) => {
  try {
    const { data, error } = await supabase.from("channels").select("id, name, platform, phone, ai_prompt_id").eq("account_id", req.accountId).order("created_at");
    if (error) throw error;
    res.json((data || []).map((c) => ({ id: c.id, name: c.name, platform: c.platform, phone: c.phone, attendantId: c.ai_prompt_id })));
  } catch (err) { fail(res, err); }
});
router.put("/attendants/channels/:channelId", requireOwner, async (req, res) => {
  try {
    const promptId = req.body?.attendantId || null;
    if (promptId) {
      const { data } = await supabase.from("ai_prompts").select("id, prompt").eq("account_id", req.accountId).eq("id", promptId).maybeSingle();
      if (!data) return res.status(400).json({ error: "Atendente IA não encontrado." });
      if (String(data.prompt || "").trim().length < 30) return res.status(400).json({ error: "Este atendente ainda não tem prompt de atendimento. Escreva o prompt antes de ligar no canal." });
    }
    const { error } = await supabase.from("channels").update({ ai_prompt_id: promptId }).eq("account_id", req.accountId).eq("id", req.params.channelId);
    if (error) throw error;
    clearAttendantCache();
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});
router.post("/attendants/:id/test", async (req, res) => {
  try { res.json(await testAttendant(req.accountId, req.params.id, (req.body?.messages || []).slice(-20))); } catch (err) { fail(res, err); }
});

// ------------------------------------------------------------ IA Helora (criação)
router.get("/studio/chats", async (req, res) => {
  try {
    const { data, error } = await supabase.from("ai_studio_chats").select("id, title, updated_at").eq("account_id", req.accountId).eq("user_id", req.userId).order("updated_at", { ascending: false }).limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (err) { fail(res, err); }
});
router.get("/studio/chats/:id", async (req, res) => {
  try {
    const { data } = await supabase.from("ai_studio_chats").select("*").eq("account_id", req.accountId).eq("user_id", req.userId).eq("id", req.params.id).maybeSingle();
    if (!data) return res.status(404).json({ error: "Conversa não encontrada." });
    res.json(data);
  } catch (err) { fail(res, err); }
});
router.delete("/studio/chats/:id", async (req, res) => {
  try {
    await supabase.from("ai_studio_chats").delete().eq("account_id", req.accountId).eq("user_id", req.userId).eq("id", req.params.id);
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
});
async function saveChat(req, chatId, messages) {
  const title = String(messages.find((m) => m.role === "user")?.content || "Nova conversa").replace(/\s+/g, " ").slice(0, 60);
  if (chatId) {
    const { data } = await supabase.from("ai_studio_chats").update({ messages, updated_at: new Date().toISOString() }).eq("account_id", req.accountId).eq("user_id", req.userId).eq("id", chatId).select("id").maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await supabase.from("ai_studio_chats").insert({ account_id: req.accountId, user_id: req.userId, title, messages }).select("id").single();
  if (error) throw error;
  return data.id;
}
router.post("/studio/chat", async (req, res) => {
  try {
    const messages = (req.body?.messages || []).slice(-40);
    const { reply, provider } = await studioChat(req.accountId, messages);
    const all = [...messages, { role: "assistant", content: reply, at: new Date().toISOString() }];
    const chatId = await saveChat(req, req.body?.chatId, all).catch(() => req.body?.chatId || null);
    res.json({ reply, provider, chatId });
  } catch (err) { fail(res, err); }
});
router.post("/studio/image", async (req, res) => {
  try {
    const { url } = await studioImage(req.accountId, req.body?.prompt, req.body?.size);
    res.json({ url });
  } catch (err) { fail(res, err); }
});
router.post("/studio/canva", async (req, res) => {
  try {
    let imageBuffer = null;
    if (req.body?.imageUrl) {
      const r = await fetch(req.body.imageUrl);
      if (r.ok) imageBuffer = Buffer.from(await r.arrayBuffer());
    }
    res.json(await createDesign(req.accountId, { title: req.body?.title, size: req.body?.size, imageBuffer }));
  } catch (err) { fail(res, err); }
});
router.post("/studio/flow", requireOwner, async (req, res) => {
  try { res.json(await studioFlow(req.accountId, String(req.body?.description || ""))); } catch (err) { fail(res, err); }
});

export default router;

// ------------------------------------------------------------ Formulário público (sem login)
export async function publicFormHandler(req, res) {
  const wantsHtml = !req.is("application/json") && /text\/html/.test(req.headers.accept || "");
  const done = (ok, msg) => {
    const redirect = req.body?._redirect || req.query._redirect;
    if (ok && redirect && /^https?:\/\//.test(redirect)) return res.redirect(303, redirect);
    if (wantsHtml) return res.status(ok ? 200 : 400).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;color:#1d1d1f"><div style="text-align:center"><div style="font-size:42px">${ok ? "✅" : "⚠️"}</div><h2>${ok ? "Recebemos seus dados!" : "Não foi possível enviar"}</h2><p>${ok ? "Em breve entraremos em contato." : msg}</p></div></body>`);
    return res.status(ok ? 201 : 400).json(ok ? { ok: true } : { error: msg });
  };
  try {
    const { data: rows } = await supabase.from("account_integrations").select("account_id, config").eq("provider", "forms");
    let accountId = null, form = null, all = null;
    for (const r of rows || []) {
      const f = (r.config?.forms || []).find((x) => x.token === req.params.token);
      if (f) { accountId = r.account_id; form = f; all = r.config.forms; break; }
    }
    if (!form) return done(false, "Formulário não encontrado.");
    const b = { ...(req.query || {}), ...flattenFormPayload(req.body || {}) };
    delete b._redirect;
    const pick = (re) => { const k = Object.keys(b).find((x) => re.test(x.toLowerCase())); const v = k ? b[k] : null; if (k) delete b[k]; return v ? String(v).trim() : null; };
    const name = pick(/^(nome|name|nome_completo|full_?name|seu_nome)$/) || pick(/nome|name/);
    const phoneRaw = pick(/whats|telefone|celular|fone|phone|tel/);
    const email = pick(/e-?mail/);
    const company = pick(/empresa|company|razao/);
    if (!name && !phoneRaw && !email) return done(false, "Preencha pelo menos nome, telefone ou e-mail.");
    let phone = String(phoneRaw || "").replace(/\D/g, "");
    if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
    // pipeline e etapa
    let pipe = null;
    if (form.pipelineId) ({ data: pipe } = await supabase.from("crm_pipelines").select("id, stages, fields").eq("account_id", accountId).eq("id", form.pipelineId).maybeSingle());
    if (!pipe) ({ data: pipe } = await supabase.from("crm_pipelines").select("id, stages, fields").eq("account_id", accountId).order("created_at").limit(1).maybeSingle());
    if (!pipe) return done(false, "A empresa ainda não tem funil no CRM.");
    const stage = (pipe.stages || []).find((s) => s.id === form.stage)?.id || pipe.stages?.[0]?.id || "novos";
    const norm = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
    const custom = {}; const extra = [];
    for (const [k, v] of Object.entries(b)) {
      if (v === "" || v == null || k.startsWith("_")) continue;
      const val = Array.isArray(v) ? v.join(", ") : String(v).slice(0, 2000);
      const f = (pipe.fields || []).find((x) => norm(x.label) === norm(k) || norm(x.id) === norm(k));
      if (f) custom[f.id] = val; else extra.push(`${k}: ${val}`);
    }
    const { data: lead, error } = await supabase.from("crm_leads").insert({
      account_id: accountId, pipeline_id: pipe.id, stage, name: String(name || email || phone || "Lead do formulário").slice(0, 120), phone: phone || null,
      email: email || null, company: company || null, source: `Formulário: ${form.name}`.slice(0, 80),
      notes: extra.length ? extra.join("\n").slice(0, 8000) : null, custom, stage_changed_at: new Date().toISOString()
    }).select().single();
    if (error) throw error;
    import("./crm.js").then((m) => m.runStageAutomations(accountId, lead, null, { created: true })).catch(() => {});
    import("../webhooks.js").then((m) => m.emitEvent(accountId, "lead.criado", { id: lead.id, nome: lead.name, telefone: lead.phone, email: lead.email, origem: lead.source })).catch(() => {});
    if (form.toBrain && extra.length) addDoc(accountId, { source: "formulario", title: `${form.name}: ${lead.name}`, content: [`Nome: ${lead.name}`, phone ? `Telefone: ${phone}` : "", email ? `E-mail: ${email}` : "", ...extra].filter(Boolean).join("\n") }).catch(() => {});
    const forms = all.map((f) => (f.id === form.id ? { ...f, count: (f.count || 0) + 1, lastAt: new Date().toISOString() } : f));
    saveIntegration(accountId, "forms", { forms }).catch(() => {});
    done(true);
  } catch (err) {
    console.error("[Formulário]", err.message);
    done(false, "Erro ao enviar. Tente de novo em instantes.");
  }
}

/**
 * Cada ferramenta de formulário manda os dados num formato diferente.
 * Aqui tudo vira { "Pergunta": "resposta" } para o Helora entender.
 */
export function flattenFormPayload(body) {
  const out = {};
  const put = (k, v) => {
    if (v == null || v === "") return;
    const key = String(k || "").trim();
    if (!key) return;
    out[key] = Array.isArray(v) ? v.filter((x) => x != null && x !== "").join(", ") : typeof v === "object" ? (v.label || v.value || v.text || JSON.stringify(v)) : v;
  };
  try {
    // Typeform
    if (body.form_response?.answers) {
      const titles = Object.fromEntries((body.form_response.definition?.fields || []).map((f) => [f.id, f.title]));
      for (const a of body.form_response.answers) {
        const label = titles[a.field?.id] || a.field?.ref || a.field?.id;
        const v = a.text ?? a.email ?? a.phone_number ?? a.number ?? a.date ?? a.url ?? a.boolean ?? a.choice?.label ?? a.choices?.labels ?? a.file_url;
        put(label, v);
      }
      return out;
    }
    // Tally
    if (Array.isArray(body.data?.fields)) {
      for (const f of body.data.fields) {
        let v = f.value;
        if (Array.isArray(v) && Array.isArray(f.options)) v = v.map((id) => f.options.find((o) => o.id === id)?.text || id);
        put(f.label || f.key, v);
      }
      return out;
    }
    // RD Station
    if (Array.isArray(body.leads) && body.leads[0]) {
      const l = body.leads[0];
      put("nome", l.name); put("email", l.email); put("telefone", l.mobile_phone || l.personal_phone); put("empresa", l.company);
      for (const [k, v] of Object.entries(l.custom_fields || {})) put(k, v);
      return out;
    }
    // Fillout
    if (Array.isArray(body.submission?.questions)) {
      for (const q of body.submission.questions) put(q.name, q.value);
      return out;
    }
    // Jotform (rawRequest com q3_nome, q4_email…)
    if (body.rawRequest) {
      const raw = typeof body.rawRequest === "string" ? JSON.parse(body.rawRequest) : body.rawRequest;
      for (const [k, v] of Object.entries(raw || {})) {
        if (!/^q\d+_/.test(k)) continue;
        const label = k.replace(/^q\d+_/, "");
        if (v && typeof v === "object" && !Array.isArray(v)) put(label, v.full || [v.first, v.last].filter(Boolean).join(" ") || v.area ? `${v.area || ""}${v.phone || ""}` || Object.values(v).join(" ") : Object.values(v).join(" "));
        else put(label, v);
      }
      return out;
    }
    // HubSpot (properties: { firstname: { value } })
    if (body.properties && typeof body.properties === "object") {
      for (const [k, v] of Object.entries(body.properties)) put(k, v?.value ?? v);
      if (out.firstname || out.lastname) out.nome = [out.firstname, out.lastname].filter(Boolean).join(" ");
      return out;
    }
    // Webflow / Wix / outros que mandam { payload: { data } } ou { data: {...} }
    const inner = body.payload?.data || (body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : null);
    if (inner) { for (const [k, v] of Object.entries(inner)) put(k, v); for (const [k, v] of Object.entries(body)) if (!["payload", "data"].includes(k) && typeof v !== "object") put(k, v); return out; }
    // Elementor com "dados avançados": fields[id][value]
    if (body.fields && typeof body.fields === "object") {
      for (const [k, v] of Object.entries(body.fields)) put(v?.title || k, v?.value ?? v);
      return out;
    }
  } catch {}
  for (const [k, v] of Object.entries(body)) put(k, v);
  return out;
}
