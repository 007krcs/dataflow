// © 2025 GridStorm / Tekivex — All Rights Reserved
// Unauthorized reproduction or distribution is prohibited.
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/integrations/react.tsx',
  },
  format:    ['esm', 'cjs'],
  dts:       true,
  clean:     true,
  splitting: false,
  sourcemap: false,
  treeshake: true,
  target:    'es2022',
  external:  ['react', 'react-dom', '@gridstorm/dataflow-core'],
});
