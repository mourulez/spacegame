import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The asset viewer (viewer/), a separate app from the game: its own dev server
// and its own build, published under the game's site at /viewer/ but never in dist/.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const models = fileURLToPath(new URL('art/models', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('viewer', import.meta.url)),
  plugins: [
    {
      // The dev server only watches its root; watch art/models/ too, so a new or regenerated model shows up.
      name: 'watch-models',
      configureServer(server) {
        server.watcher.add(models);
      },
    },
  ],
  base: './',
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL('dist-viewer', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5174, // the game's dev server keeps 5173
    // The viewer imports from src/render/ and art/models/, outside its root.
    fs: { allow: [repoRoot] },
  },
  preview: { port: 4175 },
});
