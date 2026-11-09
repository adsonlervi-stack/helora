import React, { useEffect, useRef, useState } from "react";

/**
 * "Carregando" ao trocar de aba: tela embaçada com o círculo no degradê do Helora.
 * Aparece só se a nova aba demorar mais de 250 ms para buscar os dados, e some sozinho (máx. 10 s).
 */
export default function PageLoader({ section }) {
  const [show, setShow] = useState(false);
  const watching = useRef(false);
  const timers = useRef([]);
  useEffect(() => {
    watching.current = true;
    timers.current.forEach(clearTimeout);
    const start = setTimeout(() => { if (watching.current && window.__heloraNet > 0) setShow(true); }, 250);
    const stop = setTimeout(() => { watching.current = false; setShow(false); }, 10000);
    const quiet = setTimeout(() => { if (!window.__heloraNet) { watching.current = false; setShow(false); } }, 400);
    timers.current = [start, stop, quiet];
    return () => timers.current.forEach(clearTimeout);
  }, [section]);
  useEffect(() => {
    const on = (e) => {
      window.__heloraNet = e.detail;
      if (!watching.current) return;
      if (e.detail > 0) { /* ainda carregando */ }
      else { const t = setTimeout(() => { if (!window.__heloraNet) { watching.current = false; setShow(false); } }, 120); timers.current.push(t); }
    };
    window.addEventListener("helora:net", on);
    return () => window.removeEventListener("helora:net", on);
  }, []);
  if (!show) return null;
  return (
    <div className="pl-wrap" aria-live="polite">
      <div className="pl-box">
        <span className="pl-ring" />
        <span className="pl-t">Carregando</span>
      </div>
    </div>
  );
}
