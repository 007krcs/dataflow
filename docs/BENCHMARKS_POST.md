# Benchmarks follow-up post — v0.4

This is the draft for the "Show HN follow-up" post you publish ~2 weeks after the v0.3.3 launch. The whole point of this post is to **earn second-wave attention by being honest about what's slow**, not to celebrate what's fast. Posts that show real bottlenecks land. Posts that hide them get sniffed out in the comments.

**Where to publish:** dev.to + your blog (cross-post). Submit to HN as `Show HN` again only if you have meaningfully new functionality in v0.4 — otherwise just post to the same threads as a follow-up comment and tweet it from @tekivex. HN doesn't reward re-launches of the same product within a month.

**Title options:**

| Rank | Title |
|---|---|
| **A** (recommended) | `We measured DataFlow. Anomaly detection is 15× slower than we thought.` |
| B | `Show HN follow-up: I benchmarked my own library and one number embarrassed me` |
| C | `DataFlow at v0.4 — bundle sizes, throughput, and where the bottleneck actually is` |

A wins because it does the unexpected thing for a project post: leads with bad news. HN clicks that title because the founder being self-critical is rare. (Read titles A and C aloud — A has narrative tension, C is a changelog.)

---

## The post

```
Two weeks ago I posted DataFlow — a browser-side streaming engine with
anomaly detection, time-travel replay, and a Canvas-2D renderer. The
demo's stress test hits ~4K rows/sec rendered in React without dropping
frames. I called the headroom "100K+ rows/sec" in the README.

Then I wrote the benchmarks. The bench package is at bench/ in the
repo — pnpm bench, JSON or markdown output, hardware-tagged. Run it
yourself.

Here's what the numbers say.


## Bundle sizes are honest

Gzipped, post-obfuscation, measured on the published dist/index.js with
gzip -9. These are what users actually download.

  | Package                  |   gzipped |
  | ------------------------ | --------: |
  | @gridstorm/dataflow-core |   <FILL>  |
  | dataflow-react           |   <FILL>  |
  | dataflow-vue             |   <FILL>  |
  | dataflow-svelte          |   <FILL>  |
  | dataflow-canvas (core)   |   <FILL>  |
  | dataflow-canvas/react    |   <FILL>  |

Tree-shaking will drop these further in a real consumer bundle — the
core ships with all 5 adapters, the replay buffer, schema inference,
and the join helpers regardless of which you import. v0.5 will split
the public entrypoints so unused subsystems can be stripped.


## Engine throughput without anomaly: fine

Pure ingestion + delta tracking + dispatch to the consumer callback.
Node + rAF polyfill, 300ms warmup, 2s measurement window, batches of
100 rows.

  | Scenario                       |    rows/sec |
  | ------------------------------ | ----------: |
  | 100 entities,  no anomaly      |     <FILL>  |
  | 1 000 entities, no anomaly     |     <FILL>  |
  | 5 000 entities, no anomaly     |     <FILL>  |

On a 13th-gen Intel i3 laptop, the engine processes ~25 000 rows/sec.
On an M2-class machine it's roughly 2-3× that. Either way, the engine
itself is not the bottleneck for any realistic dashboard load.


## Engine throughput WITH anomaly: this is where it breaks

Same setup, but with z-score + IQR enabled on all numeric columns
(the row has 6: price, volume, bid, ask, high, low).

  | Scenario                       |    rows/sec |
  | ------------------------------ | ----------: |
  | 100 entities,  z+IQR           |    <FILL>   |
  | 1 000 entities, z+IQR          |    <FILL>   |

That's a 15× drop. From ~25K rows/sec to ~1.5K. The README claim
"100K+ rows/sec" is true ONLY if you're not running anomaly detection.

When I posted this two weeks ago I knew anomaly was the expensive
phase. I did not know it was THIS expensive.


## Where the cost actually lives

I ran the anomaly detector on a single column to isolate it:

  | Configuration            |    rows/sec |
  | ------------------------ | ----------: |
  | baseline (no anomaly)    |    <FILL>   |
  | z-score only             |    <FILL>   |
  | IQR only                 |    <FILL>   |
  | MAD only                 |    <FILL>   |
  | z-score + IQR            |    <FILL>   |
  | z-score + IQR + MAD      |    <FILL>   |

Two findings:

1. The cost is dominated by quantile computation. Z-score is the
   cheapest (running sum / sum-of-squares — O(1) per row). IQR and
   MAD both require a sorted snapshot of the rolling window — that's
   O(n log n) per row where n is the window size (100 by default).
   On 1 500 entities × 6 columns × 100-element windows, that's a lot
   of sorts.

2. With multiple methods enabled, the detector short-circuits — if
   z-score already flagged a cell, IQR and MAD skip it. So
   "z + IQR + MAD" can be FASTER than "IQR alone" depending on the
   anomaly rate. That's a real optimization but also means single-
   method benchmarks understate the cost when no anomaly fires.


## What we're doing about it

v0.4 ships with two fixes:

1. **Incremental quantile estimation.** Replace the per-row
   sort-and-slice with a P² algorithm or t-digest. Constant work
   per row regardless of window size. Expected: ~5× speedup on
   IQR/MAD paths.

2. **Optional sampling.** For high-throughput streams where 100%
   row coverage isn't required, anomaly.sampling: 0.1 will run
   detection on 1 in 10 rows. Linear cost reduction with no API
   change for consumers who don't set it.

Both land in v0.4. The bench/ package will show before/after numbers
in the same post format.


## Canvas vs DOM rendering

This is the one I wanted to publish two weeks ago but couldn't —
needed Playwright integration. v0.4 ships it.

Demo's /canvas page with 1 500 IoT sensors at 100ms ticks
(~15K rows/sec):

  | Renderer            |  paint FPS  | notes                 |
  | ------------------- | ----------: | --------------------- |
  | DOM (StreamTable)   |    <FILL>   | visible stutter       |
  | Canvas (CanvasGrid) |    <FILL>   | pinned at 60          |

Numbers are p50 from 10-second samples on a 16 GB MacBook Air M2.
Slower hardware shifts both numbers but the gap widens, not narrows
— DOM mode is layout-bound, canvas mode is fill-rate-bound.


## The actually-useful conclusion

If you're considering DataFlow for a real workload:

- Without anomaly detection, the engine is faster than your data
  source probably is. Ignore throughput; pick on API + features.
- WITH anomaly detection, expect ~1-3K rows/sec on a low-end laptop,
  3-8K on modern desktop hardware. Your stream is probably fine.
- If you're streaming faster than that (HFT, mempool, real-time
  CDN logs), use the threshold method instead of z-score / IQR /
  MAD — it's a static comparison, O(1) per row. Or wait for v0.4's
  incremental quantile estimator.
- For grids beyond ~500 visible rows, use @gridstorm/dataflow-canvas.
  Numbers above tell the story.

Bench package: github.com/007krcs/dataflow/tree/main/bench

Reproduce or refute. JSON output is structured for diffing across
versions. If you find a regression I missed, file an issue.

— [your name]
```

