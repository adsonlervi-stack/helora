import React, { useEffect, useState } from "react";
import { X, MessageCircle, ArrowRightLeft, LifeBuoy, Bell } from "lucide-react";

const ICON = { message: MessageCircle, new: MessageCircle, pending: MessageCircle, transfer: ArrowRightLeft, support: LifeBuoy };

/** Avisos no canto inferior direito (nova mensagem, transferência, suporte). */
export default function NotifyToasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const on = (e) => {
      const id = Math.random().toString(36).slice(2);
      setList((l) => [...l.slice(-3), { id, ...e.detail }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 7000);
    };
    window.addEventListener("helora:toast-notify", on);
    return () => window.removeEventListener("helora:toast-notify", on);
  }, []);
  if (!list.length) return null;
  return (
    <div className="ntf-stack">
      {list.map((n) => {
        const I = ICON[n.type] || Bell;
        return (
          <div key={n.id} className="ntf" onClick={() => { n.onClick?.(); setList((l) => l.filter((x) => x.id !== n.id)); }}>
            <span className="ntf-ico"><I size={18} /></span>
            <div className="ntf-b"><strong>{n.title}</strong><span>{String(n.body || "").replace(/^\*([^*\n]{1,60}):\*\s*/, "$1: ").replace(/\*([^*\n]+)\*/g, "$1")}</span></div>
            <button onClick={(e) => { e.stopPropagation(); setList((l) => l.filter((x) => x.id !== n.id)); }}><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
