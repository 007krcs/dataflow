import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Allow demo to import core source directly (no build step needed)
      '@dataflow/core': path.resolve(__dirname, '../packages/core/src/index.ts'),
    },
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
