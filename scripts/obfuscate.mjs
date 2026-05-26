/**
 * Post-build security hardening script.
 *
 * Runs after tsup to:
 *   1. DELETE all source-map files (.js.map, .cjs.map) — these expose original source
 *   2. STRIP //# sourceMappingURL= comments from every JS/CJS file
 *   3. OBFUSCATE every JS/CJS file with heavy identifier + string + control-flow transforms
 *
 * Usage: node ../../scripts/obfuscate.mjs [dist-dir]
 * Default dist-dir: ./dist
 *
 * What is hidden:  all internal variable/class names, logic flow, string literals
 * What is kept:    exported identifiers (renameGlobals: false)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, extname, basename } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let JavaScriptObfuscator;
try {
  JavaScriptObfuscator = require('javascript-obfuscator');
} catch {
  console.warn('[obfuscate] javascript-obfuscator not installed — skipping.');
  process.exit(0);
}

const distDir = process.argv[2] ?? './dist';

// ── Obfuscation options ──────────────────────────────────────────────────────
const OBFUSCATE_OPTS = {
  // Basics
  compact: true,
  target: 'browser',

  // Identifier mangling — internals become single/double letters
  identifierNamesGenerator: 'mangled',
  renameGlobals: false,          // keep exported names so consumers can import them
  renameProperties: false,       // keep property names (exported shapes must stay intact)

  // String encoding — literals encoded as base64 array lookups
  stringArray: true,
  rotateStringArray: true,
  shuffleStringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.85,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.75,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChunkCount: 2,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',

  // String splitting — each literal split into joined chunks
  splitStrings: true,
  splitStringsChunkLength: 8,

  // Numeric literals → opaque expressions
  numbersToExpressions: true,

  // Control-flow flattening — wraps logic in switch/while dispatch loops
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.3,

  // Self-defending — resists beautifiers/formatters at runtime
  selfDefending: true,

  // No dead code (keeps bundle small for a library)
  deadCodeInjection: false,

  // No debug protection (breaks legitimate devtools for consumers)
  debugProtection: false,

  // No source map output from obfuscator
  sourceMap: false,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const SOURCE_MAP_COMMENT = /\/\/# sourceMappingURL=\S+\s*$/gm;

function processDir(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    console.error(`[obfuscate] Cannot read directory "${dir}"`);
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    const st   = statSync(full);

    if (st.isDirectory()) {
      processDir(full);   // recurse into chunk subdirectories
      continue;
    }

    if (!st.isFile()) continue;

    const ext = extname(entry);

    // ── Delete source maps ─────────────────────────────────────────────────
    if (ext === '.map') {
      unlinkSync(full);
      console.log(`  🗑  deleted  ${basename(full)}`);
      continue;
    }

    // ── Obfuscate JS / CJS only (skip .d.ts / .d.cts) ────────────────────
    if ((ext !== '.js' && ext !== '.cjs') || entry.endsWith('.d.ts') || entry.endsWith('.d.cts')) {
      continue;
    }

    const raw     = readFileSync(full, 'utf8');
    // Strip sourceMappingURL comments before feeding to obfuscator
    const cleaned = raw.replace(SOURCE_MAP_COMMENT, '');
    const before  = cleaned.length;

    try {
      const result = JavaScriptObfuscator.obfuscate(cleaned, OBFUSCATE_OPTS);
      const out    = result.getObfuscatedCode();
      writeFileSync(full, out, 'utf8');
      const ratio  = ((out.length / before) * 100).toFixed(0);
      console.log(`  ✓ obfuscated ${basename(full)}  ${before.toLocaleString()} → ${out.length.toLocaleString()} bytes (${ratio}%)`);
    } catch (err) {
      console.error(`  ✗ failed ${basename(full)}: ${err.message}`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log(`[obfuscate] Hardening "${distDir}"…`);
processDir(distDir);
console.log('[obfuscate] Done.\n');
