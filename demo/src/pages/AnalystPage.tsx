/**
 * AnalystPage — the no-code "DataFlow Analyst" workspace.
 *
 * Two data sources share one live grid:
 *   - File mode: dropzone → parser → engine.injectRows → onRows → grid
 *   - API mode:  configurator → real adapter → engine emits → onRows → grid
 *
 * One StreamingEngine is alive at a time. Switching modes (or reconnecting
 * with new adapter config) destroys the previous engine and constructs a
 * new one with the same callbacks. State buffers are cleared on switch.
 *
 * Wave 2: shell rebuilt on tekivex-ui primitives (TkxCard, TkxTabs, TkxButton,
 * TkxBadge, TkxAlert). FileDropzone and ApiConfigurator are unchanged in
 * this wave — Waves 3 and 4 refactor them internally.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StreamingEngine } from '@gridstorm/dataflow-core';
import type {
  StreamingEngine as StreamingEngineType,
  StreamRow,
  CellChange,
  StreamStatus,
  StreamMetrics,
  AdapterConfig,
  EngineCallbacks,
} from '@gridstorm/dataflow-core';
import {
  TkxButton,
  TkxBadge,
  TkxAlert,
  TkxCard,
  TkxCardHeader,
  TkxCardBody,
  TkxTabs,
  TkxTabList,
  TkxTab,
  TkxTabPanels,
  TkxTabPanel,
  TkxTable,
} from 'tekivex-ui';
import type { ColumnDef } from 'tekivex-ui';

import { storage } from '../analyst/storage.ts';
import { FileDropzone } from '../analyst/FileDropzone.tsx';
import { ApiConfigurator } from '../analyst/ApiConfigurator.tsx';
import { AIPromptPanel } from '../analyst/AIPromptPanel.tsx';

// ─── Source modes ────────────────────────────────────────────────────────────

type SourceMode = 'file' | 'api';
const MODE_INDICES: SourceMode[] = ['file', 'api'];

// No-op adapter for file mode (engine only hosts injectRows + delta calc)
const NO_OP_ADAPTER: AdapterConfig = {
  type:           'simulated',
  scenario:       'financial',
  entityCount:    1,
  tickIntervalMs: 999_999_999,
};

// ─── Page ────────────────────────────────────────────────────────────────────

export function AnalystPage() {
  const [sourceMode, setSourceMode] = useState<SourceMode>('file');
  const sourceIndex = MODE_INDICES.indexOf(sourceMode);

  const engineRef = useRef<StreamingEngineType | null>(null);

  const [rows,     setRows]     = useState<StreamRow[]>([]);
  const [changes,  setChanges]  = useState<CellChange[]>([]);
  const [status,   setStatus]   = useState<StreamStatus>('disconnected');
  const [metrics,  setMetrics]  = useState<StreamMetrics>(EMPTY_METRICS);
  const [apiError, setApiError] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // (Re)construct the engine with a specific adapter.
  const setupEngine = useCallback((adapter: AdapterConfig) => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    setRows([]);
    setChanges([]);
    setApiError(null);
    setMetrics(EMPTY_METRICS);

    const callbacks: EngineCallbacks = {
      onRows: (newRows, newChanges) => {
        setRows((prev) => {
          const next = [...prev, ...newRows];
          return next.length > 2000 ? next.slice(-2000) : next;
        });
        if (newChanges.length > 0) setChanges(newChanges);
      },
      onStatus: (s) => {
        setStatus(s);
        if (s === 'connected' || s === 'connecting') setApiError(null);
      },
      onMetrics: setMetrics,
    };

    const eng = new StreamingEngine(
      {
        adapter,
        backpressure: { maxBufferSize: 50_000, targetFps: 30 },
        anomaly:      { enabled: false },
      },
      callbacks,
    );
    eng.start();
    engineRef.current = eng;
  }, []);

  useEffect(() => {
    setupEngine(NO_OP_ADAPTER);
    return () => { engineRef.current?.destroy(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushRows = useCallback((newRows: StreamRow[]) => {
    if (newRows.length === 0 || !engineRef.current) return;
    engineRef.current.injectRows(newRows);
  }, []);

  const onTabChange = useCallback((idx: number) => {
    const next = MODE_INDICES[idx];
    if (!next || next === sourceMode) return;
    setSourceMode(next);
    setupEngine(NO_OP_ADAPTER);
  }, [sourceMode, setupEngine]);

  const handleApiConnect    = useCallback((adapter: AdapterConfig) => setupEngine(adapter), [setupEngine]);
  const handleApiDisconnect = useCallback(() => { setupEngine(NO_OP_ADAPTER); setStatus('disconnected'); }, [setupEngine]);

  const columns = useMemo(() => {
    const first = rows[0];
    if (!first) return [];
    return Object.keys(first).filter((k) => k !== 'id' && k !== 'timestamp');
  }, [rows]);

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            DataFlow Analyst
            <TkxBadge variant="success" size="sm">BETA</TkxBadge>
          </h1>
          <p className="page-sub">
            Upload a spreadsheet, paste a live API, ask an AI to explain it. No code.
            Everything stays in your browser.
          </p>
        </div>

        <div className="page-actions">
          <TkxButton
            variant="ghost"
            size="sm"
            leftIcon="⚙"
            onClick={() => setSettingsOpen((s) => !s)}
            title="Manage API keys and saved configs"
          >
            Settings
          </TkxButton>
        </div>
      </div>

      {/* ── Settings (collapsible) ───────────────────────────────────── */}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      {/* ── Source picker + content + preview ────────────────────────── */}
      <TkxTabs activeIndex={sourceIndex} onChange={onTabChange}>
        <TkxTabList className="analyst-tablist">
          <TkxTab index={0}>📄 Upload file</TkxTab>
          <TkxTab index={1}>🌐 Connect API</TkxTab>
        </TkxTabList>

        <div className="analyst-grid">
          <div className="analyst-source">
            <TkxTabPanels>
              <TkxTabPanel index={0}>
                <FileDropzone
                  onRows={(newRows) => {
                    setRows([]);
                    setChanges([]);
                    pushRows(newRows);
                  }}
                />
              </TkxTabPanel>
              <TkxTabPanel index={1}>
                <ApiConfigurator
                  status={status}
                  error={apiError}
                  onConnect={handleApiConnect}
                  onDisconnect={handleApiDisconnect}
                />
              </TkxTabPanel>
            </TkxTabPanels>
          </div>

          <div className="analyst-preview">
            <DataPreviewCard
              rows={rows}
              status={status}
              metrics={metrics}
              columns={columns}
              sourceMode={sourceMode}
            />
          </div>
        </div>
      </TkxTabs>

      {/* ── AI Analyst panel ─────────────────────────────────────────── */}
      <AIPromptPanel rows={rows} />

      <style>{ANALYST_STYLES}</style>
    </div>
  );
}

