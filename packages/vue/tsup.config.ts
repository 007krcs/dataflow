import { defineConfig } from 'tsup';

export default defineConfig({
  entry:    ['src/index.ts'],
  format:   ['esm', 'cjs'],
  dts:      true,
  clean:    true,
  splitting: false,
  sourcemap: true,
  external: ['vue', '@gridstorm/dataflow-core'],
  target:   'es2022',
});
