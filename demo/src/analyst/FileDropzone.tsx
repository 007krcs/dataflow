/**
 * FileDropzone — drag-drop Excel / CSV / ODS / PDF, parse client-side,
 * hand parsed rows to the parent via `onRows`.
 *
 * Wave 3: drop target + size/type validation now provided by `TkxFileUpload`.
 * This module owns the parsing, the multi-sheet picker, the schema chip strip,
 * and PDF caveats — everything that's not generic file-input UI.
 *
 * Errors are surfaced inline via `TkxAlert` so they share the Wave 2 design
 * language. Multi-sheet Excel: if the parser comes back with >1 sheet, render
 * a dropdown that re-parses without re-opening the file picker.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TkxFileUpload, TkxAlert, TkxBadge } from 'tekivex-ui';
import type { StreamRow } from '@gridstorm/dataflow-core';
import { parseExcelFile, type ExcelParseResult } from './parsers/excel.ts';
import { parsePdfFile,   type PdfParseResult }   from './parsers/pdf.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

type FileKind = 'excel' | 'pdf';

interface LoadedFile { file: File; kind: FileKind; }

interface SuccessSummary {
  fileName:    string;
  rowCount:    number;
  // Excel-only:
  sheetNames?: string[];
  activeSheet?: string;
  headers?:    string[];
  // PDF-only:
  pageCount?:  number;
  lineCount?:  number;
}

export interface FileDropzoneProps {
  onRows: (rows: StreamRow[], summary: SuccessSummary) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

/** Combined accept string for TkxFileUpload — same set as before. */
const ACCEPT_STRING =
  '.xlsx,.xls,.csv,.ods,.pdf,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-excel,' +
  'text/csv,' +
  'application/vnd.oasis.opendocument.spreadsheet,' +
  'application/pdf';

const MAX_BYTES = 50 * 1024 * 1024;  // 50 MB

export function FileDropzone({ onRows }: FileDropzoneProps) {
  const [loaded,   setLoaded]   = useState<LoadedFile | null>(null);
  const [status,   setStatus]   = useState<'idle' | 'parsing' | 'ok' | 'error'>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const [summary,  setSummary]  = useState<SuccessSummary | null>(null);

  // Race-safety: a fast second drop can't clobber the first parse's result
  const parseTokenRef = useRef(0);

  const doParse = useCallback(async (file: File, kind: FileKind, sheetName?: string) => {
    const token = ++parseTokenRef.current;
    setStatus('parsing');
    setError(null);
    setSummary(null);

    let result: ExcelParseResult | PdfParseResult;
    if (kind === 'excel') {
      result = await parseExcelFile(file, sheetName ? { sheetName } : {});
    } else {
      result = await parsePdfFile(file);
    }
    if (token !== parseTokenRef.current) return; // newer parse took over

    if (!result.ok) {
      setStatus('error');
      setError(result.error);
      return;
    }

    const s: SuccessSummary = kind === 'excel'
      ? {
          fileName:    (result as Extract<ExcelParseResult, { ok: true }>).fileName,
          rowCount:    result.rows.length,
          sheetNames:  (result as Extract<ExcelParseResult, { ok: true }>).sheetNames,
          activeSheet: (result as Extract<ExcelParseResult, { ok: true }>).activeSheet,
          headers:     (result as Extract<ExcelParseResult, { ok: true }>).headers,
        }
      : {
          fileName:    (result as Extract<PdfParseResult, { ok: true }>).fileName,
          rowCount:    result.rows.length,
          pageCount:   (result as Extract<PdfParseResult, { ok: true }>).pageCount,
          lineCount:   (result as Extract<PdfParseResult, { ok: true }>).lineCount,
        };

    setStatus('ok');
    setSummary(s);
    onRows(result.rows, s);
  }, [onRows]);

  // TkxFileUpload calls onChange with the file array
  const handleChange = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    const kind: FileKind = lower.endsWith('.pdf') ? 'pdf' : 'excel';
    setLoaded({ file, kind });
    void doParse(file, kind);
  }, [doParse]);

  // TkxFileUpload calls onError for type/size rejections
  const handleError = useCallback((err: string) => {
    setStatus('error');
    setError(err);
  }, []);

  // Sheet-switching for multi-sheet workbooks
  const onSheetChange = useCallback((sheetName: string) => {
    if (!loaded || loaded.kind !== 'excel') return;
    void doParse(loaded.file, 'excel', sheetName);
  }, [doParse, loaded]);

  // Defensive — invalidate in-flight parses on unmount
  useEffect(() => () => { parseTokenRef.current++; }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TkxFileUpload
        variant="dropzone"
        dragDrop
        accept={ACCEPT_STRING}
        maxSize={MAX_BYTES}
        multiple={false}
        onChange={handleChange}
        onError={handleError}
        label="Drop a file or click to choose"
        hint=".xlsx, .xls, .csv, .ods, .pdf — max 50 MB — parsed locally, never uploaded"
      />

      {/* Status */}
      {status === 'parsing' && (
        <TkxAlert variant="info" title="Parsing…">
          <code style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{loaded?.file.name}</code>
        </TkxAlert>
      )}

      {status === 'error' && error && (
        <TkxAlert variant="danger" title="Could not load the file">
          {error}
        </TkxAlert>
      )}

      {status === 'ok' && summary && (
        <TkxAlert
          variant="success"
          title={`Loaded ${summary.rowCount.toLocaleString('en-US')} rows`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5 }}>
              from <code style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{summary.fileName}</code>
              {summary.pageCount != null && (
                <> &middot; {summary.pageCount} page{summary.pageCount === 1 ? '' : 's'}</>
              )}
            </div>

            {summary.sheetNames && summary.sheetNames.length > 1 && (
              <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Sheet:
                <select
                  value={summary.activeSheet ?? ''}
                  onChange={(e) => onSheetChange(e.target.value)}
                  style={{
                    fontFamily: 'inherit', fontSize: 12,
                    padding: '4px 8px',
                    background: 'var(--bg-2)', color: 'var(--text)',
                    border: '1px solid var(--border)', borderRadius: 4,
                  }}
                >
                  {summary.sheetNames.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}

            {summary.headers && summary.headers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {summary.headers.slice(0, 10).map((h) => (
                  <TkxBadge key={h} variant="primary" size="sm">{h}</TkxBadge>
                ))}
                {summary.headers.length > 10 && (
                  <TkxBadge variant="default" size="sm">+{summary.headers.length - 10} more</TkxBadge>
                )}
              </div>
            )}

            {summary.pageCount != null && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
                PDF extraction returns one row per text line. For real tables, save as Excel/CSV for cleaner results.
              </div>
            )}
          </div>
        </TkxAlert>
      )}
    </div>
  );
}
