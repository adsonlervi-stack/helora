import { Router } from "express";
import { supabase } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { aiConfigured } from "../aiClient.js";

/** A IA da Helora é usada só dentro dos Fluxos (bloco "Atendente IA"). Aqui só o status para a tela de fluxos. */
const router = Router();
router.use(requireAuth);

router.get("/status", async (req, res) => {
  const { data } = await supabase.from("accounts").select("enabled_tabs").eq("id", req.accountId).maybeSingle();
  const allowed = !Array.isArray(data?.enabled_tabs) || data.enabled_tabs.includes("ai") || req.isSuperAdmin;
  res.json({ configured: aiConfigured(), enabled: aiConfigured() && allowed, allowed });
});

export default router;
