import type { AnomalyEvent } from '@dataflow/core';

interface AnomalyPanelProps {
  anomalies: AnomalyEvent[];
  maxVisible?: number;
  onClear?: () => void;
  className?: string;
}

const SEV_COLOR = {
  info:     '#3b82f6',
  warning:  '#f59e0b',
  critical: '#ef4444',
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function AnomalyPanel({ anomalies, maxVisible = 50, onClear, className = '' }: AnomalyPanelProps) {
  const visible = anomalies.slice(-maxVisible).reverse();

  return (
    <div
      className={`df-anomaly-panel ${className}`}
      style={{
        background:   '#0f172a',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        overflow:     'hidden',
        fontFamily:   'ui-monospace, "Cascadia Code", monospace',
      }}
    >
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '10px 14px',
        borderBottom:   '1px solid rgba(255,255,255,0.08)',
        background:     'rgba(255,255,255,0.03)',
      }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>
          Anomaly Feed
          {anomalies.length > 0 && (
            <span style={{ marginLeft: 8, background: '#ef4444', color: '#fff', borderRadius: 9999, padding: '1px 7px', fontSize: 11 }}>
              {anomalies.length}
            </span>
          )}
        </span>
        {onClear && anomalies.length > 0 && (
          <button
            onClick={onClear}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
              color: '#94a3b8', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontSize: 11,
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Events list */}
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {visible.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#475569', fontSize: 13 }}>
            No anomalies detected
          </div>
        ) : (
          visible.map((ev) => (
            <div
              key={ev.id}
              style={{
                display:     'flex',
                gap:         10,
                padding:     '8px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                alignItems:  'flex-start',
              }}
            >
              {/* Severity dot */}
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: SEV_COLOR[ev.severity],
                flexShrink: 0, marginTop: 4,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#cbd5e1', wordBreak: 'break-all' }}>
                  {ev.message}
                </div>
                <div style={{ marginTop: 3, display: 'flex', gap: 10, fontSize: 10, color: '#475569' }}>
                  <span>{ev.method.toUpperCase()}</span>
                  <span style={{ color: SEV_COLOR[ev.severity] }}>{ev.severity}</span>
                  <span>{timeAgo(ev.timestamp)}</span>
                  <span>row: {ev.rowId}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
