import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Array form with anchored regex — guarantees EXACT match, not prefix.
    // This avoids `@gridstorm/dataflow-canvas` shadowing `@gridstorm/dataflow-canvas/react`.
    alias: [
      {
        find:        /^@gridstorm\/dataflow-canvas\/react$/,
        replacement: resolve(__dirname, '../packages/canvas/src/integrations/react.tsx'),
      },
      {
        find:        /^@gridstorm\/dataflow-canvas$/,
        replacement: resolve(__dirname, '../packages/canvas/src/index.ts'),
      },
      {
        find:        /^@gridstorm\/dataflow-core$/,
        replacement: resolve(__dirname, '../packages/core/src/index.ts'),
      },
    ],
  },
  server: {
    port: 3400,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
