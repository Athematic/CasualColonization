import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const single = !!process.env.SINGLE_FILE;

export default defineConfig({
  // Relative asset paths so the build works from any folder on a web server.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    // The single-file build (SINGLE_FILE=1) inlines images too, so one HTML file holds everything.
    assetsInlineLimit: single ? 100_000_000 : 4096,
  },
  resolve: {
    // The single-file build has no files beside the page, so the engine worker is inlined there.
    alias: single ? [{ find: /^\.\/spawn\.js$/, replacement: fileURLToPath(new URL('./src/turns/spawn-inline.ts', import.meta.url)) }] : [],
  },
  worker: {
    // A classic worker script: loads everywhere workers do, also from an inlined blob.
    format: 'iife',
  },
});
