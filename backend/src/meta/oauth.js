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
    let tok = short.access_token;
    try { tok = (await graph("/oauth/access_token", { grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: short.access_token })).access_token || tok; } catch {}
    let list = [];
    try {
      const pages = await graph("/me/accounts", { access_token: tok, fields: "id,name,access_token,instagram_business_account{id,username}", limit: 100 });
      list = (pages.data || []).map((p) => ({ id: p.id, name: p.name, token: p.access_token, ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username || "" } : null }));
    } catch {}
    // Login unificado: contas do Instagram autorizadas direto (sem Página) vêm nos escopos do token
    try {
      const dbg = await graph("/debug_token", { input_token: tok, access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}` });
      const igIds = new Set((dbg.data?.granular_scopes || []).filter((g) => /^instagram_/.test(g.scope)).flatMap((g) => g.target_ids || []));
      for (const p of list) if (p.ig) igIds.delete(p.ig.id);
      for (const id of igIds) {
        let username = "";
        try { username = (await graph(`/${id}`, { fields: "username", access_token: tok })).username || ""; } catch {}
        list.push({ id: `ig-${id}`, name: username ? `@${username}` : "Instagram", token: tok, igOnly: true, ig: { id, username } });
      }
    } catch {}
    if (!list.length) return back(false, "Nenhuma Página ou conta do Instagram foi autorizada. Tente de novo e marque as contas.");
    await supabase.from("account_integrations").upsert(
      { account_id: st.accountId, provider: PENDING, status: "connected", config: { pages: list, at: new Date().toISOString(), by: st.userId }, updated_at: new Date().toISOString() },
      { onConflict: "account_id,provider" }
    );
    back(true);
  } catch (err) { back(false, err.message); }
});

// Cadastro incorporado do WhatsApp (Helora como Provedor de Tecnologia): a empresa conecta o próprio número.
// O popup roda sempre no domínio do backend, então funciona em qualquer domínio do Helora.
async function connectEmbedded(accountId, { code, wabaId, phoneNumberId }) {
  if (!code || !wabaId || !phoneNumberId) throw new Error("O cadastro na Meta não foi concluído. Tente de novo.");
  const { data: other } = await supabase.from("channels").select("account_id").eq("phone_number_id", phoneNumberId).maybeSingle();
  if (other) throw new Error(other.account_id === accountId ? "Este número já está conectado." : "Este número já está conectado em outra empresa do Helora.");
  await checkChannelLimit(accountId, "whatsapp");
  const tk = await graph("/oauth/access_token", { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, code });
  const token = tk.access_token;
  await graph(`/${wabaId}/subscribed_apps`, { access_token: token }, "POST");
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  await graph(`/${phoneNumberId}/register`, { messaging_product: "whatsapp", pin, access_token: token }, "POST").catch((e) => console.warn("[WA embedded] register:", e.message));
  let name = "WhatsApp";
  try { const ph = await graph(`/${phoneNumberId}`, { fields: "display_phone_number,verified_name", access_token: token }); name = ph.verified_name || ph.display_phone_number || name; } catch {}
  return createChannel({ accountId, platform: "whatsapp", name, provider: "cloud", phoneNumberId, wabaId, accessToken: token });
}
const esc = (v) => JSON.stringify(v ?? null).replace(/</g, "\\u003c");
metaCallbackRouter.get("/meta/wa-signup", (req, res) => {
  const st = readState(req.query.state);
  res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar WhatsApp · Helora</title>
<style>body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#f5f6fa;color:#1d1d1f;display:grid;place-items:center;min-height:100vh}.c{background:#fff;border-radius:18px;padding:32px;max-width:380px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.08)}h1{font-size:20px;margin:0 0 8px}p{color:#6e6e73;font-size:14px;line-height:1.5}button{margin-top:16px;background:#25D366;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer}.e{color:#c0392b}</style></head>
<body><div class="c"><h1>Conectar WhatsApp</h1><p id="m">${st ? "Entre com o Facebook da empresa e siga as etapas da Meta para conectar o seu número." : "Link expirado. Feche esta janela e tente de novo pelo Helora."}</p>${st ? '<button id="b">Continuar com o Facebook</button>' : ""}</div>
<script>
const STATE=${esc(req.query.state)}, APP=${esc(process.env.META_APP_ID)}, CFG=${esc(process.env.META_WA_CONFIG_ID)}, VER=${esc(V())};
const m=document.getElementById("m"), b=document.getElementById("b");
const done=(ok,msg)=>{try{window.opener&&window.opener.postMessage({type:"helora-wa",ok,msg},"*")}catch(e){} m.textContent=msg; m.className=ok?"":"e"; if(b) b.style.display=ok?"none":""; if(ok) setTimeout(()=>window.close(),1500);};
let info=null;
window.addEventListener("message",(ev)=>{if(!/facebook\.com$/.test(new URL(ev.origin).hostname))return;try{const d=typeof ev.data==="string"?JSON.parse(ev.data):ev.data;if(d&&d.type==="WA_EMBEDDED_SIGNUP"&&d.event==="FINISH")info=d.data;}catch(e){}});
window.fbAsyncInit=()=>FB.init({appId:APP,autoLogAppEvents:true,xfbml:false,version:VER});
if(b) b.onclick=()=>{ if(!window.FB) return; FB.login(async(r)=>{
  const code=r.authResponse&&r.authResponse.code; if(!code) return done(false,"Conexão cancelada.");
  for(let i=0;i<20&&!info;i++) await new Promise(x=>setTimeout(x,250));
  if(!info||!info.phone_number_id) return done(false,"A Meta não informou o número escolhido. Conclua todas as etapas.");
  m.textContent="Conectando o número...";
  const res=await fetch("/meta/wa-signup/finish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({state:STATE,code,wabaId:info.waba_id,phoneNumberId:info.phone_number_id})});
  const d=await res.json().catch(()=>({}));
  res.ok?done(true,'WhatsApp "'+(d.name||"")+'" conectado! Pode fechar esta janela.'):done(false,d.error||"Não foi possível conectar.");
 },{config_id:CFG,response_type:"code",override_default_response_type:true,extras:{setup:{},featureType:"",sessionInfoVersion:"3"}}); };
</script><script async defer crossorigin="anonymous" src="https://connect.facebook.net/pt_BR/sdk.js"></script></body></html>`);
});
metaCallbackRouter.post("/meta/wa-signup/finish", async (req, res) => {
  try {
    const st = readState(req.body?.state);
    if (!st) return res.status(400).json({ error: "Link expirado. Tente de novo pelo Helora." });
    const ch = await connectEmbedded(st.accountId, req.body);
    res.status(201).json({ id: ch.id, name: ch.name });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export const metaRouter = Router();
metaRouter.use(requireAuth);
metaRouter.get("/status", (req, res) => res.json({ configured: metaConfigured(), appId: process.env.META_APP_ID || null, waConfigId: process.env.META_WA_CONFIG_ID || null, version: V() }));
metaRouter.get("/wa-signup-url", requireOwner, (req, res) => {
  if (!metaConfigured() || !process.env.META_WA_CONFIG_ID) return res.status(503).json({ error: "API oficial do WhatsApp ainda não configurada. Fale com o suporte Helora." });
  res.json({ url: `${BACKEND()}/meta/wa-signup?state=${encodeURIComponent(makeState(req.userId, req.accountId))}` });
});
metaRouter.get("/auth-url", requireOwner, (req, res) => {
  if (!metaConfigured()) return res.status(503).json({ error: "Conexão com o Facebook ainda não configurada. Fale com o suporte Helora." });
  const u = new URL(`https://www.facebook.com/${V()}/dialog/oauth`);
  // Login do Facebook para Empresas (login unificado): usa a configuração criada no app (META_LOGIN_CONFIG_ID)
  const cfg = process.env.META_LOGIN_CONFIG_ID;
  u.search = new URLSearchParams(cfg
    ? { client_id: process.env.META_APP_ID, redirect_uri: REDIRECT(), state: makeState(req.userId, req.accountId), config_id: cfg, response_type: "code", override_default_response_type: "true" }
    : { client_id: process.env.META_APP_ID, redirect_uri: REDIRECT(), state: makeState(req.userId, req.accountId), scope: SCOPES, response_type: "code" });
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
    if (!p.igOnly) out.push({ id: p.id, name: p.name, platform: "messenger", connected: !!(await findChannelByPage("messenger", p.id).catch(() => null)) });
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
    // Assina a Página (ou a conta do Instagram, no login unificado) para receber as mensagens no webhook do Helora
    if (page.igOnly) await graph(`/${page.ig.id}/subscribed_apps`, { subscribed_fields: "messages,messaging_postbacks,messaging_seen", access_token: page.token }, "POST").catch(() => {});
    else await graph(`/${page.id}/subscribed_apps`, { subscribed_fields: "messages,messaging_postbacks,message_reads", access_token: page.token }, "POST");
    const channel = await createChannel({
      accountId: req.accountId, platform, name: platform === "instagram" ? (page.ig.username ? `@${page.ig.username}` : page.name) : page.name,
      externalPageId: extId, accessToken: page.token
    });
    res.status(201).json(channel);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
