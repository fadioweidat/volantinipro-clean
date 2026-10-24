// Real PostgreSQL engine (PGlite/WASM), isolated and disposable. This exercises
// the migration and PL/pgSQL, not a JavaScript imitation of the policy.
// Install test-only dependency: npm ci --prefix tests/traccar
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { before, beforeEach, after } from 'node:test';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createTraccarHandler } from '../api/gps/traccar.js';

const require = createRequire(new URL('./traccar/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const migration = read('supabase/migrations/20261024102649_traccar_backup_ingest.sql');
// Reuse the existing canonical authorization helper without changing it.
const baseline = read('supabase/migrations/20260829170000_driver_group_access_model.sql');
const start = baseline.indexOf('create or replace function public.gps_assignment_is_valid_v2(');
const helper = baseline.slice(start, baseline.indexOf('$$;', start) + 3);
const ids = Array.from({length:10}, (_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const [op,campaign,group,assignment,session,secondCampaign,secondGroup,secondAssignment,secondSession] = ids;
const secret = 'a'.repeat(64), hash = createHash('sha256').update(secret).digest('hex');
let db;
before(async()=> {
  db = new PGlite();
  await db.exec(read('tests/traccar/schema.sql'));
  await db.exec(helper);
  await db.exec(migration);
});
after(async()=> { await db?.close(); });
beforeEach(async()=> {
  await db.exec('truncate public.traccar_devices,public.gps_tracking_points,public.delivery_sessions,public.operator_assignments,public.operational_groups,public.campaigns,public.operator_profiles cascade');
  await db.query('insert into operator_profiles(user_id) values($1)',[op]);
  await db.query("insert into campaigns(id,status) values($1,'in_progress')",[campaign]);
  await db.query('insert into operational_groups(id,campaign_id) values($1,$2)',[group,campaign]);
  await db.query("insert into operator_assignments(id,operator_id,campaign_id,group_id,starts_at,ends_at) values($1,$2,$3,$4,now()-interval '1 hour',now()+interval '1 hour')",[assignment,op,campaign,group]);
  await db.query("insert into delivery_sessions(id,campaign_id,group_id,assignment_id,driver_id,device_id,status,started_at,updated_at) values($1,$2,$3,$4,$5,'vp-phone-1','started',now()-interval '15 minutes',now()-interval '10 minutes')",[session,campaign,group,assignment,op]);
  await db.query("insert into traccar_devices(device_id,token_hash,operator_id,vp_device_id,enabled,enabled_from,enabled_until) values('RAGAZZO01',$1,$2,'vp-phone-1',true,now()-interval '1 hour',now()+interval '1 hour')",[hash,op]);
});
async function ingest(overrides={}) {
  const p = { device:'RAGAZZO01', hash, time:new Date(Date.now()-1000).toISOString(), lat:45.46, lng:9.19, accuracy:7, speed:1.5, heading:90, altitude:120, battery:75, charge:false, ...overrides };
  const result = await db.query('select public.traccar_ingest_point($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as status',Object.values(p));
  return result.rows[0].status;
}
async function pointCount() { return (await db.query("select count(*)::int as n from gps_tracking_points where source='traccar'")).rows[0].n; }

test('migration installs RLS and only service_role can execute or read the mapping',async()=> {
  assert.equal((await db.query("select relrowsecurity as enabled from pg_class where oid='public.traccar_devices'::regclass")).rows[0].enabled,true);
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(()=>ingest(), /permission denied/);
    await assert.rejects(()=>db.query('select * from traccar_devices'), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.equal(await ingest(),'stored');
  await db.exec('reset role');
});
test('writes the same canonical table, exact raw coordinates/time and correct identity/session',async()=> {
  const time = new Date(Date.now()-2000).toISOString();
  const before = (await db.query('select row_to_json(s) as value from delivery_sessions s')).rows;
  assert.equal(await ingest({time}),'stored');
  const p = (await db.query("select * from gps_tracking_points where source='traccar'")).rows[0];
  assert.equal(p.session_id,session); assert.equal(p.campaign_id,campaign); assert.equal(p.driver_id,op);
  assert.equal(p.lat,45.46); assert.equal(p.lng,9.19); assert.equal(p.recorded_at.toISOString(),time);
  assert.equal(p.accuracy,7); assert.equal(p.speed,1.5); assert.equal(p.heading,90);
  assert.deepEqual(p.source_metadata,{altitude:120,battery_level:75,is_charging:false});
  assert.deepEqual((await db.query('select row_to_json(s) as value from delivery_sessions s')).rows,before);
});
test('repeated submissions queued by the isolated engine insert one point only',async()=> {
  const p={time:new Date(Date.now()-1000).toISOString()};
  const results=await Promise.all(Array.from({length:8},()=>ingest(p)));
  assert.equal(results.filter(s=>s==='stored').length,1); assert.equal(await pointCount(),1);
  assert.equal(await ingest(p),'duplicate');
});
test('unknown Device ID, wrong secret or disabled registry writes nothing',async()=> {
  assert.equal(await ingest({device:'UNKNOWN'}),'ignored'); assert.equal(await ingest({hash:'b'.repeat(64)}),'ignored');
  await db.exec('update traccar_devices set enabled=false'); assert.equal(await ingest(),'ignored');
  assert.equal(await pointCount(),0);
});
test('no active session, pause, complete and cancellation write nothing',async()=> {
  for (const status of ['paused','completed','cancelled']) {
    await db.query('update delivery_sessions set status=$1',[status]); assert.equal(await ingest(),'ignored');
  }
  await db.exec('delete from delivery_sessions'); assert.equal(await ingest(),'ignored'); assert.equal(await pointCount(),0);
});
test('inactive/revoked/expired/future assignment, disabled operator and stopped campaign are rejected',async()=> {
  for (const change of ["status='completed'","status='revoked',revoked_at=now()","ends_at=now()-interval '1 second'","starts_at=now()+interval '1 hour'"]) {
    await db.exec(`update operator_assignments set ${change}`); assert.equal(await ingest(),'ignored');
    await db.exec("update operator_assignments set status='active',revoked_at=null,starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour'");
  }
  await db.exec('update operator_profiles set active=false'); assert.equal(await ingest(),'ignored');
  await db.exec('update operator_profiles set active=true,disabled_at=now()'); assert.equal(await ingest(),'ignored');
  await db.exec('update operator_profiles set disabled_at=null'); await db.exec("update campaigns set status='completed'");
  assert.equal(await ingest(),'ignored'); assert.equal(await pointCount(),0);
});
test('assignment must be valid at fix time as well as receipt time',async()=> {
  await db.exec("update operator_assignments set starts_at=now()-interval '30 seconds'");
  assert.equal(await ingest({time:new Date(Date.now()-60000).toISOString()}),'ignored');
});
test('stale/future fixes and pre-start or pre-resume buffered fixes are rejected',async()=> {
  for (const delta of [-301000,61000]) assert.equal(await ingest({time:new Date(Date.now()+delta).toISOString()}),'ignored');
  await db.exec("update delivery_sessions set started_at=now()-interval '30 seconds',updated_at=now()-interval '30 seconds'");
  assert.equal(await ingest({time:new Date(Date.now()-60000).toISOString()}),'ignored');
  await db.exec("update delivery_sessions set started_at=now()-interval '15 minutes',updated_at=now()-interval '10 seconds'");
  assert.equal(await ingest({time:new Date(Date.now()-20000).toISOString()}),'ignored');
  assert.equal(await ingest(),'stored');
});
test('bounded enabled shift rejects out-of-duty fixes and stale started sessions',async()=> {
  await db.exec("update traccar_devices set enabled_from=now()-interval '2 hours',enabled_until=now()-interval '1 hour'");
  assert.equal(await ingest(),'ignored');
  await db.exec("update traccar_devices set enabled_from=now()+interval '1 hour',enabled_until=now()+interval '2 hours'");
  assert.equal(await ingest(),'ignored');
  await assert.rejects(()=>db.exec("update traccar_devices set enabled_from=now(),enabled_until=now()+interval '25 hours'"), /traccar_finite_shift/);
});
test('phone mismatch and driver/campaign/group mismatches are rejected',async()=> {
  await db.exec("update delivery_sessions set device_id='another-phone'"); assert.equal(await ingest(),'ignored');
  await db.exec("update delivery_sessions set device_id='vp-phone-1'");
  await db.query("insert into campaigns(id,status) values($1,'in_progress')",[secondCampaign]);
  await db.query('update delivery_sessions set campaign_id=$1',[secondCampaign]); assert.equal(await ingest(),'ignored');
  await db.query('update delivery_sessions set campaign_id=$1',[campaign]);
  await db.query('update delivery_sessions set driver_id=$1',[assignment]); assert.equal(await ingest(),'ignored');
  await db.query('update delivery_sessions set driver_id=$1,group_id=null',[op]); assert.equal(await ingest(),'ignored');
});
test('another participant phone in the same assignment does not receive this device fixes',async()=> {
  await db.query("insert into delivery_sessions(id,campaign_id,group_id,assignment_id,driver_id,device_id,status,started_at,updated_at) values($1,$2,$3,$4,$5,'vp-phone-2','started',now()-interval '15 minutes',now()-interval '10 minutes')",[secondSession,campaign,group,assignment,op]);
  assert.equal(await ingest(),'stored');
  assert.equal((await db.query("select session_id from gps_tracking_points where source='traccar'")).rows[0].session_id,session);
});
test('group participant with no account uses assignment identity, not another operator',async()=> {
  await db.exec('update operator_assignments set operator_id=null');
  await db.query('update delivery_sessions set driver_id=$1',[assignment]);
  await db.query('update traccar_devices set operator_id=null,assignment_id=$1',[assignment]);
  assert.equal(await ingest(),'stored'); assert.equal((await db.query('select driver_id from gps_tracking_points')).rows[0].driver_id,assignment);
});
test('two active jobs for the same operator/phone are ambiguous; exact assignment opt-in disambiguates',async()=> {
  await db.query("insert into campaigns(id,status) values($1,'in_progress')",[secondCampaign]);
  await db.query('insert into operational_groups(id,campaign_id) values($1,$2)',[secondGroup,secondCampaign]);
  await db.query("insert into operator_assignments(id,operator_id,campaign_id,group_id,starts_at) values($1,$2,$3,$4,now()-interval '1 hour')",[secondAssignment,op,secondCampaign,secondGroup]);
  await db.query("insert into delivery_sessions(id,campaign_id,group_id,assignment_id,driver_id,device_id,status,started_at,updated_at) values($1,$2,$3,$4,$5,'vp-phone-1','started',now()-interval '15 minutes',now()-interval '10 minutes')",[secondSession,secondCampaign,secondGroup,secondAssignment,op]);
  assert.equal(await ingest(),'ignored'); assert.equal(await pointCount(),0);
  await db.query('update traccar_devices set operator_id=null,assignment_id=$1',[assignment]);
  assert.equal(await ingest(),'stored');
});
test('SQL independently rejects invalid/NaN/Infinity telemetry and high rate',async()=> {
  for (const invalid of [{lat:91},{lng:-181},{lat:'NaN'},{accuracy:'NaN'},{speed:'Infinity'},{altitude:'-Infinity'},{battery:101},{heading:361},{time:'infinity'}]) {
    assert.equal(await ingest(invalid),'ignored');
  }
  assert.equal(await pointCount(),0);
  await db.exec('update traccar_devices set rate_count=120,rate_window_started_at=now()');
  assert.equal(await ingest(),'ignored');
});
test('existing app insert contract still works with nullable new columns',async()=> {
  await db.query('insert into gps_tracking_points(campaign_id,session_id,driver_id,lat,lng,recorded_at) values($1,$2,$3,45.5,9.2,now())',[campaign,session,op]);
  assert.equal((await db.query('select source from gps_tracking_points')).rows[0].source,null);
  assert.equal(await ingest(),'stored'); assert.equal((await db.query('select count(*)::int as n from gps_tracking_points')).rows[0].n,2);
});

test('HTTP runtime → handler → real SQL → same table: formats, duplicate, pause and privacy',async()=> {
  const env={ SUPABASE_URL:'https://local.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-test-key',TRACCAR_BACKUP_ENABLED:'true' };
  const handler=createTraccarHandler({env,fetchImpl:async(url,opts)=>{
    assert.equal(url,'https://local.invalid/rest/v1/rpc/traccar_ingest_point');
    const p=JSON.parse(opts.body);
    await db.exec('set role service_role');
    try {
      const result=await db.query('select public.traccar_ingest_point($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as status',Object.values(p));
      return {ok:true,json:async()=>result.rows[0].status};
    } finally { await db.exec('reset role'); }
  }});
  const server=createServer(async(req,res)=>{
    let raw=''; for await (const chunk of req) raw+=chunk;
    req.body=raw || undefined;
    res.status=function(n){this.statusCode=n;return this;};
    await handler(req,res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}/api/gps/traccar`;
    const time=new Date(Date.now()-1000).toISOString();
    const q=new URLSearchParams({id:'RAGAZZO01',lat:'45.46',lon:'9.19',timestamp:time,speed:'10',key:secret});
    assert.equal((await fetch(`${base}?${q}`)).status,200); assert.equal(await pointCount(),1);
    assert.equal((await fetch(`${base}?${q}`)).status,200); assert.equal(await pointCount(),1);
    const payload={device_id:'RAGAZZO01',location:{timestamp:new Date(Date.now()).toISOString(),coords:{latitude:45.461,longitude:9.191,speed:1.25,accuracy:5}}};
    assert.equal((await fetch(`${base}?key=${secret}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})).status,200);
    assert.equal(await pointCount(),2);
    await db.exec("update delivery_sessions set status='paused'");
    payload.location.coords.latitude=45.462;
    assert.equal((await fetch(`${base}?key=${secret}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})).status,200);
    assert.equal(await pointCount(),2);
    q.set('id','UNKNOWN'); assert.equal((await fetch(`${base}?${q}`)).status,200); assert.equal(await pointCount(),2);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
