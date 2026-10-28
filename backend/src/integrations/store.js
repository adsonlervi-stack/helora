// Conexões de cada empresa (chaves de IA, e-mail, Canva, formulários…).
// As chaves ficam só no servidor (tabela com RLS, lida com a service role) e nunca voltam inteiras para a tela.
import { supabase } from "../config/db.js";

const cache = new Map(); // accountId -> { at, map }
const TTL = 30000;

export async function integrationsOf(accountId) {
  if (!accountId) return {};
  const hit = cache.get(accountId);
  if (hit && Date.now() - hit.at < TTL) return hit.map;
  const { data, error } = await supabase.from("account_integrations").select("provider, config, status, connected_at, updated_at").eq("account_id", accountId);
  const map = {};
  if (!error) for (const r of data || []) map[r.provider] = r;
  cache.set(accountId, { at: Date.now(), map });
  return map;
}
export async function getIntegration(accountId, provider) {
  return (await integrationsOf(accountId))[provider] || null;
}
export async function saveIntegration(accountId, provider, config, status = "connected") {
  const row = { account_id: accountId, provider, config, status, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("account_integrations").upsert(row, { onConflict: "account_id,provider" });
  if (error) throw error;
  cache.delete(accountId);
}
export async function deleteIntegration(accountId, provider) {
  await supabase.from("account_integrations").delete().eq("account_id", accountId).eq("provider", provider);
  cache.delete(accountId);
}
/** "sk-abc…wxyz" — só para mostrar que existe uma chave salva. */
export const mask = (v) => {
  const s = String(v || "");
  if (!s) return "";
  return s.length <= 8 ? "••••" : `${s.slice(0, 4)}••••${s.slice(-4)}`;
};
