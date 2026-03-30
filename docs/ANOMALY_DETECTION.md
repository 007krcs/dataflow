# Anomaly Detection in DataFlow

DataFlow includes a statistical anomaly detector that runs entirely in the browser — no ML model, no API calls, no GPU. It uses three well-established algorithms, each suited to different data distributions.

---

## Table of Contents

1. [How It Works](#how-it-works)
2. [Z-Score Method](#z-score-method)
3. [IQR Method (Tukey Fences)](#iqr-method-tukey-fences)
4. [MAD Method (Median Absolute Deviation)](#mad-method)
5. [Configuration Reference](#configuration-reference)
6. [AnomalyEvent Shape](#anomalyevent-shape)
7. [Severity Levels](#severity-levels)
8. [Choosing the Right Method](#choosing-the-right-method)
9. [Tuning Guide](#tuning-guide)
10. [How the Rolling Window Works](#how-the-rolling-window-works)

---

## How It Works

For every numeric column in every row, the detector:

1. **Pushes the value** into a rolling window (circular buffer) of `windowSize` observations
2. **Waits** until `minSamples` observations have been collected
3. **Computes statistics** from the window: mean, stddev, median, MAD, Q1, Q3, IQR
4. **Runs each enabled method** against the new value
5. **Emits** an `AnomalyEvent` if any method flags the value

```
New value → rolling window → statistics → [zscore?] [iqr?] [mad?] → AnomalyEvent[]
```

The window is **per-column**, **per-stream**. 20 sensors × 5 columns = 100 independent windows.

---

## Z-Score Method

**Formula:** `z = |x - μ| / σ`

Flags a value if it is more than `zScoreThreshold` standard deviations from the rolling mean.

```
z = (current_value - rolling_mean) / rolling_stddev
if |z| > threshold → anomaly
```

**Example:** Temperature sensor, mean=22.5°C, stddev=1.2°C, threshold=2.5
- Value 25.8°C → z = (25.8 - 22.5) / 1.2 = **2.75** → 🔴 FLAGGED
- Value 23.9°C → z = (23.9 - 22.5) / 1.2 = **1.17** → ✅ normal

**Config:**
```ts
anomaly: {
  methods:         ['zscore'],
  zScoreThreshold: 2.5,   // lower = more sensitive, higher = fewer false positives
}
```

**Best for:** Data that follows a roughly normal (bell-curve) distribution — temperature, humidity, financial returns over short windows.

**Weakness:** Sensitive to the mean being "pulled" by previous anomalies (outlier contamination). Use MAD if your data has heavy tails.

---

## IQR Method (Tukey Fences)

**Formula:**
```
Q1 = 25th percentile of rolling window
Q3 = 75th percentile of rolling window
IQR = Q3 - Q1

lower fence = Q1 - (multiplier × IQR)
upper fence = Q3 + (multiplier × IQR)

if value < lower fence OR value > upper fence → anomaly
```

**Example:** CO₂ readings, window Q1=430, Q3=580, IQR=150, multiplier=1.5
- Lower fence = 430 - (1.5 × 150) = **205**
- Upper fence = 580 + (1.5 × 150) = **805**
- Value 850 ppm → above upper fence → 🔴 FLAGGED
- Value 520 ppm → within fences → ✅ normal

**Config:**
```ts
anomaly: {
  methods:       ['iqr'],
  iqrMultiplier: 1.5,  // Tukey's standard. Use 3.0 for "far outliers" only
}
```

**Best for:** Skewed distributions, financial data, sensor readings that don't follow a bell curve. More robust than Z-score because it uses percentiles instead of mean/stddev.

**Note:** IQR requires sorting the window on every tick (O(n log n)). For large windows (> 500), consider using `windowSize: 200` or switching to Z-score for performance.

---

## MAD Method

**Formula:**
```
median = median of rolling window
deviations = |xi - median| for each xi in window
MAD = median(deviations)

consistency_constant = 1.4826   (makes MAD equivalent to stddev for normal data)
modified_z = |x - median| / (1.4826 × MAD)

if modified_z > threshold → anomaly
```

**Example:** Stock prices with several past spikes in the window:
- Even if a few previous prices were extreme outliers, the median and MAD are unaffected
- Z-score would have a contaminated mean; MAD stays robust

**Config:**
```ts
anomaly: {
  methods: ['mad'],
  zScoreThreshold: 2.5,  // reuses zScoreThreshold for the MAD score cutoff
}
```

**Best for:** Data with heavy tails or occasional outliers that would distort the mean — financial data with flash crashes, sensor data with known spikes.

**Why 1.4826?** This constant makes MAD a consistent estimator of standard deviation for normally distributed data, so the threshold is directly comparable to Z-score.

---

## Configuration Reference

```ts
anomaly: {
  // Master switch
  enabled: true,                    // Default: true

  // Which algorithms to run (can combine multiple)
  methods: ['zscore', 'iqr'],       // Default: ['zscore', 'iqr']
  //        'zscore' | 'iqr' | 'mad' | 'threshold'

  // Z-score threshold (used by both zscore and mad methods)
  zScoreThreshold: 2.5,             // Default: 2.5
  // Rule of thumb:
  //   2.0 → sensitive (more events, more false positives)
  //   2.5 → balanced (default)
  //   3.0 → conservative (fewer events, misses subtle anomalies)

  // IQR fence multiplier
  iqrMultiplier: 1.5,               // Default: 1.5
  // Tukey's standard multipliers:
  //   1.5 → "mild outlier" fence
  //   3.0 → "extreme outlier" fence

  // Rolling window size (observations per column)
  windowSize: 100,                  // Default: 100
  // How many recent values to use for statistics.
  // Smaller = adapts faster, larger = more stable statistics.

  // Minimum observations before detection starts
  minSamples: 20,                   // Default: 20
  // Prevents false positives on startup when statistics are unstable.
  // Rule of thumb: at least 15–30 samples.

  // Columns to monitor (empty = all numeric columns)
  columns: ['temperature', 'co2'],  // Default: [] (all)

  // Severity thresholds (z-score scale)
  severityThresholds: {
    warning:  2.5,                  // Default: 2.5
    critical: 4.0,                  // Default: 4.0
  },
  // Z-score:
  //   ≥ warning  → 'warning'
  //   ≥ critical → 'critical'
  //   < warning  → 'info'
}
```

---

## AnomalyEvent Shape

```ts
interface AnomalyEvent {
  id:          string;          // Unique event ID (e.g. "anom-42-1711234567")
  rowId:       string;          // Which row triggered it
  columnId:    string;          // Which column (e.g. "temperature")
  value:       number;          // The anomalous value
  stats:       AnomalyStats;    // Snapshot of window statistics at time of detection
  severity:    'info' | 'warning' | 'critical';
  method:      'zscore' | 'iqr' | 'mad' | 'threshold';
  zScore:      number | null;   // Z-score value (for zscore/mad methods)
  iqrDeviation: number | null;  // How far outside the fence (for iqr method)
  timestamp:   number;          // Unix ms
  message:     string;          // Human-readable (e.g. "temperature = 38.2 is 3.4σ from mean 22.5")
}

interface AnomalyStats {
  mean:        number;
  stddev:      number;
  median:      number;
  mad:         number;
  q1:          number;
  q3:          number;
  iqr:         number;
  min:         number;
  max:         number;
  sampleCount: number;
}
```

---

## Severity Levels

| Level | Z-score equivalent | Meaning | UI suggestion |
|-------|--------------------|---------|---------------|
| `info` | < 2.5 | Mild deviation | Blue dot |
| `warning` | 2.5 – 4.0 | Notable outlier | Amber dot, log to console |
| `critical` | ≥ 4.0 | Extreme outlier | Red dot, alert notification |

---

## Choosing the Right Method

| Data type | Recommended | Reason |
|-----------|-------------|--------|
| Normal distribution | `zscore` | Simple, efficient, well-understood |
| Skewed (log-normal, financial) | `iqr` or `mad` | Robust to asymmetry |
| Heavy tails (crash events, sensor failures) | `mad` | Median is resistant to contamination |
| Maximum coverage | `['zscore', 'iqr']` | Complementary: one catches what the other misses |
| Real-time trading | `['zscore', 'mad']` | MAD handles flash crashes without Z-score contamination |
| IoT sensors | `['iqr', 'mad']` | Both robust; sensors have skewed noise profiles |

---

## Tuning Guide

### Too many false positives?

```ts
anomaly: {
  zScoreThreshold: 3.0,      // raise from 2.5 → 3.0
  iqrMultiplier:   3.0,      // raise from 1.5 → 3.0 (extreme outliers only)
  minSamples:      30,       // wait longer for stable statistics
  windowSize:      200,      // larger window → more stable mean/median
}
```

### Missing real anomalies?

```ts
anomaly: {
  zScoreThreshold: 2.0,      // lower threshold
  methods:         ['zscore', 'iqr', 'mad'],  // use all three
  windowSize:      50,       // smaller window → adapts faster to concept drift
}
```

### Only care about specific columns?

```ts
anomaly: {
  columns: ['temperature', 'co2', 'pressure'],  // ignore volume, uptime, etc.
}
```

### Dealing with concept drift (e.g. market regime changes)?

Use a smaller `windowSize` (30–50) so statistics adapt quickly:
```ts
anomaly: {
  windowSize: 30,    // 30 recent observations define "normal"
  minSamples: 15,
}
```

### Warming up without false positives?

```ts
anomaly: {
  minSamples: 50,   // wait for 50 observations before first detection
}
```

---

## How the Rolling Window Works

DataFlow uses a **circular buffer** (ring buffer) for each column's window. This gives O(1) push and O(1) eviction with no garbage collection pressure.

```
windowSize = 5 (simplified example)
Initial: [_, _, _, _, _]  count=0

Push 22.1: [22.1, _, _, _, _]         count=1
Push 22.4: [22.1, 22.4, _, _, _]      count=2
Push 21.8: [22.1, 22.4, 21.8, _, _]   count=3
...
Push 23.1: [22.1, 22.4, 21.8, 22.9, 23.1]  count=5, FULL

Push 38.2: [38.2, 22.4, 21.8, 22.9, 23.1]  ← oldest (22.1) evicted
           ↑ head wraps around
```

**Statistics computation:**
- Mean and stddev are maintained incrementally with running `sum` and `sumSq` — O(1) per push
- Median, Q1, Q3, MAD require sorting a snapshot of the window — O(n log n) per tick, only when a detection method needs it

For production streams with >200 columns or >1000 entity rows, use `columns: ['col1', 'col2']` to limit which columns are monitored.
