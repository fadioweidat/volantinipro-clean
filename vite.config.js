import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('/node_modules/framer-motion/')) {
            return 'vendor-motion';
          }
          if (id.includes('/node_modules/leaflet/') || id.includes('/node_modules/react-leaflet/')) {
            return 'vendor-leaflet';
          }
          if (id.includes('/node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
        },
      },
    },
  },
})
