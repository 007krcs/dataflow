/**
 * StreamTable — High-performance live data table.
 *
 * Features:
 * - Cell flash animation on value change (green=up, red=down)
 * - Sortable columns
 * - Sticky header
 * - Number formatting
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { StreamRow, CellChange } from '../../../packages/core/src/index.js';

interface Column {
  key:      string;
  label:    string;
  width?:   number;
  align?:   'left' | 'right' | 'center';
  format?:  (v: unknown) => string;
  colorize?: boolean; // green/red based on direction
}

interface StreamTableProps {
  rows:        StreamRow[];
  changes:     CellChange[];
  columns:     Column[];
  maxRows?:    number;
  idField?:    string;
  customCell?: (columnKey: string, value: unknown, row: StreamRow) => React.ReactNode | null;
}

type FlashState = Map<string, 'up' | 'down'>; // `${rowId}::${col}` → direction

const FLASH_DURATION_MS = 600;

function formatNumber(v: unknown, decimals = 2): string {
  if (typeof v !== 'number') return String(v ?? '—');
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return v.toFixed(decimals);
}

export function StreamTable({ rows, changes, columns, maxRows = 100, idField = 'id', customCell }: StreamTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [flash, setFlash]     = useState<FlashState>(new Map());
  const flashTimers           = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Apply cell flash on changes
  useEffect(() => {
    if (changes.length === 0) return;
    setFlash((prev) => {
      const next = new Map(prev);
      for (const c of changes) {
        if (!c.direction || c.direction === 'flat') continue;
        const key = `${c.rowId}::${c.columnId}`;
        next.set(key, c.direction as 'up' | 'down');
        // Clear existing timer
        const old = flashTimers.current.get(key);
        if (old) clearTimeout(old);
        // Set clear timer
        flashTimers.current.set(key, setTimeout(() => {
          setFlash((f) => { const m = new Map(f); m.delete(key); return m; });
          flashTimers.current.delete(key);
        }, FLASH_DURATION_MS));
      }
      return next;
    });
  }, [changes]);

  // Sort rows
  const sorted = React.useMemo(() => {
    let r = rows.slice(-maxRows);
    if (sortKey) {
      r = [...r].sort((a, b) => {
        const av = a[sortKey] as number | string;
        const bv = b[sortKey] as number | string;
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, sortKey, sortDir, maxRows]);

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); return key; }
      setSortDir('desc');
      return key;
    });
  }, []);

  return (
    <div className="stream-table-wrap">
      <table className="stream-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width, textAlign: col.align ?? 'left', cursor: 'pointer' }}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && (
                  <span style={{ marginLeft: 4, opacity: 0.6 }}>
                    {sortDir === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const rowId = String(row[idField] ?? row.id ?? row.symbol ?? '');
            return (
              <tr key={rowId}>
                {columns.map((col) => {
                  const val     = row[col.key];
                  const flashKey = `${rowId}::${col.key}`;
                  const dir     = flash.get(flashKey);
                  const formatted = col.format ? col.format(val) : formatNumber(val);
                  const custom = customCell ? customCell(col.key, val, row) : null;
                  return (
                    <td
                      key={col.key}
                      style={{ textAlign: col.align ?? 'left' }}
                      className={
                        dir === 'up'   ? 'cell-up' :
                        dir === 'down' ? 'cell-down' : ''
                      }
                    >
                      {custom !== null && custom !== undefined
                        ? custom
                        : col.colorize && typeof val === 'number'
                          ? <span className={val >= 0 ? 'val-pos' : 'val-neg'}>{formatted}</span>
                          : formatted
                      }
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
