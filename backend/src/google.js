import crypto from "crypto";
import { Router } from "express";
import { supabase } from "./config/db.js";
import { requireAuth } from "./middleware/auth.js";

/**
 * Google Agenda + Meet (cada usuário conecta a própria conta Google).
 * Railway: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e (opcional) BACKEND_PUBLIC_URL.
 * No Google Cloud, cadastre o redirect: <BACKEND>/google/callback
 */
const BACKEND = () => (process.env.BACKEND_PUBLIC_URL || "https://backend-production-b42a.up.railway.app").replace(/\/$/, "");
const FRONT = () => (process.env.FRONTEND_ORIGIN || "").split(",")[0].replace(/\/$/, "");
const REDIRECT = () => `${BACKEND()}/google/callback`;
export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const SCOPES = "https://www.googleapis.com/auth/calendar.events openid email";

const sign = (v) => crypto.createHmac("sha256", process.env.GOOGLE_CLIENT_SECRET || "x").update(v).digest("hex").slice(0, 32);
const makeState = (userId, accountId) => { const v = `${userId}.${accountId}.${Date.now()}`; return `${v}.${sign(v)}`; };
function readState(state) {
  const parts = String(state || "").split(".");
  if (parts.length !== 4) return null;
  const v = parts.slice(0, 3).join(".");
  if (sign(v) !== parts[3] || Date.now() - Number(parts[2]) > 15 * 60 * 1000) return null;
  return { userId: parts[0], accountId: parts[1] };
}

async function tokenRequest(params) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error_description || data.error || "Falha no Google");
  return data;
}

async function accessTokenFor(userId) {
  const { data } = await supabase.from("google_tokens").select("refresh_token").eq("user_id", userId).maybeSingle();
  if (!data?.refresh_token) return null;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  return t.access_token;
}

/** Cria o evento na agenda Google do usuário (com link do Meet). Devolve { meetLink, eventId, htmlLink } ou null. */
export async function createGoogleEvent(userId, { title, startsAt, endsAt, description, attendeeEmail, meet = true }) {
  if (!googleConfigured()) return null;
  const token = await accessTokenFor(userId);
  if (!token) return null;
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 30 * 60000);
  const body = {
    summary: title,
    description: description || "",
    start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
    attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined
  };
  if (meet) body.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${attendeeEmail ? "all" : "none"}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const ev = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(ev?.error?.message || "Falha ao criar evento no Google");
  return { eventId: ev.id, htmlLink: ev.htmlLink, meetLink: ev.hangoutLink || ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri || null };
}

export async function deleteGoogleEvent(userId, eventId) {
  try {
    const token = await accessTokenFor(userId);
    if (!token || !eventId) return;
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  } catch {}
}

// Callback público do OAuth (o Google redireciona o navegador pra cá)
export const googleCallbackRouter = Router();
googleCallbackRouter.get("/google/callback", async (req, res) => {
  const back = (ok, msg) => res.redirect(`${FRONT() || "/"}/?google=${ok ? "ok" : "erro"}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}`);
  try {
    const st = readState(req.query.state);
    if (!st || !req.query.code) return back(false, "Link expirado. Tente conectar de novo.");
    const t = await tokenRequest({ grant_type: "authorization_code", code: req.query.code, redirect_uri: REDIRECT() });
    let email = null;
    try { email = JSON.parse(Buffer.from(String(t.id_token || "").split(".")[1] || "", "base64url").toString()).email || null; } catch {}
    const row = { user_id: st.userId, account_id: st.accountId, email, updated_at: new Date().toISOString() };
    if (t.refresh_token) row.refresh_token = t.refresh_token;
    const { error } = await supabase.from("google_tokens").upsert(row, { onConflict: "user_id" });
    if (error) throw error;
    back(true);
  } catch (err) {
    back(false, err.message);
  }
});

// Rotas autenticadas
export const googleRouter = Router();
googleRouter.use(requireAuth);
googleRouter.get("/status", async (req, res) => {
  const { data } = await supabase.from("google_tokens").select("email, refresh_token").eq("user_id", req.userId).maybeSingle().then((r) => r, () => ({ data: null }));
  res.json({ configured: googleConfigured(), connected: !!data?.refresh_token, email: data?.email || null });
});
googleRouter.get("/auth-url", (req, res) => {
  if (!googleConfigured()) return res.status(503).json({ error: "Integração com o Google ainda não configurada. Peça ao suporte Helora." });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: REDIRECT(), response_type: "code", scope: SCOPES,
    access_type: "offline", prompt: "consent", state: makeState(req.userId, req.accountId)
  }).toString();
  res.json({ url: url.toString() });
});
googleRouter.delete("/", async (req, res) => {
  await supabase.from("google_tokens").delete().eq("user_id", req.userId);
  res.sendStatus(204);
});
