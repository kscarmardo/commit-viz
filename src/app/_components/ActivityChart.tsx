"use client";

import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";

type HourEntry = { hour: number; label: string; count: number };
type DayEntry = { day: string; count: number };

type Props = {
  hourlyActivity: HourEntry[];
  dailyActivity: DayEntry[];
};

function HourTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: HourEntry }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="glass-bright rounded-xl px-3 py-2 shadow-xl">
      <div className="text-white font-semibold text-sm">{d.label}</div>
      <div className="text-white/50 text-xs mt-0.5">
        {d.count.toLocaleString()} commits
      </div>
    </div>
  );
}

function DayTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DayEntry }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="glass-bright rounded-xl px-3 py-2 shadow-xl">
      <div className="text-white font-semibold text-sm">{d.day}</div>
      <div className="text-white/50 text-xs mt-0.5">
        {d.count.toLocaleString()} commits
      </div>
    </div>
  );
}

const HOUR_GRADIENT_ID = "hourGrad";
const DAY_GRADIENT_ID = "dayGrad";

export function ActivityChart({ hourlyActivity, dailyActivity }: Props) {
  const maxHour = Math.max(...hourlyActivity.map((d) => d.count), 1);
  const maxDay = Math.max(...dailyActivity.map((d) => d.count), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="glass rounded-2xl p-6 flex flex-col gap-6"
    >
      {/* Hourly */}
      <div>
        <h2 className="text-white font-semibold text-lg">Activity Patterns</h2>
        <p className="text-white/40 text-sm mt-0.5">When do commits happen?</p>
      </div>

      <div>
        <div className="text-white/40 text-xs font-medium uppercase tracking-widest mb-3">
          By Hour of Day
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart
            data={hourlyActivity}
            margin={{ top: 0, right: 0, left: -30, bottom: 0 }}
            barCategoryGap="20%"
          >
            <defs>
              <linearGradient id={HOUR_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#818cf8" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              horizontal={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "rgba(245,245,247,0.3)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={3}
            />
            <YAxis hide />
            <Tooltip content={<HourTooltip />} cursor={false} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {hourlyActivity.map((entry) => (
                <Cell
                  key={entry.hour}
                  fill={`url(#${HOUR_GRADIENT_ID})`}
                  opacity={0.5 + 0.5 * (entry.count / maxHour)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Day of week */}
      <div>
        <div className="text-white/40 text-xs font-medium uppercase tracking-widest mb-3">
          By Day of Week
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart
            data={dailyActivity}
            margin={{ top: 0, right: 0, left: -30, bottom: 0 }}
            barCategoryGap="25%"
          >
            <defs>
              <linearGradient id={DAY_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              horizontal={false}
            />
            <XAxis
              dataKey="day"
              tick={{ fill: "rgba(245,245,247,0.3)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip content={<DayTooltip />} cursor={false} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {dailyActivity.map((entry, i) => (
                <Cell
                  key={i}
                  fill={`url(#${DAY_GRADIENT_ID})`}
                  opacity={0.4 + 0.6 * (entry.count / maxDay)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
