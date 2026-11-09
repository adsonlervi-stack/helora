import crypto from "crypto";
import { Router } from "express";
import { supabase, createChannel, checkChannelLimit, findChannelByPage } from "../config/db.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";

/**
 * "Conectar com Facebook": a empresa entra com a conta do Facebook, escolhe a Página
 * (Messenger) ou o Instagram ligado a ela, e o canal é criado sozinho, sem colar token.
 * Railway: META_APP_ID, META_APP_SECRET (e META_VERIFY_TOKEN para o webhook).
 * No app da Meta, cadastre o redirect: <BACKEND>/meta/callback
 */
const V = () => process.env.META_GRAPH_VERSION || "v21.0";
const G = (p) => `https://graph.facebook.com/${V()}${p}`;
const BACKEND = () => (process.env.BACKEND_PUBLIC_URL || "https://backend-production-b42a.up.railway.app").replace(/\/$/, "");
const FRONT = () => (process.env.FRONTEND_ORIGIN || "").split(",")[0].replace(/\/$/, "");
const REDIRECT = () => `${BACKEND()}/meta/callback`;
export const metaConfigured = () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
const SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement", "instagram_basic", "instagram_manage_messages", "business_management"].join(",");

const sign = (v) => crypto.createHmac("sha256", process.env.META_APP_SECRET || "x").update(v).digest("hex").slice(0, 32);
const makeState = (u, a) => { const v = `${u}.${a}.${Date.now()}`; return `${v}.${sign(v)}`; };
const readState = (s) => {
  const p = String(s || "").split(".");
  if (p.length !== 4) return null;
  const v = p.slice(0, 3).join(".");
  if (sign(v) !== p[3] || Date.now() - Number(p[2]) > 15 * 60 * 1000) return null;
  return { userId: p[0], accountId: p[1] };
};
async function graph(path, params = {}, method = "GET") {
  const url = new URL(G(path));
  if (method === "GET") url.search = new URLSearchParams(params);
  const r = await fetch(url, method === "GET" ? {} : { method, headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error?.message || "Falha ao falar com o Facebook");
  return d;
}
const PENDING = "meta_pending";

export const metaCallbackRouter = Router();
metaCallbackRouter.get("/meta/callback", async (req, res) => {
  const back = (ok, msg) => res.redirect(`${FRONT() || "/"}/?aba=channels&meta=${ok ? "ok" : "erro"}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}`);
  try {
    const st = readState(req.query.state);
    if (!st || !req.query.code) return back(false, req.query.error_description || "Link expirado. Tente de novo.");
    const short = await graph("/oauth/access_token", { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: REDIRECT(), code: req.query.code });
    const long = await graph("/oauth/access_token", { grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: short.access_token });
    const pages = await graph("/me/accounts", { access_token: long.access_token, fields: "id,name,access_token,instagram_business_account{id,username}", limit: 100 });
    const list = (pages.data || []).map((p) => ({ id: p.id, name: p.name, token: p.access_token, ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username || "" } : null }));
    if (!list.length) return back(false, "Nenhuma Página do Facebook encontrada nesta conta. Você precisa ser administrador da Página.");
    await supabase.from("account_integrations").upsert(
      { account_id: st.accountId, provider: PENDING, status: "connected", config: { pages: list, at: new Date().toISOString(), by: st.userId }, updated_at: new Date().toISOString() },
      { onConflict: "account_id,provider" }
    );
    back(true);
  } catch (err) { back(false, err.message); }
});

export const metaRouter = Router();
metaRouter.use(requireAuth);
metaRouter.get("/status", (req, res) => res.json({ configured: metaConfigured() }));
metaRouter.get("/auth-url", requireOwner, (req, res) => {
  if (!metaConfigured()) return res.status(503).json({ error: "Conexão com o Facebook ainda não configurada. Fale com o suporte Helora." });
  const u = new URL(`https://www.facebook.com/${V()}/dialog/oauth`);
  u.search = new URLSearchParams({ client_id: process.env.META_APP_ID, redirect_uri: REDIRECT(), state: makeState(req.userId, req.accountId), scope: SCOPES, response_type: "code" });
  res.json({ url: u.toString() });
});
async function pending(accountId) {
  const { data } = await supabase.from("account_integrations").select("config").eq("account_id", accountId).eq("provider", PENDING).maybeSingle();
  const c = data?.config;
  if (!c?.pages || Date.now() - new Date(c.at).getTime() > 60 * 60 * 1000) return null;
  return c.pages;
}
metaRouter.get("/pages", requireOwner, async (req, res) => {
  const pages = await pending(req.accountId);
  if (!pages) return res.json([]);
  const out = [];
  for (const p of pages) {
    out.push({ id: p.id, name: p.name, platform: "messenger", connected: !!(await findChannelByPage("messenger", p.id).catch(() => null)) });
    if (p.ig) out.push({ id: p.ig.id, pageId: p.id, name: p.ig.username ? `@${p.ig.username}` : `Instagram de ${p.name}`, platform: "instagram", connected: !!(await findChannelByPage("instagram", p.ig.id).catch(() => null)) });
  }
  res.json(out);
});
metaRouter.post("/connect", requireOwner, async (req, res) => {
  try {
    const { id, platform } = req.body || {};
    const pages = await pending(req.accountId);
    if (!pages) return res.status(400).json({ error: "A conexão com o Facebook expirou. Clique em Conectar com Facebook de novo." });
    const page = platform === "instagram" ? pages.find((p) => p.ig?.id === id) : pages.find((p) => p.id === id);
    if (!page) return res.status(404).json({ error: "Página não encontrada." });
    const extId = platform === "instagram" ? page.ig.id : page.id;
    const other = await findChannelByPage(platform, extId).catch(() => null);
    if (other) return res.status(409).json({ error: other.accountId === req.accountId ? "Este canal já está conectado." : "Este canal já está conectado em outra empresa do Helora." });
    await checkChannelLimit(req.accountId, platform);
    // Assina a Página para receber as mensagens no webhook do Helora
    await graph(`/${page.id}/subscribed_apps`, { subscribed_fields: "messages,messaging_postbacks,message_reads", access_token: page.token }, "POST");
    const channel = await createChannel({
      accountId: req.accountId, platform, name: platform === "instagram" ? (page.ig.username ? `@${page.ig.username}` : `Instagram ${page.name}`) : page.name,
      externalPageId: extId, accessToken: page.token
    });
    res.status(201).json(channel);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
