// FASE BUG URGENTE DRIVER — pagina bianca da WhatsApp/Chrome Android.
// Convenzioni riusate da tests/auth_login_admin_guard.test.mjs: mock
// memory-backed di window/localStorage/sessionStorage, react-test-renderer
// + act() per il componente RouteErrorBoundary, source-text/contract test
// (readFileSync) per index.html e main.jsx (quest'ultimo chiama
// createRoot(...).render(...) a livello di modulo — non importabile
// direttamente sotto node:test, che non ha un vero DOM).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { RouteErrorBoundary } from "../src/bootstrap/RouteErrorBoundary.jsx";
import {
  isChunkLoadError,
  hasAlreadyRetried,
  markRetried,
  clearRetryFlag,
  chunkRetryKey,
  CHUNK_RETRY_KEY_PREFIX,
} from "../src/bootstrap/chunkRetry.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const indexHtmlSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const mainJsxSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const chunkRetrySource = readFileSync(new URL("../src/bootstrap/chunkRetry.js", import.meta.url), "utf8");
const routeErrorBoundarySource = readFileSync(new URL("../src/bootstrap/RouteErrorBoundary.jsx", import.meta.url), "utf8");

function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

function makeWindow({ pathname = "/driver/assignment/test-id" } = {}) {
  const reloadCalls = [];
  return {
    win: {
      location: { pathname, reload: () => reloadCalls.push(1) },
      sessionStorage: makeMemoryStorage(),
    },
    reloadCalls,
  };
}

// A ThrowingChild lancia SOLO al primo render: getDerivedStateFromError
// intercetta l'eccezione lanciata durante il render, esattamente come un
// React.lazy() che rigetta dentro un Suspense boundary.
function ThrowingChild({ error }) {
  throw error;
}

function chunkError(message = "Failed to fetch dynamically imported module: https://x/y-abcd1234.js") {
  return new Error(message);
}

// ---------------------------------------------------------------------------
// 1. fallback HTML presente prima del bootstrap React
// ---------------------------------------------------------------------------
test("1. index.html: #root contiene un fallback HTML statico (non-React) PRIMA dello script module main.jsx", () => {
  const rootIdx = indexHtmlSource.indexOf('id="root"');
  const scriptModuleIdx = indexHtmlSource.indexOf('<script type="module" src="/src/main.jsx">');
  assert.ok(rootIdx >= 0 && scriptModuleIdx >= 0);
  assert.ok(rootIdx < scriptModuleIdx, "#root deve comparire prima dello script module");
  const rootBlock = indexHtmlSource.slice(rootIdx, scriptModuleIdx);
  assert.match(rootBlock, /Caricamento programma/);
  assert.match(rootBlock, /vp-boot-fallback/);
});

