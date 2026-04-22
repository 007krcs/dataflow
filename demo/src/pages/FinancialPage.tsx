import React, { useState, useMemo, useCallback, useEffect } from 'react';
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

// ─── Configs ──────────────────────────────────────────────────────────────────

const NORMAL_CONFIG: StreamConfig = {
  adapter: { type: 'simulated', scenario: 'financial', entityCount: 20, tickIntervalMs: 400, seed: 42 },
  anomaly: { enabled: true, methods: ['zscore', 'iqr'], windowSize: 60, minSamples: 15 },
  backpressure: { maxBufferSize: 5000, targetFps: 30 },
};

const STRESS_CONFIG: StreamConfig = {
  adapter: { type: 'simulated', scenario: 'financial', entityCount: 80, tickIntervalMs: 20, anomalyRate: 0.08, seed: 99 },
  anomaly: { enabled: true, methods: ['zscore', 'iqr'], windowSize: 40, minSamples: 8, zScoreThreshold: 2.0 },
  backpressure: { maxBufferSize: 5000, targetFps: 30 },
};

const CODE_SNIPPET = `import { useStream } from '@gridstorm/dataflow-react';

const { rows, metrics, anomalies } = useStream({
  adapter: {
    type: 'simulated',
    scenario: 'financial',
    entityCount: 20,
    tickIntervalMs: 400,
  },
  anomaly: {
    enabled: true,
    methods: ['zscore', 'iqr'],
    windowSize: 60,
  },
  backpressure: {
    maxBufferSize: 5000,
    targetFps: 60,
  },
});
// rows     → live-updated rolling window of StreamRow[]
// metrics  → { totalRows, rowsPerSecond, droppedRows, bufferUtilization, … }
// anomalies→ detected outliers with z-scores, column IDs, timestamps`;

// ─── Table columns ─────────────────────────────────────────────────────────────

const TABLE_COLUMNS = [
  { key: 'symbol',    label: 'Symbol',   width: 80,  align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'price',     label: 'Price',    width: 90,  align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'open',      label: 'Open',     width: 80,  align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'high',      label: 'High',     width: 80,  align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'low',       label: 'Low',      width: 80,  align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'volume',    label: 'Volume',   width: 100, align: 'right' as const, format: (v: unknown) => Number(v).toLocaleString() },
  { key: 'marketCap', label: 'MCap $B',  width: 90,  align: 'right' as const, format: (v: unknown) => `${Number(v).toFixed(2)}B` },
  { key: '_spark',    label: 'Trend',    width: 100, align: 'center' as const, format: () => '' },
];

type PageTab = 'table' | 'charts' | 'anomalies';

// ─── Outer shell: manages stress-mode + stream key ────────────────────────────

export function FinancialPage() {
  const [stressMode, setStressMode] = useState(false);
  const [streamKey,  setStreamKey]  = useState(0);

  const toggleStress = useCallback(() => {
    setStressMode((m) => !m);
    setStreamKey((k) => k + 1);
  }, []);

  return (
    <FinancialStream
      key={streamKey}
      config={stressMode ? STRESS_CONFIG : NORMAL_CONFIG}
      stressMode={stressMode}
      onToggleStress={toggleStress}
    />
  );
}

// ─── Inner stream component ────────────────────────────────────────────────────

interface FinancialStreamProps {
  config: StreamConfig;
  stressMode: boolean;
  onToggleStress: () => void;
}

