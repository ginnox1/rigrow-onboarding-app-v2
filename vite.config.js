import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  root: 'onboarding',
  build: { outDir: '../dist/onboarding', emptyOutDir: true },
  server: { host: true, fs: { allow: ['..'] } },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Rigrow Onboarding',
        short_name: 'Rigrow',
        theme_color: '#2e7d32',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/'
      }
    })
  ]
})
