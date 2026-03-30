import React, { useState } from 'react';
import { StreamingEngine }   from '../../../packages/core/src/index.js';
import { useStream }         from '../hooks/useStream.ts';
import { StreamTable }       from '../components/StreamTable.tsx';
import { MetricBar }         from '../components/MetricBar.tsx';
import { ConnectionBadge }   from '../components/ConnectionBadge.tsx';
import { AnomalyPanel }      from '../components/AnomalyPanel.tsx';
import type { StreamConfig } from '../../../packages/core/src/index.js';

const CONFIG: StreamConfig = {
  adapter: {
    type:          'simulated',
    scenario:      'financial',
    entityCount:   20,
    tickIntervalMs: 400,
    seed:          42,
  },
  anomaly: { enabled: true, methods: ['zscore', 'iqr'], windowSize: 60, minSamples: 15 },
  backpressure: { maxBufferSize: 5000, targetFps: 30 },
};

const COLUMNS = [
  { key: 'symbol',    label: 'Symbol',     width: 90,  align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'price',     label: 'Price',      width: 100, align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'open',      label: 'Open',       width: 90,  align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'high',      label: 'High',       width: 90,  align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'low',       label: 'Low',        width: 90,  align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'bid',       label: 'Bid',        width: 90,  align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'ask',       label: 'Ask',        width: 90,  align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'volume',    label: 'Volume',     width: 110, align: 'right' as const, format: (v: unknown) => Number(v).toLocaleString() },
  { key: 'marketCap', label: 'Mkt Cap $B', width: 110, align: 'right' as const, format: (v: unknown) => `${Number(v).toFixed(2)}B` },
];

export function FinancialPage() {
  const { rows, changes, status, metrics, anomalies, start, stop } = useStream(CONFIG, { maxRows: 20 });
  const [showAnomaly, setShowAnomaly] = useState(false);
  const [anomList, setAnomList] = useState(anomalies);

  React.useEffect(() => { setAnomList(anomalies); }, [anomalies]);

  // Keep only latest row per symbol
  const latestBySymbol = React.useMemo(() => {
    const map = new Map<string, typeof rows[0]>();
    for (const r of rows) { if (r.symbol) map.set(String(r.symbol), r); }
    return Array.from(map.values());
  }, [rows]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Market Feed</h1>
          <p className="page-sub">Live prices via Geometric Brownian Motion simulation — 20 symbols, 400ms ticks</p>
        </div>
        <div className="page-actions">
          <ConnectionBadge status={status} latencyMs={metrics.latencyMs} />
          <button className="btn btn-ghost" onClick={() => setShowAnomaly(!showAnomaly)}>
            🔬 Anomalies {anomList.length > 0 && <span className="badge-count">{anomList.length}</span>}
          </button>
          {status === 'connected'
            ? <button className="btn btn-danger"  onClick={stop}>⏹ Stop</button>
            : <button className="btn btn-primary" onClick={start}>▶ Start</button>
          }
        </div>
      </div>

      <MetricBar metrics={metrics} />

      <div className="page-body">
        <StreamTable
          rows={latestBySymbol}
          changes={changes}
          columns={COLUMNS}
          maxRows={20}
        />
        {showAnomaly && (
          <AnomalyPanel
            anomalies={anomList}
            onClear={() => setAnomList([])}
          />
        )}
      </div>
    </div>
  );
}
