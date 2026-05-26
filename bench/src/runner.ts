/**
 * Bench orchestrator — picks suites, runs them, collects results, drives
 * reporters.
 *
 * Each suite exports an async `run()` that returns a SuiteResult. The
 * orchestrator is suite-agnostic; adding a new measurement = adding a
 * file to suites/ and a line to SUITES below.
 */

import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run as runEngineThroughput }  from './suites/engine-throughput.js';
import { run as runAnomalyThroughput } from './suites/anomaly-throughput.js';
import { run as runBundleSize }        from './suites/bundle-size.js';
import { run as runCanvasRender }      from './suites/canvas-render.js';

import { ConsoleReporter }  from './reporters/console.js';
import { JsonReporter }     from './reporters/json.js';
import { MarkdownReporter } from './reporters/markdown.js';

import type { BenchEnv, BenchReport, Reporter, SuiteId, SuiteResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

interface SuiteEntry { id: SuiteId; run: () => Promise<SuiteResult>; }

const SUITES: SuiteEntry[] = [
  { id: 'bundle-size',         run: runBundleSize        },
  { id: 'engine-throughput',   run: runEngineThroughput  },
  { id: 'anomaly-throughput',  run: runAnomalyThroughput },
  { id: 'canvas-render',       run: runCanvasRender      },
];

export interface RunOptions {
  /** If set, only suites whose id is in this list will run. */
  only?:     SuiteId[];
  /** Reporters to attach. Defaults to [console]. */
  reporters?: Reporter[];
}

export async function runAll(opts: RunOptions = {}): Promise<BenchReport> {
  const env       = await detectEnv();
  const reporters = opts.reporters ?? [new ConsoleReporter()];
  const filter    = opts.only;
  const suites    = filter && filter.length > 0
    ? SUITES.filter((s) => filter.includes(s.id))
    : SUITES;

  const results: SuiteResult[] = [];
  const t0 = performance.now();

  for (const suite of suites) {
    console.log(`▶ ${suite.id} …`);
    try {
      results.push(await suite.run());
    } catch (err) {
      const msg = err instanceof Error ? err.stack ?? err.message : String(err);
      console.error(`✗ ${suite.id} failed:\n${msg}`);
      results.push({
        id:         suite.id,
        title:      `${suite.id} (FAILED)`,
        columns:    ['Error'],
        samples:    [{ label: 'error', unit: 'count', value: -1, detail: { message: msg } }],
        durationMs: 0,
        notes:      'Suite threw — see CI logs for stack trace.',
      });
    }
  }

  const report: BenchReport = {
    env,
    suites:  results,
    totalMs: performance.now() - t0,
  };

  for (const r of reporters) {
    try { await r.finalize(report); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`reporter ${r.constructor.name} failed: ${msg}`);
    }
  }
  return report;
}

export function buildReporters(names: string[]): Reporter[] {
  const out: Reporter[] = [];
  for (const n of names) {
    switch (n) {
      case 'console':  out.push(new ConsoleReporter());  break;
      case 'json':     out.push(new JsonReporter());     break;
      case 'markdown': out.push(new MarkdownReporter()); break;
      default:
        console.warn(`[bench] unknown reporter: ${n}`);
    }
  }
  // Console is the default fallback if nothing else attaches
  if (out.length === 0) out.push(new ConsoleReporter());
  return out;
}

async function detectEnv(): Promise<BenchEnv> {
  const pkg = JSON.parse(
    await readFile(resolve(__dirname, '../package.json'), 'utf8'),
  ) as { name: string; version: string };

  const cpus = os.cpus();
  return {
    node:     process.version,
    os:       `${process.platform} ${os.release()} ${process.arch}`,
    cpu:      cpus[0]?.model ?? 'unknown',
    memoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    ts:       new Date().toISOString(),
    package:  { name: pkg.name, version: pkg.version },
  };
}
