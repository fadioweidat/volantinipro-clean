import React, { Component } from "react";
import { RouteLoadingFallback } from "../layouts/public/RouteLoadingFallback.jsx";
import { logError, ERROR_CATEGORIES, ERROR_SEVERITY } from "../lib/monitoring/errorLog.js";
import { hasAlreadyRetried, markRetried, clearRetryFlag, isChunkLoadError } from "./chunkRetry.js";

// Stesso guard gia' usato in src/supabaseClient.js/platformHealth.js:
// import.meta.env e' sempre un oggetto reale sotto Vite, ma e' undefined
// (o assente del tutto) quando questo modulo viene caricato da node:test
// puro (nessun Vite) — necessario per poter testare RouteErrorBoundary in
// isolamento senza far esplodere componentDidCatch.
let IS_DEV_BUILD = false;
try {
  IS_DEV_BUILD = Boolean(import.meta.env?.DEV);
} catch {
  IS_DEV_BUILD = false;
}

// BUG "Driver map page bianca": un dynamic import() fallito (es. Vite dev
// optimize-deps stale su react-leaflet/leaflet, o un blip di rete) lancia
// dentro il Suspense boundary di React.lazy — senza un error boundary che lo
// intercetti, React scarica l'intero albero e lascia <body> vuoto, senza
// nessun messaggio. Un solo error boundary qui, a monte di TUTTE le route
// (Driver/Cliente/pubbliche), sostituisce lo schermo bianco con un invito a
// ricaricare.
//
// BUG "pagina bianca da WhatsApp/Chrome Android" (Fase C/D): per un errore
// di chunk/dynamic import riconosciuto (vedi isChunkLoadError) il primo
// verificarsi per questo pathname in questa sessione di navigazione fa
// scattare UN SOLO reload automatico — la causa piu' comune (504/stale
// cache/blip di rete al primo colpo) si risolve gia' cosi', senza che il
// Driver debba capire nulla. Se fallisce ANCHE dopo il reload (flag gia'
// presente in sessionStorage), niente secondo reload automatico — nessun
// loop possibile per costruzione: mostra la schermata di errore esistente
// con "Ricarica" manuale, lasciando il controllo all'utente.
export class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, autoReloading: false };
  }
  static getDerivedStateFromError(error) {
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const chunkError = isChunkLoadError(error);
    const autoReloading = chunkError && typeof window !== "undefined" && !hasAlreadyRetried(pathname);
    return { hasError: true, autoReloading };
  }
  componentDidCatch(error, info) {
    if (IS_DEV_BUILD) {
      // Diagnostico temporaneo (bug "Driver direct link fallisce a volte al
      // primo carico"): error.message/stack sono la causa reale dietro il
      // fallback generico "Impossibile caricare la pagina" — mai l'access
      // token (che non transita mai per questo path, ne' per errori di
      // rendering ne' per import falliti: e' letto solo da window.location.
      // search dentro gli hook Driver, mai incluso in un throw/stack).
      console.error('[RouteErrorBoundary] error.message:', error?.message);
      console.error('[RouteErrorBoundary] error.stack:', error?.stack);
      console.error('[RouteErrorBoundary] componentStack:', info?.componentStack);
    } else {
      console.error('[RouteErrorBoundary] route crash', error?.message);
    }
    // Centro Controllo Sito (Admin): questo e' l'unico error boundary a
    // monte di TUTTE le route, quindi il posto giusto per registrare un
    // crash frontend reale — nessun errore simulato, solo cio' che React ha
    // davvero intercettato.
    logError({
      category: ERROR_CATEGORIES.FRONTEND,
      module: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
      message: error?.message || "Errore frontend sconosciuto",
      severity: ERROR_SEVERITY.CRITICAL,
    });
    if (this.state.autoReloading && typeof window !== "undefined") {
      markRetried(window.location.pathname);
      window.location.reload();
    }
  }
  render() {
    if (this.state.hasError) {
      if (this.state.autoReloading) {
        // Reload gia' avviato in componentDidCatch: nessun messaggio di
        // errore da mostrare, solo un breve stato di caricamento nel
        // brevissimo istante prima che la navigazione avvenga davvero.
        return <RouteLoadingFallback />;
      }
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, background: '#0b1220', color: 'rgba(255,255,255,.85)', fontFamily: "'DM Sans', Inter, system-ui, sans-serif", textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 15 }}>Impossibile caricare la pagina.</p>
          <button
            type="button"
            onClick={() => {
              // Pulisce il flag di retry: se l'utente forza un altro
              // tentativo manuale e stavolta il problema e' risolto, una
              // futura sessione su questo stesso pathname riparte con un
              // retry automatico "fresco" invece di restare marcata come
              // "gia' ritentato" per sempre in questa tab.
              if (typeof window !== "undefined") clearRetryFlag(window.location.pathname);
              window.location.reload();
            }}
            style={{ minHeight: 48, padding: '0 24px', borderRadius: 12, border: 'none', background: '#2ECC8A', color: '#071426', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
          >
            Ricarica
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
