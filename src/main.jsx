import React, { Suspense, lazy, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { createRoot } from "react-dom/client";
import { RouteLoadingFallback } from "./layouts/public/RouteLoadingFallback.jsx";
import { RouteErrorBoundary } from "./bootstrap/RouteErrorBoundary.jsx";
import { clearRetryFlag } from "./bootstrap/chunkRetry.js";
import { warnIfMojibake } from "./lib/mojibakeGuard.js";
import { DriverDiagnosticsPanel } from "./components/driver/DriverDiagnosticsPanel.jsx";

// Segnale per il fallback statico in index.html (script inline, non-module):
// raggiungere questa riga prova che l'INTERO grafo di import statici di
// main.jsx si e' risolto con successo (in ES modules le import sono sempre
// risolte prima che qualunque codice top-level del modulo esegua) — e'
// esattamente il fallimento riprodotto dal vivo per questo bug (un import
// statico rotto -> "Failed to reload /src/main.jsx", 500, nessuna riga di
// questo file esegue mai, #root resta vuoto per sempre). Impostato il prima
// possibile, non dopo il render: anche se React impiegasse piu' tempo del
// previsto, il watchdog HTML non deve mostrare un falso "errore" mentre il
// modulo e' gia' stato caricato correttamente.
if (typeof window !== "undefined") window.__appBooted = true;

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
const DriverGroupJoinPage = lazy(() =>
  import("./pages/driver/DriverGroupJoinPage.jsx").then(m => ({ default: m.DriverGroupJoinPage }))
);
const DriverAssistantHost = lazy(() =>
  import("./components/ai/driver/DriverAssistantHost.jsx")
);

warnIfMojibake(document.documentElement?.innerHTML || "", "initial document");

const DRIVER_LAST_ROUTE_KEY = "vp_driver_last_route";
const DRIVER_ROUTE_RE = /^\/driver\/(?:assignment\/[^/]+(?:\/map)?|group\/[^/]+|tracking\/[^/]+(?:\/map)?)\/?$/;

function isNativeDriverApp() {
  if (typeof window === "undefined") return false;
  try {
    if (typeof Capacitor?.isNativePlatform === "function") return Capacitor.isNativePlatform();
    if (typeof Capacitor?.getPlatform === "function") return Capacitor.getPlatform() !== "web";
    return false;
  } catch {
    return false;
  }
}

function normalizeDriverRoute(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const raw = value.trim();
    const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
    const url = new URL(raw, "https://www.volantinipro.it");
    if (isAbsolute && !["www.volantinipro.it", "volantinipro.it"].includes(url.hostname.toLowerCase())) return null;
    if (!DRIVER_ROUTE_RE.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function DriverNativeHome({ onNavigate }) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const lastRoute = normalizeDriverRoute(
    typeof window !== "undefined" ? window.localStorage.getItem(DRIVER_LAST_ROUTE_KEY) : null,
  );

  const openRoute = (candidate) => {
    const route = normalizeDriverRoute(candidate);
    if (!route) {
      setMessage("Link Driver non valido. Incolla il link ricevuto da VolantiniPro.");
      return;
    }
    setMessage("");
    window.history.replaceState({}, "", route);
    window.localStorage.setItem(DRIVER_LAST_ROUTE_KEY, route);
    onNavigate(new URL(route, window.location.origin).pathname);
  };

  const pasteAndOpen = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setValue(clipboardText || "");
      if (clipboardText) openRoute(clipboardText);
      else setMessage("Nessun link trovato negli appunti.");
    } catch {
      setMessage("Incolla il link nel campo qui sotto.");
    }
  };

  return (
    <main style={{ minHeight: "100dvh", background: "#071426", color: "#fff", padding: "28px 20px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <section style={{ width: "100%", maxWidth: 520, margin: "0 auto", paddingTop: "10vh" }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.1, color: "#2ECC8A", textTransform: "uppercase" }}>
          VolantiniPro Driver
        </div>
        <h1 style={{ margin: "10px 0 8px", fontSize: 30, lineHeight: 1.15 }}>App Autista</h1>
        <p style={{ margin: "0 0 22px", color: "rgba(255,255,255,.72)", lineHeight: 1.55 }}>
          Apri il lavoro assegnato con il link Driver ricevuto da VolantiniPro.
        </p>

        {lastRoute && (
          <button
            type="button"
            onClick={() => openRoute(lastRoute)}
            style={{ width: "100%", minHeight: 54, border: 0, borderRadius: 14, background: "#2ECC8A", color: "#071426", fontSize: 16, fontWeight: 900, marginBottom: 14 }}
          >
            Continua ultimo lavoro
          </button>
        )}

        <button
          type="button"
          onClick={pasteAndOpen}
          style={{ width: "100%", minHeight: 52, borderRadius: 14, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.08)", color: "#fff", fontSize: 15, fontWeight: 800, marginBottom: 14 }}
        >
          Incolla link Driver
        </button>

        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") openRoute(value);
          }}
          placeholder="https://www.volantinipro.it/driver/..."
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          style={{ width: "100%", boxSizing: "border-box", minHeight: 50, borderRadius: 12, border: "1px solid rgba(255,255,255,.18)", background: "#0d1d32", color: "#fff", padding: "0 14px", fontSize: 14, outline: "none" }}
        />
        <button
          type="button"
          onClick={() => openRoute(value)}
          style={{ width: "100%", minHeight: 50, border: 0, borderRadius: 12, background: "#fff", color: "#071426", fontSize: 15, fontWeight: 900, marginTop: 10 }}
        >
          Apri lavoro
        </button>

        {message && (
          <p role="alert" style={{ marginTop: 14, color: "#ffcc80", fontSize: 14, lineHeight: 1.45 }}>
            {message}
          </p>
        )}
      </section>
    </main>
  );
}

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
  const nativeDriverApp = isNativeDriverApp();

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Android deep link: toccando da WhatsApp un URL
  // https://www.volantinipro.it/driver/... l'APK apre direttamente quel
  // lavoro, senza copia/incolla. Gestisce sia cold start sia app gia' aperta.
  useEffect(() => {
    if (!nativeDriverApp) return undefined;

    let cancelled = false;
    let removeListener = null;

    const openNativeDriverUrl = (rawUrl) => {
      const route = normalizeDriverRoute(rawUrl);
      if (!route || cancelled) return;
      try {
        window.localStorage.setItem(DRIVER_LAST_ROUTE_KEY, route);
      } catch {}
      window.history.replaceState({}, "", route);
      setPath(new URL(route, window.location.origin).pathname);
    };

    import("@capacitor/app")
      .then(async ({ App }) => {
        const launch = await App.getLaunchUrl().catch(() => null);
        if (launch?.url) openNativeDriverUrl(launch.url);

        const handle = await App.addListener("appUrlOpen", ({ url }) => {
          openNativeDriverUrl(url);
        });
        if (cancelled) {
          await handle.remove();
        } else {
          removeListener = () => handle.remove();
        }
      })
      .catch(() => {
        // L'app resta utilizzabile con la schermata Driver manuale anche se
        // il plugin nativo non fosse disponibile in una build vecchia.
      });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [nativeDriverApp]);

  useEffect(() => {
    if (!nativeDriverApp) return;
    const current = normalizeDriverRoute(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    if (current) window.localStorage.setItem(DRIVER_LAST_ROUTE_KEY, current);
  }, [nativeDriverApp, path]);

  // Nell'APK Driver la route "/" non deve mai mostrare la homepage commerciale.
  // Primo avvio: schermata Driver dedicata per aprire/incollare il link assegnato.
  // Avvii successivi: l'operatore puo' riprendere l'ultimo lavoro salvato sul dispositivo.
  if (nativeDriverApp && path === "/") {
    return <DriverNativeHome onNavigate={setPath} />;
  }

  // Fase D (retry singolo su chunk load error): se Root per questo path
  // resta montato senza che RouteErrorBoundary intercetti nulla per qualche
  // secondo, il chunk lazy di questa route e' verosimilmente stato caricato
  // con successo — pulisce il flag di retry, cosi' un futuro fallimento
  // reale su questo stesso pathname (in questa stessa tab) ottiene di nuovo
  // un tentativo automatico invece di restare marcato "gia' ritentato" per
  // sempre dopo un singolo blip risolto.
  useEffect(() => {
    const timer = window.setTimeout(() => clearRetryFlag(path), 3000);
    return () => window.clearTimeout(timer);
  }, [path]);

  // Driver Group Access: 1 link condiviso di gruppo -> join -> identita' personale.
  const driverGroupMatch = path.match(/^\/driver\/group\/([^/]+)$/);
  if (driverGroupMatch) return <Suspense fallback={<RouteLoadingFallback />}><DriverGroupJoinPage key={driverGroupMatch[1]} groupToken={decodeURIComponent(driverGroupMatch[1])} /></Suspense>;

  const driverMatch = path.match(/^\/driver\/tracking\/([^/]+)$/);
  if (driverMatch) return <Suspense fallback={<RouteLoadingFallback />}><TrackingPage campaignId={driverMatch[1]} /></Suspense>;

  const driverMapMatch = path.match(/^\/driver\/tracking\/([^/]+)\/map$/);
  if (driverMapMatch) return <Suspense fallback={<RouteLoadingFallback />}><DriverCoverageMap campaignId={driverMapMatch[1]} /></Suspense>;

  // ADMIN-DRIVER-LINK-2: link personale driver via assignment_id (no driver_id nell'URL)
  const driverAssignmentMapMatch = path.match(/^\/driver\/assignment\/([^/]+)\/map$/);
  if (driverAssignmentMapMatch) return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <DriverWorkMapPage key={driverAssignmentMapMatch[1]} assignmentId={driverAssignmentMapMatch[1]} />
      <DriverDiagnosticsPanel />
      <DriverAssistantHost assignmentId={driverAssignmentMapMatch[1]} page={`driver-map:${driverAssignmentMapMatch[1]}`} />
    </Suspense>
  );

  const driverAssignmentMatch = path.match(/^\/driver\/assignment\/([^/]+)$/);
  if (driverAssignmentMatch) return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <DriverAssignmentPage key={driverAssignmentMatch[1]} assignmentId={driverAssignmentMatch[1]} />
      <DriverDiagnosticsPanel />
      <DriverAssistantHost assignmentId={driverAssignmentMatch[1]} page={`driver-assignment:${driverAssignmentMatch[1]}`} />
    </Suspense>
  );

  const customerMatch = path.match(/^\/customer\/campaigns\/([^/]+)\/tracking$/);
  if (customerMatch) return <Suspense fallback={<RouteLoadingFallback />}><CampaignTracking campaignId={customerMatch[1]} /></Suspense>;

  return <Suspense fallback={<RouteLoadingFallback />}><AppRouter /></Suspense>;
}

createRoot(document.getElementById("root")).render(
  <RouteErrorBoundary>
    <Root />
  </RouteErrorBoundary>
);
