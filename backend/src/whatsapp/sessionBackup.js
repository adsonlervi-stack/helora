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

const hash = (s) => crypto.createHash("sha1").update(s).digest("hex");

export async function restoreSession(channelId, folder) {
  if (!tableOk) return false;
  if (fs.existsSync(path.join(folder, "creds.json"))) return true;
  const { data, error } = await supabase.from(TABLE).select("file, data").eq("channel_id", channelId);
  if (error) {
    if (/does not exist|relation/i.test(error.message)) tableOk = false;
    console.warn("[WhatsApp] restaurar sessão:", error.message);
    return false;
  }
  if (!data?.length || !data.some((r) => r.file === "creds.json")) return false;
  fs.mkdirSync(folder, { recursive: true });
  for (const r of data) {
    const safe = path.basename(r.file);
    fs.writeFileSync(path.join(folder, safe), r.data);
    lastHash.set(`${channelId}/${safe}`, hash(r.data));
  }
  console.log(`[WhatsApp] Sessão de ${channelId} restaurada do banco (${data.length} arquivos).`);
  return true;
}

async function backupNow(channelId, folder) {
  if (!tableOk || !fs.existsSync(folder)) return;
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
