import React from "react";

export default function StatCard({ icon: Icon, iconBg, iconColor, value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: iconBg, color: iconColor }}>
        <Icon size={17} strokeWidth={2.2} />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
