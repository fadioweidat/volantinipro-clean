import { buildPairingContext, beginPairingRequest, applyPairingResponse, ownsPairingResponse } from './perPvSmartPairing.js';

export function pairingPeriod(data, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0,10);
  const raw = data.startDate || data.campaignPeriodStart || today;
  const start = raw < today ? today : raw;
  const parsed = Date.parse(start);
  return { start, end: data.endDate || data.campaignPeriodEnd || (Number.isFinite(parsed) ? new Date(parsed + 89 * 86400000).toISOString().slice(0,10) : start) };
}

// The current endpoint accepts one name + optional center, not exact territory.
// Returned matches are transport observations ONLY, never economic verification.
export function provisionalRequest(zone, context) {
  if (!context.valid || context.territory.parents.length !== 1) return null;
  const city = zone.city || zone.selectedComuni?.[0];
  const name = typeof city === 'string' ? city : city?.name || city?.label;
  if (!name) return null;
  return { service: context.service, zone: name, startDate: context.period.start,
    ...(context.center ? {lat:context.center.lat,lng:context.center.lng} : {}) };
}

/** Injected transport and clock; no DB writes or global slot publication. */
export function createPairingCoordinator({ request, onChange = () => {}, concurrency = 2, maxAgeMs = 300000, clock = Date.now }) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5 || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) throw Error('INVALID_PAIRING_CONFIGURATION');
  let zones = [], contexts = {}, states = {}, queue = [], inFlight = 0, disposed = false;
  const generations = new Map(), controllers = new Map(), timers = new Map();
  const emit = () => { if (!disposed) onChange({ states: {...states}, contexts: {...contexts} }); };
  const cancel = id => { controllers.get(id)?.abort(); controllers.delete(id); clearTimeout(timers.get(id)); timers.delete(id); queue=queue.filter(t=>t.context.pvId!==id); };
  function schedule(id) {
    cancel(id);
    const context = contexts[id];
    const generation = (generations.get(id) || 0) + 1;
    generations.set(id, generation);
    const zone = zones.find(z=>z.id===id);
    const body = provisionalRequest(zone, context);
    states = {...states,[id]:beginPairingRequest(context,generation,body?'loading':'unavailable')};
    if (!body) states[id] = {...states[id],reason: context.reason || 'mapping_incomplete'};
    else queue.push({context,generation,body});
  }
  function pump() {
    while (!disposed && inFlight < concurrency && queue.length) {
      const task=queue.shift(), id=task.context.pvId;
      if (states[id]?.generation!==task.generation) continue;
      const controller=new AbortController(); controllers.set(id,controller); inFlight++;
      Promise.resolve().then(()=>{
        if(disposed || controller.signal.aborted)throw Error('PAIRING_REQUEST_ABORTED');
        return request(task.body,{signal:controller.signal,pvId:id});
      }).then(payload=>{
        const response={pvId:id,generation:task.generation,contextSignature:task.context.signature,status:'unavailable',verified:false};
        if (disposed || !ownsPairingResponse({campaignZones:zones,context:task.context,state:states[id],response})) return;
        if (payload?.source!=='campaign_capacity' || !Array.isArray(payload.smartPairingSlots) || !Array.isArray(payload.availableDates)) throw Error('INVALID_AVAILABILITY_RESPONSE');
        const now=clock();
        states=applyPairingResponse(states,{campaignZones:zones,context:task.context,response,now,expiresAt:now+maxAgeMs}).states;
        // Keep raw observations separate from domain slots (which remain empty).
        states[id]={...states[id],reason:'territory_unverified',transportStatus:payload.smartPairingSlots.length?'match':'no_match',lastCheckedAt:now,
          provisionalSlots:payload.smartPairingSlots.map(s=>({...s})),preferredAvailabilityDates:[...new Map(payload.availableDates.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d?.date)&&Number.isFinite(Date.parse(d.date))&&new Date(d.date).toISOString().slice(0,10)===d.date&&d.date>=task.context.period.start&&d.date<=task.context.period.end&&Number(d.placesAvailable)>0).map(d=>[d.date,{...d}])).values()]};
        timers.set(id,setTimeout(()=>{
          if (!disposed && states[id]?.generation===task.generation) { states={...states,[id]:{...states[id],status:'stale',reason:'verification_expired',preferredAvailabilityDates:[],provisionalSlots:[]}}; emit(); }
        },maxAgeMs));
        emit();
      }).catch(error=>{
        const response={pvId:id,generation:task.generation,contextSignature:task.context.signature,status:error?.message==='BACKEND_NOT_CONFIGURED'?'unavailable':'error'};
        if (disposed || !ownsPairingResponse({campaignZones:zones,context:task.context,state:states[id],response})) return;
        states=applyPairingResponse(states,{campaignZones:zones,context:task.context,response,now:clock()}).states;
        states[id]={...states[id],reason:error?.message || 'AVAILABILITY_FAILED'}; emit();
      }).finally(()=>{inFlight--;if(controllers.get(id)===controller)controllers.delete(id);pump();});
    }
  }
  return {
    sync(nextZones,options) {
      if(disposed)return;
      const ids=nextZones.map(z=>z.id);
      if(ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length)throw Error('INVALID_OR_DUPLICATE_PV_ID');
      zones=nextZones;
      for(const id of Object.keys(states))if(!ids.includes(id)){cancel(id);delete states[id];}
      const nextContexts=Object.fromEntries(zones.map(z=>[z.id,buildPairingContext(z,options)]));
      const changed=ids.filter(id=>!states[id]||contexts[id]?.signature!==nextContexts[id]?.signature);
      contexts=nextContexts;
      for(const id of changed)schedule(id);
      emit();pump();
    },
    retry(id){if(!disposed&&contexts[id]){schedule(id);emit();pump();}},
    skip(){for(const id of Object.keys(states)){cancel(id);states[id]={...states[id],status:'skipped',verified:false,slots:[],provisionalSlots:[],preferredAvailabilityDates:[]};}emit();},
    snapshot:()=>({states:{...states},contexts:{...contexts}}),
    dispose(){disposed=true;for(const id of Object.keys(states))cancel(id);queue=[];}
  };
}
