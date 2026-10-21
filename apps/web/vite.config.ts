import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any folder on a web server.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    // The single-file build (SINGLE_FILE=1) inlines images too, so one HTML file holds everything.
    assetsInlineLimit: process.env.SINGLE_FILE ? 100_000_000 : 4096,
  },
});
