import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} from "baileys";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pino from "pino";

import {
  findOrCreateConversation,
  addMessage,
  updateConversation,
  setChannelStatus,
  listWhatsAppChannels,
  getMessageByWhatsAppId,
  addReaction,
  upsertContacts,
  setConversationAvatar,
  markConversationAsGroup,
  updateMessageStatusByWaId,
  markDeletedByWaId
} from "../config/db.js";
import { toWebp } from "../imageTools.js";

// Status do WhatsApp (proto WebMessageInfo.Status) -> tiques do painel
const WA_STATUS = { 1: "pending", 2: "sent", 3: "delivered", 4: "read", 5: "read" };

/** Texto de qualquer tipo de mensagem (pra mostrar o trecho citado). */
function textOf(m) {
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption || (m.imageMessage ? "📷 Foto" : "") ||
    m.videoMessage?.caption || (m.videoMessage ? "🎥 Vídeo" : "") ||
    (m.audioMessage ? "🎤 Áudio" : "") ||
    m.documentMessage?.fileName || (m.documentMessage ? "📄 Documento" : "") ||
    (m.contactMessage ? `👤 ${m.contactMessage.displayName || "Contato"}` : "") ||
    (m.locationMessage ? "📍 Localização" : "") ||
    (m.stickerMessage ? "Figurinha" : "")
  );
}

