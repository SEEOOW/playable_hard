import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  publicDir: 'assets_shawarma',
  build: {
    sourcemap: true,
    target: 'es2020',
  },
})
