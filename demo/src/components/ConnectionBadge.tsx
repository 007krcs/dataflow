import React from 'react';
import type { StreamStatus } from '../../../packages/core/src/index.js';

const STATUS_LABELS: Record<StreamStatus, string> = {
  disconnected: 'Disconnected', connecting: 'Connecting…',
  connected: 'Live', error: 'Error', paused: 'Paused',
};
const STATUS_COLORS: Record<StreamStatus, string> = {
  disconnected: '#6b7280', connecting: '#f59e0b',
  connected: '#10b981', error: '#ef4444', paused: '#8b5cf6',
};

export function ConnectionBadge({ status, latencyMs }: { status: StreamStatus; latencyMs?: number }) {
  const color = STATUS_COLORS[status];
  return (
    <span className="conn-badge" style={{ '--badge-color': color } as React.CSSProperties}>
      <span className="conn-dot" />
      {STATUS_LABELS[status]}
      {latencyMs !== undefined && status === 'connected' && (
        <span className="conn-latency">{latencyMs}ms</span>
      )}
    </span>
  );
}