// Nome dos grupos (cache por 1h para não consultar o WhatsApp a cada mensagem)
const groupNames = new Map();
async function groupSubject(sock, jid) {
  const hit = groupNames.get(jid);
  if (hit && Date.now() - hit.at < 3600000) return hit.name;
  try {
    const meta = await sock.groupMetadata(jid);
    groupNames.set(jid, { name: meta.subject, at: Date.now() });
    return meta.subject;
  } catch {
    return hit?.name || "Grupo";
  }
}
import { handleIncoming } from "../bot/engine.js";
import { uploadMedia } from "../storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// No Railway, aponte SESSIONS_DIR pro volume persistente (ex: /data/sessions).
const SESSIONS_ROOT = process.env.SESSIONS_DIR || path.join(__dirname, "..", "..", "sessions");
fs.mkdirSync(SESSIONS_ROOT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sessionFolder = (channelId) => path.join(SESSIONS_ROOT, channelId);
const hasSavedSession = (channelId) => fs.existsSync(path.join(sessionFolder(channelId), "creds.json"));

// Uma conexão Baileys por DISPOSITIVO (não mais por conta — uma conta pode
// ter vários números de WhatsApp).
// channelId -> { sock, status, qr, pairingCode, phone, accountId, retries, stopped }
const connections = new Map();

const MEDIA_TYPE_MAP = {
  imageMessage: "image",
  videoMessage: "video",
  documentMessage: "document",
  audioMessage: "audio"
};

export function getWhatsAppStatus(channelId) {
  const conn = connections.get(channelId);
  if (!conn) return { status: "disconnected", qr: null, pairingCode: null, phone: null };
  return {
    status: conn.status,
    qr: conn.qr,
    pairingCode: conn.pairingCode || null,
    phone: conn.phone || null
  };
}

function liveSock(channelId) {
  const conn = connections.get(channelId);
  if (!conn?.sock || conn.status !== "connected") throw new Error("O WhatsApp deste canal está desconectado. Reconecte em Canais.");
  return conn.sock;
}

export async function sendWhatsAppMessage(channelId, jid, text, { quoted = null, forwarded = false } = {}) {
  const sock = liveSock(channelId);
  const content = forwarded ? { text, contextInfo: { isForwarded: true, forwardingScore: 1 } } : { text };
  const sent = await sock.sendMessage(jid, content, quoted ? { quoted } : undefined);
  return sent?.key?.id || null;
}

/** Envia qualquer conteúdo já montado (contato, localização...). */
export async function sendWhatsAppPayload(channelId, jid, payload) {
  const sent = await liveSock(channelId).sendMessage(jid, payload);
  return sent?.key?.id || null;
}

/** "Apagar para todos". */
export async function deleteWhatsAppMessage(channelId, jid, { id, fromMe = true }) {
  await liveSock(channelId).sendMessage(jid, { delete: { remoteJid: jid, id, fromMe } });
}

export async function sendWhatsAppMedia(channelId, jid, { buffer, mediaType, mimetype, caption, fileName, quoted = null }) {
  const conn = { sock: liveSock(channelId) };

  const payload =
    mediaType === "image"
      ? { image: buffer, caption }
      : mediaType === "video"
        ? { video: buffer, caption }
        : mediaType === "audio"
          ? { audio: buffer, mimetype: "audio/ogg; codecs=opus", ptt: true }
          : { document: buffer, mimetype, fileName: fileName || "arquivo", caption };

  const sent = await conn.sock.sendMessage(jid, payload, quoted ? { quoted } : undefined);
  return sent?.key?.id || null;
}

export async function sendWhatsAppReaction(channelId, jid, { id, fromMe }, emoji) {
  const conn = connections.get(channelId);
  if (!conn?.sock) throw new Error("Este dispositivo de WhatsApp não está conectado.");
  await conn.sock.sendMessage(jid, {
    react: { text: emoji || "", key: { remoteJid: jid, id, fromMe } }
  });
}

async function publishStatus(channelId) {
  const conn = connections.get(channelId);
  if (!conn) return;
  try {
    await setChannelStatus(channelId, { status: conn.status, qr: conn.qr });
  } catch (err) {
    console.error(`[Supabase] Falha ao gravar status do canal ${channelId}:`, err.message);
  }
}

/**
 * Desliga a conexão de um dispositivo.
 * - logout: avisa o WhatsApp (o aparelho some da lista "Aparelhos conectados")
 * - wipe: apaga a sessão salva em disco (o próximo connect gera QR novo)
 */
export async function stopWhatsAppForChannel(channelId, { logout = false, wipe = false } = {}) {
  const conn = connections.get(channelId);
  if (conn) {
    conn.stopped = true;
    clearTimeout(conn.reconnectTimer);
    if (logout) {
      try {
        await conn.sock?.logout();
      } catch {}
    }
    try {
      conn.sock?.end(undefined);
    } catch {}
    connections.delete(channelId);
  }
  if (wipe) {
    await fs.promises.rm(sessionFolder(channelId), { recursive: true, force: true });
  }
  await setChannelStatus(channelId, { status: "disconnected", qr: null }).catch(() => {});
}

/**
 * Botão "Conectar" do painel: se já está conectado não faz nada; senão
 * (re)abre a conexão — com sessão salva reconecta direto, sem sessão gera QR.
 */
export async function connectWhatsAppChannel(channelId, accountId) {
  const current = connections.get(channelId);
  if (current && (current.status === "connected" || current.qr || current.pairingCode)) return getWhatsAppStatus(channelId);
  await stopWhatsAppForChannel(channelId);
  await startWhatsAppForChannel(channelId, accountId);
  return getWhatsAppStatus(channelId);
}

/** "Gerar novo QR Code": descarta a sessão antiga e começa do zero. */
export async function resetWhatsAppChannel(channelId, accountId) {
  await stopWhatsAppForChannel(channelId, { logout: true, wipe: true });
  await startWhatsAppForChannel(channelId, accountId);
  return getWhatsAppStatus(channelId);
}

/**
 * Conectar pelo número (sem câmera): o WhatsApp devolve um código de 8
 * caracteres que a pessoa digita no celular em
 * Aparelhos conectados → Conectar aparelho → Conectar com número de telefone.
 */
export async function requestWhatsAppPairingCode(channelId, accountId, phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 15) {
    throw new Error("Número inválido. Use DDI + DDD + número, ex: 5584999998888.");
  }

  await stopWhatsAppForChannel(channelId, { logout: true, wipe: true });
  await startWhatsAppForChannel(channelId, accountId, { pairingPhone: digits });

  for (let i = 0; i < 40; i++) {
    const conn = connections.get(channelId);
    if (conn?.pairingCode) return getWhatsAppStatus(channelId);
    if (conn?.pairingError) throw new Error(conn.pairingError);
    await sleep(500);
  }
  throw new Error("O WhatsApp demorou para gerar o código. Tente de novo.");
}

