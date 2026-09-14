import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useServiceAnalysis } from '../../hooks/useServiceAnalysis.js';
import HomepageTerritoryMap from './HomepageTerritoryMap.jsx';
import { HERO_SCENARIO, normalizeHomepageAnalysis, formatHeroMetric } from './homepageHeroData.js';
import { Logo } from '../common/Logo.jsx';
import Button from '../ui/Button.jsx';
import './homepage-hero.css';

const C = {
  orange: "#E8571A",
  white: "#ffffff",
  muted: "rgba(226, 232, 240, 0.7)",
};

const F = {
  sans: "'DM Sans', Inter, system-ui, sans-serif",
};

function useCompact(bp = 900) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < bp);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bp]);

  return compact;
}

function HeroIcon({type}) {
  return <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {type==='families'?<><circle cx="14" cy="7" r="4"/><path d="M6 24v-5a8 8 0 0 1 16 0v5ZM4 6a3 3 0 0 0 0 6m20-6a3 3 0 0 1 0 6M2 23v-5q0-4 4-4m20 9v-5q0-4-4-4"/></>:type==='radius'?<><circle cx="14" cy="14" r="10"/><circle cx="14" cy="14" r="4"/><path d="M14 1v6m0 14v6M1 14h6m14 0h6"/></>:type==='municipalities'?<><path d="M3 25V3h12v22m0-15h10v15M7 7h1m3 0h1m-5 5h1m3 0h1m-5 5h1m3 0h1m8-2h2m-2 5h2M7 25v-4h4v4"/></>:type==='coverage'?<><path d="M3 26h23M6 21v-7h3v7Zm7 0V8h3v13Zm7 0V2h3v19Z"/></>:type==='check'?<><circle cx="14" cy="14" r="11"/><path d="m8 14 4 4 8-10"/></>:<><path d="M5 2h11l7 7v17H5Zm11 0v8h7M9 15h10m-10 5h10"/></>}
  </svg>;
}
const benefits=[['radius','Servizi di distribuzione per ogni tipo di campagna'],['coverage','Mappa operativa con zona, raggio e comuni coinvolti'],['report','GPS, prove fotografiche e report finale verificabile']];
const trust=['Report GPS verificabili','Analisi territoriale ISTAT','Cartografia GIS','Preventivi e report PDF','Monitoraggio operativo','Analisi di convenienza'];

const brandButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 12,
  padding: 0,
  border: 0,
  background: "transparent",
  color: C.white,
  cursor: "pointer",
};

const centerNavStyle = {
  display: "flex",
  alignItems: "center",
  gap: 46,
  color: "rgba(248, 250, 252, 0.84)",
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 700,
};

const navButtonStyle = {
  padding: "8px 12px",
  border: 0,
  background: "transparent",
  color: "rgba(248, 250, 252, 0.85)",
  fontFamily: F.sans,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  transition: "color 0.2s ease",
};

const headerOutlineButtonStyle = {
  minHeight: 46,
  padding: "0 20px",
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "rgba(8, 14, 26, 0.16)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  color: C.white,
  fontFamily: F.sans,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  transition: "all 0.2s ease",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
};

const primaryButtonStyle = {
  minHeight: 46,
  padding: "0 22px",
  borderRadius: 8,
  fontFamily: F.sans,
  fontSize: 14,
  fontWeight: 700,
  background: C.orange,
  color: C.white,
  border: "none",
  boxShadow: "0 6px 16px rgba(232, 87, 26, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
  cursor: "pointer",
  transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
};

const hamburgerButtonStyle = {
  width: 44,
  height: 44,
  borderRadius: 12,
  border: "1.5px solid rgba(232, 87, 26, 0.72)",
  background: "rgba(10, 20, 36, 0.78)",
  color: C.white,
  display: "grid",
  placeItems: "center",
  gap: 0,
  padding: "10px 11px",
  cursor: "pointer",
};

const hamburgerLineStyle = {
  display: "block",
  width: 20,
  height: 2,
  borderRadius: 2,
  background: C.white,
  transition: "transform .22s ease, opacity .22s ease",
};

const mobileMenuStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  padding: "96px 24px 32px",
  background: "#07101f",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  display: "grid",
  alignContent: "start",
  gap: 10,
  overflowY: "auto",
};

