import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTraccarRequest as parse } from '../server/traccar/protocol.js';
import { createTraccarHandler } from '../api/gps/traccar.js';
import { registerDevice } from '../scripts/traccar-register.mjs';

const key = 'a'.repeat(64);
const query = `id=RAGAZZO01&lat=45.46&lon=9.19&timestamp=1792836000&speed=10&bearing=270&altitude=120&accuracy=8&batt=75&key=${key}`;
const get = (q = query) => ({ method: 'GET', url: `/api/gps/traccar?${q}`, headers: {} });
const json = () => ({ method: 'POST', url: `/api/gps/traccar?key=${key}`, headers: { 'content-type': 'application/json; charset=utf-8' }, body: {
  device_id: 'RAGAZZO01', location: { timestamp: '2026-10-24T10:00:00.000Z', coords: {
    latitude: 45.46, longitude: 9.19, speed: 2, heading: 90, accuracy: 5, altitude: 120,
  }, battery: { level: 0.75, is_charging: false } },
} });
function response() {
  return { headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, end(s) { this.body = JSON.parse(s); } };
}

test('OsmAnd GET: preserves coordinates/time and converts knots to m/s', () => {
  const fix = parse(get());
  assert.equal(fix.deviceId, 'RAGAZZO01');
  assert.equal(fix.point.lat, 45.46); assert.equal(fix.point.lng, 9.19);
  assert.equal(fix.point.recordedAt, new Date(1792836000 * 1000).toISOString());
  assert.equal(fix.point.speed, 10 * 1852 / 3600);
  assert.equal(fix.point.heading, 270); assert.equal(fix.point.altitude, 120);
  assert.equal(fix.point.batteryLevel, 75);
});
test('OsmAnd POST form and query params are both supported', () => {
  const form = { method: 'POST', url: `/api/gps/traccar?key=${key}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: query.replace(`&key=${key}`, '') };
  assert.deepEqual(parse(form), parse(get()));
  assert.deepEqual(parse({ ...get(), method: 'POST' }), parse(get()));
  assert.deepEqual(parse({ ...form, body: Object.fromEntries(new URLSearchParams(form.body)) }), parse(get()));
});
test('JSON units: speed already m/s, battery fraction becomes percent; no extra fields', () => {
  const req = json(); req.body.location.extras = { driver_id: 'forged', access_token: 'secret' };
  const fix = parse(req);
  assert.equal(fix.point.speed, 2); assert.equal(fix.point.batteryLevel, 75);
  assert.equal(fix.point.isCharging, false); assert.equal(fix.point.altitude, 120);
  assert.equal(fix.point.driver_id, undefined); assert.equal(fix.point.access_token, undefined);
});
test('JSON -1 sentinels are null; 0 is retained', () => {
  const req = json(); Object.assign(req.body.location.coords, { speed: -1, heading: -1, accuracy: -1 });
  req.body.location.battery.level = -1;
  const p = parse(req).point;
  for (const name of ['speed','heading','accuracy','batteryLevel']) assert.equal(p[name], null);
  Object.assign(req.body.location.coords, { speed: 0, heading: 0, accuracy: 0 });
  assert.equal(parse(req).point.speed, 0);
});
test('supports Unix milliseconds and ISO offsets without replacing fix time', () => {
  assert.equal(parse(get(query.replace('1792836000', '1792836000000'))).point.recordedAt, new Date(1792836000000).toISOString());
  const req = json(); req.body.location.timestamp = '2026-10-24T12:00:00+02:00';
  assert.equal(parse(req).point.recordedAt, '2026-10-24T10:00:00.000Z');
});
test('invalid coordinates, numbers, timestamps, duplicated/conflicting fields are rejected', () => {
  for (const q of [query.replace('lat=45.46','lat=91'), query.replace('lon=9.19','lon=-181'), query.replace('lat=45.46','lat=NaN'), query.replace('lat=45.46','lat='), query.replace('timestamp=1792836000','timestamp=bad'), query + '&id=OTHER', query + '&deviceid=OTHER', query.replace('accuracy=8','accuracy=-4')]) {
    assert.throws(() => parse(get(q)));
  }
  const req = json(); req.body.location.coords.latitude = true; assert.throws(() => parse(req));
});
test('invalid JSON, arrays, batches, oversized bodies and methods fail closed', () => {
  assert.throws(() => parse({ ...json(), body: '{' }));
  assert.throws(() => parse({ ...json(), body: [] }));
  const req = json(); req.body.location = [req.body.location]; assert.throws(() => parse(req));
  assert.throws(() => parse({ ...json(), body: ' '.repeat(17000) }), { status: 413 });
  assert.throws(() => parse({ ...get(), method: 'DELETE' }), { status: 405 });
});

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-secret-test-only', TRACCAR_BACKUP_ENABLED: 'true' };
test('endpoint sends only normalized allowlisted data and hashed credential to server RPC', async () => {
  const calls = []; const res = response();
  await createTraccarHandler({ env, fetchImpl: async (url,opts) => { calls.push({url,opts}); return { ok: true, json: async () => 'stored' }; } })(json(),res);
  assert.equal(res.code, 200); assert.deepEqual(res.body, { ok: true });
  assert.equal(calls.length, 1); assert.match(calls[0].url,/\/rpc\/traccar_ingest_point$/);
  const payload = JSON.parse(calls[0].opts.body);
  assert.equal(payload.p_speed, 2); assert.equal(payload.p_battery_level,75);
  assert.match(payload.p_token_hash,/^[a-f0-9]{64}$/); assert.notEqual(payload.p_token_hash,key);
  assert.equal(payload.p_session_id, undefined); assert.equal(payload.p_campaign_id,undefined);
  assert.ok(!calls[0].opts.body.includes(key)); assert.equal(res.headers['Cache-Control'],'no-store, private');
});
test('unknown/no secret, invalid and mocked fixes never reach database', async () => {
  let calls = 0; const handler = createTraccarHandler({ env, fetchImpl: async () => { calls++; } });
  for (const req of [get(query.replace(`&key=${key}`,'')),get(query + '&valid=false'),get(query + '&valid=0')]) {
    const res = response(); await handler(req,res); assert.equal(res.code,200);
  }
  const req = json(); req.body.location.mock = true;
  await handler(req,response()); assert.equal(calls,0);
});
test('valid requests always get 200, including duplicate/ignored and outage; safe logs only', async () => {
  const logs = [];
  for (const result of ['duplicate','ignored','stored']) {
    const res = response(); await createTraccarHandler({ env, fetchImpl: async () => ({ok:true,json:async()=>result}) })(get(),res);
    assert.equal(res.code,200);
  }
  for (const options of [ { env:{} }, {env,fetchImpl:async()=>({ok:false,status:500})}, {env,fetchImpl:async()=>{throw Error('secret coordinates');}} ]) {
    const res = response(); await createTraccarHandler({...options,log:s=>logs.push(s)})(get(),res);
    assert.equal(res.code,200); assert.equal(res.body.ok,false);
  }
  assert.ok(logs.every(s=>['traccar_backup_unavailable','traccar_backup_ingest_failed'].includes(s)));
});
test('malformed HTTP requests receive 400/405/413 without upstream call', async () => {
  const handler = createTraccarHandler({ fetchImpl:async()=>{throw Error('must not call');} });
  for (const [req,code] of [[get('id=X&lat=200'),400],[{...get(),method:'PUT'},405],[{...json(),body:' '.repeat(17000)},413]]) {
    const res = response(); await handler(req,res); assert.equal(res.code,code);
  }
});
test('registration binds the exact existing session device and writes only the new registry', async () => {
  const calls = [], out = [];
  await registerDevice({device:'RAGAZZO01',session:'00000000-0000-4000-8000-000000000001',server:'https://preview.example/api/gps/traccar',hours:2}, {
    env, output:s=>out.push(s), fetchImpl:async(url,opts)=>{
      calls.push({url,opts}); return opts.method==='POST' ? {ok:true,status:204} : {ok:true,status:200,json:async()=>[{assignment_id:'assignment',device_id:'correct-phone',status:'started'}]};
    },
  });
  assert.equal(calls.length,2); assert.match(calls[1].url,/traccar_devices\?on_conflict=device_id$/);
  const row = JSON.parse(calls[1].opts.body); assert.equal(row.vp_device_id,'correct-phone'); assert.equal(row.assignment_id,'assignment');
  assert.equal(row.enabled,true); assert.match(row.token_hash,/^[a-f0-9]{64}$/);
  assert.match(out.at(-1), /^https:\/\/preview.example\/api\/gps\/traccar\?key=[a-f0-9]{64}$/);
  assert.ok(!calls[1].opts.body.includes(new URL(out.at(-1)).searchParams.get('key')));
});