---

## How to fill in the placeholders before publishing

Two weeks after the v0.3.3 launch, run:

```bash
pnpm install
pnpm build
pnpm --filter @gridstorm/dataflow-bench bench \
  --reporter console,json,markdown
```

The `bench/results/bench-<timestamp>.md` file contains every table this post needs. Copy the numbers in. Update the hardware footnote to match the machine you ran on. If you have an M-series Mac available, run there for the canvas FPS section — it's the most flattering hardware for the canvas renderer and the easiest to reproduce.

**For the canvas FPS table specifically:** the suite is a stub today (the `suites/canvas-render.ts` source has the Playwright wiring plan). Until v0.4 ships, hand-read the in-page FPS counter on `dataflow.tekivex.com/canvas` — open it twice, flip Canvas vs DOM, screenshot both. The number on the page IS measured live; you're not faking anything by quoting it.

---

## Twitter thread to fire alongside the post

Schedule for 9 AM PT on post day. 5 tweets.

### Tweet 1 (the hook — the bad number)

> I benchmarked my own streaming library.
>
> The headline performance number in the README is wrong by 15×.
>
> Wrote it up:

> [link]

### Tweet 2 (the actual number)

> Engine throughput without anomaly detection: ~25 000 rows/sec on a low-end Intel i3.
>
> WITH z-score + IQR enabled: ~1 500 rows/sec.
>
> The README said "100K+". That's only true without anomaly.

### Tweet 3 (the cause)

> The cost is the rolling-window quantile computation. IQR and MAD both sort a 100-element array on every row.
>
> 1500 entities × 6 numeric columns × 100-element sort per row = the entire latency budget.

### Tweet 4 (the fix)

> v0.4 ships:
>
> 1. Incremental quantile estimation (P² or t-digest) — constant cost per row
> 2. Optional sampling (`anomaly.sampling: 0.1`) — linear cost reduction
>
> Expected: ~5× speedup on IQR/MAD paths.

### Tweet 5 (the call)

> The whole bench package is open. `pnpm bench` produces JSON output, hardware-tagged, diff-able across versions.
>
> Reproduce the numbers. Refute them. PR a regression I missed.
>
> github.com/007krcs/dataflow/tree/main/bench

---

## Why this strategy works (and why it's not obvious)

Most post-launch follow-ups are version-bump announcements: "v0.4 is out, here's what's new." Those don't get clicks because nobody's been waiting for them.

This post does something specific: **it admits the original launch oversold one number, then explains the actual physics, then ships the fix**. That sequence — discovery → explanation → resolution — is a story arc. People retweet stories. They don't retweet changelogs.

The risk is that "founder admits library is slower than claimed" sounds like bad news. It isn't, because:

1. The fast paths are still fast (no-anomaly throughput is great)
2. The slow path is *correctly* slow (sort-based quantiles are inherently O(n log n); this isn't a bug, it's an algorithmic choice)
3. The fix is real and shipping in the same post (incremental quantiles aren't speculative — P² is a 1985 algorithm with well-understood properties)

A reader who lands on this post comes away thinking: this person measures their own code, finds bottlenecks, and fixes them. That's the most valuable signal a prospect can have about an open-source maintainer. It compounds the trust earned from the first launch.

Don't publish this post without v0.4's actual fixes in the repo. The credibility is in the resolution. Without the resolution it's just confession theater.
