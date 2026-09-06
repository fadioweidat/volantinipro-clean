// TICKET — "FETCH OK, MA apiData NON POPOLA ZONE/KPI".
// La richiesta analysis-istat parte e risponde, ma la pipeline
// apiData -> apiToZones -> zonesInRadius (match single-comune per nome/codice)
// -> selZones -> serviceKpis perdeva tutte le zone perche':
//  (a) normalizeMunicipalityName NON rimuoveva il suffisso provincia "(MI)"
//      -> "cormano (mi)" != "cormano" -> 0 match -> zone vuote;
//  (b) apiToZones leggeva pochi alias di campo per il nome/codice del comune
//      -> riga senza nome -> "Zona N" -> comunque 0 match.
// Fix: normalizeMunicipalityName strippa " (XX)" finale; apiToZones tollera piu'
// alias (comune/comune_name/name/nome/denominazione, istat_code/comune_code/...,
// famiglie_stimate/households_*/famiglie, ...). Nessun fix hardcoded per comune.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apiToZones } from '../src/lib/step2/zoneGeoHelpers.js';
import { normalizeMunicipalityName } from '../src/lib/step2/addressIntent.js';

const step2 = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');

// Matrice comuni: nessun ramo speciale per nessuno di questi.
const COMUNI = ['Cormano', 'Paderno Dugnano', 'Rho', 'Monza', 'Milano'];

test('normalizeMunicipalityName: rimuove il suffisso provincia " (XX)" (matrice)', () => {
  for (const name of COMUNI) {
    assert.equal(normalizeMunicipalityName(`${name} (MI)`), normalizeMunicipalityName(name), name);
    assert.equal(normalizeMunicipalityName(`${name} (mb)`), normalizeMunicipalityName(name), `${name} lowercase prov`);
    assert.equal(normalizeMunicipalityName(`Comune di ${name} (MI)`), normalizeMunicipalityName(name), `${name} comune di + prov`);
  }
  // non deve toccare parentesi che NON sono un suffisso provincia di 2 lettere
  assert.equal(normalizeMunicipalityName('San Giorgio (frazione)'), 'san giorgio (frazione)');
});

// Replica esatta del match single-comune di zonesInRadius (Step2.jsx):
// targetNames.has(normalizeMunicipalityName(z.name)) || codeMatch.
function matchSingleComune(zones, selectedMunicipality, selectedCode) {
  const targetNames = new Set([normalizeMunicipalityName(selectedMunicipality)].filter(Boolean));
  const targetCodes = new Set([selectedCode].filter(Boolean).map(String));
  return zones.filter(z => {
    const nameMatch = targetNames.has(normalizeMunicipalityName(z.name));
    const codeMatch = Boolean(z.municipality_code) && targetCodes.has(String(z.municipality_code));
    return nameMatch || codeMatch;
  });
}

// Costruisce una risposta analysis-istat plausibile: la riga del comune target
// arriva col suffisso provincia, piu' alcuni comuni vicini (sweep del raggio).
function fakeIstatResponse(target, { nameField = 'comune_name', withCode = true } = {}) {
  const row = {
    [nameField]: `${target} (MI)`,
    households_in_radius: 70629,
    volantini_nel_raggio: 77692,
    population_in_radius: 165000,
    pct_copertura: 100,
    area_km2: 4.2,
  };
  if (withCode) row.comune_code = '015096';
  return {
    values: { famiglie_stimate: 70629, volantini_consigliati: 77692, popolazione_stimata: 165000, area_km2: 4.2 },
    comuni_breakdown: [
      row,
      { comune_name: 'Cusano Milanino (MI)', households_in_radius: 12000, volantini_nel_raggio: 13000 },
      { comune_name: 'Bresso (MI)', households_in_radius: 11000, volantini_nel_raggio: 12000 },
    ],
    metadata: { analysis_level: 'comune', municipality: `${target} (MI)` },
  };
}

