import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { buildTerritorialReportSnapshot } from '../src/ai/context/buildTerritorialReportSnapshot.js';
import {
  deterministicTerritorialReportResponse,
  territorialReportNumbersAreGrounded,
  validateTerritorialReportAiResult,
  validateTerritorialReportSnapshot,
} from '../supabase/functions/ai-core/territorialReport.ts';

function truth(overrides = {}) {
  return {
    service: { key: 'd2d', title: 'Door to Door' },
    rawData: { territorialAnalysis: { metadata: { analysis_level: 'comune', province: 'Milano', region: 'Lombardia' } } },
    userSelections: {},
    territory: { label: 'Cormano', territories: [{ name: 'Cormano' }], nils: [], pois: [] },
    d2d: { available: true, kpis: { population: 20744, families: 9297, density: 4625.04 } },
    h2h: { available: false, kpis: {} },
    business: { available: false, kpis: {} },
    quantity: { inserted: 5000, current: 5000, recommendedRequirement: 10045 },
    coverage: { operationalPct: 49.8 },
    availability: { pois: false, mobility: false },
    sourceMetadata: [{ name: 'Popolazione e famiglie residenti', provider: 'ISTAT', connected: true }],
    ...overrides,
  };
}

const cormano = buildTerritorialReportSnapshot({ truthModel: truth(), generatedAt: '2026-08-13T12:00:00.000Z' });

test('territorial_report snapshot serializza soltanto Truth Model e preserva provenance', () => {
  assert.equal(validateTerritorialReportSnapshot(cormano), true);
  assert.deepEqual(cormano.territory, {
    name: 'Cormano', province: 'Milano', region: 'Lombardia', analysisLevel: 'comune', availableNilCount: null, selectedNames: ['Cormano'], provenance: ['ISTAT'],
  });
  assert.deepEqual(cormano.demographics, { population: 20744, households: 9297, density: 4625.04, provenance: ['ISTAT'] });
  assert.deepEqual(cormano.campaign, {
    currentQuantity: 5000, currentCoverage: 49.8, recommendedQuantity: 10045, recommendedCoverage: 100,
    service: 'd2d', quantityInserted: 5000, quantityAssigned: 5000, requiredQuantity: 10045, estimatedCoverage: 49.8,
    provenance: ['calcolo interno VolantiniPro'],
  });
});

test('Bergamo: presentation comunale non sovrascrive i KPI selezionati dello Step2', () => {
  const bergamo = buildTerritorialReportSnapshot({
    truthModel: truth({
      territory: { label: 'Bergamo', territories: [{ name: 'Bergamo' }], nils: [], pois: [] },
      d2d: { available: true, kpis: { population: 83345, families: 41287, density: 2098 } },
      quantity: { inserted: 10000, current: 10000, recommendedRequirement: 45415 },
      coverage: { operationalPct: 22 },
    }),
    presentation: { demographics: { totalPopulation: 120389, totalHouseholds: 59638, profileDens: 3031 } },
  });
  assert.deepEqual(bergamo.demographics, { population: 83345, households: 41287, density: 2098, provenance: ['ISTAT'] });
  assert.deepEqual({
    currentQuantity: bergamo.campaign.currentQuantity,
    currentCoverage: bergamo.campaign.currentCoverage,
    recommendedQuantity: bergamo.campaign.recommendedQuantity,
    recommendedCoverage: bergamo.campaign.recommendedCoverage,
  }, { currentQuantity: 10000, currentCoverage: 22, recommendedQuantity: 45415, recommendedCoverage: 100 });
});

test('POI no-data resta unavailable con count null, mai zero inventato', () => {
  assert.equal(cormano.poi.available, false);
  assert.equal(cormano.poi.total, null);
  assert.equal(cormano.poi.sectors, null);
  assert.match(deterministicTerritorialReportResponse(cormano, 'Quante farmacie ci sono?').summary, /Dati POI non disponibili/);
});

test('POI unavailable non modifica demografia, quantita o copertura', () => {
  const withFailedPoi = buildTerritorialReportSnapshot({ truthModel: truth({
    territory: { label: 'Cormano', territories: [{ name: 'Cormano' }], nils: [], pois: [] },
    availability: { pois: false, mobility: false },
  }) });
  assert.deepEqual(withFailedPoi.demographics, cormano.demographics);
  assert.deepEqual(withFailedPoi.campaign, cormano.campaign);
  assert.equal(withFailedPoi.poi.status, 'unavailable');
});

