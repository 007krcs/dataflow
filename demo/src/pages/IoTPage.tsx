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
    scenario:       'iot',
    entityCount:    25,
    tickIntervalMs: 500,
    seed:           7,
    anomalyRate:    0.05,
  },
  anomaly: { enabled: true, methods: ['zscore', 'iqr'], windowSize: 80, minSamples: 20 },
  backpressure: { maxBufferSize: 5000, targetFps: 30 },
};

const STATUS_COLOR: Record<string, string> = {
  OK:    '#10b981',
  WARN:  '#f59e0b',
  ALERT: '#ef4444',
};

const COLUMNS = [
  { key: 'sensor',      label: 'Sensor',   width: 80,  align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'location',    label: 'Location', width: 120, align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'type',        label: 'Type',     width: 100, align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'temperature', label: 'Temp °C',  width: 90,  align: 'right' as const, format: (v: unknown) => `${Number(v).toFixed(1)}°` },
  { key: 'humidity',    label: 'Humidity', width: 90,  align: 'right' as const, format: (v: unknown) => `${Number(v).toFixed(1)}%` },
  { key: 'pressure',    label: 'Pressure', width: 90,  align: 'right' as const, format: (v: unknown) => `${Number(v).toFixed(1)} hPa` },
  { key: 'co2',         label: 'CO₂ ppm',  width: 90,  align: 'right' as const, format: (v: unknown) => String(v) },
  { key: 'status',      label: 'Status',   width: 80,  align: 'center' as const,
    format: (v: unknown) => String(v) },
];

export function IoTPage() {
  const { rows, changes, status, metrics, anomalies, start, stop } = useStream(CONFIG, { maxRows: 25 });
  const [showAnomaly, setShowAnomaly] = useState(true);
  const [anomList, setAnomList] = useState(anomalies);
  React.useEffect(() => { setAnomList(anomalies); }, [anomalies]);

  const latestBySensor = React.useMemo(() => {
    const map = new Map<string, typeof rows[0]>();
    for (const r of rows) { if (r.sensor) map.set(String(r.sensor), r); }
    return Array.from(map.values());
  }, [rows]);

  // Status summary
  const alertCount = latestBySensor.filter((r) => r.status === 'ALERT').length;
  const warnCount  = latestBySensor.filter((r) => r.status === 'WARN').length;

  return (
    <div className="page">
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
        <StreamTable rows={latestBySensor} changes={changes} columns={COLUMNS} maxRows={25} idField="sensor" />
        {showAnomaly && <AnomalyPanel anomalies={anomList} onClear={() => setAnomList([])} />}
      </div>
    </div>
  );
}
