"use client";

import { motion } from "framer-motion";

const COLORS = [
  "#818cf8", "#a78bfa", "#f472b6", "#fb923c",
  "#34d399", "#60a5fa", "#f87171", "#4ade80",
  "#fbbf24", "#2dd4bf", "#e879f9", "#f97316",
  "#06b6d4", "#84cc16", "#ec4899", "#14b8a6",
  "#6366f1", "#8b5cf6", "#d946ef", "#0ea5e9",
];

type Commit = {
  hash: string;
  author: string;
  message: string;
  date: string;
  relativeDate: string;
};

type Props = {
  commits: Commit[];
  topAuthors: string[];
  getDisplayName?: (name: string) => string;
};

function authorColor(author: string, topAuthors: string[]): string {
  const i = topAuthors.indexOf(author);
  return i >= 0 ? (COLORS[i % COLORS.length] ?? "#818cf8") : "#818cf8";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function RecentCommits({ commits, topAuthors, getDisplayName = (n) => n }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.65, ease: [0.23, 1, 0.32, 1] }}
      className="glass rounded-2xl p-6"
    >
      <div className="mb-5">
        <h2 className="text-white font-semibold text-lg">Recent Commits</h2>
        <p className="text-white/40 text-sm mt-0.5">Latest activity</p>
      </div>

      <div className="space-y-0">
        {commits.map((c, i) => {
          const color = authorColor(c.author, topAuthors);
          return (
            <motion.div
              key={c.hash + i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 + i * 0.02 }}
              className="flex items-start gap-3 py-3 border-b border-white/[0.05] last:border-0 group hover:bg-white/[0.02] rounded-lg -mx-2 px-2 transition-colors"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 mt-0.5"
                style={{ background: `${color}18`, color, border: `1px solid ${color}25` }}
              >
                {initials(getDisplayName(c.author))}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white/80 text-sm truncate leading-snug group-hover:text-white transition-colors">
                  {c.message}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-white/35 text-xs">{getDisplayName(c.author)}</span>
                  <span className="text-white/20 text-xs">·</span>
                  <span className="text-white/25 text-xs">{c.relativeDate}</span>
                </div>
              </div>
              <div className="font-mono text-white/20 text-xs flex-shrink-0 mt-1">
                {c.hash}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