test('hallucination: premessa 100.000 abitanti viene corretta con 20.744', () => {
  const result = deterministicTerritorialReportResponse(cormano, 'Ci sono 100.000 abitanti?');
  assert.match(result.summary, /^No\./);
  assert.match(result.summary, /20744/);
  assert.doesNotMatch(result.summary, /100000|100\.000/);
  assert.equal(territorialReportNumbersAreGrounded(result, cormano), true);
});

test('hallucination Milano: 5 milioni viene corretto senza trattare la popolazione come telefono', () => {
  const milano = buildTerritorialReportSnapshot({ truthModel: truth({
    rawData: { territorialAnalysis: { metadata: { analysis_level: 'nil', province: 'Milano', region: 'Lombardia' } } },
    territory: { label: 'Milano', territories: [{ name: 'Milano' }], nils: [{ name: 'ADRIANO' }], pois: [] },
    zones: { available: 88 },
    d2d: { available: true, kpis: { population: 1365698, families: 741887, density: 7538.20 } },
  }) });
  const result = deterministicTerritorialReportResponse(milano, 'Milano ha 5 milioni di abitanti?');
  assert.match(result.summary, /^No\./);
  assert.match(result.summary, /1365698/);
  assert.equal(validateTerritorialReportAiResult(result, milano), true);
  assert.equal(territorialReportNumbersAreGrounded(result, milano), true);
});

test('missing fields: reddito e requiredQuantity non vengono stimati', () => {
  assert.match(deterministicTerritorialReportResponse(cormano, 'Qual è il reddito medio?').summary, /Dato non disponibile/);
  const missingRequired = buildTerritorialReportSnapshot({
    truthModel: truth({ quantity: { inserted: 5000, current: 5000, recommendedRequirement: null }, coverage: { operationalPct: null } }),
  });
  assert.match(deterministicTerritorialReportResponse(missingRequired, 'La quantità è sufficiente?').summary, /fabbisogno operativo non è presente/);
});

test('quantityAssigned, requiredQuantity e coverage restano campi distinti', () => {
  assert.equal(cormano.campaign.quantityAssigned, 5000);
  assert.equal(cormano.campaign.requiredQuantity, 10045);
  assert.equal(cormano.campaign.estimatedCoverage, 49.8);
});

test('Milano/NIL preserva analysisLevel e usa soltanto NIL presenti', () => {
  const milano = buildTerritorialReportSnapshot({ truthModel: truth({
    rawData: { territorialAnalysis: { metadata: { analysis_level: 'nil', province: 'Milano', region: 'Lombardia' } } },
    territory: { label: 'Milano · NIL selezionati', territories: [{ name: 'Milano' }], nils: [{ name: 'Brera' }, { name: 'Isola' }], pois: [] },
    zones: { available: 88 },
  }) });
  assert.equal(milano.territory.analysisLevel, 'nil');
  assert.equal(milano.territory.availableNilCount, 88);
  assert.deepEqual(milano.territory.selectedNames, ['Milano', 'Brera', 'Isola']);
});

test('sources: con soli dati ISTAT non compaiono provider POI inventati', () => {
  assert.deepEqual(cormano.sources, ['ISTAT', 'calcolo interno VolantiniPro']);
  assert.doesNotMatch(JSON.stringify(cormano.sources), /Google|OpenStreetMap|Overpass|Foursquare/i);
  const valid = { summary: 'Popolazione 20744.', strengths: [], risks: [], recommendations: [], warnings: [], sources: ['ISTAT'] };
  assert.equal(validateTerritorialReportAiResult(valid, cormano), true);
  assert.equal(validateTerritorialReportAiResult({ ...valid, sources: ['Google Places'] }, cormano), false);
});

test('numeric grounding e schema bloccano numeri estranei e output non strutturati', () => {
  const valid = { summary: 'Quantità assegnata 5000 e richiesta 10045.', strengths: [], risks: [], recommendations: [], warnings: [], sources: ['calcolo interno VolantiniPro'] };
  assert.equal(validateTerritorialReportAiResult(valid, cormano), true);
  assert.equal(territorialReportNumbersAreGrounded(valid, cormano), true);
  assert.equal(territorialReportNumbersAreGrounded({ ...valid, summary: 'Popolazione 20.744 e densità 4.625,04.' }, cormano), true);
  assert.equal(territorialReportNumbersAreGrounded({ ...valid, summary: 'Popolazione 99999.' }, cormano), false);
});

