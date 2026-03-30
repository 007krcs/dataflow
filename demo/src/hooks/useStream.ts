/**
 * Local useStream hook for the demo app.
 * Directly imports from the core package source.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { StreamingEngine }  from '../../../packages/core/src/index.js';
import type {
  StreamConfig, StreamRow, StreamStatus, StreamMetrics, CellChange, AnomalyEvent,
} from '../../../packages/core/src/index.js';

export function useStream(config: StreamConfig, options: { maxRows?: number; autoStart?: boolean } = {}) {
  const { maxRows = 500, autoStart = true } = options;
  const engineRef = useRef<StreamingEngine | null>(null);

  const [rows,      setRows]      = useState<StreamRow[]>([]);
  const [changes,   setChanges]   = useState<CellChange[]>([]);
  const [status,    setStatus]    = useState<StreamStatus>('disconnected');
  const [metrics,   setMetrics]   = useState<StreamMetrics>({ totalRows:0,rowsPerSecond:0,droppedRows:0,anomalyCount:0,latencyMs:0,bufferUtilization:0,uptime:0 });
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);

  const start = useCallback(() => engineRef.current?.start(), []);
  const stop  = useCallback(() => engineRef.current?.stop(),  []);

  useEffect(() => {
    const engine = new StreamingEngine(config, {
      onRows(r, c) {
        setRows((prev) => { const n = [...prev, ...r]; return n.length > maxRows ? n.slice(n.length - maxRows) : n; });
        if (c.length) setChanges(c);
      },
      onStatus:  setStatus,
      onMetrics: setMetrics,
      onAnomaly(evs) {
        setAnomalies((prev) => { const n = [...prev, ...evs]; return n.length > 200 ? n.slice(n.length - 200) : n; });
      },
    });
    engineRef.current = engine;
    if (autoStart) engine.start();
    return () => { engine.destroy(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { rows, changes, status, metrics, anomalies, start, stop };
}
