import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  format,
  parseISO,
  startOfWeek,
  getHours,
  getDay,
  subDays,
  differenceInDays,
  isValid,
} from "date-fns";

function safeParseISO(dateStr: string): Date | null {
  try {
    // Handle git's %aI format: "2024-01-15T10:30:00+00:00"
    // and also "%ai" format: "2024-01-15 10:30:00 +0000"
    const normalized = dateStr.replace(" ", "T").replace(/(\+\d{2})(\d{2})$/, "$1:$2");
    const d = parseISO(normalized);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

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

export const gitRouter = createTRPCRouter({
  getRepoData: publicProcedure
    .input(
      z.object({
        repoPath: z.string().min(1).max(500),
        maxCommits: z.number().min(100).max(50000).default(10000),
      })
    )
    .query(async ({ input }) => {
      const { default: simpleGit } = await import("simple-git");
      const git = simpleGit(input.repoPath);

      const isRepo = await git.checkIsRepo().catch(() => false);
      if (!isRepo) {
        throw new Error("Not a valid git repository at the given path.");
      }

      // Get repo name
      const remoteResult = await git
        .remote(["get-url", "origin"])
        .catch(() => null);
      const repoName =
        remoteResult
          ?.trim()
          .split("/")
          .pop()
          ?.replace(/\.git$/, "") ?? input.repoPath.split("/").pop() ?? "repo";

      type RawCommit = {
        hash: string;
        author: string;
        email: string;
        date: string;
        message: string;
        parsedDate: Date;
      };

      // Run commit log + shortstat in parallel for speed.
      // Shortstat is capped at 3000 to stay fast (~3-4s even on large repos).
      const STATS_CAP = 3000;
      const [rawOutput, statsOutput] = await Promise.all([
        git.raw([
          "log",
          `--max-count=${input.maxCommits}`,
          "--no-merges",
          "--date=iso-strict",
          "--format=%H|%an|%ae|%aI|%s",
        ]),
        git.raw([
          "log",
          `--max-count=${STATS_CAP}`,
          "--no-merges",
          "--shortstat",
          "--format=%an",   // author name per commit — lets us build per-author maps
        ]),
      ]);

      // Parse per-author diff stats.
      // Output interleaves author-name lines with shortstat lines (+ blank separators).
      const perAuthorFilesChanged: Record<string, number> = {};
      const perAuthorLinesAdded: Record<string, number> = {};
      const perAuthorLinesRemoved: Record<string, number> = {};
      let currentStatsAuthor: string | null = null;
      for (const line of statsOutput.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        if (/\d+ file/.test(t)) {
          // shortstat summary line — attribute to current author
          if (currentStatsAuthor) {
            const fm = /(\d+) file/.exec(t);
            const am = /(\d+) insertion/.exec(t);
            const rm = /(\d+) deletion/.exec(t);
            if (fm) perAuthorFilesChanged[currentStatsAuthor] = (perAuthorFilesChanged[currentStatsAuthor] ?? 0) + parseInt(fm[1]!, 10);
            if (am) perAuthorLinesAdded[currentStatsAuthor] = (perAuthorLinesAdded[currentStatsAuthor] ?? 0) + parseInt(am[1]!, 10);
            if (rm) perAuthorLinesRemoved[currentStatsAuthor] = (perAuthorLinesRemoved[currentStatsAuthor] ?? 0) + parseInt(rm[1]!, 10);
          }
        } else {
          // author name line
          currentStatsAuthor = t;
        }
      }

      // Derive totals from per-author maps
      const filesChanged = Object.values(perAuthorFilesChanged).reduce((s, c) => s + c, 0);
      const linesAdded = Object.values(perAuthorLinesAdded).reduce((s, c) => s + c, 0);
      const linesRemoved = Object.values(perAuthorLinesRemoved).reduce((s, c) => s + c, 0);

      const commits: RawCommit[] = [];

      const lines = rawOutput
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      for (const line of lines) {
        const idx1 = line.indexOf("|");
        const idx2 = line.indexOf("|", idx1 + 1);
        const idx3 = line.indexOf("|", idx2 + 1);
        const idx4 = line.indexOf("|", idx3 + 1);
        if (idx4 === -1) continue;

        const hash = line.slice(0, idx1);
        const author = line.slice(idx1 + 1, idx2);
        const email = line.slice(idx2 + 1, idx3);
        const dateStr = line.slice(idx3 + 1, idx4);
        const message = line.slice(idx4 + 1);

        const parsedDate = safeParseISO(dateStr);
        if (!parsedDate) continue;

        commits.push({ hash, author, email, date: dateStr, message, parsedDate });
      }

      if (commits.length === 0) {
        return {
          repoName,
          totalCommits: 0,
          uniqueContributors: 0,
          activeDays: 0,
          longestStreak: 0,
          firstCommit: null,
          lastCommit: null,
          topAuthors: [],
          timeline: [],
          heatmapData: [],
          distribution: [],
          hourlyActivity: Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            label: h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
            count: 0,
          })),
          dailyActivity: Array.from({ length: 7 }, (_, d) => ({
            day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]!,
            count: 0,
          })),
          contributors: [],
          recentCommits: [],
          commitsByDate: {} as Record<string, number>,
          perAuthorDateMap: {} as Record<string, Record<string, number>>,
          perAuthorHourMap: {} as Record<string, Record<number, number>>,
          perAuthorDayMap: {} as Record<string, Record<number, number>>,
          filesChanged: 0,
          linesAdded: 0,
          linesRemoved: 0,
          perAuthorFilesChanged: {} as Record<string, number>,
          perAuthorLinesAdded: {} as Record<string, number>,
          perAuthorLinesRemoved: {} as Record<string, number>,
        };
      }

      // ── Aggregations ───────────────────────────────────────────────────────────

      // Commits by user
      const commitsByUser: Record<string, number> = {};
      const emailByUser: Record<string, string> = {};
      const firstCommitByUser: Record<string, Date> = {};
      const lastCommitByUser: Record<string, Date> = {};
      const activeDaysByUser: Record<string, Set<string>> = {};

      for (const c of commits) {
        commitsByUser[c.author] = (commitsByUser[c.author] ?? 0) + 1;
        emailByUser[c.author] = c.email;

        const existing = firstCommitByUser[c.author];
        if (!existing || c.parsedDate < existing) firstCommitByUser[c.author] = c.parsedDate;
        const existingLast = lastCommitByUser[c.author];
        if (!existingLast || c.parsedDate > existingLast) lastCommitByUser[c.author] = c.parsedDate;

        const dayStr = format(c.parsedDate, "yyyy-MM-dd");
        if (!activeDaysByUser[c.author]) activeDaysByUser[c.author] = new Set();
        activeDaysByUser[c.author]!.add(dayStr);
      }

      // Top authors by commit count
      const topAuthors = Object.entries(commitsByUser)
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name);

      // ── Per-author breakdowns (top authors only) ─────────────────────────────
      // Build these first — aggregates below are derived from them so that the
      // filter pills cover 100% of the data shown in every chart.
      const perAuthorDateMap: Record<string, Record<string, number>> = {};
      const perAuthorHourMap: Record<string, Record<number, number>> = {};
      const perAuthorDayMap: Record<string, Record<number, number>> = {};

      for (const c of commits) {
        if (!topAuthors.includes(c.author)) continue;
        const dayStr = format(c.parsedDate, "yyyy-MM-dd");
        const hour = getHours(c.parsedDate);
        const dow = getDay(c.parsedDate);

        if (!perAuthorDateMap[c.author]) perAuthorDateMap[c.author] = {};
        perAuthorDateMap[c.author][dayStr] = (perAuthorDateMap[c.author][dayStr] ?? 0) + 1;

        if (!perAuthorHourMap[c.author]) perAuthorHourMap[c.author] = {};
        perAuthorHourMap[c.author][hour] = (perAuthorHourMap[c.author][hour] ?? 0) + 1;

        if (!perAuthorDayMap[c.author]) perAuthorDayMap[c.author] = {};
        perAuthorDayMap[c.author][dow] = (perAuthorDayMap[c.author][dow] ?? 0) + 1;
      }

      // Aggregate charts derived from top-8 only (so filter fully controls them)
      const commitsByDate: Record<string, number> = {};
      for (const authorMap of Object.values(perAuthorDateMap)) {
        for (const [date, count] of Object.entries(authorMap)) {
          commitsByDate[date] = (commitsByDate[date] ?? 0) + count;
        }
      }

      const hourMap: Record<number, number> = {};
      for (let i = 0; i < 24; i++) hourMap[i] = 0;
      for (const authorMap of Object.values(perAuthorHourMap)) {
        for (const [hour, count] of Object.entries(authorMap)) {
          hourMap[+hour] = (hourMap[+hour] ?? 0) + count;
        }
      }

      const dayMap: Record<number, number> = {};
      for (let i = 0; i < 7; i++) dayMap[i] = 0;
      for (const authorMap of Object.values(perAuthorDayMap)) {
        for (const [dow, count] of Object.entries(authorMap)) {
          dayMap[+dow] = (dayMap[+dow] ?? 0) + count;
        }
      }

      // Weekly timeline per top author
      const weeklyMap: Record<string, Record<string, number>> = {};
      for (const c of commits) {
        if (!topAuthors.includes(c.author)) continue;
        const week = format(startOfWeek(c.parsedDate), "yyyy-MM-dd");
        if (!weeklyMap[week]) weeklyMap[week] = {};
        weeklyMap[week][c.author] = (weeklyMap[week][c.author] ?? 0) + 1;
      }
      const timeline = Object.entries(weeklyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, data]) => ({ week, ...data }));

      // Active days total
      const allActiveDays = new Set<string>(Object.keys(commitsByDate));
      const longestStreak = computeLongestStreak(allActiveDays);
      const activeDays = allActiveDays.size;

      // First / last commit
      const sortedCommits = [...commits].sort(
        (a, b) => a.parsedDate.getTime() - b.parsedDate.getTime()
      );
      const firstCommit = sortedCommits[0]?.date ?? null;
      const lastCommit = sortedCommits[sortedCommits.length - 1]?.date ?? null;

      // Heatmap — last 365 days only
      const yearAgo = subDays(new Date(), 365);
      const heatmapData = Object.entries(commitsByDate)
        .filter(([d]) => parseISO(d) >= yearAgo)
        .map(([date, count]) => ({ date, count }));

      // Distribution
      const total = commits.length;
      const distribution = topAuthors.map((name) => ({
        name,
        value: commitsByUser[name] ?? 0,
        percentage: Math.round(((commitsByUser[name] ?? 0) / total) * 100),
      }));

      // Hourly activity
      const hourlyActivity = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        label: h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
        count: hourMap[h] ?? 0,
      }));

      // Daily activity (day of week)
      const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dailyActivity = Array.from({ length: 7 }, (_, d) => ({
        day: dayLabels[d]!,
        count: dayMap[d] ?? 0,
      }));

      // Contributors leaderboard
      const contributors = topAuthors.map((name) => ({
        name,
        email: emailByUser[name] ?? "",
        commits: commitsByUser[name] ?? 0,
        percentage: Math.round(((commitsByUser[name] ?? 0) / total) * 100),
        firstCommit: firstCommitByUser[name]
          ? format(firstCommitByUser[name]!, "MMM d, yyyy")
          : "",
        lastCommit: lastCommitByUser[name]
          ? format(lastCommitByUser[name]!, "MMM d, yyyy")
          : "",
        activeDays: activeDaysByUser[name]?.size ?? 0,
      }));

      // Recent commits
      const recentCommits = commits.slice(0, 30).map((c) => ({
        hash: c.hash.slice(0, 7),
        author: c.author,
        message: c.message.slice(0, 80),
        date: format(c.parsedDate, "MMM d, yyyy"),
        relativeDate: formatRelative(c.parsedDate),
        sortKey: c.parsedDate.toISOString(),
      }));

      return {
        repoName,
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
        filesChanged,
        linesAdded,
        linesRemoved,
        perAuthorFilesChanged,
        perAuthorLinesAdded,
        perAuthorLinesRemoved,
      };
    }),
});