test('snapshot validation rifiuta coordinate, non-finite e POI unavailable mascherato da zero', () => {
  assert.equal(validateTerritorialReportSnapshot({ ...cormano, latitude: 45.5 }), false);
  assert.equal(validateTerritorialReportSnapshot({ ...cormano, demographics: { ...cormano.demographics, population: Number.POSITIVE_INFINITY } }), false);
  assert.equal(validateTerritorialReportSnapshot({ ...cormano, poi: { ...cormano.poi, total: 0 } }), false);
});

test('adapter usa ai-core/territorial_report e la UI non chiama più la function legacy', () => {
  const adapter = fs.readFileSync('src/ai/adapters/territorialReportAdapter.js', 'utf8');
  const page = fs.readFileSync('src/pages/TerritorialReport.jsx', 'utf8');
  assert.match(adapter, /functions\.invoke\("ai-core"/);
  assert.match(adapter, /contextType: "territorial_report"/);
  assert.doesNotMatch(adapter, /analyze-territory-summary/);
  assert.doesNotMatch(page, /functions\.invoke\("analyze-territory-summary"/);
  assert.match(page, /Punti di forza/);
  assert.match(page, /Rischi/);
  assert.match(page, /Raccomandazioni/);
  assert.match(page, /Fonti/);
  assert.match(page, /Warning/);
});

test('ai-core territorial_report è pubblico-safe, cache solo per JWT verificato e read-only', () => {
  const source = fs.readFileSync('supabase/functions/ai-core/index.ts', 'utf8');
  const branch = source.slice(source.indexOf('async function handleTerritorialReport'), source.indexOf('\nserve(async'));
  assert.match(source, /contextType === "territorial_report"/);
  assert.match(branch, /if \(!user\)/);
  const anon = branch.slice(branch.indexOf('if (!user)'), branch.indexOf('const supabase = supabaseAdmin'));
  assert.doesNotMatch(anon, /ai_territorial_chat_cache/);
  assert.match(branch, /contextType: "territorial_report"/);
  assert.match(branch, /\.eq\("user_id", user\.id\)/);
  for (const table of ['campaigns', 'campaign_zones', 'operator_assignments', 'delivery_sessions', 'gps_tracking_points']) {
    assert.doesNotMatch(branch, new RegExp(`from\\(\\"${table}\\"\\)[\\s\\S]{0,200}\\.(?:insert|update|upsert|delete)\\(`));
  }
});

test('riconciliazione read-only Cormano, Varedo e Milano con dataset remoti verificati', () => {
  const verifiedDbRows = [
    { name: 'Cormano', population: 20744, households: 9297, density: 4625.04, analysisLevel: 'comune' },
    { name: 'Varedo', population: 13914, households: 6176, density: 2895.90, analysisLevel: 'comune' },
    { name: 'Milano', population: 1365698, households: 741887, density: 7538.20, analysisLevel: 'nil' },
  ];
  for (const row of verifiedDbRows) {
    const model = truth({
      rawData: { territorialAnalysis: { metadata: { analysis_level: row.analysisLevel, province: 'Milano', region: 'Lombardia' } } },
      territory: { label: row.name, territories: [{ name: row.name }], nils: row.name === 'Milano' ? [{ name: 'ADRIANO' }] : [], pois: [] },
      zones: { available: row.name === 'Milano' ? 88 : null },
      d2d: { available: true, kpis: { population: row.population, families: row.households, density: row.density } },
    });
    const snapshot = buildTerritorialReportSnapshot({ truthModel: model, generatedAt: '2026-08-13T12:00:00.000Z' });
    assert.equal(snapshot.territory.name, row.name);
    assert.equal(snapshot.territory.analysisLevel, row.analysisLevel);
    if (row.name === 'Milano') assert.equal(snapshot.territory.availableNilCount, 88);
    assert.equal(snapshot.demographics.population, row.population);
    assert.equal(snapshot.demographics.households, row.households);
    assert.equal(snapshot.demographics.density, row.density);
  }
});
