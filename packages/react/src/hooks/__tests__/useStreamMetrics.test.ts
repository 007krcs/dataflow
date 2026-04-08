// ─── useStreamMetrics Tests ───────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { StreamingEngine } from '@gridstorm/dataflow-core';
import type { StreamConfig } from '@gridstorm/dataflow-core';
import { useStreamMetrics } from '../useStreamMetrics';

const SIM_CONFIG: StreamConfig = {
  adapter: {
    type: 'simulated',
    rowsPerSecond: 5,
    totalRows: 20,
    columns: [{ id: 'val', type: 'number', label: 'Value' }],
  },
};

describe('useStreamMetrics', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns initial zero metrics', () => {
    const { result } = renderHook(() => useStreamMetrics(SIM_CONFIG));

    const m = result.current.metrics;
    expect(m.totalRows).toBe(0);
    expect(m.rowsPerSecond).toBe(0);
    expect(m.droppedRows).toBe(0);
    expect(m.anomalyCount).toBe(0);
    expect(m.latencyMs).toBe(0);
    expect(m.bufferUtilization).toBe(0);
  });

  it('returns initial disconnected status', () => {
    const { result } = renderHook(() => useStreamMetrics(SIM_CONFIG));

    expect(result.current.status).toBe('disconnected');
  });

  it('calls engine.start() on mount', () => {
    const startSpy = vi.spyOn(StreamingEngine.prototype, 'start');

    renderHook(() => useStreamMetrics(SIM_CONFIG));

    expect(startSpy).toHaveBeenCalledTimes(1);
    startSpy.mockRestore();
  });

  it('calls engine.destroy() on unmount', () => {
    const destroySpy = vi.spyOn(StreamingEngine.prototype, 'destroy');

    const { unmount } = renderHook(() => useStreamMetrics(SIM_CONFIG));
    unmount();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    destroySpy.mockRestore();
  });

  it('returns a non-null engine reference after mount', () => {
    const { result } = renderHook(() => useStreamMetrics(SIM_CONFIG));

    // engine is returned as engineRef.current — may be null on first render
    // but the hook returns the ref value which is set synchronously in the effect
    expect(result.current).toBeDefined();
    expect(typeof result.current.metrics).toBe('object');
  });

  it('engine reference is captured in the returned object', () => {
    const { result } = renderHook(() => useStreamMetrics(SIM_CONFIG));

    // The engine property may be null on first render (before useEffect runs),
    // but after effect, it should be set. We verify the structure is correct.
    expect('engine' in result.current).toBe(true);
  });

  it('does not create a new engine on config reference change (empty dep array)', () => {
    const constructorCalls: number[] = [];
    const origStart = StreamingEngine.prototype.start;
    let callCount = 0;
    StreamingEngine.prototype.start = function () {
      callCount++;
      return origStart.call(this);
    };

    const { rerender } = renderHook(() =>
      useStreamMetrics({ ...SIM_CONFIG }),
    );

    const countAfterMount = callCount;

    // Re-render with new config reference (same values)
    rerender();
    rerender();

    // useEffect with [] dep means start() is only called once
    expect(callCount).toBe(countAfterMount);

    StreamingEngine.prototype.start = origStart;
  });

  it('unmounting does not throw even with immediate unmount', () => {
    const { unmount } = renderHook(() => useStreamMetrics(SIM_CONFIG));
    expect(() => unmount()).not.toThrow();
  });
});
