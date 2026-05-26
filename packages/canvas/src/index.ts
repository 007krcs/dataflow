// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
/**
 * @gridstorm/dataflow-canvas — public entry.
 *
 * Headless Canvas-2D streaming grid renderer for DataFlow.
 * For a React wrapper, import from `@gridstorm/dataflow-canvas/react`.
 */

// Renderer
export { CanvasGridRenderer } from './renderer/CanvasGridRenderer.js';

// Theme defaults
export { DEFAULT_THEME } from './types.js';

// Public types
export type {
  CanvasGridColumn,
  CanvasGridConfig,
  CanvasGridHit,
  CanvasGridTheme,
  CanvasGridUpdate,
  CanvasGridViewport,
  ColumnAlign,
  ICanvasGridRenderer,
} from './types.js';
