import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// UgaMarket Operations Console (admin).
// Dev proxy forwards /api to the shared UgaMarket backend (same source of
// truth as the customer frontend). In production, VITE_API_URL (a PUBLIC,
// non-secret build-time variable) points at the backend API base; when unset
// the client falls back to same-origin '/api' behind the reverse proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Backend-served product/category images (GET /images/...) so admin
      // previews resolve in dev exactly like they do behind the production
      // reverse proxy that fronts the backend origin.
      '/images': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    // Threads pool: more reliable on Windows than the default forks pool.
    pool: 'threads',
    testTimeout: 15000,
  },
});
