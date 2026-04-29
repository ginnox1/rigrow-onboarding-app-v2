import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { createRequire } from 'module'
const { version } = createRequire(import.meta.url)('./package.json')

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  root: 'onboarding',
  envDir: '..',
  build: { outDir: '../dist/onboarding', emptyOutDir: true },
  server: { host: true, fs: { allow: ['..'] } },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw-custom.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}']
      },
      manifest: {
        name: 'Rigrow Onboarding',
        short_name: 'Rigrow',
        theme_color: '#2e7d32',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [{ name: 'file', accept: ['application/octet-stream', '.pmtiles'] }]
          }
        }
      }
    })
  ]
})
