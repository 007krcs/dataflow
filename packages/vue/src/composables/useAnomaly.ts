// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * useAnomaly — Composable that accumulates anomaly events from a stream.
 *
 * Keeps the last `maxEvents` anomaly events in a reactive ref.
 * Provides helpers to clear, filter by severity, and get counts.
 *
 * Usage:
 *   const { anomalies, criticalCount, clear } = useAnomaly(myStream.anomalies);
 */

import { computed, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import type { AnomalyEvent, AnomalySeverity } from '@gridstorm/dataflow-core';

export interface UseAnomalyResult {
  /** Reactive ref to all accumulated anomaly events (newest last) */
  anomalies:     ShallowRef<AnomalyEvent[]> | Ref<AnomalyEvent[]>;
  /** Count of anomalies per severity */
  criticalCount: ComputedRef<number>;
  warningCount:  ComputedRef<number>;
  infoCount:     ComputedRef<number>;
  totalCount:    ComputedRef<number>;
  /** Filter to a specific severity */
  bySeverity:    (severity: AnomalySeverity) => AnomalyEvent[];
  /** Filter to a specific column */
  byColumn:      (columnId: string) => AnomalyEvent[];
}

export function useAnomaly(
  anomalies: ShallowRef<AnomalyEvent[]> | Ref<AnomalyEvent[]>,
): UseAnomalyResult {
  const criticalCount = computed(() => anomalies.value.filter((e) => e.severity === 'critical').length);
  const warningCount  = computed(() => anomalies.value.filter((e) => e.severity === 'warning').length);
  const infoCount     = computed(() => anomalies.value.filter((e) => e.severity === 'info').length);
  const totalCount    = computed(() => anomalies.value.length);

  const bySeverity = (severity: AnomalySeverity) => anomalies.value.filter((e) => e.severity === severity);
  const byColumn   = (columnId: string)           => anomalies.value.filter((e) => e.columnId === columnId);

  return { anomalies, criticalCount, warningCount, infoCount, totalCount, bySeverity, byColumn };
}
