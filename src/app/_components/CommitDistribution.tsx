"use client";

import { motion } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useState } from "react";

const COLORS = [
  "#818cf8", "#a78bfa", "#f472b6", "#fb923c",
  "#34d399", "#60a5fa", "#f87171", "#4ade80",
  "#fbbf24", "#2dd4bf", "#e879f9", "#f97316",
  "#06b6d4", "#84cc16", "#ec4899", "#14b8a6",
  "#6366f1", "#8b5cf6", "#d946ef", "#0ea5e9",
];

type ContribMetric = "commits" | "files" | "lines" | "streak";

type DistEntry = { name: string; value: number; percentage: number };

type Props = {
  distribution: DistEntry[];
  /** Total for the active metric (used in center label and tooltip) */
  total: number;
  metric?: ContribMetric;
  getDisplayName?: (name: string) => string;
};

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

const METRIC_LABELS: Record<ContribMetric, { subtitle: string; unit: string; centerLabel: string }> = {
  commits: { subtitle: "Commits by contributor",      unit: "commits",       centerLabel: "total commits"  },
  files:   { subtitle: "Files changed · all time",    unit: "file changes",  centerLabel: "file changes"   },
  lines:   { subtitle: "Lines changed · all time",    unit: "line changes",  centerLabel: "line changes"   },
  streak:  { subtitle: "Longest streak by contributor", unit: "day streak",  centerLabel: "streak days"    },
};

function CustomTooltip({
  active,
  payload,
  metric = "commits",
  getDisplayName = (n: string) => n,
}: {
  active?: boolean;
  payload?: Array<{ payload: DistEntry; name: string }>;
  metric?: ContribMetric;
  getDisplayName?: (name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const unit = METRIC_LABELS[metric].unit;
  return (
    <div className="glass-bright rounded-xl p-3 shadow-2xl">
      <div className="text-white font-semibold text-sm">{getDisplayName(d.name)}</div>
      <div className="text-white/50 text-xs mt-1">
        {metric === "lines" ? fmtNum(d.value) : d.value.toLocaleString()} {unit} · {d.percentage}%
      </div>
    </div>
  );
}

export function CommitDistribution({
  distribution,
  total,
  metric = "commits",
  getDisplayName = (n) => n,
}: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const labels = METRIC_LABELS[metric];

  const centerValue = activeIndex !== null
    ? `${distribution[activeIndex]?.percentage ?? 0}%`
    : metric === "lines" ? fmtNum(total) : total.toLocaleString();

  const centerSub = activeIndex !== null
    ? getDisplayName(distribution[activeIndex]?.name ?? "")
    : labels.centerLabel;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45, ease: [0.23, 1, 0.32, 1] }}
      className="glass rounded-2xl p-6 flex flex-col"
    >
      <div className="mb-5">
        <h2 className="text-white font-semibold text-lg">Distribution</h2>
        <p className="text-white/40 text-sm mt-0.5">{labels.subtitle}</p>
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={distribution}
              cx="50%"
              cy="50%"
              innerRadius={68}
              outerRadius={96}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {distribution.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={COLORS[index % COLORS.length]}
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.4}
                  style={{ transition: "opacity 0.2s" }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip metric={metric} getDisplayName={getDisplayName} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div
            className="text-3xl font-thin text-white tabular-nums"
            style={{ letterSpacing: "-0.04em" }}
          >
            {centerValue}
          </div>
          <div className="text-white/35 text-xs font-medium mt-1">{centerSub}</div>
        </div>
      </div>

      {/* Legend — top 8 + "Others" row so percentages always sum to ~100% */}
      <div className="mt-4 space-y-2">
        {distribution.slice(0, 8).map((entry, i) => (
          <div
            key={entry.name}
            className="flex items-center gap-2 group cursor-pointer"
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="text-white/60 text-xs truncate flex-1 group-hover:text-white/90 transition-colors">
              {getDisplayName(entry.name)}
            </span>
            <span className="text-white/40 text-xs tabular-nums font-medium">
              {entry.percentage}%
            </span>
          </div>
        ))}
        {distribution.length > 8 && (() => {
          const othersTotal = distribution.slice(8).reduce((s, d) => s + d.percentage, 0);
          return othersTotal > 0 ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-white/20" />
              <span className="text-white/35 text-xs flex-1">
                {distribution.length - 8} others
              </span>
              <span className="text-white/25 text-xs tabular-nums font-medium">
                {othersTotal}%
              </span>
            </div>
          ) : null;
        })()}
      </div>
    </motion.div>
  );
}
