import crypto from "crypto";
import { supabase } from "./config/db.js";

/**
 * Webhooks de saída: a Helora avisa outros sistemas quando algo acontece.
 * Eventos: mensagem.recebida, mensagem.enviada, atendimento.finalizado, atendimento.reaberto,
 *          atendimento.transferido, atendimento.atribuido, lead.criado, lead.atualizado
 * Assinatura: cabeçalho X-Helora-Signature = HMAC-SHA256(corpo, segredo do webhook)
 */
export const WEBHOOK_EVENTS = [
  "mensagem.recebida", "mensagem.enviada", "atendimento.finalizado", "atendimento.reaberto",
  "atendimento.transferido", "atendimento.atribuido", "lead.criado", "lead.atualizado"
];
const cache = new Map(); // accountId -> { at, hooks }

async function hooksFor(accountId) {
  const hit = cache.get(accountId);
  if (hit && Date.now() - hit.at < 30000) return hit.hooks;
  const { data } = await supabase.from("webhooks").select("*").eq("account_id", accountId).eq("active", true);
  const hooks = data || [];
  cache.set(accountId, { at: Date.now(), hooks });
  return hooks;
}
export const invalidateWebhooks = (accountId) => cache.delete(accountId);

export async function emitEvent(accountId, event, data) {
  try {
    const hooks = (await hooksFor(accountId)).filter((h) => event === "teste" || !h.events?.length || h.events.includes(event));
    for (const h of hooks) {
      const body = JSON.stringify({ evento: event, empresaId: accountId, data: new Date().toISOString(), dados: data });
      const sig = crypto.createHmac("sha256", h.secret || "").update(body).digest("hex");
      fetch(h.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-helora-event": event, "x-helora-signature": sig },
        body,
        signal: AbortSignal.timeout(10000)
      })
        .then((r) => supabase.from("webhooks").update({ last_status: r.status, last_at: new Date().toISOString() }).eq("id", h.id))
        .catch((err) => supabase.from("webhooks").update({ last_status: 0, last_error: String(err.message).slice(0, 200), last_at: new Date().toISOString() }).eq("id", h.id));
    }
  } catch {}
}
