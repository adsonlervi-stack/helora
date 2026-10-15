// WhatsApp Cloud API (API oficial da Meta). Usado quando o canal tem provider = "cloud".
import axios from "axios";

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;
const toNumber = (jid) => String(jid || "").split("@")[0].split(":")[0];

async function post(ch, body) {
  const { data } = await axios.post(
    `${GRAPH()}/${ch.phoneNumberId}/messages`,
    { messaging_product: "whatsapp", recipient_type: "individual", ...body },
    { headers: { Authorization: `Bearer ${ch.accessToken}` }, timeout: 20000 }
  );
  return data?.messages?.[0]?.id || null;
}

export async function cloudSendText(ch, jid, text, { quotedWaId } = {}) {
  return post(ch, {
    to: toNumber(jid),
    type: "text",
    text: { body: text, preview_url: true },
    ...(quotedWaId ? { context: { message_id: quotedWaId } } : {})
  });
}

/** Mídia por link público (imagem, vídeo, documento, áudio, figurinha). */
export async function cloudSendMediaLink(ch, jid, { url, mediaType = "image", caption, fileName }) {
  const type = ["image", "video", "document", "audio", "sticker"].includes(mediaType) ? mediaType : "document";
  const media = { link: url };
  if (caption && ["image", "video", "document"].includes(type)) media.caption = caption;
  if (type === "document") media.filename = fileName || url.split("/").pop();
  return post(ch, { to: toNumber(jid), type, [type]: media });
}

export async function cloudSendLocation(ch, jid, { lat, lng, name, address }) {
  return post(ch, { to: toNumber(jid), type: "location", location: { latitude: lat, longitude: lng, name, address } });
}

export async function cloudSendContact(ch, jid, { name, phone }) {
  return post(ch, {
    to: toNumber(jid),
    type: "contacts",
    contacts: [{ name: { formatted_name: name, first_name: name }, phones: [{ phone: `+${phone}`, wa_id: phone, type: "CELL" }] }]
  });
}

export async function cloudReact(ch, jid, waId, emoji) {
  return post(ch, { to: toNumber(jid), type: "reaction", reaction: { message_id: waId, emoji: emoji || "" } });
}

export async function cloudMarkRead(ch, waId) {
  try {
    await axios.post(
      `${GRAPH()}/${ch.phoneNumberId}/messages`,
      { messaging_product: "whatsapp", status: "read", message_id: waId },
      { headers: { Authorization: `Bearer ${ch.accessToken}` } }
    );
  } catch {}
}

/** Baixa uma mídia recebida pela Cloud API (id da mídia → bytes). */
export async function cloudDownloadMedia(ch, mediaId) {
  const { data: meta } = await axios.get(`${GRAPH()}/${mediaId}`, { headers: { Authorization: `Bearer ${ch.accessToken}` } });
  const { data } = await axios.get(meta.url, { headers: { Authorization: `Bearer ${ch.accessToken}` }, responseType: "arraybuffer" });
  return { buffer: Buffer.from(data), mimetype: meta.mime_type };
}
