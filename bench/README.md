# DataFlow benchmarks

Reproducible measurements behind the README's performance claims. Run locally with `pnpm bench`, share the JSON output, refute it if you can.

## Quick start

```bash
pnpm install                           # if not already done
pnpm build                             # builds packages — bundle-size suite needs dist/
pnpm --filter @gridstorm/dataflow-bench bench
```

Artifacts land in `bench/results/bench-<timestamp>.{json,md}` when you ask for the json or markdown reporter:

```bash
pnpm --filter @gridstorm/dataflow-bench bench --reporter json,markdown,console
```

Run a single suite:

```bash
pnpm --filter @gridstorm/dataflow-bench bench --suite bundle-size
pnpm --filter @gridstorm/dataflow-bench bench --suite engine-throughput
pnpm --filter @gridstorm/dataflow-bench bench --suite anomaly-throughput
```

## What it measures

| Suite | What | How |
|---|---|---|
| `bundle-size` | Gzipped size of every published `dist/index.js` | `gzip -9` on the obfuscated tsup output |
| `engine-throughput` | Rows/sec the `StreamingEngine` ingests + dispatches | Inject batches of 100 rows for 2 s, count delivered via `onRows` |
| `anomaly-throughput` | Rows/sec at the detector layer, by method combo | 200 k single-column rows with Gaussian noise + 0.5% spikes |
| `canvas-render` | Browser paint FPS, DOM vs Canvas, three load presets | **STUB** — Playwright integration planned (see suite source) |

## Methodology notes

**Why Node-side throughput is an upper bound, not a realistic ceiling.** The engine batches via `requestAnimationFrame`, which Node doesn't have. We polyfill rAF with `setTimeout(_, 16ms)` for the bench. That removes real-browser rendering work from the measurement — these numbers say "the engine can process this much," not "your dashboard will render this much." For real-browser rendered FPS, use the `canvas-render` suite (when implemented) or hand-read the live FPS counter on `dataflow.tekivex.com/canvas`.

**Why we use the public engine API, not internal classes.** `AnomalyDetector`, `RingBuffer`, `BackpressureController` are intentionally unexported (see `packages/core/src/index.ts`). Benchmarking them in isolation would measure something users can't access. We drive everything through `StreamingEngine` + `injectRows` — same path a real consumer takes.

**Why warmup matters.** V8 needs ~300 ms of warm execution before its JIT settles on optimised code. Every throughput suite throws away the first 300 ms before starting the measurement window. Skipping warmup typically under-reports steady-state by 2–4×.

**What the numbers don't tell you.** Memory pressure, GC pause distribution, latency tails (p99 row-to-callback delay) — none of these are measured today. If you care about them more than throughput, file an issue; we'd rather measure what you'd actually use the answer for.

## Reading the markdown output

Each suite produces one table. The first column is the scenario label, the second is the headline number with unit, and the rest are detail dimensions (entity count, methods enabled, delivered/dropped counts, etc.). The bottom-of-table prose explains the methodology specific to that suite.

## Comparing across runs / versions

The JSON reporter writes a fully-structured `BenchReport`:

```json
{
  "env":    { "node": "v20.x.x", "cpu": "...", "memoryGb": 32, "ts": "2026-..." },
  "suites": [ { "id": "engine-throughput", "samples": [ ... ] } ],
  "totalMs": 12345
}
```

For regression detection in CI, compare two reports' `samples[].value` keyed by `samples[].label`. A pluggable comparator that fails the build on > 10% regression in the anomaly-throughput suite is on the v0.5 roadmap.

## Adding a new suite

1. Create `src/suites/<name>.ts` exporting `export async function run(): Promise<SuiteResult>`.
2. Add it to `SUITES` in `src/runner.ts`.
3. Add its id to the `SuiteId` union in `src/types.ts`.

The reporter layer is suite-agnostic — it just renders the rows you produce.

## What's not in this sketch yet

- **Playwright FPS suite** — the source of `suites/canvas-render.ts` has the full implementation plan in comments. Estimated half-day to wire up.
- **Memory pressure / GC pause distribution** — would use `--expose-gc` and `process.memoryUsage` deltas.
- **Cross-version diff CLI** — compare `bench-A.json` against `bench-B.json`, report deltas, exit non-zero on regression.
- **CI integration** — add a `bench-regression` GitHub Action that runs the json reporter on every PR and posts a comment with the diff vs main.

Skeleton release. Numbers from real runs go into `docs/BENCHMARKS_POST.md` and the README's Performance section.

## License

MIT — same as the rest of DataFlow.
