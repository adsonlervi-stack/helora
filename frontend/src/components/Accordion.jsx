import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function Accordion({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="accordion-item">
      <button className="accordion-header" onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <ChevronDown size={14} className={`accordion-chevron ${open ? "open" : ""}`} />
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}
