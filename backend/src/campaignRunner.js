/**
 * Executor de campanhas (disparo em massa).
 * - Uma mensagem por vez, com intervalo aleatório entre min_delay e max_delay segundos.
 * - Respeita o limite por hora da campanha.
 * - Cada mensagem enviada consome 1 crédito; sem crédito → campanha pausa.
 * - Sem WhatsApp conectado → campanha pausa.
 */
import {
  listRunnableCampaigns,
  nextPendingRecipient,
  markRecipient,
  countCampaign,
  sentInLastHour,
  updateCampaign,
  getCreditBalance,
  addCreditEntry,
  getPrimaryWhatsAppChannel
} from "./config/db.js";
import { resolveWhatsAppNumber, sendWhatsAppMessage, sendWhatsAppMediaUrl } from "./whatsapp/baileysClient.js";

const running = new Set(); // campanhas sendo processadas neste processo
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.round((a + Math.random() * (b - a)) * 1000);

function personalize(text, r) {
  const first = (r.name || "").trim().split(/\s+/)[0] || "";
  return String(text).replace(/\{nome\}/gi, first).replace(/\{telefone\}/gi, r.phone);
}

async function pause(c, reason) {
  await updateCampaign(c.accountId, c.id, { status: "paused", pause_reason: reason });
  console.log(`[Campanha ${c.id}] pausada: ${reason}`);
}

async function runCampaign(c) {
  running.add(c.id);
  try {
    if (c.status === "scheduled") {
      await updateCampaign(c.accountId, c.id, { status: "running", started_at: new Date().toISOString(), pause_reason: null });
      c.status = "running";
    }
    const channelId = await getPrimaryWhatsAppChannel(c.accountId);
    if (!channelId) return pause(c, "Nenhum WhatsApp cadastrado na empresa.");

    for (;;) {
      // pode ter sido pausada/cancelada pela tela
      const fresh = (await listRunnableCampaigns()).find((x) => x.id === c.id);
      if (!fresh || fresh.status !== "running") return;

      if ((await sentInLastHour(c.id)) >= (fresh.hourlyLimit || 120)) {
        await sleep(60000);
        continue;
      }
      if ((await getCreditBalance(c.accountId)) <= 0) return pause(c, "Créditos esgotados. Fale com a Helora para liberar mais.");

      const r = await nextPendingRecipient(c.id);
      if (!r) {
        const n = await countCampaign(c.id);
        await updateCampaign(c.accountId, c.id, { status: "done", sent: n.sent, failed: n.failed, finished_at: new Date().toISOString() });
        console.log(`[Campanha ${c.id}] concluída (${n.sent} enviadas, ${n.failed} falhas).`);
        return;
      }

      try {
        const jid = await resolveWhatsAppNumber(channelId, r.phone);
        const text = personalize(fresh.message, r);
        if (fresh.mediaUrl) await sendWhatsAppMediaUrl(channelId, jid, { url: fresh.mediaUrl, mediaType: fresh.mediaType, caption: text });
        else await sendWhatsAppMessage(channelId, jid, text);
        await markRecipient(r.id, "sent");
        await addCreditEntry(c.accountId, -1, "campaign", { reference: c.id });
      } catch (err) {
        const msg = err.message || "Falha no envio";
        if (/não está conectado/i.test(msg)) return pause(c, "WhatsApp desconectado. Reconecte em Canais e retome a campanha.");
        await markRecipient(r.id, "failed", msg.slice(0, 200));
      }

      const n = await countCampaign(c.id);
      await updateCampaign(c.accountId, c.id, { sent: n.sent, failed: n.failed });
      await sleep(rand(fresh.minDelay || 15, fresh.maxDelay || 45));
    }
  } catch (err) {
    console.error(`[Campanha ${c.id}] erro:`, err.message);
  } finally {
    running.delete(c.id);
  }
}

export function startCampaignDispatcher() {
  const tick = async () => {
    try {
      for (const c of await listRunnableCampaigns()) {
        if (!running.has(c.id)) runCampaign(c);
      }
    } catch (err) {
      console.error("[Campanhas] erro no despachante:", err.message);
    }
  };
  setInterval(tick, 30000);
  setTimeout(tick, 5000);
}
