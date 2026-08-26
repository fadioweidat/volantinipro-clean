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
      // Tunnel HTTPS temporaneo (ngrok) per testare la Geolocation API su
      // telefono reale: richiede un secure context che http://<IP LAN> non
      // e'. Wildcard sul dominio ngrok free (sottodominio casuale ad ogni
      // riavvio del tunnel), non un singolo host fisso.
      allowedHosts: ['.ngrok-free.dev', '.ngrok.io', '.ngrok.app'],
    },
    // react-leaflet/leaflet sono usati solo da pagine admin dietro
    // React.lazy() + AdminGuard (AdminLiveDashboard, GpsMonitor,
    // CampaignGroups/Operations/Report): lo scanner iniziale di Vite non
    // le attraversa, quindi la dipendenza veniva scoperta solo alla prima
    // navigazione reale, forzando un re-optimize a runtime che invalida gli
    // hash gia' serviti (react.js ecc.) -> "504 Outdated Optimize Dep" e
    // pagina bianca su /admin/live. Includerle esplicitamente le pre-bundla
    // all'avvio, in un unico hash stabile.
    //
    // framer-motion: stesso identico problema, confermato dal vivo (504 su
    // framer-motion durante il caricamento del chunk lazy AppRouter, non
    // scoperto dallo scanner iniziale perche' AppRouter stesso e' lazy —
    // vedi src/main.jsx). Usato diffusamente da tutto il sito pubblico
    // dentro quel chunk (home/*, configuratore Step1/Step3/Step4,
    // ServiceCenter, AI hub), mai da import npm ulteriori come
    // 'framer-motion/dom': un solo entry basta, nessun subpath necessario.
    //
    // Verificate e SCARTATE (non usate lato client, solo in script Node di
    // import dati sotto data/ e scripts/, mai raggiunte dal browser):
    // proj4, shapefile, xlsx, adm-zip.
    optimizeDeps: {
      include: ['react-leaflet', 'leaflet', 'framer-motion'],
    },
    // Centro Controllo Sito (Admin, Blocco 1 "ultimo deploy/versione"):
    // Vercel imposta automaticamente VERCEL_GIT_COMMIT_SHA come env var del
    // processo di build (non un .env file, quindi loadEnv() non lo vede) —
    // lo leggiamo qui da process.env e lo inseriamo nel bundle come
    // stringa statica. Vuoto in sviluppo locale (nessun commit finto).
    define: {
      __COMMIT_SHA__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || ''),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  }
})
