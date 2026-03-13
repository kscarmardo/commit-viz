"use client";

import { motion } from "framer-motion";
import {
  format,
  parseISO,
  subMonths,
  startOfWeek,
  addDays,
  eachWeekOfInterval,
  isFuture,
  isToday,
  differenceInMonths,
} from "date-fns";
import { useState, useRef, useEffect } from "react";

type Props = {
  commitsByDate: Record<string, number>;
  period: string;
  firstCommit?: string | null;
};

function getColor(count: number): string {
  if (count === 0) return "rgba(99,102,241,0.06)";
  if (count <= 2) return "rgba(99,102,241,0.28)";
  if (count <= 5) return "rgba(99,102,241,0.52)";
  if (count <= 10) return "rgba(99,102,241,0.75)";
  return "rgba(129,140,248,0.95)";
}

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const DAY_LABEL_WIDTH = 28; // px reserved for day-of-week labels
const CELL_GAP = 2;         // px gap between cells
const MIN_CELL = 8;         // smallest cell before horizontal scroll kicks in
const MAX_CELL = 28;        // largest cell (avoids absurdly tall grids for 3M)

function getMonths(period: string, firstCommit: string | null | undefined): number {
  if (period === "All") {
    if (firstCommit) {
      try {
        const months = differenceInMonths(new Date(), parseISO(firstCommit));
        return Math.max(12, months + 2); // include a little buffer
      } catch {
        return 36;
      }
    }
    return 36; // fallback: 3 years
  }
  const lookup: Record<string, number> = { "3M": 3, "6M": 6, "1Y": 12 };
  return lookup[period] ?? 12;
}