// ── Directory browser ──────────────────────────────────────────────────────────

export const dirRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      const { readdir, stat } = await import("fs/promises");
      const { join, dirname, basename } = await import("path");
      const { existsSync } = await import("fs");
      const os = await import("os");

      const rawPath = input.path.replace(/^~/, os.homedir());
      const dirPath = rawPath || os.homedir();

      let entries: Array<{ name: string; path: string; isGitRepo: boolean; isDir: boolean }> = [];

      try {
        const dirents = await readdir(dirPath, { withFileTypes: true });
        const visible = dirents.filter(
          (e) => !e.name.startsWith(".")
        );

        const checked = await Promise.all(
          visible.map(async (e) => {
            const fullPath = join(dirPath, e.name);
            let isDir = false;
            let isGitRepo = false;
            try {
              const s = await stat(fullPath);
              isDir = s.isDirectory();
              if (isDir) isGitRepo = existsSync(join(fullPath, ".git"));
            } catch {
              // skip inaccessible
            }
            return { name: e.name, path: fullPath, isDir, isGitRepo };
          })
        );

        entries = checked
          .filter((e) => e.isDir)
          .sort((a, b) => {
            if (a.isGitRepo !== b.isGitRepo) return a.isGitRepo ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
      } catch {
        // Permission denied, etc. — return empty
      }

      const isCurrentGitRepo = existsSync(join(dirPath, ".git"));
      const parent = dirname(dirPath);
      const hasParent = parent !== dirPath;

      return {
        path: dirPath,
        name: basename(dirPath) || dirPath,
        parent: hasParent ? parent : null,
        entries,
        isGitRepo: isCurrentGitRepo,
      };
    }),
});

function formatRelative(date: Date): string {
  const diff = differenceInDays(new Date(), date);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.round(diff / 7)}w ago`;
  if (diff < 365) return `${Math.round(diff / 30)}mo ago`;
  return `${Math.round(diff / 365)}y ago`;
}
