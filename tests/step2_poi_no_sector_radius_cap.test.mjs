// Step 2 — limite 6 km al raggio della SOLA richiesta POI quando non c'è un
// settore specifico. I casi sono calcolati eseguendo le espressioni REALI di
// Step2.jsx (estratte dal sorgente), non una loro copia: effectiveRadiusKm
// (analisi), poiEffectiveRadiusKm (base POI e useSectors) e poiQueryRadiusKm
// (quello che arriva a usePoi / poi-search).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  POI_NO_SECTOR_MAX_RADIUS_KM,
  hasSpecificPoiSector,
  resolvePoiQueryRadiusKm,
} from '../src/lib/step2/poiQueryRadius.js';

const step2Src = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function slice(startMarker, endMarker) {
  const start = step2Src.indexOf(startMarker);
  assert.ok(start >= 0, `non trovato: ${startMarker}`);
  const end = step2Src.indexOf(endMarker, start);
  assert.ok(end > start, `fine non trovata per: ${startMarker}`);
  return step2Src.slice(start, end + endMarker.length);
}

// Codice reale di Step2.jsx, eseguito con gli input del caso.
const radiusCode = [
  slice('const effectiveRadiusKm = isComuneMode', ': numericRadiusKm;'),
  slice('const poiEffectiveRadiusKm = isRadiusMode', ': effectiveRadiusKm;'),
  slice('const poiQueryRadiusKm = resolvePoiQueryRadiusKm({', '});'),
].join('\n');
const computeRadii = new Function(
  'resolvePoiQueryRadiusKm', 'isComuneMode', 'selectedComuni', 'requestedAnalysisLevel', 'numericRadiusKm',
  'isRadiusMode', 'radiusKm', 'radius', 'hasSearchPoint', 'svcType', 'distributionTargetSelection',
  `${radiusCode}\nreturn { analysis: effectiveRadiusKm, poiBase: poiEffectiveRadiusKm, poiQuery: poiQueryRadiusKm };`,
);

const base = {
  isComuneMode: true, selectedComuni: [{ name: 'Seveso' }], requestedAnalysisLevel: 'comune', numericRadiusKm: 3,
  isRadiusMode: false, radiusKm: null, radius: 3, hasSearchPoint: false, svcType: 'd2d', distributionTargetSelection: [],
};
const radii = (over) => {
  const c = { ...base, ...over };
  return computeRadii(resolvePoiQueryRadiusKm, c.isComuneMode, c.selectedComuni, c.requestedAnalysisLevel, c.numericRadiusKm,
    c.isRadiusMode, c.radiusKm, c.radius, c.hasSearchPoint, c.svcType, c.distributionTargetSelection);
};
const MILANO = { selectedComuni: [{ name: 'Milano' }], requestedAnalysisLevel: 'nil' };
const MULTI = { selectedComuni: [{ name: 'Seveso' }, { name: 'Meda' }] };

// ── I 7 casi richiesti ───────────────────────────────────────────────────────
test('Milano senza settore: analisi 15 km, POI 6 km', () => {
  assert.deepEqual(radii({ ...MILANO, distributionTargetSelection: [] }), { analysis: 15, poiBase: 15, poiQuery: 6 });
});

test('multi-comune senza settore: analisi 25 km, POI 6 km', () => {
  assert.deepEqual(radii({ ...MULTI, distributionTargetSelection: [] }), { analysis: 25, poiBase: 25, poiQuery: 6 });
});

test('Milano con Ristorazione: POI resta 15 km', () => {
  assert.deepEqual(radii({ ...MILANO, distributionTargetSelection: ['ristorazione'] }), { analysis: 15, poiBase: 15, poiQuery: 15 });
});

test('multi-comune con Ristorazione: POI resta 25 km', () => {
  assert.deepEqual(radii({ ...MULTI, distributionTargetSelection: ['ristorazione'] }), { analysis: 25, poiBase: 25, poiQuery: 25 });
});

