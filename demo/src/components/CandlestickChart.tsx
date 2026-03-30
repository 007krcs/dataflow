/**
 * CandlestickChart — OHLC candlestick chart for financial/crypto data.
 * Built with recharts ComposedChart using custom bar shapes.
 */
import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Line,
} from 'recharts';
import type { StreamRow } from '../../../packages/core/src/index.js';

interface OHLCBar {
  t:      number;
  label:  string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
  color:  string;
}

interface CandlestickChartProps {
  rows:    StreamRow[];
  symbol?: string;
  height?: number;
}

function buildBars(rows: StreamRow[], maxBars = 40): OHLCBar[] {
  // Group rows by symbol and take the last maxBars unique timestamps
  const pts = rows.slice(-maxBars);
  return pts.map((r) => {
    const open  = Number(r.open  ?? r.price);
    const close = Number(r.price ?? r.close);
    const high  = Number(r.high  ?? Math.max(open, close));
    const low   = Number(r.low   ?? Math.min(open, close));
    const d = new Date(r.timestamp);
    return {
      t:      r.timestamp,
      label:  `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`,
      open, high, low, close,
      volume: Number(r.volume ?? 0),
      color:  close >= open ? '#10b981' : '#ef4444',
    };
  });
}

/** Custom candlestick bar: renders wicks + body */
function CandleBar(props: {
  x?: number; y?: number; width?: number; height?: number;
  open?: number; high?: number; low?: number; close?: number;
  yScale?: (v: number) => number;
  color?: string;
}) {
  const { x = 0, width = 8, color = '#10b981' } = props;
  const open  = props.open  ?? 0;
  const high  = props.high  ?? 0;
  const low   = props.low   ?? 0;
  const close = props.close ?? 0;

  // Compute pixel positions using recharts internal yScale
  const yScale = props.yScale;
  if (!yScale) return null;

  const yHigh  = yScale(high);
  const yLow   = yScale(low);
  const yOpen  = yScale(open);
  const yClose = yScale(close);
  const bodyTop    = Math.min(yOpen, yClose);
  const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
  const cx = x + width / 2;

  return (
    <g>
      {/* Upper wick */}
      <line x1={cx} y1={yHigh} x2={cx} y2={bodyTop} stroke={color} strokeWidth={1} />
      {/* Body */}
      <rect x={x + 1} y={bodyTop} width={width - 2} height={bodyHeight} fill={color} fillOpacity={0.85} />
      {/* Lower wick */}
      <line x1={cx} y1={bodyTop + bodyHeight} x2={cx} y2={yLow} stroke={color} strokeWidth={1} />
    </g>
  );
}

const CustomCandlestick = (props: Record<string, unknown>) => {
  const { x, y: _y, width, payload, yAxis } = props as {
    x: number; y: number; width: number;
    payload: OHLCBar;
    yAxis: { scale: (v: number) => number };
  };
  if (!payload || !yAxis?.scale) return null;
  return (
    <CandleBar
      x={x - (width / 2)}
      width={width}
      open={payload.open}
      high={payload.high}
      low={payload.low}
      close={payload.close}
      color={payload.color}
      yScale={yAxis.scale}
    />
  );
};

export function CandlestickChart({ rows, symbol, height = 280 }: CandlestickChartProps) {
  const bars = useMemo(() => buildBars(rows, 40), [rows]);

  // Compute Y domain with 2% padding
  const allPrices = bars.flatMap((b) => [b.high, b.low]);
  const minP = allPrices.length ? Math.min(...allPrices) * 0.998 : 0;
  const maxP = allPrices.length ? Math.max(...allPrices) * 1.002 : 100;

  if (bars.length < 2) {
    return (
      <div className="chart-card" style={{ height }}>
        <div className="chart-title">{symbol ?? 'OHLC'} — Candlestick</div>
        <div className="chart-empty">Collecting data…</div>
      </div>
    );
  }

  return (
    <div className="chart-card" style={{ minHeight: height }}>
      <div className="chart-title">{symbol ?? 'OHLC'} — Candlestick</div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={bars} margin={{ top: 8, right: 16, bottom: 4, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: '#64748b' }}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={{ stroke: '#334155' }}
          />
          <YAxis
            domain={[minP, maxP]}
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickFormatter={(v: number) => `$${v >= 1000 ? `${(v/1000).toFixed(1)}K` : v.toFixed(2)}`}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as OHLCBar;
              if (!d) return null;
              return (
                <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
                  <div style={{ color: '#64748b', marginBottom: 4 }}>{d.label}</div>
                  <div style={{ color: '#94a3b8' }}>O: <span style={{ color: '#f1f5f9' }}>${d.open.toFixed(2)}</span></div>
                  <div style={{ color: '#94a3b8' }}>H: <span style={{ color: '#10b981' }}>${d.high.toFixed(2)}</span></div>
                  <div style={{ color: '#94a3b8' }}>L: <span style={{ color: '#ef4444' }}>${d.low.toFixed(2)}</span></div>
                  <div style={{ color: '#94a3b8' }}>C: <span style={{ color: d.color }}>${d.close.toFixed(2)}</span></div>
                  <div style={{ color: '#64748b', marginTop: 4 }}>Vol: {d.volume.toLocaleString()}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="close" shape={<CustomCandlestick />} isAnimationActive={false}>
            {bars.map((b, i) => <Cell key={i} fill={b.color} />)}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
