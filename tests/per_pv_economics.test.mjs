import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPerPvEconomics,pricePerPvQuote,smartPairingSnapshot} from '../src/lib/step3/perPvEconomics.js';
import {buildPointOfSalePricing,summarizeCampaignZones,buildMultiZoneDistributionZones} from '../src/lib/step2/campaignZonesModel.js';
import {calculateQuotePricing} from '../src/lib/quotePricing.js';
import {generateQuotePdfBytes,validatePdfBytes,mapQuoteDataToPdfModel} from '../src/lib/pdf/generateQuotePdf.js';
const now=Date.parse('2099-01-01T12:00:00Z');
const city={name:'Milano',lat:45.46,lng:9.19};
const pv=(id,quantity=5959)=>({id,store_name:'Negozio '+id,city,cityName:'Milano',searchMode:'municipality',selectedComuni:[city],readyForQuote:true,finalFlyers:quantity,assigned_flyers:quantity,nilManualMode:true,allocation:[{name:'ISOLA',nil_code:'9',assignedFlyers:quantity,requiredFlyers:quantity}],kpiSnapshot:{analysisLevel:'nil',families:5417,requiredFlyers:quantity}});
const draft=n=>({type:'d2d',smartPairingMode:'per_pv',campaignZones:Array.from({length:n},(_,i)=>pv('p'+i)),startDate:'2099-01-01',endDate:'2099-01-31',perPvPairingPreferences:{p0:['2099-01-06']}});
test('1/2/5 PV bases are existing territorial prices; no forged verified discounts',()=>{
 for(const n of [1,2,5]){const d=draft(n);const b=buildPerPvEconomics(d,{now,states:{p0:{status:'match',verified:true,slots:[{date:'2099-01-06',type:'same',discountPercent:40}],generation:1}}});
 const old=buildPointOfSalePricing(summarizeCampaignZones(d.campaignZones));assert.equal(b.totals.base,old.distributionTotal);assert.equal(b.totals.discountCents,0);assert.equal(b.totals.netCents,b.totals.baseCents);assert.equal(b.rows.length,n);assert.ok(b.rows.every(r=>!r.verified&&r.eligiblePercent===0));}
});
test('single-PV legacy excluded; multiple territories of one PV do not force a mode change',()=>{
 const d=draft(1);delete d.smartPairingMode;d.campaignZones[0].selectedComuni.push({name:'Monza'});assert.equal(buildPerPvEconomics(d,{now}),null);
 assert.equal(calculateQuotePricing({quantity:10000,pricePerThousand:20,smartPairingDiscountPct:40}).total,120);
 d.smartPairingMode='per_pv';assert.equal(buildPerPvEconomics(d,{now}).totals.discount,0);
});
test('mixed statuses, multiple dates, stale context and deleted PVs are ineligible',()=>{
 const d=draft(5);d.perPvPairingPreferences.p0=['2099-01-06','2099-01-07'];
 const statuses=['match','loading','error','unavailable','stale'];const states=Object.fromEntries(d.campaignZones.map((z,i)=>[z.id,{status:statuses[i],verified:true,generation:1}]));
 const b=buildPerPvEconomics(d,{now,states});assert.equal(b.rows[0].reason,'multiple_date_policy_required');assert.equal(b.totals.discount,0);
 d.perPvPairingEconomicSnapshot=smartPairingSnapshot(b);d.campaignZones=d.campaignZones.slice(0,4);const four=buildPerPvEconomics(d,{now});assert.equal(four.rows.length,4);assert.equal(four.totals.quantity,4*5959);
 d.campaignZones=d.campaignZones.slice(0,1);assert.equal(buildPerPvEconomics(d,{now}).rows.length,1);
});
test('reorder/switch and refresh recompute from canonical PVs, ignoring snapshot money',()=>{
 const d=draft(2),b=buildPerPvEconomics(d,{now});d.perPvPairingEconomicSnapshot=smartPairingSnapshot(b);d.perPvPairingEconomicSnapshot.rows[0].discount=999;d.perPvPairingEconomicSnapshot.totals.base=1;
 d.activeZoneId='p1';d.qty=999999;d.campaignZones.reverse();const after=buildPerPvEconomics(d,{now});assert.equal(after.totals.base,b.totals.base);assert.equal(after.totals.discount,0);
 assert.deepEqual(after.rows.map(r=>[r.pvId,r.baseCents]).sort(),b.rows.map(r=>[r.pvId,r.baseCents]).sort());
 d.campaignZones[0].city={...city,lat:46};assert.equal(buildPerPvEconomics(d,{now}).rows[0].availabilityStatus,'stale');
});
test('urgency, plan and extras use the original commercial pipeline; cents reconcile',()=>{
 for(const urgency of ['normal','urgent','express'])for(const planDiscountPct of [0,3,5,8]){
 const d=draft(2),b=buildPerPvEconomics(d,{now}),inputs={pricePerThousand:18.5,urgency,planDiscountPct,extras:[{price:99},{price:45}]};
 const actual=pricePerPvQuote(b,inputs),expected=calculateQuotePricing({...inputs,quantity:b.totals.quantity,distributionZones:buildMultiZoneDistributionZones(summarizeCampaignZones(d.campaignZones))});assert.deepEqual(actual,expected);
 assert.equal(b.rows.reduce((s,r)=>s+r.baseCents,0),b.totals.baseCents);assert.equal(b.rows.reduce((s,r)=>s+r.netCents,0),b.totals.netCents);}
});
test('Step3/Step4/PDF/payload share snapshot and pricing; metadata is evidence only',()=>{
 const d=draft(2),b=buildPerPvEconomics(d,{now}),s=smartPairingSnapshot(b);d.perPvPairingEconomicSnapshot=s;
 const step4=buildPerPvEconomics(d,{now}),s4=smartPairingSnapshot(step4);assert.deepEqual(s4.rows.map(r=>[r.pvId,r.base,r.discount,r.net]),s.rows.map(r=>[r.pvId,r.base,r.discount,r.net]));
 const pricing=pricePerPvQuote(b,{pricePerThousand:18.5,urgency:'urgent',planDiscountPct:3,extras:[{price:99}]});
 const model={quoteId:'NO-WRITE',service:'Door to Door',campaign:{quantity:b.totals.quantity},area:{mainArea:'Milano'},pricing:{lines:[],subtotal:pricing.baseCost,discounts:[],extras:[],urgencySurcharge:pricing.urgencySurcharge,total:pricing.total,grandTotal:pricing.total+79+120,smart_pairing:s4,graphicLine:{amount:79,inTotal:true},printingLine:{amount:120,inTotal:true}},sources:[]};
 const normalized=mapQuoteDataToPdfModel(model);assert.deepEqual(normalized.pricing.smart_pairing,s4);assert.equal(normalized.pricing.total,pricing.total);validatePdfBytes(generateQuotePdfBytes(model));
 const payload={total_amount:pricing.total,metadata:{smart_pairing:s4,pricing:model.pricing}};assert.deepEqual(payload.metadata.smart_pairing,normalized.pricing.smart_pairing);assert.equal(s.serverAuthorized,false);assert.equal(s.reservesCapacity,false);
 const step4src=readFileSync(new URL('../src/pages/public/configurator/Step4.jsx',import.meta.url),'utf8');assert.equal((step4src.match(/smart_pairing: economicSnapshot/g)||[]).length,2);assert.match(step4src,/total_amount: Number\(total.toFixed\(2\)\)/);
});
test('PDF HTML and byte renderer expose the same PV snapshot and full commercial total',async()=>{
 const {printQuotePdf}=await import('../src/lib/pdf/printQuotePdf.js');let html='';
 globalThis.window={open:()=>({document:{write:s=>{html=s;},close(){}}})};
 const b=buildPerPvEconomics(draft(2),{now}),snapshot=smartPairingSnapshot(b);
 const model={quoteId:'NO-WRITE',service:'Door to Door',campaign:{quantity:b.totals.quantity},area:{mainArea:'Milano'},pricing:{lines:[],discounts:[],extras:[],total:100,grandTotal:299,urgencySurcharge:10,smart_pairing:snapshot,printingLine:{label:'Stampa indicativa',amount:120,inTotal:true},graphicLine:{label:'Grafica',amount:79,inTotal:true}},sources:[]};
 try {printQuotePdf(model);assert.ok(html.includes('Negozio p0'));assert.ok(html.includes('Netto base'));assert.ok(html.includes('299,00'));const bytes=generateQuotePdfBytes(model);assert.ok(Buffer.from(bytes).toString('latin1').includes('299,00'));}finally{delete globalThis.window;}
});
test('owned single-PV increase convention remains consistent with existing Step4 resolver',()=>{
 const d=draft(1);d.campaignZones[0].coverageDecision='increase';d.campaignZones[0].kpiSnapshot.requiredFlyers=7000;
 const b=buildPerPvEconomics(d,{now});assert.equal(b.totals.quantity,7000);assert.equal(b.rows[0].quantity,7000);assert.equal(pricePerPvQuote(b,{pricePerThousand:18.5}).baseCost,b.totals.base);
});
test('immutable input, no legacy global percentage contamination and no unknown PV pricing',()=>{
 const d=draft(2);d.smartPairingSlots=[{date:'2099-01-06',type:'same',discountPercent:40}];const original=JSON.stringify(d);const b=buildPerPvEconomics(d,{now});assert.equal(JSON.stringify(d),original);assert.equal(b.totals.discount,0);
 d.campaignZones[0].readyForQuote=false;assert.equal(buildPerPvEconomics(d,{now}),null);
});
