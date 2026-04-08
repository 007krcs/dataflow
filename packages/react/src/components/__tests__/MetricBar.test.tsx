// ─── MetricBar Tests ──────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { MetricBar } from '../MetricBar';
import type { StreamMetrics } from '@gridstorm/dataflow-core';

const ZERO_METRICS: StreamMetrics = {
  totalRows: 0,
  rowsPerSecond: 0,
  droppedRows: 0,
  anomalyCount: 0,
  latencyMs: 0,
  bufferUtilization: 0,
  uptime: 0,
};

describe('MetricBar', () => {
  // ── Tile count ─────────────────────────────────────────────────────────────

  it('renders 5 metric tiles when latencyMs=0', () => {
    const { container } = render(<MetricBar metrics={ZERO_METRICS} />);
    // Each tile is a direct child div of the metric bar
    const bar = container.querySelector('.df-metric-bar');
    const tiles = bar?.children;
    expect(tiles?.length).toBe(5);
  });

  it('renders 6 metric tiles when latencyMs > 0', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, latencyMs: 25 };
    const { container } = render(<MetricBar metrics={metrics} />);
    const bar = container.querySelector('.df-metric-bar');
    expect(bar?.children.length).toBe(6);
  });

  it('does NOT render Latency tile when latencyMs=0', () => {
    render(<MetricBar metrics={ZERO_METRICS} />);
    expect(screen.queryByText('LATENCY')).not.toBeInTheDocument();
  });

  it('renders Latency tile when latencyMs > 0', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, latencyMs: 50 };
    render(<MetricBar metrics={metrics} />);
    expect(screen.getByText('LATENCY')).toBeInTheDocument();
  });

  // ── Label presence ─────────────────────────────────────────────────────────

  it('shows "TOTAL ROWS" label', () => {
    render(<MetricBar metrics={ZERO_METRICS} />);
    expect(screen.getByText('TOTAL ROWS')).toBeInTheDocument();
  });

  it('shows "ROWS/SEC" label', () => {
    render(<MetricBar metrics={ZERO_METRICS} />);
    expect(screen.getByText('ROWS/SEC')).toBeInTheDocument();
  });

  it('shows "DROPPED" label', () => {
    render(<MetricBar metrics={ZERO_METRICS} />);
    expect(screen.getByText('DROPPED')).toBeInTheDocument();
  });

  it('shows "ANOMALIES" label', () => {
    render(<MetricBar metrics={ZERO_METRICS} />);
    expect(screen.getByText('ANOMALIES')).toBeInTheDocument();
  });

  it('shows "BUFFER" label', () => {
    render(<MetricBar metrics={ZERO_METRICS} />);
    expect(screen.getByText('BUFFER')).toBeInTheDocument();
  });

  // ── Number formatting ──────────────────────────────────────────────────────

  it('formats 1000 as "1.0K"', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, totalRows: 1000 };
    render(<MetricBar metrics={metrics} />);
    expect(screen.getByText('1.0K')).toBeInTheDocument();
  });

  it('formats 1500 as "1.5K"', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, totalRows: 1500 };
    render(<MetricBar metrics={metrics} />);
    expect(screen.getByText('1.5K')).toBeInTheDocument();
  });

  it('formats 1_000_000 as "1.0M"', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, totalRows: 1_000_000 };
    render(<MetricBar metrics={metrics} />);
    expect(screen.getByText('1.0M')).toBeInTheDocument();
  });

  it('formats values < 1000 as plain string', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, totalRows: 42 };
    render(<MetricBar metrics={metrics} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('formats 999 as "999" (not K)', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, rowsPerSecond: 999 };
    render(<MetricBar metrics={metrics} />);
    expect(screen.getByText('999')).toBeInTheDocument();
  });

  // ── Color thresholds ───────────────────────────────────────────────────────

  it('dropped rows tile has warning color (#f59e0b) when droppedRows > 0', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, droppedRows: 5 };
    const { container } = render(<MetricBar metrics={metrics} />);
    const bar = container.querySelector('.df-metric-bar');
    // Find the tile for Dropped — it's the 3rd tile (index 2)
    const droppedTile = bar?.children[2] as HTMLElement;
    const valueEl = droppedTile?.querySelector('div:first-child') as HTMLElement;
    expect(valueEl?.style.color).toBe('#f59e0b');
  });

  it('anomalies tile has red color (#ef4444) when anomalyCount > 0', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, anomalyCount: 3 };
    const { container } = render(<MetricBar metrics={metrics} />);
    const bar = container.querySelector('.df-metric-bar');
    // 4th tile (index 3) = Anomalies
    const anomalyTile = bar?.children[3] as HTMLElement;
    const valueEl = anomalyTile?.querySelector('div:first-child') as HTMLElement;
    expect(valueEl?.style.color).toBe('#ef4444');
  });

  it('buffer tile has warning color at 51% utilization', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, bufferUtilization: 0.51 };
    const { container } = render(<MetricBar metrics={metrics} />);
    const bar = container.querySelector('.df-metric-bar');
    // 5th tile (index 4) = Buffer
    const bufferTile = bar?.children[4] as HTMLElement;
    const valueEl = bufferTile?.querySelector('div:first-child') as HTMLElement;
    expect(valueEl?.style.color).toBe('#f59e0b');
  });

  it('buffer tile has red color at 81% utilization', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, bufferUtilization: 0.81 };
    const { container } = render(<MetricBar metrics={metrics} />);
    const bar = container.querySelector('.df-metric-bar');
    const bufferTile = bar?.children[4] as HTMLElement;
    const valueEl = bufferTile?.querySelector('div:first-child') as HTMLElement;
    expect(valueEl?.style.color).toBe('#ef4444');
  });

  // ── className ─────────────────────────────────────────────────────────────

  it('applies custom className alongside df-metric-bar', () => {
    const { container } = render(
      <MetricBar metrics={ZERO_METRICS} className="my-bar" />,
    );
    expect(container.querySelector('.df-metric-bar.my-bar')).toBeInTheDocument();
  });

  // ── Buffer percentage formatting ───────────────────────────────────────────

  it('shows "0%" buffer at 0 utilization', () => {
    render(<MetricBar metrics={ZERO_METRICS} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows "75%" buffer at 0.75 utilization', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, bufferUtilization: 0.75 };
    render(<MetricBar metrics={metrics} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows latency in ms format when latencyMs > 0', () => {
    const metrics: StreamMetrics = { ...ZERO_METRICS, latencyMs: 123 };
    render(<MetricBar metrics={metrics} />);
    expect(screen.getByText('123ms')).toBeInTheDocument();
  });
});
