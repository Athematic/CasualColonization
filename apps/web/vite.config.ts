import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from GitHub Pages or any sub-folder.
  base: './',
  build: { outDir: 'dist', target: 'es2022' },
});
