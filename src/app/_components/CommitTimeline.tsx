"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
} from "recharts";
import { format, parseISO, subMonths } from "date-fns";
import { X } from "lucide-react";

const COLORS = [
  "#818cf8", "#a78bfa", "#f472b6", "#fb923c",
  "#34d399", "#60a5fa", "#f87171", "#4ade80",
  "#fbbf24", "#2dd4bf", "#e879f9", "#f97316",
  "#06b6d4", "#84cc16", "#ec4899", "#14b8a6",
  "#6366f1", "#8b5cf6", "#d946ef", "#0ea5e9",
];

type TimelineEntry = Record<string, string | number>;

type Props = {
  timeline: TimelineEntry[];
  topAuthors: string[];
  getDisplayName?: (name: string) => string;
  period: string;
  onPeriodChange: (p: string) => void;
};

const PERIODS = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
  { label: "All", months: 0 },
];

// Custom traveller (drag handle) for the Brush
function BrushTraveller(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  const { x = 0, y = 0, height = 0 } = props;
  // Guard against NaN coords that Recharts can pass before the container is measured
  if (!isFinite(x) || !isFinite(y) || !isFinite(height)) return null;
  const cx = x + 4;
  const cy = y + height / 2;
  return (
    <g>
      <rect
        x={x}
        y={y + 2}
        width={8}
        height={height - 4}
        rx={4}
        fill="#6366f1"
        stroke="rgba(99,102,241,0.4)"
        strokeWidth={1}
      />
      {/* Grip lines */}
      <line x1={cx} y1={cy - 4} x2={cx} y2={cy + 4} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={cx + 2} y1={cy - 4} x2={cx + 2} y2={cy + 4} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeLinecap="round" />
    </g>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  getDisplayName = (n: string) => n,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  getDisplayName?: (name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="glass-bright rounded-xl p-3 min-w-[160px] shadow-2xl">
      <div className="text-white/50 text-xs mb-2 font-medium">
        {label ? format(parseISO(label), "MMM d, yyyy") : ""}
      </div>
      <div className="text-white/40 text-xs mb-2">
        Total: <span className="text-white font-semibold">{total}</span>
      </div>
      {payload
        .filter((p) => p.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((p) => (
          <div key={p.name} className="flex items-center gap-2 py-0.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-white/70 text-xs truncate flex-1">{getDisplayName(p.name)}</span>
            <span className="text-white text-xs font-semibold tabular-nums">{p.value}</span>
          </div>
        ))}
    </div>
  );
}

type BrushRange = { startIndex: number; endIndex: number } | null;

export function CommitTimeline({ timeline, topAuthors, getDisplayName = (n) => n, period, onPeriodChange }: Props) {
  const [brushRange, setBrushRange] = useState<BrushRange>(null);

  const cutoff = PERIODS.find((p) => p.label === period)?.months ?? 0;
  const filtered =
    cutoff === 0
      ? timeline
      : timeline.filter((row) => {
          const d = parseISO(String(row.week));
          return d >= subMonths(new Date(), cutoff);
        });

  const handlePeriodChange = (label: string) => {
    onPeriodChange(label);
    setBrushRange(null); // reset brush when period changes
  };

  const handleBrushChange = useCallback(
    (range: { startIndex?: number; endIndex?: number }) => {
      if (range.startIndex === undefined || range.endIndex === undefined) return;
      // Only mark as "custom" if it's not the full range
      if (range.startIndex === 0 && range.endIndex === filtered.length - 1) {
        setBrushRange(null);
      } else {
        setBrushRange({ startIndex: range.startIndex, endIndex: range.endIndex });
      }
    },
    [filtered.length]
  );

  const clearBrush = () => setBrushRange(null);

  // Derive label for the selected range
  const rangeLabel = (() => {
    if (!brushRange || !filtered.length) return null;
    const start = filtered[brushRange.startIndex];
    const end = filtered[brushRange.endIndex];
    if (!start?.week || !end?.week) return null;
    return `${format(parseISO(String(start.week)), "MMM d, yyyy")} – ${format(parseISO(String(end.week)), "MMM d, yyyy")}`;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="glass rounded-2xl p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white font-semibold text-lg">Commit Timeline</h2>
          <p className="text-white/40 text-sm mt-0.5">
            {rangeLabel ? (
              <span className="text-indigo-400/80">{rangeLabel}</span>
            ) : (
              "Weekly commits per contributor · drag to zoom"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {brushRange && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={clearBrush}
              className="flex items-center gap-1 text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10"
            >
              <X className="w-3 h-3" />
              Reset zoom
            </motion.button>
          )}
        </div>
      </div>

      {/* Chart — key resets Brush position when period changes */}
      <ResponsiveContainer width="100%" height={340}>
        <AreaChart
          key={period}
          data={filtered}
          margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
        >
          <defs>
            {topAuthors.map((author, i) => (
              <linearGradient key={author} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.25} />
                <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="week"
            tickFormatter={(v: string) => format(parseISO(v), "MMM ''yy")}
            tick={{ fill: "rgba(245,245,247,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "rgba(245,245,247,0.35)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip getDisplayName={getDisplayName} />} />

          {topAuthors.map((author, i) => (
            <Area
              key={author}
              type="monotone"
              dataKey={author}
              stackId="1"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={1.5}
              fill={`url(#grad-${i})`}
              dot={false}
              activeDot={{ r: 4, fill: COLORS[i % COLORS.length], strokeWidth: 0 }}
            />
          ))}

          {filtered.length > 1 && (
            <Brush
              dataKey="week"
              height={32}
              travellerWidth={8}
              traveller={<BrushTraveller />}
              tickFormatter={(v: string) => {
                try { return format(parseISO(v), "MMM d"); } catch { return ""; }
              }}
              stroke="rgba(99,102,241,0.15)"
              fill="rgba(8,8,15,0.6)"
              onChange={handleBrushChange}
              startIndex={brushRange?.startIndex ?? 0}
              endIndex={brushRange?.endIndex ?? filtered.length - 1}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-1">
        {topAuthors.map((author, i) => (
          <div key={author} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="text-white/50 text-xs">{getDisplayName(author)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
