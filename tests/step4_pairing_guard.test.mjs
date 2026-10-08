import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blocksLegacyPairing, selectLegacyPairingSlots } from '../src/lib/step3/legacyPairingGuard.js';
import { calculateQuotePricing } from '../src/lib/quotePricing.js';
import { summarizeCampaignZones, buildPointOfSalePricing } from '../src/lib/step2/campaignZonesModel.js';
import { readConfiguratorDraft, configuratorHistoryState, readConfiguratorHistoryState } from '../src/lib/configuratorState.js';
const slot={date:'2099-01-06',type:'same',discountPercent:40,placesAvailable:2};
const pv=id=>({id,searchMode:'municipality',city:{name:'Milano',lat:45.46,lng:9.19},selectedComuni:[{name:'Milano'}],finalFlyers:5959,assigned_flyers:5959,readyForQuote:true});
const draft=n=>({type:'d2d',campaignZones:Array.from({length:n},(_,i)=>pv('pv'+i)),smartPairingSlots:[slot],selectedDates:[slot.date]});
const price=d=>calculateQuotePricing({quantity:10000,pricePerThousand:20,smartPairingDiscountPct:selectLegacyPairingSlots(d)[0]?.discountPercent||0});
test('single PV legacy, including multiple territories, retains legacy behavior',()=>{
 const d=draft(1); d.campaignZones[0].selectedComuni=[{name:'Milano'},{name:'Monza'}]; d.campaignZones[0].allocation=[{name:'ISOLA'},{name:'DUOMO'}];
 assert.equal(blocksLegacyPairing(d),false); assert.equal(price(d).smartPairingDiscount,80);
 assert.equal(blocksLegacyPairing({...d,campaignZones:undefined}),false);
 assert.equal(blocksLegacyPairing({...d,campaignZones:[d.campaignZones[0],d.campaignZones[0]]}),false);
});
test('two and five distinct PVs block legacy slots without any new mode flag',()=>{
 for(const n of [2,5]) { const d=draft(n); assert.equal(blocksLegacyPairing(d),true); assert.deepEqual(selectLegacyPairingSlots(d),[]); assert.equal(price(d).smartPairingDiscount,0); }
});
test('explicit per-PV mode blocks legacy globals also for a single survivor',()=>{
 assert.equal(price({...draft(1),smartPairingMode:'per_pv'}).smartPairingDiscount,0);
});
test('direct entry, old draft refresh and back/forward snapshots cannot bypass multi-PV guard',()=>{
 for(const n of [2,5]) {
  const d=draft(n); const storage={getItem:()=>JSON.stringify({version:1,data:d})};
  for(const restored of [d,readConfiguratorDraft(storage),readConfiguratorHistoryState(configuratorHistoryState(d))]) assert.equal(price(restored).smartPairingDiscount,0);
 }
});
test('deleting PV2 preserves survivor quantity and existing territorial base',()=>{
 const d=draft(2); const before=buildPointOfSalePricing(summarizeCampaignZones([d.campaignZones[0]]));
 d.campaignZones=d.campaignZones.slice(0,1); d.smartPairingMode='per_pv';
 const survivor=summarizeCampaignZones(d.campaignZones); assert.equal(survivor.totalQuantity,5959);
 assert.deepEqual(buildPointOfSalePricing(survivor),before); assert.equal(price(d).smartPairingDiscount,0);
});
test('Step4 central guarded slot source feeds calendar, price, PDF and payload; no raw bypass',()=>{
 const s=readFileSync(new URL('../src/pages/public/configurator/Step4.jsx',import.meta.url),'utf8');
 assert.match(s,/const realStep3Slots = selectLegacyPairingSlots\(data\)/);
 assert.doesNotMatch(s,/data\.smartPairingSlots/);
 assert.match(s,/const pairsData = realStep3Pairs/);
 assert.match(s,/smartPairingDiscountPct: disc/);
 assert.match(s,/smartPairingApplied: disc > 0/);
 assert.match(s,/amount: smartPairingDiscount/);
 assert.match(s,/smart_pairing_discount: disc/);
});
