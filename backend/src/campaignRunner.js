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
import { cloudChannelRow, fetchTemplate, sendTemplateTo } from "./meta/waTemplates.js";

// Campanha com template da API oficial: a mensagem guarda "@@TPL@@" + JSON { name, language, map, headerMedia, buttons }
const TPL = "@@TPL@@";
export const campaignTemplate = (msg) => { try { return String(msg || "").startsWith(TPL) ? JSON.parse(String(msg).slice(TPL.length)) : null; } catch { return null; } };
/** Valor de uma variável ligada a um dado: primeiro nome, nome, telefone ou texto fixo. */
export function resolveVar(m, r) {
  if (!m) return "";
  const first = (r.name || "").trim().split(/\s+/)[0] || "";
  if (m.type === "first") return first || m.fallback || "cliente";
  if (m.type === "name") return r.name || m.fallback || "cliente";
  if (m.type === "phone") return r.phone || "";
  return personalize(m.value || "", r);
}
const resolveVars = (t, r) => ({
  header: (t.map?.header || []).map((m) => resolveVar(m, r)),
  body: (t.map?.body || []).map((m) => resolveVar(m, r)),
  buttons: Object.fromEntries(Object.entries(t.map?.buttons || {}).map(([k, m]) => [k, resolveVar(m, r)])),
  headerMedia: t.headerMedia
});

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
    const channelId = c.channelId || (await getPrimaryWhatsAppChannel(c.accountId));
    if (!channelId) return pause(c, "Nenhum WhatsApp cadastrado na empresa.");

    const tplCfg = campaignTemplate(c.message);
    let tplCh = null, tpl = null;
    if (tplCfg) {
      try { tplCh = await cloudChannelRow(c.accountId, channelId); tpl = await fetchTemplate(tplCh, tplCfg.name, tplCfg.language); }
      catch (e) { return pause(c, e.message); }
      if (!tpl) return pause(c, "Template não encontrado no WhatsApp oficial.");
      if (tpl.status !== "APPROVED") return pause(c, "O template ainda não foi aprovado pela Meta.");
    }
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
        if (tpl) {
          await sendTemplateTo(tplCh, r.phone, tpl, resolveVars(tplCfg, r));
          await markRecipient(r.id, "sent");
          await addCreditEntry(c.accountId, -1, "campaign", { reference: c.id });
          const n0 = await countCampaign(c.id);
          await updateCampaign(c.accountId, c.id, { sent: n0.sent, failed: n0.failed });
          await sleep(rand(Math.min(fresh.minDelay || 15, 3), Math.min(fresh.maxDelay || 45, 6)));
          continue;
        }
        const jid = await resolveWhatsAppNumber(channelId, r.phone);
        const versions = [fresh.message, ...(fresh.variants || [])].filter(Boolean);
        const text = personalize(versions[Math.floor(Math.random() * versions.length)], r);
        if (fresh.mediaUrl) await sendWhatsAppMediaUrl(channelId, jid, { url: fresh.mediaUrl, mediaType: fresh.mediaType, caption: text });
        else await sendWhatsAppMessage(channelId, jid, text);
        await markRecipient(r.id, "sent");
        await addCreditEntry(c.accountId, -1, "campaign", { reference: c.id });
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message || "Falha no envio";
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
