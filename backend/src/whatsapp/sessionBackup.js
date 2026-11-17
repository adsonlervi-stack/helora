// Guarda a sessão do WhatsApp (pasta do Baileys) também no banco.
// O disco do Railway é apagado a cada deploy/reinício: sem isso o número
// "desconecta" e pede QR de novo. Ao subir, a pasta é restaurada do banco.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { supabase } from "../config/db.js";

const TABLE = "wa_sessions";
const lastHash = new Map(); // channelId/file -> hash já salvo
const timers = new Map();
let tableOk = true;
// Cada processo do servidor tem um id. Durante um deploy o Railway deixa o processo antigo e o novo
// rodando juntos por alguns segundos; os dois abrindo o mesmo número derrubam a sessão (erro 440)
// e o antigo podia gravar chaves velhas por cima das novas. O "dono" da sessão fica no banco.
export const INSTANCE_ID = `${process.env.RAILWAY_DEPLOYMENT_ID || "local"}-${process.pid}-${Date.now()}`;
const OWNER_FILE = "__owner";
export async function claimSession(channelId) {
  if (!tableOk) return;
  await supabase.from(TABLE).upsert({ channel_id: channelId, file: OWNER_FILE, data: INSTANCE_ID, updated_at: new Date().toISOString() }, { onConflict: "channel_id,file" }).then(() => {}, () => {});
}
export async function sessionOwner(channelId) {
  if (!tableOk) return null;
  const { data } = await supabase.from(TABLE).select("data").eq("channel_id", channelId).eq("file", OWNER_FILE).maybeSingle();
  return data?.data || null;
}
export async function ownsSession(channelId) {
  const o = await sessionOwner(channelId).catch(() => null);
  return !o || o === INSTANCE_ID;
}

const hash = (s) => crypto.createHash("sha1").update(s).digest("hex");

export async function restoreSession(channelId, folder) {
  if (!tableOk) return false;
  if (fs.existsSync(path.join(folder, "creds.json"))) return true;
  // O banco devolve no máximo 1000 linhas por vez: busca em páginas (uma sessão tem milhares de arquivos)
  const data = [];
  for (let page = 0; page < 100; page++) {
    const { data: rows, error } = await supabase.from(TABLE).select("file, data").eq("channel_id", channelId)
      .order("file").range(page * 1000, page * 1000 + 999);
    if (error) {
      if (/does not exist|relation/i.test(error.message)) tableOk = false;
      console.warn("[WhatsApp] restaurar sessão:", error.message);
      return false;
    }
    data.push(...(rows || []));
    if (!rows || rows.length < 1000) break;
  }
  const files = data.filter((r) => r.file !== OWNER_FILE);
  if (!files.length || !files.some((r) => r.file === "creds.json")) return false;
  fs.mkdirSync(folder, { recursive: true });
  for (const r of files) {
    const safe = path.basename(r.file);
    fs.writeFileSync(path.join(folder, safe), r.data);
    lastHash.set(`${channelId}/${safe}`, hash(r.data));
  }
  console.log(`[WhatsApp] Sessão de ${channelId} restaurada do banco (${files.length} arquivos).`);
  return true;
}

async function backupNow(channelId, folder) {
  if (!tableOk || !fs.existsSync(folder)) return;
  // Outro processo assumiu este número: não grava por cima da sessão dele
  if (!(await ownsSession(channelId))) return;
  const rows = [];
  for (const file of fs.readdirSync(folder)) {
    if (!file.endsWith(".json")) continue;
    let content;
    try { content = fs.readFileSync(path.join(folder, file), "utf8"); } catch { continue; }
    const h = hash(content);
    const k = `${channelId}/${file}`;
    if (lastHash.get(k) === h) continue;
    rows.push({ channel_id: channelId, file, data: content, updated_at: new Date().toISOString() });
    lastHash.set(k, h);
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from(TABLE).upsert(rows.slice(i, i + 200), { onConflict: "channel_id,file" });
    if (error) {
      if (/does not exist|relation/i.test(error.message)) tableOk = false;
      console.warn("[WhatsApp] backup da sessão:", error.message);
      rows.slice(i).forEach((r) => lastHash.delete(`${channelId}/${r.file}`));
      return;
    }
  }
}

/** Agenda um backup (junta várias gravações seguidas num envio só). */
export function scheduleBackup(channelId, folder, wait = 3000) {
  clearTimeout(timers.get(channelId));
  timers.set(channelId, setTimeout(() => {
    timers.delete(channelId);
    backupNow(channelId, folder).catch((e) => console.warn("[WhatsApp] backup:", e.message));
  }, wait));
}

export async function deleteSessionBackup(channelId) {
  clearTimeout(timers.get(channelId));
  for (const k of [...lastHash.keys()]) if (k.startsWith(`${channelId}/`)) lastHash.delete(k);
  if (!tableOk) return;
  await supabase.from(TABLE).delete().eq("channel_id", channelId).then(() => {}, () => {});
}

export async function hasBackup(channelId) {
  if (!tableOk) return false;
  const { data } = await supabase.from(TABLE).select("file").eq("channel_id", channelId).eq("file", "creds.json").limit(1);
  return !!data?.length;
}

/** Grava agora (usado ao desligar o servidor). */
export async function flushBackup(channelId, folder) {
  clearTimeout(timers.get(channelId)); timers.delete(channelId);
  await backupNow(channelId, folder).catch(() => {});
}
