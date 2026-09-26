import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT || '3000';

const port = Number(rawPort);

const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    // runtimeErrorOverlay(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'favicon.png'],
      manifest: {
        name: "CAPEF Enrôlement",
        short_name: "CAPEF",
        theme_color: "#00704a",
        background_color: "#fcfdfc",
        icons: [
          {
            src: 'logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/(regions|departments|arrondissements)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'capef-reference-data',
              expiration: {
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 jours
              },
            },
          },
          {
            urlPattern: /^\/api\/.*$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'capef-api-data',
              networkTimeoutSeconds: 5,
              expiration: {
                maxAgeSeconds: 60 * 60 * 24, // 24 heures
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      }
    }),
    visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: 'raw-data'
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@clerk')) {
              return 'vendor-clerk';
            }
            if (id.includes('zod') || id.includes('react-hook-form')) {
              return 'vendor-forms';
            }
            if (id.includes('dexie')) {
              return 'vendor-dexie';
            }
            if (id.includes('i18next')) {
              return 'vendor-i18n';
            }
            if (id.includes('date-fns')) {
              return 'vendor-date-fns';
            }
          }
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