test("1b. index.html: lo script inline di watchdog e' un normale <script> (non type=module), quindi esegue anche se il grafo ES module fallisce", () => {
  const inlineScriptMatch = indexHtmlSource.match(/<script>\s*\(function[\s\S]*?<\/script>/);
  assert.ok(inlineScriptMatch, "script inline watchdog non trovato");
  const fullTag = indexHtmlSource.slice(indexHtmlSource.indexOf(inlineScriptMatch[0]) - 10, indexHtmlSource.indexOf(inlineScriptMatch[0]));
  assert.doesNotMatch(inlineScriptMatch[0], /type="module"/);
});

test("1c. index.html: il watchdog ascolta l'evento 'error' della window E ha un timeout esplicito, mai in attesa indefinita", () => {
  assert.match(indexHtmlSource, /window\.addEventListener\('error'/);
  assert.match(indexHtmlSource, /window\.setTimeout\(showRetry, BOOT_TIMEOUT_MS\)/);
});

// ---------------------------------------------------------------------------
// 2. bootstrap riuscito => fallback sostituito dall'app
// ---------------------------------------------------------------------------
test("2. main.jsx imposta window.__appBooted PRIMA di qualunque altra logica, e il watchdog lo controlla per non mostrare un falso errore", () => {
  const bootedIdx = mainJsxSource.indexOf("window.__appBooted = true");
  assert.ok(bootedIdx > 0);
  // Deve comparire tra i primissimi import e prima di createRoot(...).render(...)
  const renderIdx = mainJsxSource.indexOf("createRoot(document.getElementById");
  assert.ok(bootedIdx < renderIdx);
  assert.match(indexHtmlSource, /if \(window\.__appBooted \|\| shown\) return;/);
});

test("2b. main.jsx: createRoot() punta allo STESSO #root che contiene il fallback statico in index.html (React lo sostituisce interamente al mount)", () => {
  assert.match(mainJsxSource, /createRoot\(document\.getElementById\("root"\)\)\.render\(/);
  assert.match(indexHtmlSource, /<div id="root">/);
});

// ---------------------------------------------------------------------------
// 3. chunk import failure => una sola recovery (auto-reload)
// ---------------------------------------------------------------------------
test("3. Un errore di chunk load al primo verificarsi per un pathname => UN reload automatico, flag di retry impostato", () => {
  const { win, reloadCalls } = makeWindow({ pathname: "/driver/assignment/abc123" });
  globalThis.window = win;

  let renderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(RouteErrorBoundary, null, React.createElement(ThrowingChild, { error: chunkError() }))
    );
  });

  assert.equal(reloadCalls.length, 1, "il reload automatico deve avvenire esattamente una volta");
  assert.equal(win.sessionStorage.getItem(chunkRetryKey("/driver/assignment/abc123")), "1");
  // Durante l'auto-reload non deve comparire il messaggio di errore, solo
  // un placeholder di caricamento (nessun "Impossibile caricare la pagina"
  // lampeggiante mentre il reload e' gia' in corso).
  const text = JSON.stringify(renderer.toJSON());
  assert.doesNotMatch(text, /Impossibile caricare la pagina/);
});

// ---------------------------------------------------------------------------
// 4. secondo failure => schermata errore, niente loop
// ---------------------------------------------------------------------------
test("4. Se il flag di retry e' gia' impostato (fallito anche dopo il reload), NESSUN secondo reload automatico: schermata errore con bottone Ricarica", () => {
  const { win, reloadCalls } = makeWindow({ pathname: "/driver/assignment/abc123" });
  win.sessionStorage.setItem(chunkRetryKey("/driver/assignment/abc123"), "1");
  globalThis.window = win;

  let renderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(RouteErrorBoundary, null, React.createElement(ThrowingChild, { error: chunkError() }))
    );
  });

  assert.equal(reloadCalls.length, 0, "nessun reload automatico deve avvenire alla seconda occorrenza");
  const text = JSON.stringify(renderer.toJSON());
  assert.match(text, /Impossibile caricare la pagina/);
  assert.match(text, /Ricarica/);
});

test("4b. Un errore NON di tipo chunk-load (es. bug applicativo reale) non attiva mai il reload automatico, nemmeno al primo verificarsi", () => {
  const { win, reloadCalls } = makeWindow({ pathname: "/driver/assignment/xyz" });
  globalThis.window = win;

  let renderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(RouteErrorBoundary, null, React.createElement(ThrowingChild, { error: new Error("Cannot read properties of undefined (reading 'foo')") }))
    );
  });

  assert.equal(reloadCalls.length, 0);
  const text = JSON.stringify(renderer.toJSON());
  assert.match(text, /Impossibile caricare la pagina/);
});

