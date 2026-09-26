/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

const base = process.env.GITHUB_PAGES === 'true' ? '/Coffee-Inc-3/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon-32.png', 'icons/apple-touch-icon.png', 'privacy.html', 'terms.html'],
      manifest: {
        name: 'Coffee Inc 3',
        short_name: 'Coffee Inc 3',
        description: 'Run a coffee shop and grow it into a coffee company.',
        lang: 'en',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4ede3',
        theme_color: '#4a2f22',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['splash/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/privacy\.html$/, /terms\.html$/],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(version) },
  worker: { format: 'es' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
