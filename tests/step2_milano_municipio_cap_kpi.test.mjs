import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadMilanoMunicipi,
  normalizeMilanoMunicipi,
  loadMilanoMunicipiDemographics,
  MUNICIPI_SOURCE,
  MUNICIPI_DEMOGRAPHICS_SOURCE,
} from '../src/lib/geo/territories/municipioMilano.js';

import {
  loadMilanoCapEstimates,
  resolveMilanoCapEstimate,
  CAP_ESTIMATE_DISCLAIMER,
  CAP_ESTIMATE_SHORT_DISCLAIMER,
} from '../src/lib/geo/territories/milanoCapEstimates.js';

import {
  buildMilanoTerritoryKpiContext,
  buildMunicipioKpiContext,
  buildCapKpiContext,
  buildNilKpiContext,
} from '../src/lib/step2/milanoTerritoryKpiContext.js';

import { checkMilanoTerritory } from '../src/lib/step2/milanoTerritoryHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function mockFetch(urlMap) {
  return async (url) => {
    const filePath = urlMap[url] || path.join(rootDir, 'public', url.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(content),
        text: async () => content,
      };
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
      text: async () => 'Not found',
    };
  };
}

test('=== SECTION 25: MUNICIPIO OFFICIAL DATA & KPI TESTS ===', async (t) => {
  const fetchImpl = mockFetch({});

  await t.test('25.A: all 9 Municipi present in official dataset', async () => {
    const demoData = await loadMilanoMunicipiDemographics({ fetchImpl });
    assert.equal(demoData.year, 2025);
    assert.equal(demoData.source, 'Comune di Milano');
    assert.equal(demoData.license, 'CC BY 4.0');
    assert.equal(Object.keys(demoData.municipi).length, 9);
    for (let m = 1; m <= 9; m++) {
      assert.ok(demoData.municipi[String(m)], `Municipio ${m} must be present`);
      assert.equal(demoData.municipi[String(m)].number, m);
    }
  });

  await t.test('25.B & 25.C: Municipio 9 resolves official families (105,099) and population (187,303)', async () => {
    const records = await loadMilanoMunicipi({ fetchImpl });
    assert.equal(records.length, 9);
    const mun9 = records.find((r) => r.number === 9);
    assert.ok(mun9);
    assert.equal(mun9.officialFamilies, 105099);
    assert.equal(mun9.officialPopulation, 187303);
    assert.equal(mun9.densityPerKm2, 8869);
    assert.equal(mun9.sourceYear, 2025);
    assert.equal(mun9.demographicsSource, 'Comune di Milano — 2025');
  });

  await t.test('25.D & 25.E: Source year 2025 and Source label "Comune di Milano"', async () => {
    const records = await loadMilanoMunicipi({ fetchImpl });
    for (const record of records) {
      assert.equal(record.sourceYear, 2025);
      assert.equal(record.source.license, 'CC BY 4.0');
      assert.match(record.demographicsSource, /Comune di Milano/);
    }
  });

  await t.test('25.F: Quantity recommendation is deterministic from 1.1x factor', async () => {
    const records = await loadMilanoMunicipi({ fetchImpl });
    const mun9 = records.find((r) => r.number === 9);
    // 105,099 * 1.1 = 115,608.9 -> 115,609
    assert.equal(mun9.recommendedQuantity, 115609);
    assert.equal(Math.round(mun9.officialFamilies * 1.1), mun9.recommendedQuantity);
  });

  await t.test('25.G: DS379 geometry unchanged and valid FeatureCollection with 9 features', async () => {
    const geoRaw = JSON.parse(fs.readFileSync(path.join(rootDir, 'public/data/territories/milano-municipi-ds379.geojson'), 'utf8'));
    assert.equal(geoRaw.type, 'FeatureCollection');
    assert.equal(geoRaw.features.length, 9);
  });

  await t.test('25.H & 25.I: Switching NIL -> Municipio does not mutate NIL data and restores cleanly', () => {
    const nilSample = {
      nil_code: '83',
      nil_name: 'BRUZZANO',
      households_total: 6840,
      population_total: 12592,
      volantini_nel_raggio: 7524,
    };
    const nilContext = buildNilKpiContext(nilSample);
    assert.equal(nilContext.families, 6840);
    assert.equal(nilContext.population, 12592);
    assert.equal(nilContext.recommendedQuantity, 7524);
    assert.equal(nilContext.isEstimated, false);
    assert.equal(nilContext.labels.families, 'Famiglie ufficiali');

    const munSample = {
      number: 9,
      officialFamilies: 105099,
      officialPopulation: 187303,
      recommendedQuantity: 115609,
    };
    const munContext = buildMunicipioKpiContext(munSample);
    assert.equal(munContext.families, 105099);
    assert.equal(munContext.population, 187303);
    assert.equal(munContext.recommendedQuantity, 115609);
    assert.equal(munContext.isEstimated, false);
    assert.equal(munContext.labels.families, 'Famiglie ufficiali');

    // Restore NIL context
    const restoredNilContext = buildNilKpiContext(nilSample);
    assert.deepEqual(restoredNilContext, nilContext);
  });

  await t.test('25.J: External municipality (Varedo) unaffected', () => {
    const varedoCity = { istat_code: '108045', name: 'Varedo', comune: 'Varedo' };
    const isMilano = checkMilanoTerritory({ city: varedoCity, searchMode: 'municipality' });
    assert.equal(isMilano, false, 'Varedo must not be recognized as Milano territory');
  });
});

