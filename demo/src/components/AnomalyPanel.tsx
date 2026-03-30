import React from 'react';
import type { AnomalyEvent } from '../../../packages/core/src/index.js';

const SEV: Record<string, string> = { info: '#3b82f6', warning: '#f59e0b', critical: '#ef4444' };
function ago(ts: number) { const s = Math.floor((Date.now() - ts) / 1000); return s < 60 ? `${s}s` : `${Math.floor(s/60)}m`; }

export function AnomalyPanel({ anomalies, onClear }: { anomalies: AnomalyEvent[]; onClear?: () => void }) {
  const visible = anomalies.slice(-60).reverse();
  return (
    <div className="anom-panel">
      <div className="anom-header">
        <span className="anom-title">
          Anomaly Feed
          {anomalies.length > 0 && <span className="anom-count">{anomalies.length}</span>}
        </span>
        {onClear && <button className="anom-clear" onClick={onClear}>Clear</button>}
      </div>
      <div className="anom-list">
        {visible.length === 0
          ? <div className="anom-empty">No anomalies detected</div>
          : visible.map((ev) => (
            <div key={ev.id} className="anom-row">
              <span className="anom-dot" style={{ background: SEV[ev.severity] }} />
              <div className="anom-body">
                <div className="anom-msg">{ev.message}</div>
                <div className="anom-meta">
                  <span>{ev.method.toUpperCase()}</span>
                  <span style={{ color: SEV[ev.severity] }}>{ev.severity}</span>
                  <span>{ago(ev.timestamp)} ago</span>
                  <span>row:{ev.rowId}</span>
                </div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
