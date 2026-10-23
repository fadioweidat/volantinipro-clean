import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { resolveTerritorialRpcPlan } from '../supabase/functions/analysis-istat/resolveTerritorialRpcPlan.ts';
import { createBundledRpc } from '../supabase/functions/analysis-istat/bundledRpc.ts';

// Imports are stripped and injected: the real plan resolver and bundle adapter
// (0d7d99b), a controllable territorial pipeline and a recording rpc.
const source = readFileSync(new URL('../supabase/functions/analysis-istat/index.ts', import.meta.url), 'utf8');
const code = transformSync(source.replace(/^import .*;\r?\n/gm, ''), { loader: 'ts', format: 'esm' }).code;
function handlerFor(pipeline, rpc) {
  let handler;
  new Function('serve', 'createClient', 'sourceLabel', 'runTerritorialPipeline', 'resolveTerritorialRpcPlan', 'createBundledRpc', 'Deno', 'console', code)(
    fn => { handler = fn; }, () => ({ rpc }), x => x, pipeline, resolveTerritorialRpcPlan, createBundledRpc,
    { env: { get: key => key.startsWith('SUPABASE_') ? 'test' : null } }, { log() {}, warn() {}, error() {} });
  return handler;
}
const row = { nil_code: '1', nil_name: 'TEST', households_total: 100, population_total: 200, area_km2: 1 };
const result = () => ({ comuni: [], nilRows: [row], territorialRows: [row], analysisLevel: 'nil', nilUnavailable: false });
const request = (municipality, service = 'd2d') => new Request(`https://example.test/?lat=45.46&lng=9.19&radius=15&service=${service}` + (municipality ? '&municipality=Milano' : ''));
const bundle = omi => ({ data: { get_comuni_breakdown_in_radius: { data: [], error: null }, get_omi_zones_by_municipality: omi, get_nil_breakdown_in_radius: { data: [], error: null } }, error: null, status: 200 });

test('explicit municipality (d2d) starts OMI during territorial work, inside the single bundled call, and retains complete response', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const calls = [];
  const handler = handlerFor(async () => { calls.push('pipeline'); await gate; return result(); }, async (name, args) => {
    calls.push(name);
    assert.equal(args.p_municipality, 'Milano');
    return bundle({ data: [], error: null });
  });
  const pending = handler(request(true));
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  assert.deepEqual(calls, ['get_step2_territorial_bundle', 'pipeline']);
  release(); const response = await pending; const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.values.famiglie_stimate, 100); assert.equal(body.nil_breakdown.length, 1);
  assert.deepEqual(calls, ['get_step2_territorial_bundle', 'pipeline'], 'OMI reuses the bundle, no second database call');
});

test('explicit municipality outside d2d keeps the direct OMI RPC, started before the pipeline', async () => {
  const calls = [];
  const handler = handlerFor(async () => { calls.push('pipeline'); return result(); }, async (name, args) => {
    calls.push(name); assert.equal(args.p_municipality_name, 'Milano'); return { data: [], error: null };
  });
  await handler(request(true, 'h2h'));
  assert.deepEqual(calls, ['get_omi_zones_by_municipality', 'pipeline']);
});

test('OMI warnings retain their original position after territorial warnings', async () => {
  const handler = handlerFor(async ({ params }) => { params.warnings.push('territorial'); return result(); }, async () => bundle({ data: null, error: { message: 'unavailable' } }));
  const body = await (await handler(request(true))).json();
  assert.deepEqual(body.metadata.warnings, ['territorial', 'OMI_SPECIFIC_LOOKUP_UNAVAILABLE:unavailable']);
});

// A3 (2026-10-23): an OMI radius lookup in parallel with the pipeline was tried and rolled back
// (it slowed the territorial queries on the Free-tier database and was wasted for NIL analyses).
test('without explicit municipality OMI still waits for territorial resolution', async () => {
  const calls = [];
  const handler = handlerFor(async () => { calls.push('pipeline'); return result(); }, async name => { calls.push(name); return { data: [], error: null }; });
  await handler(request(false));
  assert.deepEqual(calls.slice(0, 1), ['pipeline']);
  assert.ok(!calls.includes('get_omi_zones_in_radius') || calls.indexOf('get_omi_zones_in_radius') > calls.indexOf('pipeline'));
  assert.ok(!calls.includes('get_step2_territorial_bundle'), 'no bundle without an explicit municipality');
});

test('omi=0 skips every OMI lookup and says so in metadata', async () => {
  const calls = [];
  const handler = handlerFor(async () => { calls.push('pipeline'); return result(); }, async name => { calls.push(name); return { data: [], error: null }; });
  const body = await (await handler(new Request('https://example.test/?lat=45.46&lng=9.19&radius=15&service=d2d&omi=0'))).json();
  assert.ok(!calls.some((c) => /omi/.test(c)), calls.join(','));
  assert.equal(body.metadata.omi_skipped, true);
  assert.equal(body.values.omi_zone_count, undefined);
});

test('no Mapbox call and no MAPBOX warning (the token answered 403 on every request)', async () => {
  const source = readFileSync(new URL('../supabase/functions/analysis-istat/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /mapbox/i);
});
