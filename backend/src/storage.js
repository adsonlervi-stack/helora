import { supabase } from "./config/db.js";
import { v4 as uuid } from "uuid";

const MEDIA_BUCKET = "media";
const AVATAR_BUCKET = "avatars";

const readyBuckets = new Set();

/**
 * Garante que um bucket existe (roda uma vez por bucket, sob demanda).
 * Os buckets são públicos-por-URL: os arquivos não ficam listáveis, mas
 * quem tem o link consegue abrir — suficiente pra anexos de chat e fotos
 * de perfil.
 */
async function ensureBucket(bucket) {
  if (readyBuckets.has(bucket)) return;
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets || []).some((b) => b.name === bucket);
  if (!exists) {
    await supabase.storage.createBucket(bucket, { public: true });
  }
  readyBuckets.add(bucket);
}

/**
 * Faz upload de um buffer pro Storage, dentro de uma pasta por conta
 * (isolamento simples por account_id no próprio caminho do arquivo).
 *
 * @returns {Promise<string>} URL pública do arquivo
 */
export async function uploadMedia({ accountId, buffer, extension, contentType }) {
  await ensureBucket(MEDIA_BUCKET);
  const path = `${accountId}/${uuid()}.${extension}`;

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, buffer, {
    contentType,
    upsert: false
  });
  if (error) throw error;

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Faz upload da foto de perfil de um usuário. Usa sempre o mesmo caminho
 * (accountId/userId.ext) com upsert — trocar a foto substitui a anterior,
 * sem acumular lixo no Storage. Devolve a URL já com um parâmetro `v=`
 * (timestamp) pra furar cache de CDN/navegador assim que a foto troca.
 *
 * @returns {Promise<string>} URL pública da foto
 */
export async function uploadAvatar({ accountId, userId, buffer, extension, contentType }) {
  await ensureBucket(AVATAR_BUCKET);
  const path = `${accountId}/${userId}.${extension}`;

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true
  });
  if (error) throw error;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Arquivos do CRM ficam num bucket próprio (fora da limpeza de 90 dias dos anexos de chat). */
export async function uploadCrmFile({ accountId, buffer, extension, contentType }) {
  const bucket = "crm-files";
  await ensureBucket(bucket);
  const path = `${accountId}/${uuid()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, { contentType, upsert: false });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
export async function removeCrmFile(url) {
  const m = /\/object\/public\/crm-files\/(.+)$/.exec(String(url || "").split("?")[0]);
  if (m) await supabase.storage.from("crm-files").remove([decodeURIComponent(m[1])]).catch(() => {});
}
