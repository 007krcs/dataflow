// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
import { defineConfig } from 'tsup';

export default defineConfig({
  entry:    ['src/index.ts'],
  format:   ['esm', 'cjs'],
  dts:      true,
  clean:    true,
  splitting: false,
  sourcemap: false,
  external: ['react', 'react-dom', '@gridstorm/dataflow-core'],
  target:   'es2022',
});
