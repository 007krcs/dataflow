# DataFlow v0.3.3 launch runbook

Three artifacts, in the order you'll execute them:

1. **Manual browser smoke test** — 5 minutes, before you publish anything.
2. **Publish + tag sequence** — exact commands.
3. **GitHub release notes** — paste-ready body for the `v0.3.3` tag.

A sibling artifact, [`LAUNCH_COPY.md`](./LAUNCH_COPY.md), holds the Show HN post + Reddit + Twitter copy. A second sibling, [`HERO_VIDEO_SCRIPT.md`](./HERO_VIDEO_SCRIPT.md), holds the 30-second demo loop production plan. This runbook is the engineering-ops side of launch day.

---

## 1. Manual browser smoke test (5 minutes)

Goal: confirm the Analyst workspace works end-to-end on real hardware before any of it gets npm-published or shown to the world.

### Setup

In **terminal A**:

```bash
cd examples/node-ws-server
npm install                       # only needed the first time
PORT=8090 node server.mjs
# Expect: "default scen: financial · entities: 20 · tick: every 400 ms"
```

In **terminal B** (project root):

```bash
pnpm --filter @gridstorm/dataflow-demo dev
# Expect: "Local: http://localhost:3400/"
```

Open `http://localhost:3400`. You should land on the **🧠 Analyst** page (it's the default).

### Walkthrough — pass/fail at each step

| # | Action | Pass | Fail signals |
|---|---|---|---|
| 1 | Page loads in **light theme** | Page background is warm off-white, cards are pure white, accent is indigo | Black background → bridge didn't apply; check console for `useTheme` errors |
| 2 | Click the **🌙** moon icon top-right | Smooth ~200ms transition to dark mode. Cards become dark slate. Icon becomes a sun. | No transition → CSS not loaded; instant flicker → bridge token leak |
| 3 | Click the moon/sun icon again | Returns to light. Theme persists if you reload (`Cmd/Ctrl+R`) | Theme resets → localStorage write failed |
| 4 | Click **📄 Upload file** tab | TkxFileUpload dropzone visible, "Drop a file or click to choose" | Empty card → import-analysis error in console |
| 5 | Drop an `.xlsx` or `.csv` (or click and pick one) | Within ~1s: green `TkxAlert` "Loaded N rows" + schema-chip strip with first 10 column names + the **Live data** card on the right fills with a `TkxTable` of the last 20 rows | Red alert → check the error text; it's from `parseExcelFile`. Spinning forever → SheetJS module didn't resolve |
| 6 | Click **🌐 Connect API** tab | Top-of-card shows three inner tabs: `WebSocket / SSE / HTTP poll`. URL + Auth fields below. | Tabs not switching → check `TkxTabs activeIndex` controlled state |
| 7 | URL: `ws://localhost:8090?scenario=financial` → click **▶ Connect** | Status badge flips to `Connecting` (yellow, pulsing) → `Connected` (green). Live data table fills with rows; "rows/sec" badge appears in the card header. | Stays `Disconnected` → WS server not running; check terminal A. `Error` red → adapter rejected the URL or auth |
| 8 | Click **⏹ Disconnect** | Status returns to `Disconnected`, no new rows arrive. | Button does nothing → engine wiring broken |
| 9 | Scroll down to **🤖 Ask the data** card. Click **Provider** to expand config | Form appears: Provider/Model/Key/Endpoint/System prompt/Include data toggle. | Form invisible → `configOpen` wasn't initialised to true on fresh install (it should be, since no stored config) |
| 10 | Pick `OpenAI`, paste a real OpenAI key, model `gpt-4o-mini`, leave endpoint blank, prompt unchanged, **Include data: ON** | "API key required" badge disappears, **Save and start chat** button becomes active | Button stays disabled → `canSave` logic wrong |
| 11 | Click **Save and start chat** | Config drawer collapses. TkxChat appears with empty conversation. Header subtitle shows `openai · gpt-4o-mini · N rows in context`. | Drawer doesn't collapse → `setConfigOpen(false)` not firing |
| 12 | Type *"What's the highest and lowest price symbol in this data?"* and hit Enter | Within ~2s: streaming response bubble appears, tokens stream in, finishes with a coherent answer that references actual symbols (AAPL, GOOGL, etc.) | Network error → check the Network tab in DevTools; 401 → wrong key; CORS error → endpoint doesn't allow browser origin |
| 13 | Click **⏹ Stop** mid-stream on a follow-up question | Stream halts immediately, partial response stays in chat | Doesn't stop → `useAgent.stop()` not wired |
| 14 | Click **Clear conversation** | Chat resets to empty, header subtitle still shows your provider | Doesn't clear → `reset()` not wired |
| 15 | Reload the page | Provider config persisted, lands you straight in chat (no config drawer). Theme persisted. | Either gets re-prompted → localStorage write failed |

### Other pages — quick visual check

Navigate through the existing demo pages and confirm they still look correct in both themes:

- **📈 Stocks** — table flashes green/red on price ticks. Stress Test button still works. Inject Anomaly button still catches anomalies.
- **🎨 Canvas** — toggle DOM ↔ Canvas on Heavy preset. FPS counter visible.
- **🌡 IoT / ₿ Crypto / 🛒 Commerce** — no console errors.

If anything visually broke that wasn't broken before, it's the theme bridge swapping colours that downstream components hardcoded. Search for the specific colour in the affected file.

### If everything passes

You're cleared to publish. Move to Section 2.

### If something fails

Fix before publishing. The repo is at v0.3.3 in package.json but **nothing is on npm yet** for the canvas package, and the other four packages on npm at v0.3.2 still have the broken Quick Starts. Publishing v0.3.3 is what aligns the registry. Don't half-ship.

---

## 2. Publish + tag sequence (10 minutes including token rotation)

### 2a. Revoke the leaked token first (30 seconds)

In a browser, go to:

```
https://www.npmjs.com/settings/<your-username>/tokens
```

Find the token that starts with `npm_QRz…` (the one shared in chat earlier). Click **Revoke**.

### 2b. Generate a fresh granular token (60 seconds)

Same page → **Generate New Token** → **Granular Access Token**:

| Field | Value |
|---|---|
| Name | `dataflow-publish-2026-05` |
| Expiration | **7 days** |
| Permissions | Read and write |
| Packages and scopes | `@gridstorm/*` only |

Copy the new token somewhere temporarily — you'll use it for `npm login`, then you won't need it again.

### 2c. Authenticate locally (30 seconds)

```bash
npm login --scope=@gridstorm --auth-type=web
# A browser opens. Log in. Confirm.

npm whoami
# Expected: your-npm-username
```

If `auth-type=web` doesn't work on your machine, fall back to a `~/.npmrc` with `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` and `export NPM_TOKEN=…` — **but do not put the token inside the file directly**.

### 2d. Fresh build (1 minute)

```bash
pnpm install
pnpm build
# Expect: 5x "Build success" from tsup + 5x obfuscation pass
```

If `pnpm build` fails, do NOT publish. Fix and rebuild.

### 2e. Dry-run the publish (30 seconds)

```bash
pnpm --filter "@gridstorm/dataflow-*" publish --access public --no-git-checks --dry-run
```

Read the output carefully. For each of the 5 packages confirm:

- `version: 0.3.3`
- `total files: 7` for core/react/vue/svelte, `13` for canvas
- Tarball contains only `LICENSE`, `README.md`, `package.json`, `dist/*` — **no `src/`, no `.env`, no source maps**
- `bench`, `demo`, `e2e` are SKIPPED (they're `"private": true`)

### 2f. Real publish (1 minute)

```bash
pnpm --filter "@gridstorm/dataflow-*" publish --access public --no-git-checks
```

Five `+` lines, one per package. If any fails — usually 403 on first publish of `@gridstorm/dataflow-canvas` because the package didn't exist before — re-run that one alone:

```bash
cd packages/canvas
pnpm publish --access public --no-git-checks
cd ../..
```

### 2g. Verify (30 seconds)

```bash
for p in core react vue svelte canvas; do
  echo -n "@gridstorm/dataflow-$p: "
  npm view @gridstorm/dataflow-$p version
done
```

Expected output:

```
@gridstorm/dataflow-core: 0.3.3
@gridstorm/dataflow-react: 0.3.3
@gridstorm/dataflow-vue: 0.3.3
@gridstorm/dataflow-svelte: 0.3.3
@gridstorm/dataflow-canvas: 0.3.3
```

### 2h. Tag + push (30 seconds)

```bash
git tag v0.3.3
git push origin v0.3.3
```

### 2i. Render build-command fix (30 seconds)

Open Render dashboard for the `dataflow.tekivex.com` service. **Settings → Build & Deploy → Build Command**.

Change:

```
pnpm install && pnpm --filter './packages/**' build && pnpm --filter @dataflow/demo build
```

To:

```
pnpm install --frozen-lockfile && pnpm --filter './packages/**' build && pnpm --filter @gridstorm/dataflow-demo build
```

Save → Manual Deploy → wait for green → open `dataflow.tekivex.com` → confirm `/analyst` loads.

---

## 3. GitHub release notes for `v0.3.3`

After the tag is pushed, create the release on GitHub:

```bash
gh release create v0.3.3 \
  --repo 007krcs/dataflow \
  --title "v0.3.3 — No-code Analyst, theme system, marketing alignment" \
  --notes-file - <<'EOF'
## Highlights

This release is the npm-registry-aligned launch version of DataFlow. Every Quick
Start on the published packages now shows the **real** API, the marketing
positioning matches what the engine actually does, and the demo ships an
end-to-end **no-code Analyst** workspace built on
[`tekivex-ui`](https://www.npmjs.com/package/tekivex-ui).

### New: no-code Analyst workspace

`dataflow.tekivex.com/analyst` (the new default landing page) lets
non-developers:

- **Upload Excel / CSV / ODS / PDF** files. Parsed in the browser via SheetJS
  and pdf.js. Multi-sheet workbooks get a sheet picker. PDF text extraction is
  best-effort with an explicit caveat in the UI.
- **Connect to a live API.** No-code form for WebSocket, SSE, or HTTP polling.
  URL + bearer-token auth + per-adapter fields. Builds a DataFlow
  `AdapterConfig` behind the scenes and starts a real `StreamingEngine`.
- **Ask an AI about the data.** Bring-your-own provider (OpenAI, Anthropic,
  Gemini, Ollama). Endpoint + API key + model + system prompt are entered in
  the panel and persisted in localStorage. Optionally injects the latest
  50-row snapshot into the system prompt for context-grounded answers.

Privacy: everything stays in the user's browser. API keys live in
`localStorage`. Requests go directly from the browser to the user-configured
endpoints. DataFlow's own servers see none of it.

### New: theme system

Light + dark themes via `tekivex-ui`'s `ThemeProvider` + `auroraLight` /
`quantumDark` token sets. Sun/moon toggle in the topbar, persisted in
localStorage, cross-tab sync. **Default is light** — fix for the "too dark"
feedback.

### New: `@gridstorm/dataflow-canvas` published at 0.3.3 for the first time

The alpha Canvas-2D streaming grid renderer is now on npm. Layer cache, rAF
dirty-rect scheduler, cell-flash animations. ~5 KB gzipped core, ~6 KB React
adapter. Demo at `/canvas` lets you flip DOM ↔ Canvas mid-stream on a
1500-sensor load to feel the difference.

### Fixed: broken Quick Starts on all 4 published packages

The Quick Starts on `@gridstorm/dataflow-core`, `-react`, `-vue`, and `-svelte`
v0.3.2 showed a fictional `createStream({ adapter: new
WebSocketAdapter(url), batchSize, fps })` API. The real export is
`StreamingEngine(config, callbacks)` with adapter config objects. v0.3.3
ships the corrected Quick Starts on every package README.

### Fixed: silent build breakage from the rename

Root `package.json` scripts referenced the old `@dataflow/*` filter pattern
post-rename to `@gridstorm/dataflow-*`. Build was silently broken. Fixed.

### Fixed: bundle-size claim

README claimed `~12KB` total bundle size — that was the react adapter alone.
Real numbers:

| Package | Gzipped |
|---|---:|
| `@gridstorm/dataflow-core` | 79 KB |
| `@gridstorm/dataflow-react` | 12 KB |
| `@gridstorm/dataflow-vue` | 5 KB |
| `@gridstorm/dataflow-svelte` | 4 KB |
| `@gridstorm/dataflow-canvas` | 5 KB |

### New: runnable benchmarks

```bash
pnpm --filter @gridstorm/dataflow-bench bench --reporter json,markdown
```

Three working suites (engine throughput, anomaly throughput, bundle size) plus
a stub for canvas FPS. JSON output is structured for diffing across versions.

### New: Node WebSocket reference server

`examples/node-ws-server/` — ~250 LOC standalone Node server that emits
DataFlow-compatible rows in financial / IoT / ecommerce scenarios. The fastest
way to try the WS adapter against a real socket:

```bash
cd examples/node-ws-server && npm install && npm start
# In your client: useStream({ adapter: { type: 'websocket', url: 'ws://localhost:8080?scenario=financial' } })
```

## Public API change (additive only)

- `@gridstorm/dataflow-core` now exports the `AdapterConfig` union type
  (`WebSocketAdapterConfig | SSEAdapterConfig | HTTPPollingAdapterConfig |
  SimulatedAdapterConfig | WebTransportAdapterConfig`). It was already
  implicitly public as the type of `StreamConfig.adapter`; the export makes it
  nameable for consumers building dynamic adapter selectors.

## Honest performance numbers

From the new `bench/` package, measured on a 13th-gen Intel i3 laptop with
Node 24:

| Configuration | rows/sec |
|---|---:|
| Engine, no anomaly, 100 entities × 6 cols | ~24,000 |
| Engine, no anomaly, 5,000 entities × 6 cols | ~26,000 |
| Engine + z-score + IQR, 100 entities | ~1,500 |
| Engine + z-score + IQR, 1,000 entities | ~1,200 |
| Anomaly detector (z-score only, 1 column) | ~21,000 |
| Anomaly detector (z-score + IQR + MAD) | ~24,000 |

The headline: the engine itself isn't the bottleneck — sort-based quantile
computation in IQR/MAD is. v0.4 will ship an incremental-quantile estimator
(P² / t-digest) to fix this.

## Roadmap snapshot

Shipped:
- ✅ Vue 3 + Svelte 5 adapters (since 0.3.x)
- ✅ Time-travel record + replay
- ✅ Multi-stream SQL-style join
- ✅ Schema auto-inference
- ✅ Sustained-anomaly detection (run-length + burst)
- ✅ Canvas-2D renderer (alpha)
- ✅ No-code Analyst workspace (demo)

Next (v0.4):
- ⏳ WebGL backend for canvas renderer
- ⏳ Incremental quantile estimator (P² / t-digest) — fixes the 15× anomaly slowdown
- ⏳ IndexedDB sink for replay buffers
- ⏳ Multivariate anomaly detection
- ⏳ gRPC-Web adapter
- ⏳ Grafana-compatible metrics export

## Install

```bash
npm install @gridstorm/dataflow-core @gridstorm/dataflow-react
```

Other framework adapters:
- `@gridstorm/dataflow-vue` for Vue 3
- `@gridstorm/dataflow-svelte` for Svelte 5
- `@gridstorm/dataflow-canvas` for the headless Canvas-2D grid

## Demo

`dataflow.tekivex.com` — try the Analyst workspace; toggle DOM ↔ Canvas on the
heavy preset; hit Stress Test + Inject Anomaly on the Stocks page.

## License

MIT.

---

**Full Changelog**: https://github.com/007krcs/dataflow/compare/v0.3.2...v0.3.3
EOF
```

---

## Launch-day timing recap

Once the runbook above is executed (3a → 2 → 3 here):

| Time (Pacific) | Action | Source |
|---|---|---|
| Day-of, 08:00 | Final smoke test on `dataflow.tekivex.com` | [LAUNCH_COPY.md §1](./LAUNCH_COPY.md) |
| Day-of, 08:30 | Submit Show HN — title A, URL = demo, not GitHub | [LAUNCH_COPY.md §1](./LAUNCH_COPY.md) |
| 08:32 | Post the "where to start" first comment immediately | [LAUNCH_COPY.md §1](./LAUNCH_COPY.md) |
| 08:30–12:30 | Reply to every HN comment | use the 6 canned objection responses |
| 09:00 | @tekivex tweet thread (pre-scheduled) | [LAUNCH_COPY.md §3](./LAUNCH_COPY.md) |
| 14:30 | r/javascript post (Angle A) | [LAUNCH_COPY.md §2](./LAUNCH_COPY.md) |
| Day +1, 10:00 | r/reactjs post (Angle B) | [LAUNCH_COPY.md §2](./LAUNCH_COPY.md) |
| Day +2, 09:00 | r/algotrading post (Angle C) | [LAUNCH_COPY.md §2](./LAUNCH_COPY.md) |
| ~Day +14 | v0.4 + benchmarks post | [BENCHMARKS_POST.md](./BENCHMARKS_POST.md) |

Good luck.
