import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves from /<repo>/
  base: process.env.GHPAGES ? '/step/' : '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
