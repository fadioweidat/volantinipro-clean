import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(process.env.PV_SUBMIT_SOURCE || new URL('../supabase/functions/submit-campaign-request/index.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source.replace(/^import .*;\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function submit(zones) {
  const writes = [];
  let handler;
  const client = {
    auth: { getUser: async () => ({ data: {}, error: null }) },
    from(table) {
      const query = {
        insert(rows) { writes.push({ table, rows }); return query; },
        select() { return query; }, eq() { return query; },
        gte() { return query; }, order() { return query; }, limit() { return query; },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: { id: 'qa-campaign' }, error: null }),
        then(resolve) { resolve({ error: null }); },
      };
      return query;
    },
  };
  vm.runInNewContext(js, {
    serve: (fn) => { handler = fn; }, createClient: () => client,
    Deno: { env: { get: () => 'test-value' } },
    Request, Response, TextEncoder, crypto: webcrypto,
    console: { error() {} },
  });
  const response = await handler(new Request('https://example.invalid/submit', {
    method: 'POST', body: JSON.stringify({
      client_name: 'TEST', client_email: 'qa@example.invalid',
      quantity: 20000, total_amount: 770, campaignZones: zones,
    }),
  }));
  return { response, writes };
}

const polygon = { type: 'Polygon', coordinates: [[[9, 45], [9.1, 45], [9, 45.1], [9, 45]]] };

test('materializes each submitted territory without dropping or stringifying its polygon', async () => {
  const { response, writes } = await submit([
    { municipality: 'Monza', quantity: 10000, lat: 45.584, lng: 9.274, polygon_geojson: polygon },
    { municipality: 'DUOMO', quantity: 10000, lat: 45.464, lng: 9.189, polygon_geojson: JSON.stringify(polygon), radius_m: 2000, address_label: 'Punto vendita Milano' },
  ]);
  assert.equal(response.status, 200);
  const rows = writes.find((write) => write.table === 'campaign_zones').rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0].polygon_geojson)), polygon);
  assert.deepEqual(JSON.parse(JSON.stringify(rows[1].polygon_geojson)), polygon);
  assert.equal(rows[0].radius_m, null);
  assert.equal(rows[1].radius_m, 2000);
  assert.equal(rows[1].address_label, 'Punto vendita Milano');
  assert.equal(rows[1].zone_name, 'DUOMO');
  assert.equal(rows[0].campaign_id, 'qa-campaign');
  assert.equal(rows[0].quantity_assigned + rows[1].quantity_assigned, 20000);
});

test('legacy zone without geometry still saves with explicit null geometry', async () => {
  const { response, writes } = await submit([{ municipality: 'Monza', quantity: 20000, lat: 45.584, lng: 9.274 }]);
  assert.equal(response.status, 200);
  const row = writes.find((write) => write.table === 'campaign_zones').rows[0];
  assert.equal(row.polygon_geojson, null);
  assert.equal(row.radius_m, null);
});

test('malformed serialized geometry cannot produce a successful incomplete campaign', async () => {
  const { response, writes } = await submit([{ municipality: 'Monza', quantity: 20000, polygon_geojson: '{invalid' }]);
  assert.equal(response.status, 500);
  assert.equal(writes.length, 0);
});
