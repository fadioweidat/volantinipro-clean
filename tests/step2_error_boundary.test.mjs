import assert from 'node:assert/strict';
import fs from 'node:fs';

const boundary = fs.readFileSync('src/components/Step2ErrorBoundary.jsx', 'utf8');
const app = fs.readFileSync('volantinipro-final.jsx', 'utf8');

// Caso A: boundary locale, applicato soltanto alla route Step 2.
assert.match(app, /page === "step2"[\s\S]{0,250}<Step2ErrorBoundary/);
assert.match(app, /<Step2ErrorBoundary[\s\S]{0,500}<Step2[\s\S]{0,200}<\/Step2ErrorBoundary>/);
for (const step of ['step1', 'step3', 'step4']) {
  const routeLine = app.split('\n').find(line => line.includes(`page === "${step}"`));
  assert(routeLine && !routeLine.includes('Step2ErrorBoundary'), `${step} incluso nel boundary Step 2`);
}

// Caso B: API React Error Boundary e fallback accessibile senza dettagli tecnici.
assert.match(boundary, /class Step2ErrorBoundary extends Component/);
assert.match(boundary, /static getDerivedStateFromError\(/);
assert.match(boundary, /componentDidCatch\(/);
assert.match(boundary, /role="alert"/);
assert.match(boundary, /aria-live="assertive"/);
assert.match(boundary, /Non siamo riusciti a mostrare questa parte della configurazione\./);
assert.doesNotMatch(boundary, /<pre\b/);
assert.doesNotMatch(boundary, /this\.state\.(?:error|info)\b/);

// Casi C/E: retry rimonta soltanto i figli e non tocca lo stato parent.
assert.match(boundary, /handleRetry[\s\S]*hasError: false[\s\S]*retryKey: previous\.retryKey \+ 1/);
assert.match(boundary, /React\.cloneElement\(child, \{ key: `step2-retry-/);
assert.doesNotMatch(boundary, /setData|selectedComuni|flyerQuantity|selectedRadius/);

// Caso D: ritorno usa callback parent, mai reload.
assert.match(boundary, /this\.props\.onBack\?\.\(\)/);
assert.match(boundary, />Torna allo Step 1<\/button>/);
assert.doesNotMatch(boundary + app, /window\.location\.reload|location\.reload/);

// Caso F: ID breve, casuale e indipendente dall'errore.
assert.match(boundary, /return `S2-\$\{suffix\}`/);
assert.match(boundary, /new Uint8Array\(6\)/);
assert.doesNotMatch(boundary, /createSafeStep2ErrorId\([^)]*(?:error|message|stack)/);

// Caso G: probe di render esclusivamente DEV; nessun handler globale invasivo.
assert.match(app, /import\.meta\.env\.DEV && window\.__VOLANTINIPRO_TEST_STEP2_THROW__/);
assert.doesNotMatch(boundary + app, /window\.onerror|window\.onunhandledrejection/);
assert.match(boundary, />Riprova<\/button>/);

console.log('Step 2 P2-D production-safe ErrorBoundary: PASS');
