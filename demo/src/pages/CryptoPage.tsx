import React, { useState, useMemo } from 'react';
import { useStream }             from '../hooks/useStream.ts';
import { StreamTable }           from '../components/StreamTable.tsx';
import { MetricBar }             from '../components/MetricBar.tsx';
import { ConnectionBadge }       from '../components/ConnectionBadge.tsx';
import { AnomalyPanel }          from '../components/AnomalyPanel.tsx';
import { TimeSeriesChart }       from '../components/TimeSeriesChart.tsx';
import { CandlestickChart }      from '../components/CandlestickChart.tsx';
import { AnomalyHeatmap }        from '../components/AnomalyHeatmap.tsx';
import { SparklineCell }         from '../components/SparklineCell.tsx';
import type { StreamConfig, StreamRow } from '../../../packages/core/src/index.js';

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

const TABLE_COLUMNS = [
  { key: 'symbol',    label: 'Pair',       width: 100, align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'price',     label: 'Price',      width: 120, align: 'right' as const, format: (v: unknown) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
  { key: 'open',      label: 'Open',       width: 110, align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'high',      label: '24H High',   width: 110, align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'low',       label: '24H Low',    width: 110, align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'volume',    label: 'Volume',     width: 120, align: 'right' as const, format: (v: unknown) => Number(v).toLocaleString() },
  { key: 'marketCap', label: 'MCap $B',    width: 100, align: 'right' as const, format: (v: unknown) => `${Number(v).toFixed(2)}B` },
  { key: '_spark',    label: 'Trend',      width: 100, align: 'center' as const, format: () => '' },
];

type PageTab = 'table' | 'charts' | 'anomalies';

export function CryptoPage() {
  const { rows, changes, status, metrics, anomalies, start, stop } = useStream(CONFIG, { maxRows: 500 });
  const [tab, setTab]            = useState<PageTab>('table');
  const [anomList, setAnomList]  = useState<typeof anomalies>([]);
  const [selectedSym, setSelectedSym] = useState('BTC/USDT');
  React.useEffect(() => { setAnomList(anomalies); }, [anomalies]);

  // Latest row per symbol
  const latestBySymbol = useMemo(() => {
    const map = new Map<string, StreamRow>();
    for (const r of rows) { if (r.symbol) map.set(String(r.symbol), r); }
    return Array.from(map.values());
  }, [rows]);

  // Price history per symbol (for sparklines)
  const priceHistory = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const r of rows) {
      const sym = String(r.symbol ?? r.id);
      if (!map.has(sym)) map.set(sym, []);
      const arr = map.get(sym)!;
      arr.push(Number(r.price));
      if (arr.length > 60) arr.splice(0, arr.length - 60);
    }
    return map;
  }, [rows]);

  // Time-series history (top 5 symbols)
  const tsHistory = useMemo(() => {
    const map = new Map<string, { t: number; v: number }[]>();
    const top5 = latestBySymbol.slice(0, 5).map((r) => String(r.symbol));
    for (const r of rows) {
      const sym = String(r.symbol ?? r.id);
      if (!top5.includes(sym)) continue;
      if (!map.has(sym)) map.set(sym, []);
      const arr = map.get(sym)!;
      arr.push({ t: r.timestamp, v: Number(r.price) });
      if (arr.length > 60) arr.splice(0, arr.length - 60);
    }
    return map;
  }, [rows, latestBySymbol]);

  // OHLC rows for selected symbol
  const ohlcRows = useMemo(() => rows.filter((r) => String(r.symbol) === selectedSym).slice(-40), [rows, selectedSym]);

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Crypto Market Feed</h1>
          <p className="page-sub">20 crypto pairs · 300ms ticks · Higher volatility · MAD + IQR anomaly detection</p>
        </div>
        <div className="page-actions">
          <div className="page-tabs">
            {(['table', 'charts', 'anomalies'] as PageTab[]).map((t) => (
              <button key={t} className={`page-tab ${tab === t ? 'page-tab--active' : ''}`} onClick={() => setTab(t)}>
                {t === 'table' ? '⊞ Table' : t === 'charts' ? '📈 Charts' : '🔬 Anomalies'}
              </button>
            ))}
          </div>
          <ConnectionBadge status={status} latencyMs={metrics.latencyMs} />
          {status === 'connected'
            ? <button className="btn btn-danger"  onClick={stop}>⏹ Stop</button>
            : <button className="btn btn-primary" onClick={start}>▶ Start</button>
          }
        </div>
      </div>

      <MetricBar metrics={metrics} />

      {/* TABLE TAB */}
      {tab === 'table' && (
        <div className="page-body">
          <StreamTable
            rows={latestBySymbol.map((r) => ({
              ...r,
              _spark: priceHistory.get(String(r.symbol)) ?? [],
            }))}
            changes={changes}
            columns={TABLE_COLUMNS}
            maxRows={20}
            customCell={(col, val) => {
              if (col === '_spark') {
                const history = val as number[];
                const last2 = history.slice(-2);
                const color = last2.length >= 2
                  ? (last2[1]! > last2[0]! ? '#10b981' : '#ef4444')
                  : '#6366f1';
                return <SparklineCell data={history} color={color} />;
              }
              return null;
            }}
          />
        </div>
      )}

      {/* CHARTS TAB */}
      {tab === 'charts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Symbol selector */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {latestBySymbol.slice(0, 10).map((r) => {
              const sym = String(r.symbol);
              const hist = priceHistory.get(sym) ?? [];
              const last2 = hist.slice(-2);
              const up = last2.length >= 2 && last2[1]! > last2[0]!;
              return (
                <button
                  key={sym}
                  className={`btn ${selectedSym === sym ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setSelectedSym(sym)}
                  style={{ fontFamily: 'var(--mono)', fontSize: 12, padding: '4px 10px' }}
                >
                  {sym}
                  <span style={{ color: up ? '#10b981' : '#ef4444', marginLeft: 4, fontSize: 10 }}>
                    {up ? '▲' : '▼'} ${Number(r.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="charts-grid">
            <CandlestickChart rows={ohlcRows} symbol={selectedSym} height={280} />
            <TimeSeriesChart
              history={tsHistory}
              title="Price — Top 5 Pairs"
              yLabel="Price $"
              height={280}
              formatY={(v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(2)}`}
            />
          </div>
        </div>
      )}

      {/* ANOMALIES TAB */}
      {tab === 'anomalies' && (
        <div className="charts-grid">
          <AnomalyHeatmap anomalies={anomList} height={240} />
          <AnomalyPanel anomalies={anomList} onClear={() => setAnomList([])} />
        </div>
      )}
    </div>
  );
}
