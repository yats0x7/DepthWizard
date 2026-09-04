import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.DW_API ?? 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks(id) { if (id.includes('node_modules/three')) return 'three'; if (id.includes('@react-three')) return 'r3f'; if (id.includes('recharts')) return 'charts' } } },
  },
})