const mobileMenuItemStyle = {
  width: "100%",
  minHeight: 56,
  padding: "0 6px",
  border: 0,
  borderBottom: "1px solid rgba(255,255,255,.09)",
  background: "transparent",
  textAlign: "left",
  color: C.white,
  fontFamily: F.sans,
  fontSize: 24,
  fontWeight: 800,
  cursor: "pointer",
};

export function VolantiniProHeroMap({onConfigure,onQuote,onLogin,onAdmin,onHowItWorks}) {
  const compact = useCompact(1120);
  const [menuOpen, setMenuOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const section = useRef(null);
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setActive(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setActive(true); observer.disconnect(); }
    }, { threshold: .01 });
    observer.observe(section.current);
    return () => observer.disconnect();
  }, []);

  const { data, loading, error } = useServiceAnalysis(
    active ? HERO_SCENARIO.lat : null,
    active ? HERO_SCENARIO.lng : null,
    HERO_SCENARIO.radiusKm,
    'd2d',
    active ? HERO_SCENARIO.name : null,
    null,
    'hero_preview',
    'comune',
    'radius'
  );

  const analysis = useMemo(() => normalizeHomepageAnalysis(error ? null : data), [data, error]);
  const pending = !error && !data || loading;

  const scrollToSection = (id) => {
    setMenuOpen(false);
    setPlatformOpen(false);
    setWorkOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
  };

  const configure = () => {
    setMenuOpen(false);
    if (onConfigure || onQuote) (onConfigure || onQuote)();
    else window.location.href = '/preventivo';
  };

  const how = () => {
    setMenuOpen(false);
    if (onHowItWorks) onHowItWorks();
    else scrollToSection('come-funziona');
  };

  const select = useCallback(id => setSelected(id), []);
  const metric = n => pending ? '…' : formatHeroMetric(n);
  const kpis = [
    ['families', 'Famiglie nel raggio', metric(analysis.families)],
    ['radius', 'Raggio analisi', `${HERO_SCENARIO.radiusKm} Km`],
    ['municipalities', 'Comuni coinvolti', metric(analysis.municipalityCount)],
    ['coverage', 'Copertura stimata', `${metric(analysis.coverage)}${analysis.coverage === null || pending ? '' : '%'}`]
  ];

  return <section className="vph-hero" ref={section} aria-labelledby="vph-title" data-analysis-state={pending ? 'loading' : analysis.groups.length ? 'ready' : 'unavailable'}>
    <div className="vph-inner">
      <nav
        className="vp-home-hero-nav"
        style={{
          position: "relative",
          zIndex: 1100,
          maxWidth: 1400,
          width: "100%",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          padding: "8px 0 16px",
        }}
        aria-label="Navigazione principale"
      >
        <button onClick={how} style={brandButtonStyle} aria-label="VolantiniPro — come funziona">
          <Logo dark={true} size={28} />
        </button>

        {!compact && (
          <div style={{ display: "flex", gap: 36, alignItems: "center", position: "relative" }}>
            <button onClick={() => scrollToSection("come-funziona")} style={navButtonStyle}>Come funziona</button>
            <button onClick={() => scrollToSection("prezzi")} style={navButtonStyle}>Prezzi</button>
            <div
              style={{ position: "relative" }}
              onMouseEnter={() => setPlatformOpen(true)}
              onMouseLeave={() => setPlatformOpen(false)}
            >
              <button
                aria-expanded={platformOpen}
                aria-haspopup="true"
                onClick={() => setPlatformOpen(!platformOpen)}
                style={{ ...navButtonStyle, display: "flex", alignItems: "center", gap: 6 }}
              >
                <span>Piattaforma</span>
                <span style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.5)", transform: platformOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
              </button>
              {platformOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 230,
                    padding: 8,
                    background: "rgba(10, 18, 34, 0.98)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 12,
                    boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    zIndex: 210,
                  }}
                >
                  <button
                    onClick={() => configure()}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, background: "transparent", border: "none", color: C.white, fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
                  >
                    Configuratore Campagna
                  </button>
                  <button
                    onClick={() => window.location.href = "/?page=quick"}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, background: "transparent", border: "none", color: "rgba(255, 255, 255, 0.8)", fontFamily: F.sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
                  >
                    Preventivo Rapido
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => scrollToSection("chi-siamo")} style={navButtonStyle}>Chi siamo</button>
            <button onClick={() => scrollToSection("contatti")} style={navButtonStyle}>Contatti</button>
            <div
              style={{ position: "relative" }}
              onMouseEnter={() => setWorkOpen(true)}
              onMouseLeave={() => setWorkOpen(false)}
            >
              <button
                type="button"
                aria-expanded={workOpen}
                aria-haspopup="true"
                onClick={() => setWorkOpen(true)}
                style={{ ...navButtonStyle, display: "flex", alignItems: "center", gap: 6 }}
              >
                <span>Lavora con noi</span>
                <span style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.5)", transform: workOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
              </button>
              {workOpen && (
                <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 240, padding: 8, background: "rgba(10, 18, 34, 0.98)", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6)", display: "flex", flexDirection: "column", gap: 4, zIndex: 210 }}>
                  <button
                    onClick={() => { setWorkOpen(false); window.location.href = "/lavora-con-noi"; }}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, background: "transparent", border: "none", color: C.white, fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
                  >
                    Diventa fornitore
                  </button>
                  <button
                    onClick={() => { setWorkOpen(false); window.location.href = "/login?context=supplier"; }}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, background: "transparent", border: "none", color: "rgba(255, 255, 255, 0.8)", fontFamily: F.sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
                  >
                    Sei già fornitore? Accedi
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="vp-home-hero-nav-actions" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {!compact && (
            <button
              type="button"
              onClick={() => onLogin?.()}
              style={headerOutlineButtonStyle}
            >
              Area Cliente
            </button>
          )}
          <Button variant="primary" className="vb vp-home-hero-header-cta" onClick={configure} style={primaryButtonStyle}>
            Configura la tua campagna
          </Button>
          {compact && (
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              style={hamburgerButtonStyle}
              aria-label={menuOpen ? "Chiudi menu" : "Apri menu"}
              aria-expanded={menuOpen}
            >
              <span style={{ ...hamburgerLineStyle, transform: menuOpen ? "translateY(6px) rotate(45deg)" : "none" }} />
              <span style={{ ...hamburgerLineStyle, opacity: menuOpen ? 0 : 1 }} />
              <span style={{ ...hamburgerLineStyle, transform: menuOpen ? "translateY(-6px) rotate(-45deg)" : "none" }} />
            </button>
          )}
        </div>
      </nav>

      {compact && menuOpen && (
        <div style={mobileMenuStyle}>
          <button onClick={() => { setMenuOpen(false); configure?.(); }} style={{ ...mobileMenuItemStyle, color: C.orange, fontWeight: 800 }}>Configura la tua campagna</button>
          <button onClick={() => { setMenuOpen(false); onLogin?.(); }} style={mobileMenuItemStyle}>Area Cliente</button>
          <button onClick={() => { setMenuOpen(false); scrollToSection("contatti"); }} style={mobileMenuItemStyle}>Contatti</button>
          <button onClick={() => setWorkOpen((v) => !v)} aria-expanded={workOpen} aria-haspopup="true" style={{ ...mobileMenuItemStyle, display: "flex", alignItems: "center", gap: 6 }}>
            <span>Lavora con noi</span>
            <span style={{ fontSize: 10, transform: workOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
          </button>
          {workOpen && (
            <>
              <button onClick={() => { setMenuOpen(false); setWorkOpen(false); window.location.href = "/lavora-con-noi"; }} style={{ ...mobileMenuItemStyle, paddingLeft: 16 }}>↳ Diventa fornitore</button>
              <button onClick={() => { setMenuOpen(false); setWorkOpen(false); window.location.href = "/login?context=supplier"; }} style={{ ...mobileMenuItemStyle, paddingLeft: 16 }}>↳ Sei già fornitore? Accedi</button>
            </>
          )}
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "6px 0" }} />
          <button onClick={() => { setMenuOpen(false); scrollToSection("come-funziona"); }} style={mobileMenuItemStyle}>Come funziona</button>
          <button onClick={() => { setMenuOpen(false); scrollToSection("prezzi"); }} style={mobileMenuItemStyle}>Prezzi</button>
          <button onClick={() => { setMenuOpen(false); configure?.(); }} style={mobileMenuItemStyle}>Piattaforma: Configuratore</button>
        </div>
      )}
      <div className="vph-stage">
        <div className="vph-copy">
          <p className="vph-eyebrow">VOLANTINAGGIO &middot; CONTROLLO GPS</p>
          <h1 id="vph-title">Distribuisci volantini e<br className="vph-break"/> verifica ogni<br className="vph-break"/> consegna con<br className="vph-break"/> <em>GPS e report fotografico</em></h1>
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
