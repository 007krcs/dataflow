/**
 * ReplayBar — Transport controls for the time-travel replay player.
 *
 * Shows: ⏮ Stop | ⏪ Step-back | ⏸/▶ Play/Pause | ⏩ Step-forward
 *        Scrubber (range input) | Frame counter | Speed selector | Record indicator
 */
import React from 'react';
import type { PlayerState } from '../../../packages/core/src/index.js';

interface ReplayBarProps {
  state:    PlayerState;
  position: number;
  total:    number;
  speed:    number;
  isRecording?: boolean;
  onPlay:    () => void;
  onPause:   () => void;
  onStop:    () => void;
  onSeek:    (pos: number) => void;
  onStep:    (delta: number) => void;
  onSetSpeed:(s: number) => void;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export function ReplayBar({
  state, position, total, speed, isRecording = false,
  onPlay, onPause, onStop, onSeek, onStep, onSetSpeed,
}: ReplayBarProps) {
  const isPlaying = state === 'playing';
  const hasFrames = total > 0;

  return (
    <div className="replay-bar">
      {/* Record indicator */}
      {isRecording && (
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#ef4444', flexShrink: 0,
          animation: 'pulse-dot 1.2s ease-in-out infinite',
        }} title="Recording" />
      )}

      {/* Transport buttons */}
      <button className="replay-btn" onClick={onStop} title="Stop & reset" disabled={!hasFrames}>
        ⏹
      </button>
      <button className="replay-btn" onClick={() => onStep(-1)} disabled={!hasFrames || position === 0}>
        ⏮
      </button>
      <button
        className={`replay-btn ${isPlaying ? 'replay-btn--active' : ''}`}
        onClick={isPlaying ? onPause : onPlay}
        disabled={!hasFrames}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button className="replay-btn" onClick={() => onStep(1)} disabled={!hasFrames || position >= total - 1}>
        ⏭
      </button>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={position}
        disabled={!hasFrames}
        onChange={(e) => onSeek(Number(e.target.value))}
        style={{ flex: 1, minWidth: 80 }}
      />

      {/* Frame counter */}
      <span className="replay-label" style={{ minWidth: 80, textAlign: 'right' }}>
        {hasFrames ? `${position + 1} / ${total}` : '—'}
      </span>

      {/* Speed selector */}
      <div style={{ display: 'flex', gap: 3 }}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`replay-btn ${speed === s ? 'replay-btn--active' : ''}`}
            onClick={() => onSetSpeed(s)}
            style={{ padding: '3px 7px', fontSize: 11 }}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
