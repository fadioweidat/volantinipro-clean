import { summarizeCampaignZones, buildPointOfSalePricing, buildMultiZoneDistributionZones } from '../step2/campaignZonesModel.js';
import { buildPairingContext, beginPairingRequest, calculateCampaignPairing, PAIRING_STATES } from './perPvSmartPairing.js';
import { pairingPeriod } from './perPvPairingCoordinator.js';
import { blocksLegacyPairing } from './legacyPairingGuard.js';
import { calculateQuotePricing } from '../quotePricing.js';
import { calculateMultiZoneDistributionPrice } from '../pricing/distributionPricing.js';

const validDate = d => typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d;
const dates = values => [...new Set(Array.isArray(values)?values.filter(validDate):[])].sort();

/** Current contract is NOT an eligibility authority, including persisted verified flags.
 * Only canonical ready D2D PVs in guarded/per-PV mode use this adapter. Legacy single
 * pricing remains outside this path. Quantity/base never come from evidence snapshots.
 */
export function buildPerPvEconomics(data, options = {}) {
  // Called during Step3/Step4 render: an unexpected input must fall back to the
  // existing campaign pricing (same territorial engine, no pairing discount)
  // instead of throwing. The breakdown is used only when its per-PV bases
  // reconcile to the cent with the campaign engine total, so pricePerPvQuote's
  // parity guard cannot fire on a returned breakdown.
  try {
    const breakdown = computePerPvEconomics(data, options);
    if (!breakdown || !breakdown.distributionZones.length) return null;
    const engineBaseCents = Math.round(calculateMultiZoneDistributionPrice(breakdown.distributionZones).distributionSubtotal * 100);
    return engineBaseCents === breakdown.totals.baseCents ? breakdown : null;
  } catch {
    return null;
  }
}

function computePerPvEconomics(data, { states: liveStates = {}, now = Date.now() } = {}) {
  if(data?.type!=='d2d' || !blocksLegacyPairing(data))return null;
  let pricingZones=data.campaignZones;
  let summary=summarizeCampaignZones(pricingZones);
  // Preserve Step4's existing owned single-PV recommendation convention.
  // This derives from that PV's snapshot, never deleted/top-level mirrors.
  if(summary.zoneCount===1 && ['increase','useRecommended'].includes(summary.zones[0].source.coverageDecision)) {
    const z=summary.zones[0],quantity=Math.max(z.quantity,Number(z.requiredFlyers)||0);
    if(quantity!==z.quantity){pricingZones=[{...z.source,finalFlyers:quantity,assigned_flyers:quantity}];summary=summarizeCampaignZones(pricingZones);}
  }
  const ids=summary.zones.map(z=>z.id);
  if(!summary.allZonesReady || ids.some(id=>typeof id!=='string'||!id.trim()) || new Set(ids).size!==ids.length)return null;
  const basePrices=buildPointOfSalePricing(summary).rows;
  const contexts={},states={},generations={},selectedDatesByPv={};
  const saved=data.perPvPairingEconomicSnapshot?.version===1 && Array.isArray(data.perPvPairingEconomicSnapshot.rows) ? data.perPvPairingEconomicSnapshot.rows : [];
  const observations={};
  for(const z of summary.zones){
    const context=buildPairingContext(z.source,{service:data.type,period:pairingPeriod(data,now),mappingPolicyVersion:'name-only-provisional-v1'});
    contexts[z.id]=context;
    const prior=liveStates[z.id] || saved.find(r=>r.pvId===z.id);
    const signature=prior?.contextSignature ?? prior?.context?.signature;
    const generation=Number.isSafeInteger(prior?.generation)&&prior.generation>0?prior.generation:1;
    let status=PAIRING_STATES.includes(prior?.availabilityStatus ?? prior?.status)?prior.availabilityStatus ?? prior.status:'unavailable';
    if(status==='match')status='unavailable'; // v10 can never authorize economic eligibility
    if(signature && signature!==context.signature)status='stale';
    if(Number.isFinite(prior?.expiresAt)&&now>=prior.expiresAt)status='stale';
    states[z.id]=beginPairingRequest(context,generation,status);
    generations[z.id]=generation;
    selectedDatesByPv[z.id]=dates(data.perPvPairingPreferences?.[z.id] ?? z.source.smartPairingSelectedDates);
    observations[z.id]={generation,availabilityStatus:states[z.id].status,observedAt:prior?.lastCheckedAt ?? prior?.observedAt ?? null,expiresAt:prior?.expiresAt ?? null};
  }
  const economic=calculateCampaignPairing({campaignZones:pricingZones,basePrices,contexts,states,generations,selectedDatesByPv,now,datePolicy:'single_date_only'});
  const byId=new Map(summary.zones.map(z=>[z.id,z]));
  const rows=economic.rows.map(r=>{
    const z=byId.get(r.pvId),context=contexts[r.pvId],selectedDates=selectedDatesByPv[r.pvId];
    const selectedValidDates=context.valid?selectedDates.filter(d=>d>=context.period.start&&d<=context.period.end):[];
    return {pvId:r.pvId,name:z.name,quantity:z.quantity,context,contextSignature:context.signature,...observations[r.pvId],
      selectedDates,selectedValidDates,verified:false,eligiblePercent:0,
      eligibilityStatus:'unverified',reason:selectedDates.length>1?'multiple_date_policy_required':!context.valid?context.reason:['loading','error','stale','skipped'].includes(states[z.id].status)?states[z.id].status:'unapproved_backend_contract',
      base:r.base,discount:r.discount,net:r.net,baseCents:Math.round(r.base*100),discountCents:Math.round(r.discount*100),netCents:Math.round(r.net*100)};
  });
  return {version:1,contract:'name-only-v10-unverified',reservesCapacity:false,serverAuthorized:false,rows,
    totals:{quantity:summary.totalQuantity,base:economic.base,discount:economic.discount,net:economic.net,
      baseCents:rows.reduce((s,r)=>s+r.baseCents,0),discountCents:rows.reduce((s,r)=>s+r.discountCents,0),netCents:rows.reduce((s,r)=>s+r.netCents,0)},
    distributionZones:buildMultiZoneDistributionZones(summary)};
}

export function smartPairingSnapshot(breakdown) {
  if(!breakdown)return null;
  return {version:breakdown.version,contract:breakdown.contract,reservesCapacity:false,serverAuthorized:false,
    rows:breakdown.rows.map(r=>structuredClone(r)),totals:{...breakdown.totals}};
}

/** Existing commercial pipeline is reused verbatim. Zero unverified pairing discount;
 * urgency, then plan, then extras stay in calculateQuotePricing, not a second formula.
 */
export function pricePerPvQuote(breakdown, commercialInputs) {
  const result=calculateQuotePricing({...commercialInputs,quantity:breakdown.totals.quantity,distributionZones:breakdown.distributionZones,smartPairingDiscountPct:0});
  if(Math.round(result.baseCost*100)!==breakdown.totals.baseCents || result.smartPairingDiscount!==breakdown.totals.discount)throw Error('PER_PV_PRICING_PARITY_FAILED');
  return result;
}
