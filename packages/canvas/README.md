# @gridstorm/dataflow-canvas

**Canvas-2D streaming grid renderer for [DataFlow](https://dataflow.tekivex.com).** When the DOM-based grid melts under 10 000+ visible rows, this is the renderer that doesn't.

> **Status: alpha (skeleton release).** Public API is stable; layout features beyond fixed/flex column widths (sticky columns, sorting, selection rendering) are not yet implemented. WebGL backend stub present; not wired.

**Browser-only** · TypeScript · MIT · React adapter included

## Install

```bash
npm install @gridstorm/dataflow-core @gridstorm/dataflow-canvas
```

## Quick Start (React)

```tsx
import { useStream } from '@gridstorm/dataflow-react';
import { CanvasGrid } from '@gridstorm/dataflow-canvas/react';

export function StockGrid() {
  const { rows, changes } = useStream({
    adapter: { type: 'websocket', url: 'ws://localhost:8080?scenario=financial' },
    backpressure: { maxBufferSize: 50_000, targetFps: 60 },
  });

  return (
    <CanvasGrid
      rows={rows}
      changes={changes}
      columns={[
        { key: 'symbol', width: 90 },
        { key: 'price',  align: 'right', format: (v) => `$${Number(v).toFixed(2)}` },
        { key: 'volume', align: 'right', format: (v) => Number(v).toLocaleString() },
      ]}
      style={{ width: '100%', height: 480 }}
    />
  );
}
```

## Quick Start (vanilla / any framework)

```ts
import { CanvasGridRenderer } from '@gridstorm/dataflow-canvas';

const canvas   = document.getElementById('grid') as HTMLCanvasElement;
const renderer = new CanvasGridRenderer(canvas, {
  columns: [
    { key: 'symbol', width: 90 },
    { key: 'price',  align: 'right' },
  ],
});

renderer.resize(window.innerWidth, 480);
renderer.update({ rows: myRows, changes: myChanges });

// Wheel scroll
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  renderer.setScrollTop(renderer.viewport.scrollTop + e.deltaY);
}, { passive: false });
```

## Why canvas?

DOM rendering hits a wall when you have:

- **10 000+ rows visible** at once (DOM nodes balloon, layout cost dominates)
- **Per-cell change animations** at high frequency (style recalcs trigger reflow)
- **Sub-16ms render budget** with hundreds of independent updates per frame

`@gridstorm/dataflow-canvas` solves all three by:

1. **One canvas, zero DOM per cell.** A 100 K-row grid is the same DOM footprint as a 10-row grid.
2. **Offscreen layer caching.** Background, gridlines, and header are pre-rendered once and blitted as a single `drawImage` per frame. The per-frame work is *just* the visible cells.
3. **Dirty-rect rAF scheduler.** Idle frames cost zero. Active frames coalesce overlapping invalidations before drawing.
4. **Cell-flash overlay.** Same `(rowId, columnKey)` flashing twice in the same animation window is de-duplicated, not stacked.

## Architecture

```
CanvasGridRenderer  ─┬─ FrameScheduler        rAF loop + dirty-rect coalescing
                     ├─ FontCache             measureText cache (>99% hit rate)
                     ├─ FlashLayer            active per-cell animation set
                     ├─ buildBackgroundLayer  offscreen: bg + zebra + gridlines
                     ├─ buildHeaderLayer      offscreen: column labels
                     ├─ paintCells            hot path: visible row text
                     └─ hitTest               mouse (x,y) → (rowIndex, columnKey)
```

The renderer is intentionally headless — it does not own the canvas DOM element, scroll input, or the streaming engine. Wire any of them up.

## API

```ts
new CanvasGridRenderer(canvas, config)

config: {
  columns:           CanvasGridColumn[];        // required
  rowHeight?:        number;                    // default 24
  headerHeight?:     number;                    // default 28
  flashDurationMs?:  number;                    // default 600
  theme?:            Partial<CanvasGridTheme>;  // merged into DEFAULT_THEME
  devicePixelRatio?: number;                    // default window.devicePixelRatio
  maxRows?:          number;                    // default 100_000
  backend?:          'canvas2d' | 'webgl';      // 'webgl' reserved
}

renderer.update({ rows, changes? })  // append/replace rows; trigger flashes
renderer.resize(cssW, cssH)          // call from a ResizeObserver
renderer.setScrollTop(px)            // wire to wheel / scrollbar / keyboard
renderer.hitTest(cssX, cssY)         // → { rowIndex, rowId, columnKey, rect } | null
renderer.viewport                    // current scroll & visible-row metrics
renderer.destroy()
```

## Theme

```ts
import { DEFAULT_THEME } from '@gridstorm/dataflow-canvas';

const dark = {
  ...DEFAULT_THEME,
  flashUp:   'rgba(34, 197, 94, 0.5)',
  flashDown: 'rgba(220, 38, 38, 0.5)',
};
```

All theme keys are overridable individually via `config.theme`.

## What's not in the skeleton yet

- Sticky / pinned columns
- Native sorting (caller still owns row order)
- Selection rendering (hit-test exists; visual highlight does not)
- Tooltips (use the `hitTest` result + a separate DOM tooltip)
- Custom cell renderers beyond `format(value) → string` (no sparklines/heatmap-cells yet)
- WebGL backend (the type is reserved; the implementation falls back to canvas2d with a `console.warn`)
- OffscreenCanvas in a Worker

These are tracked on the [DataFlow roadmap](https://github.com/007krcs/dataflow#readme).

## Performance notes

In the steady state on a current laptop (M2 / Ryzen 7 class, Chrome 120+):

- **Body cost per frame:** ~0.2 ms for a 20-row × 8-column visible window (the case the React adapter renders today)
- **Cache rebuild cost:** ~3 ms on layout change (resize/theme/columns)
- **Flash overhead per active flash:** ~3 µs
- **Hit-test:** O(log n) on columns, O(1) on rows

Skeleton-grade numbers — published benchmarks come with the first non-alpha release.

## License

MIT © [Tekivex](https://tekivex.com)
