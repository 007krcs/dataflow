/**
 * CanvasPage — the "this is why canvas exists" demo.
 *
 * Streams 1 500 IoT sensors at 100ms ticks (~15 000 rows/sec). A single
 * top-bar toggle flips between the DOM-based StreamTable and the new
 * <CanvasGrid> renderer so visitors can FEEL the difference without
 * reading a benchmark.
 *
 * Live FPS counter measures actual paint rate (not just rows/sec) so the
 * comparison is honest — DOM mode will visibly drop below 60fps at this
 * scale on most laptops; canvas stays pinned.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStream }       from '../hooks/useStream.ts';
import { StreamTable }     from '../components/StreamTable.tsx';
import { MetricBar }       from '../components/MetricBar.tsx';
import { ConnectionBadge } from '../components/ConnectionBadge.tsx';
import { CanvasGrid }      from '@gridstorm/dataflow-canvas/react';
import type { StreamConfig, StreamRow } from '@gridstorm/dataflow-core';

// ─── Configs — three levels of load ───────────────────────────────────────────

type Load = 'light' | 'medium' | 'heavy';

const LOAD_CONFIGS: Record<Load, StreamConfig & { _label: string; _rate: string }> = {
  light:  {
    adapter: { type: 'simulated', scenario: 'iot', entityCount: 100,  tickIntervalMs: 250, seed: 7,  anomalyRate: 0.02 },
    backpressure: { maxBufferSize: 30_000, targetFps: 60 },
    _label: '100 sensors · 250ms ticks',
    _rate:  '~400 rows/sec',
  },
  medium: {
    adapter: { type: 'simulated', scenario: 'iot', entityCount: 500,  tickIntervalMs: 200, seed: 7,  anomalyRate: 0.02 },
    backpressure: { maxBufferSize: 60_000, targetFps: 60 },
    _label: '500 sensors · 200ms ticks',
    _rate:  '~2 500 rows/sec',
  },
  heavy:  {
    adapter: { type: 'simulated', scenario: 'iot', entityCount: 1500, tickIntervalMs: 100, seed: 7,  anomalyRate: 0.02 },
    backpressure: { maxBufferSize: 200_000, targetFps: 60 },
    _label: '1 500 sensors · 100ms ticks',
    _rate:  '~15 000 rows/sec',
  },
};

// Canvas column spec — used directly by CanvasGrid
const CANVAS_COLUMNS = [
  { key: 'id',          width: 110, align: 'left'   as const },
  { key: 'location',    width: 130, align: 'left'   as const },
  { key: 'temperature', width: 100, align: 'right'  as const, format: (v: any) => `${Number(v).toFixed(1)}°C` },
  { key: 'humidity',    width: 100, align: 'right'  as const, format: (v: any) => `${Number(v).toFixed(1)}%` },
  { key: 'pressure',    width: 110, align: 'right'  as const, format: (v: any) => `${Number(v).toFixed(1)} hPa` },
  { key: 'co2',         width: 100, align: 'right'  as const, format: (v: any) => `${v} ppm` },
  { key: 'status',      width: 90,  align: 'center' as const },
];

// DOM column spec — same fields, slightly different shape (DOM table expects format(v)=>string)
const DOM_COLUMNS = [
  { key: 'id',          label: 'Sensor',   width: 110, align: 'left'   as const, format: (v: unknown) => String(v) },
  { key: 'location',    label: 'Location', width: 130, align: 'left'   as const, format: (v: unknown) => String(v) },
  { key: 'temperature', label: 'Temp',     width: 100, align: 'right'  as const, format: (v: unknown) => `${Number(v).toFixed(1)}°C` },
  { key: 'humidity',    label: 'Humidity', width: 100, align: 'right'  as const, format: (v: unknown) => `${Number(v).toFixed(1)}%` },
  { key: 'pressure',    label: 'Pressure', width: 110, align: 'right'  as const, format: (v: unknown) => `${Number(v).toFixed(1)} hPa` },
  { key: 'co2',         label: 'CO₂',      width: 100, align: 'right'  as const, format: (v: unknown) => `${v} ppm` },
  { key: 'status',      label: 'Status',   width: 90,  align: 'center' as const, format: (v: unknown) => String(v) },
];

type Renderer = 'canvas' | 'dom';

// ─── FPS meter — measures actual rAF paint rate ───────────────────────────────

function useFps(sampleMs = 1000): number {
  const [fps, setFps] = useState(0);
  const framesRef = useRef(0);
  const lastRef   = useRef(performance.now());
  const rafRef    = useRef<number | null>(null);

  useEffect(() => {
    const loop = () => {
      framesRef.current++;
      const now = performance.now();
      const dt  = now - lastRef.current;
      if (dt >= sampleMs) {
        setFps(Math.round((framesRef.current * 1000) / dt));
        framesRef.current = 0;
        lastRef.current   = now;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [sampleMs]);

  return fps;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CanvasPage() {
  const [load,     setLoad]     = useState<Load>('medium');
  const [renderer, setRenderer] = useState<Renderer>('canvas');
  const [streamKey, setStreamKey] = useState(0);

  const config = LOAD_CONFIGS[load];
  // Bigger maxRows than other pages — the heaviest preset emits ~15K rows/sec
  // and we want a 2-3 second snapshot to derive latest-by-sensor cleanly.
  const { rows, changes, status, metrics, start, stop } = useStream(config, { maxRows: 60_000 });

  // Latest row per sensor — the table renders ONE row per sensor with live cell flashes
  const latestBySensor = useMemo(() => {
    const map = new Map<string, StreamRow>();
    for (const r of rows) map.set(String(r.id), r);
    return Array.from(map.values());
  }, [rows]);

  const fps = useFps();

  // Status counts
  const alertCount = latestBySensor.filter((r) => r.status === 'ALERT').length;
  const warnCount  = latestBySensor.filter((r) => r.status === 'WARN').length;

  const switchLoad = (next: Load) => {
    setLoad(next);
    setStreamKey((k) => k + 1);  // remount useStream with the new config
  };

  return (
    <div className="page" key={streamKey}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Canvas Renderer
            <span style={{ marginLeft: 10, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(168,85,247,0.15)', color: '#c084fc', verticalAlign: 'middle' }}>
              ALPHA
            </span>
          </h1>
          <p className="page-sub">
            {config._label} · {config._rate} · {latestBySensor.length} live sensors · flip the renderer toggle to feel the difference
          </p>
        </div>

        <div className="page-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
          {/* Load presets */}
          <div className="page-tabs">
            {(['light', 'medium', 'heavy'] as Load[]).map((l) => (
              <button
                key={l}
                className={`page-tab ${load === l ? 'page-tab--active' : ''}`}
                onClick={() => switchLoad(l)}
                title={LOAD_CONFIGS[l]._rate}
              >
                {l === 'light' ? '🟢 Light' : l === 'medium' ? '🟡 Medium' : '🔴 Heavy'}
              </button>
            ))}
          </div>

          <ConnectionBadge status={status} latencyMs={metrics.latencyMs} />

          {status === 'connected'
            ? <button className="btn btn-danger"  onClick={stop}>⏹ Stop</button>
            : <button className="btn btn-primary" onClick={start}>▶ Start</button>}
        </div>
      </div>

      {/* ── Renderer A/B toggle — the hero element ──────────────────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Renderer
          </span>
          <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setRenderer('canvas')}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: 600,
                background: renderer === 'canvas' ? 'rgba(168,85,247,0.15)' : 'transparent',
                color: renderer === 'canvas' ? '#c084fc' : 'var(--text-2)',
                border: 'none', cursor: 'pointer',
              }}
            >
              🎨 Canvas
            </button>
            <button
              onClick={() => setRenderer('dom')}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: 600,
                background: renderer === 'dom' ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: renderer === 'dom' ? '#a5b4fc' : 'var(--text-2)',
                border: 'none', cursor: 'pointer',
              }}
            >
              📄 DOM
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: 'var(--mono)', fontSize: 12 }}>
          <span title="Browser paint rate — measured live by this page, not estimated">
            <span style={{ color: 'var(--text-3)' }}>FPS</span>{' '}
            <span style={{ color: fps >= 55 ? '#10b981' : fps >= 30 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
              {fps}
            </span>
          </span>
          <span>
            <span style={{ color: 'var(--text-3)' }}>rows/sec</span>{' '}
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>{metrics.rowsPerSecond.toLocaleString()}</span>
          </span>
          <span>
            <span style={{ color: 'var(--text-3)' }}>dropped</span>{' '}
            <span style={{ color: metrics.droppedRows > 0 ? '#f59e0b' : 'var(--text)', fontWeight: 700 }}>
              {metrics.droppedRows.toLocaleString()}
            </span>
          </span>
          <span>
            <span style={{ color: 'var(--text-3)' }}>alerts</span>{' '}
            <span style={{ color: alertCount > 0 ? '#ef4444' : 'var(--text)', fontWeight: 700 }}>{alertCount}</span>
            <span style={{ color: 'var(--text-3)' }}> / warn </span>
            <span style={{ color: warnCount > 0 ? '#f59e0b' : 'var(--text)', fontWeight: 700 }}>{warnCount}</span>
          </span>
        </div>
      </div>

      {/* ── Metrics bar ─────────────────────────────────────────────────── */}
      <MetricBar metrics={metrics} />

      {/* ── The grid itself ─────────────────────────────────────────────── */}
      {renderer === 'canvas' ? (
        <div style={{ height: 540, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <CanvasGrid
            rows={latestBySensor}
            changes={changes}
            columns={CANVAS_COLUMNS}
            rowHeight={26}
            headerHeight={32}
            flashDurationMs={500}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      ) : (
        <StreamTable
          rows={latestBySensor}
          changes={changes}
          columns={DOM_COLUMNS}
          maxRows={1500}
          idField="id"
        />
      )}

      {/* ── Footnote ───────────────────────────────────────────────────── */}
      <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '4px 0' }}>
        {renderer === 'canvas'
          ? <>Canvas renderer • one canvas element • {latestBySensor.length} rows, ~{CANVAS_COLUMNS.length * latestBySensor.length} cells per frame</>
          : <>DOM renderer • {latestBySensor.length} &lt;tr&gt; rows, ~{DOM_COLUMNS.length * latestBySensor.length} &lt;td&gt; nodes — try toggling to Canvas on heavy mode</>
        }
      </div>
    </div>
  );
}