export async function startWhatsAppForChannel(channelId, accountId, { pairingPhone = null, retries = 0 } = {}) {
  // Nunca deixa duas conexões vivas pro mesmo número (isso derruba a sessão).
  const previous = connections.get(channelId);
  if (previous) {
    previous.stopped = true;
    clearTimeout(previous.reconnectTimer);
    try {
      previous.sock?.end(undefined);
    } catch {}
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder(channelId));
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["Helora", "Chrome", "1.0.0"],
    markOnlineOnConnect: false
  });

  const conn = {
    sock,
    status: "connecting",
    qr: null,
    pairingCode: null,
    pairingError: null,
    phone: null,
    accountId,
    retries,
    pairingPhone,
    stopped: false,
    reconnectTimer: null
  };
  connections.set(channelId, conn);
  await publishStatus(channelId);

  sock.ev.on("creds.update", saveCreds);

  // ---------- Contatos: o WhatsApp manda a agenda ao vincular / sincronizar ----------
  const toContact = (c) => {
    const jid = c.phoneNumber || (c.id?.endsWith("@s.whatsapp.net") ? c.id : null);
    if (!jid) return null;
    return { phone: jid.split("@")[0].split(":")[0], name: c.name || null, pushName: c.notify || c.verifiedName || null };
  };
  const saveContacts = async (list) => {
    const items = (list || []).map(toContact).filter(Boolean);
    if (!items.length) return;
    conn.contactsSeen = (conn.contactsSeen || 0) + items.length;
    try {
      await upsertContacts(accountId, channelId, items, "whatsapp");
    } catch (err) {
      console.error(`[WhatsApp] Falha ao salvar contatos (${channelId}):`, err.message);
    }
  };
  sock.ev.on("contacts.upsert", saveContacts);
  sock.ev.on("contacts.update", (list) => saveContacts(list.filter((c) => c.name || c.notify)));
  sock.ev.on("messaging-history.set", ({ contacts }) => saveContacts(contacts));

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    // Ignora eventos de uma conexão antiga que já foi substituída/desligada.
    if (conn.stopped || connections.get(channelId) !== conn) return;

    if (qr) {
      if (conn.pairingPhone && !state.creds.registered) {
        // Modo "código pelo número": em vez de mostrar QR, pede o código.
        if (!conn.pairingCode && !conn.pairingRequested) {
          conn.pairingRequested = true;
          try {
            const code = await sock.requestPairingCode(conn.pairingPhone);
            conn.pairingCode = code?.match(/.{1,4}/g)?.join("-") || code;
          } catch (err) {
            conn.pairingError = `Não foi possível gerar o código: ${err.message}`;
          }
        }
        conn.qr = null;
      } else {
        conn.qr = await QRCode.toDataURL(qr);
      }
      conn.status = "connecting";
      await publishStatus(channelId);
    }

    if (connection === "open") {
      conn.status = "connected";
      conn.qr = null;
      conn.pairingCode = null;
      conn.pairingPhone = null;
      conn.retries = 0;
      conn.phone = (sock.user?.id || "").split(":")[0].split("@")[0] || null;
      await publishStatus(channelId);
      console.log(`[WhatsApp] Dispositivo ${channelId} conectado (${conn.phone}).`);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      conn.qr = null;

      // 1) Desconectado pelo celular: sessão inválida. Limpa pra que o
      //    próximo "Conectar" gere um QR novo sem ninguém mexer no servidor.
      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`[WhatsApp] Dispositivo ${channelId}: logout pelo celular. Sessão limpa.`);
        await stopWhatsAppForChannel(channelId, { wipe: true });
        return;
      }

      // 2) Ninguém escaneou o QR/código a tempo: para e espera o usuário
      //    clicar em "Conectar" de novo (não fica gerando QR pra sempre).
      if (!state.creds.registered && statusCode !== DisconnectReason.restartRequired) {
        console.log(`[WhatsApp] Dispositivo ${channelId}: QR/código expirou sem leitura.`);
        conn.stopped = true;
        connections.delete(channelId);
        await setChannelStatus(channelId, { status: "disconnected", qr: null }).catch(() => {});
        return;
      }

      // 3) Queda de rede/reinício: reconecta sozinho, com espera crescente.
      const nextRetries = conn.retries + 1;
      const delay = statusCode === DisconnectReason.restartRequired ? 0 : Math.min(30000, 1000 * 2 ** conn.retries);
      conn.status = "connecting";
      await publishStatus(channelId);
      console.log(`[WhatsApp] Dispositivo ${channelId}: caiu (código ${statusCode}). Reconectando em ${delay}ms.`);
      conn.reconnectTimer = setTimeout(() => {
        if (conn.stopped) return;
        startWhatsAppForChannel(channelId, accountId, { retries: nextRetries }).catch((err) =>
          console.error(`[WhatsApp] Falha ao reconectar ${channelId}:`, err.message)
        );
      }, delay);
    }
  });

  // Tiques: enviado / entregue / lido
  sock.ev.on("messages.update", async (updates) => {
    for (const u of updates || []) {
      const st = WA_STATUS[u.update?.status];
      if (st && u.key?.fromMe) updateMessageStatusByWaId(u.key.id, st).catch(() => {});
    }
  });
  sock.ev.on("message-receipt.update", async (updates) => {
    for (const u of updates || []) {
      const r = u.receipt || {};
      const st = r.readTimestamp || r.playedTimestamp ? "read" : r.receiptTimestamp ? "delivered" : null;
      if (st && u.key?.fromMe) updateMessageStatusByWaId(u.key.id, st).catch(() => {});
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message) continue;

      // Mensagem apagada ("apagar para todos") — pelo cliente ou pelo celular da empresa
      const proto = msg.message.protocolMessage;
      if (proto && proto.type === 0 && proto.key?.id) {
        markDeletedByWaId(accountId, proto.key.id, msg.key.fromMe ? "celular" : "cliente").catch(() => {});
        continue;
      }
      if (msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      if (jid === "status@broadcast") continue;
      const isGroup = !!jid?.endsWith("@g.us");

      // Resposta citada, contato e localização
      const inner = msg.message;
      const ctx =
        inner.extendedTextMessage?.contextInfo || inner.imageMessage?.contextInfo || inner.videoMessage?.contextInfo ||
        inner.documentMessage?.contextInfo || inner.audioMessage?.contextInfo || null;
      let quoted = null;
      if (ctx?.stanzaId) {
        const original = await getMessageByWhatsAppId(accountId, ctx.stanzaId).catch(() => null);
        quoted = {
          quotedId: original?.id || null,
          quotedText: original?.text || textOf(ctx.quotedMessage) || "Mensagem",
          quotedAuthor: original ? (original.direction === "out" ? "Você" : null) : null
        };
      }
      let extra = null;
      const cm = inner.contactMessage || inner.contactsArrayMessage?.contacts?.[0];
      if (cm) {
        const tel = /waid=(\d+)/.exec(cm.vcard || "")?.[1] || /TEL[^:]*:\+?([\d ()-]+)/.exec(cm.vcard || "")?.[1]?.replace(/\D/g, "");
        extra = { type: "contact", name: cm.displayName || "Contato", phone: tel || null };
      }
      const loc = inner.locationMessage || inner.liveLocationMessage;
      if (loc) extra = { type: "location", lat: loc.degreesLatitude, lng: loc.degreesLongitude, name: loc.name || null, address: loc.address || null };

      const mediaKey = Object.keys(msg.message).find((k) => MEDIA_TYPE_MAP[k]);
      let text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      let mediaUrl = null;
      let mediaType = null;

      if (mediaKey) {
        mediaType = MEDIA_TYPE_MAP[mediaKey];
        text = msg.message[mediaKey]?.caption || "";
        try {
          let buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: pino({ level: "silent" }) });
          let ext = { image: "jpg", video: "mp4", document: "pdf", audio: "ogg" }[mediaType];
          let contentType = msg.message[mediaKey]?.mimetype || "application/octet-stream";
          if (mediaType === "image") {
            const webp = await toWebp(buffer);
            if (webp) { buffer = webp; ext = "webp"; contentType = "image/webp"; }
          }
          mediaUrl = await uploadMedia({ accountId, buffer, extension: ext, contentType });
        } catch (err) {
          console.error("[WhatsApp] Falha ao baixar mídia recebida:", err.message);
        }
      }

      if (!text && !mediaUrl && !extra) continue; // ignora tipos não suportados sem conteúdo

      const name = isGroup ? await groupSubject(sock, jid) : msg.pushName || jid;
      // Em grupo, o texto vai com o nome de quem mandou ("Maria: oi")
      if (isGroup && text) text = `*${msg.pushName || (msg.key.participant || "").split("@")[0]}:* ${text}`;
      const phoneFromJid = (msg.key.senderPn || msg.key.remoteJidAlt || jid || "").split("@")[0].split(":")[0];
      if (/^\d{10,15}$/.test(phoneFromJid)) {
        upsertContacts(accountId, channelId, [{ phone: phoneFromJid, pushName: msg.pushName }], "conversa").catch(() => {});
      }
      const conversation = await findOrCreateConversation({
        accountId,
        platform: "whatsapp",
        externalId: jid,
        name,
        channelId
      });

      await addMessage({
        accountId,
        conversationId: conversation.id,
        direction: "in",
        author: "user",
        text,
        mediaUrl,
        mediaType,
        whatsappMessageId: msg.key.id,
        extra,
        ...(quoted || {}),
        ...(quoted && !quoted.quotedAuthor ? { quotedAuthor: name } : {})
      });

      // Grupo: marca a conversa como grupo e nunca aciona o bot.
      if (isGroup) {
        if (!conversation.isGroup || conversation.isNew) {
          await markConversationAsGroup(conversation.id, name).catch(() => {});
          if (conversation.isNew) await updateConversation(accountId, conversation.id, { isNew: false }).catch(() => {});
        }
        continue;
      }

      // O bot só reage a mensagens de texto (com ou sem legenda) — mídia
      // pura sem legenda não aciona o menu, só fica salva na conversa.
      if (text) {
        // O fluxo novo manda as mensagens uma a uma (com esperas) por aqui.
        const sendBot = async (t) => {
          const id = await sendWhatsAppMessage(channelId, jid, t);
          await addMessage({ accountId, conversationId: conversation.id, direction: "out", author: "bot", text: t, whatsappMessageId: id, status: "sent" });
        };
        let reply = null;
        try {
          reply = await handleIncoming(accountId, conversation, text, sendBot);
        } catch (err) {
          console.error(`[Bot] Erro ao processar mensagem (${conversation.id}):`, err.message);
        }

        if (conversation.isNew && !conversation.avatarUrl) {
          sock
            .profilePictureUrl(jid, "image")
            .then((url) => url && setConversationAvatar(conversation.id, url))
            .catch(() => {});
        }

        if (conversation.isNew) {
          await updateConversation(accountId, conversation.id, { isNew: false });
        }

        if (reply) {
          const replyId = await sendWhatsAppMessage(channelId, jid, reply);
          await addMessage({
            accountId,
            conversationId: conversation.id,
            direction: "out",
            author: "bot",
            text: reply,
            whatsappMessageId: replyId
          });
        }
      }
    }
  });

  // Reações que o cliente deu numa mensagem nossa (ou dele mesmo).
  sock.ev.on("messages.reaction", async (reactions) => {
    for (const r of reactions) {
      try {
        const message = await getMessageByWhatsAppId(accountId, r.key.id);
        if (message) {
          await addReaction(accountId, message.id, r.reaction?.text || null, "user");
        }
      } catch (err) {
        console.error("[WhatsApp] Falha ao salvar reação:", err.message);
      }
    }
  });

  return sock;
}