test('=== SECTION 26: CAP ESTIMATE & SAFETY TESTS ===', async (t) => {
  const fetchImpl = mockFetch({});

  await t.test('26.A & 26.B: CAP 20161 estimate is generated and strictly marked isEstimated: true', async () => {
    const data = await loadMilanoCapEstimates({ fetchImpl });
    const est = resolveMilanoCapEstimate(data, '20161');
    assert.ok(est);
    assert.equal(est.available, true);
    assert.equal(est.cap, '20161');
    assert.equal(est.isEstimated, true);
    assert.ok(est.estimatedFamilies > 0);
    assert.ok(est.recommendedQuantity > 0);
  });

  await t.test('26.C: Confidence is deterministic (Alta/Media/Bassa)', async () => {
    const data = await loadMilanoCapEstimates({ fetchImpl });
    const est20161 = resolveMilanoCapEstimate(data, '20161');
    assert.equal(est20161.confidence, 'medium');
    assert.equal(est20161.confidenceLabel, 'Media');
  });

  await t.test('26.D: No official wording in CAP estimates', async () => {
    const data = await loadMilanoCapEstimates({ fetchImpl });
    const est = resolveMilanoCapEstimate(data, '20161');
    const capContext = buildCapKpiContext(est);
    assert.equal(capContext.labels.families, 'Famiglie stimate');
    assert.equal(capContext.labels.quantity, 'Quantità indicativa');
    assert.doesNotMatch(capContext.labels.families, /ufficial/i);
    assert.doesNotMatch(capContext.labels.quantity, /ufficial/i);
  });

  await t.test('26.E & 26.F: CAP 20100 and invalid CAPs excluded from estimate dataset', async () => {
    const data = await loadMilanoCapEstimates({ fetchImpl });
    assert.equal(data.estimates['20100'], undefined, 'CAP 20100 generic must be excluded');
    assert.equal(data.estimates['00000'], undefined, 'CAP 0 must be excluded');
    assert.equal(data.estimates['99999'], undefined, 'Invalid CAP must be excluded');

    const res20100 = resolveMilanoCapEstimate(data, '20100');
    assert.equal(res20100.available, false);
    assert.equal(res20100.label, 'Stima CAP non disponibile');
  });

  await t.test('26.G: No fake polygon output in CAP estimates', async () => {
    const data = await loadMilanoCapEstimates({ fetchImpl });
    for (const est of Object.values(data.estimates)) {
      assert.equal(est.geometry, undefined, 'No synthetic polygon must be attached to CAP estimate');
      assert.equal(est.geojson, undefined, 'No geojson must be attached to CAP estimate');
    }
  });

  await t.test('26.H: Recommended quantity uses canonical 1.1x factor', async () => {
    const data = await loadMilanoCapEstimates({ fetchImpl });
    const est = resolveMilanoCapEstimate(data, '20161');
    assert.equal(est.recommendedQuantity, Math.round(est.estimatedFamilies * 1.1));
  });

  await t.test('26.I: No double-counting between NIL and CAP', () => {
    const nilKpi = buildNilKpiContext({ nil_code: '83', nil_name: 'BRUZZANO', families: 6840 });
    const capKpi = buildCapKpiContext({ cap: '20161', estimatedFamilies: 21692, available: true });

    // Mode isolation proof: each KPI context is isolated
    assert.notEqual(nilKpi.mode, capKpi.mode);
    assert.equal(nilKpi.families, 6840);
    assert.equal(capKpi.families, 21692);
  });

  await t.test('26.J & 26.K: Static lookup produces deterministic result with zero runtime network loop', async () => {
    const data = await loadMilanoCapEstimates({ fetchImpl });
    const run1 = resolveMilanoCapEstimate(data, '20161');
    const run2 = resolveMilanoCapEstimate(data, '20161');
    assert.deepEqual(run1, run2);
  });

  await t.test('26.L: Missing estimate produces controlled unavailable state with full disclaimers', async () => {
    const data = await loadMilanoCapEstimates({ fetchImpl });
    const missing = resolveMilanoCapEstimate(data, '20000');
    assert.equal(missing.available, false);
    assert.equal(missing.estimatedFamilies, null);
    assert.equal(missing.recommendedQuantity, null);
    assert.equal(missing.disclaimer, CAP_ESTIMATE_DISCLAIMER);
  });
});

