import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { driverTestSessionPlugin } from './dev/driverTestSessionPlugin.js'

export default defineConfig(({ mode }) => {
  // '' come terzo argomento: carica anche le variabili SENZA prefisso VITE_
  // (es. SUPABASE_SERVICE_ROLE_KEY), che restano cosi' disponibili solo qui
  // (processo Node del dev server) e non vengono mai esposte al bundle
  // client tramite import.meta.env.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), driverTestSessionPlugin(env)],
    server: {
      host: '0.0.0.0',
    },
  }
})
