"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  Search,
  ChevronRight,
  AlertCircle,
  FolderOpen,
  Plus,
  X as XIcon,
} from "lucide-react";
import { parseISO, differenceInDays, subDays, subMonths, format, startOfWeek } from "date-fns";
import { api } from "~/trpc/react";
import { FolderPicker } from "./_components/FolderPicker";
import { ContributorFilter, type UserGroup, type ContributorSection } from "./_components/ContributorFilter";
import { StatCards } from "./_components/StatCards";
import { CommitTimeline } from "./_components/CommitTimeline";
import { ContributionHeatmap } from "./_components/ContributionHeatmap";
import { CommitDistribution } from "./_components/CommitDistribution";
import { ActivityChart } from "./_components/ActivityChart";
import { VelocityChart } from "./_components/VelocityChart";
import { Leaderboard } from "./_components/Leaderboard";
import { RecentCommits } from "./_components/RecentCommits";

// ── Types ─────────────────────────────────────────────────────────────────────

type RepoData = {
  repoName: string;
  totalCommits: number;
  uniqueContributors: number;
  activeDays: number;
  longestStreak: number;
  firstCommit: string | null;
  lastCommit: string | null;
  topAuthors: string[];
  timeline: Array<Record<string, string | number>>;
  heatmapData: Array<{ date: string; count: number }>;
  distribution: Array<{ name: string; value: number; percentage: number }>;
  hourlyActivity: Array<{ hour: number; label: string; count: number }>;
  dailyActivity: Array<{ day: string; count: number }>;
  contributors: Array<{
    name: string; email: string; commits: number; percentage: number;
    firstCommit: string; lastCommit: string; activeDays: number;
  }>;
  recentCommits: Array<{
    hash: string; author: string; message: string;
    date: string; relativeDate: string; sortKey: string;
  }>;
  commitsByDate: Record<string, number>;
  perAuthorDateMap: Record<string, Record<string, number>>;
  perAuthorHourMap: Record<string, Record<number, number>>;
  perAuthorDayMap: Record<string, Record<number, number>>;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  perAuthorFilesChanged: Record<string, number>;
  perAuthorLinesAdded: Record<string, number>;
  perAuthorLinesRemoved: Record<string, number>;
};

// ── Merge utility ─────────────────────────────────────────────────────────────

