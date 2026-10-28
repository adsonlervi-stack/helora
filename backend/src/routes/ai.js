import { Router } from "express";
import { supabase } from "../config/db.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { resolveAI } from "../aiClient.js";

/** IA da Helora: só dentro dos Fluxos (bloco "Atendente IA"), respondendo com base nos Prompts da empresa. */
const router = Router();
router.use(requireAuth);

async function allowed(req) {
  const { data } = await supabase.from("accounts").select("enabled_tabs").eq("id", req.accountId).maybeSingle();
  if (!Array.isArray(data?.enabled_tabs) || data.enabled_tabs.includes("ai") || req.isSuperAdmin) return true;
  // Empresa com IA própria conectada (aba Conexões) pode usar atendentes IA
  const ai = await resolveAI(req.accountId).catch(() => null);
  return !!ai?.own;
}
const fail = (res, err) => res.status(500).json({ error: /ai_prompts/.test(err?.message || "") ? "Rode a migration 027 no Supabase." : err.message });

const map = (p) => ({
  id: p.id, name: p.name, prompt: p.prompt, historySize: p.history_size, maxTurns: p.max_turns,
  transferDepartmentId: p.transfer_department_id, transferMessageEnabled: p.transfer_message_enabled,
  transferMessage: p.transfer_message || "", processImages: p.process_images,
  unsupportedMediaMessage: p.unsupported_media_message || "", updatedAt: p.updated_at
});
function row(b) {
  const r = {};
  if (b.name !== undefined) r.name = String(b.name).slice(0, 80);
  if (b.prompt !== undefined) r.prompt = String(b.prompt).slice(0, 20000);
  if (b.historySize !== undefined) r.history_size = Math.min(50, Math.max(2, parseInt(b.historySize, 10) || 20));
  if (b.maxTurns !== undefined) r.max_turns = Math.min(100, Math.max(1, parseInt(b.maxTurns, 10) || 20));
  if (b.transferDepartmentId !== undefined) r.transfer_department_id = b.transferDepartmentId || null;
  if (b.transferMessageEnabled !== undefined) r.transfer_message_enabled = !!b.transferMessageEnabled;
  if (b.transferMessage !== undefined) r.transfer_message = String(b.transferMessage).slice(0, 500);
  if (b.processImages !== undefined) r.process_images = !!b.processImages;
  if (b.unsupportedMediaMessage !== undefined) r.unsupported_media_message = String(b.unsupportedMediaMessage).slice(0, 500);
  r.updated_at = new Date().toISOString();
  return r;
}

router.get("/status", async (req, res) => {
  const ai = await resolveAI(req.accountId).catch(() => null);
  // IA conectada pela própria empresa vale mesmo sem o módulo no plano
  const ok = ai?.own ? true : await allowed(req).catch(() => false);
  res.json({ configured: !!ai, enabled: !!ai && ok, allowed: ok, provider: ai?.provider || null, own: !!ai?.own });
});

router.get("/prompts", async (req, res) => {
  try {
    const { data, error } = await supabase.from("ai_prompts").select("*").eq("account_id", req.accountId).order("name");
    if (error) throw error;
    res.json(data.map(map));
  } catch (err) { fail(res, err); }
});
router.post("/prompts", requireOwner, async (req, res) => {
  try {
    if (!(await allowed(req))) return res.status(403).json({ error: "O módulo de IA não está liberado para a sua empresa." });
    if (!String(req.body?.name || "").trim()) return res.status(400).json({ error: "Dê um nome ao prompt." });
    if (String(req.body?.prompt || "").trim().length < 30) return res.status(400).json({ error: "Escreva o prompt de atendimento (como a IA deve atender) — ele é obrigatório, com pelo menos 30 caracteres." });
    const { data, error } = await supabase.from("ai_prompts").insert({ ...row(req.body), account_id: req.accountId }).select().single();
    if (error) throw error;
    res.status(201).json(map(data));
  } catch (err) { fail(res, err); }
});
router.patch("/prompts/:id", requireOwner, async (req, res) => {
  try {
    if (req.body?.prompt !== undefined && String(req.body.prompt).trim().length < 30) return res.status(400).json({ error: "O prompt de atendimento é obrigatório (pelo menos 30 caracteres)." });
    const { data, error } = await supabase.from("ai_prompts").update(row(req.body || {})).eq("account_id", req.accountId).eq("id", req.params.id).select().single();
    if (error) throw error;
    res.json(map(data));
  } catch (err) { fail(res, err); }
});
router.delete("/prompts/:id", requireOwner, async (req, res) => {
  try {
    const { error } = await supabase.from("ai_prompts").delete().eq("account_id", req.accountId).eq("id", req.params.id);
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) { fail(res, err); }
});

export default router;
