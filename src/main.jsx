import React, { Component, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RouteLoadingFallback } from "./layouts/public/RouteLoadingFallback.jsx";
import { warnIfMojibake } from "./lib/mojibakeGuard.js";
import { logError, ERROR_CATEGORIES, ERROR_SEVERITY } from "./lib/monitoring/errorLog.js";

// BUG "Driver map page bianca": un dynamic import() fallito (es. Vite dev
// optimize-deps stale su react-leaflet/leaflet, o un blip di rete) lancia
// dentro il Suspense boundary di React.lazy — senza un error boundary che lo
// intercetti, React scarica l'intero albero e lascia <body> vuoto, senza
// nessun messaggio. Un solo error boundary qui, a monte di TUTTE le route
// (Driver/Cliente/pubbliche), sostituisce lo schermo bianco con un invito a
// ricaricare — non tenta un retry automatico silenzioso (rischierebbe un
// loop se la causa e' persistente), lascia il controllo all'utente.
class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
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
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, background: '#0b1220', color: 'rgba(255,255,255,.85)', fontFamily: "'DM Sans', Inter, system-ui, sans-serif", textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 15 }}>Impossibile caricare la pagina.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
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

// PERF-1: AppRouter (e tutto cio' che importa staticamente: PublicRoutes,
// l'intero configuratore Step1-4, ecc.) era un import statico qui, quindi
// veniva scaricato/valutato SEMPRE, anche per le route Driver/Cliente che
// non lo renderizzano mai (i loro branch sotto ritornano prima). Confermato
// via network trace reale su /driver/assignment/:id: la pagina Driver
// scaricava Step1.jsx..Step4.jsx, QuickQuotePage, ConsultantPage, ecc. — il
// bootstrap pubblico intero, mai usato da quella route. Reso lazy: nessun
// comportamento cambiato (stesso identico componente), solo il momento del
// download diventa condizionato al bisogno reale.
//
// TENTATIVO SCARTATO (stesso ticket): import statico di AppRouter per
// evitare il dynamic-import fragile — provato dal vivo e SUBITO revertito:
// con import statico, ES module semantics impone che TUTTO il grafo di
// dipendenze di AppRouter (framer-motion, volantinipro-final.jsx,
// Step1-4, ecc.) risolva PRIMA che qualunque riga di main.jsx esegua —
// quindi un 504 stale-deps su una qualunque di quelle dipendenze (verificato
// dal vivo: framer-motion) impediva il bootstrap anche delle route
// Driver/Cliente, che PRIMA non dipendevano affatto da AppRouter. Rotto
// esattamente cio' che il ticket vietava di toccare. Il lazy() attuale
// resta la scelta corretta: isola il grafo di dipendenze di AppRouter dalle
// route Driver/Cliente, e un suo fallimento resta contenuto dal
// RouteErrorBoundary (vedi sopra) invece di propagarsi a tutta l'app.
const AppRouter = lazy(() =>
  import("./app/AppRouter.jsx").then(m => ({ default: m.AppRouter }))
);

// BUNDLE-OPTIMIZE-1: queste 4 route (Cliente tracking diretto + tutte le
// route Driver) sono mutuamente esclusive per costruzione (un solo branch
// puo' corrispondere a window.location.pathname) e non fanno mai parte del
// bootstrap pubblico (homepage/configuratore cadono nel default <AppRouter/>
// piu' sotto). Renderle lazy le rimuove dal chunk iniziale senza cambiare
// alcun comportamento: il match sul path resta sincrono, solo il download
// del componente diventa asincrono.
const CampaignTracking = lazy(() =>
  import("./pages/customer/CampaignTracking.jsx").then(m => ({ default: m.CampaignTracking }))
);
const TrackingPage = lazy(() =>
  import("./pages/driver/TrackingPage.jsx").then(m => ({ default: m.TrackingPage }))
);
const DriverCoverageMap = lazy(() =>
  import("./pages/driver/DriverCoverageMap.jsx").then(m => ({ default: m.DriverCoverageMap }))
);
const DriverAssignmentPage = lazy(() =>
  import("./pages/driver/DriverAssignmentPage.jsx").then(m => ({ default: m.DriverAssignmentPage }))
);
const DriverWorkMapPage = lazy(() =>
  import("./pages/driver/DriverWorkMapPage.jsx").then(m => ({ default: m.DriverWorkMapPage }))
);

warnIfMojibake(document.documentElement?.innerHTML || "", "initial document");

function Root() {
  // path era window.location.pathname letto una sola volta (nessun
  // re-render possibile su cambio route): serviva per Driver Programma<->
  // Mappa, che ora naviga con history.pushState + 'popstate' invece di un
  // window.location.href (vedi src/pages/driver/driverNav.js) — senza
  // questo state/listener quel pushState non avrebbe mai fatto ri-renderizzare
  // Root con il nuovo componente. Nessun altro comportamento cambiato: ogni
  // altra route continua a essere raggiunta solo da una navigazione browser
  // reale (link esterni, digitazione URL), che gia' rimonta tutto da zero.
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const driverMatch = path.match(/^\/driver\/tracking\/([^/]+)$/);
  if (driverMatch) return <Suspense fallback={<RouteLoadingFallback />}><TrackingPage campaignId={driverMatch[1]} /></Suspense>;

  const driverMapMatch = path.match(/^\/driver\/tracking\/([^/]+)\/map$/);
  if (driverMapMatch) return <Suspense fallback={<RouteLoadingFallback />}><DriverCoverageMap campaignId={driverMapMatch[1]} /></Suspense>;

  // ADMIN-DRIVER-LINK-2: link personale driver via assignment_id (no driver_id nell'URL)
  const driverAssignmentMapMatch = path.match(/^\/driver\/assignment\/([^/]+)\/map$/);
  if (driverAssignmentMapMatch) return <Suspense fallback={<RouteLoadingFallback />}><DriverWorkMapPage assignmentId={driverAssignmentMapMatch[1]} /></Suspense>;

  const driverAssignmentMatch = path.match(/^\/driver\/assignment\/([^/]+)$/);
  if (driverAssignmentMatch) return <Suspense fallback={<RouteLoadingFallback />}><DriverAssignmentPage assignmentId={driverAssignmentMatch[1]} /></Suspense>;

  const customerMatch = path.match(/^\/customer\/campaigns\/([^/]+)\/tracking$/);
  if (customerMatch) return <Suspense fallback={<RouteLoadingFallback />}><CampaignTracking campaignId={customerMatch[1]} /></Suspense>;

  return <Suspense fallback={<RouteLoadingFallback />}><AppRouter /></Suspense>;
}

createRoot(document.getElementById("root")).render(
  <RouteErrorBoundary>
    <Root />
  </RouteErrorBoundary>
);
