/**
 * AnomalyHeatmap — Shows anomaly frequency per column as a color-coded bar chart.
 * Useful for seeing which sensors/columns spike most often.
 */
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { AnomalyEvent } from '../../../packages/core/src/index.js';

interface AnomalyHeatmapProps {
  anomalies: AnomalyEvent[];
  height?:   number;
  title?:    string;
}

const SEV_ORDER = { critical: 3, warning: 2, info: 1 };

export function AnomalyHeatmap({ anomalies, height = 200, title = 'Anomalies by Column' }: AnomalyHeatmapProps) {
  const data = useMemo(() => {
    const counts = new Map<string, { info: number; warning: number; critical: number }>();
    for (const ev of anomalies) {
      if (!counts.has(ev.columnId)) counts.set(ev.columnId, { info: 0, warning: 0, critical: 0 });
      counts.get(ev.columnId)![ev.severity]++;
    }
    return Array.from(counts.entries())
      .map(([col, c]) => ({ col, ...c, total: c.info + c.warning + c.critical }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [anomalies]);

  if (data.length === 0) {
    return (
      <div className="chart-card" style={{ height }}>
        <div className="chart-title">{title}</div>
        <div className="chart-empty">No anomalies yet</div>
      </div>
    );
  }

  return (
    <div className="chart-card" style={{ minHeight: height }}>
      <div className="chart-title">{title}</div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="col" tick={{ fontSize: 11, fill: 'var(--text-2)' }} width={58} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, boxShadow: 'var(--shadow)' }}
            itemStyle={{ color: 'var(--text)' }}
          />
          <Bar dataKey="critical" name="Critical" stackId="a" fill="#ef4444" isAnimationActive={false} />
          <Bar dataKey="warning"  name="Warning"  stackId="a" fill="#f59e0b" isAnimationActive={false} />
          <Bar dataKey="info"     name="Info"     stackId="a" fill="#3b82f6" isAnimationActive={false} radius={[0,4,4,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
