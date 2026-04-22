// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * useStream — Primary hook for connecting to a DataFlow stream.
 *
 * Returns live rows, connection status, metrics, and control functions.
 * Automatically starts/stops the engine on mount/unmount.
 *
 * To reconnect with a new config, change the `key` option — this causes
 * the hook to destroy the old engine and create a new one with the updated
 * config, just like changing a React component's `key` prop.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { StreamingEngine }   from '@gridstorm/dataflow-core';
import type {
  StreamConfig,
  StreamRow,
  StreamStatus,
  StreamMetrics,
  CellChange,
  AnomalyEvent,
} from '@gridstorm/dataflow-core';

export interface UseStreamOptions {
  /** Max number of rows to keep in state (rolling window). Default: 500 */
  maxRows?: number;
  /** Auto-start on mount. Default: true */
  autoStart?: boolean;
  /**
   * Change this value to tear down the current engine and reconnect
   * with the latest config. Analogous to React's `key` prop.
   * Example: `key={selectedSymbol}` restarts the stream when symbol changes.
   */
  key?: string | number;
}

export interface UseStreamResult {
  rows:      StreamRow[];
  changes:   CellChange[];
  status:    StreamStatus;
  metrics:   StreamMetrics;
  anomalies: AnomalyEvent[];
  start:     () => void;
  stop:      () => void;
  pause:     () => void;
  resume:    () => void;
}

const DEFAULT_MAX_ROWS = 500;

export function useStream(
  config: StreamConfig,
  options: UseStreamOptions = {},
): UseStreamResult {
  const { maxRows = DEFAULT_MAX_ROWS, autoStart = true, key } = options;

  const engineRef  = useRef<StreamingEngine | null>(null);
  const configRef  = useRef(config);
  configRef.current = config;  // always up-to-date without triggering re-render

  const [rows,      setRows]      = useState<StreamRow[]>([]);
  const [changes,   setChanges]   = useState<CellChange[]>([]);
  const [status,    setStatus]    = useState<StreamStatus>('disconnected');
  const [metrics,   setMetrics]   = useState<StreamMetrics>({
    totalRows: 0, rowsPerSecond: 0, droppedRows: 0,
    anomalyCount: 0, latencyMs: 0, bufferUtilization: 0, uptime: 0,
  });
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);

  const start  = useCallback(() => { engineRef.current?.start();  }, []);
  const stop   = useCallback(() => { engineRef.current?.stop();   }, []);
  const pause  = useCallback(() => { engineRef.current?.pause();  }, []);
  const resume = useCallback(() => { engineRef.current?.resume(); }, []);

  useEffect(() => {
    // Reset row state when key changes (new stream context)
    setRows([]);
    setChanges([]);
    setAnomalies([]);

    const engine = new StreamingEngine(configRef.current, {
      onRows(newRows, newChanges) {
        setRows((prev) => {
          const combined = [...prev, ...newRows];
          return combined.length > maxRows ? combined.slice(combined.length - maxRows) : combined;
        });
        if (newChanges.length > 0) setChanges(newChanges);
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
  }, [key]);  // re-run when `key` changes — allows controlled reconnect

  return { rows, changes, status, metrics, anomalies, start, stop, pause, resume };
}
