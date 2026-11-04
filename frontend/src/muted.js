// Conversas e grupos silenciados pelo usuário: sem som, sem notificação e sem push.
import { api } from "./api.js";

let ids = new Set();
const subs = new Set();
const emit = () => subs.forEach((f) => f(ids));

export const isMuted = (id) => !!id && ids.has(id);
export function subscribeMuted(fn) { subs.add(fn); return () => subs.delete(fn); }
export async function loadMuted() {
  try { ids = new Set((await api.get("/muted")).data || []); emit(); } catch { /* sem rede: segue sem silenciados */ }
}
export async function setMuted(id, muted) {
  const before = new Set(ids);
  muted ? ids.add(id) : ids.delete(id);
  ids = new Set(ids); emit();
  try { ids = new Set((await api.put(`/muted/${id}`, { muted })).data || []); emit(); }
  catch (e) { ids = before; emit(); throw e; }
}
/** Hook simples para re-renderizar quando a lista muda. */
import { useEffect, useState } from "react";
export function useMuted() {
  const [, set] = useState(0);
  useEffect(() => subscribeMuted(() => set((n) => n + 1)), []);
  return isMuted;
}
