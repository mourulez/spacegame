import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs: the same build works on GitHub Pages (/spacegame/),
  // inside a portal's iframe/zip, or from any subfolder.
  base: './',
  build: {
    // three.js alone is ~500 kB minified (~135 kB gzip); don't warn about it.
    chunkSizeWarningLimit: 1000,
  },
});
