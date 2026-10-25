import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createAdminGpsHistory, sessionZoneStatus, zoneStatusLabel } from '../src/lib/services/admin-gps-history-core.js';
import { calculateFilteredDistanceKm } from '../src/lib/gps/pointQuality.js';
const require = createRequire(new URL('./traccar/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261025110044_admin_gps_history_summary.sql');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db;
before(async()=> {
  db=new PGlite();
  await db.exec(read('tests/traccar/schema.sql'));
  await db.exec(`alter table delivery_sessions add created_at timestamptz default now();
    alter table operational_groups add name text;
    create function public.gps_is_admin() returns boolean language sql stable as $$
      select current_setting('request.jwt.claim.email',true)='admin@test.invalid' $$;`);
  await db.exec(migration);
  await db.exec(`select set_config('request.jwt.claim.sub','${id(1)}',false),set_config('request.jwt.claim.email','admin@test.invalid',false)`);
  await db.query("insert into campaigns(id,status,title,campaign_name) values($1,'archived','Nome campagna',null)",[id(1)]);
  await db.query("insert into operator_profiles(user_id,display_name) values($1,'Operatore reale')",[id(2)]);
  await db.query("insert into delivery_sessions(id,campaign_id,driver_id,status,updated_at) values($1,$2,$3,'completed','2026-10-20Z'),($4,$2,$3,'completed','2026-10-21Z')",[id(3),id(1),id(2),id(4)]);
  await db.query(`insert into gps_tracking_points(campaign_id,driver_id,session_id,lat,lng,accuracy,recorded_at)
    select $1,$2,$3,45.46,9.18+i*.000001,5,'2026-10-20T10:00Z'::timestamptz+i*interval '1 second' from generate_series(1,1775) i`,[id(1),id(2),id(3)]);
});
after(async()=>db?.close());
test('database counts all 1775 fixes, names and genuine zero; independent of REST max_rows',async()=>{
  await db.exec('set role authenticated');
  const {rows}=await db.query("select public.gps_admin_session_summaries('2026-09-01Z','2026-10-25T23:59:59Z','all_history') result");
  await db.exec('reset role');
  const result=rows[0].result.rows;
  assert.equal(result.length,2);const nonempty=result.find(r=>r.point_count);
  assert.equal(nonempty.point_count,1775);assert.equal(nonempty.campaignName,'Nome campagna');
  assert.equal(nonempty.session.driver_name,'Operatore reale');assert.equal(result.find(r=>!r.point_count).km,0);
  const points=(await db.query('select * from gps_tracking_points order by recorded_at,id')).rows;
  assert.equal(Number(nonempty.km),calculateFilteredDistanceKm(points));
});
test('database filters dates/status and rejects malformed request',async()=>{
  for (const [from,to,status,count] of [ ['2026-10-21Z',null,'completed',1],[null,null,'started',0]]) {
    const r=(await db.query('select public.gps_admin_session_summaries($1,$2,$3) result',[from,to,status])).rows[0].result;
    assert.equal(r.rows.length,count);
  }
  await assert.rejects(db.query("select public.gps_admin_session_summaries(null,null,'oops')"),/Invalid session status/);
});
test('non-admin and anon cannot retrieve summaries or invoke private stats',async()=>{
  await db.exec("select set_config('request.jwt.claim.email','customer@test.invalid',false);set role authenticated");
  await assert.rejects(db.query('select public.gps_admin_session_summaries()'),/Admin required/);
  await assert.rejects(db.query('select gps_monitor_private.session_stats($1)',[id(3)]),/permission denied/);
  await db.exec('reset role;set role anon');
  await assert.rejects(db.query('select public.gps_admin_session_summaries()'),/permission denied/);
  await db.exec("reset role;select set_config('request.jwt.claim.email','admin@test.invalid',false)");
});
test('SQL kilometers match last-valid JS filtering through anomalous fixes',async()=>{
  const points=[ [45,9,5,0],[45,9.0001,5,1],[0,0,5,2],[45,9.0002,101,3],
    [85,90,5,4],[45,9.0003,5,5],[45,9.0003,5,5],[45,9.0004,5,6] ];
  for (const [lat,lng,accuracy,sec] of points) await db.query("insert into gps_tracking_points(campaign_id,driver_id,session_id,lat,lng,accuracy,recorded_at) values($1,$2,$3,$4,$5,$6,'2026-10-21T10:00Z'::timestamptz+$7*interval '1 second')",[id(1),id(2),id(4),lat,lng,accuracy,sec]);
  const fixes=(await db.query('select * from gps_tracking_points where session_id=$1 order by recorded_at,id',[id(4)])).rows;
  const stats=(await db.query('select gps_monitor_private.session_stats($1) result',[id(4)])).rows[0].result;
  assert.equal(Number(stats.km),calculateFilteredDistanceKm(fixes));assert.equal(stats.point_count,8);assert.equal(stats.valid_count,4);
});
function fakeClient(points, failOffset=null) {
  const calls=[];return {calls,from(table){let offset,limit;const call={table,orders:[]};calls.push(call);
    const q={select(){return q},eq(key,value){call[key]=value;return q},order(key,options){call.orders.push([key,options]);return q},
      lte(key,value){call.bound=[key,value];return q},range(a,b){offset=a;limit=b-a+1;call.range=[a,b];return q},abortSignal(){return q},
      then(resolve){return Promise.resolve(offset===failOffset?{error:{message:'database failed'}}:{data:points.slice(offset,offset+limit)}).then(resolve)}};return q;
  }};
}
test('selected-session trace paginates >1000, same timestamps, deterministic ordering',async()=>{
  const points=Array.from({length:1775},(_,i)=>({id:String(i),session_id:'selected'}));
  const client=fakeClient(points);const result=await createAdminGpsHistory(client).trace('selected',{expectedCount:1775,lastPointAt:'2026-10-20Z'});
  assert.equal(result.length,1775);assert.equal(client.calls.length,4);
  for (const call of client.calls) {assert.equal(call.session_id,'selected');assert.deepEqual(call.orders.map(x=>x[0]),['recorded_at','id']);}
});
test('errors, incomplete pages and duplicate/racing data never turn into zero',async()=>{
  const points=Array.from({length:600},(_,i)=>({id:String(i),session_id:'s'}));
  await assert.rejects(createAdminGpsHistory(fakeClient(points,500)).trace('s'),/database failed/);
  await assert.rejects(createAdminGpsHistory(fakeClient(points)).trace('s',{expectedCount:700}),/non completa/);
  points[599].id=points[0].id;
  await assert.rejects(createAdminGpsHistory(fakeClient(points)).trace('s'),/modificata/);
  await assert.rejects(createAdminGpsHistory({rpc:async()=>({error:{message:'denied'}})}).summaries(),/denied/);
});
test('terminal session never displays waiting for GPS, with or without coordinates',()=>{
  for (const status of ['completed','cancelled']) {
    const value=sessionZoneStatus({status},'awaiting_gps');assert.equal(value,'session_ended');
    assert.equal(zoneStatusLabel(value,{}),'Sessione conclusa');
  }
  assert.equal(sessionZoneStatus({status:'started'},'awaiting_gps'),'awaiting_gps');
});

// 2026-10-25: www must keep working between the frontend release and the migration.
test('missing RPC (not installed): previous reading in the summary shape; other errors stay errors', async () => {
  const { isMissingRpcError, legacyRowsToSummaries } = await import('../src/lib/services/admin-gps-history-core.js');
  const rpcError = (error) => ({ rpc: () => ({ abortSignal() { return this; }, then: (ok) => ok({ data: null, error }) }) });
  const legacy = async () => [{ session: { id: 's1', group_id: 'g' }, group: { name: 'Gruppo' }, latest: { lat: 45, lng: 9 },
    points: [{ recorded_at: '2026-10-20T10:00:00Z', lat: 45.46, lng: 9.18, accuracy: 5 }, { recorded_at: '2026-10-20T10:01:00Z', lat: 45.461, lng: 9.18, accuracy: 5 }] }];
  const missing = createAdminGpsHistory(rpcError({ code: 'PGRST202', message: 'Could not find the function public.gps_admin_session_summaries' }), async () => {}, { legacySummaries: legacy });
  const rows = await missing.summaries();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pointCount, 2);
  assert.equal(rows[0].legacySummary, true);
  assert.equal(rows[0].first_point_at, '2026-10-20T10:00:00Z');
  assert.equal(rows[0].last_point_at, '2026-10-20T10:01:00Z');
  assert.equal(rows[0].groupName, 'Gruppo');
  assert.deepEqual(rows[0].points, []);
  assert.ok(isMissingRpcError({ code: '42883', message: 'function x does not exist' }));
  assert.ok(!isMissingRpcError({ code: '42501', message: 'permission denied' }));
  const denied = createAdminGpsHistory(rpcError({ code: '42501', message: 'ADMIN_NON_AUTORIZZATO' }), async () => {}, { legacySummaries: legacy });
  await assert.rejects(denied.summaries(), /Riepilogo GPS non disponibile: ADMIN_NON_AUTORIZZATO/);
  const noFallback = createAdminGpsHistory(rpcError({ code: 'PGRST202', message: 'missing' }));
  await assert.rejects(noFallback.summaries(), /Riepilogo GPS non disponibile/);
  assert.equal(legacyRowsToSummaries([{ session: { id: 'x' }, points: [] }])[0].pointCount, 0);
  const page = read('src/pages/admin/AdminLiveDashboard.jsx');
  assert.match(page, /expectedCount: selectedSummary\.legacySummary \? null : selectedSummary\.pointCount,/);
  assert.match(page, /Riepilogo dalla lettura precedente/);
  assert.match(read('src/lib/services/admin-gps-history.js'), /legacySummaries: \(\) => getLiveDrivers\(\)/);
});
