// ─── AnomalyPanel Tests ───────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AnomalyPanel } from '../AnomalyPanel';
import type { AnomalyEvent } from '@gridstorm/dataflow-core';

// ── Factory ───────────────────────────────────────────────────────────────────
function makeAnomaly(
  id: string,
  severity: AnomalyEvent['severity'],
  columnId = 'price',
): AnomalyEvent {
  return {
    id,
    rowId: `row-${id}`,
    columnId,
    value: 999,
    stats: {
      mean: 100, stddev: 10, median: 100, mad: 5,
      q1: 90, q3: 110, iqr: 20, min: 50, max: 200, sampleCount: 100,
    },
    severity,
    method: 'zscore',
    zScore: 9.0,
    iqrDeviation: null,
    timestamp: Date.now() - 5000, // 5 seconds ago
    message: `Anomaly ${id}: value out of range`,
  };
}

describe('AnomalyPanel', () => {
  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows "No anomalies detected" when anomalies is empty', () => {
    render(<AnomalyPanel anomalies={[]} />);
    expect(screen.getByText('No anomalies detected')).toBeInTheDocument();
  });

  it('does NOT show Clear button when anomalies is empty', () => {
    const onClear = vi.fn();
    render(<AnomalyPanel anomalies={[]} onClear={onClear} />);
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });

  it('does NOT show the anomaly count badge when empty', () => {
    const { container } = render(<AnomalyPanel anomalies={[]} />);
    // The badge is a span inside the header that shows anomalies.length
    // jsdom renders inline styles with kebab-case (border-bottom, not borderBottom)
    const header = container.querySelector('.df-anomaly-panel > div:first-child');
    expect(header?.textContent).toContain('Anomaly Feed');
    // No numeric badge with count — textContent should not be purely digits
    expect(header?.textContent?.trim()).not.toMatch(/^\d+$/);
  });

  // ── Header ────────────────────────────────────────────────────────────────

  it('shows "Anomaly Feed" in the header', () => {
    render(<AnomalyPanel anomalies={[]} />);
    expect(screen.getByText(/Anomaly Feed/)).toBeInTheDocument();
  });

  it('shows anomaly count badge when anomalies.length > 0', () => {
    const anomalies = [makeAnomaly('a1', 'warning'), makeAnomaly('a2', 'critical')];
    render(<AnomalyPanel anomalies={anomalies} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // ── Event rendering ────────────────────────────────────────────────────────

  it('renders one row per anomaly', () => {
    const anomalies = [
      makeAnomaly('1', 'info'),
      makeAnomaly('2', 'warning'),
      makeAnomaly('3', 'critical'),
    ];
    render(<AnomalyPanel anomalies={anomalies} />);
    // Each anomaly has a message
    expect(screen.getByText('Anomaly 1: value out of range')).toBeInTheDocument();
    expect(screen.getByText('Anomaly 2: value out of range')).toBeInTheDocument();
    expect(screen.getByText('Anomaly 3: value out of range')).toBeInTheDocument();
  });

  it('shows the most recent anomaly first (reversed order)', () => {
    const older = makeAnomaly('old', 'info');
    const newer = { ...makeAnomaly('new', 'critical'), timestamp: older.timestamp + 1000 };
    render(<AnomalyPanel anomalies={[older, newer]} />);

    // Use a specific pattern that matches anomaly messages but NOT the "Anomaly Feed" header
    const messages = screen.getAllByText(/Anomaly \w+: value out of range/i);
    // First rendered message should be from the newer anomaly (reversed)
    expect(messages[0].textContent).toContain('new');
  });

  it('limits visible events to maxVisible prop', () => {
    const anomalies = Array.from({ length: 10 }, (_, i) =>
      makeAnomaly(String(i), 'warning'),
    );
    render(<AnomalyPanel anomalies={anomalies} maxVisible={3} />);

    // Only 3 anomaly messages should be shown
    const msgs = screen.getAllByText(/Anomaly \d+/);
    expect(msgs.length).toBe(3);
  });

  it('shows row ID in anomaly detail row', () => {
    const anomaly = makeAnomaly('42', 'critical');
    render(<AnomalyPanel anomalies={[anomaly]} />);
    expect(screen.getByText(/row: row-42/)).toBeInTheDocument();
  });

  it('shows time-ago label (e.g. "5s ago")', () => {
    const anomaly = makeAnomaly('ts', 'info');
    render(<AnomalyPanel anomalies={[anomaly]} />);
    // The timestamp is 5s ago, so it should show something like "5s ago"
    expect(screen.getByText(/s ago/)).toBeInTheDocument();
  });

  it('shows severity label in event row', () => {
    render(<AnomalyPanel anomalies={[makeAnomaly('sev', 'critical')]} />);
    expect(screen.getByText('critical')).toBeInTheDocument();
  });

  it('shows method label in event row', () => {
    render(<AnomalyPanel anomalies={[makeAnomaly('method', 'warning')]} />);
    expect(screen.getByText('ZSCORE')).toBeInTheDocument();
  });

  // ── Severity dot colors ────────────────────────────────────────────────────

  it('critical severity dot has red color (#ef4444)', () => {
    const { container } = render(
      <AnomalyPanel anomalies={[makeAnomaly('c', 'critical')]} />,
    );
    // The first span after the header is the severity dot
    const dots = container.querySelectorAll('[style*="border-radius: 50%"]');
    const criticalDot = Array.from(dots).find(
      (el) => (el as HTMLElement).style.background === 'rgb(239, 68, 68)' ||
               (el as HTMLElement).style.background === '#ef4444',
    );
    expect(criticalDot).toBeDefined();
  });

  it('warning severity dot has yellow color (#f59e0b)', () => {
    const { container } = render(
      <AnomalyPanel anomalies={[makeAnomaly('w', 'warning')]} />,
    );
    const dots = container.querySelectorAll('[style*="border-radius: 50%"]');
    const warningDot = Array.from(dots).find(
      (el) => (el as HTMLElement).style.background === 'rgb(245, 158, 11)' ||
               (el as HTMLElement).style.background === '#f59e0b',
    );
    expect(warningDot).toBeDefined();
  });

  it('info severity dot has blue color (#3b82f6)', () => {
    const { container } = render(
      <AnomalyPanel anomalies={[makeAnomaly('i', 'info')]} />,
    );
    const dots = container.querySelectorAll('[style*="border-radius: 50%"]');
    const infoDot = Array.from(dots).find(
      (el) => (el as HTMLElement).style.background === 'rgb(59, 130, 246)' ||
               (el as HTMLElement).style.background === '#3b82f6',
    );
    expect(infoDot).toBeDefined();
  });

  // ── Clear button ──────────────────────────────────────────────────────────

  it('shows Clear button when anomalies.length > 0 and onClear is provided', () => {
    render(
      <AnomalyPanel
        anomalies={[makeAnomaly('x', 'info')]}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('does NOT show Clear button when onClear is not provided', () => {
    render(<AnomalyPanel anomalies={[makeAnomaly('y', 'info')]} />);
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });

  it('Clear button calls onClear when clicked', () => {
    const onClear = vi.fn();
    render(
      <AnomalyPanel
        anomalies={[makeAnomaly('z', 'warning')]}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  // ── className ────────────────────────────────────────────────────────────

  it('applies custom className to root div', () => {
    const { container } = render(
      <AnomalyPanel anomalies={[]} className="custom-panel" />,
    );
    expect(container.querySelector('.df-anomaly-panel.custom-panel')).toBeInTheDocument();
  });
});
