import React from 'react';
import type { StreamMetrics } from '../../../packages/core/src/index.js';

function fmt(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function MetricBar({ metrics }: { metrics: StreamMetrics }) {
  const tiles = [
    { label: 'Total Rows',  value: fmt(metrics.totalRows),    hi: false },
    { label: 'Rows/sec',    value: fmt(metrics.rowsPerSecond), hi: false, color: '#10b981' },
    { label: 'Dropped',     value: fmt(metrics.droppedRows),   hi: metrics.droppedRows > 0, color: '#f59e0b' },
    { label: 'Anomalies',   value: String(metrics.anomalyCount), hi: metrics.anomalyCount > 0, color: '#ef4444' },
    { label: 'Buffer',      value: `${(metrics.bufferUtilization * 100).toFixed(0)}%`,
      hi: metrics.bufferUtilization > 0.8, color: metrics.bufferUtilization > 0.8 ? '#ef4444' : undefined },
  ];
  return (
    <div className="metric-bar">
      {tiles.map((t) => (
        <div key={t.label} className="metric-tile">
          <div className="metric-value" style={{ color: t.color }}>{t.value}</div>
          <div className="metric-label">{t.label}</div>
        </div>
      ))}
    </div>
  );
}
