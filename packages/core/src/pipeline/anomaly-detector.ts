/**
 * AnomalyDetector — Multi-method statistical anomaly detection.
 *
 * Supports four algorithms per column:
 *   zscore    — |z| = |(x - μ) / σ| > threshold
 *   iqr       — x < Q1 - k*IQR  or  x > Q3 + k*IQR  (Tukey fences)
 *   mad       — |x - median| / MAD > threshold  (robust to outliers)
 *   threshold — simple min/max static bounds
 *
 * Uses a rolling window of configurable size so statistics adapt to
 * concept drift without requiring the full history.
 */

import type {
  AnomalyConfig,
  AnomalyEvent,
  AnomalySeverity,
  AnomalyStats,
  CellValue,
  StreamRow,
} from '../types.js';

interface ColumnWindow {
  values: number[];
  head: number;
  count: number;
  sum: number;
  sumSq: number;
}

function createWindow(size: number): ColumnWindow {
  return { values: new Array(size).fill(0), head: 0, count: 0, sum: 0, sumSq: 0 };
}

function windowPush(w: ColumnWindow, v: number): void {
  const capacity = w.values.length;
  if (w.count === capacity) {
    const old = w.values[w.head]!;
    w.sum -= old;
    w.sumSq -= old * old;
    w.count--;
  }
  w.values[w.head] = v;
  w.head = (w.head + 1) % capacity;
  w.sum += v;
  w.sumSq += v * v;
  w.count++;
}

function computeStats(w: ColumnWindow): AnomalyStats {
  const n = w.count;
  if (n === 0) return { mean: 0, stddev: 0, median: 0, mad: 0, q1: 0, q3: 0, iqr: 0, min: 0, max: 0, sampleCount: 0 };

  const mean = w.sum / n;
  const variance = w.sumSq / n - mean * mean;
  const stddev = Math.sqrt(Math.max(0, variance));

  // Build sorted snapshot for quantiles
  const sorted = w.values.slice(0, w.count < w.values.length ? w.count : w.values.length).sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  const iqr = q3 - q1;
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;

  // MAD
  const deviations = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length * 0.5)] ?? 0;

  return { mean, stddev, median, mad, q1, q3, iqr, min, max, sampleCount: n };
}

let _idCounter = 0;
function nextId(): string { return `anom-${++_idCounter}-${Date.now()}`; }

export class AnomalyDetector {
  private readonly _windows = new Map<string, ColumnWindow>();
  private readonly _cfg: Required<AnomalyConfig>;

  constructor(config: AnomalyConfig = {}) {
    this._cfg = {
      enabled: config.enabled ?? true,
      methods: config.methods ?? ['zscore', 'iqr'],
      zScoreThreshold: config.zScoreThreshold ?? 2.5,
      iqrMultiplier: config.iqrMultiplier ?? 1.5,
      windowSize: config.windowSize ?? 100,
      columns: config.columns ?? [],
      minSamples: config.minSamples ?? 20,
      severityThresholds: config.severityThresholds ?? { warning: 2.5, critical: 4.0 },
    };
  }

  /**
   * Feed a row into the detector.
   * Returns any anomalies detected in this row.
   */
  process(row: StreamRow, schema?: string[]): AnomalyEvent[] {
    if (!this._cfg.enabled) return [];

    const events: AnomalyEvent[] = [];
    const columnsToCheck = this._cfg.columns.length > 0 ? this._cfg.columns : (schema ?? Object.keys(row));

    for (const col of columnsToCheck) {
      if (col === 'id' || col === 'timestamp') continue;
      const raw = row[col] as CellValue;
      if (typeof raw !== 'number' || !isFinite(raw)) continue;

      let window = this._windows.get(col);
      if (!window) {
        window = createWindow(this._cfg.windowSize);
        this._windows.set(col, window);
      }

      windowPush(window, raw);
      if (window.count < this._cfg.minSamples) continue;

      const stats = computeStats(window);
      const detected = this._detectAnomalies(col, raw, stats, row.id, row.timestamp);
      events.push(...detected);
    }

    return events;
  }

  private _detectAnomalies(
    col: string,
    value: number,
    stats: AnomalyStats,
    rowId: string,
    ts: number,
  ): AnomalyEvent[] {
    const events: AnomalyEvent[] = [];
    const methods = this._cfg.methods;

    let zScore: number | null = null;
    let iqrDev: number | null = null;

    if (methods.includes('zscore') && stats.stddev > 0) {
      zScore = Math.abs((value - stats.mean) / stats.stddev);
      if (zScore > this._cfg.zScoreThreshold) {
        const severity = this._zScoreSeverity(zScore);
        events.push({
          id: nextId(),
          rowId,
          columnId: col,
          value,
          stats,
          severity,
          method: 'zscore',
          zScore,
          iqrDeviation: null,
          timestamp: ts,
          message: `${col} = ${value.toFixed(2)} is ${zScore.toFixed(1)}σ from mean ${stats.mean.toFixed(2)} (σ=${stats.stddev.toFixed(2)})`,
        });
      }
    }

    if (methods.includes('iqr') && stats.iqr > 0) {
      const lo = stats.q1 - this._cfg.iqrMultiplier * stats.iqr;
      const hi = stats.q3 + this._cfg.iqrMultiplier * stats.iqr;
      if (value < lo || value > hi) {
        iqrDev = value < lo ? (value - lo) / stats.iqr : (value - hi) / stats.iqr;
        const severity: AnomalySeverity = Math.abs(iqrDev) > 3 ? 'critical' : 'warning';
        if (!events.some((e) => e.columnId === col)) {
          events.push({
            id: nextId(),
            rowId,
            columnId: col,
            value,
            stats,
            severity,
            method: 'iqr',
            zScore,
            iqrDeviation: iqrDev,
            timestamp: ts,
            message: `${col} = ${value.toFixed(2)} is outside IQR fence [${lo.toFixed(2)}, ${hi.toFixed(2)}]`,
          });
        }
      }
    }

    if (methods.includes('mad') && stats.mad > 0) {
      const madScore = Math.abs(value - stats.median) / (1.4826 * stats.mad);
      if (madScore > this._cfg.zScoreThreshold) {
        const severity = this._zScoreSeverity(madScore);
        if (!events.some((e) => e.columnId === col)) {
          events.push({
            id: nextId(),
            rowId,
            columnId: col,
            value,
            stats,
            severity,
            method: 'mad',
            zScore: madScore,
            iqrDeviation: null,
            timestamp: ts,
            message: `${col} = ${value.toFixed(2)} MAD-score ${madScore.toFixed(1)} (robust outlier)`,
          });
        }
      }
    }

    return events;
  }

  private _zScoreSeverity(z: number): AnomalySeverity {
    if (z >= this._cfg.severityThresholds.critical) return 'critical';
    if (z >= this._cfg.severityThresholds.warning)  return 'warning';
    return 'info';
  }

  /** Reset statistics for one or all columns */
  reset(column?: string): void {
    if (column) this._windows.delete(column);
    else this._windows.clear();
  }

  getStats(column: string): AnomalyStats | null {
    const w = this._windows.get(column);
    return w ? computeStats(w) : null;
  }
}