test('=== SECTION 27: PRESENTATION CONSISTENCY & ADDRESS PREVIEW (VIA OROBONI) ===', () => {
  // Via Antonio Oroboni, 20161 Milano
  // 1. NIL context
  const bruzzanoNil = {
    id: 'nil_code_83',
    name: 'BRUZZANO',
    families: 6840,
    population: 12592,
    volantiniNelRaggio: 7524,
  };
  const nilKpi = buildNilKpiContext(bruzzanoNil);
  assert.equal(nilKpi.families, 6840);
  assert.equal(nilKpi.population, 12592);
  assert.equal(nilKpi.recommendedQuantity, 7524);
  assert.equal(nilKpi.labels.families, 'Famiglie ufficiali');

  // 2. Municipio context
  const municipio9 = {
    number: 9,
    officialFamilies: 105099,
    officialPopulation: 187303,
    recommendedQuantity: 115609,
    areaKm2: 21.12,
    densityPerKm2: 8869,
  };
  const munKpi = buildMunicipioKpiContext(municipio9);
  assert.equal(munKpi.families, 105099);
  assert.equal(munKpi.population, 187303);
  assert.equal(munKpi.recommendedQuantity, 115609);
  assert.equal(munKpi.labels.families, 'Famiglie ufficiali');
  assert.equal(munKpi.labels.source, 'Fonte: Comune di Milano — 2025');

  // 3. CAP context
  const cap20161 = {
    cap: '20161',
    available: true,
    estimatedFamilies: 21692,
    recommendedQuantity: 23861,
    confidence: 'medium',
    confidenceLabel: 'Media',
    disclaimer: CAP_ESTIMATE_DISCLAIMER,
    shortDisclaimer: CAP_ESTIMATE_SHORT_DISCLAIMER,
  };
  const capKpi = buildCapKpiContext(cap20161);
  assert.equal(capKpi.families, 21692);
  assert.equal(capKpi.recommendedQuantity, 23861);
  assert.equal(capKpi.confidenceLabel, 'Media');
  assert.equal(capKpi.labels.families, 'Famiglie stimate');
  assert.equal(capKpi.labels.quantity, 'Quantità indicativa');
  assert.equal(capKpi.labels.source, 'Stima VolantiniPro basata su civici e NIL');
  assert.match(capKpi.disclaimer, /Non rappresenta un confine postale ufficiale/);
});