function computeLongestStreak(dateSet: Set<string>): number {
  if (dateSet.size === 0) return 0;
  const sorted = [...dateSet].sort();
  let maxStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseISO(sorted[i - 1]!);
    const curr = parseISO(sorted[i]!);
    if (differenceInDays(curr, prev) === 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  return maxStreak;
}

function mergeRepoData(datasets: RepoData[]): RepoData {
  if (datasets.length === 1) return datasets[0]!;

  // Merge commit counts per author across all repos
  const commitsByUser: Record<string, number> = {};
  for (const d of datasets) {
    for (const entry of d.distribution) {
      commitsByUser[entry.name] = (commitsByUser[entry.name] ?? 0) + entry.value;
    }
    // Also include authors that may only appear in contributors but not top-8 distribution
    for (const c of d.contributors) {
      if (!(c.name in commitsByUser)) commitsByUser[c.name] = c.commits;
    }
  }

  const total = Object.values(commitsByUser).reduce((s, c) => s + c, 0);
  const topAuthors = Object.entries(commitsByUser)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  // Merge per-author maps
  const perAuthorDateMap: Record<string, Record<string, number>> = {};
  const perAuthorHourMap: Record<string, Record<number, number>> = {};
  const perAuthorDayMap: Record<string, Record<number, number>> = {};

  for (const d of datasets) {
    for (const [author, dateMap] of Object.entries(d.perAuthorDateMap)) {
      if (!topAuthors.includes(author)) continue;
      if (!perAuthorDateMap[author]) perAuthorDateMap[author] = {};
      for (const [date, count] of Object.entries(dateMap)) {
        perAuthorDateMap[author][date] = (perAuthorDateMap[author][date] ?? 0) + count;
      }
    }
    for (const [author, hourMap] of Object.entries(d.perAuthorHourMap)) {
      if (!topAuthors.includes(author)) continue;
      if (!perAuthorHourMap[author]) perAuthorHourMap[author] = {};
      for (const [hour, count] of Object.entries(hourMap)) {
        const h = +hour;
        perAuthorHourMap[author][h] = (perAuthorHourMap[author][h] ?? 0) + count;
      }
    }
    for (const [author, dayMap] of Object.entries(d.perAuthorDayMap)) {
      if (!topAuthors.includes(author)) continue;
      if (!perAuthorDayMap[author]) perAuthorDayMap[author] = {};
      for (const [dow, count] of Object.entries(dayMap)) {
        const d2 = +dow;
        perAuthorDayMap[author][d2] = (perAuthorDayMap[author][d2] ?? 0) + count;
      }
    }
  }

  // Aggregate charts from top-8 only (consistent with single-repo behavior)
  const commitsByDate: Record<string, number> = {};
  for (const authorMap of Object.values(perAuthorDateMap)) {
    for (const [date, count] of Object.entries(authorMap)) {
      commitsByDate[date] = (commitsByDate[date] ?? 0) + count;
    }
  }

  const hourMap: Record<number, number> = {};
  for (let i = 0; i < 24; i++) hourMap[i] = 0;
  for (const authorMap of Object.values(perAuthorHourMap)) {
    for (const [h, count] of Object.entries(authorMap)) {
      hourMap[+h] = (hourMap[+h] ?? 0) + count;
    }
  }

  const dayMap: Record<number, number> = {};
  for (let i = 0; i < 7; i++) dayMap[i] = 0;
  for (const authorMap of Object.values(perAuthorDayMap)) {
    for (const [dow, count] of Object.entries(authorMap)) {
      dayMap[+dow] = (dayMap[+dow] ?? 0) + count;
    }
  }

  // Heatmap — last 365 days
  const yearAgo = subDays(new Date(), 365);
  const heatmapData = Object.entries(commitsByDate)
    .filter(([d]) => parseISO(d) >= yearAgo)
    .map(([date, count]) => ({ date, count }));

  // Hourly / daily activity
  const hourLabels = (h: number) =>
    h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
  const hourlyActivity = Array.from({ length: 24 }, (_, h) => ({
    hour: h, label: hourLabels(h), count: hourMap[h] ?? 0,
  }));
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dailyActivity = Array.from({ length: 7 }, (_, d) => ({
    day: dayLabels[d]!, count: dayMap[d] ?? 0,
  }));

  // Timeline — merge weekly per top-8 author
  const weeklyMap: Record<string, Record<string, number>> = {};
  for (const d of datasets) {
    for (const row of d.timeline) {
      const week = row.week as string;
      if (!weeklyMap[week]) weeklyMap[week] = {};
      for (const [author, count] of Object.entries(row)) {
        if (author === "week" || !topAuthors.includes(author)) continue;
        weeklyMap[week][author] = (weeklyMap[week][author] ?? 0) + (count as number);
      }
    }
  }
  const timeline = Object.entries(weeklyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, data]) => ({ week, ...data }));

  // Distribution
  const distribution = topAuthors.map((name) => ({
    name,
    value: commitsByUser[name] ?? 0,
    percentage: Math.round(((commitsByUser[name] ?? 0) / total) * 100),
  }));

  // Contributors — merge per author
  const contribMap: Record<string, RepoData["contributors"][number]> = {};
  for (const d of datasets) {
    for (const c of d.contributors) {
      if (!contribMap[c.name]) {
        contribMap[c.name] = { ...c };
      } else {
        contribMap[c.name]!.commits += c.commits;
        contribMap[c.name]!.activeDays += c.activeDays;
        // keep earliest firstCommit and latest lastCommit
        if (c.firstCommit && (!contribMap[c.name]!.firstCommit || c.firstCommit < contribMap[c.name]!.firstCommit)) {
          contribMap[c.name]!.firstCommit = c.firstCommit;
        }
        if (c.lastCommit && (!contribMap[c.name]!.lastCommit || c.lastCommit > contribMap[c.name]!.lastCommit)) {
          contribMap[c.name]!.lastCommit = c.lastCommit;
        }
      }
    }
  }
  const contributors = topAuthors
    .filter((name) => contribMap[name])
    .map((name) => ({
      ...contribMap[name]!,
      commits: commitsByUser[name] ?? 0,
      percentage: Math.round(((commitsByUser[name] ?? 0) / total) * 100),
    }));

  // Recent commits — merge and sort by sortKey desc, take 30
  const allRecent = datasets.flatMap((d) => d.recentCommits);
  const recentCommits = allRecent
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .slice(0, 30);

  // Stats
  const allDates = new Set(Object.keys(commitsByDate));
  const activeDays = allDates.size;
  const longestStreak = computeLongestStreak(allDates);

  const allFirstCommits = datasets.map((d) => d.firstCommit).filter(Boolean) as string[];
  const allLastCommits = datasets.map((d) => d.lastCommit).filter(Boolean) as string[];
  const firstCommit = allFirstCommits.sort()[0] ?? null;
  const lastCommit = allLastCommits.sort().pop() ?? null;

  const repoNames = datasets.map((d) => d.repoName);

  return {
    repoName: repoNames.join(" + "),
    totalCommits: total,
    uniqueContributors: Object.keys(commitsByUser).length,
    activeDays,
    longestStreak,
    firstCommit,
    lastCommit,
    topAuthors,
    timeline,
    heatmapData,
    distribution,
    hourlyActivity,
    dailyActivity,
    contributors,
    recentCommits,
    commitsByDate,
    perAuthorDateMap,
    perAuthorHourMap,
    perAuthorDayMap,
    ...(() => {
      const perAuthorFilesChanged: Record<string, number> = {};
      const perAuthorLinesAdded: Record<string, number> = {};
      const perAuthorLinesRemoved: Record<string, number> = {};
      for (const d of datasets) {
        for (const [a, v] of Object.entries(d.perAuthorFilesChanged))
          perAuthorFilesChanged[a] = (perAuthorFilesChanged[a] ?? 0) + v;
        for (const [a, v] of Object.entries(d.perAuthorLinesAdded))
          perAuthorLinesAdded[a] = (perAuthorLinesAdded[a] ?? 0) + v;
        for (const [a, v] of Object.entries(d.perAuthorLinesRemoved))
          perAuthorLinesRemoved[a] = (perAuthorLinesRemoved[a] ?? 0) + v;
      }
      return {
        perAuthorFilesChanged,
        perAuthorLinesAdded,
        perAuthorLinesRemoved,
        filesChanged: Object.values(perAuthorFilesChanged).reduce((s, c) => s + c, 0),
        linesAdded: Object.values(perAuthorLinesAdded).reduce((s, c) => s + c, 0),
        linesRemoved: Object.values(perAuthorLinesRemoved).reduce((s, c) => s + c, 0),
      };
    })(),
  };
}

