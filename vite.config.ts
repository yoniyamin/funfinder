/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787'
    }
  },
  test: {
    environment: 'jsdom'
  },
  // Point to the new v2 entry point
  build: {
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  }
});