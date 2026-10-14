import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

function formatDay(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

export default function MessagesChart({ data }) {
  const chartData = data.map((d) => ({ ...d, label: formatDay(d.date) }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="msgFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2b82ea" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2b82ea" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e2e4e6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#6e7a7a" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: "#6e7a7a" }} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #e2e4e6",
            fontSize: 12,
            fontFamily: "Inter, sans-serif"
          }}
          labelFormatter={(label) => `Dia: ${label}`}
          formatter={(value) => [value, "Mensagens"]}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#2b82ea"
          strokeWidth={2.4}
          fill="url(#msgFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
