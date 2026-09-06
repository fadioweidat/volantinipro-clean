// TICKET — CRITICAL REGRESSION: Step 2 modalità Comune senza dati territoriali.
// Il backend analysis-istat HA i dati per Cormano (verificato live: famiglie
// 70629, volantini 77692, comuni_breakdown 8 righe). Il frontend li mascherava
// come "Dato non disponibile". Fix: (a) selectedMunicipality robusto (niente
// suffisso provincia inviato al backend), (b) apiData.values reale non puo'
// essere trattato come "unavailable", (c) diagnostica prod del binding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const step2 = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');

test('selectedMunicipality: fallback robusto + rimozione suffisso provincia " (XX)"', () => {
  assert.match(step2, /const raw = city\?\.comune \|\| city\?\.name \|\| city\?\.label \|\| selectedComuni\?\.\[0\]\?\.comune \|\| selectedComuni\?\.\[0\]\?\.name \|\| selectedComuni\?\.\[0\]\?\.label \|\| null;/);
  assert.match(step2, /raw\.replace\(\/\\s\*\\\(\[A-Za-z\]\{2\}\\\)\\s\*\$\/,\s*""\)/);
});

test('territorialDataUnavailable: mai true se apiData.values ha famiglie/volantini reali', () => {
  assert.match(step2, /const apiHasAggregateValues = Boolean\(/);
  assert.match(step2, /Number\(apiData\.values\.famiglie_stimate\) \|\| 0\) > 0 \|\| \(Number\(apiData\.values\.volantini_consigliati\)/);
  assert.match(step2, /const territorialDataUnavailable = Boolean\(city && !apiLoading && !hasUsefulApiZones && !apiHasAggregateValues\)/);
});

test('diagnostica prod: log del binding quando la UI mostrerebbe "non disponibile"', () => {
  assert.match(step2, /\[STEP2_TERRITORIAL_STATE\]/);
  for (const k of ['municipality', 'analysisLevel', 'lat', 'lng', 'radiusKm', 'apiRequestFired', 'apiError', 'apiHasValues', 'comuniBreakdown', 'apiZonesLen']) {
    assert.match(step2, new RegExp(`${k}:`), `il log diagnostico deve includere ${k}`);
  }
  // nessun secret nel log
  assert.doesNotMatch(step2, /\[STEP2_TERRITORIAL_STATE\][\s\S]{0,400}(apikey|authorization|token|SERVICE_ROLE)/i);
});

test('non toccato: requestedAnalysisLevel resta la derivazione esistente (nessun revert distruttivo)', () => {
  assert.match(step2, /const requestedAnalysisLevel = useMemo\(\(\) => isResidentialStep2 && hasMilanoTerritory \? "nil" : "comune"/);
});
