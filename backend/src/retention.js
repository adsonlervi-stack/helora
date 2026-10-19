import { supabase } from "./config/db.js";

/**
 * Política de retenção da Helora:
 *  - Conversas (e suas mensagens) ficam 120 dias depois da última mensagem.
 *  - Anexos (fotos, vídeos, áudios, documentos) ficam 90 dias.
 * Roda uma vez por dia. Prazos podem ser ajustados com RETENTION_CONVERSATION_DAYS / RETENTION_MEDIA_DAYS.
 */
const CONV_DAYS = () => parseInt(process.env.RETENTION_CONVERSATION_DAYS || "120", 10);
const MEDIA_DAYS = () => parseInt(process.env.RETENTION_MEDIA_DAYS || "90", 10);
const MEDIA_BUCKET = "media";
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

/** Caminho do arquivo no bucket a partir da URL pública do Supabase Storage. */
function storagePath(url) {
  const m = /\/storage\/v1\/object\/public\/media\/(.+)$/.exec(String(url || "").split("?")[0]);
  return m ? decodeURIComponent(m[1]) : null;
}

async function purgeMedia() {
  const cutoff = daysAgo(MEDIA_DAYS());
  let removed = 0;
  for (let round = 0; round < 40; round++) {
    const { data, error } = await supabase
      .from("messages")
      .select("id, media_url")
      .not("media_url", "is", null)
      .lt("timestamp", cutoff)
      .limit(500);
    if (error) throw error;
    if (!data.length) break;
    const paths = data.map((m) => storagePath(m.media_url)).filter(Boolean);
    if (paths.length) await supabase.storage.from(MEDIA_BUCKET).remove(paths).catch(() => {});
    const ids = data.map((m) => m.id);
    const { error: upErr } = await supabase.from("messages").update({ media_url: null, extra: { mediaExpired: true } }).in("id", ids);
    if (upErr) {
      // banco sem a coluna extra: limpa só o link
      await supabase.from("messages").update({ media_url: null }).in("id", ids);
    }
    removed += ids.length;
    if (data.length < 500) break;
  }
  return removed;
}

async function purgeConversations() {
  const cutoff = daysAgo(CONV_DAYS());
  let removed = 0;
  for (let round = 0; round < 40; round++) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id")
      .lt("last_message_at", cutoff)
      .limit(200);
    if (error) throw error;
    if (!data.length) break;
    const ids = data.map((c) => c.id);
    // Mensagens e notas saem em cascata (on delete cascade)
    const { error: delErr } = await supabase.from("conversations").delete().in("id", ids);
    if (delErr) throw delErr;
    removed += ids.length;
    if (data.length < 200) break;
  }
  return removed;
}

export async function runRetention() {
  const media = await purgeMedia().catch((e) => { console.error("[Retenção] anexos:", e.message); return 0; });
  const convs = await purgeConversations().catch((e) => { console.error("[Retenção] conversas:", e.message); return 0; });
  if (media || convs) console.log(`[Retenção] ${media} anexo(s) com mais de ${MEDIA_DAYS()} dias e ${convs} conversa(s) com mais de ${CONV_DAYS()} dias removidos.`);
  return { media, conversations: convs };
}

export function startRetentionJob() {
  if (process.env.RETENTION_DISABLED === "1") return;
  setTimeout(() => runRetention(), 5 * 60 * 1000); // 5 min depois de subir
  setInterval(() => runRetention(), 24 * 60 * 60 * 1000);
}
