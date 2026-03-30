import React, { useState, useMemo } from 'react';
import { useStream }             from '../hooks/useStream.ts';
import { StreamTable }           from '../components/StreamTable.tsx';
import { MetricBar }             from '../components/MetricBar.tsx';
import { ConnectionBadge }       from '../components/ConnectionBadge.tsx';
import { TimeSeriesChart }       from '../components/TimeSeriesChart.tsx';
import type { StreamConfig, StreamRow } from '../../../packages/core/src/index.js';

const CONFIG: StreamConfig = {
  adapter: {
    type:           'simulated',
    scenario:       'ecommerce',
    entityCount:    16,
    tickIntervalMs: 600,
    seed:           13,
  },
  anomaly:      { enabled: false },
  backpressure: { maxBufferSize: 2000, targetFps: 30 },
};

const COLUMNS = [
  { key: 'category',        label: 'Category',   width: 110, align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'region',          label: 'Region',     width: 130, align: 'left' as const,  format: (v: unknown) => String(v) },
  { key: 'orders',          label: 'Orders',     width: 90,  align: 'right' as const, format: (v: unknown) => Number(v).toLocaleString() },
  { key: 'newOrders',       label: 'New / tick', width: 90,  align: 'right' as const, format: (v: unknown) => `+${v}` },
  { key: 'revenue',         label: 'Revenue',    width: 120, align: 'right' as const, format: (v: unknown) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
  { key: 'avgOrderValue',   label: 'Avg Order',  width: 100, align: 'right' as const, format: (v: unknown) => `$${Number(v).toFixed(2)}` },
  { key: 'conversionRate',  label: 'CVR %',      width: 80,  align: 'right' as const, format: (v: unknown) => `${v}%` },
  { key: 'cartAbandonment', label: 'Abandon %',  width: 90,  align: 'right' as const, format: (v: unknown) => `${v}%` },
];

type PageTab = 'table' | 'charts' | 'kpis';

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
  const { rows, changes, status, metrics, start, stop } = useStream(CONFIG, { maxRows: 500 });
  const [tab, setTab] = useState<PageTab>('table');

  // Latest row per entity
  const latestById = useMemo(() => {
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

  // Revenue history per category (top 5 by latest revenue)
  const revenueHistory = useMemo(() => {
    const map = new Map<string, { t: number; v: number }[]>();
    // Determine top 5 categories by total revenue in latestById
    const topCats = latestById
      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
      .slice(0, 5)
      .map((r) => String(r.category));
    for (const r of rows) {
      const cat = String(r.category ?? r.id);
      if (!topCats.includes(cat)) continue;
      if (!map.has(cat)) map.set(cat, []);
      const arr = map.get(cat)!;
      arr.push({ t: r.timestamp, v: Number(r.revenue) });
      if (arr.length > 60) arr.splice(0, arr.length - 60);
    }
    return map;
  }, [rows, latestById]);

  // Orders history per region (top 5)
  const ordersHistory = useMemo(() => {
    const map = new Map<string, { t: number; v: number }[]>();
    const topRegions = [...new Set(latestById.map((r) => String(r.region)))].slice(0, 5);
    for (const r of rows) {
      const region = String(r.region ?? r.id);
      if (!topRegions.includes(region)) continue;
      if (!map.has(region)) map.set(region, []);
      const arr = map.get(region)!;
      arr.push({ t: r.timestamp, v: Number(r.orders) });
      if (arr.length > 60) arr.splice(0, arr.length - 60);
    }
    return map;
  }, [rows, latestById]);

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">E-Commerce Dashboard</h1>
          <p className="page-sub">16 category × region segments · 600ms ticks · Rolling revenue tracking</p>
        </div>
        <div className="page-actions">
          <div className="page-tabs">
            {(['table', 'charts', 'kpis'] as PageTab[]).map((t) => (
              <button key={t} className={`page-tab ${tab === t ? 'page-tab--active' : ''}`} onClick={() => setTab(t)}>
                {t === 'table' ? '⊞ Table' : t === 'charts' ? '📈 Charts' : '📊 KPIs'}
              </button>
            ))}
          </div>
          <ConnectionBadge status={status} latencyMs={metrics.latencyMs} />
          {status === 'connected'
            ? <button className="btn btn-danger"  onClick={stop}>⏹ Stop</button>
            : <button className="btn btn-primary" onClick={start}>▶ Start</button>
          }
        </div>
      </div>

      <MetricBar metrics={metrics} />

      {/* TABLE TAB */}
      {tab === 'table' && (
        <div className="page-body">
          <StreamTable rows={latestById} changes={changes} columns={COLUMNS} maxRows={16} />
        </div>
      )}

      {/* CHARTS TAB */}
      {tab === 'charts' && (
        <div className="charts-grid">
          <TimeSeriesChart
            history={revenueHistory}
            title="Revenue — Top 5 Categories"
            yLabel="Revenue $"
            height={280}
            formatY={(v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`}
          />
          <TimeSeriesChart
            history={ordersHistory}
            title="Orders — Top 5 Regions"
            yLabel="Orders"
            height={280}
            formatY={(v) => Math.round(v).toLocaleString()}
          />
        </div>
      )}

      {/* KPIs TAB */}
      {tab === 'kpis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="kpi-row">
            <KpiCard label="Total Revenue" value={`$${(totalRevenue / 1000).toFixed(1)}K`} sub="All segments" />
            <KpiCard label="Total Orders"  value={totalOrders.toLocaleString()} sub="Cumulative" />
            <KpiCard label="Avg CVR"       value={`${avgCvr.toFixed(1)}%`} sub="Conversion Rate" />
            <KpiCard label="Avg Order"     value={`$${avgAov.toFixed(2)}`} sub="Order Value" />
          </div>

          {/* Revenue breakdown by category */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {latestById
              .sort((a, b) => Number(b.revenue) - Number(a.revenue))
              .map((r) => {
                const rev = Number(r.revenue);
                const pct = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
                return (
                  <div key={String(r.id)} style={{
                    background: 'var(--bg-2)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)', padding: '12px 16px',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {String(r.category)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{String(r.region)}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                      ${(rev / 1000).toFixed(1)}K
                    </div>
                    <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: 'var(--bg-3)' }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: 'var(--accent)', transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{pct.toFixed(1)}% of total</div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