// ── Identity group resolution ─────────────────────────────────────────────────

function applyUserGroups(data: RepoData, userGroups: UserGroup[]): RepoData {
  if (userGroups.length === 0) return data;

  const resolve = (name: string): string => {
    for (const g of userGroups) {
      if (g.identities.includes(name)) return g.displayName;
    }
    return name;
  };

  // Re-key per-author maps, merging identities that belong to the same group
  const perAuthorDateMap: Record<string, Record<string, number>> = {};
  for (const [author, dates] of Object.entries(data.perAuthorDateMap)) {
    const canonical = resolve(author);
    if (!perAuthorDateMap[canonical]) perAuthorDateMap[canonical] = {};
    for (const [date, count] of Object.entries(dates)) {
      perAuthorDateMap[canonical][date] = (perAuthorDateMap[canonical][date] ?? 0) + count;
    }
  }

  const perAuthorHourMap: Record<string, Record<number, number>> = {};
  for (const [author, hours] of Object.entries(data.perAuthorHourMap)) {
    const canonical = resolve(author);
    if (!perAuthorHourMap[canonical]) perAuthorHourMap[canonical] = {};
    for (const [h, count] of Object.entries(hours)) {
      const hr = +h;
      perAuthorHourMap[canonical][hr] = (perAuthorHourMap[canonical][hr] ?? 0) + (count as number);
    }
  }

  const perAuthorDayMap: Record<string, Record<number, number>> = {};
  for (const [author, days] of Object.entries(data.perAuthorDayMap)) {
    const canonical = resolve(author);
    if (!perAuthorDayMap[canonical]) perAuthorDayMap[canonical] = {};
    for (const [d, count] of Object.entries(days)) {
      const dow = +d;
      perAuthorDayMap[canonical][dow] = (perAuthorDayMap[canonical][dow] ?? 0) + (count as number);
    }
  }

  // Re-key diff stat maps through identity resolution
  const perAuthorFilesChanged: Record<string, number> = {};
  const perAuthorLinesAdded: Record<string, number> = {};
  const perAuthorLinesRemoved: Record<string, number> = {};
  for (const [author, v] of Object.entries(data.perAuthorFilesChanged)) {
    const canonical = resolve(author);
    perAuthorFilesChanged[canonical] = (perAuthorFilesChanged[canonical] ?? 0) + v;
  }
  for (const [author, v] of Object.entries(data.perAuthorLinesAdded)) {
    const canonical = resolve(author);
    perAuthorLinesAdded[canonical] = (perAuthorLinesAdded[canonical] ?? 0) + v;
  }
  for (const [author, v] of Object.entries(data.perAuthorLinesRemoved)) {
    const canonical = resolve(author);
    perAuthorLinesRemoved[canonical] = (perAuthorLinesRemoved[canonical] ?? 0) + v;
  }
  const filesChanged = Object.values(perAuthorFilesChanged).reduce((s, c) => s + c, 0);
  const linesAdded = Object.values(perAuthorLinesAdded).reduce((s, c) => s + c, 0);
  const linesRemoved = Object.values(perAuthorLinesRemoved).reduce((s, c) => s + c, 0);

  // Rebuild commit counts and sort order
  const commitsByUser: Record<string, number> = {};
  for (const [author, dates] of Object.entries(perAuthorDateMap)) {
    commitsByUser[author] = Object.values(dates).reduce((s, c) => s + c, 0);
  }
  const total = Object.values(commitsByUser).reduce((s, c) => s + c, 0);
  const topAuthors = Object.entries(commitsByUser)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  // Rebuild aggregate date map
  const commitsByDate: Record<string, number> = {};
  for (const dates of Object.values(perAuthorDateMap)) {
    for (const [date, count] of Object.entries(dates)) {
      commitsByDate[date] = (commitsByDate[date] ?? 0) + count;
    }
  }

  const yearAgo = subDays(new Date(), 365);
  const heatmapData = Object.entries(commitsByDate)
    .filter(([d]) => parseISO(d) >= yearAgo)
    .map(([date, count]) => ({ date, count }));

  // Hourly / daily activity
  const hourMap: Record<number, number> = {};
  for (let i = 0; i < 24; i++) hourMap[i] = 0;
  for (const hours of Object.values(perAuthorHourMap)) {
    for (const [h, count] of Object.entries(hours)) {
      hourMap[+h] = (hourMap[+h] ?? 0) + (count as number);
    }
  }
  const dayMap: Record<number, number> = {};
  for (let i = 0; i < 7; i++) dayMap[i] = 0;
  for (const days of Object.values(perAuthorDayMap)) {
    for (const [d, count] of Object.entries(days)) {
      dayMap[+d] = (dayMap[+d] ?? 0) + (count as number);
    }
  }
  const hlabel = (h: number) => h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
  const hourlyActivity = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: hlabel(h), count: hourMap[h] ?? 0 }));
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dailyActivity = Array.from({ length: 7 }, (_, d) => ({ day: dayLabels[d]!, count: dayMap[d] ?? 0 }));

  // Rebuild weekly timeline from per-author date map
  const weeklyMap: Record<string, Record<string, number>> = {};
  for (const [author, dates] of Object.entries(perAuthorDateMap)) {
    for (const [date, count] of Object.entries(dates)) {
      const week = format(startOfWeek(parseISO(date)), "yyyy-MM-dd");
      if (!weeklyMap[week]) weeklyMap[week] = {};
      weeklyMap[week][author] = (weeklyMap[week][author] ?? 0) + count;
    }
  }
  const timeline = Object.entries(weeklyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({ week, ...d }));

  // Distribution
  const distribution = topAuthors.map((name) => ({
    name,
    value: commitsByUser[name] ?? 0,
    percentage: Math.round(((commitsByUser[name] ?? 0) / total) * 100),
  }));

  // Merge contributor metadata
  const contribMap: Record<string, RepoData["contributors"][number]> = {};
  for (const c of data.contributors) {
    const canonical = resolve(c.name);
    if (!contribMap[canonical]) {
      contribMap[canonical] = { ...c, name: canonical };
    } else {
      contribMap[canonical]!.activeDays += c.activeDays;
      if (c.firstCommit && (!contribMap[canonical]!.firstCommit || c.firstCommit < contribMap[canonical]!.firstCommit))
        contribMap[canonical]!.firstCommit = c.firstCommit;
      if (c.lastCommit && (!contribMap[canonical]!.lastCommit || c.lastCommit > contribMap[canonical]!.lastCommit))
        contribMap[canonical]!.lastCommit = c.lastCommit;
    }
  }
  const contributors = topAuthors
    .filter((name) => contribMap[name])
    .map((name) => ({
      ...contribMap[name]!,
      commits: commitsByUser[name] ?? 0,
      percentage: Math.round(((commitsByUser[name] ?? 0) / total) * 100),
    }));

  const recentCommits = data.recentCommits.map((c) => ({ ...c, author: resolve(c.author) }));
  const allDates = new Set(Object.keys(commitsByDate));

  return {
    ...data,
    totalCommits: total,
    uniqueContributors: topAuthors.length,
    activeDays: allDates.size,
    longestStreak: computeLongestStreak(allDates),
    topAuthors,
    timeline,
    heatmapData,
    distribution,
    hourlyActivity,
    dailyActivity,
    contributors,
    recentCommits,
    commitsByDate,
    perAuthorDateMap,
    perAuthorHourMap,
    perAuthorDayMap,
    filesChanged,
    linesAdded,
    linesRemoved,
    perAuthorFilesChanged,
    perAuthorLinesAdded,
    perAuthorLinesRemoved,
  };
}

