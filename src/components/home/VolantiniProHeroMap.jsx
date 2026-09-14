import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useServiceAnalysis } from '../../hooks/useServiceAnalysis.js';
import HomepageTerritoryMap from './HomepageTerritoryMap.jsx';
import { HERO_SCENARIO, normalizeHomepageAnalysis, formatHeroMetric } from './homepageHeroData.js';
import './homepage-hero.css';

function HeroIcon({type}) {
  return <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {type==='families'?<><circle cx="14" cy="7" r="4"/><path d="M6 24v-5a8 8 0 0 1 16 0v5ZM4 6a3 3 0 0 0 0 6m20-6a3 3 0 0 1 0 6M2 23v-5q0-4 4-4m20 9v-5q0-4-4-4"/></>:type==='radius'?<><circle cx="14" cy="14" r="10"/><circle cx="14" cy="14" r="4"/><path d="M14 1v6m0 14v6M1 14h6m14 0h6"/></>:type==='municipalities'?<><path d="M3 25V3h12v22m0-15h10v15M7 7h1m3 0h1m-5 5h1m3 0h1m-5 5h1m3 0h1m8-2h2m-2 5h2M7 25v-4h4v4"/></>:type==='coverage'?<><path d="M3 26h23M6 21v-7h3v7Zm7 0V8h3v13Zm7 0V2h3v19Z"/></>:type==='check'?<><circle cx="14" cy="14" r="11"/><path d="m8 14 4 4 8-10"/></>:<><path d="M5 2h11l7 7v17H5Zm11 0v8h7M9 15h10m-10 5h10"/></>}
  </svg>;
}
const benefits=[['radius','Servizi di distribuzione per ogni tipo di campagna'],['coverage','Mappa operativa con zona, raggio e comuni coinvolti'],['report','GPS, prove fotografiche e report finale verificabile']];
const trust=['Report GPS verificabili','Analisi territoriale ISTAT','Cartografia GIS','Preventivi e report PDF','Monitoraggio operativo','Analisi di convenienza'];

