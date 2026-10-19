import React, { useEffect } from "react";
import { X } from "lucide-react";

/** Folha modal no estilo Apple (iOS/macOS): título, conteúdo rolável e barra de ações fixa. */
export function Sheet({ title, subtitle, onClose, children, footer, width = 620 }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="ap-sheet-backdrop" onMouseDown={onClose}>
      <div className="ap-sheet" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="ap-sheet-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="ap-close" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="ap-sheet-body">{children}</div>
        {footer && <div className="ap-sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Grupo de linhas com título pequeno acima (como nos Ajustes do iPhone). */
export function Group({ title, hint, children }) {
  return (
    <section className="ap-group">
      {title && <div className="ap-group-title">{title}</div>}
      <div className="ap-group-box">{children}</div>
      {hint && <div className="ap-group-hint">{hint}</div>}
    </section>
  );
}

/** Linha: rótulo à esquerda, controle à direita. */
export function Row({ label, children, stack = false }) {
  return (
    <label className={`ap-row ${stack ? "stack" : ""}`}>
      <span className="ap-row-label">{label}</span>
      <span className="ap-row-control">{children}</span>
    </label>
  );
}

/** Interruptor estilo iOS. */
export function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      className={`ap-switch ${checked ? "on" : ""}`}
      onClick={(e) => { e.preventDefault(); onChange?.(!checked); }}
    >
      <span />
    </button>
  );
}

/** Botões no padrão Apple. */
export function Button({ variant = "primary", children, ...rest }) {
  return <button type="button" className={`ap-btn ${variant}`} {...rest}>{children}</button>;
}