// ── Contributor metric type ───────────────────────────────────────────────────

type ContribMetric = "commits" | "files" | "lines" | "streak";

// ── Time Range Control ────────────────────────────────────────────────────────

const TIME_PERIODS = ["3M", "6M", "1Y", "All"] as const;

function TimeRangeControl({ period, onChange }: { period: string; onChange: (p: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className="flex items-center justify-between px-1"
    >
      <div className="flex items-center gap-2 text-white/30 text-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/60" />
        Time range — applies to all charts
      </div>
      <div className="relative flex items-center glass rounded-xl p-1 gap-0.5">
        {TIME_PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className="relative z-10 px-4 py-1.5 text-sm font-medium transition-colors duration-200 rounded-lg min-w-[44px]"
            style={{ color: period === p ? "white" : "rgba(255,255,255,0.35)" }}
          >
            {period === p && (
              <motion.div
                layoutId="period-pill"
                className="absolute inset-0 rounded-lg bg-indigo-600/50 border border-indigo-500/40"
                transition={{ type: "spring", stiffness: 350, damping: 35 }}
              />
            )}
            <span className="relative">{p}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ── Contributor Metric Control ────────────────────────────────────────────────

const CONTRIB_METRICS: { key: ContribMetric; label: string }[] = [
  { key: "commits", label: "Commits" },
  { key: "files",   label: "Files" },
  { key: "lines",   label: "Lines" },
  { key: "streak",  label: "Streak" },
];

function ContribMetricControl({ metric, onChange }: { metric: ContribMetric; onChange: (m: ContribMetric) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className="flex items-center gap-3 px-1"
    >
      <div className="relative flex items-center glass rounded-xl p-1 gap-0.5">
        {CONTRIB_METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => onChange(m.key)}
            className="relative z-10 px-4 py-1.5 text-sm font-medium transition-colors duration-200 rounded-lg min-w-[44px]"
            style={{ color: metric === m.key ? "white" : "rgba(255,255,255,0.35)" }}
          >
            {metric === m.key && (
              <motion.div
                layoutId="metric-pill"
                className="absolute inset-0 rounded-lg bg-violet-600/50 border border-violet-500/40"
                transition={{ type: "spring", stiffness: 350, damping: 35 }}
              />
            )}
            <span className="relative">{m.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-white/30 text-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-violet-500/60" />
        Contributor metric — distribution &amp; leaderboard
      </div>
    </motion.div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`glass rounded-2xl skeleton ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} className="h-32" />)}
      </div>
      <SkeletonCard className="h-80" />
      <SkeletonCard className="h-56" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-72" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonCard className="h-80" />
        <SkeletonCard className="h-80" />
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onSubmit }: { onSubmit: (path: string) => void }) {
  const [value, setValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => { const t = value.trim(); if (t) onSubmit(t); };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none" style={{
        background: "radial-gradient(at 30% 20%, rgba(99,102,241,0.10) 0px, transparent 50%), radial-gradient(at 70% 80%, rgba(139,92,246,0.08) 0px, transparent 50%)",
      }} />

      <FolderPicker isOpen={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(path) => { setValue(path); onSubmit(path); }} />

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-md text-center relative z-10"
      >
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
          className="flex items-center justify-center gap-3 mb-8"
        >
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-indigo-400" />
          </div>
          <span className="text-3xl font-thin text-white tracking-[-0.04em]">
            commit<span className="text-indigo-400">·</span>viz
          </span>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          className="text-white/40 text-base mb-10 leading-relaxed"
        >
          Beautiful analytics for your local git repositories
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.23, 1, 0.32, 1] }} className="mb-3"
        >
          <button onClick={() => setPickerOpen(true)}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-indigo-600/80 hover:bg-indigo-500/90 border border-indigo-500/50 text-white font-medium text-sm transition-all duration-200 shadow-lg shadow-indigo-500/10"
          >
            <FolderOpen className="w-4 h-4" />
            Browse for repository…
          </button>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}
          className="flex items-center gap-3 mb-3"
        >
          <div className="flex-1 h-px bg-white/[0.07]" />
          <span className="text-white/20 text-xs">or type a path</span>
          <div className="flex-1 h-px bg-white/[0.07]" />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.5, ease: [0.23, 1, 0.32, 1] }} className="relative"
        >
          <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <Search className="w-4 h-4 text-white/25" />
          </div>
          <input ref={inputRef} type="text" value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="/path/to/your/repository"
            className="w-full bg-white/[0.05] border border-white/[0.10] hover:border-white/[0.16] focus:border-indigo-500/60 focus:bg-white/[0.07] rounded-2xl pl-11 pr-14 py-4 text-white/80 text-sm placeholder:text-white/20 outline-none transition-all duration-300 font-mono"
          />
          <button onClick={handleSubmit} disabled={!value.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-white/20 flex items-center justify-center transition-all duration-200 text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}
          className="mt-4 flex flex-wrap gap-2 justify-center"
        >
          {["~/projects/my-app", "~/code/backend", "/repos/frontend"].map((example) => (
            <button key={example} onClick={() => setValue(example)}
              className="text-xs text-white/25 hover:text-white/50 font-mono transition-colors"
            >{example}</button>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({
  repoPaths,
  repoNames,
  onRemoveRepo,
  onAddRepo,
  onReset,
}: {
  repoPaths: string[];
  repoNames: string[];
  onRemoveRepo: (path: string) => void;
  onAddRepo: (path: string) => void;
  onReset: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeValue, setTypeValue] = useState("");

  return (
    <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="flex items-start justify-between mb-8 gap-4"
    >
      <FolderPicker isOpen={pickerOpen} onClose={() => setPickerOpen(false)}
        onSelect={(path) => { onAddRepo(path); setPickerOpen(false); }}
      />

      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/25 flex items-center justify-center flex-shrink-0 mt-0.5">
          <GitBranch className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {repoPaths.map((path, i) => (
              <div key={path}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.05] border border-white/[0.08] group"
              >
                <span className="text-white font-medium text-sm">{repoNames[i] ?? path.split("/").pop()}</span>
                <button onClick={() => repoPaths.length > 1 ? onRemoveRepo(path) : onReset()}
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-all"
                >
                  <XIcon className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            <button onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl border border-dashed border-white/[0.12] text-white/35 hover:text-white/60 hover:border-white/25 text-xs transition-all"
            >
              <Plus className="w-3 h-3" />
              Add repo
            </button>
          </div>
          {/* Type path inline */}
          {typeOpen ? (
            <div className="flex items-center gap-2 mt-2">
              <input autoFocus value={typeValue} onChange={(e) => setTypeValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && typeValue.trim()) { onAddRepo(typeValue.trim()); setTypeValue(""); setTypeOpen(false); }
                  if (e.key === "Escape") { setTypeOpen(false); setTypeValue(""); }
                }}
                placeholder="/path/to/repo"
                className="bg-white/[0.05] border border-white/[0.10] focus:border-indigo-500/60 rounded-xl px-3 py-1.5 text-white/80 text-xs placeholder:text-white/20 outline-none font-mono w-64"
              />
              <button onClick={() => setTypeOpen(false)} className="text-white/30 hover:text-white/60 transition-colors">
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => setTypeOpen(true)}
              className="flex items-center gap-1 mt-1.5 text-white/25 hover:text-white/50 text-xs transition-colors"
            >
              <Search className="w-3 h-3" />
              Type path
            </button>
          )}
        </div>
      </div>
    </motion.header>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-8 max-w-md text-center"
      >
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
        <h2 className="text-white font-semibold text-lg mb-2">Could not load repository</h2>
        <p className="text-white/50 text-sm mb-6">{message}</p>
        <button onClick={onReset}
          className="bg-white/10 hover:bg-white/15 text-white text-sm px-6 py-2.5 rounded-xl transition-colors"
        >
          Try another path
        </button>
      </motion.div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({
  repoPaths,
  onReset,
  onAddRepo,
  onRemoveRepo,
}: {
  repoPaths: string[];
  onReset: () => void;
  onAddRepo: (path: string) => void;
  onRemoveRepo: (path: string) => void;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [nameAliases, setNameAliases] = useState<Record<string, string>>({});
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [sections, setSections] = useState<ContributorSection[]>([]);
  const [period, setPeriod] = useState("1Y");
  const [metric, setMetric] = useState<ContribMetric>("commits");

  // Parallel queries for all repos
  const queries = api.useQueries((t) =>
    repoPaths.map((path) => t.git.getRepoData({ repoPath: path }, { retry: false }))
  );

  const isLoading = queries.some((q) => q.isLoading);
  const firstError = queries.find((q) => q.error)?.error ?? null;
  const loadedDatasets = queries.map((q) => q.data).filter(Boolean) as RepoData[];

  // Reset exclusions when repos change
  useEffect(() => { setExcluded(new Set()); }, [repoPaths.join(",")]);

  // Load global aliases + user groups + sections
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cviz-aliases");
      setNameAliases(saved ? (JSON.parse(saved) as Record<string, string>) : {});
    } catch { setNameAliases({}); }
    try {
      const saved = localStorage.getItem("cviz-user-groups");
      setUserGroups(saved ? (JSON.parse(saved) as UserGroup[]) : []);
    } catch { setUserGroups([]); }
    try {
      const saved = localStorage.getItem("cviz-sections");
      setSections(saved ? (JSON.parse(saved) as ContributorSection[]) : []);
    } catch { setSections([]); }
  }, []);

  const handleRename = (original: string, alias: string) => {
    setNameAliases((prev) => {
      const next = { ...prev };
      if (alias && alias !== original) {
        next[original] = alias;
      } else {
        delete next[original];
      }
      localStorage.setItem("cviz-aliases", JSON.stringify(next));
      return next;
    });
  };

  const handleSaveGroup = (group: UserGroup) => {
    setUserGroups((prev) => {
      const next = prev.filter((g) => g.id !== group.id).concat(group);
      localStorage.setItem("cviz-user-groups", JSON.stringify(next));
      return next;
    });
    // Reset exclusions since canonical names have changed
    setExcluded(new Set());
  };

  const handleDeleteGroup = (id: string) => {
    setUserGroups((prev) => {
      const next = prev.filter((g) => g.id !== id);
      localStorage.setItem("cviz-user-groups", JSON.stringify(next));
      return next;
    });
    setExcluded(new Set());
  };

  const handleSaveSection = (section: ContributorSection) => {
    setSections((prev) => {
      const next = prev.filter((s) => s.id !== section.id).concat(section);
      localStorage.setItem("cviz-sections", JSON.stringify(next));
      return next;
    });
  };

  const handleDeleteSection = (id: string) => {
    setSections((prev) => {
      const next = prev.filter((s) => s.id !== id);
      localStorage.setItem("cviz-sections", JSON.stringify(next));
      return next;
    });
  };

  const toggleExclude = (name: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const toggleExcludeMany = (names: string[], toExcluded: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const name of names) {
        if (toExcluded) next.add(name);
        else next.delete(name);
      }
      return next;
    });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-xl skeleton" />
          <div><div className="skeleton h-5 w-40 rounded mb-1" /><div className="skeleton h-3 w-56 rounded" /></div>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  if (firstError && loadedDatasets.length === 0) {
    return <ErrorState message={firstError.message} onReset={onReset} />;
  }

  if (loadedDatasets.length === 0) return null;

  const data = applyUserGroups(mergeRepoData(loadedDatasets), userGroups);
  const repoNames = loadedDatasets.map((d) => d.repoName);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <Header
        repoPaths={repoPaths}
        repoNames={repoNames}
        onRemoveRepo={onRemoveRepo}
        onAddRepo={onAddRepo}
        onReset={onReset}
      />

      {/* ── Derived / filtered data ──────────────────────────────────────── */}
      {(() => {
        const getDisplayName = (name: string) => nameAliases[name] ?? name;
        const visibleAuthors = data.topAuthors.filter((a) => !excluded.has(a));
        const visibleCommits = data.recentCommits.filter((c) => !excluded.has(c.author));

        // ── Period start for contributor stats ───────────────────────────────
        const CONTRIB_PERIOD_MONTHS: Record<string, number> = { "3M": 3, "6M": 6, "1Y": 12 };
        const now = new Date();
        const contribPeriodStart =
          period === "All" && data.firstCommit
            ? parseISO(data.firstCommit)
            : subMonths(now, CONTRIB_PERIOD_MONTHS[period] ?? 12);

        // Filter each contributor's stats to the selected period using perAuthorDateMap.
        // This makes the date range, active days and commit count all consistent with
        // whichever time window is currently selected.
        const visibleContributors = data.contributors
          .filter((c) => !excluded.has(c.name))
          .map((c) => {
            const authorDateMap = data.perAuthorDateMap[c.name] ?? {};
            const periodEntries = Object.entries(authorDateMap).filter(([d]) => {
              try { return parseISO(d) >= contribPeriodStart; } catch { return false; }
            });
            const commitsInPeriod = periodEntries.reduce((s, [, cnt]) => s + cnt, 0);
            const sortedDates = periodEntries.map(([d]) => d).sort();
            return {
              ...c,
              commits: commitsInPeriod,
              activeDays: sortedDates.length,
              // Month-year precision is enough; day-level is noise in a range display
              firstCommit: sortedDates[0]
                ? format(parseISO(sortedDates[0]), "MMM yyyy") : "—",
              lastCommit: sortedDates[sortedDates.length - 1]
                ? format(parseISO(sortedDates[sortedDates.length - 1]!), "MMM yyyy") : "—",
            };
          })
          .filter((c) => c.commits > 0)   // hide contributors with no activity in period
          .sort((a, b) => b.commits - a.commits);

        // ── Per-metric values (distribution & leaderboard) ───────────────────
        // commits + streak are period-filtered; files + lines are all-time
        // (no per-date diff data available without a server change).
        const metricValues: Record<string, number> = {};
        for (const c of visibleContributors) {
          const dateMap = data.perAuthorDateMap[c.name] ?? {};
          if (metric === "commits") {
            metricValues[c.name] = c.commits; // already period-filtered above
          } else if (metric === "files") {
            metricValues[c.name] = data.perAuthorFilesChanged[c.name] ?? 0;
          } else if (metric === "lines") {
            metricValues[c.name] =
              (data.perAuthorLinesAdded[c.name] ?? 0) +
              (data.perAuthorLinesRemoved[c.name] ?? 0);
          } else {
            // streak — period-filtered longest consecutive active day run
            const periodDates = new Set(
              Object.entries(dateMap)
                .filter(([d]) => { try { return parseISO(d) >= contribPeriodStart; } catch { return false; } })
                .filter(([, cnt]) => cnt > 0)
                .map(([d]) => d)
            );
            metricValues[c.name] = computeLongestStreak(periodDates);
          }
        }
        const metricTotal = visibleContributors.reduce(
          (s, c) => s + (metricValues[c.name] ?? 0), 0
        );
        const metricDistribution = visibleContributors
          .map((c) => ({ name: c.name, value: metricValues[c.name] ?? 0 }))
          .filter((d) => d.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((d) => ({
            ...d,
            percentage: metricTotal > 0
              ? Math.round((d.value / metricTotal) * 100) : 0,
          }));
        // Re-sort contributors by active metric and recompute percentages
        const metricSortedContributors = visibleContributors
          .map((c) => {
            const val = metricValues[c.name] ?? 0;
            return {
              ...c,
              commits: val,
              percentage: metricTotal > 0
                ? Math.round((val / metricTotal) * 100) : 0,
            };
          })
          .sort((a, b) => b.commits - a.commits);

        // Measured window — the same for every contributor, shown in the card header
        // so it's clear what the comparison baseline is.
        const measuredFrom = format(contribPeriodStart, "MMM yyyy");
        const measuredTo = format(now, "MMM yyyy");

        const visibleHourly = excluded.size === 0
          ? data.hourlyActivity
          : data.hourlyActivity.map(({ hour, label, count }) => {
              let c = count;
              for (const author of excluded) c -= data.perAuthorHourMap[author]?.[hour] ?? 0;
              return { hour, label, count: Math.max(0, c) };
            });

        const visibleDaily = excluded.size === 0
          ? data.dailyActivity
          : data.dailyActivity.map(({ day, count }, i) => {
              let c = count;
              for (const author of excluded) c -= data.perAuthorDayMap[author]?.[i] ?? 0;
              return { day, count: Math.max(0, c) };
            });

        const visibleCommitsByDate = excluded.size === 0
          ? data.commitsByDate
          : (() => {
              const result = { ...data.commitsByDate };
              for (const author of excluded) {
                for (const [date, count] of Object.entries(data.perAuthorDateMap[author] ?? {})) {
                  result[date] = Math.max(0, (result[date] ?? 0) - count);
                }
              }
              return result;
            })();

        // ── Period-filtered aggregate data ────────────────────────────────────
        // Filter the combined date map to the selected period window so stat
        // cards, distribution, and velocity all reflect the same timeframe.
        const periodCommitsByDate: Record<string, number> = Object.fromEntries(
          Object.entries(visibleCommitsByDate).filter(([d]) => {
            try { return parseISO(d) >= contribPeriodStart; } catch { return false; }
          })
        );
        const periodActiveDatesSet = new Set(
          Object.entries(periodCommitsByDate).filter(([, c]) => c > 0).map(([d]) => d)
        );
        const periodTotalCommits = Object.values(periodCommitsByDate).reduce((s, c) => s + c, 0);
        const periodActiveDays = periodActiveDatesSet.size;
        const periodLongestStreak = computeLongestStreak(periodActiveDatesSet);

        // Visible diff stats derived from per-author maps
        const visibleFilesChanged = excluded.size === 0
          ? data.filesChanged
          : data.topAuthors
              .filter((a) => !excluded.has(a))
              .reduce((s, a) => s + (data.perAuthorFilesChanged[a] ?? 0), 0);

        const visibleLinesAdded = excluded.size === 0
          ? data.linesAdded
          : data.topAuthors
              .filter((a) => !excluded.has(a))
              .reduce((s, a) => s + (data.perAuthorLinesAdded[a] ?? 0), 0);

        const visibleLinesRemoved = excluded.size === 0
          ? data.linesRemoved
          : data.topAuthors
              .filter((a) => !excluded.has(a))
              .reduce((s, a) => s + (data.perAuthorLinesRemoved[a] ?? 0), 0);

        return (
          <div className="space-y-4">
            <StatCards
              totalCommits={periodTotalCommits}
              uniqueContributors={visibleContributors.length}
              activeDays={periodActiveDays}
              longestStreak={periodLongestStreak}
              firstCommit={data.firstCommit}
              lastCommit={data.lastCommit}
              measuredFrom={measuredFrom}
              measuredTo={measuredTo}
              filesChanged={visibleFilesChanged}
              linesAdded={visibleLinesAdded}
              linesRemoved={visibleLinesRemoved}
            />

            <ContributorFilter
              contributors={data.contributors}
              excluded={excluded}
              onToggle={toggleExclude}
              onToggleMany={toggleExcludeMany}
              onClear={() => setExcluded(new Set())}
              onExcludeAll={() => setExcluded(new Set(data.contributors.map((c) => c.name)))}
              nameAliases={nameAliases}
              onRename={handleRename}
              userGroups={userGroups}
              onSaveGroup={handleSaveGroup}
              onDeleteGroup={handleDeleteGroup}
              sections={sections}
              onSaveSection={handleSaveSection}
              onDeleteSection={handleDeleteSection}
            />

            <CommitTimeline
              timeline={data.timeline as Array<Record<string, string | number>>}
              topAuthors={visibleAuthors}
              getDisplayName={getDisplayName}
              period={period}
              onPeriodChange={setPeriod}
            />

            {/* Shared time range control */}
            <TimeRangeControl period={period} onChange={setPeriod} />

            {/* Heatmap — full width, receives all-time data so the period slider
                can truly zoom from 3 months → all history */}
            <ContributionHeatmap
              commitsByDate={visibleCommitsByDate}
              period={period}
              firstCommit={data.firstCommit}
            />

            {/* Distribution + Activity + Velocity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <CommitDistribution
                distribution={metricDistribution}
                total={metricTotal}
                metric={metric}
                getDisplayName={getDisplayName}
              />
              <ActivityChart
                hourlyActivity={visibleHourly}
                dailyActivity={visibleDaily}
              />
              <VelocityChart commitsByDate={periodCommitsByDate} />
            </div>

            {/* Contributor metric selector — drives Distribution + Leaderboard */}
            <ContribMetricControl metric={metric} onChange={setMetric} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Leaderboard
                contributors={metricSortedContributors}
                period={period}
                measuredFrom={measuredFrom}
                measuredTo={measuredTo}
                metric={metric}
                getDisplayName={getDisplayName}
              />
              <RecentCommits
                commits={visibleCommits}
                topAuthors={visibleAuthors}
                getDisplayName={getDisplayName}
              />
            </div>
          </div>
        );
      })()}

      <div className="mt-12 text-center text-white/15 text-xs font-mono">
        commit·viz
      </div>
    </div>
  );
}

// ── Root page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [repoPaths, setRepoPaths] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cviz-repos");
      if (saved) {
        setRepoPaths(JSON.parse(saved) as string[]);
      } else {
        // backwards compat with old single-repo key
        const old = localStorage.getItem("cviz-repo");
        if (old) setRepoPaths([old]);
      }
    } catch { /* ignore */ }
  }, []);

  const addRepo = (path: string) => {
    if (repoPaths.includes(path)) return;
    const next = [...repoPaths, path];
    setRepoPaths(next);
    localStorage.setItem("cviz-repos", JSON.stringify(next));
  };

  const removeRepo = (path: string) => {
    const next = repoPaths.filter((p) => p !== path);
    setRepoPaths(next);
    localStorage.setItem("cviz-repos", JSON.stringify(next));
  };

  const handleReset = () => {
    setRepoPaths([]);
    localStorage.removeItem("cviz-repos");
    localStorage.removeItem("cviz-repo");
  };

  return (
    <main className="min-h-screen bg-gradient-mesh">
      <div className="fixed inset-0 pointer-events-none" style={{
        background: "radial-gradient(at 15% 25%, rgba(99,102,241,0.07) 0px, transparent 50%), radial-gradient(at 85% 75%, rgba(139,92,246,0.06) 0px, transparent 50%)",
      }} />

      <AnimatePresence mode="wait">
        {repoPaths.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <EmptyState onSubmit={addRepo} />
          </motion.div>
        ) : (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <Dashboard repoPaths={repoPaths} onReset={handleReset} onAddRepo={addRepo} onRemoveRepo={removeRepo} />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