// Chamado uma vez, no boot do servidor: liga cada dispositivo de WhatsApp
// de cada conta ativa.
export async function startAllChannels() {
  const channels = await listWhatsAppChannels();
  console.log(`[WhatsApp] Iniciando ${channels.length} dispositivo(s)...`);
  for (const { channelId, accountId } of channels) {
    // Só religa quem já tinha sessão salva. Os demais esperam o "Conectar"
    // no painel (evita gerar dezenas de QR Codes que ninguém vai ler).
    if (!hasSavedSession(channelId)) continue;
    startWhatsAppForChannel(channelId, accountId).catch((err) => {
      console.error(`[WhatsApp] Erro ao iniciar dispositivo ${channelId}:`, err);
    });
  }
}


/**
 * Força o WhatsApp a reenviar a agenda (nomes salvos no celular) e grava
 * tudo na tabela de contatos. Retorna quantos contatos chegaram.
 */
export async function importWhatsAppContacts(channelId) {
  const conn = connections.get(channelId);
  if (!conn?.sock || conn.status !== "connected") throw new Error("Este WhatsApp não está conectado.");
  const before = conn.contactsSeen || 0;
  try {
    await conn.sock.resyncAppState(["critical_block", "critical_unblock_low", "regular_high", "regular_low", "regular"], true);
  } catch (err) {
    console.error(`[WhatsApp] Falha ao sincronizar agenda (${channelId}):`, err.message);
  }
  await sleep(4000);
  return { received: (conn.contactsSeen || 0) - before };
}

