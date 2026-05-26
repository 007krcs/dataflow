// Shared types for the bench harness.
// Every suite returns one of these; every reporter consumes one of these.

export type SuiteId =
  | 'engine-throughput'
  | 'anomaly-throughput'
  | 'bundle-size'
  | 'canvas-render';

export interface BenchEnv {
  node:     string;        // process.version
  os:       string;        // "darwin 23.6 arm64"
  cpu:      string;        // "Apple M2 Pro" (best-effort)
  memoryGb: number;        // os.totalmem
  ts:       string;        // ISO timestamp
  package:  { name: string; version: string };
}

/** One measured data point. */
export interface BenchSample {
  label:    string;                       // human-readable row label
  unit:     'rows/sec' | 'ms' | 'KB' | 'fps' | 'count';
  value:    number;
  /** Optional secondary observation, e.g. p95 latency. */
  detail?:  Record<string, number | string>;
}

export interface SuiteResult {
  id:       SuiteId;
  title:    string;
  /** Markdown column headers, in order, used by the markdown reporter. */
  columns:  string[];
  /** Each sample becomes one row; the harness fills `columns` from `detail`. */
  samples:  BenchSample[];
  durationMs: number;
  /** Free-form notes shown under the table — methodology, known caveats. */
  notes?:   string;
}

export interface BenchReport {
  env:      BenchEnv;
  suites:   SuiteResult[];
  totalMs:  number;
}

export interface Reporter {
  /** Called once after all suites finish. */
  finalize(report: BenchReport): Promise<void> | void;
}
