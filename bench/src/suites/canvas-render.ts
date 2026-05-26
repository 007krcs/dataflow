/**
 * canvas-render — STUB.
 *
 * Measures actual browser paint FPS on the demo's /canvas page across the
 * three load presets (Light / Medium / Heavy) for both renderers
 * (DOM and Canvas).
 *
 * Why this is a stub today:
 *   - Playwright integration adds a heavy dev dependency
 *   - Headless browser FPS != real browser FPS (driver overhead)
 *   - We already have e2e/ for Playwright — this benchmark should
 *     reuse that toolchain, not duplicate it
 *
 * Next step to implement (estimated half-day of work):
 *
 *   1. Add @playwright/test as a devDep here (or extend e2e/)
 *   2. Launch demo dev server, navigate to /canvas
 *   3. Use `page.evaluate` to install an FPS sampler that
 *      requestAnimationFrames into a window-level array
 *   4. Wait, sample, switch the renderer toggle, sample again
 *   5. Report {dom_fps, canvas_fps} per load preset
 *
 * Skeleton for the page-side sampler (will be injected via page.evaluate):
 *
 *   const samples = [];
 *   let lastT = performance.now();
 *   (function loop() {
 *     const now = performance.now();
 *     samples.push(1000 / (now - lastT));
 *     lastT = now;
 *     requestAnimationFrame(loop);
 *   })();
 *   // After N seconds:
 *   const p50 = median(samples);
 *   const p5  = percentile(samples, 5);
 *
 * Until then this suite reports "not implemented" so the report is
 * complete and machine-readable consumers know what to expect.
 */

import type { SuiteResult } from '../types.js';

export async function run(): Promise<SuiteResult> {
  return {
    id:    'canvas-render',
    title: 'Canvas vs DOM render FPS (browser)',
    columns: ['Preset', 'DOM fps', 'Canvas fps', 'note'],
    samples: [
      { label: 'Light (100 entities × 250ms)',  unit: 'fps', value: 0, detail: { note: 'not implemented — see suites/canvas-render.ts' } },
      { label: 'Medium (500 entities × 200ms)', unit: 'fps', value: 0, detail: { note: 'not implemented' } },
      { label: 'Heavy (1500 entities × 100ms)', unit: 'fps', value: 0, detail: { note: 'not implemented' } },
    ],
    durationMs: 0,
    notes:
      'Playwright-driven FPS measurement against demo /canvas page. ' +
      'Stub today — see source for the implementation plan. ' +
      'Interim numbers can be hand-captured from the in-page FPS counter ' +
      'that demo/src/pages/CanvasPage.tsx already renders.',
  };
}
