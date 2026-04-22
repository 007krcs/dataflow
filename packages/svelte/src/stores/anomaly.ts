// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * anomalyStore — Svelte store helpers for anomaly filtering and aggregation.
 *
 * Usage:
 *   import { createAnomalyStore } from '@gridstorm/dataflow-svelte';
 *   const stream = createStream(config);
 *   const anom = createAnomalyStore(stream.anomalies);
 *
 *   // In template:
 *   {$anom.critical.length} critical alerts
 */

import { derived, type Readable } from 'svelte/store';
import type { AnomalyEvent } from '@gridstorm/dataflow-core';

export interface AnomalyStoreResult {
  critical: Readable<AnomalyEvent[]>;
  warning:  Readable<AnomalyEvent[]>;
  info:     Readable<AnomalyEvent[]>;
  byColumn: (col: string) => Readable<AnomalyEvent[]>;
  counts:   Readable<{ critical: number; warning: number; info: number; total: number }>;
}

export function createAnomalyStore(
  anomalies: Readable<AnomalyEvent[]>,
): AnomalyStoreResult {
  const critical = derived(anomalies, ($a) => $a.filter((e) => e.severity === 'critical'));
  const warning  = derived(anomalies, ($a) => $a.filter((e) => e.severity === 'warning'));
  const info     = derived(anomalies, ($a) => $a.filter((e) => e.severity === 'info'));

  const counts = derived(anomalies, ($a) => ({
    critical: $a.filter((e) => e.severity === 'critical').length,
    warning:  $a.filter((e) => e.severity === 'warning').length,
    info:     $a.filter((e) => e.severity === 'info').length,
    total:    $a.length,
  }));

  const byColumn = (col: string): Readable<AnomalyEvent[]> =>
    derived(anomalies, ($a) => $a.filter((e) => e.columnId === col));

  return { critical, warning, info, byColumn, counts };
}
