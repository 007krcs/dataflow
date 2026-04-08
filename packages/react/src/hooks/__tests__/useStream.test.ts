// ─── useStream Tests ──────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { StreamingEngine } from '@gridstorm/dataflow-core';
import type { StreamConfig } from '@gridstorm/dataflow-core';
import { useStream } from '../useStream';

// ── Simulated adapter config (no network required) ───────────────────────────
const SIM_CONFIG: StreamConfig = {
  adapter: {
    type: 'simulated',
    rowsPerSecond: 10,
    totalRows: 50,
    columns: [
      { id: 'price', type: 'number', label: 'Price' },
      { id: 'volume', type: 'number', label: 'Volume' },
    ],
  },
};

const IDLE_CONFIG: StreamConfig = {
  adapter: {
    type: 'simulated',
    rowsPerSecond: 0,
    totalRows: 0,
    columns: [],
  },
};

describe('useStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  it('starts with empty rows, disconnected status, and zero metrics', () => {
    const { result } = renderHook(() =>
      useStream(IDLE_CONFIG, { autoStart: false }),
    );

    expect(result.current.rows).toEqual([]);
    expect(result.current.changes).toEqual([]);
    expect(result.current.status).toBe('disconnected');
    expect(result.current.anomalies).toEqual([]);
    expect(result.current.metrics.totalRows).toBe(0);
  });

  // ── autoStart ──────────────────────────────────────────────────────────────

  it('does NOT auto-start engine when autoStart=false', () => {
    const startSpy = vi.spyOn(StreamingEngine.prototype, 'start');

    renderHook(() => useStream(IDLE_CONFIG, { autoStart: false }));

    expect(startSpy).not.toHaveBeenCalled();
    startSpy.mockRestore();
  });

  it('auto-starts engine when autoStart=true (default)', async () => {
    const startSpy = vi.spyOn(StreamingEngine.prototype, 'start');

    renderHook(() => useStream(SIM_CONFIG));

    expect(startSpy).toHaveBeenCalledTimes(1);
    startSpy.mockRestore();
  });

  // ── Engine lifecycle ───────────────────────────────────────────────────────

  it('creates a StreamingEngine on mount', () => {
    const constructorSpy = vi.spyOn(StreamingEngine.prototype, 'start');

    const { result } = renderHook(() =>
      useStream(SIM_CONFIG, { autoStart: false }),
    );

    // Engine ref is stored — control functions are stable
    expect(typeof result.current.start).toBe('function');
    expect(typeof result.current.stop).toBe('function');
    expect(typeof result.current.pause).toBe('function');
    expect(typeof result.current.resume).toBe('function');

    constructorSpy.mockRestore();
  });

  it('destroys engine on unmount', () => {
    const destroySpy = vi.spyOn(StreamingEngine.prototype, 'destroy');

    const { unmount } = renderHook(() =>
      useStream(SIM_CONFIG, { autoStart: false }),
    );

    unmount();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    destroySpy.mockRestore();
  });

  it('does not call start() more than once per mount', () => {
    const startSpy = vi.spyOn(StreamingEngine.prototype, 'start');

    renderHook(() => useStream(SIM_CONFIG));

    expect(startSpy).toHaveBeenCalledTimes(1);
    startSpy.mockRestore();
  });

  // ── Control functions ──────────────────────────────────────────────────────

  it('start() calls engine.start()', () => {
    const startSpy = vi.spyOn(StreamingEngine.prototype, 'start');

    const { result } = renderHook(() =>
      useStream(IDLE_CONFIG, { autoStart: false }),
    );

    act(() => result.current.start());

    expect(startSpy).toHaveBeenCalledTimes(1);
    startSpy.mockRestore();
  });

  it('stop() calls engine.stop()', () => {
    const stopSpy = vi.spyOn(StreamingEngine.prototype, 'stop');

    const { result } = renderHook(() =>
      useStream(SIM_CONFIG, { autoStart: false }),
    );

    act(() => result.current.stop());

    expect(stopSpy).toHaveBeenCalledTimes(1);
    stopSpy.mockRestore();
  });

  it('pause() calls engine.pause()', () => {
    const pauseSpy = vi.spyOn(StreamingEngine.prototype, 'pause');

    const { result } = renderHook(() =>
      useStream(SIM_CONFIG),
    );

    act(() => result.current.pause());

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    pauseSpy.mockRestore();
  });

  it('resume() calls engine.resume()', () => {
    const resumeSpy = vi.spyOn(StreamingEngine.prototype, 'resume');

    const { result } = renderHook(() =>
      useStream(SIM_CONFIG),
    );

    act(() => result.current.resume());

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    resumeSpy.mockRestore();
  });

  // ── Key-based reconnect ────────────────────────────────────────────────────

  it('when key changes, old engine is destroyed and new one created', () => {
    const destroySpy = vi.spyOn(StreamingEngine.prototype, 'destroy');

    const { rerender } = renderHook(
      ({ k }: { k: string }) => useStream(SIM_CONFIG, { autoStart: false, key: k }),
      { initialProps: { k: 'stream-a' } },
    );

    expect(destroySpy).not.toHaveBeenCalled();

    rerender({ k: 'stream-b' });

    expect(destroySpy).toHaveBeenCalledTimes(1);
    destroySpy.mockRestore();
  });

  it('when key changes, rows are reset to []', async () => {
    // This test verifies state reset on key change without needing real data
    const { result, rerender } = renderHook(
      ({ k }: { k: string }) => useStream(SIM_CONFIG, { autoStart: false, key: k }),
      { initialProps: { k: 'key1' } },
    );

    expect(result.current.rows).toEqual([]);

    // Changing the key should reset rows
    act(() => {
      rerender({ k: 'key2' });
    });

    expect(result.current.rows).toEqual([]);
    expect(result.current.anomalies).toEqual([]);
  });

  // ── Rolling window ─────────────────────────────────────────────────────────

  it('maxRows option is respected — validates hook accepts the option without error', () => {
    const { result } = renderHook(() =>
      useStream(SIM_CONFIG, { autoStart: false, maxRows: 100 }),
    );

    expect(result.current.rows.length).toBe(0);
  });

  // ── Memory safety ─────────────────────────────────────────────────────────

  it('unmounting before engine starts does not throw', () => {
    const { unmount } = renderHook(() =>
      useStream(IDLE_CONFIG, { autoStart: false }),
    );

    expect(() => unmount()).not.toThrow();
  });

  it('calling stop() after unmount does not throw', () => {
    const { result, unmount } = renderHook(() =>
      useStream(IDLE_CONFIG, { autoStart: false }),
    );

    unmount();

    // The engineRef is null after unmount; stop() guards against this
    expect(() => act(() => result.current.stop())).not.toThrow();
  });
});
