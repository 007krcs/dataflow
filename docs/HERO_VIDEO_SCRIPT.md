# Hero video — 30-second demo script

The single highest-ROI marketing asset DataFlow can ship right now. This is the silent screen-record that goes on the landing page hero, every package README, the Show HN post, every social share.

**Goal:** in 30 seconds, prove the three things a buyer needs to believe to install the package:

1. **Throughput is real.** Thousands of rows/sec without melting the browser.
2. **Anomaly detection works live, on the wire.** Not a static screenshot — caught in real time.
3. **The integration is short.** A few lines of React, not a framework rewrite.

---

## Recording setup (do this once)

| Setting | Value |
|---|---|
| Resolution | **1920 × 1080** (records crisp on Twitter, YouTube, GitHub) |
| Frame rate | **60 fps** (the whole point is smooth flashing cells — 30 fps wastes the demo) |
| Audio | **None** (silent loop; people scroll past with sound off) |
| Browser | Chrome at 100% zoom, **incognito**, no extensions, no bookmark bar |
| Window | **1440 × 900** content area, centered. Hide tabs (`Cmd/Ctrl+Shift+F` fullscreen) |
| Recorder | macOS: Screen Studio · Windows: ScreenToGif or OBS · Cross: [Cap](https://cap.so) |
| Output | **MP4 (h.264)** AND **WebP loop** for the landing page hero |
| Length | **28–32 s** — do not exceed |

Pre-flight checklist:
- [ ] Demo running locally at `localhost:3400` (so there's no network jitter)
- [ ] Dark theme on the demo (the cell-flash green/red pops harder)
- [ ] System notifications + clock visibility off
- [ ] Mouse cursor enabled in recorder so clicks are visible
- [ ] Browser cache cleared so the metric counters start at 0

---

## The script — 6 beats, 30 seconds total

| Time | Beat | What's on screen | Mouse action |
|---|---|---|---|
| **0:00 – 0:03** | **Cold open: the table is already streaming.** Cells flashing green/red. `~50 rows/sec` in MetricBar. | Land on `/financial`. Don't show the nav — viewers should feel like the action started without them. | None — let them watch the cells flash for 3 full seconds |
| **0:03 – 0:08** | **Show the code.** Click the `</>` Code button. The drawer slides in. Camera reads: *"This entire dashboard — ~40 lines of React."* | Hold for ~5s so a reader can scan the snippet. | One click: `</>` button |
| **0:08 – 0:16** | **Throughput flex.** Close the code drawer, click `⚡ Stress Test`. Watch `rows/sec` climb to ~4 000. Cells become a controlled blur of color. Buffer utilization meter rises but doesn't peg. | Hold for the full 8 seconds — this beat sells the backpressure story. The point is *the UI does not stutter*. | Two clicks: `✕` then `⚡ Stress Test` |
| **0:16 – 0:22** | **Anomaly catch — live.** Click `🔬 Inject Anomaly`. The button flashes red `🔴 Injected AAPL!`. The view auto-switches to the Anomalies tab. The heatmap lights up; the panel shows the new event with its z-score. | Two clicks total: `Inject Anomaly` (auto-tabs) — pause, let the heatmap render | One click: `🔬 Inject Anomaly` |
| **0:22 – 0:28** | **Range / breadth.** Click `📈 Charts` tab — candlestick + time series render in real time. Then click `🌡 IoT` in top nav — sensors + temperature anomalies appear instantly. | Shows DataFlow isn't single-domain. | Two clicks: `Charts` tab → `IoT` nav |
| **0:28 – 0:30** | **End card.** Static overlay (added in post): logo + tagline + URL. | `DataFlow` · `Real-time streaming, anomaly-aware` · `dataflow.tekivex.com` | None |

---

## Storyboard (frame-by-frame)

```
[0s] ┌─────────────────────────────────────────────────────────┐
     │ Stock Market Feed · Live · 20 symbols · 400ms ticks   │
     │ ┌─MetricBar──────────────────────────────────────────┐ │
     │ │ 1,247 rows · 52/s · 0 dropped · 0.4% buf · 12s up │ │
     │ └────────────────────────────────────────────────────┘ │
     │ AAPL  $189.42 ▲   open 188.97  high 189.51  vol 1.2M │  ← cells flashing
     │ GOOGL $134.18 ▼   …                                   │
     │ MSFT  $410.55 ▲   …                                   │
     │ …                                                      │
     └────────────────────────────────────────────────────────┘

[3s] click </> Code  →  drawer slides in over the table
     ┌─Code panel ────────────────────────────────────────────┐
     │ This entire dashboard — ~40 lines of React            │
     │ import { useStream } from '@gridstorm/dataflow-react' │
     │ const { rows, metrics, anomalies } = useStream({ … }) │
     └────────────────────────────────────────────────────────┘

[8s] click ✕ then ⚡ Stress Test  →  banner "⚡ STRESS MODE"
     rows/sec climbs:  52 → 800 → 2,100 → 3,800 → 4,000+
     cells become a controlled color blur, UI stays at 60fps

[16s] click 🔬 Inject Anomaly  →  button flashes red
      auto-switch to Anomalies tab
      ┌─Heatmap ────────┐ ┌─Anomaly Panel ─────────────────┐
      │ AAPL ████████   │ │ ⚠ AAPL price = 1894.20         │
      │ NVDA   ██       │ │   z = 12.3σ from μ=187.4 (σ=2.1)│
      │ …                │ │   2026-05-26 14:32:08          │
      └─────────────────┘ └────────────────────────────────┘

[22s] click 📈 Charts  →  candlestick + line chart render
[25s] click 🌡 IoT     →  sensor table + temp anomalies live

[28s] [overlay end card]
      ┌────────────────────────────────────────┐
      │                                        │
      │      ◆ DataFlow                        │
      │      Real-time streaming, anomaly-aware│
      │      dataflow.tekivex.com              │
      │                                        │
      └────────────────────────────────────────┘
```

---

## Post-production

**Edit:**
1. Trim dead time at head/tail to land at exactly 28–30 s.
2. Add a 1 s ease-in fade from black.
3. End card: 2 s static frame, hard cut to logo.
4. **No transitions between beats** — straight cuts only. The whole point is "this is happening right now, live."

**Captions (overlay, top-left, mono font, 18 px):**

| Time | Caption |
|---|---|
| 0:00 | `52 rows/sec` |
| 0:03 | `~40 lines of React` |
| 0:08 | `Stress test → 4,000 rows/sec` |
| 0:16 | `Live anomaly caught — 12.3σ` |
| 0:22 | `Charts. IoT. Same engine.` |

Keep captions visible for 2 s, fade out over 300 ms. Don't stack captions over the MetricBar — top-left only.

**Music:** none. Silent loops outperform on autoplay (Twitter, GitHub, dev.to all mute by default).

---

## Export matrix

| Where it goes | Format | Size target |
|---|---|---|
| Landing page hero (`dataflow.tekivex.com`) | WebP loop, autoplay, muted | < 2 MB |
| GitHub READMEs (root + 4 packages) | MP4, h.264 | < 5 MB so GitHub embeds it inline |
| Twitter / X | MP4, 1080 × 1080 **square crop** | < 15 MB, < 2:20 |
| LinkedIn | MP4, 1080 × 1080 | < 200 MB (LI is generous) |
| Show HN / dev.to | YouTube unlisted link + GIF fallback | n/a |
| Product Hunt | Same MP4 as Twitter | < 50 MB |

**Square crop tip:** for Twitter/PH, re-export with the chart area centered, MetricBar shrunk to the top. The square format gets 3× the engagement of 16:9 on mobile feeds.

---

## When to re-record

- After every Stress Mode performance improvement
- When the anomaly UI changes
- When a new flagship scenario lands (e.g., when WebGL renderer ships, do a *50 K rows/sec* version)
- Never just because the version number bumped

---

## Distribution checklist (day-of)

- [ ] Upload MP4 to `demo/public/hero.mp4` and `demo/public/hero.webm`
- [ ] Embed in landing page hero (`<video autoplay muted loop playsinline>`)
- [ ] Add `<video>` block to root `README.md` (GitHub renders it)
- [ ] Add same block to all 4 package READMEs
- [ ] Upload YouTube unlisted, get short URL
- [ ] Schedule tweet from `@tekivex` for Tuesday 9 AM PT
- [ ] Pin tweet
- [ ] Post to r/javascript, r/reactjs (different framings — see marketing analysis §6)
- [ ] Add to GitHub profile pinned repo
- [ ] Send to JavaScript Weekly, Bytes, React Newsletter, ThisWeekInReact

Total time to ship from "open recorder" to "tweet sent": **2 hours**. This is the single best 2 hours you can spend on marketing this quarter.