// ─── Data preview card ──────────────────────────────────────────────────────

interface DataPreviewProps {
  rows:       StreamRow[];
  status:     StreamStatus;
  metrics:    StreamMetrics;
  columns:    string[];
  sourceMode: SourceMode;
}

function DataPreviewCard({ rows, status, metrics, columns, sourceMode }: DataPreviewProps) {
  const stats = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <TkxBadge variant="default" size="sm">{rows.length.toLocaleString('en-US')} rows</TkxBadge>
      {sourceMode === 'api' && (
        <TkxBadge variant={status === 'connected' ? 'success' : status === 'error' ? 'danger' : 'warning'} size="sm">
          {status}
        </TkxBadge>
      )}
      {metrics.rowsPerSecond > 0 && (
        <TkxBadge variant="info" size="sm">
          {metrics.rowsPerSecond.toLocaleString('en-US')} rows/sec
        </TkxBadge>
      )}
    </div>
  );

  // Build TkxTable column defs from the inferred schema
  const tableColumns = useMemo<ColumnDef<StreamRow>[]>(
    () => columns.map((col) => ({
      key:      col as keyof StreamRow,
      header:   col,
      sortable: true,
      render:   (value) => formatCell(value),
    })),
    [columns],
  );

  // Show the last 20 rows so the live preview doesn't fight throughput
  const visibleRows = useMemo(() => rows.slice(-20), [rows]);

  return (
    <TkxCard variant="elevated" padding="none" style={{ minHeight: 320 }}>
      <TkxCardHeader title="Live data" action={stats} />
      <TkxCardBody>
        {rows.length === 0 ? (
          <div style={{ padding: '36px 8px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13.5 }}>
            {sourceMode === 'file'
              ? 'No data yet — drop a file on the left to begin.'
              : 'No data yet — connect to an API on the left to begin.'}
          </div>
        ) : (
          <>
            <TkxTable<StreamRow>
              columns={tableColumns}
              data={visibleRows}
              stickyHeader
              striped
              compact
              maxHeight={360}
            />
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
              Showing the last {visibleRows.length} of {rows.length.toLocaleString('en-US')} rows.
            </div>
          </>
        )}
      </TkxCardBody>
    </TkxCard>
  );
}

// ─── Settings panel ─────────────────────────────────────────────────────────

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const handleClearAll = () => {
    if (typeof window === 'undefined') return;
    const ok = window.confirm(
      'This deletes your saved API config, LLM endpoint + key, and saved prompts from this browser. Continue?',
    );
    if (!ok) return;
    storage.clearAll();
    onClose();
  };

  return (
    <TkxCard variant="outlined" padding="md">
      <TkxAlert
        variant="info"
        title="Everything stays in your browser"
      >
        Your API config, LLM endpoint, and API keys live in this browser&apos;s
        <code style={{ margin: '0 4px', fontSize: '0.95em' }}>localStorage</code>.
        DataFlow never sees them. API requests go directly from your browser to
        the endpoints you configure.
      </TkxAlert>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <TkxButton variant="solid" colorScheme="danger" size="sm" onClick={handleClearAll}>
          Clear all local data
        </TkxButton>
        <TkxButton variant="ghost" size="sm" onClick={onClose}>
          Close
        </TkxButton>
      </div>
    </TkxCard>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMPTY_METRICS: StreamMetrics = {
  totalRows:         0,
  rowsPerSecond:     0,
  droppedRows:       0,
  anomalyCount:      0,
  latencyMs:         0,
  bufferUtilization: 0,
  uptime:            0,
};

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}

// ─── Page-local styles — only what's NOT yet replaced by Tkx primitives ──────

const ANALYST_STYLES = `
.analyst-tablist { margin-bottom: 4px; }
.analyst-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 1024px) {
  .analyst-grid { grid-template-columns: minmax(360px, 460px) 1fr; }
}
.analyst-source, .analyst-preview { min-width: 0; }
`;
