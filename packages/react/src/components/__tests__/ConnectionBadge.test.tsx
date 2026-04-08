// ─── ConnectionBadge Tests ────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ConnectionBadge } from '../ConnectionBadge';
import type { StreamStatus } from '@gridstorm/dataflow-core';

describe('ConnectionBadge', () => {
  // ── Status label rendering ─────────────────────────────────────────────────

  it('shows "Live" when status is connected', () => {
    render(<ConnectionBadge status="connected" />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows "Disconnected" when status is disconnected', () => {
    render(<ConnectionBadge status="disconnected" />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('shows "Paused" when status is paused', () => {
    render(<ConnectionBadge status="paused" />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('shows "Error" when status is error', () => {
    render(<ConnectionBadge status="error" />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('shows "Connecting…" when status is connecting', () => {
    render(<ConnectionBadge status="connecting" />);
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
  });

  it('shows "Reconnecting…" when status is reconnecting', () => {
    render(<ConnectionBadge status="reconnecting" />);
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  });

  it('shows "Closed" when status is closed', () => {
    render(<ConnectionBadge status="closed" />);
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  // ── Latency rendering ──────────────────────────────────────────────────────

  it('shows latencyMs value when connected and latencyMs is provided', () => {
    render(<ConnectionBadge status="connected" latencyMs={42} />);
    expect(screen.getByText('42ms')).toBeInTheDocument();
  });

  it('does NOT show latencyMs when status is not connected', () => {
    render(<ConnectionBadge status="paused" latencyMs={42} />);
    expect(screen.queryByText('42ms')).not.toBeInTheDocument();
  });

  it('does NOT show latencyMs when latencyMs is not provided', () => {
    render(<ConnectionBadge status="connected" />);
    expect(screen.queryByText(/ms/)).not.toBeInTheDocument();
  });

  it('shows latencyMs=0 when status=connected and 0 is provided', () => {
    render(<ConnectionBadge status="connected" latencyMs={0} />);
    // latencyMs={0} → condition: `latencyMs !== undefined && status === 'connected'`
    // 0 is not undefined, so it should show
    expect(screen.getByText('0ms')).toBeInTheDocument();
  });

  // ── DOM structure ──────────────────────────────────────────────────────────

  it('renders a span with the df-badge class', () => {
    const { container } = render(<ConnectionBadge status="connected" />);
    expect(container.querySelector('.df-badge')).toBeInTheDocument();
  });

  it('applies custom className alongside df-badge', () => {
    const { container } = render(
      <ConnectionBadge status="connected" className="my-custom" />,
    );
    const badge = container.querySelector('.df-badge');
    expect(badge?.classList.contains('my-custom')).toBe(true);
  });

  it('renders the pulse dot element when connected', () => {
    const { container } = render(<ConnectionBadge status="connected" />);
    const dot = container.querySelector('.df-badge span:first-child') as HTMLElement;
    expect(dot).toBeInTheDocument();
    // Connected status applies animation
    expect(dot?.style.animation).not.toBe('none');
  });

  it('dot has no animation when status is disconnected', () => {
    const { container } = render(<ConnectionBadge status="disconnected" />);
    const dot = container.querySelector('.df-badge span:first-child') as HTMLElement;
    expect(dot?.style.animation).toBe('none');
  });

  // ── Snapshot tests per status ──────────────────────────────────────────────

  const ALL_STATUSES: StreamStatus[] = [
    'connected', 'disconnected', 'paused', 'error',
    'connecting', 'reconnecting', 'closed',
  ];

  ALL_STATUSES.forEach((status) => {
    it(`snapshot: status="${status}" renders consistently`, () => {
      const { container } = render(<ConnectionBadge status={status} />);
      expect(container.querySelector('.df-badge')).toBeInTheDocument();
      // Badge should always have text content
      expect(container.querySelector('.df-badge')?.textContent?.length).toBeGreaterThan(0);
    });
  });
});
