#!/usr/bin/env node
/**
 * Bench CLI entry — `pnpm bench [flags]`.
 *
 * Flags:
 *   --reporter <list>   Comma-separated reporters: console | json | markdown
 *                       Default: console
 *                       Example: --reporter json,markdown,console
 *
 *   --suite <list>      Comma-separated suite ids to run.
 *                       Default: all suites
 *                       Valid: bundle-size | engine-throughput |
 *                              anomaly-throughput | canvas-render
 *
 *   --help              Print this help and exit
 *
 * Examples:
 *   pnpm bench                                  → all suites, console output
 *   pnpm bench --reporter json,markdown         → write both artifacts to bench/results/
 *   pnpm bench --suite bundle-size              → only the bundle-size pass
 *   pnpm bench --suite engine-throughput --reporter console,markdown
 */

import { runAll, buildReporters } from './runner.js';
import type { SuiteId } from './types.js';

const HELP = `
DataFlow benchmark runner

Usage: pnpm bench [--reporter <list>] [--suite <list>]

  --reporter <list>  console | json | markdown  (comma-separated, default: console)
  --suite    <list>  bundle-size | engine-throughput | anomaly-throughput | canvas-render
  --help             show this help

Examples:
  pnpm bench
  pnpm bench --reporter json,markdown
  pnpm bench --suite bundle-size
`;

function parseArgs(argv: string[]): { reporters: string[]; only: SuiteId[]; help: boolean } {
  const out = { reporters: [] as string[], only: [] as SuiteId[], help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (a === '--reporter' && argv[i + 1]) { out.reporters = argv[++i]!.split(',').map((s) => s.trim()); continue; }
    if (a === '--suite'    && argv[i + 1]) { out.only      = argv[++i]!.split(',').map((s) => s.trim()) as SuiteId[]; continue; }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  const reporters = buildReporters(args.reporters);
  await runAll({ only: args.only, reporters });
}

main().catch((err) => {
  console.error('bench failed:', err);
  process.exit(1);
});
