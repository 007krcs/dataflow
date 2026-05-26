/**
 * Minimal requestAnimationFrame polyfill for Node bench runs.
 *
 * The DataFlow engine drains its ring buffer on rAF ticks. In a real
 * browser that fires at the display refresh rate; in Node we approximate
 * ~60 Hz with setTimeout. Good enough for upper-bound throughput
 * measurement; NOT a substitute for real browser FPS — use Playwright
 * for that.
 */

const TARGET_INTERVAL_MS = 1000 / 60;

interface NodeGlobalWithRaf {
  requestAnimationFrame?: (cb: (now: number) => void) => number;
  cancelAnimationFrame?:  (id: number) => void;
  performance?:           { now: () => number };
}

let savedRaf: NodeGlobalWithRaf['requestAnimationFrame'] = undefined;
let savedCaf: NodeGlobalWithRaf['cancelAnimationFrame']  = undefined;
let installed = false;

export function installRafPolyfill(): void {
  if (installed) return;
  const g = globalThis as unknown as NodeGlobalWithRaf;
  savedRaf = g.requestAnimationFrame;
  savedCaf = g.cancelAnimationFrame;

  g.requestAnimationFrame = (cb) => {
    const handle = setTimeout(() => cb(performance.now()), TARGET_INTERVAL_MS);
    // Node's setTimeout returns a Timeout object; we coerce to a number for
    // API parity with the browser. The numeric handle round-trips through
    // cancelAnimationFrame.
    return handle as unknown as number;
  };

  g.cancelAnimationFrame = (id) => {
    clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
  };

  installed = true;
}

export function uninstallRafPolyfill(): void {
  if (!installed) return;
  const g = globalThis as unknown as NodeGlobalWithRaf;
  g.requestAnimationFrame = savedRaf;
  g.cancelAnimationFrame  = savedCaf;
  installed = false;
}