test('apiToZones: la riga col suffisso provincia diventa una zona che matcha il comune (matrice)', () => {
  for (const comune of COMUNI) {
    const zones = apiToZones(fakeIstatResponse(comune), { name: comune });
    assert.ok(Array.isArray(zones) && zones.length >= 1, `${comune}: zone prodotte`);
    const matched = matchSingleComune(zones, comune, '015096');
    assert.equal(matched.length, 1, `${comune}: esattamente 1 zona matcha (via nome normalizzato o codice)`);
    assert.ok(Number(matched[0].families) > 0, `${comune}: famiglie > 0`);
    assert.ok(Number(matched[0].flyersMin) > 0, `${comune}: volantini > 0`);
  }
});

test('apiToZones: alias di campo del NOME comune (comune / name / nome / denominazione)', () => {
  for (const nameField of ['comune', 'name', 'nome', 'nome_comune', 'denominazione', 'municipality']) {
    const zones = apiToZones(fakeIstatResponse('Rho', { nameField, withCode: false }), { name: 'Rho' });
    const matched = matchSingleComune(zones, 'Rho', null);
    assert.equal(matched.length, 1, `nameField=${nameField}: match per nome`);
    assert.ok(Number(matched[0].families) > 0, `nameField=${nameField}: famiglie > 0`);
  }
});

test('apiToZones: alias numerici (famiglie_stimate / famiglie / households) sulla riga', () => {
  for (const famField of ['famiglie_stimate', 'famiglie', 'households', 'nuclei_familiari']) {
    const resp = {
      values: { famiglie_stimate: 5000, volantini_consigliati: 5500 },
      comuni_breakdown: [{ comune: 'Monza (MB)', [famField]: 4200, volantini: 4600, pct_copertura: 100 }],
      metadata: { analysis_level: 'comune', municipality: 'Monza (MB)' },
    };
    const zones = apiToZones(resp, { name: 'Monza' });
    const matched = matchSingleComune(zones, 'Monza', null);
    assert.equal(matched.length, 1, `famField=${famField}`);
    assert.ok(Number(matched[0].families) > 0, `famField=${famField}: famiglie > 0`);
  }
});

test('apiToZones: NON fabbrica zone senza breakdown (invariante ticket 17 preservata)', () => {
  assert.deepEqual(
    apiToZones({ values: { famiglie_stimate: 1000 }, comuni_breakdown: [] }, { name: 'Milano' }),
    []
  );
  assert.equal(apiToZones({ error: 'BOOM', values: {} }, { name: 'Milano' }), null);
  assert.equal(apiToZones({}, { name: 'Milano' }), null);
});

test('Step2: diagnostica [STEP2_ANALYSIS_RESPONSE] con campi safe, nessun secret', () => {
  assert.match(step2, /\[STEP2_ANALYSIS_RESPONSE\]/);
  for (const k of ['topLevelKeys', 'valuesKeys', 'famiglie_stimate', 'volantini_consigliati', 'comuniBreakdownLen', 'breakdownRow0Keys', 'breakdownRow0', 'metadata', 'municipalityEcho']) {
    assert.match(step2, new RegExp(`\\b${k}\\b`), `manca ${k}`);
  }
  // le righe breakdown sono sanitizzate: campi con key/token/auth/secret esclusi
  assert.match(step2, /\.filter\(\(\[k\]\) => !\/key\|token\|auth\|secret\|apikey\/i\.test\(k\)\)/);
  // non si loggano header/anon key della richiesta
  const respBlock = step2.slice(step2.indexOf('[STEP2_ANALYSIS_RESPONSE]'), step2.indexOf('[STEP2_ANALYSIS_RESPONSE]') + 1200);
  assert.doesNotMatch(respBlock, /Authorization|Bearer \$\{|VITE_SUPABASE_ANON_KEY/);
});

test('Step2: diagnostica [STEP2_ANALYSIS_MAPPING] con tutti i contatori pipeline', () => {
  assert.match(step2, /\[STEP2_ANALYSIS_MAPPING\]/);
  for (const k of [
    'apiDataPresent', 'apiHasAggregateValues', 'comuniBreakdownLen', 'apiToZonesInputCity',
    'apiZonesLen', 'zonesInRadiusLen', 'selectedLen', 'selZonesLen',
    'serviceKpisFamilies', 'serviceKpisRecommended', 'territorialDataUnavailable',
  ]) {
    assert.match(step2, new RegExp(`\\b${k}\\b`), `manca ${k}`);
  }
});
