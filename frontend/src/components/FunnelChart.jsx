import React from "react";

const STAGE_COLORS = {
  received: "#6e7a7a", // Pantone 445 C — neutro, ponto de entrada
  bot: "#2b82ea", // Pantone 2727 C — resolvido pelo bot
  escalated: "#dd8a1f", // transferido para humano
  resolved: "#1f9d6b" // concluído
};

export default function FunnelChart({ funnel }) {
  const base = funnel[0]?.value || 1;

  return (
    <div className="funnel">
      {funnel.map((stage, i) => {
        const pct = Math.round((stage.value / base) * 100);
        const widthPct = Math.max(pct, stage.value > 0 ? 6 : 2);
        const prev = funnel[i - 1];
        const dropPct = prev && prev.value > 0 ? Math.round((stage.value / prev.value) * 100) : null;

        return (
          <React.Fragment key={stage.key}>
            <div className="funnel-row">
              <div className="funnel-label">{stage.label}</div>
              <div className="funnel-track">
                <div
                  className="funnel-fill"
                  style={{
                    width: `${widthPct}%`,
                    background: STAGE_COLORS[stage.key] || "var(--accent)"
                  }}
                >
                  {stage.value > 0 ? `${pct}%` : ""}
                </div>
              </div>
              <div className="funnel-value">{stage.value}</div>
            </div>
            {dropPct !== null && (
              <div className="funnel-drop">
                {dropPct}% seguiu de "{prev.label}" para "{stage.label}"
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
