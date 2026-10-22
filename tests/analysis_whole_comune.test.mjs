// "Comune completo" counts the whole comune, independent of the technical sweep
// radius and of the search point (Seveso 10.120 vs 10.239; Monza 66% with 3 km).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { resolveTerritorialBreakdown, asWholeTerritory } from '../supabase/functions/analysis-istat/territorialResolver.ts';
import { resolveTerritorialRpcPlan, runTerritorialPipeline } from '../supabase/functions/analysis-istat/resolveTerritorialRpcPlan.ts';
import { createBundledRpc } from '../supabase/functions/analysis-istat/bundledRpc.ts';

// Rows as get_comuni_breakdown_in_radius returns them: households_total is the
// whole comune, pct_copertura the intersected-area share of the sweep circle.
const monzaCut = { municipality_code: '108033', comune_name: 'Monza', households_total: 57702, population_total: 123000, area_km2: 33.1, pct_copertura: 65.54, volantini_nel_raggio: 41600 };
const lissone = { municipality_code: '108028', comune_name: 'Lissone', households_total: 19000, population_total: 46000, area_km2: 9.3, pct_copertura: 40, volantini_nel_raggio: 8360 };
const nilCut = { nil_code: '1', nil_name: 'DUOMO', households_total: 10000, population_total: 18000, households_in_radius: 4000, population_in_radius: 7200, pct_copertura: 40 };
const nilFull = { nil_code: '2', nil_name: 'BRERA', households_total: 8000, population_total: 14000, households_in_radius: 8000, population_in_radius: 14000, pct_copertura: 100 };

test('asWholeTerritory: all ISTAT households, 100%, flyers with the same 10% margin; no invented numbers', () => {
  const w = asWholeTerritory(monzaCut);
  assert.equal(w.pct_copertura, 100);
  assert.equal(w.households_in_radius, 57702);
  assert.equal(w.population_in_radius, 123000);
  assert.equal(w.volantini_nel_raggio, Math.round(57702 * 1.1));
  assert.equal(w.area_km2, 33.1);
  assert.equal(monzaCut.pct_copertura, 65.54, 'input row not mutated');
  const unknown = asWholeTerritory({ comune_name: 'X', pct_copertura: 30 });
  assert.equal(unknown.households_in_radius, undefined, 'missing total stays missing, never 0');
  assert.equal(unknown.volantini_nel_raggio, undefined);
});

test('single comune (municipality scope): the requested comune is whole, other swept comuni are dropped', () => {
  const r = resolveTerritorialBreakdown({ rawSelectionScope: 'municipality', specificMunicipality: 'Monza', requestedAnalysisLevel: 'comune', comuni: [monzaCut, lissone] });
  assert.equal(r.territorialRows.length, 1);
  assert.equal(r.territorialRows[0].households_in_radius, 57702);
  assert.equal(r.territorialRows[0].pct_copertura, 100);
});

test('more comuni (multi): selected comuni and selected Milano NILs are whole', () => {
  const r = resolveTerritorialBreakdown({ rawSelectionScope: 'multi', selectedMunicipalityCodes: '108033,015146', comuni: [monzaCut, lissone], nilRows: [nilCut, nilFull] });
  assert.equal(r.analysisLevel, 'mixed');
  const byName = Object.fromEntries(r.territorialRows.map((x) => [x.nil_name || x.comune_name, x]));
  assert.equal(byName.Monza.households_in_radius, 57702);
  assert.equal(byName.DUOMO.households_in_radius, 10000);
  assert.equal(byName.BRERA.households_in_radius, 8000);
  assert.ok(!byName.Lissone, 'not selected');
});

test('Milano intera: every NIL counts whole', () => {
  const r = resolveTerritorialBreakdown({ rawSelectionScope: 'municipality', specificMunicipality: 'Milano', requestedAnalysisLevel: 'nil', nilRows: [nilCut, nilFull] });
  assert.equal(r.analysisLevel, 'nil');
  assert.deepEqual(r.territorialRows.map((x) => x.households_in_radius), [10000, 8000]);
});

