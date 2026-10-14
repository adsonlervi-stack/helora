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
  addReaction
} from "../config/db.js";
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

export async function sendWhatsAppMessage(channelId, jid, text) {
  const conn = connections.get(channelId);
  if (!conn?.sock) throw new Error("Este dispositivo de WhatsApp não está conectado.");
  const sent = await conn.sock.sendMessage(jid, { text });
  return sent?.key?.id || null;
}

export async function sendWhatsAppMedia(channelId, jid, { buffer, mediaType, mimetype, caption, fileName }) {
  const conn = connections.get(channelId);
  if (!conn?.sock) throw new Error("Este dispositivo de WhatsApp não está conectado.");

  const payload =
    mediaType === "image"
      ? { image: buffer, caption }
      : mediaType === "video"
        ? { video: buffer, caption }
        : mediaType === "audio"
          ? { audio: buffer, mimetype: "audio/ogg; codecs=opus", ptt: true }
          : { document: buffer, mimetype, fileName: fileName || "arquivo", caption };

  const sent = await conn.sock.sendMessage(jid, payload);
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

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const jid = msg.key.remoteJid;
      if (jid === "status@broadcast") continue;
      if (jid?.endsWith("@g.us")) continue; // ignora mensagens de grupo

      const mediaKey = Object.keys(msg.message).find((k) => MEDIA_TYPE_MAP[k]);
      let text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      let mediaUrl = null;
      let mediaType = null;

      if (mediaKey) {
        mediaType = MEDIA_TYPE_MAP[mediaKey];
        text = msg.message[mediaKey]?.caption || "";
        try {
          const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: pino({ level: "silent" }) });
          const ext = { image: "jpg", video: "mp4", document: "pdf", audio: "ogg" }[mediaType];
          mediaUrl = await uploadMedia({
            accountId,
            buffer,
            extension: ext,
            contentType: msg.message[mediaKey]?.mimetype || "application/octet-stream"
          });
        } catch (err) {
          console.error("[WhatsApp] Falha ao baixar mídia recebida:", err.message);
        }
      }

      if (!text && !mediaUrl) continue; // ignora tipos não suportados sem conteúdo

      const name = msg.pushName || jid;
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
        whatsappMessageId: msg.key.id
      });

      // O bot só reage a mensagens de texto (com ou sem legenda) — mídia
      // pura sem legenda não aciona o menu, só fica salva na conversa.
      if (text) {
        const reply = await handleIncoming(accountId, conversation, text);

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
