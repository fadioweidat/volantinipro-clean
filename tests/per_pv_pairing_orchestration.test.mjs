import test from 'node:test';
import assert from 'node:assert/strict';
import {createPairingCoordinator,provisionalRequest} from '../src/lib/step3/perPvPairingCoordinator.js';
import {buildPairingContext,calculateCampaignPairing} from '../src/lib/step3/perPvSmartPairing.js';
const clock=()=>Date.parse('2099-01-01T12:00:00Z');
const options={service:'d2d',period:{start:'2099-01-01',end:'2099-01-31'},mappingPolicyVersion:'test-v1'};
const pv=id=>({id,searchMode:'municipality',city:{name:'Milano',lat:45.46,lng:9.19},selectedComuni:[{name:'Milano'}],finalFlyers:5959});
const payload=(type='same')=>({source:'campaign_capacity',availableDates:[{date:'2099-01-06',placesAvailable:1}],smartPairingSlots:type?[{date:'2099-01-06',type,discountPercent:type==='same'?40:20,placesAvailable:1,source:'campaign_capacity'}]:[]});
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('1, 2 and 5 PV have independent provisional responses, never economic verification',async()=>{
 for(const n of [1,2,5]){
  const zones=Array.from({length:n},(_,i)=>pv('pv'+i));const c=createPairingCoordinator({request:async(_,meta)=>payload(meta.pvId==='pv1'?null:'same'),clock});
  c.sync(zones,options);await tick();await tick();const {states,contexts}=c.snapshot();
  assert.equal(Object.keys(states).length,n);assert.equal(states.pv0.transportStatus,'match');assert.ok(Object.values(states).every(s=>!s.verified&&s.slots.length===0));
  const r=calculateCampaignPairing({campaignZones:zones,basePrices:zones.map(z=>({id:z.id,distributionPrice:236.85})),states,contexts,generations:Object.fromEntries(Object.entries(states).map(([id,s])=>[id,s.generation])),selectedDatesByPv:Object.fromEntries(zones.map(z=>[z.id,['2099-01-06']])),now:clock()});assert.equal(r.discount,0);c.dispose();
 }
});
test('configurable concurrency, cancellation and deletion 2 to 1 / 5 to 4 reject late results',async()=>{
 for(const n of [2,5]){
  const requests=[];const c=createPairingCoordinator({request:(_,meta)=>{const d=deferred();requests.push({...d,...meta});return d.promise;},concurrency:2,clock});
  const zones=Array.from({length:n},(_,i)=>pv('pv'+i));c.sync(zones,options);await tick();assert.equal(requests.length,2);
  c.sync(zones.filter(z=>z.id!=='pv1'),options);assert.equal(requests[1].signal.aborted,true);
  requests[1].resolve(payload());requests[0].resolve(payload());await tick();await tick();assert.ok(!c.snapshot().states.pv1);
  for(const r of requests)r.resolve(payload());await tick();c.dispose();
 }
});
test('reorder does not refetch or transfer ownership; active PV is irrelevant',async()=>{
 let calls=0;const c=createPairingCoordinator({request:async()=>{calls++;return payload();},clock});const zones=[pv('a'),pv('b')];c.sync(zones,options);await tick();const before=c.snapshot().states;
 c.sync([...zones].reverse(),options);await tick();assert.equal(calls,2);assert.deepEqual(c.snapshot().states,before);c.dispose();
});
test('territory/period change aborts and rejects old-generation response',async()=>{
 const requests=[];const c=createPairingCoordinator({request:(_,meta)=>{const d=deferred();requests.push({...d,...meta});return d.promise;},clock});
 c.sync([pv('a')],options);await tick();const changed={...pv('a'),city:{name:'Monza',lat:45.58,lng:9.27},selectedComuni:[{name:'Monza'}]};
 c.sync([changed],{...options,period:{start:'2099-01-02',end:'2099-01-31'}});await tick();assert.equal(requests[0].signal.aborted,true);
 requests[0].resolve(payload('same'));await tick();assert.equal(c.snapshot().states.a.status,'loading');requests[1].resolve(payload('nearby'));await tick();await tick();assert.equal(c.snapshot().states.a.generation,2);assert.equal(c.snapshot().states.a.provisionalSlots[0].type,'nearby');c.dispose();
});
test('partial failure and per-PV retry leave other responses intact',async()=>{
 let attempts=0;const c=createPairingCoordinator({request:async(_,meta)=>{if(meta.pvId==='b'&&attempts++===0)throw Error('API_ERROR');return payload();},clock});c.sync([pv('a'),pv('b')],options);await tick();await tick();assert.equal(c.snapshot().states.b.status,'error');const a=c.snapshot().states.a;c.retry('b');await tick();await tick();assert.deepEqual(c.snapshot().states.a,a);assert.equal(c.snapshot().states.b.status,'unavailable');c.dispose();
});
test('refresh ignores persisted/global slots; no state hydration API; multiple preferences cannot create discounts',async()=>{
 const old={...pv('a'),smartPairingSlots:payload().smartPairingSlots,smartPairingSelectedDates:['2099-01-06','2099-01-07']};const d=deferred();const c=createPairingCoordinator({request:()=>d.promise,clock});c.sync([old],options);assert.equal(c.snapshot().states.a.status,'loading');assert.deepEqual(c.snapshot().states.a.slots,[]);d.resolve(payload());await tick();c.skip();assert.equal(c.snapshot().states.a.status,'skipped');assert.deepEqual(c.snapshot().states.a.provisionalSlots,[]);c.dispose();
});
test('missing coordinates omitted, multi-territory request unavailable, no fabricated match',()=>{
 const z={...pv('a'),city:{name:'Milano',lat:null,lng:null}};const context=buildPairingContext(z,options);const body=provisionalRequest(z,context);assert.ok(!('lat'in body));assert.ok(!('lng'in body));
 const multi={...pv('a'),selectedComuni:[{name:'Milano'},{name:'Monza'}]};assert.equal(provisionalRequest(multi,buildPairingContext(multi,options)),null);
 const c=createPairingCoordinator({request:()=>{throw Error('must not call');},clock});c.sync([multi],options);assert.equal(c.snapshot().states.a.status,'unavailable');c.dispose();
});
test('expired provisional observations become stale, dispose cancels pending requests',async()=>{
 const c=createPairingCoordinator({request:async()=>payload(),clock,maxAgeMs:5});c.sync([pv('a')],options);await new Promise(r=>setTimeout(r,20));assert.equal(c.snapshot().states.a.status,'stale');assert.deepEqual(c.snapshot().states.a.preferredAvailabilityDates,[]);c.dispose();
 let signal;const d=deferred();const pending=createPairingCoordinator({request:(_,meta)=>{signal=meta.signal;return d.promise;},clock});pending.sync([pv('a')],options);await tick();pending.dispose();assert.equal(signal.aborted,true);d.resolve(payload());await tick();assert.equal(pending.snapshot().states.a.status,'loading');
});
