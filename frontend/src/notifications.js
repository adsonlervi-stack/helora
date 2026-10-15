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
export function playPing() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.18, t + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.3);
    });
  } catch {}
}

export function showNotification(title, body, onClick) {
  playPing();
  if (!notifyEnabled() || !document.hidden) return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.png", tag: title });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {}
}
