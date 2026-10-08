import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildPairingContext, beginPairingRequest, applyPairingResponse, evaluatePairingSelection, calculateCampaignPairing, PAIRING_STATES } from '../src/lib/step3/perPvSmartPairing.js';
import { summarizeCampaignZones, buildPointOfSalePricing } from '../src/lib/step2/campaignZonesModel.js';
const now = Date.parse('2099-01-01T12:00:00Z');
const day = '2099-01-06';
const options = { service: 'd2d', period: { start: '2099-01-01', end: '2099-01-31' }, mappingPolicyVersion: 'pv-territory-v1' };
const pv = (id, more = {}) => ({ id, searchMode: 'municipality', city: { name: 'Milano', lat: 45.46, lng: 9.19 }, selectedComuni: [{ name: 'Milano' }], readyForQuote: true, finalFlyers: 5959, ...more });
const slot = type => ({ date: day, type, discountPercent: type === 'same' ? 40 : 20, placesAvailable: 1, source: 'campaign_capacity' });
const freeze = x => { if(x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
function fixture(types = ['same'], bases = types.map(() => 236.85)) {
  const campaignZones = types.map((_, i) => pv('pv'+i));
  const contexts = Object.fromEntries(campaignZones.map(z => [z.id, buildPairingContext(z, options)]));
  let states = {};
  const generations = {}, selectedDatesByPv = {};
  for (const [i, z] of campaignZones.entries()) {
    const ctx = contexts[z.id]; generations[z.id] = 1; selectedDatesByPv[z.id] = [day];
    states[z.id] = beginPairingRequest(ctx, 1);
    if (['loading', 'error', 'unavailable', 'stale', 'skipped'].includes(types[i])) { states[z.id] = beginPairingRequest(ctx, 1, types[i]); continue; }
    const slots = types[i] === 'none' ? [] : [slot(types[i])];
    states = applyPairingResponse(states, { campaignZones, context: ctx, now, expiresAt: now + 60000, response: { pvId: z.id, generation: 1, contextSignature: ctx.signature, status: 'success', verified: true, payload: { source: 'campaign_capacity', smartPairingSlots: slots, availableDates: [] } } }).states;
  }
  return { campaignZones, contexts, states, generations, selectedDatesByPv, now, basePrices: campaignZones.map((z,i)=>({ id: z.id, distributionPrice: bases[i] })) };
}
const run = f => calculateCampaignPairing(f);
test('one PV: confirmed same, nearby and no match', () => {
  assert.equal(run(fixture()).discount, 94.74);
  assert.equal(run(fixture(['nearby'])).discount, 47.37);
  assert.equal(run(fixture(['none'])).discount, 0);
});
test('two PV discount isolation: same does not discount no-match base', () => {
  const r = run(fixture(['same','none'], [236.85,475.86]));
  assert.deepEqual([r.base,r.discount,r.net], [712.71,94.74,617.97]);
  assert.equal(r.rows[1].discount,0); assert.equal(r.reservesCapacity,false);
});
test('five mixed statuses and partial failures retain valid PV discount', () => {
  const r = run(fixture(['same','nearby','none','error','unavailable']));
  assert.equal(r.discount,142.11); assert.deepEqual(r.rows.map(r=>r.status),['match','match','no_match','error','unavailable']);
});
test('all non-match availability states fail closed', () => {
  for(const s of PAIRING_STATES.filter(s=>s!=='match')) assert.equal(run(fixture([s==='no_match'?'none':s])).discount,0);
});
test('round each PV once and sum cents, never round aggregate percentage', () => {
  const r=run(fixture(['same','same'],[0.03,0.03]));
  assert.deepEqual([r.base,r.discount,r.net],[0.06,0.02,0.04]);
  assert.equal(r.rows.reduce((s,r)=>s+Math.round(r.net*100),0),4);
});
test('deletion 2 to 1 and 5 to 4 excludes removed base and discount', () => {
  for(const n of [2,5]) { const f=fixture(Array(n).fill('same')); f.campaignZones=f.campaignZones.slice(0,-1); const r=run(f); assert.equal(r.rows.length,n-1); assert.equal(r.discount,Math.round(94.74*(n-1)*100)/100); }
});
test('reorder and active PV switch leave identity and amounts invariant', () => {
  const f=fixture(['same','nearby','none']); const before=run(f);
  const after=run({...f,campaignZones:[...f.campaignZones].reverse(),activeZoneId:'pv2',qty:999999,cityName:'Rho'});
  assert.equal(after.discount,before.discount); assert.deepEqual(after.rows.reverse(),before.rows);
});
test('old generations, changed context and unverified state give zero', () => {
  const f=fixture(); assert.equal(run({...f,generations:{pv0:2}}).discount,0);
  const changed=structuredClone(f); changed.campaignZones[0].city.lat=45.5; assert.equal(run(changed).discount,0);
  const unverified=structuredClone(f); unverified.states.pv0.verified=false; assert.equal(run(unverified).discount,0);
  assert.equal(run({...f,now:now+60000}).discount,0);
});
test('response ownership rejects deleted PV, stale generation/context and replay', () => {
  const f=fixture(); const ctx=f.contexts.pv0;
  const response={pvId:'pv0',generation:1,contextSignature:ctx.signature,status:'error'};
  const loading={pv0:beginPairingRequest(ctx,2)};
  for(const args of [{campaignZones:[],response},{campaignZones:f.campaignZones,response},{campaignZones:f.campaignZones,response:{...response,generation:2,contextSignature:'old'}}]) {
    const result=applyPairingResponse(loading,{...args,context:ctx,now,expiresAt:now+60}); assert.equal(result.accepted,false);
  }
  assert.equal(applyPairingResponse(f.states,{campaignZones:f.campaignZones,context:ctx,response,now,expiresAt:now+60}).accepted,false);
  const changed=structuredClone(f.campaignZones); changed[0].city.lat=46;
  assert.equal(applyPairingResponse({pv0:beginPairingRequest(ctx,1)},{campaignZones:changed,context:ctx,response,now,expiresAt:now+60}).accepted,false);
});
test('invalid and missing coordinates never become zero, valid zero is preserved', () => {
  for(const point of [{lat:null,lng:9},{lat:91,lng:9},{lat:45,lng:181},{lat:'x',lng:9},{lat:true,lng:9}]) assert.equal(buildPairingContext(pv('p',{city:{name:'Milano',...point}}),options).valid,false);
  const c=buildPairingContext(pv('p',{city:{name:'Milano',lat:null,lng:null}}),options); assert.equal(c.valid,true); assert.equal(c.center,null);
  assert.equal(buildPairingContext(pv('p',{searchMode:'address',radiusKm:1,selectedSearchPoint:{lat:null,lng:null}}),options).valid,false);
  assert.deepEqual(buildPairingContext(pv('p',{city:{name:'Milano',lat:0,lng:0}}),options).center,{lat:0,lng:0});
  assert.equal(buildPairingContext(pv('p',{selectedComuni:[{name:'Milano',lat:91,lng:9}]}),options).valid,false);
});
test('context rejects invalid calendar periods and changes when canonical parent coordinates change', () => {
  for(const period of [{start:'2099-02-30'},{start:'2099-01-20',end:'2099-01-01'},{}]) assert.equal(buildPairingContext(pv('p'),{...options,period}).valid,false);
  const a=pv('p',{selectedComuni:[{name:'Milano',lat:45,lng:9}]});
  const b=pv('p',{selectedComuni:[{name:'Milano',lat:46,lng:9}]});
  assert.notEqual(buildPairingContext(a,options).signature,buildPairingContext(b,options).signature);
});
test('context covers stable PV ID, NIL/CAP/radius identity, period, service and mapping version', () => {
  const z=pv('p',{nilManualMode:true,allocation:[{nil_code:'9'}]}); const c=buildPairingContext(z,options);
  for(const changed of [pv('other',{...z,id:'other'}),{...z,allocation:[{nil_code:'1'}]}]) assert.notEqual(buildPairingContext(changed,options).signature,c.signature);
  for(const changes of [{service:'h2h'},{mappingPolicyVersion:'v2'},{period:{start:'2099-02-01'}}]) assert.notEqual(buildPairingContext(z,{...options,...changes}).signature,c.signature);
  assert.equal(buildPairingContext({...z,finalFlyers:20000,store_name:'new'},options).signature,c.signature);
  assert.equal(buildPairingContext(pv('p',{city:null,selectedComuni:[],cityName:'Milano'}),options).valid,false);
  assert.equal(buildPairingContext({...z,allocation:[{name:'ISOLA'}]},options).valid,false);
  assert.equal(buildPairingContext(pv('p',{searchMode:'cap',selectedCaps:['20100']}),options).valid,true);
  assert.equal(buildPairingContext(pv('p',{searchMode:'cap',selectedCaps:['invalid']}),options).valid,false);
});
test('multiple dates require explicit future policy, no legacy averaging', () => {
  const f=fixture(); f.selectedDatesByPv.pv0=[day,'2099-01-07']; f.states.pv0.slots.push({...slot('nearby'),date:'2099-01-07'});
  const r=run(f); assert.equal(r.discount,0); assert.equal(r.rows[0].policyDecisionRequired,true);
  assert.equal(run({...f,datePolicy:'average_positive'}).discount,0);
  assert.equal(run({...fixture(),datePolicy:'disabled'}).discount,0);
});
test('no inferred match from city, date preference or malformed slot', () => {
  const f=fixture(['none']); f.campaignZones[0].cityName='Milano'; assert.equal(run(f).discount,0);
  for(const changes of [{discountPercent:80},{type:'invented'},{placesAvailable:0},{source:'client'}]) { const bad=fixture(); Object.assign(bad.states.pv0.slots[0],changes); assert.equal(run(bad).discount,0); }
  const duplicate=fixture(); duplicate.states.pv0.slots.push({...slot('same')}); assert.equal(run(duplicate).discount,0);
});
test('verified response validates rates, source and shape; errors clear prior slots', () => {
  const f=fixture(); const ctx=f.contexts.pv0; const states={pv0:beginPairingRequest(ctx,2)};
  for(const payload of [{},{source:'campaign_capacity',smartPairingSlots:[{...slot('same'),discountPercent:60}],availableDates:[]}]) {
    const r=applyPairingResponse(states,{campaignZones:f.campaignZones,context:ctx,now,expiresAt:now+60,response:{pvId:'pv0',contextSignature:ctx.signature,generation:2,status:'success',verified:true,payload}}); assert.equal(r.states.pv0.status,'error'); assert.deepEqual(r.states.pv0.slots,[]);
  }
});
test('immutable canonical input and existing territorial base output', () => {
  const f=fixture(['same','nearby']); f.basePrices=buildPointOfSalePricing(summarizeCampaignZones(f.campaignZones)).rows;
  freeze(f); const before=JSON.stringify(f); const r=run(f); assert.equal(JSON.stringify(f),before);
  assert.equal(r.base,Math.round(f.basePrices.reduce((s,p)=>s+p.distributionPrice,0)*100)/100);
  const ctx=f.contexts.pv0; applyPairingResponse(f.states,{campaignZones:f.campaignZones,context:ctx,response:{},now}); assert.equal(JSON.stringify(f),before);
});
test('missing prices and duplicate identities are explicit errors, never fabricated totals', () => {
  const f=fixture(); assert.throws(()=>run({...f,basePrices:[]}),/INVALID_PV_BASE_PRICE/);
  assert.throws(()=>run({...f,campaignZones:[...f.campaignZones,...f.campaignZones]}),/INVALID_OR_DUPLICATE_PV_ID/);
  assert.deepEqual(run({...f,campaignZones:[]}).rows,[]);
});
test('sensitivity: deliberately invalid aggregate, date-average and rounding fixtures are rejected by assertions', () => {
  const assertCorrect=r=>assert.deepEqual([r.base,r.discount,r.net],[712.71,94.74,617.97]);
  assertCorrect(run(fixture(['same','none'],[236.85,475.86])));
  assert.throws(()=>assertCorrect({base:712.71,discount:285.08,net:427.63}),assert.AssertionError);
  assert.throws(()=>assert.equal(30,run({...fixture(),selectedDatesByPv:{pv0:[day,'2099-01-07']}}).rows[0].eligiblePercent),assert.AssertionError);
  assert.throws(()=>assert.equal(0.024,run(fixture(['same','same'],[0.03,0.03])).discount),assert.AssertionError);
});
test('protected existing files remain byte-identical to approved baseline; engine has no live imports', () => {
  const paths=['src/pages/public/configurator/Step3.jsx','src/pages/public/configurator/Step4.jsx','src/lib/quotePricing.js','src/lib/smartPairingAvailability.js','src/lib/step2/campaignZonesModel.js'];
  for(const path of paths) {
    const old=execFileSync('git',['show','047a764d54624088c6271b112ca53be09b6c5732:'+path]);
    const current=readFileSync(new URL('../'+path,import.meta.url));
    // Git checkouts may convert line endings. Compare source content, not checkout EOL.
    assert.equal(current.toString().replaceAll('\r\n','\n'),old.toString().replaceAll('\r\n','\n'));
    assert.ok(!current.toString().includes('perPvSmartPairing'));
  }
});
