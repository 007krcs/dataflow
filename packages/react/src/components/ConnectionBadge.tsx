import type { StreamStatus } from '@gridstorm/dataflow-core';

interface ConnectionBadgeProps {
  status: StreamStatus;
  latencyMs?: number;
  className?: string;
}

const STATUS_LABELS: Record<StreamStatus, string> = {
  disconnected:  'Disconnected',
  connecting:    'Connecting…',
  connected:     'Live',
  error:         'Error',
  paused:        'Paused',
  reconnecting:  'Reconnecting…',
  closed:        'Closed',
};

const STATUS_COLORS: Record<StreamStatus, string> = {
  disconnected:  '#6b7280',
  connecting:    '#f59e0b',
  connected:     '#10b981',
  error:         '#ef4444',
  paused:        '#8b5cf6',
  reconnecting:  '#f59e0b',
  closed:        '#6b7280',
};

export function ConnectionBadge({ status, latencyMs, className = '' }: ConnectionBadgeProps) {
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];

  return (
    <span
      className={`df-badge ${className}`}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            '6px',
        padding:        '3px 10px',
        borderRadius:   '9999px',
        fontSize:       '12px',
        fontWeight:     600,
        background:     `${color}22`,
        color,
        border:         `1px solid ${color}44`,
        letterSpacing:  '0.03em',
      }}
    >
      <span
        style={{
          width:        8,
          height:       8,
          borderRadius: '50%',
          background:   color,
          boxShadow:    status === 'connected' ? `0 0 0 2px ${color}44` : 'none',
          animation:    status === 'connected' ? 'df-pulse 1.5s ease-in-out infinite' : 'none',
        }}
      />
      {label}
      {latencyMs !== undefined && status === 'connected' && (
        <span style={{ opacity: 0.7, fontWeight: 400 }}>{latencyMs}ms</span>
      )}
    </span>
  );
}
