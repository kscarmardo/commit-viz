"use client";

import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";

type Props = {
  commitsByDate: Record<string, number>;
};

function computeVelocity(
  raw: Record<string, number>
): Array<{ date: string; commits: number; velocity: number }> {
  const sorted = Object.entries(raw)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, commits]) => ({ date, commits, velocity: 0 }));

  for (let i = 6; i < sorted.length; i++) {
    const window = sorted.slice(i - 6, i + 1);
    sorted[i]!.velocity =
      Math.round(
        (window.reduce((s, d) => s + d.commits, 0) / 7) * 10
      ) / 10;
  }

  // Only return last 90 days worth of data for clarity
  return sorted.slice(-90);
}

function VelocityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-bright rounded-xl p-3 shadow-xl">
      <div className="text-white/50 text-xs mb-1">
        {label ? format(parseISO(label), "MMM d, yyyy") : ""}
      </div>
      {payload.map((p) => (
        <div key={p.name} className="text-white text-sm font-medium">
          {p.value} {p.name === "velocity" ? "avg/day" : "commits"}
        </div>
      ))}
    </div>
  );
}

export function VelocityChart({ commitsByDate }: Props) {
  const data = computeVelocity(commitsByDate);
  const avg =
    data.length > 0
      ? Math.round((data.reduce((s, d) => s + d.commits, 0) / data.length) * 10) / 10
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.55, ease: [0.23, 1, 0.32, 1] }}
      className="glass rounded-2xl p-6"
    >
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-white font-semibold text-lg">Commit Velocity</h2>
          <p className="text-white/40 text-sm mt-0.5">7-day rolling average · last 90 days</p>
        </div>
        <div className="text-right">
          <div
            className="text-2xl font-thin text-white tabular-nums"
            style={{ letterSpacing: "-0.03em" }}
          >
            {avg}
          </div>
          <div className="text-white/35 text-xs">avg/day</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart
          data={data}
          margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="rawGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => format(parseISO(v), "MMM d")}
            tick={{ fill: "rgba(245,245,247,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={14}
          />
          <YAxis
            tick={{ fill: "rgba(245,245,247,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<VelocityTooltip />} />
          <ReferenceLine
            y={avg}
            stroke="rgba(255,255,255,0.15)"
            strokeDasharray="4 4"
          />
          <Area
            type="monotone"
            dataKey="commits"
            stroke="#818cf8"
            strokeWidth={1}
            strokeOpacity={0.4}
            fill="url(#rawGrad)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="velocity"
            stroke="#34d399"
            strokeWidth={2}
            fill="url(#velocityGrad)"
            dot={false}
            activeDot={{ r: 4, fill: "#34d399", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