/** Confere se o número tem WhatsApp e devolve o JID oficial dele. */
export async function resolveWhatsAppNumber(channelId, phone) {
  const conn = connections.get(channelId);
  if (!conn?.sock || conn.status !== "connected") throw new Error("O WhatsApp desta empresa não está conectado.");
  const digits = String(phone || "").replace(/\D/g, "");
  const [result] = (await conn.sock.onWhatsApp(digits)) || [];
  if (!result?.exists) throw new Error("Esse número não tem WhatsApp.");
  return result.jid;
}

export async function fetchWhatsAppAvatar(channelId, jid) {
  const conn = connections.get(channelId);
  if (!conn?.sock) return null;
  try {
    return (await conn.sock.profilePictureUrl(jid, "image")) || null;
  } catch {
    return null;
  }
}


/** Envia mídia a partir de uma URL pública (campanhas e API). */
export async function sendWhatsAppMediaUrl(channelId, jid, { url, mediaType, caption }) {
  const conn = connections.get(channelId);
  if (!conn?.sock) throw new Error("Este dispositivo de WhatsApp não está conectado.");
  const payload =
    mediaType === "video" ? { video: { url }, caption } :
    mediaType === "document" ? { document: { url }, caption, fileName: url.split("/").pop() || "arquivo" } :
    { image: { url }, caption };
  const sent = await conn.sock.sendMessage(jid, payload);
  return sent?.key?.id || null;
}
