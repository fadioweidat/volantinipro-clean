import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../supabase/functions/analysis-istat/index.ts', import.meta.url), 'utf8');
const code = transformSync(source.replace(/^import .*;\r?\n/gm, ''), { loader: 'ts', format: 'esm' }).code;
function handlerFor(pipeline, rpc) {
  let handler;
  new Function('serve', 'createClient', 'sourceLabel', 'runTerritorialPipeline', 'Deno', 'console', code)(fn => { handler = fn; }, () => ({ rpc }), x => x, pipeline, { env: { get: key => key.startsWith('SUPABASE_') ? 'test' : null } }, { log() {} });
  return handler;
}
const row = { nil_code: '1', nil_name: 'TEST', households_total: 100, population_total: 200, area_km2: 1 };
const result = () => ({ comuni: [], nilRows: [row], territorialRows: [row], analysisLevel: 'nil', nilUnavailable: false });
const request = municipality => new Request('https://example.test/?lat=45.46&lng=9.19&radius=15&service=d2d' + (municipality ? '&municipality=Milano' : ''));
test('explicit municipality starts OMI during territorial work and retains complete response', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const calls = [];
  const handler = handlerFor(async () => { calls.push('pipeline'); await gate; return result(); }, async (name, args) => { calls.push(name); assert.equal(args.p_municipality_name, 'Milano'); return { data: [], error: null }; });
  const pending = handler(request(true));
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls, ['get_omi_zones_by_municipality', 'pipeline']);
  release(); const response = await pending; const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.values.famiglie_stimate, 100); assert.equal(body.nil_breakdown.length, 1);
});
test('OMI warnings retain their original position after territorial warnings', async () => {
  const handler = handlerFor(async ({params}) => { params.warnings.push('territorial'); return result(); }, async () => ({ data: null, error: { message: 'unavailable' } }));
  const body = await (await handler(request(true))).json();
  assert.deepEqual(body.metadata.warnings, ['territorial', 'OMI_SPECIFIC_LOOKUP_UNAVAILABLE:unavailable']);
});
test('without explicit municipality OMI still waits for territorial resolution', async () => {
  const calls = [];
  const handler = handlerFor(async () => { calls.push('pipeline'); return result(); }, async name => { calls.push(name); return { data: [], error: null }; });
  await handler(request(false));
  assert.deepEqual(calls, ['pipeline', 'get_omi_zones_by_municipality']);
});
