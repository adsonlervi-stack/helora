import crypto from "crypto";
import { Router } from "express";
import { supabase, createChannel, checkChannelLimit, findChannelByPage } from "../config/db.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";

/**
 * Instagram API oficial com "Login do Instagram" (o mesmo jeito do Chatwoot):
 * a empresa entra com a conta Profissional do Instagram, sem precisar de Página do Facebook.
 * Railway: INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET (Meta for Developers → app → Instagram → Configuração da API com login do Instagram).
 * Redirect cadastrado no app: <BACKEND>/instagram/callback · Webhook: <BACKEND>/webhook/meta (objeto "instagram", campo messages).
 */
const V = () => process.env.INSTAGRAM_GRAPH_VERSION || "v21.0";
const BACKEND = () => (process.env.BACKEND_PUBLIC_URL || "https://backend-production-b42a.up.railway.app").replace(/\/$/, "");
const FRONT = () => (process.env.FRONTEND_ORIGIN || "").split(",")[0].replace(/\/$/, "");
const REDIRECT = () => `${BACKEND()}/instagram/callback`;
export const igConfigured = () => !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
const SCOPES = "instagram_business_basic,instagram_business_manage_messages";

const sign = (v) => crypto.createHmac("sha256", process.env.INSTAGRAM_APP_SECRET || "x").update(v).digest("hex").slice(0, 32);
const makeState = (u, a) => { const v = `${u}.${a}.${Date.now()}`; return `${v}.${sign(v)}`; };
const readState = (s) => { const p = String(s || "").split("."); if (p.length !== 4) return null; const v = p.slice(0, 3).join("."); if (sign(v) !== p[3] || Date.now() - Number(p[2]) > 15 * 60000) return null; return { userId: p[0], accountId: p[1] }; };
const j = async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error(d.error?.message || d.error_message || "Falha no Instagram"); return d; };

export const igCallbackRouter = Router();
igCallbackRouter.get("/instagram/callback", async (req, res) => {
  const back = (ok, msg) => res.redirect(`${FRONT() || "/"}/?aba=channels&ig=${ok ? "ok" : "erro"}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}`);
  try {
    const st = readState(req.query.state);
    if (!st || !req.query.code) return back(false, req.query.error_description || "Link expirado. Tente de novo.");
    const short = await j(await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID, client_secret: process.env.INSTAGRAM_APP_SECRET, grant_type: "authorization_code", redirect_uri: REDIRECT(), code: String(req.query.code).replace(/#_$/, "") })
    }));
    const long = await j(await fetch(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: process.env.INSTAGRAM_APP_SECRET, access_token: short.access_token })}`));
    const token = long.access_token;
    const me = await j(await fetch(`https://graph.instagram.com/${V()}/me?${new URLSearchParams({ fields: "user_id,username,name,profile_picture_url", access_token: token })}`));
    const igId = String(me.user_id || me.id);
    const other = await findChannelByPage("instagram", igId).catch(() => null);
    if (other && other.accountId !== st.accountId) return back(false, "Este Instagram já está conectado em outra empresa do Helora.");
    // Assina as mensagens no webhook do Helora
    await fetch(`https://graph.instagram.com/${V()}/me/subscribed_apps?${new URLSearchParams({ subscribed_fields: "messages,messaging_postbacks,messaging_seen", access_token: token })}`, { method: "POST" }).catch(() => {});
    if (other) {
      await supabase.from("channels").update({ access_token: token }).eq("id", other.id);
    } else {
      await checkChannelLimit(st.accountId, "instagram");
      await createChannel({ accountId: st.accountId, platform: "instagram", name: me.username ? `@${me.username}` : me.name || "Instagram", externalPageId: igId, accessToken: token });
    }
    await supabase.from("account_integrations").upsert({ account_id: st.accountId, provider: `ig_token_${igId}`, status: "connected", config: { refreshedAt: new Date().toISOString(), expiresIn: long.expires_in || 5184000 }, updated_at: new Date().toISOString() }, { onConflict: "account_id,provider" });
    back(true);
  } catch (err) { back(false, err.message); }
});

export const igRouter = Router();
igRouter.use(requireAuth);
igRouter.get("/status", (req, res) => res.json({ configured: igConfigured() }));
igRouter.get("/auth-url", requireOwner, (req, res) => {
  if (!igConfigured()) return res.status(503).json({ error: "Conexão com o Instagram ainda não configurada. Fale com o suporte Helora." });
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.search = new URLSearchParams({ client_id: process.env.INSTAGRAM_APP_ID, redirect_uri: REDIRECT(), response_type: "code", scope: SCOPES, state: makeState(req.userId, req.accountId), enable_fb_login: "0", force_authentication: "1" });
  res.json({ url: u.toString() });
});

/** Nome e foto de quem mandou a mensagem (usa o token do canal). */
export async function igProfile(token, igsid) {
  try {
    const host = String(token || "").startsWith("IG") ? "graph.instagram.com" : "graph.facebook.com";
    const r = await fetch(`https://${host}/${V()}/${igsid}?${new URLSearchParams({ fields: "name,username,profile_pic", access_token: token })}`);
    const d = await r.json();
    return r.ok ? { name: d.name || (d.username ? `@${d.username}` : null), username: d.username || null, pic: d.profile_pic || null } : null;
  } catch { return null; }
}

/** Renova os tokens do Instagram (duram 60 dias). Roda 1x por dia. */
export async function refreshInstagramTokens() {
  if (!igConfigured()) return;
  try {
    const { data } = await supabase.from("channels").select("id, access_token").eq("platform", "instagram").like("access_token", "IG%").limit(1000);
    for (const c of data || []) {
      try {
        const r = await fetch(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: c.access_token })}`);
        const d = await r.json();
        if (r.ok && d.access_token) await supabase.from("channels").update({ access_token: d.access_token }).eq("id", c.id);
      } catch {}
    }
  } catch (e) { console.warn("[Instagram] renovar tokens:", e.message); }
}
