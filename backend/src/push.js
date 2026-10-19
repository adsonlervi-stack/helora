import webpush from "web-push";
import { Router } from "express";
import { supabase } from "./config/db.js";
import { requireAuth } from "./middleware/auth.js";

/**
 * Notificações push (chegam no celular/computador mesmo com o Helora fechado).
 * As chaves VAPID são geradas sozinhas na primeira vez e guardadas no banco (app_settings).
 */
let vapid = null;
async function getVapid() {
  if (vapid) return vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const { data } = await supabase.from("app_settings").select("value").eq("key", "vapid").maybeSingle();
    if (data?.value?.publicKey) vapid = data.value;
    else {
      vapid = webpush.generateVAPIDKeys();
      await supabase.from("app_settings").upsert({ key: "vapid", value: vapid });
    }
  }
  webpush.setVapidDetails(`mailto:${process.env.PUSH_CONTACT_EMAIL || "suporte@helora.app"}`, vapid.publicKey, vapid.privateKey);
  return vapid;
}

export async function pushToUsers(userIds, payload) {
  try {
    if (!userIds.length) return;
    await getVapid();
    const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, keys").in("user_id", userIds);
    for (const s of subs || []) {
      webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 3600 })
        .catch((err) => {
          if (err.statusCode === 404 || err.statusCode === 410) supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint).then(() => {});
        });
    }
  } catch (err) {
    console.warn("[Push]", err.message);
  }
}

/** Mensagem nova do cliente → avisa o atendente responsável (ou a equipe, se ninguém assumiu). */
export async function pushIncoming(accountId, conversationId, preview) {
  try {
    const { data: conv } = await supabase.from("conversations").select("name, assigned_agent_id, department_id, mode, is_group").eq("id", conversationId).maybeSingle();
    if (!conv || conv.is_group) return;
    let users = [];
    if (conv.assigned_agent_id) users = [conv.assigned_agent_id];
    else {
      const { data: profs } = await supabase.from("profiles").select("id, role").eq("account_id", accountId);
      let ids = (profs || []).map((p) => p.id);
      if (conv.department_id) {
        const { data: pd } = await supabase.from("profile_departments").select("profile_id").eq("department_id", conv.department_id);
        const inDep = new Set((pd || []).map((r) => r.profile_id));
        ids = (profs || []).filter((p) => p.role === "owner" || inDep.has(p.id)).map((p) => p.id);
      }
      users = ids;
    }
    await pushToUsers(users, { title: conv.name || "Nova mensagem", body: preview || "Nova mensagem", url: `/?c=${conversationId}`, tag: conversationId });
  } catch (err) {
    console.warn("[Push] incoming:", err.message);
  }
}

export const pushRouter = Router();
pushRouter.use(requireAuth);
pushRouter.get("/key", async (req, res) => {
  try { res.json({ publicKey: (await getVapid()).publicKey }); } catch (err) { res.status(500).json({ error: /app_settings/.test(err.message) ? "Rode a migration 026 no Supabase." : err.message }); }
});
pushRouter.post("/subscribe", async (req, res) => {
  try {
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: "Inscrição inválida." });
    const { error } = await supabase.from("push_subscriptions").upsert({
      endpoint: sub.endpoint, keys: sub.keys, user_id: req.userId, account_id: req.accountId,
      user_agent: String(req.headers["user-agent"] || "").slice(0, 200), updated_at: new Date().toISOString()
    }, { onConflict: "endpoint" });
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
pushRouter.post("/test", async (req, res) => {
  await pushToUsers([req.userId], { title: "Helora", body: "Notificações ativadas neste aparelho ✅", url: "/" });
  res.sendStatus(204);
});
