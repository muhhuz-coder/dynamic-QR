'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface DailyTrendPoint {
  date: string;
  scans: number;
}

export function ScanTrendChart({ dailyTrend }: { dailyTrend: DailyTrendPoint[] }) {
  if (dailyTrend.length === 0) {
    return <p className="text-muted text-sm">No scans in this period yet.</p>;
  }

  const sorted = [...dailyTrend].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={sorted}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted)" />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted)" />
        <Tooltip
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            fontSize: 12,
          }}
        />
        <Line type="monotone" dataKey="scans" stroke="var(--accent)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface BreakdownCounts {
  [key: string]: number;
}

export function BreakdownBarChart({
  counts,
  colorVar = 'var(--accent)',
}: {
  counts: BreakdownCounts;
  colorVar?: string;
}) {
  const data = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({ name, count }));

  if (data.length === 0) {
    return <p className="text-muted text-sm">No data in this period yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted)" />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11 }}
          stroke="var(--muted)"
          width={70}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            fontSize: 12,
          }}
        />
        <Bar dataKey="count" fill={colorVar} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Geographic breakdown as a ranked table — skips an actual map, see docs/core-logic/02-qr-management.md. */
export function LocationRankedList({ byLocation }: { byLocation: Record<string, number> }) {
  const rows = Object.entries(byLocation)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (rows.length === 0) {
    return <p className="text-muted text-sm">No location data in this period yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {rows.map(([city, count]) => (
        <li
          key={city}
          className="border-border flex items-center justify-between border-b py-1 last:border-0"
        >
          <span className="text-foreground">{city}</span>
          <span className="text-muted">{count}</span>
        </li>
      ))}
    </ul>
  );
}
