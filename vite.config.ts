import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// publicDir is enabled in dev (so the browser fetches images/sounds/spine
// from disk during HMR) but disabled at build time — every asset is inlined
// into dist/index.html via INLINED + the fetch interceptor, so copying the
// raw folder into dist/ would just bloat the deliverable.
export default defineConfig(({ command }) => ({
  base: './',
  publicDir: command === 'serve' ? 'assets_shawarma' : false,
  plugins: [viteSingleFile()],
  build: {
    sourcemap: false,
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    cssCodeSplit: false,
  },
}))