export function VolantiniProHeroMap({onConfigure,onQuote,onLogin,onHowItWorks}) {
  const section=useRef(null), navigation=useRef(null); const [active,setActive]=useState(false),[menuOpen,setMenuOpen]=useState(false),[selected,setSelected]=useState(null);const reduced=useReducedMotion();
  useEffect(()=>{if(typeof IntersectionObserver==='undefined'){setActive(true);return;}const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){setActive(true);observer.disconnect();}},{threshold:.01});observer.observe(section.current);return()=>observer.disconnect();},[]);
  const {data,loading,error}=useServiceAnalysis(active?HERO_SCENARIO.lat:null,active?HERO_SCENARIO.lng:null,HERO_SCENARIO.radiusKm,'d2d',active?HERO_SCENARIO.name:null,null,'hero_preview','comune','radius');
  const analysis=useMemo(()=>normalizeHomepageAnalysis(error?null:data),[data,error]);
  const pending=!error&&!data||loading;
  const closeMenu=()=>{setMenuOpen(false);navigation.current?.querySelectorAll('details[open]').forEach(el=>el.removeAttribute('open'));};
  const scroll=id=>{closeMenu();document.getElementById(id)?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});};
  const configure=()=>{closeMenu();if(onConfigure||onQuote)(onConfigure||onQuote)();else window.location.href='/preventivo';};
  const how=()=>{if(reduced)scroll('come-funziona');else if(onHowItWorks)onHowItWorks();else scroll('come-funziona');};
  const select=useCallback(id=>setSelected(id),[]);
  const metric=n=>pending?'…':formatHeroMetric(n);
  const kpis=[['families','Famiglie nel raggio',metric(analysis.families)],['radius','Raggio analisi',`${HERO_SCENARIO.radiusKm} Km`],['municipalities','Comuni coinvolti',metric(analysis.municipalityCount)],['coverage','Copertura stimata',`${metric(analysis.coverage)}${analysis.coverage===null||pending?'':'%'}`]];
  return <section className="vph-hero" ref={section} aria-labelledby="vph-title" data-analysis-state={pending?'loading':analysis.groups.length?'ready':'unavailable'}>
    <div className="vph-inner">
      <nav className="vph-nav" aria-label="Navigazione principale" ref={navigation} onKeyDown={e=>{if(e.key==='Escape')closeMenu();}}>
        <button className="vph-brand" type="button" onClick={how} aria-label="VolantiniPro — come funziona">Volantini<span>Pro</span></button>
        <span className="vph-brand-caption">Distribuzione intelligente<br/>per un territorio più vicino</span>
        <button className="vph-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="vph-navigation" onClick={()=>setMenuOpen(v=>!v)}>Menu <span aria-hidden="true">☰</span></button>
        <div className="vph-nav-links" id="vph-navigation" data-open={menuOpen}>
          <button type="button" onClick={()=>scroll('prezzi')}>Soluzioni</button>
          <button type="button" onClick={()=>scroll('chi-siamo')}>Funzionalità</button>
          <button type="button" onClick={()=>scroll('prezzi')}>Prezzi</button>
          <details><summary>Risorse</summary><div className="vph-dropdown"><button type="button" onClick={()=>scroll('come-funziona')}>Come funziona</button><button type="button" onClick={()=>scroll('chi-siamo')}>Chi siamo</button><button type="button" onClick={()=>scroll('contatti')}>Contatti</button><button type="button" onClick={configure}>Configuratore Campagna</button><a href="/?page=quick">Preventivo Rapido</a><button type="button" onClick={()=>{closeMenu();onLogin?onLogin():window.location.assign('/login');}}>Area Cliente</button><a href="/lavora-con-noi">Lavora con noi · Diventa fornitore</a><a href="/login?context=supplier">Sei già fornitore? Accedi</a></div></details>
        </div>
        <button type="button" className="vph-button vph-nav-cta" onClick={configure}>Configura la campagna</button>
      </nav>
      <div className="vph-stage">
        <div className="vph-copy">
          <p className="vph-eyebrow">Volantinaggio · Controllo GPS</p>
          <h1 id="vph-title">Distribuisci<br className="vph-break"/> volantini e<br className="vph-break"/> verifica ogni<br className="vph-break"/> consegna con<br className="vph-break"/> <em>GPS e report fotografico</em></h1>
          <p className="vph-description">Configura la campagna con dati territoriali reali, segui la distribuzione con il tracking GPS degli operatori e ricevi foto, prove di consegna e report finale. Senza contratti fissi.</p>
          <div className="vph-actions"><button type="button" className="vph-button" onClick={configure}>Configura la tua campagna</button><button type="button" className="vph-button vph-button-secondary" onClick={how}>Vedi come funziona <span aria-hidden="true">▶</span></button></div>
          <div className="vph-chips">{['Door to Door','Hand to Hand','Negozi','Scuole','Eventi'].map(chip=><span key={chip}>{chip}</span>)}</div>
        </div>
        <div className="vph-map-area">
          <div className="vph-kpis" aria-label="Indicatori dello scenario reale">{kpis.map(([icon,label,value])=><div className="vph-kpi" key={icon}><HeroIcon type={icon}/><div><strong>{value}</strong><span>{label}</span></div></div>)}</div>
          <HomepageTerritoryMap groups={analysis.groups} selected={selected} onSelect={select} loading={pending} unavailable={Boolean(error)||!pending&&!analysis.groups.length} missingGeometries={analysis.missingGeometries}/>
        </div>
      </div>
      <div className="vph-summary">
        <div className="vph-benefits">{benefits.map(([icon,text])=><div key={text}><HeroIcon type={icon}/><span>{text}</span></div>)}</div>
        <div className="vph-analysis"><h2>Analisi territorio Milano Nord</h2><div className="vph-list-heading"><span>Comune / territori analizzati</span><span>Famiglie</span><span>Quota</span></div>
          {pending?<p className="vph-empty" role="status">Lettura dei dati territoriali…</p>:!analysis.groups.length?<p className="vph-empty" role="status">Dati territoriali momentaneamente non disponibili. Nessuna stima sostitutiva.</p>:<ul>{analysis.groups.map(g=><li key={g.id}><button type="button" className="vph-zone" onClick={()=>select(selected===g.id?null:g.id)} aria-pressed={selected===g.id}><span className="vph-zone-name"><i style={{backgroundColor:g.color}}/>{g.name}{g.isNil&&<small> · NIL nel raggio</small>}</span><strong>{formatHeroMetric(g.families)}</strong><span>{g.share===null?'—':`${Math.round(g.share)}%`}</span></button></li>)}</ul>}
          <p className="vph-list-note">Esempio reale · {HERO_SCENARIO.name}, raggio {HERO_SCENARIO.radiusKm} km. Quote sul totale famiglie.</p>
        </div>
        <div className="vph-totals"><div><span>Totale famiglie nel raggio</span><strong>{metric(analysis.families)}</strong></div><div><span>Copertura stimata</span><strong className="vph-orange">{metric(analysis.coverage)}{analysis.coverage!==null&&!pending?'%':''}</strong></div><p><HeroIcon type="report"/><span>{analysis.sources.length?analysis.sources.join(' · '):'Fonti territoriali della piattaforma'}<br/>Famiglie stimate; copertura media areale delle zone analizzate.</span></p></div>
      </div>
      <ul className="vph-trust">{trust.map(text=><li key={text}><HeroIcon type="check"/>{text}</li>)}</ul>
    </div>
  </section>;
}
export default VolantiniProHeroMap;