function FinancialStream({ config, stressMode, onToggleStress }: FinancialStreamProps) {
  const { rows, changes, status, metrics, anomalies, start, stop, injectRows } =
    useStream(config, { maxRows: 500 });

  const [tab,          setTab]         = useState<PageTab>('table');
  const [showCode,     setShowCode]    = useState(false);
  const [anomList,     setAnomList]    = useState<typeof anomalies>([]);
  const [selectedSym,  setSelectedSym] = useState('AAPL');
  const [injectFlash,  setInjectFlash] = useState(false);
  const [injectTarget, setInjectTarget] = useState('');

  useEffect(() => { setAnomList(anomalies); }, [anomalies]);

  // Latest row per symbol
  const latestBySymbol = useMemo(() => {
    const map = new Map<string, StreamRow>();
    for (const r of rows) { if (r.symbol) map.set(String(r.symbol), r); }
    return Array.from(map.values());
  }, [rows]);

  // Price history per symbol (for sparklines + time series)
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

  // Time-series history (top 5 symbols by activity)
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
  const ohlcRows = useMemo(
    () => rows.filter((r) => String(r.symbol) === selectedSym).slice(-40),
    [rows, selectedSym],
  );

  // Inject a 10× price spike for the selected symbol
  const handleInjectAnomaly = useCallback(() => {
    const target =
      latestBySymbol.find((r) => String(r.symbol) === selectedSym) ??
      latestBySymbol[0];
    if (!target) return;

    const sym = String(target.symbol);
    const spike: StreamRow = {
      ...target,
      price:     Number(target.price)  * 10,
      high:      Number(target.high)   * 10,
      low:       Number(target.low)    * 10,
      timestamp: Date.now(),
      id:        `${target.id}_spike_${Date.now()}`,
    };

    injectRows([spike]);
    setInjectTarget(sym);
    setInjectFlash(true);
    setTab('anomalies');
    setTimeout(() => setInjectFlash(false), 1500);
  }, [injectRows, latestBySymbol, selectedSym]);

  const entityCount  = stressMode ? 80 : 20;
  const rateLabel    = stressMode ? '~4,000 rows/sec' : '~50 rows/sec';
  const tickLabel    = stressMode ? '20ms ticks' : '400ms ticks';

  return (
    <div className="page">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Stock Market Feed
            {stressMode && (
              <span className="stress-badge">⚡ STRESS MODE</span>
            )}
          </h1>
          <p className="page-sub">
            Live prices · {entityCount} symbols · GBM simulation · {tickLabel} · {rateLabel}
          </p>
        </div>
        <div className="page-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
          <div className="page-tabs">
            {(['table', 'charts', 'anomalies'] as PageTab[]).map((t) => (
              <button
                key={t}
                className={`page-tab ${tab === t ? 'page-tab--active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'table' ? '⊞ Table' : t === 'charts' ? '📈 Charts' : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    🔬 Anomalies
                    {anomList.length > 0 && (
                      <span className="badge-count">{anomList.length}</span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>

          <ConnectionBadge status={status} latencyMs={metrics.latencyMs} />

          {/* Stress Test */}
          <button
            className={`btn ${stressMode ? 'btn-stress-active' : 'btn-stress'}`}
            onClick={onToggleStress}
            title={stressMode ? 'Disable stress test (80 symbols @ 20ms)' : 'Enable stress test (80 symbols @ 20ms = ~4K rows/sec)'}
          >
            {stressMode ? '🛑 End Stress' : '⚡ Stress Test'}
          </button>

          {/* Inject Anomaly */}
          <button
            className={`btn ${injectFlash ? 'btn-inject-flash' : 'btn-inject'}`}
            onClick={handleInjectAnomaly}
            title={`Inject a 10× price spike for ${selectedSym} — anomaly detector will catch it`}
          >
            {injectFlash ? `🔴 Injected ${injectTarget}!` : '🔬 Inject Anomaly'}
          </button>

          {/* Start / Stop */}
          {status === 'connected'
            ? <button className="btn btn-danger"  onClick={stop}>⏹ Stop</button>
            : <button className="btn btn-primary" onClick={start}>▶ Start</button>}

          {/* View Code */}
          <button
            className={`btn ${showCode ? 'btn-code-active' : 'btn-ghost'}`}
            onClick={() => setShowCode((s) => !s)}
            title="Show the code behind this dashboard"
          >
            {'</>'} Code
          </button>
        </div>
      </div>

      {/* ── Metrics ────────────────────────────────────────────────────────── */}
      <MetricBar metrics={metrics} />

      {/* ── Code snippet drawer ─────────────────────────────────────────────── */}
      {showCode && (
        <div className="code-panel">
          <div className="code-panel-header">
            <span className="code-panel-title">
              This entire dashboard — ~40 lines of React
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <a
                href="https://github.com/007krcs/dataflow"
                target="_blank"
                rel="noreferrer"
                className="code-panel-link"
              >
                View on GitHub →
              </a>
              <button className="code-panel-close" onClick={() => setShowCode(false)}>✕</button>
            </div>
          </div>
          <pre className="code-block"><code>{CODE_SNIPPET}</code></pre>
          <div className="code-panel-footer">
            <span className="code-tag">npm i @gridstorm/dataflow-react</span>
            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>
              Zero dependencies · React 18+ · TypeScript · {stressMode ? '~4,000 rows/sec with backpressure' : '~50 rows/sec default'}
            </span>
          </div>
        </div>
      )}

      {/* ── Table tab ──────────────────────────────────────────────────────── */}
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
                const last2   = history.slice(-2);
                const color   = last2.length >= 2
                  ? (last2[1]! > last2[0]! ? '#10b981' : '#ef4444')
                  : '#6366f1';
                return <SparklineCell data={history} color={color} />;
              }
              return null;
            }}
          />
          {anomList.length > 0 && (
            <AnomalyPanel anomalies={anomList} onClear={() => setAnomList([])} />
          )}
        </div>
      )}

      {/* ── Charts tab ─────────────────────────────────────────────────────── */}
      {tab === 'charts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {latestBySymbol.slice(0, 10).map((r) => {
              const sym  = String(r.symbol);
              const hist = priceHistory.get(sym) ?? [];
              const last2 = hist.slice(-2);
              const up    = last2.length >= 2 && last2[1]! > last2[0]!;
              return (
                <button
                  key={sym}
                  className={`btn ${selectedSym === sym ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setSelectedSym(sym)}
                  style={{ fontFamily: 'var(--mono)', fontSize: 12, padding: '4px 10px' }}
                >
                  {sym}
                  <span style={{ color: up ? '#10b981' : '#ef4444', marginLeft: 4, fontSize: 10 }}>
                    {up ? '▲' : '▼'} ${Number(r.price).toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="charts-grid">
            <CandlestickChart rows={ohlcRows} symbol={selectedSym} height={280} />
            <TimeSeriesChart
              history={tsHistory}
              title="Price — Top 5 Symbols"
              yLabel="Price $"
              height={280}
              formatY={(v) => `$${v.toFixed(0)}`}
            />
          </div>
        </div>
      )}

      {/* ── Anomalies tab ──────────────────────────────────────────────────── */}
      {tab === 'anomalies' && (
        <div className="charts-grid">
          <AnomalyHeatmap anomalies={anomList} height={240} />
          <AnomalyPanel anomalies={anomList} onClear={() => setAnomList([])} />
        </div>
      )}
    </div>
  );
}
