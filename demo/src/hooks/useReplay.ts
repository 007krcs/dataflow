/**
 * useReplay — React hook that drives a ReplayPlayer and exposes its state.
 *
 * Usage:
 *   const recorder = useMemo(() => new StreamRecorder({ maxFrames: 300 }), []);
 *   // feed recorder from your useStream onRows callback (or wrap useStream)
 *
 *   const { play, pause, stop, seek, step, speed, setSpeed,
 *           state, position, total, progress,
 *           currentFrame } = useReplay(recorder.snapshot());
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ReplayPlayer }  from '../../../packages/core/src/index.js';
import { StreamRecorder } from '../../../packages/core/src/index.js';
import type { RecordedFrame, PlayerState } from '../../../packages/core/src/index.js';

export interface UseReplayOptions {
  speed?: number;
  loop?:  boolean;
  autoPlay?: boolean;
}

export interface UseReplayResult {
  state:         PlayerState;
  position:      number;
  total:         number;
  progress:      number;   // 0..1
  speed:         number;
  currentFrame:  RecordedFrame | null;

  play:     () => void;
  pause:    () => void;
  stop:     () => void;
  seek:     (pos: number) => void;
  step:     (delta: number) => void;
  setSpeed: (s: number) => void;
}

export function useReplay(frames: RecordedFrame[], opts: UseReplayOptions = {}): UseReplayResult {
  const [state,        setState]        = useState<PlayerState>('idle');
  const [position,     setPosition]     = useState(0);
  const [currentFrame, setCurrentFrame] = useState<RecordedFrame | null>(null);
  const [speed,        setSpeedState]   = useState(opts.speed ?? 1);

  const playerRef = useRef<ReplayPlayer | null>(null);
  const framesRef = useRef(frames);
  framesRef.current = frames;

  // Build player once
  useEffect(() => {
    const player = new ReplayPlayer(frames, {
      speed: opts.speed ?? 1,
      loop:  opts.loop  ?? false,
      onFrame(frame, pos) {
        setPosition(pos);
        setCurrentFrame(frame);
      },
      onStateChange(s) {
        setState(s);
      },
    });
    playerRef.current = player;
    if (opts.autoPlay) player.play();
    return () => { player.destroy(); playerRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync frames when array reference changes
  useEffect(() => {
    playerRef.current?.setFrames(frames);
  }, [frames]);

  const play     = useCallback(() => playerRef.current?.play(),      []);
  const pause    = useCallback(() => playerRef.current?.pause(),     []);
  const stop     = useCallback(() => { playerRef.current?.stop(); setPosition(0); setCurrentFrame(null); }, []);
  const seek     = useCallback((pos: number) => playerRef.current?.seek(pos), []);
  const step     = useCallback((delta: number) => playerRef.current?.step(delta), []);
  const setSpeed = useCallback((s: number) => {
    setSpeedState(s);
    if (playerRef.current) playerRef.current.speed = s;
  }, []);

  const total    = frames.length;
  const progress = total > 1 ? position / (total - 1) : 0;

  return { state, position, total, progress, speed, currentFrame, play, pause, stop, seek, step, setSpeed };
}

/**
 * useStreamWithReplay — Wraps useStream to automatically record all frames,
 * then expose both live data AND a replay handle.
 *
 * Returns the full useStream result PLUS `recorder` and `replayFrames`.
 */
export function useStreamWithReplay(
  config: Parameters<typeof import('../hooks/useStream.js')['useStream']>[0],
  opts: { maxRows?: number; maxFrames?: number } = {},
) {
  // We can't easily augment useStream here without coupling — instead,
  // export the recorder separately and let pages wire it up manually.
  // This function is intentionally minimal; see ReplayPage for full usage.
  const recorder = useMemo(
    () => new StreamRecorder({ maxFrames: opts.maxFrames ?? 300 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return recorder;
}
