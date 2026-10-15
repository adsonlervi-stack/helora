import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient.js";

/**
 * "Digitando…" em tempo real entre duas pontas (ex.: suporte), via
 * Supabase Realtime broadcast. room = id da conversa; side = "admin" | "user".
 */
export function useTyping(room, side) {
  const [othersTyping, setOthersTyping] = useState(false);
  const chanRef = useRef(null);
  const lastSent = useRef(0);
  const timer = useRef(null);

  useEffect(() => {
    if (!room) return;
    const ch = supabase.channel(`typing:${room}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload?.side === side) return;
      setOthersTyping(!!payload?.typing);
      clearTimeout(timer.current);
      if (payload?.typing) timer.current = setTimeout(() => setOthersTyping(false), 5000);
    }).subscribe();
    chanRef.current = ch;
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(ch);
      chanRef.current = null;
      setOthersTyping(false);
    };
  }, [room, side]);

  const notify = useCallback(
    (typing = true) => {
      const now = Date.now();
      if (typing && now - lastSent.current < 2000) return;
      lastSent.current = typing ? now : 0;
      chanRef.current?.send({ type: "broadcast", event: "typing", payload: { side, typing } });
    },
    [side]
  );

  return { othersTyping, notify };
}

export function TypingDots({ label = "digitando" }) {
  return null;
}