test('comune singolo sotto 6 km: nessun aumento artificiale', () => {
  for (const numericRadiusKm of [3, 4, 5]) {
    assert.deepEqual(radii({ numericRadiusKm, distributionTargetSelection: [] }), { analysis: numericRadiusKm, poiBase: numericRadiusKm, poiQuery: numericRadiusKm });
  }
  // 6 km esatti: resta 6.
  assert.equal(radii({ numericRadiusKm: 6 }).poiQuery, 6);
});

test('indirizzo cercato: POI resta 2,5 km (anche senza settore, anche a Milano)', () => {
  for (const over of [{}, MILANO, MULTI]) {
    const r = radii({ ...over, hasSearchPoint: true, distributionTargetSelection: [] });
    assert.equal(r.poiBase, 2.5);
    assert.equal(r.poiQuery, 2.5);
  }
});

test('modalità Raggio: il raggio scelto dall\'utente arriva ai POI invariato', () => {
  for (const radiusKm of [0.5, 1, 3, 8, 10, 15, 20]) {
    const r = radii({ isComuneMode: false, isRadiusMode: true, radiusKm, distributionTargetSelection: [] });
    assert.equal(r.analysis, 3, 'fuori da Comune effectiveRadiusKm = numericRadiusKm (invariato)');
    assert.equal(r.poiBase, radiusKm);
    assert.equal(r.poiQuery, radiusKm, `raggio utente ${radiusKm} km non limitato`);
  }
});

// ── «Settore specifico» = stessa regola della query server ───────────────────
test('settore specifico solo se restringe davvero le categorie (come getServiceTargetTags)', () => {
  assert.equal(hasSpecificPoiSector('d2d', []), false);
  assert.equal(hasSpecificPoiSector('d2d', ['all']), false);
  assert.equal(hasSpecificPoiSector('d2d', ['altro']), false);
  assert.equal(hasSpecificPoiSector('d2d', ['settore_inesistente']), false, 'target non mappato = tutte le categorie');
  assert.equal(hasSpecificPoiSector('d2d', ['ristorazione', 'altro']), false, "'altro' allarga a tutte le categorie");
  assert.equal(hasSpecificPoiSector('d2d', ['ristorazione']), true);
  assert.equal(hasSpecificPoiSector('d2d', ['farmacie']), true);
  assert.equal(hasSpecificPoiSector('h2h', ['stazioni']), true);
  // 'all'/'altro' a Milano: stesso limite dei "senza settore".
  assert.equal(radii({ ...MILANO, distributionTargetSelection: ['altro'] }).poiQuery, 6);
  assert.equal(radii({ ...MILANO, distributionTargetSelection: ['all'] }).poiQuery, 6);
});

test('resolvePoiQueryRadiusKm: valori non validi passano invariati, limite = 6', () => {
  assert.equal(POI_NO_SECTOR_MAX_RADIUS_KM, 6);
  for (const v of [null, undefined, 0, -3, 'x']) {
    assert.equal(resolvePoiQueryRadiusKm({ poiRadiusKm: v, usesTechnicalAnalysisRadius: true, serviceType: 'd2d', targetSelection: [] }), v);
  }
});

// ── Nessun altro valore di Step 2 cambia ─────────────────────────────────────
test('solo usePoi riceve il raggio limitato: analisi, useSectors e formula tecnica invariati', () => {
  assert.match(step2Src, /\} = usePoi\(poiCenterLat, poiCenterLng, poiQueryRadiusKm, svcType, distributionTargetSelection\);/);
  assert.match(step2Src, /\} = useSectors\(poiCenterLat, poiCenterLng, poiEffectiveRadiusKm, svcType\);/);
  assert.equal((step2Src.match(/poiQueryRadiusKm/g) || []).length, 2, 'definizione + usePoi, nessun altro uso');
  // Il parametro di analisi resta il raggio tecnico.
  assert.match(step2Src, /radiusKm: effectiveRadiusKm,/);
  assert.match(step2Src, /requestedAnalysisLevel === "nil" \? Math\.max\(15, numericRadiusKm\) : Math\.min\(Math\.max\(numericRadiusKm, 3\), 8\) : numericRadiusKm;/);
  assert.match(step2Src, /selectedComuni\.length > 1 \? Math\.max\(25, numericRadiusKm\)/);
});
