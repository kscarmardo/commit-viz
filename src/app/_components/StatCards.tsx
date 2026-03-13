"use client";

import { motion } from "framer-motion";
import { GitCommitHorizontal, Users, Calendar, Flame, FileCode2, Diff } from "lucide-react";
import { format, parseISO } from "date-fns";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

type Props = {
  totalCommits: number;
  uniqueContributors: number;
  activeDays: number;
  longestStreak: number;
  firstCommit: string | null;
  lastCommit: string | null;
  /** Pre-formatted period start label, e.g. "Jan 2024" — takes priority over firstCommit */
  measuredFrom?: string;
  /** Pre-formatted period end label, e.g. "Mar 2026" — takes priority over lastCommit */
  measuredTo?: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
      className="glass rounded-2xl p-6 flex flex-col gap-4 hover:bg-white/[0.06] transition-colors duration-300"
    >
      <div className="flex items-center justify-between">
        <span className="text-white/40 text-xs font-medium uppercase tracking-widest">
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${color}20` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div>
        <div
          className="text-4xl font-thin tracking-tight tabular-nums"
          style={{ letterSpacing: "-0.04em" }}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {sub && (
          <div className="text-white/35 text-xs mt-1.5 font-medium">{sub}</div>
        )}
      </div>
      <div
        className="h-px w-full"
        style={{
          background: `linear-gradient(90deg, ${color}40 0%, transparent 100%)`,
        }}
      />
    </motion.div>
  );
}

function LinesCard({
  linesAdded,
  linesRemoved,
  delay,
}: {
  linesAdded: number;
  linesRemoved: number;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
      className="glass rounded-2xl p-6 flex flex-col gap-4 hover:bg-white/[0.06] transition-colors duration-300"
    >
      <div className="flex items-center justify-between">
        <span className="text-white/40 text-xs font-medium uppercase tracking-widest">
          Lines Changed
        </span>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#c084fc20" }}>
          <Diff className="w-4 h-4" style={{ color: "#c084fc" }} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2" title={`+${linesAdded.toLocaleString()} lines added`}>
          <span
            className="text-4xl font-thin tabular-nums"
            style={{ letterSpacing: "-0.04em", color: "#34d399" }}
          >
            +{fmt(linesAdded)}
          </span>
          <span className="text-white/30 text-xs">added</span>
        </div>
        <div className="flex items-baseline gap-2" title={`-${linesRemoved.toLocaleString()} lines removed`}>
          <span
            className="text-4xl font-thin tabular-nums"
            style={{ letterSpacing: "-0.04em", color: "#f87171" }}
          >
            -{fmt(linesRemoved)}
          </span>
          <span className="text-white/30 text-xs">removed</span>
        </div>
      </div>
      <div
        className="h-px w-full"
        style={{
          background: "linear-gradient(90deg, #c084fc40 0%, transparent 100%)",
        }}
      />
    </motion.div>
  );
}

export function StatCards({
  totalCommits,
  uniqueContributors,
  activeDays,
  longestStreak,
  firstCommit,
  lastCommit,
  measuredFrom,
  measuredTo,
  filesChanged,
  linesAdded,
  linesRemoved,
}: Props) {
  // Use pre-formatted period labels when available (period-filtered view),
  // falling back to the all-time project range from firstCommit/lastCommit.
  const dateRange =
    measuredFrom && measuredTo
      ? `${measuredFrom} – ${measuredTo}`
      : firstCommit && lastCommit
      ? `${format(parseISO(firstCommit), "MMM yyyy")} – ${format(parseISO(lastCommit), "MMM yyyy")}`
      : undefined;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <StatCard
        icon={GitCommitHorizontal}
        label="Total Commits"
        value={totalCommits}
        sub={dateRange}
        color="#818cf8"
        delay={0.1}
      />
      <StatCard
        icon={Users}
        label="Contributors"
        value={uniqueContributors}
        sub="unique authors"
        color="#a78bfa"
        delay={0.15}
      />
      <StatCard
        icon={Calendar}
        label="Active Days"
        value={activeDays}
        sub="days with commits"
        color="#34d399"
        delay={0.2}
      />
      <StatCard
        icon={Flame}
        label="Longest Streak"
        value={longestStreak}
        sub="consecutive days"
        color="#fb923c"
        delay={0.25}
      />
      <StatCard
        icon={FileCode2}
        label="Files Changed"
        value={fmt(filesChanged)}
        sub={`${filesChanged.toLocaleString()} file-changes`}
        color="#f472b6"
        delay={0.3}
      />
      <LinesCard linesAdded={linesAdded} linesRemoved={linesRemoved} delay={0.35} />
    </div>
  );
}