export function ContributionHeatmap({ commitsByDate, period, firstCommit }: Props) {
  const [tooltip, setTooltip] = useState<{
    date: string;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const today = new Date();
  const months = getMonths(period, firstCommit);
  const periodStart = subMonths(today, months);

  const weeks = eachWeekOfInterval(
    { start: startOfWeek(periodStart), end: today },
    { weekStartsOn: 0 }
  );

  // ── Responsive cell sizing ───────────────────────────────────────────────────
  // Fill available width with cells. If ideal size exceeds MAX_CELL, cap it and
  // right-align the grid so recent weeks always hug the right edge.
  // If ideal size < MIN_CELL, use MIN_CELL and allow horizontal scroll.
  const totalGaps = (weeks.length - 1) * CELL_GAP;
  const availableForCells = containerWidth > 0
    ? containerWidth - DAY_LABEL_WIDTH - CELL_GAP - totalGaps
    : 0;
  const idealCellSize = availableForCells > 0
    ? Math.floor(availableForCells / weeks.length)
    : 12;
  const cellSize = Math.max(MIN_CELL, Math.min(MAX_CELL, idealCellSize));
  const needsScroll = containerWidth > 0 && idealCellSize < MIN_CELL;

  // If cells are capped at MAX_CELL, right-align the grid by adding left padding
  const gridWidth = weeks.length * cellSize + totalGaps + DAY_LABEL_WIDTH + CELL_GAP;
  const leftPad = containerWidth > gridWidth ? containerWidth - gridWidth : 0;

  // ── Data ────────────────────────────────────────────────────────────────────
  const maxCount = Object.values(commitsByDate).reduce((m, c) => Math.max(m, c), 1);
  const totalInPeriod = Object.entries(commitsByDate)
    .filter(([d]) => { try { return parseISO(d) >= periodStart; } catch { return false; } })
    .reduce((s, [, c]) => s + c, 0);

  // ── Month / year labels ──────────────────────────────────────────────────────
  // At year boundaries (or the very first label), show the 4-digit year instead
  // of the month name so it's immediately clear which year each column belongs to.
  const monthLabels: Array<{ label: string; col: number; isYear: boolean }> = [];
  let lastMonth = -1;
  let lastYear = -1;
  weeks.forEach((weekStart, i) => {
    const m = weekStart.getMonth();
    const y = weekStart.getFullYear();
    if (m !== lastMonth) {
      const yearChanged = y !== lastYear;
      monthLabels.push({
        label: yearChanged ? format(weekStart, "yyyy") : format(weekStart, "MMM"),
        col: i,
        isYear: yearChanged,
      });
      lastMonth = m;
      if (yearChanged) lastYear = y;
    }
  });

  // ── Period description for subtitle ─────────────────────────────────────────
  const periodLabel =
    period === "All"  ? "all time" :
    period === "1Y"   ? "the past year" :
    period === "6M"   ? "the past 6 months" :
    period === "3M"   ? "the past 3 months" :
    `the past ${period}`;

  // ── Grid ────────────────────────────────────────────────────────────────────
  const grid = (
    <div style={{ paddingLeft: needsScroll ? 0 : leftPad }}>
      {/* Month / year labels row */}
      <div className="flex mb-1" style={{ paddingLeft: `${DAY_LABEL_WIDTH + CELL_GAP}px` }}>
        {weeks.map((_, i) => {
          const ml = monthLabels.find((m) => m.col === i);
          return (
            <div
              key={i}
              className="overflow-hidden font-medium"
              style={{
                width: `${cellSize}px`,
                flexShrink: 0,
                marginRight: i < weeks.length - 1 ? `${CELL_GAP}px` : 0,
                fontSize: ml?.isYear ? "9px" : "10px",
                color: ml?.isYear ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.30)",
                fontWeight: ml?.isYear ? 600 : 500,
                letterSpacing: ml?.isYear ? "0.02em" : undefined,
              }}
            >
              {ml?.label ?? ""}
            </div>
          );
        })}
      </div>

      {/* Grid body */}
      <div className="flex">
        {/* Day-of-week labels */}
        <div
          className="flex flex-col"
          style={{ gap: `${CELL_GAP}px`, width: `${DAY_LABEL_WIDTH}px`, flexShrink: 0, marginRight: `${CELL_GAP}px` }}
        >
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              className="text-[10px] text-white/30 font-medium flex items-center justify-end pr-1"
              style={{ height: `${cellSize}px` }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Week columns */}
        {weeks.map((weekStart, wi) => (
          <div
            key={wi}
            className="flex flex-col"
            style={{
              gap: `${CELL_GAP}px`,
              marginRight: wi < weeks.length - 1 ? `${CELL_GAP}px` : 0,
            }}
          >
            {Array.from({ length: 7 }, (_, di) => {
              const day = addDays(weekStart, di);
              if (isFuture(day) && !isToday(day)) {
                return (
                  <div
                    key={di}
                    style={{ width: `${cellSize}px`, height: `${cellSize}px`, background: "transparent" }}
                  />
                );
              }
              const dateStr = format(day, "yyyy-MM-dd");
              const count = commitsByDate[dateStr] ?? 0;
              return (
                <div
                  key={di}
                  className="rounded-sm cursor-pointer transition-transform hover:scale-125"
                  style={{
                    width: `${cellSize}px`,
                    height: `${cellSize}px`,
                    background: getColor(count),
                    boxShadow:
                      count > 0
                        ? `0 0 ${Math.min(count, 8)}px rgba(99,102,241,${Math.min(count / maxCount, 0.6)})`
                        : undefined,
                  }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({
                      date: format(day, "MMM d, yyyy"),
                      count,
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="glass rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-white font-semibold text-lg">Contribution Calendar</h2>
          <p className="text-white/40 text-sm mt-0.5">
            {totalInPeriod.toLocaleString()} commits in {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="flex items-center gap-1.5 text-white/30 text-xs">
            <span>Less</span>
            {[0, 1, 3, 6, 11].map((c) => (
              <div
                key={c}
                className="w-3 h-3 rounded-sm"
                style={{ background: getColor(c) }}
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>

      {/* Measurement wrapper — always fills card width */}
      <div ref={containerRef}>
        {needsScroll ? (
          <div className="overflow-x-auto">
            <div
              style={{
                minWidth: `${DAY_LABEL_WIDTH + CELL_GAP + weeks.length * (MIN_CELL + CELL_GAP)}px`,
              }}
            >
              {grid}
            </div>
          </div>
        ) : (
          grid
        )}
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none glass-bright rounded-lg px-3 py-2 text-xs shadow-xl -translate-x-1/2 -translate-y-full mt-[-8px]"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <span className="text-white font-semibold">
            {tooltip.count} commit{tooltip.count !== 1 ? "s" : ""}
          </span>
          <span className="text-white/50 ml-1">on {tooltip.date}</span>
        </div>
      )}
    </motion.div>
  );
}
