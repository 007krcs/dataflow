/**
 * markdown reporter — renders the bench report as a single .md file
 * suitable for pasting into the blog post or the README.
 *
 * Output: bench/results/bench-<ISO>.md
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchReport, Reporter, SuiteResult, BenchSample } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export class MarkdownReporter implements Reporter {
  async finalize(report: BenchReport): Promise<void> {
    const md = render(report);
    const tsSafe = report.env.ts.replace(/[:.]/g, '-');
    const outDir = resolve(__dirname, '../../results');
    await mkdir(outDir, { recursive: true });
    const outPath = resolve(outDir, `bench-${tsSafe}.md`);
    await writeFile(outPath, md, 'utf8');
    console.log(`\n[markdown] wrote ${outPath}`);
  }
}

function render(r: BenchReport): string {
  const lines: string[] = [];
  lines.push(`# DataFlow benchmark report`);
  lines.push('');
  lines.push(`**Run:** ${r.env.ts}  `);
  lines.push(`**Total time:** ${formatMs(r.totalMs)}  `);
  lines.push(`**Node:** ${r.env.node}  `);
  lines.push(`**Platform:** ${r.env.os}, ${r.env.cpu}, ${r.env.memoryGb} GB RAM  `);
  lines.push(`**Package:** ${r.env.package.name}@${r.env.package.version}`);
  lines.push('');

  for (const s of r.suites) {
    lines.push(`## ${s.title}`);
    lines.push('');
    lines.push(renderTable(s));
    if (s.notes) {
      lines.push('');
      lines.push(`> ${s.notes}`);
    }
    lines.push('');
    lines.push(`_Suite ran in ${formatMs(s.durationMs)}._`);
    lines.push('');
  }
  return lines.join('\n');
}

function renderTable(s: SuiteResult): string {
  const headers = s.columns;
  const align   = headers.map((_, i) => (i === 0 ? '---' : '---:'));
  const rows    = s.samples.map((sample) => row(s, sample));
  return [
    `| ${headers.join(' | ')} |`,
    `| ${align.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

function row(s: SuiteResult, sample: BenchSample): string[] {
  // First column = label; second = primary value+unit; rest pulled from detail
  const out: string[] = [sample.label];
  out.push(`${formatValue(sample.value)} ${sample.unit}`);
  for (let i = 2; i < s.columns.length; i++) {
    const key = s.columns[i]!.toLowerCase().replace(/\s+/g, '_');
    const v   = sample.detail?.[key] ?? sample.detail?.[s.columns[i]!];
    out.push(v == null ? '—' : String(v));
  }
  return out;
}

function formatValue(v: number): string {
  if (v < 0)        return '—';
  if (v >= 1000)    return v.toLocaleString('en-US');
  if (v % 1 === 0)  return String(v);
  return v.toFixed(1);
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
