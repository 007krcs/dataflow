/**
 * useStreamMetrics — Lightweight hook that only subscribes to metrics updates.
 * Useful for metric bars and status panels without re-rendering the whole grid.
 */

import { useEffect, useRef, useState } from 'react';
import { StreamingEngine }   from '@dataflow/core';
import type { StreamConfig, StreamMetrics, StreamStatus } from '@dataflow/core';

export interface UseStreamMetricsResult {
  metrics: StreamMetrics;
  status:  StreamStatus;
  engine:  StreamingEngine | null;
}

export function useStreamMetrics(config: StreamConfig): UseStreamMetricsResult {
  const engineRef = useRef<StreamingEngine | null>(null);
  const [metrics, setMetrics] = useState<StreamMetrics>({
    totalRows: 0, rowsPerSecond: 0, droppedRows: 0,
    anomalyCount: 0, latencyMs: 0, bufferUtilization: 0, uptime: 0,
  });
  const [status, setStatus] = useState<StreamStatus>('disconnected');

  useEffect(() => {
    const engine = new StreamingEngine(config, {
      onMetrics: setMetrics,
      onStatus:  setStatus,
    });
    engineRef.current = engine;
    engine.start();
    return () => { engine.destroy(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { metrics, status, engine: engineRef.current };
}
