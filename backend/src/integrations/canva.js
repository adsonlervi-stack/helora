// Canva (Canva Connect API). Cada empresa conecta a própria conta Canva.
// O app do Helora no Canva é configurado uma vez no Railway: CANVA_CLIENT_ID, CANVA_CLIENT_SECRET
// (no portal do Canva, cadastrar o redirect: <BACKEND_PUBLIC_URL>/integrations/canva/callback).
import crypto from "crypto";
import { getIntegration, saveIntegration } from "./store.js";

const API = "https://api.canva.com/rest/v1";
const BACKEND = () => (process.env.BACKEND_PUBLIC_URL || "https://backend-production-b42a.up.railway.app").replace(/\/$/, "");
const FRONT = () => (process.env.FRONTEND_ORIGIN || "").split(",")[0].replace(/\/$/, "");
export const canvaRedirect = () => `${BACKEND()}/integrations/canva/callback`;
export const canvaConfigured = () => !!(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET);
const SCOPES = "design:meta:read design:content:read design:content:write asset:read asset:write profile:read";

const pending = new Map(); // state -> { accountId, verifier, at }
const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function canvaAuthUrl(accountId) {
  if (!canvaConfigured()) throw new Error("O Canva ainda não foi ativado no Helora (falta o app do Canva no servidor).");
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  for (const [k, v] of pending) if (Date.now() - v.at > 15 * 60000) pending.delete(k);
  pending.set(state, { accountId, verifier, at: Date.now() });
  const q = new URLSearchParams({
    code_challenge: challenge, code_challenge_method: "s256", scope: SCOPES, response_type: "code",
    client_id: process.env.CANVA_CLIENT_ID, state, redirect_uri: canvaRedirect()
  });
  return `https://www.canva.com/api/oauth/authorize?${q}`;
}

async function tokenRequest(params) {
  const basic = Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: new URLSearchParams(params)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.message || `Canva recusou (${r.status})`);
  return d;
}

/** Rota pública de retorno do Canva. */
export async function canvaCallback(req, res) {
  const back = (ok, msg) => res.redirect(`${FRONT() || ""}/?aba=connections&canva=${ok ? "ok" : "erro"}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}`);
  try {
    const st = pending.get(String(req.query.state || ""));
    pending.delete(String(req.query.state || ""));
    if (!st || !req.query.code) return back(false, "Link expirado. Tente conectar de novo.");
    const t = await tokenRequest({ grant_type: "authorization_code", code: req.query.code, code_verifier: st.verifier, redirect_uri: canvaRedirect() });
    let name = null;
    try {
      const me = await fetch(`${API}/users/me/profile`, { headers: { authorization: `Bearer ${t.access_token}` } }).then((r) => r.json());
      name = me?.profile?.display_name || null;
    } catch {}
    await saveIntegration(st.accountId, "canva", {
      accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000, name
    });
    back(true);
  } catch (err) {
    back(false, err.message);
  }
}

async function token(accountId) {
  const it = await getIntegration(accountId, "canva");
  if (!it?.config?.accessToken) throw new Error("Conecte o Canva na aba Conexões.");
  let c = it.config;
  if (Date.now() > (c.expiresAt || 0) - 60000 && c.refreshToken) {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: c.refreshToken });
    c = { ...c, accessToken: t.access_token, refreshToken: t.refresh_token || c.refreshToken, expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000 };
    await saveIntegration(accountId, "canva", c);
  }
  return c.accessToken;
}

async function call(accountId, path, { method = "GET", body, headers = {}, raw } = {}) {
  const tk = await token(accountId);
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${tk}`, ...(raw ? {} : body ? { "content-type": "application/json" } : {}), ...headers },
    body: raw || (body ? JSON.stringify(body) : undefined)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error?.message || `Canva: erro ${r.status}`);
  return d;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function listDesigns(accountId, query = "") {
  const q = new URLSearchParams({ limit: "30", ...(query ? { query } : {}) });
  const d = await call(accountId, `/designs?${q}`);
  return (d.items || []).map((x) => ({
    id: x.id, title: x.title || "Sem título", thumb: x.thumbnail?.url || null,
    editUrl: x.urls?.edit_url || null, viewUrl: x.urls?.view_url || null, updatedAt: x.updated_at ? x.updated_at * 1000 : null
  }));
}

/** Envia uma imagem para a biblioteca do Canva da empresa. Devolve o asset id. */
export async function uploadAsset(accountId, buffer, name = "imagem-helora.png") {
  const job = await call(accountId, "/asset-uploads", {
    method: "POST", raw: buffer,
    headers: { "content-type": "application/octet-stream", "Asset-Upload-Metadata": JSON.stringify({ name_base64: Buffer.from(name).toString("base64") }) }
  });
  let j = job.job;
  for (let i = 0; i < 20 && j?.status === "in_progress"; i++) { await sleep(1500); j = (await call(accountId, `/asset-uploads/${j.id}`)).job; }
  if (j?.status !== "success") throw new Error(j?.error?.message || "O Canva não terminou de receber a imagem.");
  return j.asset.id;
}

const SIZES = {
  post: { width: 1080, height: 1080, label: "Post (1080×1080)" },
  story: { width: 1080, height: 1920, label: "Story (1080×1920)" },
  carrossel: { width: 1080, height: 1350, label: "Carrossel (1080×1350)" },
  banner: { width: 1920, height: 1080, label: "Banner (1920×1080)" },
  a4: { width: 1240, height: 1754, label: "Folha A4" }
};
export const CANVA_SIZES = Object.entries(SIZES).map(([id, s]) => ({ id, label: s.label }));

/** Cria um design novo no Canva (com uma imagem, se vier) e devolve o link para editar. */
export async function createDesign(accountId, { title, size = "post", imageBuffer = null }) {
  const s = SIZES[size] || SIZES.post;
  let assetId = null;
  if (imageBuffer) assetId = await uploadAsset(accountId, imageBuffer, `${String(title || "helora").slice(0, 40)}.png`);
  const d = await call(accountId, "/designs", {
    method: "POST",
    body: { design_type: { type: "custom", width: s.width, height: s.height }, title: String(title || "Criado pela IA Helora").slice(0, 255), ...(assetId ? { asset_id: assetId } : {}) }
  });
  return { id: d.design?.id, editUrl: d.design?.urls?.edit_url || null, viewUrl: d.design?.urls?.view_url || null, title: d.design?.title };
}

/** Exporta o design (png/jpg/pdf) e devolve os links para baixar. */
export async function exportDesign(accountId, designId, format = "png") {
  const type = ["png", "jpg", "pdf"].includes(format) ? format : "png";
  const job = await call(accountId, "/exports", { method: "POST", body: { design_id: designId, format: { type } } });
  let j = job.job;
  for (let i = 0; i < 30 && j?.status === "in_progress"; i++) { await sleep(2000); j = (await call(accountId, `/exports/${j.id}`)).job; }
  if (j?.status !== "success") throw new Error(j?.error?.message || "O Canva não terminou a exportação. Tente de novo.");
  return j.urls || [];
}
