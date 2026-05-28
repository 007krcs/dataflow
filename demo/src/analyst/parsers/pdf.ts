/**
 * PDF text extractor.
 *
 * IMPORTANT scope note (surface this in the UI):
 *   PDF table extraction is genuinely hard — PDFs store text as positioned
 *   strings with no row/column metadata. For tabular data, dropping an Excel
 *   or CSV always wins.
 *
 * What this parser does today:
 *   - Loads pdf.js dynamically (so a user who never opens a PDF doesn't pay
 *     the ~1 MB bundle cost up front)
 *   - Extracts text per page, splits by Y coordinate into "lines"
 *   - Returns one StreamRow per line: { page, line, text }
 *
 * What this parser DOES NOT do today (acknowledged limitation):
 *   - Multi-column layout detection
 *   - Header / footer stripping
 *   - OCR for scanned PDFs (image-based PDFs return empty rows)
 *   - Table cell reconstruction
 *
 * pdf.js worker: pulled from the unpkg CDN at the same major/minor version
 * as the bundled package. Cuts dev bundle size; for a fully offline build
 * we'd serve the worker from our own /static/.
 */

import type { StreamRow } from '@gridstorm/dataflow-core';

// pdf.js types are loose — we treat the dynamic import surface as `any` and
// trust the runtime shape (which is stable across 3.x/4.x).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLib: any = null;

async function loadPdfJs(): Promise<typeof pdfjsLib> {
  if (pdfjsLib) return pdfjsLib;
  // Dynamic import — only paid by users who actually drop a PDF
  const mod = await import('pdfjs-dist');
  // Configure worker — uses ?url import on the bundled worker file so Vite
  // emits a separate worker chunk. Falls back to CDN if that fails.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workerUrl = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    (mod as any).GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // CDN fallback if Vite can't resolve the worker
    const version = (mod as any).version ?? '4.7.76';
    (mod as any).GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  }
  pdfjsLib = mod;
  return pdfjsLib;
}

// ─── Public types ────────────────────────────────────────────────────────────

export interface PdfParseSuccess {
  ok:        true;
  rows:      StreamRow[];
  pageCount: number;
  fileName:  string;
  /** Lines we found. Useful to display "Extracted N lines from M pages". */
  lineCount: number;
}

export interface PdfParseFailure {
  ok:       false;
  error:    string;
  fileName: string;
}

export type PdfParseResult = PdfParseSuccess | PdfParseFailure;

export interface ParsePdfOptions {
  /** Stop parsing after N pages. Default: 50. */
  maxPages?:  number;
  /** Stop emitting after N lines. Default: 50_000. */
  maxLines?:  number;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

const DEFAULT_MAX_PAGES = 50;
const DEFAULT_MAX_LINES = 50_000;
/** PDF coordinates are in points; lines whose y-deltas fall within this
 *  threshold are considered the same visual line. 4pt ≈ 1.5 mm. */
const LINE_Y_TOLERANCE = 4;

export async function parsePdfFile(
  file:    File,
  options: ParsePdfOptions = {},
): Promise<PdfParseResult> {
  const fileName  = file.name || 'document.pdf';
  const maxPages  = options.maxPages ?? DEFAULT_MAX_PAGES;
  const maxLines  = options.maxLines ?? DEFAULT_MAX_LINES;

  let pdfjs;
  try {
    pdfjs = await loadPdfJs();
  } catch (err) {
    return {
      ok:    false,
      fileName,
      error: 'Could not load the PDF parser. Check your network — pdf.js loads dynamically.',
    };
  }

  let buf: ArrayBuffer;
  try { buf = await file.arrayBuffer(); }
  catch { return { ok: false, fileName, error: 'Could not read the file.' }; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;
  try {
    doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok:    false,
      fileName,
      error: `Could not open the PDF: ${msg}. If this is a scanned (image-only) PDF, run OCR first.`,
    };
  }

  const pageCount = Math.min(doc.numPages, maxPages);
  const rows:     StreamRow[] = [];
  const ts        = Date.now();
  let globalLine  = 0;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let page: any;
    let content: { items: { str: string; transform: number[] }[] };
    try {
      page    = await doc.getPage(pageNum);
      content = await page.getTextContent();
    } catch {
      continue;     // skip unreadable pages instead of failing the whole document
    }

    // Group items by Y coordinate. pdf.js gives `transform[5]` as the Y origin.
    const items = content.items.filter((i) => typeof i.str === 'string' && i.str.length > 0);
    if (items.length === 0) continue;

    // Bucket by rounded Y so items on the same visual row group together
    const lineMap = new Map<number, { y: number; xs: { x: number; s: string }[] }>();
    for (const it of items) {
      const y = Math.round((it.transform?.[5] ?? 0) / LINE_Y_TOLERANCE) * LINE_Y_TOLERANCE;
      const x = it.transform?.[4] ?? 0;
      let bucket = lineMap.get(y);
      if (!bucket) { bucket = { y, xs: [] }; lineMap.set(y, bucket); }
      bucket.xs.push({ x, s: it.str });
    }

    // PDFs render top-to-bottom but Y increases upward — sort descending
    const lines = Array.from(lineMap.values()).sort((a, b) => b.y - a.y);

    for (const line of lines) {
      if (rows.length >= maxLines) break;
      line.xs.sort((a, b) => a.x - b.x);
      const text = line.xs.map((it) => it.s).join(' ').replace(/\s+/g, ' ').trim();
      if (text.length === 0) continue;
      globalLine++;
      rows.push({
        id:        `p${pageNum}-l${globalLine}`,
        timestamp: ts,
        page:      pageNum,
        line:      globalLine,
        text,
      });
    }
    if (rows.length >= maxLines) break;
  }

  if (rows.length === 0) {
    return {
      ok:    false,
      fileName,
      error: 'No text extracted. This might be a scanned PDF (image-only). Run OCR first.',
    };
  }

  return { ok: true, rows, pageCount, lineCount: globalLine, fileName };
}
