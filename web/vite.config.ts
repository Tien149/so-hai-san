import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Sổ Hải Sản',
        short_name: 'Sổ Hải Sản',
        description: 'Quản lý bán hàng, nhập hàng, kho, công nợ và lời lỗ cho quán hải sản',
        lang: 'vi',
        theme_color: '#0d6e6a',
        background_color: '#eef3f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallback: '/index.html', maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
    }),
  ],
  test: { environment: 'node' },
} as never)
