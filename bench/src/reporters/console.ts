/**
 * console reporter — what shows in the terminal while bench runs.
 *
 * Default reporter when no `--reporter` flag is passed.
 */

import type { BenchReport, Reporter, SuiteResult } from '../types.js';

export class ConsoleReporter implements Reporter {
  finalize(report: BenchReport): void {
    console.log('');
    console.log('━━━ DataFlow Benchmark Report ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Run        : ${report.env.ts}`);
    console.log(`Node       : ${report.env.node}`);
    console.log(`Platform   : ${report.env.os}`);
    console.log(`CPU        : ${report.env.cpu}`);
    console.log(`Memory     : ${report.env.memoryGb} GB`);
    console.log(`Total time : ${formatMs(report.totalMs)}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    for (const suite of report.suites) {
      console.log('');
      console.log(`▌ ${suite.title}    (${formatMs(suite.durationMs)})`);
      printSuite(suite);
      if (suite.notes) {
        console.log(`  └─ ${suite.notes}`);
      }
    }
    console.log('');
  }
}

function printSuite(suite: SuiteResult): void {
  // Compute padding from the longest label
  const labelWidth = Math.max(...suite.samples.map((s) => s.label.length));
  const valueWidth = 16;
  for (const s of suite.samples) {
    const label = s.label.padEnd(labelWidth);
    const valStr = s.value < 0 ? '—' : `${formatValue(s.value)} ${s.unit}`;
    console.log(`  ${label}  ${valStr.padStart(valueWidth)}`);
  }
}

function formatValue(v: number): string {
  if (v >= 1000)   return v.toLocaleString('en-US');
  if (v % 1 === 0) return String(v);
  return v.toFixed(1);
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
