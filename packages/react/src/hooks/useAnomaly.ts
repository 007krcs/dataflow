// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * useAnomaly — Subscribe to anomaly events from a StreamingEngine.
 * Keeps a rolling buffer of the last N anomalies, grouped by column.
 */

import { useEffect, useRef, useState } from 'react';
import { StreamingEngine }  from '@gridstorm/dataflow-core';
import type { StreamConfig, AnomalyEvent } from '@gridstorm/dataflow-core';

export interface UseAnomalyResult {
  anomalies:  AnomalyEvent[];
  byColumn:   Map<string, AnomalyEvent[]>;
  clearAll:   () => void;
}

export function useAnomaly(config: StreamConfig, maxEvents = 200): UseAnomalyResult {
  const engineRef = useRef<StreamingEngine | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);

  useEffect(() => {
    const engine = new StreamingEngine(config, {
      onAnomaly(events) {
        setAnomalies((prev) => {
          const next = [...prev, ...events];
          return next.length > maxEvents ? next.slice(next.length - maxEvents) : next;
        });
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => { engine.destroy(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byColumn = new Map<string, AnomalyEvent[]>();
  for (const ev of anomalies) {
    if (!byColumn.has(ev.columnId)) byColumn.set(ev.columnId, []);
    byColumn.get(ev.columnId)!.push(ev);
  }

  const clearAll = () => setAnomalies([]);

  return { anomalies, byColumn, clearAll };
}
