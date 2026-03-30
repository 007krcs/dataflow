import React, { useState } from 'react';
import { useStream }        from '../hooks/useStream.ts';
import { StreamTable }      from '../components/StreamTable.tsx';
import { MetricBar }        from '../components/MetricBar.tsx';
import { ConnectionBadge }  from '../components/ConnectionBadge.tsx';
import { AnomalyPanel }     from '../components/AnomalyPanel.tsx';
import type { StreamConfig } from '../../../packages/core/src/index.js';

const CONFIG: StreamConfig = {
  adapter: {
    type:           'simulated',
    scenario:       'crypto',
    entityCount:    20,
    tickIntervalMs: 300,
    seed:           99,
    anomalyRate:    0.04,
  },
  anomaly: { enabled: true, methods: ['zscore', 'iqr', 'mad'], windowSize: 50, minSamples: 10, zScoreThreshold: 2.0 },
  backpressure: { maxBufferSize: 5000, targetFps: 30 },
};

const COLUMNS = [
  { key: 'symbol',    label: 'Pair',       width: 100, align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'price',     label: 'Price',      width: 120, align: 'right' as const, format: (v: unknown) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
  { key: 'open',      label: 'Open',       width: 110, align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'high',      label: '24H High',   width: 110, align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'low',       label: '24H Low',    width: 110, align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'volume',    label: 'Volume',     width: 120, align: 'right' as const, format: (v: unknown) => Number(v).toLocaleString() },
  { key: 'marketCap', label: 'MCap $B',    width: 100, align: 'right' as const, format: (v: unknown) => `${Number(v).toFixed(2)}B` },
];

export function CryptoPage() {
  const { rows, changes, status, metrics, anomalies, start, stop } = useStream(CONFIG, { maxRows: 20 });
  const [showAnomaly, setShowAnomaly] = useState(true);
  const [anomList, setAnomList] = useState(anomalies);
  React.useEffect(() => { setAnomList(anomalies); }, [anomalies]);

  const latestBySymbol = React.useMemo(() => {
    const map = new Map<string, typeof rows[0]>();
    for (const r of rows) { if (r.symbol) map.set(String(r.symbol), r); }
    return Array.from(map.values());
  }, [rows]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Crypto Market Feed</h1>
          <p className="page-sub">20 crypto pairs · 300ms ticks · Higher volatility · MAD + IQR anomaly detection</p>
        </div>
        <div className="page-actions">
          <ConnectionBadge status={status} />
          <button className="btn btn-ghost" onClick={() => setShowAnomaly(!showAnomaly)}>
            🔬 Anomalies {anomList.length > 0 && <span className="badge-count">{anomList.length}</span>}
          </button>
          {status === 'connected'
            ? <button className="btn btn-danger" onClick={stop}>⏹ Stop</button>
            : <button className="btn btn-primary" onClick={start}>▶ Start</button>
          }
        </div>
      </div>

      <MetricBar metrics={metrics} />

      <div className="page-body">
        <StreamTable rows={latestBySymbol} changes={changes} columns={COLUMNS} maxRows={20} />
        {showAnomaly && (
          <AnomalyPanel anomalies={anomList} onClear={() => setAnomList([])} />
        )}
      </div>
    </div>
  );
}
