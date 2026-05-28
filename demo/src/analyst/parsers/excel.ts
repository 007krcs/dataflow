/**
 * Excel / CSV / ODS parser.
 *
 * Built on SheetJS — handles every spreadsheet format the user is realistically
 * going to drop on us with one API.
 *
 * Returns either { ok: true, rows, ... } or { ok: false, error } — never
 * throws to the UI. The dropzone displays the error string inline.
 *
 * Each output row is a DataFlow-compatible StreamRow:
 *   - `id`         sequential `row-N`
 *   - `timestamp`  parse-time epoch ms (every row in one file shares the same)
 *   - other keys   match the column headers from row 1 of the sheet
 *
 * Multi-sheet workbooks: caller can pass `sheetName` to pick a sheet;
 * the parser exposes the full sheet list in the success result so the
 * UI can offer a dropdown.
 */

import * as XLSX from 'xlsx';
import type { StreamRow, CellValue } from '@gridstorm/dataflow-core';

export interface ExcelParseSuccess {
  ok:           true;
  rows:         StreamRow[];
  /** All sheet names found in the workbook (for the UI's sheet picker). */
  sheetNames:   string[];
  /** Which sheet's rows we actually parsed. */
  activeSheet:  string;
  /** Header row pulled from row 1. */
  headers:      string[];
  /** Best-effort source file name (caller passes it in). */
  fileName:     string;
}

export interface ExcelParseFailure {
  ok:       false;
  error:    string;
  /** If we got far enough to read sheet names, return them so the UI can show
   *  "this workbook has 3 sheets — pick one". */
  sheetNames?: string[];
  fileName: string;
}

export type ExcelParseResult = ExcelParseSuccess | ExcelParseFailure;

export interface ParseExcelOptions {
  /** Name of the sheet to parse. If omitted, the first sheet is used. */
  sheetName?: string;
  /** Maximum rows to emit. Higher = more memory. Default: 50_000. */
  maxRows?: number;
}

const DEFAULT_MAX_ROWS = 50_000;

export async function parseExcelFile(
  file:     File,
  options:  ParseExcelOptions = {},
): Promise<ExcelParseResult> {
  const fileName = file.name || 'spreadsheet';
  const maxRows  = options.maxRows ?? DEFAULT_MAX_ROWS;

  // ── Read ──────────────────────────────────────────────────────────────────
  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook     = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch (err) {
    return {
      ok: false,
      fileName,
      error: 'Could not read this file. Make sure it is a real Excel / CSV / ODS file (not a renamed .txt or .json).',
    };
  }

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    return { ok: false, fileName, error: 'This workbook has no sheets.' };
  }

  const activeSheet = options.sheetName && sheetNames.includes(options.sheetName)
    ? options.sheetName
    : sheetNames[0]!;
  const sheet = workbook.Sheets[activeSheet];
  if (!sheet) {
    return { ok: false, fileName, sheetNames, error: `Sheet "${activeSheet}" not found.` };
  }

  // ── Convert ───────────────────────────────────────────────────────────────
  // `header: 1` returns an array-of-arrays: row 0 is the header row, rest are data.
  let aoa: unknown[][];
  try {
    aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header:   1,
      blankrows: false,
      raw:      false,   // formatted strings — dates render as ISO, numbers as numbers
      defval:   null,
    });
  } catch {
    return { ok: false, fileName, sheetNames, error: 'Failed to convert the sheet rows.' };
  }

  if (aoa.length === 0) {
    return { ok: false, fileName, sheetNames, error: `Sheet "${activeSheet}" is empty.` };
  }

  const headerRow  = aoa[0]!;
  const dataRows   = aoa.slice(1, 1 + maxRows);

  // Normalize headers: trim, dedupe by suffixing _N, fall back to "col1".."colN"
  const headers = normalizeHeaders(headerRow);

  // ── Build StreamRows ──────────────────────────────────────────────────────
  const ts = Date.now();
  const rows: StreamRow[] = new Array(dataRows.length);
  for (let i = 0; i < dataRows.length; i++) {
    const raw = dataRows[i]!;
    const row: StreamRow = { id: `row-${i + 1}`, timestamp: ts };
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c]!;
      const v   = raw[c];
      row[key]  = toCellValue(v);
    }
    rows[i] = row;
  }

  return { ok: true, rows, sheetNames, activeSheet, headers, fileName };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let base = String(raw[i] ?? '').trim();
    if (base === '') base = `col${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    out.push(count === 0 ? base : `${base}_${count + 1}`);
  }
  return out;
}

/** Coerce SheetJS output to DataFlow's CellValue type. */
function toCellValue(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  // Anything else (objects, arrays) — stringify for display rather than drop
  try { return JSON.stringify(v); } catch { return String(v); }
}
