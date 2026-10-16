import test from 'node:test';
import assert from 'node:assert/strict';
import { runTerritorialPipeline } from '../supabase/functions/analysis-istat/resolveTerritorialRpcPlan.ts';

const params = { service: 'd2d', lat: 45.46, lng: 9.19, radiusKm: 15, specificMunicipality: 'Milano', requestedAnalysisLevel: 'nil', selectionScope: 'municipality', selectedMunicipalityCodes: '015146' };
const ok = data => ({ data, error: null });
test('known Milano starts NIL before comuni finishes and invokes each once', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const calls = [];
  const result = runTerritorialPipeline({ params: { ...params }, queryComuni: async () => { calls.push('comuni'); await gate; return ok([]); }, queryNils: async () => { calls.push('nil'); return ok([]); } });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls, ['comuni', 'nil']); release();
  const resolved = await result;
  assert.equal(resolved.rpcPlan.shouldQueryNil, true);
  assert.deepEqual(calls, ['comuni', 'nil']);
});
test('unknown radius waits for comuni to establish Milano intersection', async () => {
  const calls = [];
  await runTerritorialPipeline({ params: { service: 'd2d', lat: 45.46, lng: 9.19, radiusKm: 3 }, queryComuni: async () => { calls.push('comuni'); return ok([{ municipality_code: '015146', comune_name: 'Milano' }]); }, queryNils: async () => { calls.push('nil'); return ok([]); } });
  assert.deepEqual(calls, ['comuni', 'nil']);
});
test('non Milano multi selection does not request NIL', async () => {
  let calls = 0;
  await runTerritorialPipeline({ params: { ...params, selectionScope: 'multi', selectedMunicipalityCodes: '015086' }, queryComuni: async () => ok([]), queryNils: async () => { calls++; return ok([]); } });
  assert.equal(calls, 0);
});
test('prefetch rejection is handled and propagates the original failure', async () => {
  const error = new Error('NIL failure');
  await assert.rejects(runTerritorialPipeline({ params: { ...params }, queryComuni: async () => ok([]), queryNils: async () => { throw error; } }), e => e === error);
});
