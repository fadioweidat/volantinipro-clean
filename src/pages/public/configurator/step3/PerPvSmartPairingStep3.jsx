import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../../supabaseClient.js';
import { C, F } from '../../../../lib/constants.js';
import { useIsMobile } from '../../../../hooks/useIsMobile.js';
import { selectCampaignStep3Summary } from '../../../../lib/step3/campaignStep3Summary.js';
import { createPairingCoordinator, pairingPeriod } from '../../../../lib/step3/perPvPairingCoordinator.js';
import { buildPairingContext, evaluatePairingSelection } from '../../../../lib/step3/perPvSmartPairing.js';

const request = async (body,{signal}) => {
  if(!supabase?.functions?.invoke)throw Error('BACKEND_NOT_CONFIGURED');
  const {data,error}=await supabase.functions.invoke('smart-pairing-availability',{body,signal,timeout:15000});
  if(error)throw error;
  return data;
};
const button={minHeight:44,padding:'10px 16px',borderRadius:10,border:'1px solid rgba(255,255,255,.22)',background:'rgba(255,255,255,.06)',color:C.white,fontFamily:F.sans,cursor:'pointer'};
const labels={loading:'Verifica in corso',match:'Abbinamento disponibile',no_match:'Nessun abbinamento restituito',unavailable:'Disponibilità non verificata',error:'Verifica non riuscita',stale:'Disponibilità da aggiornare',skipped:'Smart Pairing saltato'};

