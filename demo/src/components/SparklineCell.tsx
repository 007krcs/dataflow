/**
 * SparklineCell — Inline mini line chart for a single numeric series.
 * Uses recharts ResponsiveContainer + LineChart.
 * Designed to fit inside a table cell (height: 36px).
 */
import React from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

interface SparklineCellProps {
  data:    number[];
  color?:  string;
  height?: number;
  width?:  number;
}

export function SparklineCell({ data, color = '#6366f1', height = 36, width = 90 }: SparklineCellProps) {
  if (data.length < 2) return <span style={{ color: '#475569', fontSize: 11 }}>—</span>;

  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 11, padding: '2px 8px' }}
          itemStyle={{ color: '#f1f5f9' }}
          labelFormatter={() => ''}
          formatter={(v: number) => [v.toFixed(2), '']}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
