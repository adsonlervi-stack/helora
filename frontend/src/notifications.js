// Notificações do navegador + som (sem arquivo de áudio: gerado na hora).
const KEY = "helora_notify";

export const notifySupported = () => typeof window !== "undefined" && "Notification" in window;

export function notifyEnabled() {
  try {
    return localStorage.getItem(KEY) === "on" && notifySupported() && Notification.permission === "granted";
  } catch {
    return false;
  }
}

export async function enableNotify() {
  if (!notifySupported()) return false;
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  const ok = perm === "granted";
  try {
    localStorage.setItem(KEY, ok ? "on" : "off");
  } catch {}
  if (ok) playPing();
  return ok;
}

export function disableNotify() {
  try {
    localStorage.setItem(KEY, "off");
  } catch {}
}

let ctx;
const audio = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());

// 5 sons gerados na hora (sem arquivos): [frequência, início(s), duração(s), tipo]
export const SOUNDS = {
  ping: { label: "Ping", notes: [[880, 0, 0.25], [1320, 0.12, 0.3]] },
  gota: { label: "Gota", notes: [[1400, 0, 0.12, "sine", 600]] },
  sino: { label: "Sino", notes: [[1046, 0, 0.9], [1568, 0, 0.6], [2093, 0, 0.4]] },
  pop: { label: "Pop", notes: [[520, 0, 0.08, "triangle"], [780, 0.07, 0.1, "triangle"]] },
  alerta: { label: "Alerta", notes: [[740, 0, 0.14, "square"], [740, 0.2, 0.14, "square"], [988, 0.4, 0.22, "square"]] },
  nenhum: { label: "Sem som", notes: [] }
};

export function playSound(name = "ping") {
  const snd = SOUNDS[name] || SOUNDS.ping;
  if (!snd.notes.length) return;
  try {
    const c = audio();
    const t0 = c.currentTime;
    for (const [freq, start, dur, type = "sine", glideTo] of snd.notes) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0 + start);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + start + dur);
      const vol = type === "square" ? 0.06 : 0.18;
      gain.gain.setValueAtTime(0.0001, t0 + start);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.05);
    }
  } catch {}
}
export const playPing = () => playSound("ping");

// O que notificar e com qual som (cada usuário escolhe; fica salvo neste navegador)
export const NOTIFY_EVENTS = {
  message: { label: "Mensagem nova numa conversa minha", sound: "ping" },
  pending: { label: "Conversa nova na fila (Pendentes)", sound: "sino" },
  transfer: { label: "Conversa transferida para mim", sound: "alerta" },
  group: { label: "Mensagem em grupo", sound: "nenhum" },
  support: { label: "Resposta do suporte Helora", sound: "gota" }
};
const PREFS_KEY = "helora_notify_prefs";
export function getNotifyPrefs() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
  } catch {}
  const out = {};
  for (const [k, d] of Object.entries(NOTIFY_EVENTS)) out[k] = { on: saved[k]?.on ?? d.sound !== "nenhum", sound: saved[k]?.sound || d.sound };
  return out;
}
export function setNotifyPrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

/** Notifica um tipo de evento respeitando as escolhas do usuário. */
export function notifyEvent(type, title, body, onClick) {
  const p = getNotifyPrefs()[type];
  if (!p?.on) return;
  playSound(p.sound);
  if (!notifyEnabled() || (!document.hidden && document.hasFocus())) return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.png", tag: `${type}-${title}` });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {}
}

export function showNotification(title, body, onClick) {
  playPing();
  if (!notifyEnabled() || (!document.hidden && document.hasFocus())) return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.png", tag: title });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {}
}