export function PerPvSmartPairingStep3({data,setData,onNext,onBack,renderSummary,availabilityRequest=request,concurrency=2}) {
  const isMobile=useIsMobile();
  const [snapshot,setSnapshot]=useState({states:{},contexts:{}});
  const [active,setActive]=useState(data.activeZoneId);
  const [month,setMonth]=useState(()=>pairingPeriod(data).start.slice(0,7));
  const coordinator=useRef(null);
  const zones=data.campaignZones || [];
  const period=pairingPeriod(data);
  const syncKey=JSON.stringify(zones.map(z=>({id:z.id,searchMode:z.searchMode,city:z.city,selectedComuni:z.selectedComuni,selectedSearchPoint:z.selectedSearchPoint,radius:z.radius,radiusKm:z.radiusKm,selectedCaps:z.selectedCaps,nilManualMode:z.nilManualMode,allocation:z.allocation,zonesAllocation:z.zonesAllocation,kpiSnapshot:z.kpiSnapshot})).sort((a,b)=>String(a.id).localeCompare(String(b.id))))+JSON.stringify([data.type,period]);
  useEffect(()=>{
    const c=createPairingCoordinator({request:availabilityRequest,onChange:setSnapshot,concurrency});coordinator.current=c;
    return()=>{c.dispose();coordinator.current=null;};
  },[availabilityRequest,concurrency]);
  useEffect(()=>{
    coordinator.current?.sync(zones,{service:data.type || 'd2d',period,mappingPolicyVersion:'name-only-provisional-v1'});
    setActive(id=>zones.some(z=>z.id===id)?id:zones[0]?.id);
    // Restore preferences only. Never hydrate verification or legacy global slots.
    setData(prev=>{
      const current=prev.campaignZones || [];
      const preferences=Object.fromEntries(current.map(z=>[z.id,prev.perPvPairingPreferences?.[z.id] || z.smartPairingSelectedDates || []]));
      return {...prev,smartPairingMode:'per_pv',perPvPairingPreferences:preferences,smartPairingSlots:[],availableDates:[],avgDiscount:0,averagePairingDiscount:0,maxPairingDiscount:0,pairingDiscountPercent:{},pairingType:{},pairingDays:[],smartPairingSelectedDates:[],smartPairingStatus:'provisional'};
    });
  },[syncKey,availabilityRequest,concurrency,setData]);
  const owner=zones.find(z=>z.id===active) || zones[0];
  const currentContext=owner ? buildPairingContext(owner,{service:data.type || 'd2d',period,mappingPolicyVersion:'name-only-provisional-v1'}) : null;
  const cached=snapshot.states[owner?.id];
  const state=cached && currentContext?.signature===cached.contextSignature ? cached : null;
  const dates=data.perPvPairingPreferences?.[owner?.id] || [];
  const summaries=selectCampaignStep3Summary(data);
  const offered=state?.preferredAvailabilityDates || [];
  const monthDates=offered.filter(d=>d.date.startsWith(month+'-'));
  const eligibility=evaluatePairingSelection({context:currentContext,state,generation:state?.generation,selectedDates:dates,now:Date.now()});
  const toggle=date=>setData(prev=>{
    if(!(prev.campaignZones || []).some(z=>z.id===owner.id))return prev;
    const before=prev.perPvPairingPreferences?.[owner.id] || [];
    const selected=before.includes(date)?before.filter(d=>d!==date):[...before,date];
    return {...prev,perPvPairingPreferences:{...prev.perPvPairingPreferences,[owner.id]:selected}};
  });
  const proceed=skip=>{
    if(skip)coordinator.current?.skip();
    setData(prev=>({...prev,smartPairingMode:'per_pv',smartPairingSlots:[],availableDates:[],avgDiscount:0,averagePairingDiscount:0,maxPairingDiscount:0,pairingDiscountPercent:{},pairingType:{},pairingDays:[],smartPairingSelectedDates:[],smartPairingStatus:skip?'skipped_unverified':'provisional'}));
    onNext();
  };
  return <div data-testid="per-pv-pairing" style={{color:C.white,fontFamily:F.sans,maxWidth:1100,margin:'0 auto',padding:isMobile?'20px 16px':'32px 24px',boxSizing:'border-box',minWidth:0}}>
    {renderSummary(summaries,isMobile)}
    <h1 style={{fontFamily:F.serif,fontSize:isMobile?30:42,margin:'12px 0'}}>Smart Pairing per punto vendita</h1>
    <p role="status">Disponibilità provvisoria: il territorio non è verificato. Nessuno sconto economico viene applicato in questa fase. Le date sono preferenze e non riservano capacità.</p>
    <div role="group" aria-label="Punti vendita" style={{display:'flex',gap:8,flexWrap:'wrap',margin:'20px 0'}}>
      {zones.map((z,i)=><button key={z.id} type="button" aria-pressed={owner?.id===z.id} onClick={()=>setActive(z.id)} style={{...button,maxWidth:'100%',overflowWrap:'anywhere',borderColor:owner?.id===z.id?C.orange:undefined}}>
        {z.store_name || `Punto vendita ${i+1}`} · {labels[snapshot.states[z.id]?.status || 'loading']}
      </button>)}
    </div>
    {owner && <section aria-label="Disponibilità del punto vendita" style={{padding:20,borderRadius:20,border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.04)',overflowWrap:'anywhere'}}>
      <h2>{owner.store_name || `Punto vendita ${zones.indexOf(owner)+1}`}</h2>
      <div data-testid="pv-status" role="status">{state?.reason==='territory_unverified' ? (state.transportStatus==='no_match'?'Nessun abbinamento restituito · territorio non verificato':'Abbinamenti provvisori · territorio non verificato') : labels[state?.status || 'loading']}</div>
      <p>Sconto confermato: {eligibility.eligiblePercent}%.</p>
      {state?.lastCheckedAt && <p>Ultimo controllo: {new Date(state.lastCheckedAt).toLocaleTimeString('it-IT')}</p>}
      {state?.status!=='loading' && <button type="button" onClick={()=>coordinator.current?.retry(owner.id)} style={button}>Riprova verifica per questo punto vendita</button>}
      {['error','unavailable'].includes(state?.status) && state?.reason!=='territory_unverified' && <p>Non possiamo verificare la disponibilità per questo territorio. Puoi riprovare o continuare senza Smart Pairing.</p>}
      {dates.length>0 && <p>Preferenze salvate: {dates.join(', ')}. Da riverificare; nessuno sconto confermato.</p>}
      {dates.length>1 && <p role="status">Più date selezionate: la politica di allocazione deve essere definita. Sconto: €0,00.</p>}
      {offered.length>0 && <><h3>Date preferite — non confermate</h3>
      <label>Mese delle preferenze <input aria-label="Mese delle preferenze" type="month" value={month} min={period.start.slice(0,7)} max={period.end.slice(0,7)} onChange={e=>setMonth(e.target.value)} style={{...button,maxWidth:'100%',boxSizing:'border-box',marginBottom:12}}/></label>
      <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(3,minmax(0,1fr))':'repeat(5,minmax(0,1fr))',gap:8}}>
        {monthDates.map(d=><button type="button" key={d.date} aria-pressed={dates.includes(d.date)} onClick={()=>toggle(d.date)} style={{...button,padding:'8px 4px',borderColor:dates.includes(d.date)?C.orange:undefined}}>{d.date}</button>)}
      </div></>}
    </section>}
    <div style={{display:'flex',flexDirection:isMobile?'column':'row',gap:12,marginTop:24}}>
      <button type="button" style={button} onClick={()=>proceed(false)}>Continua con le preferenze — senza sconto</button>
      <button type="button" style={button} onClick={()=>proceed(true)}>Continua senza Smart Pairing →</button>
      <button type="button" style={button} onClick={onBack}>← Zona e mappa</button>
    </div>
  </div>;
}
