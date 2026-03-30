import React, { useState } from 'react';
import { useStream }        from '../hooks/useStream.ts';
import { StreamTable }      from '../components/StreamTable.tsx';
import { MetricBar }        from '../components/MetricBar.tsx';
import { ConnectionBadge }  from '../components/ConnectionBadge.tsx';
import type { StreamConfig, StreamRow } from '../../../packages/core/src/index.js';

const CONFIG: StreamConfig = {
  adapter: {
    type:           'simulated',
    scenario:       'ecommerce',
    entityCount:    16,
    tickIntervalMs: 600,
    seed:           13,
  },
  anomaly:     { enabled: false },
  backpressure: { maxBufferSize: 2000, targetFps: 30 },
};

const COLUMNS = [
  { key: 'category',       label: 'Category',    width: 110, align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'region',         label: 'Region',      width: 130, align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'orders',         label: 'Orders',      width: 90,  align: 'right' as const, format: (v: unknown) => Number(v).toLocaleString() },
  { key: 'newOrders',      label: 'New / tick',  width: 90,  align: 'right' as const, format: (v: unknown) => `+${v}` },
  { key: 'revenue',        label: 'Revenue',     width: 120, align: 'right' as const, format: (v: unknown) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
  { key: 'avgOrderValue',  label: 'Avg Order',   width: 100, align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'conversionRate', label: 'CVR %',       width: 80,  align: 'right' as const, format: (v: unknown) => `${v}%` },
  { key: 'cartAbandonment',label: 'Abandon %',   width: 90,  align: 'right' as const, format: (v: unknown) => `${v}%` },
];

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function EcommercePage() {
  const { rows, changes, status, metrics, start, stop } = useStream(CONFIG, { maxRows: 16 });

  const latestById = React.useMemo(() => {
    const map = new Map<string, StreamRow>();
    for (const r of rows) { if (r.id) map.set(String(r.id), r); }
    return Array.from(map.values());
  }, [rows]);

  // Aggregate KPIs
  const totalRevenue = latestById.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  const totalOrders  = latestById.reduce((s, r) => s + (Number(r.orders) || 0), 0);
  const avgCvr       = latestById.length
    ? latestById.reduce((s, r) => s + (Number(r.conversionRate) || 0), 0) / latestById.length
    : 0;
  const avgAov       = latestById.length
    ? latestById.reduce((s, r) => s + (Number(r.avgOrderValue) || 0), 0) / latestById.length
    : 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">E-Commerce Dashboard</h1>
          <p className="page-sub">16 category × region segments · 600ms ticks · Rolling revenue tracking</p>
        </div>
        <div className="page-actions">
          <ConnectionBadge status={status} />
          {status === 'connected'
            ? <button className="btn btn-danger" onClick={stop}>⏹ Stop</button>
            : <button className="btn btn-primary" onClick={start}>▶ Start</button>
          }
        </div>
      </div>

      <MetricBar metrics={metrics} />

      {/* KPI Row */}
      <div className="kpi-row">
        <KpiCard label="Total Revenue" value={`$${(totalRevenue / 1000).toFixed(1)}K`} sub="All segments" />
        <KpiCard label="Total Orders"  value={totalOrders.toLocaleString()} sub="Cumulative" />
        <KpiCard label="Avg CVR"       value={`${avgCvr.toFixed(1)}%`} sub="Conversion Rate" />
        <KpiCard label="Avg Order"     value={`$${avgAov.toFixed(2)}`} sub="Order Value" />
      </div>

      <div className="page-body">
        <StreamTable rows={latestById} changes={changes} columns={COLUMNS} maxRows={16} />
      </div>
    </div>
  );
}
