/**
 * useStream — Primary hook for connecting to a DataFlow stream.
 *
 * Returns live rows, connection status, and metrics.
 * Automatically starts/stops the engine on mount/unmount.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { StreamingEngine }   from '@dataflow/core';
import type {
  StreamConfig,
  StreamRow,
  StreamStatus,
  StreamMetrics,
  CellChange,
  AnomalyEvent,
} from '@dataflow/core';

export interface UseStreamOptions {
  /** Max number of rows to keep in state (rolling window). Default: 500 */
  maxRows?: number;
  /** Auto-start on mount. Default: true */
  autoStart?: boolean;
}

export interface UseStreamResult {
  rows:     StreamRow[];
  changes:  CellChange[];
  status:   StreamStatus;
  metrics:  StreamMetrics;
  anomalies: AnomalyEvent[];
  start:    () => void;
  stop:     () => void;
}

const DEFAULT_MAX_ROWS = 500;

export function useStream(
  config: StreamConfig,
  options: UseStreamOptions = {},
): UseStreamResult {
  const { maxRows = DEFAULT_MAX_ROWS, autoStart = true } = options;

  const engineRef = useRef<StreamingEngine | null>(null);

  const [rows,      setRows]      = useState<StreamRow[]>([]);
  const [changes,   setChanges]   = useState<CellChange[]>([]);
  const [status,    setStatus]    = useState<StreamStatus>('disconnected');
  const [metrics,   setMetrics]   = useState<StreamMetrics>({
    totalRows: 0, rowsPerSecond: 0, droppedRows: 0,
    anomalyCount: 0, latencyMs: 0, bufferUtilization: 0, uptime: 0,
  });
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);

  const start = useCallback(() => { engineRef.current?.start(); }, []);
  const stop  = useCallback(() => { engineRef.current?.stop();  }, []);

  useEffect(() => {
    const engine = new StreamingEngine(config, {
      onRows(newRows, newChanges) {
        setRows((prev) => {
          const combined = [...prev, ...newRows];
          return combined.length > maxRows ? combined.slice(combined.length - maxRows) : combined;
        });
        if (newChanges.length > 0) {
          setChanges(newChanges);
        }
      },
      onStatus:  setStatus,
      onMetrics: setMetrics,
      onAnomaly(events) {
        setAnomalies((prev) => {
          const combined = [...prev, ...events];
          return combined.length > 200 ? combined.slice(combined.length - 200) : combined;
        });
      },
    });

    engineRef.current = engine;
    if (autoStart) engine.start();

    return () => { engine.destroy(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once — config changes don't restart stream

  return { rows, changes, status, metrics, anomalies, start, stop };
}
