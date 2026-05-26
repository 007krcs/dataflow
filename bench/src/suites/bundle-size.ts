/**
 * bundle-size — measures gzipped size of every published dist/index.js
 * across the monorepo.
 *
 * Run after `pnpm build` (otherwise dist/ may be stale or missing).
 * These numbers are what users actually download, so they back the
 * README claims directly.
 */

import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SuiteResult, BenchSample } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '../../..');

interface Target {
  pkg:   string;
  entry: string;   // path under packages/
  label: string;
}

const TARGETS: Target[] = [
  { pkg: '@gridstorm/dataflow-core',   entry: 'core/dist/index.js',                    label: 'core'              },
  { pkg: '@gridstorm/dataflow-react',  entry: 'react/dist/index.js',                   label: 'react adapter'     },
  { pkg: '@gridstorm/dataflow-vue',    entry: 'vue/dist/index.js',                     label: 'vue adapter'       },
  { pkg: '@gridstorm/dataflow-svelte', entry: 'svelte/dist/index.js',                  label: 'svelte adapter'    },
  { pkg: '@gridstorm/dataflow-canvas', entry: 'canvas/dist/index.js',                  label: 'canvas core'       },
  { pkg: '@gridstorm/dataflow-canvas', entry: 'canvas/dist/react.js',                  label: 'canvas/react'      },
];

async function measureOne(t: Target): Promise<BenchSample | null> {
  const absPath = resolve(ROOT, 'packages', t.entry);
  try {
    const buf  = await readFile(absPath);
    const gz   = gzipSync(buf, { level: 9 });
    const raw  = (await stat(absPath)).size;
    const gzKb = Math.round((gz.length / 1024) * 10) / 10;
    return {
      label: `${t.pkg} (${t.label})`,
      unit:  'KB',
      value: gzKb,
      detail: {
        raw_kb:     Math.round((raw / 1024) * 10) / 10,
        raw_bytes:  raw.toLocaleString('en-US'),
        gz_bytes:   gz.length.toLocaleString('en-US'),
        entry:      t.entry,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      label: `${t.pkg} (${t.label})`,
      unit:  'KB',
      value: -1,
      detail: { error: `Not built — run \`pnpm build\` first. ${msg}` },
    };
  }
}

export async function run(): Promise<SuiteResult> {
  const t0 = performance.now();
  const samples: BenchSample[] = [];
  for (const t of TARGETS) {
    const s = await measureOne(t);
    if (s) samples.push(s);
  }
  return {
    id:    'bundle-size',
    title: 'Bundle size (gzipped, published dist/)',
    columns: ['Package', 'KB gzipped', 'raw KB', 'entry'],
    samples,
    durationMs: performance.now() - t0,
    notes:
      'Sizes are post-obfuscation gzip — what users actually download. ' +
      'Treeshakable code paths (unused adapters, replay, schema inferrer) ' +
      'will drop these numbers further in real consumer bundles.',
  };
}
