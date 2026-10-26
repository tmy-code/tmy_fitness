/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: 'src/client',
  publicDir: 'public',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TMY Fitness',
        short_name: 'Fitness',
        description: 'Carnet d’entraînement pour la Méthode Lafay 2A',
        lang: 'fr',
        theme_color: '#1f2937',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // The app shell is cached by the service worker; the Méthode and the Carnet are cached in IndexedDB by the app.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Exercice pictures are cached here instead, so they show offline. Their address changes on each upload.
        runtimeCaching: [
          {
            urlPattern: /\/api\/images\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-exercices',
              expiration: { maxEntries: 400 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // Only API calls, not source files such as /api.ts.
      '^/api/': `http://localhost:${process.env.API_PORT ?? 3000}`,
    },
  },
  test: {
    root: '.',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
