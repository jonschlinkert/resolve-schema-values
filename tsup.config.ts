import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  entry: {
    index: 'src/index.ts',
    merge: 'src/merge.ts',
    resolve: 'src/resolve.ts'
  },
  cjsInterop: true,
  format: ['cjs', 'esm'],
  keepNames: true,
  minify: false,
  shims: true,
  splitting: false,
  sourcemap: true,
  target: 'node18'
});
