import type { StreamMetrics } from '@dataflow/core';

interface MetricBarProps {
  metrics: StreamMetrics;
  className?: string;
}

interface Tile {
  label: string;
  value: string | number;
  color?: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function MetricBar({ metrics, className = '' }: MetricBarProps) {
  const tiles: Tile[] = [
    { label: 'Total Rows',  value: fmt(metrics.totalRows) },
    { label: 'Rows/sec',    value: fmt(metrics.rowsPerSecond), color: '#10b981' },
    { label: 'Dropped',     value: fmt(metrics.droppedRows),   color: metrics.droppedRows > 0 ? '#f59e0b' : undefined },
    { label: 'Anomalies',   value: metrics.anomalyCount,        color: metrics.anomalyCount > 0 ? '#ef4444' : undefined },
    { label: 'Buffer',      value: `${(metrics.bufferUtilization * 100).toFixed(0)}%`,
      color: metrics.bufferUtilization > 0.8 ? '#ef4444' : metrics.bufferUtilization > 0.5 ? '#f59e0b' : undefined },
    ...(metrics.latencyMs > 0 ? [{ label: 'Latency', value: `${metrics.latencyMs}ms` }] : []),
  ];

  return (
    <div
      className={`df-metric-bar ${className}`}
      style={{
        display:       'flex',
        gap:           '1px',
        background:    'rgba(255,255,255,0.06)',
        borderRadius:  8,
        overflow:      'hidden',
        border:        '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          style={{
            flex:        1,
            padding:     '8px 12px',
            textAlign:   'center',
            borderRight: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: t.color ?? '#f1f5f9', fontVariantNumeric: 'tabular-nums' }}>
            {t.value}
          </div>
          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
            {t.label}
          </div>
        </div>
      ))}
    </div>
  );
}
