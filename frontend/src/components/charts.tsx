"use client";
import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApp } from "@/lib/context";
type ChartRow = Record<string, string | number | null | undefined>;
export type Series = { key: string; name: string; color?: string };
const palette = ["#38bdf8", "#a78bfa", "#34d399", "#fb923c", "#f472b6"];
export function DataChart({
  data,
  series,
  kind = "area",
  height = 240,
  xKey = "label",
  suffix = "",
  domain,
}: {
  data: ChartRow[];
  series: Series[];
  kind?: "area" | "bar" | "line";
  height?: number;
  xKey?: string;
  suffix?: string;
  domain?: [number | string, number | string];
}) {
  const { theme } = useApp();
  const uid = useId().replaceAll(":", "");
  const color = theme === "dark" ? "#8496b1" : "#52657c";
  const common = (
    <>
      <CartesianGrid
        stroke="var(--border)"
        strokeDasharray="3 6"
        vertical={false}
      />
      <XAxis
        dataKey={xKey}
        tick={{ fill: color, fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        minTickGap={32}
        dy={8}
      />
      <YAxis
        width={42}
        tick={{ fill: color, fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        domain={domain || ["auto", "auto"]}
        tickFormatter={(v) => `${v}${suffix}`}
      />
      <Tooltip
        contentStyle={{
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--panel-solid)",
          color: "var(--text)",
          boxShadow: "0 12px 40px #0002",
          fontSize: 14,
        }}
        labelStyle={{ color: "var(--muted)" }}
        formatter={(value, name) => [
          typeof value === "number"
            ? `${Math.round(value * 10) / 10}${suffix}`
            : value,
          name,
        ]}
      />
      {series.length > 1 && (
        <Legend wrapperStyle={{ fontSize: 14, paddingTop: 20 }} />
      )}
    </>
  );
  return (
    <div
      className="chart"
      style={{ height }}
      role="img"
      aria-label={`${series.map((s) => s.name).join(", ")} chart`}
    >
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart
            data={data}
            margin={{ top: 12, right: 12, left: 0, bottom: 10 }}
          >
            {common}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color || palette[i]}
                radius={[5, 5, 0, 0]}
                maxBarSize={28}
              />
            ))}
          </BarChart>
        ) : kind === "line" ? (
          <LineChart
            data={data}
            margin={{ top: 12, right: 12, left: 0, bottom: 10 }}
          >
            {common}
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color || palette[i]}
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        ) : (
          <AreaChart
            data={data}
            margin={{ top: 12, right: 12, left: 0, bottom: 10 }}
          >
            <defs>
              {series.map((s, i) => (
                <linearGradient
                  id={`${uid}-${s.key}`}
                  key={s.key}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={s.color || palette[i]}
                    stopOpacity={0.32}
                  />
                  <stop
                    offset="100%"
                    stopColor={s.color || palette[i]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            {common}
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color || palette[i]}
                strokeWidth={2.5}
                fill={`url(#${uid}-${s.key})`}
                connectNulls={false}
              />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
