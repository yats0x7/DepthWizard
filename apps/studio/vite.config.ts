import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('@react-three') || id.includes('postprocessing')) return 'three'
          if (id.includes('node_modules/geotiff')) return 'geotiff'
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) return 'charts'
          if (id.includes('node_modules/react')) return 'react'
          return undefined
        },
      },
    },
  },
})
