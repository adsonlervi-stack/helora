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
const makeState = (userId, accountId, aba = "") => { const v = `${userId}.${accountId}.${Date.now()}.${String(aba).replace(/[^a-z]/g, "")}`; return `${v}.${sign(v)}`; };
function readState(state) {
  const parts = String(state || "").split(".");
  if (parts.length !== 4 && parts.length !== 5) return null;
  const v = parts.slice(0, parts.length - 1).join(".");
  if (sign(v) !== parts[parts.length - 1] || Date.now() - Number(parts[2]) > 15 * 60 * 1000) return null;
  return { userId: parts[0], accountId: parts[1], aba: parts.length === 5 ? parts[3] : "" };
}
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

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

export async function accessTokenFor(userId) {
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

/** Horários ocupados na agenda Google do usuário entre duas datas: [[início, fim], …] em ms. */
export async function googleBusy(userId, from, to) {
  if (!googleConfigured()) return [];
  const token = await accessTokenFor(userId).catch(() => null);
  if (!token) return [];
  const u = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  u.searchParams.set("timeMin", new Date(from).toISOString());
  u.searchParams.set("timeMax", new Date(to).toISOString());
  u.searchParams.set("singleEvents", "true");
  u.searchParams.set("maxResults", "100");
  const r = await fetch(u, { headers: { authorization: `Bearer ${token}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return [];
  return (d.items || []).filter((e) => e.status !== "cancelled" && e.transparency !== "transparent" && e.start?.dateTime)
    .map((e) => [new Date(e.start.dateTime).getTime(), new Date(e.end?.dateTime || e.start.dateTime).getTime()]);
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
  const st = readState(req.query.state);
  const back = (ok, msg) => res.redirect(`${FRONT() || "/"}/?${st?.aba ? `aba=${st.aba}&` : ""}google=${ok ? "ok" : "erro"}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}`);
  try {
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
  let drive = false;
  if (data?.refresh_token && req.query.scopes) {
    try {
      const tok = await accessTokenFor(req.userId);
      const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${tok}`).then((r) => r.json());
      drive = String(info.scope || "").includes("drive");
    } catch {}
  }
  res.json({ configured: googleConfigured(), connected: !!data?.refresh_token, email: data?.email || null, drive });
});
googleRouter.get("/auth-url", (req, res) => {
  if (!googleConfigured()) return res.status(503).json({ error: "Integração com o Google ainda não configurada. Peça ao suporte Helora." });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: REDIRECT(), response_type: "code", scope: req.query.drive ? `${SCOPES} ${DRIVE_SCOPE}` : SCOPES,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: makeState(req.userId, req.accountId, req.query.aba || "")
  }).toString();
  res.json({ url: url.toString() });
});
googleRouter.delete("/", async (req, res) => {
  await supabase.from("google_tokens").delete().eq("user_id", req.userId);
  res.sendStatus(204);
});

/* ---------- Google Drive: escolher Docs, Planilhas, Apresentações e PDFs da própria conta para o Cérebro ---------- */
const DRIVE_TYPES = {
  "application/vnd.google-apps.document": { kind: "google_docs", export: "text/plain" },
  "application/vnd.google-apps.spreadsheet": { kind: "google_sheets", export: "text/csv" },
  "application/vnd.google-apps.presentation": { kind: "google_slides", export: "text/plain" },
  "application/pdf": { kind: "pdf" }
};
googleRouter.get("/drive/files", async (req, res) => {
  try {
    const token = await accessTokenFor(req.userId).catch(() => null);
    if (!token) return res.status(400).json({ error: "Conecte sua conta Google primeiro." });
    const types = req.query.type && DRIVE_TYPES[req.query.type] ? [req.query.type] : Object.keys(DRIVE_TYPES);
    const qs = [`(${types.map((t) => `mimeType='${t}'`).join(" or ")})`, "trashed=false"];
    const term = String(req.query.q || "").replace(/['\\]/g, " ").trim();
    if (term) qs.push(`name contains '${term}'`);
    const u = new URL("https://www.googleapis.com/drive/v3/files");
    u.search = new URLSearchParams({ q: qs.join(" and "), pageSize: "50", orderBy: "modifiedTime desc", fields: "files(id,name,mimeType,modifiedTime,iconLink,owners(displayName))", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
    const r = await fetch(u, { headers: { authorization: `Bearer ${token}` } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status === 403 ? 403 : 400).json({ error: r.status === 403 || r.status === 401 ? "Falta permissão do Google Drive. Clique em Entrar com Google de novo." : d?.error?.message || "Falha ao listar arquivos" });
    res.json((d.files || []).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, kind: DRIVE_TYPES[f.mimeType]?.kind, modifiedTime: f.modifiedTime, owner: f.owners?.[0]?.displayName || "" })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
googleRouter.post("/drive/import", async (req, res) => {
  try {
    const { fileId, name, mimeType, agentIds } = req.body || {};
    const t = DRIVE_TYPES[mimeType];
    if (!fileId || !t) return res.status(400).json({ error: "Arquivo inválido." });
    const token = await accessTokenFor(req.userId).catch(() => null);
    if (!token) return res.status(400).json({ error: "Conecte sua conta Google primeiro." });
    const url = t.export ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(t.export)}` : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(400).json({ error: "Não consegui ler o arquivo no Google Drive." });
    const { addDoc, readFile } = await import("./integrations/brain.js");
    let content;
    if (t.export) content = await r.text();
    else { const buf = Buffer.from(await r.arrayBuffer()); content = (await readFile(buf, name || "arquivo.pdf", mimeType)).content; }
    const link = `https://drive.google.com/open?id=${fileId}`;
    const out = await addDoc(req.accountId, { source: t.kind, title: name || "Arquivo do Google", url: link, ref: `gdrive:${fileId}`, content, createdBy: req.userId, agentIds: Array.isArray(agentIds) ? agentIds : undefined });
    res.status(201).json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
