"use client";

import { motion } from "framer-motion";

const COLORS = [
  "#818cf8", "#a78bfa", "#f472b6", "#fb923c",
  "#34d399", "#60a5fa", "#f87171", "#4ade80",
  "#fbbf24", "#2dd4bf", "#e879f9", "#f97316",
  "#06b6d4", "#84cc16", "#ec4899", "#14b8a6",
  "#6366f1", "#8b5cf6", "#d946ef", "#0ea5e9",
];

const MEDALS = ["🥇", "🥈", "🥉"];

type ContribMetric = "commits" | "files" | "lines" | "streak";

type Contributor = {
  name: string;
  email: string;
  commits: number;  // holds the active metric value
  percentage: number;
  firstCommit: string;
  lastCommit: string;
  activeDays: number;
};

type Props = {
  contributors: Contributor[];
  period?: string;
  measuredFrom?: string;
  measuredTo?: string;
  metric?: ContribMetric;
  getDisplayName?: (name: string) => string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function periodLabel(period?: string): string {
  if (!period || period === "All") return "all time";
  if (period === "1Y") return "past year";
  if (period === "6M") return "past 6 months";
  if (period === "3M") return "past 3 months";
  return period;
}

/** Abbreviated number for large values (lines/files) */
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function fmtMetricValue(value: number, metric?: ContribMetric): string {
  if (metric === "streak") return `${value.toLocaleString()} day${value !== 1 ? "s" : ""}`;
  if (metric === "lines") return fmtNum(value);
  return value.toLocaleString();
}

function metricRankedBy(metric?: ContribMetric, measuredFrom?: string, measuredTo?: string, period?: string): string {
  if (metric === "files") return "all time · ranked by files changed";
  if (metric === "lines") return "all time · ranked by lines changed";
  const label = metric === "streak" ? "streak" : "commits";
  if (measuredFrom && measuredTo) return `${measuredFrom} – ${measuredTo} · ranked by ${label}`;
  return `Ranked by ${label} · ${periodLabel(period)}`;
}

export function Leaderboard({
  contributors,
  period,
  measuredFrom,
  measuredTo,
  metric = "commits",
  getDisplayName = (n) => n,
}: Props) {
  const max = contributors[0]?.commits ?? 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6, ease: [0.23, 1, 0.32, 1] }}
      className="glass rounded-2xl p-6"
    >
      <div className="mb-6">
        <h2 className="text-white font-semibold text-lg">Contributors</h2>
        <p className="text-white/40 text-sm mt-0.5">
          {metricRankedBy(metric, measuredFrom, measuredTo, period)}
        </p>
      </div>

      <div className="space-y-4">
        {contributors.map((c, i) => {
          const color = COLORS[i % COLORS.length]!;
          const barWidth = Math.round((c.commits / max) * 100);

          return (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.65 + i * 0.05,
                ease: [0.23, 1, 0.32, 1],
              }}
              className="group"
            >
              <div className="flex items-center gap-3 mb-1.5">
                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                  style={{
                    background: `${color}20`,
                    color,
                    border: `1px solid ${color}30`,
                  }}
                >
                  {initials(getDisplayName(c.name))}
                </div>

                {/* Name + rank */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm truncate">
                      {getDisplayName(c.name)}
                    </span>
                    {i < 3 && <span className="text-sm">{MEDALS[i]}</span>}
                  </div>
                  <div className="text-white/30 text-xs">
                    {c.firstCommit !== "—"
                      ? `active ${c.firstCommit}${c.firstCommit !== c.lastCommit ? ` – ${c.lastCommit}` : ""} · ${c.activeDays} day${c.activeDays !== 1 ? "s" : ""}`
                      : `${c.activeDays} day${c.activeDays !== 1 ? "s" : ""}`}
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-semibold tabular-nums" style={{ color }}>
                    {fmtMetricValue(c.commits, metric)}
                  </div>
                  {/* Percentage is meaningful for commits/files/lines; skip for streak */}
                  {metric !== "streak" && (
                    <div className="text-white/30 text-xs">{c.percentage}%</div>
                  )}
                </div>
              </div>

              {/* Bar */}
              <div className="ml-11 h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${barWidth}%` }}
                  transition={{
                    duration: 0.8,
                    delay: 0.7 + i * 0.05,
                    ease: [0.23, 1, 0.32, 1],
                  }}
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${color} 0%, ${color}80 100%)`,
                  }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