test("4c. isChunkLoadError(): riconosce i pattern reali, non genera falsi positivi su errori applicativi", () => {
  assert.equal(isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://x/y.js")), true);
  assert.equal(isChunkLoadError(new Error("Importing a module script failed")), true);
  assert.equal(isChunkLoadError(new Error("ChunkLoadError: Loading chunk 12 failed")), true);
  assert.equal(isChunkLoadError(new Error("TypeError: campaign is undefined")), false);
  assert.equal(isChunkLoadError(new Error("invalid input syntax for type uuid")), false);
});

// ---------------------------------------------------------------------------
// 5. access token mai scritto in sessionStorage/localStorage
// ---------------------------------------------------------------------------
test("5. chunkRetry.js e RouteErrorBoundary.jsx non referenziano mai token/accessToken: l'unico dato scritto e' il flag di retry booleano", () => {
  for (const src of [chunkRetrySource, routeErrorBoundarySource]) {
    assert.doesNotMatch(src, /accessToken|access_token/i);
  }
  assert.match(chunkRetrySource, new RegExp(CHUNK_RETRY_KEY_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  // Cerca solo un USO reale (proprieta' chiamata su un oggetto), non una
  // menzione in un commento che spiega perche' NON va usato.
  assert.doesNotMatch(chunkRetrySource, /\blocalStorage\.\w+\(/);
});

test("5b. hasAlreadyRetried/markRetried/clearRetryFlag: scrivono/leggono SOLO il flag '1' per pathname, nessun payload complesso", () => {
  const win = makeWindow({ pathname: "/driver/assignment/tok-test" }).win;
  globalThis.window = win;
  assert.equal(hasAlreadyRetried("/driver/assignment/tok-test"), false);
  markRetried("/driver/assignment/tok-test");
  assert.equal(win.sessionStorage.getItem(chunkRetryKey("/driver/assignment/tok-test")), "1");
  assert.equal(hasAlreadyRetried("/driver/assignment/tok-test"), true);
  clearRetryFlag("/driver/assignment/tok-test");
  assert.equal(win.sessionStorage.getItem(chunkRetryKey("/driver/assignment/tok-test")), null);
});

test("5c. hasAlreadyRetried(): fail-safe (false) se sessionStorage lancia (es. modalita' privata restrittiva), mai un'eccezione propagata", () => {
  globalThis.window = { sessionStorage: { getItem() { throw new Error("SecurityError"); } } };
  assert.doesNotThrow(() => hasAlreadyRetried("/driver/assignment/x"));
  assert.equal(hasAlreadyRetried("/driver/assignment/x"), false);
});

// ---------------------------------------------------------------------------
// 6. assignment isolation precedente ancora PASS
// ---------------------------------------------------------------------------
test("6. Assignment isolation (fix precedente) invariata: DriverAssignmentPage/DriverWorkMapPage usano ancora key={assignmentId} per forzare il remount su cambio assignment", () => {
  assert.match(mainJsxSource, /<DriverWorkMapPage key=\{driverAssignmentMapMatch\[1\]\} assignmentId=\{driverAssignmentMapMatch\[1\]\} \/>/);
  assert.match(mainJsxSource, /<DriverAssignmentPage key=\{driverAssignmentMatch\[1\]\} assignmentId=\{driverAssignmentMatch\[1\]\} \/>/);
});

// ---------------------------------------------------------------------------
// 7. Programma <-> Mappa ancora PASS
// ---------------------------------------------------------------------------
test("7. Navigazione SPA Programma<->Mappa (pushState/popstate) invariata in main.jsx", () => {
  assert.match(mainJsxSource, /window\.addEventListener\('popstate', onPopState\)/);
  assert.match(mainJsxSource, /const \[path, setPath\] = useState\(\(\) => window\.location\.pathname\)/);
});

// ---------------------------------------------------------------------------
// 8. routing Cliente/Admin invariato
// ---------------------------------------------------------------------------
test("8. Routing pubblico/Admin (AppRouter lazy) e ordine dei branch di Root() invariati", () => {
  assert.match(mainJsxSource, /const AppRouter = lazy\(\(\) =>\s*\n\s*import\("\.\/app\/AppRouter\.jsx"\)/);
  assert.match(mainJsxSource, /return <Suspense fallback=\{<RouteLoadingFallback \/>\}><AppRouter \/><\/Suspense>;/);
  // Ordine invariato: le route Driver/Cliente dirette sono valutate PRIMA
  // del fallback generico <AppRouter/> (mutue esclusive, nessuna riordinata).
  const driverIdx = mainJsxSource.indexOf("driverMatch = path.match");
  const appRouterIdx = mainJsxSource.indexOf("return <Suspense fallback={<RouteLoadingFallback />}><AppRouter />");
  assert.ok(driverIdx > 0 && appRouterIdx > 0 && driverIdx < appRouterIdx);
});
