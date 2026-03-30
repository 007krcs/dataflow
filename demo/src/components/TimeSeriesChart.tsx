/**
 * TimeSeriesChart — Multi-series line chart with live streaming data.
 * Shows up to N series (e.g. multiple symbols) over a rolling time window.
 */
import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { StreamRow } from '../../../packages/core/src/index.js';

interface TimeSeriesChartProps {
  history:    Map<string, { t: number; v: number }[]>;  // seriesKey → [{t, v}]
  maxPoints?: number;
  yLabel?:    string;
  title?:     string;
  height?:    number;
  formatY?:   (v: number) => string;
}

const PALETTE = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#ec4899','#84cc16','#f97316','#3b82f6',
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}

export function TimeSeriesChart({
  history,
  maxPoints = 60,
  yLabel = 'Value',
  title,
  height = 260,
  formatY,
}: TimeSeriesChartProps) {
  const series = Array.from(history.keys()).slice(0, 10);

  // Build unified time axis — merge all series timestamps
  const chartData = useMemo(() => {
    if (series.length === 0) return [];
    // Collect all timestamps across all series, sorted
    const allTs = new Set<number>();
    for (const key of series) {
      for (const pt of (history.get(key) ?? []).slice(-maxPoints)) allTs.add(pt.t);
    }
    const times = Array.from(allTs).sort((a, b) => a - b).slice(-maxPoints);
    return times.map((t) => {
      const row: Record<string, number | string> = { t, label: formatTime(t) };
      for (const key of series) {
        const pts = history.get(key) ?? [];
        // Find closest point at or before this timestamp
        const pt = pts.filter((p) => p.t <= t).at(-1);
        if (pt) row[key] = pt.v;
      }
      return row;
    });
  }, [history, series, maxPoints]);

  if (chartData.length === 0) {
    return (
      <div className="chart-card" style={{ height }}>
        {title && <div className="chart-title">{title}</div>}
        <div className="chart-empty">Waiting for data…</div>
      </div>
    );
  }

  return (
    <div className="chart-card" style={{ minHeight: height }}>
      {title && <div className="chart-title">{title}</div>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#64748b' }}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={{ stroke: '#334155' }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickFormatter={formatY ?? ((v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}K` : String(Math.round(v)))}
            tickLine={false}
            axisLine={false}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 10 }}
            width={52}
          />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
            itemStyle={{ color: '#f1f5f9' }}
            labelStyle={{ color: '#64748b', marginBottom: 4 }}
            formatter={(v: number, name: string) => [formatY ? formatY(v) : v.toFixed(2), name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8, color: '#94a3b8' }}
            iconType="circle"
            iconSize={6}
          />
          {series.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Hook to build history map from streaming rows ────────────────────────────

export function useSeriesHistory(
  rows: StreamRow[],
  idField: string,
  valueField: string,
  maxPoints = 60,
): Map<string, { t: number; v: number }[]> {
  return useMemo(() => {
    const map = new Map<string, { t: number; v: number }[]>();
    for (const row of rows) {
      const key = String(row[idField] ?? row.id);
      const val = Number(row[valueField]);
      if (!isFinite(val)) continue;
      if (!map.has(key)) map.set(key, []);
      const arr = map.get(key)!;
      arr.push({ t: row.timestamp, v: val });
      if (arr.length > maxPoints) arr.splice(0, arr.length - maxPoints);
    }
    return map;
  }, [rows, idField, valueField, maxPoints]);
}
