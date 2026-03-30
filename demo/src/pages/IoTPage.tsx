import React, { useState, useMemo } from 'react';
import { useStream }             from '../hooks/useStream.ts';
import { StreamTable }           from '../components/StreamTable.tsx';
import { MetricBar }             from '../components/MetricBar.tsx';
import { ConnectionBadge }       from '../components/ConnectionBadge.tsx';
import { AnomalyPanel }          from '../components/AnomalyPanel.tsx';
import { TimeSeriesChart }       from '../components/TimeSeriesChart.tsx';
import { AnomalyHeatmap }        from '../components/AnomalyHeatmap.tsx';
import type { StreamConfig, StreamRow } from '../../../packages/core/src/index.js';

const CONFIG: StreamConfig = {
  adapter: {
    type:           'simulated',
    scenario:       'iot',
    entityCount:    25,
    tickIntervalMs: 500,
    seed:           7,
    anomalyRate:    0.05,
  },
  anomaly: { enabled: true, methods: ['zscore', 'iqr'], windowSize: 80, minSamples: 20 },
  backpressure: { maxBufferSize: 5000, targetFps: 30 },
};

const COLUMNS = [
  { key: 'sensor',      label: 'Sensor',   width: 80,  align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'location',    label: 'Location', width: 120, align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'type',        label: 'Type',     width: 100, align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'temperature', label: 'Temp °C',  width: 90,  align: 'right' as const, format: (v: unknown) => `${Number(v).toFixed(1)}°` },
  { key: 'humidity',    label: 'Humidity', width: 90,  align: 'right' as const, format: (v: unknown) => `${Number(v).toFixed(1)}%` },
  { key: 'pressure',    label: 'Pressure', width: 90,  align: 'right' as const, format: (v: unknown) => `${Number(v).toFixed(1)} hPa` },
  { key: 'co2',         label: 'CO₂ ppm',  width: 90,  align: 'right' as const, format: (v: unknown) => String(v) },
  { key: 'status',      label: 'Status',   width: 80,  align: 'center' as const, format: (v: unknown) => String(v) },
];

type PageTab = 'table' | 'charts' | 'anomalies';

export function IoTPage() {
  const { rows, changes, status, metrics, anomalies, start, stop } = useStream(CONFIG, { maxRows: 500 });
  const [tab, setTab]           = useState<PageTab>('table');
  const [anomList, setAnomList] = useState<typeof anomalies>([]);
  React.useEffect(() => { setAnomList(anomalies); }, [anomalies]);

  // Latest row per sensor
  const latestBySensor = useMemo(() => {
    const map = new Map<string, StreamRow>();
    for (const r of rows) { if (r.sensor) map.set(String(r.sensor), r); }
    return Array.from(map.values());
  }, [rows]);

  // Status summary
  const alertCount = latestBySensor.filter((r) => r.status === 'ALERT').length;
  const warnCount  = latestBySensor.filter((r) => r.status === 'WARN').length;

  // Temperature history (top 5 sensors)
  const tempHistory = useMemo(() => {
    const map = new Map<string, { t: number; v: number }[]>();
    const top5 = latestBySensor.slice(0, 5).map((r) => String(r.sensor));
    for (const r of rows) {
      const key = String(r.sensor ?? r.id);
      if (!top5.includes(key)) continue;
      if (!map.has(key)) map.set(key, []);
      const arr = map.get(key)!;
      arr.push({ t: r.timestamp, v: Number(r.temperature) });
      if (arr.length > 60) arr.splice(0, arr.length - 60);
    }
    return map;
  }, [rows, latestBySensor]);

  // CO₂ history (top 5 sensors)
  const co2History = useMemo(() => {
    const map = new Map<string, { t: number; v: number }[]>();
    const top5 = latestBySensor.slice(0, 5).map((r) => String(r.sensor));
    for (const r of rows) {
      const key = String(r.sensor ?? r.id);
      if (!top5.includes(key)) continue;
      if (!map.has(key)) map.set(key, []);
      const arr = map.get(key)!;
      arr.push({ t: r.timestamp, v: Number(r.co2) });
      if (arr.length > 60) arr.splice(0, arr.length - 60);
    }
    return map;
  }, [rows, latestBySensor]);

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">IoT Sensor Grid</h1>
          <p className="page-sub">
            25 sensors · Temperature / Humidity / CO₂ / Pressure · 500ms ticks · 5% anomaly injection
          </p>
        </div>
        <div className="page-actions">
          {alertCount > 0 && <span className="status-pill alert">{alertCount} ALERT</span>}
          {warnCount  > 0 && <span className="status-pill warn">{warnCount} WARN</span>}
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
            rows={latestBySensor}
            changes={changes}
            columns={COLUMNS}
            maxRows={25}
            idField="sensor"
            customCell={(col, val) => {
              if (col === 'status') {
                const s = String(val);
                const color = s === 'ALERT' ? '#ef4444' : s === 'WARN' ? '#f59e0b' : '#10b981';
                return (
                  <span style={{
                    color,
                    fontWeight: 700,
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 9999,
                    background: `${color}22`,
                    border: `1px solid ${color}44`,
                  }}>
                    {s}
                  </span>
                );
              }
              return null;
            }}
          />
        </div>
      )}

      {/* CHARTS TAB */}
      {tab === 'charts' && (
        <div className="charts-grid">
          <TimeSeriesChart
            history={tempHistory}
            title="Temperature °C — Top 5 Sensors"
            yLabel="Temp °C"
            height={280}
            formatY={(v) => `${v.toFixed(1)}°`}
          />
          <TimeSeriesChart
            history={co2History}
            title="CO₂ ppm — Top 5 Sensors"
            yLabel="ppm"
            height={280}
            formatY={(v) => `${Math.round(v)}`}
          />
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
