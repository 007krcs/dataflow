/**
 * json reporter — machine-readable artifact.
 *
 * Used for diffing across versions (e.g. CI step that compares this PR's
 * numbers against main and fails if anomaly-throughput regresses > 10%).
 * Also what the blog post copy ingests programmatically.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchReport, Reporter } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export class JsonReporter implements Reporter {
  async finalize(report: BenchReport): Promise<void> {
    const tsSafe = report.env.ts.replace(/[:.]/g, '-');
    const outDir = resolve(__dirname, '../../results');
    await mkdir(outDir, { recursive: true });
    const outPath = resolve(outDir, `bench-${tsSafe}.json`);
    await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n[json] wrote ${outPath}`);
  }
}
