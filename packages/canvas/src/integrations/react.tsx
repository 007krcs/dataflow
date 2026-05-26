// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * <CanvasGrid> — React wrapper around CanvasGridRenderer.
 *
 * Usage with @gridstorm/dataflow-react:
 *
 *   const { rows, changes } = useStream(config);
 *
 *   <CanvasGrid
 *     rows={rows}
 *     changes={changes}
 *     columns={[
 *       { key: 'symbol', width: 90 },
 *       { key: 'price',  align: 'right', format: (v) => `$${Number(v).toFixed(2)}` },
 *     ]}
 *     style={{ width: '100%', height: 480 }}
 *   />
 *
 * The component owns the renderer lifecycle, resize observer, and wheel
 * scroll handler. It does NOT own data — it forwards `rows`/`changes` into
 * the renderer on every render.
 */

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import type { StreamRow, CellChange } from '@gridstorm/dataflow-core';

import { CanvasGridRenderer } from '../renderer/CanvasGridRenderer.js';
import type {
  CanvasGridColumn,
  CanvasGridConfig,
  CanvasGridHit,
  CanvasGridTheme,
} from '../types.js';

export interface CanvasGridProps {
  rows:     readonly StreamRow[];
  changes?: readonly CellChange[];
  columns:  CanvasGridColumn[];

  rowHeight?:       number;
  headerHeight?:    number;
  flashDurationMs?: number;
  theme?:           Partial<CanvasGridTheme>;
  maxRows?:         number;

  /** Called on click — receives the cell hit or null if header/empty area. */
  onCellClick?: (hit: CanvasGridHit | null, event: React.MouseEvent) => void;

  className?: string;
  style?:     React.CSSProperties;
}

export function CanvasGrid(props: CanvasGridProps) {
  const {
    rows, changes, columns,
    rowHeight, headerHeight, flashDurationMs, theme, maxRows,
    onCellClick, className, style,
  } = props;

  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef  = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<CanvasGridRenderer | null>(null);
  // Stash latest columns/config so resize doesn't have to bring them through deps
  const configRef   = useRef<CanvasGridConfig>({
    columns, rowHeight, headerHeight, flashDurationMs, theme, maxRows,
  });
  configRef.current = { columns, rowHeight, headerHeight, flashDurationMs, theme, maxRows };

  // ── Construct renderer once on mount ────────────────────────────────────────
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new CanvasGridRenderer(canvas, configRef.current);
    rendererRef.current = renderer;
    return () => { renderer.destroy(); rendererRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync row updates ────────────────────────────────────────────────────────
  useEffect(() => {
    rendererRef.current?.update({ rows, changes });
  }, [rows, changes]);

  // ── Resize observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      rendererRef.current?.resize(width, height);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ── Wheel scrolling — call setScrollTop ─────────────────────────────────────
  useEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;
    let scrollTop = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scrollTop += e.deltaY;
      if (scrollTop < 0) scrollTop = 0;
      rendererRef.current?.setScrollTop(scrollTop);
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  // ── Click → hit-test ────────────────────────────────────────────────────────
  const handleClick = (e: React.MouseEvent) => {
    if (!onCellClick || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const hit  = rendererRef.current?.hitTest(e.clientX - rect.left, e.clientY - rect.top) ?? null;
    onCellClick(hit, e);
  };

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', ...style }}
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
}