test('raggio / indirizzo / CAP unchanged: rows keep their in-radius share', () => {
  for (const scope of ['radius', 'address', 'cap']) {
    const comuni = resolveTerritorialBreakdown({ rawSelectionScope: scope, comuni: [monzaCut, lissone] });
    assert.deepEqual(comuni.territorialRows, [monzaCut, lissone], scope);
    const nils = resolveTerritorialBreakdown({ rawSelectionScope: scope, requestedAnalysisLevel: 'nil', nilRows: [nilCut] });
    assert.deepEqual(nils.territorialRows, [nilCut], scope);
  }
});

// Real handler (index.ts) with the bundle adapter: values, comuni_breakdown and nil_breakdown agree.
const source = readFileSync(new URL('../supabase/functions/analysis-istat/index.ts', import.meta.url), 'utf8');
const code = transformSync(source.replace(/^import .*;\r?\n/gm, ''), { loader: 'ts', format: 'esm' }).code;
function handlerFor(comuni, nils) {
  const rpc = async (name) => {
    if (name === 'get_step2_territorial_bundle') return { data: { get_comuni_breakdown_in_radius: { data: comuni, error: null }, get_nil_breakdown_in_radius: { data: nils, error: null }, get_omi_zones_by_municipality: { data: [], error: null } }, error: null, status: 200 };
    if (name === 'get_comuni_breakdown_in_radius') return { data: comuni, error: null };
    if (name === 'get_nil_breakdown_in_radius') return { data: nils, error: null };
    return { data: [], error: null };
  };
  let handler;
  new Function('serve', 'createClient', 'sourceLabel', 'runTerritorialPipeline', 'resolveTerritorialRpcPlan', 'createBundledRpc', 'Deno', 'console', code)(
    (fn) => { handler = fn; }, () => ({ rpc }), (x) => x, runTerritorialPipeline, resolveTerritorialRpcPlan, createBundledRpc,
    { env: { get: (k) => (k.startsWith('SUPABASE_') ? 'test' : null) } }, { log() {}, warn() {}, error() {} });
  return handler;
}
const call = async (comuni, nils, query) => (await handlerFor(comuni, nils)(new Request(`https://example.test/?${query}`))).json();

test('handler: Monza comune completo returns the whole comune whatever the sweep cut', async () => {
  const body = await call([monzaCut], [], 'lat=45.58&lng=9.27&radius=3&service=d2d&municipality=Monza&analysisLevel=comune&selectionScope=municipality');
  assert.equal(body.values.famiglie_stimate, 57702);
  assert.equal(body.values.volantini_consigliati, Math.round(57702 * 1.1));
  assert.equal(body.values.copertura_stimata, 100);
  assert.equal(body.comuni_breakdown[0].households_in_radius, 57702);
  assert.equal(body.comuni_breakdown[0].volantini_nel_raggio, Math.round(57702 * 1.1));
});

test('handler: multi with Milano, nil_breakdown matches comuni_breakdown', async () => {
  const body = await call([monzaCut], [nilCut, nilFull], 'lat=45.55&lng=9.2&radius=25&service=d2d&municipality=Monza&analysisLevel=comune&selectionScope=multi&selectedMunicipalityCodes=015146,108033');
  assert.equal(body.values.famiglie_stimate, 57702 + 10000 + 8000);
  const duomo = body.nil_breakdown.find((n) => n.nil_code === '1');
  assert.equal(duomo.households_in_radius, 10000);
  assert.equal(duomo.pct_copertura, 100);
});

test('handler: radius mode keeps the in-radius share', async () => {
  const body = await call([monzaCut, lissone], [], 'lat=45.58&lng=9.27&radius=3&service=d2d&selectionScope=radius');
  assert.equal(body.values.famiglie_stimate, Math.round(57702 * 0.6554 + 19000 * 0.4));
  assert.equal(body.comuni_breakdown.find((r) => r.comune_name === 'Monza').pct_copertura, 66);
});
