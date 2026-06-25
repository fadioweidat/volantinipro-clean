import React, { Component, Fragment, useState, useEffect, useRef, useMemo, useCallback } from "react";

import { printQuotePdf } from "./src/lib/pdf/printQuotePdf.js";
import { supabase, confirmCampaignPayment, hasSupabaseConfig, saveCampaign, saveSmartPairingWaitlist } from "./src/lib/supabaseClient.js";
import { useCampagne } from "./src/hooks/useCampagne.js";
import { useCampagnaDetail } from "./src/hooks/useCampagnaDetail.js";
import { useCliente } from "./src/hooks/useCliente.js";
import { useServiceAnalysis } from "./src/hooks/useServiceAnalysis.js";
import { useSectors } from "./src/hooks/useSectors.js";
import { usePoi } from "./src/hooks/usePoi.js";
import { useAddressPoints } from "./src/hooks/useAddressPoints.js";
import { useTransportStops } from "./src/hooks/useTransportStops.js";
import { useDemographicIndicators } from "./src/hooks/useDemographicIndicators.js";
import { SkeletonCard } from "./src/components/SkeletonCard.jsx";
import { Step2Map } from "./src/components/Step2Map.jsx";
import { VolantiniProHeroMap } from "./src/components/home/VolantiniProHeroMap.jsx";
import RealAdminDashboard from "./src/pages/admin/AdminDashboard.jsx";
import FeatureZonaMappa from "./src/components/home/FeatureZonaMappa.jsx";
import FeatureSmartPairing from "./src/components/home/FeatureSmartPairing.jsx";
import FAQSection from "./src/components/home/FAQSection.jsx";
import PricingSection from "./src/components/home/PricingSection.jsx";
import TrustBar from "./src/components/home/TrustBar.jsx";
import ServicesSection from "./src/components/home/ServicesSection.jsx";
import WhyDifferentSection from "./src/components/home/WhyDifferentSection.jsx";
import RisultatiSection from "./src/components/home/RisultatiSection.jsx";
import Footer from "./src/components/home/Footer.jsx";
import Button from "./src/components/ui/Button.jsx";
import { MetricValue } from "./src/components/ui/MetricValue.tsx";
import { sendEmailConferma } from "./src/api/sendEmailConferma.js";
import { computeDoorToDoorCoverage, getZoneFullCoverageFlyers } from "./src/lib/doorToDoorCoverage.js";
import { allowMockData, isProduction } from "./src/lib/runtimeFlags.js";
import { LAYER_PANEL_CONFIG, defaultLayerState } from "./src/lib/dataSources.js";
import { GRANDE_CITTA_ZONE_THRESHOLD, isZonaRilevante } from "./src/lib/services/zone-list-config.js";
const SOURCE_ALIASES = {
  Backend: "Analisi interna",
  "Backend scoring": "Analisi interna",
  "Calc.": "Analisi interna",
  GIS: "Dati geografici / PostGIS",
  "GIS/PostGIS": "Dati geografici / PostGIS",
  "Dati geografici": "Dati geografici / PostGIS",
  GTFS: "Trasporto pubblico / GTFS",
  "GTFS/ATM": "Trasporto pubblico / GTFS",
  OMI: "Dati territoriali / OMI",
  "OMI/dataset": "Dati territoriali / OMI",
  "Dati territoriali": "Dati territoriali / OMI",
  Google: "Google Places",
  Places: "Google Places",
  Overpass: "OpenStreetMap / Overpass",
  OpenStreetMap: "OpenStreetMap / Overpass",
};
function normalizeDataSourceLabel(source) {
  return SOURCE_ALIASES[source] || source;
}

function formatAreaKm2(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return `${n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km²`;
}

function formatPaperWeight(value) {
  if (!value) return "—";
  const s = String(value).replace(/g\/m[²2]?/gi, "").replace(/[–—\-]+$/, "").trim();
  const n = Number(s.replace(",", "."));
  if (Number.isFinite(n) && n > 0) return `${n} g/m²`;
  return `${s} g/m²`;
}

function formatEuroPerMq(min, max) {
  const fmt2 = v => Number(v).toLocaleString("it-IT", { useGrouping: true });
  if (min && max) return `${fmt2(min)} – ${fmt2(max)} €/mq`;
  if (min) return `da ${fmt2(min)} €/mq`;
  return "—";
}

function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "—";
  return String(n);
}

function formatNumber(value, fallback = "0") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    const n = Number(value);
    if (!Number.isFinite(n)) return value; // non-numeric string: return unchanged
    return n.toLocaleString("it-IT", { useGrouping: true });
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fallback; // NaN or Infinity
    return value.toLocaleString("it-IT", { useGrouping: true });
  }
  return fallback;
}

function sourceIsConfirmed(source, confirmedSources = []) {
  const normalized = normalizeDataSourceLabel(source);
  return (confirmedSources || []).map(normalizeDataSourceLabel).includes(normalized);
}

function confirmedSourcesOrFallback(analysisData, analysisError) {
  const sources = Array.isArray(analysisData?.sources) ? analysisData.sources.map(normalizeDataSourceLabel).filter(Boolean) : [];
  if (sources.length > 0) return [...new Set(sources)];
  if (analysisError || analysisData?.error) return ["Dati non disponibili"];
  if (analysisData?.metadata?.isEstimated) return ["Stima interna"];
  if (analysisData) return ["Stima interna"];  // has data response but no sources listed
  return [];  // no API data yet (city not selected or loading)
}

const C = {
  orange: "#E8571A", orangeGlow: "rgba(232,87,26,.35)",
  navy: "#1A2744", navyDeep: "#0F1A30", navyMid: "#162238",
  cream: "#FAF9F7", steelDark: "#E2E6EC",
  green: "#2ECC8A", blue: "#60A5FA", purple: "#A78BFA",
  yellow: "#FBBF24", red: "#F87171", teal: "#2DD4BF",
  text: "#1A1A1A", muted: "#6B7280", white: "#FFFFFF",
};
const F = { serif: "'DM Serif Display',Georgia,serif", sans: "'DM Sans',sans-serif" };
// Step3 preview pricing (€ per 1000 flyers — simplified estimate formula)
const BASE_PRICES  = { d2d: 1.85, h2h: 2.20, b2b: 3.50 };
// Step4 canonical pricing (€ per 1000 flyers — final quote formula, 10Ã— denominator differs)
const QUOTE_PRICES = { d2d: 18.5, h2h: 22.0, b2b: 35.0 };
const MONTHS_FULL  = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const MONTHS_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
class Step2ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, info: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { this.setState({ info }); console.error('[Step2ErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, background: '#0F1A30', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2 style={{ color: '#F87171', marginBottom: 16 }}> Step2 Runtime Error</h2>
          <pre style={{ color: '#FBBF24', background: '#1a2a40', padding: 20, borderRadius: 8, overflow: 'auto', fontSize: 13, lineHeight: 1.5 }}>
            {this.state.error?.toString()}{'\n\n'}
            {this.state.error?.stack}
          </pre>
          <pre style={{ color: '#60A5FA', background: '#1a2a40', padding: 20, borderRadius: 8, marginTop: 16, overflow: 'auto', fontSize: 11, lineHeight: 1.5 }}>
            {this.state.info?.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
function Bootstrap() {
  useEffect(() => {
    if (!document.getElementById("vp-f")) {
      const l = document.createElement("link"); l.id = "vp-f"; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap";
      document.head.appendChild(l);
    }
    if (!document.getElementById("vp-css")) {
      const s = document.createElement("style"); s.id = "vp-css";
      s.textContent = `html,body{overflow-x:hidden}*{box-sizing:border-box;margin:0;padding:0}
      @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
      @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}.fu{animation:fadeUp.5s ease both}.fu1{animation:fadeUp.5s.1s ease both}.fu2{animation:fadeUp.5s.2s ease both}.fu3{animation:fadeUp.5s.3s ease both}.fadein{animation:fadeIn.35s ease both}.vb:hover{filter:brightness(1.1);transform:translateY(-2px);box-shadow:0 8px 24px rgba(232,87,26,0.35)!important}.vb{transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1)}.btn:hover{filter:brightness(1.09);transform:translateY(-1px)}.btn{transition:all.18s}.vc:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(0,0,0,.13)}.vc{transition:all.22s}.nl:hover{color:#fff!important}.nl{transition:color.2s}.rh:hover{background:rgba(255,255,255,.06)!important}
      .section{padding-top:128px;padding-bottom:128px}.section-tight{padding-top:64px;padding-bottom:64px}.section-inner-gap{display:flex;flex-direction:column;gap:48px}.trust-bar-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:32px}.trust-bar-logos{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:24px;align-items:center}.trust-bar-logos img{max-width:100%;max-height:42px;filter:grayscale(1);opacity:.6;transition:filter .18s ease,opacity .18s ease}.trust-bar-logos img:hover{filter:grayscale(0);opacity:1}.services-grid,.results-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.servizio-card{min-height:520px;display:flex;flex-direction:column;background:#242424;border-radius:16px;padding:32px 28px;border:.5px solid rgba(255,255,255,.08);transition:border-color .3s ease,transform .3s ease}.servizio-card:hover{border-color:rgba(232,87,26,.4);transform:translateY(-2px)}.faq-layout{display:grid;grid-template-columns:minmax(260px,.75fr) 1.25fr;gap:72px;align-items:start}.faq-sticky{position:sticky;top:96px}.faq-row{border-bottom:.5px solid rgba(0,0,0,.1);transition:background .3s ease}.faq-row:hover{background:rgba(232,87,26,.04)}.testimonial-card{min-height:430px;display:flex;flex-direction:column;background:#242424;border-radius:16px;padding:40px 32px;border:.5px solid rgba(255,255,255,.08)}.footer-grid{display:grid;grid-template-columns:1.35fr repeat(3,1fr);gap:56px}.footer-bottom{margin-top:64px;padding-top:24px;border-top:.5px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:space-between;gap:20px;color:rgba(255,255,255,.45);font-size:12px;font-family:"DM Sans",Inter,system-ui,sans-serif}
      input:focus,select:focus{outline:none!important}
      select option{background:#162238;color:white}
      @media(max-width:980px){.services-grid,.results-grid{grid-template-columns:1fr}.faq-layout{grid-template-columns:1fr;gap:44px}.faq-sticky{position:static}.footer-grid{grid-template-columns:repeat(2,1fr);gap:42px 32px}.smart-pairing-layout{grid-template-columns:1fr!important;gap:42px!important}.steps-grid{grid-template-columns:1fr!important}}@media(max-width:768px){.section{padding-top:64px!important;padding-bottom:64px!important;padding-left:20px!important;padding-right:20px!important}.section-tight{padding-top:48px!important;padding-bottom:48px!important;padding-left:20px!important;padding-right:20px!important}.trust-bar-metrics{grid-template-columns:repeat(2,1fr)}.trust-bar-logos{grid-template-columns:repeat(2,minmax(0,1fr))}.landing-h2{font-size:28px!important;letter-spacing:-.02em!important}.footer-bottom{display:grid;justify-content:stretch}}@media(max-width:760px){button,input,select,textarea{min-height:44px}}`;
      document.head.appendChild(s);
    }
  }, []);
  return null;
}

function SeoMeta({ page }) {
  useEffect(() => {
    const metaByPage = {
      home: ["VolantiniPro | Volantinaggio misurabile con GPS e report", "Configura campagne Door to Door, Hand to Hand e Business Distribution con analisi zona, Smart Pairing, GPS e PDF report."],
      login: ["Login cliente | VolantiniPro", "Accedi alla dashboard VolantiniPro con magic link sicuro via email."],
      dashboard: ["Dashboard cliente | VolantiniPro", "Monitora campagne, tracking GPS, Smart Pairing e report finali."],
      campaign: ["Dashboard campagna | VolantiniPro", "Stato campagna, percorso GPS, statistiche di distribuzione, proof foto e report PDF."],
      privacy: ["Privacy Policy | VolantiniPro", "Informativa privacy per clienti e utenti VolantiniPro."],
      terms: ["Termini e condizioni | VolantiniPro", "Condizioni d'uso del servizio VolantiniPro."],
      cookie: ["Cookie Policy | VolantiniPro", "Informazioni sui cookie tecnici, analytics e preferenze del sito VolantiniPro."],
    };
const [title, description] = metaByPage[page] || metaByPage.home;
    document.title = title;
const setMeta = (selector, attr, value) => {
      let el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
const match = selector.match(/\[(name|property)="([^"]+)"\]/);
        if (match) el.setAttribute(match[1], match[2]);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:type"]', "content", "website");
    setMeta('meta[property="og:url"]', "content", window.location.href);
  }, [page]);
  return null;
}

function CountUp({ end, suffix = "", duration = 2000 }) {
  const [n, setN] = useState(0);
const ref = useRef();
const done = useRef(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting && !done.current) { done.current = true;
const t0 = Date.now();
const tick = () => { const p = Math.min((Date.now() - t0) / duration, 1); setN(Math.floor((1 - Math.pow(1 - p, 3)) * end)); if (p < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); } }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [end, duration]);
  return <span ref={ref}>{n.toLocaleString("it-IT", { useGrouping: true })}{suffix}</span>;
}

// Section

function useIsMobile(bp = 760) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < bp);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [bp]);
  return isMobile;
}

function Navbar({ onNav, page }) {
  const [sc, setSc] = useState(false);
const [menuOpen, setMenuOpen] = useState(false);
const isMobile = useIsMobile();
  useEffect(() => { const h = () => setSc(window.scrollY > 20); window.addEventListener("scroll", h); return () => window.removeEventListener("scroll", h); }, []);
const dark = page !== "home";
const navPosition = page === "home" ? "fixed" : "sticky";
const navLinks = ["Funzionalità", "Prezzi", "Risorse", "Chi siamo"];
const go = (target) => { setMenuOpen(false); onNav(target); };
  return (
    <nav style={{ position: navPosition, top: 0, left: 0, right: 0, zIndex: 200, background: dark || sc ? "rgba(5,10,20,.85)" : "transparent", borderBottom: (dark || sc) ? "1px solid rgba(255,255,255,.05)" : "none", transition: "background.35s", backdropFilter: "blur(16px)" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "0 16px" : "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => go("home")}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none"><path d="M16 3C11.03 3 7 7.03 7 12c0 7 9 17 9 17s9-10 9-17c0-4.97-4.03-9-9-9Z" fill={C.orange} /><circle cx="16" cy="12" r="3.2" fill="#ffe7dc" /></svg>
          </div>
          <span style={{ fontFamily: F.sans, fontSize: 20, fontWeight: 900, letterSpacing: "-0.03em", color: C.white }}>Volantini<span style={{ color: C.orange }}>Pro</span></span>
        </div>
        {!isMobile && <div style={{ display: "flex", gap: 42 }}>{navLinks.map(l => <a key={l} className="nl" href="#" style={{ color: "rgba(255,255,255,.75)", textDecoration: "none", fontFamily: F.sans, fontSize: 15, fontWeight: 700, transition: "color 0.2s" }}>{l}{l === "Risorse" ? <span style={{ marginLeft: 5, color: "rgba(255,255,255,.4)", fontSize: 10 }}>▾</span> : null}</a>)}</div>}
        {!isMobile && <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <button onClick={() => go("login")} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.04)", color: C.white, fontFamily: F.sans, fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease" }}>Accedi</button>
          <button className="vb" onClick={() => go("step1")} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: `0 4px 14px rgba(232, 87, 26, 0.25), inset 0 1px 0 rgba(255,255,255,0.2)` }}>Configura la tua campagna</button>
        </div>}
        {isMobile && <button aria-label={menuOpen ? "Chiudi menu" : "Apri menu"} onClick={() => setMenuOpen(v => !v)} style={{ minWidth: 72, height: 44, borderRadius: 9, border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.06)", color: C.white, fontFamily: F.sans, fontSize: 12, fontWeight: 800, lineHeight: 1, cursor: "pointer" }}>{menuOpen ? "Chiudi" : "Menu"}</button>}
      </div>
      {isMobile && menuOpen && (
        <div style={{ padding: "8px 16px 16px", borderTop: "1px solid rgba(255,255,255,.08)", background: "rgba(10,18,34,.98)" }}>
          <div style={{ display: "grid", gap: 8 }}>
            {navLinks.map(l => <a key={l} href="#" className="nl" onClick={() => setMenuOpen(false)} style={{ minHeight: 44, display: "flex", alignItems: "center", color: "rgba(255,255,255,.7)", textDecoration: "none", fontFamily: F.sans, fontSize: 14, fontWeight: 600 }}>{l}</a>)}
            <button onClick={() => go("admin")} style={{ minHeight: 44, borderRadius: 9, border: "1px solid rgba(232,87,26,.35)", background: "rgba(232,87,26,.1)", color: C.orange, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Admin</button>
            <button onClick={() => go("login")} style={{ minHeight: 44, borderRadius: 9, border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Accedi</button>
            <button className="vb" onClick={() => go("step1")} style={{ minHeight: 48, borderRadius: 9, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: `0 4px 14px rgba(232, 87, 26, 0.25)` }}>Configura la tua campagna</button>
          </div>
        </div>
      )}
    </nav>
  );
}

// Section
function StepperBar({ current, onGo }) {
  const steps = ["Tipo campagna", "Zona & Mappa", "Smart Pairing", "Preventivo"];
const ids = ["step1", "step2", "step3", "step4"];
const idx = ids.indexOf(current);
  return (
    <div style={{ background: "rgba(10,18,34,.98)", borderBottom: "1px solid rgba(255,255,255,.07)", padding: "0 28px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", height: 60 }}>
        {steps.map((s, i) => {
          const done = i < idx, active = i === idx;
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div onClick={() => done && onGo(ids[i])} style={{ display: "flex", alignItems: "center", gap: 9, cursor: done ? "pointer" : "default", opacity: done || active ? 1 :.36 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: done ? C.green : active ? C.orange : "rgba(255,255,255,.1)", border: active ? `2px solid ${C.orange}` : "none", flexShrink: 0 }}>
                  {done ? <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2 5.5l2.5 2.5 4-4.5" stroke="white" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    : <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.white }}>{i + 1}</span>}
                </div>
                <span style={{ fontFamily: F.sans, fontSize: 14, fontWeight: active ? 800 : 600, color: active ? C.white : "rgba(255,255,255,.7)", whiteSpace: "nowrap" }}>{s}</span>
              </div>
              {i < 3 && <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.07)", margin: "0 14px" }} />}
            </div>
          );
        })}
        <button onClick={() => onGo("home")} style={{ marginLeft: "auto", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 7, padding: "5px 12px", color: "rgba(255,255,255,.5)", fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            Home
        </button>
      </div>
    </div>
  );
}

// Section
// HOME PAGE
// Section

function MiniDashboard() {
  const [active, setActive] = useState(0);
const zones = [{ name: "Cormano", families: 8420, cov: 92, c: C.orange }, { name: "Bresso", families: 11200, cov: 87, c: "#FF8C42" }, { name: "Cusano M.", families: 6100, cov: 78, c: "#FFB347" }];
const kpis = [
    { l: "Famiglie", v: "25.720", c: C.orange },
    { l: "Raggio", v: "3 km", c: C.green },
    { l: "Comuni", v: "3", c: C.blue },
    { l: "Output", v: "Report", c: C.purple }
  ];
  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 20, overflow: "hidden", boxShadow: "0 40px 80px rgba(0,0,0,.5)" }}>
      <div style={{ background: "rgba(255,255,255,.05)", padding: "11px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
        <div style={{ flex: 1, marginLeft: 10, background: "rgba(255,255,255,.06)", borderRadius: 6, padding: "3px 12px", fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,.3)" }}>volantinipro.it/configuratore/zona</div>
      </div>
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {kpis.map(({ l, v, c }) => (
            <div key={l} style={{ background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "10px", border: "1px solid rgba(255,255,255,.06)" }}>
              <div style={{ fontFamily: F.serif, fontSize: 18, color: c }}>{v}</div><div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.4)", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 164, borderRadius: 12, overflow: "hidden", position: "relative", background: "linear-gradient(135deg,#193328 0%,#1a2a3a 50%,#27233d 100%)", border: "1px solid rgba(255,255,255,.06)" }}>
          <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
            <defs><pattern id="g" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,.04)" strokeWidth=".5" /></pattern></defs>
            <rect width="100%" height="100%" fill="url(#g)" />
            <ellipse cx="45%" cy="50%" rx="30%" ry="36%" fill="rgba(232,87,26,.16)" stroke="rgba(232,87,26,.45)" strokeWidth="1.5" />
            <ellipse cx="62%" cy="38%" rx="16%" ry="20%" fill="rgba(96,165,250,.16)" stroke="rgba(96,165,250,.35)" strokeWidth="1" />
            <path d="M95 112 C140 86 184 118 234 70" stroke="rgba(46,204,138,.75)" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="45%" cy="50%" r="5" fill={C.orange} /><circle cx="62%" cy="38%" r="4" fill={C.blue} /><circle cx="32%" cy="62%" r="4" fill={C.green} />
          </svg>
          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(15,26,48,.9)", backdropFilter: "blur(8px)", borderRadius: 7, padding: "6px 10px", fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.68)", border: "1px solid rgba(255,255,255,.07)" }}>Analisi raggio: 3 km</div>
          <div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(15,26,48,.9)", backdropFilter: "blur(8px)", borderRadius: 7, padding: "6px 10px", fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.68)", border: "1px solid rgba(255,255,255,.07)" }}>ISTAT + Mapbox + GPS</div>
          <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 5 }}>
            {["Comuni nel raggio", "Dati territoriali", "Output operativo"].map(x => <span key={x} style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 6, padding: "4px 8px", fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.68)" }}>{x}</span>)}
          </div>
        </div>
        {zones.map((z, i) => (
          <div key={z.name} onClick={() => setActive(i)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, cursor: "pointer", background: active === i ? "rgba(232,87,26,.1)" : "rgba(255,255,255,.03)", border: `1px solid ${active === i ? "rgba(232,87,26,.25)" : "rgba(255,255,255,.05)"}`, transition: "all.2s" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: z.c, flexShrink: 0 }} />
            <span style={{ fontFamily: F.sans, fontSize: 12, color: C.white, flex: 1 }}>{z.name}</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,.45)" }}>{z.families.toLocaleString("it-IT", { useGrouping: true })} famiglie</span>
            <div style={{ width: 50, height: 3, borderRadius: 2, background: "rgba(255,255,255,.1)", overflow: "hidden" }}><div style={{ width: `${z.cov}%`, height: "100%", background: z.c, borderRadius: 2 }} /></div>
            <span style={{ fontFamily: F.sans, fontSize: 10, color: z.c, width: 30, textAlign: "right" }}>{z.cov}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomePage({onStart:n}){const i=()=>document.getElementById("come-funziona")?.scrollIntoView({behavior:"smooth",block:"start"}),[r,l]=useState(!1),[u,h]=useState({city:"",qty:"5000",service:"Door to Door"}),f=Math.max(180,Math.round((Number(u.qty)||0)*(u.service==="Door to Door" ?.13 : u.service==="Hand to Hand" ?.18 :.22))),m=[{t:"Piattaforma",items:[["Configuratore","step1"],["Preventivo rapido","quick"],["Come funziona","home"],["Tracking GPS","campaign"]]},{t:"Servizi",items:[["Door to Door","step1"],["Hand to Hand","step1"],["Business Distribution","step1"],["Report campagna","campaign"]]},{t:"Risorse",items:[["Servizi","home"],["Supporto","consultant"],["Privacy","privacy"],["Termini","terms"],["Cookie","cookie"]]}];useEffect(()=>{const D=()=>l(window.innerWidth<760);return D(),window.addEventListener("resize",D),()=>window.removeEventListener("resize",D)},[]);const[kpiBandVisible,setKpiBandVisible]=useState(!0),kpiBandRef=useRef(null);useEffect(()=>{const D=kpiBandRef.current;if(!D)return;const W=new IntersectionObserver(([A])=>{A.isIntersecting&&(setKpiBandVisible(!0),W.disconnect())},{threshold:.25});return W.observe(D),()=>W.disconnect()},[]);
const x=[{value:"ISTAT",l:"Dati reali",src:"Fonti territoriali"},{value:"GIS",l:"Analisi zona",src:"Mappa e raggio"},{value:"GPS",l:"Tracking operativo",src:"Verifica campo"},{value:"PDF",l:"Report e prove",src:"Output verificabile"}],w=["Dati ISTAT ufficiali","GPS certificato","No vincoli mensili"],j=["Retail locale","Food locale","Casa e servizi","Fitness locale","Attività locale"],T=[{n:"01",t:"Configura campagna",d:"Scegli servizio, quantità, formato, stampa e frequenza della distribuzione.",b:"Servizio + quantità",c:C.orange},{n:"02",t:"Zona e mappa",d:"Imposta comune e raggio, poi verifica famiglie ISTAT, comuni coinvolti, copertura e volantini consigliati.",b:"Analisi territoriale",c:C.orange},{n:"03",t:"Pianificazione",d:"Scegli il periodo desiderato. Smart Pairing resta opzionale quando esistono campagne compatibili.",b:"Date + opzioni",c:C.orange},{n:"04",t:"Preventivo completo",d:"Controlla riepilogo campagna, servizi, dati territoriali disponibili e prezzo finale calcolato.",b:"Riepilogo + prezzo",c:C.orange}],z=[{name:"Door to Door",icon:"D2D",desc:"Distribuzione in cassette postali, condomini, palazzi, villette e zone residenziali.",features:["Famiglie stimate","Popolazione stimata","Copertura zona","Volantini consigliati","Comuni nel raggio"],c:C.orange},{name:"Hand to Hand",icon:"H2H",desc:"Distribuzione manuale in punti ad alto passaggio.",features:["POI rilevanti","Fermate metro/bus/treno","Scuole, università, eventi","Flusso potenziale","Smart Pairing"],c:C.orange},{name:"Business Distribution",icon:"B2B",desc:"Distribuzione mirata ad attività commerciali, uffici e zone business.",features:["Attività rilevate","Categorie commerciali","Competitor vicini","Densità commerciale","Cluster zona"],c:C.orange}],R=[{n:"01",t:"Configura campagna",d:"Percorso completo in 4 step: campagna, zona, pianificazione e preventivo finale.",benefits:["Analisi ISTAT zona","Mappa e copertura","GPS e report verificabili","Smart Pairing opzionale"],cta:"Configura la tua campagna",c:C.orange,fn:()=>n("step1")},{n:"02",t:"Preventivo rapido",d:"Inserisci pochi dati e passa a un prezzo personalizzato calcolato su zona, quantità e servizio.",benefits:["3 campi essenziali","Prezzo personalizzato","Nessun account richiesto"],cta:"Preventivo rapido",c:C.orange,fn:()=>n("quick"),quick:!0},{n:"03",t:"Parla con un consulente",d:"Preferisci supporto diretto? Invia una richiesta e ti ricontattiamo.",benefits:["Brief gratuito","Scelta servizio guidata","Richiamo operativo","Tempo: immediato"],cta:"Parla con un consulente",c:C.orange,fn:()=>n("consultant")}];return _jsxs("div",{style:{background:C.navyDeep,paddingBottom:0},children:[_jsx(VolantiniProHeroMap,{onConfigure:()=>n("step1"),onLogin:()=>n("login"),onAdmin:()=>n("admin"),onHowItWorks:i}),_jsx(TrustBar,{metrics:[{value:"ISTAT",label:"Dati territoriali"},{value:"GIS",label:"Analisi zona"},{value:"GPS",label:"Tracking operativo"},{value:"PDF",label:"Report verificabili"}]}),_jsx(WhyDifferentSection,{}),_jsx("section",{className:"section",style:{background:C.cream,paddingLeft:28,paddingRight:28,borderTop:"1px solid rgba(0,0,0,.06)"},children:_jsxs("div",{style:{maxWidth:1200,margin:"0 auto"},children:[_jsxs("div",{style:{marginBottom:34},children:[_jsx("div",{style:{fontFamily:F.sans,fontSize:11,fontWeight:700,letterSpacing:".15em",textTransform:"uppercase",color:C.orange,marginBottom:12},children:"Tre modi per iniziare"}),_jsx("h2",{style:{fontFamily:F.serif,fontSize:46,color:C.navy,letterSpacing:"-1.4px",marginBottom:10},children:"Scegli il tuo punto di partenza."}),_jsx("p",{style:{fontFamily:F.sans,fontSize:16,color:C.muted,maxWidth:660,lineHeight:1.65},children:"Configurazione completa, stima rapida o supporto diretto: tre percorsi per ogni esigenza."})]}),_jsx("div", {
  className: "vp-start-grid",
  children: [
    _jsx("style", {
      children: `
        .vp-start-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          margin-bottom: 28px;
        }
        @media (min-width: 980px) {
          .vp-start-grid {
            grid-template-columns: 1.1fr 0.9fr;
          }
        }
        .vp-start-primary {
          background: #050a14;
          border-radius: 20px;
          padding: 44px 40px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 24px 64px rgba(0,0,0,.12);
          transition: transform 0.4s ease;
        }
        .vp-start-primary:hover {
          transform: translateY(-4px);
        }
        .vp-start-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .vp-start-secondary {
          background: #fff;
          border-radius: 16px;
          padding: 24px 28px;
          border: 1px solid rgba(0,0,0,.04);
          box-shadow: 0 8px 24px rgba(0,0,0,.02);
          display: flex;
          flex-direction: column;
          transition: transform 0.3s ease;
        }
        .vp-start-secondary:hover {
          transform: translateY(-2px);
          border-color: rgba(232,87,26,.2);
        }
      `
    }),
    _jsx("div", {
      className: "vp-start-primary",
      children: R.filter(c => c.n === "01").map(({ n: D, t: W, d: A, benefits: F, cta: B, c: P, fn: J }) => _jsxs("div", {
        key: W,
        style: { display: "flex", flexDirection: "column", height: "100%" },
        children: [
          _jsxs("div", {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 },
            children: [
              _jsx("div", { style: { width: 32, height: 4, borderRadius: 2, background: C.orange } }),
              _jsx("div", { style: { fontFamily: F.sans, fontWeight: 900, fontSize: 42, color: "rgba(255,255,255,.05)", lineHeight: 1 }, children: D })
            ]
          }),
          _jsx("h3", { style: { fontFamily: F.serif, fontSize: 34, color: "#fff", letterSpacing: "-.5px", marginBottom: 16 }, children: W }),
          _jsx("p", { style: { fontFamily: F.sans, fontSize: 16, color: "rgba(255,255,255,.65)", lineHeight: 1.6, marginBottom: 32 }, children: A }),
          _jsx("div", {
            style: { display: "grid", gap: 10, marginBottom: 40 },
            children: F.map(H => _jsxs("div", {
              key: H,
              style: { display: "flex", alignItems: "center", gap: 10, fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.7)" },
              children: [
                _jsx("span", { style: { width: 18, height: 18, borderRadius: "50%", background: `${C.orange}24`, color: C.orange, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, flexShrink: 0 }, children: "✓" }),
                H
              ]
            }))
          }),
          _jsx("button", {
            className: "vb",
            onClick: J,
            style: { marginTop: "auto", width: "100%", minHeight: 54, padding: "0 24px", borderRadius: 12, fontFamily: F.sans, fontSize: 16, fontWeight: 700, border: "none", background: C.orange, color: C.white, boxShadow: `0 8px 24px rgba(232,87,26,.3)`, cursor: "pointer", textAlign: "center", transition: "all 0.3s ease" },
            children: B
          })
        ]
      }))
    }),
    _jsx("div", {
      className: "vp-start-stack",
      children: R.filter(c => c.n !== "01").map(({ n: D, t: W, d: A, benefits: Fb, cta: B, c: P, fn: J, quick: V }) => _jsxs("div", {
        key: W,
        className: "vp-start-secondary",
        children: [
          _jsxs("div", {
            style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
            children: [
              _jsx("h3", { style: { fontFamily: F.serif, fontSize: 20, color: C.navy, letterSpacing: "-.3px", margin: 0 }, children: W }),
              _jsx("div", { style: { fontFamily: F.sans, fontWeight: 900, fontSize: 22, color: "rgba(0,0,0,.04)", lineHeight: 1 }, children: D })
            ]
          }),
          _jsx("p", { style: { fontFamily: F.sans, fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }, children: A }),
          V ? _jsxs("div", {
            style: { display: "grid", gap: 8, marginBottom: 16 },
            children: [
              _jsx("input", { value: u.city, onChange: H => h({ ...u, city: H.target.value }), placeholder: "Comune", style: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,.08)", background: "#f8fafc", color: C.navy, fontFamily: F.sans, fontSize: 13 } }),
              _jsxs("div", {
                style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
                children: [
                  _jsxs("select", {
                    value: u.service, onChange: H => h({ ...u, service: H.target.value }), style: { width: "100%", padding: "8px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,.08)", background: "#f8fafc", color: C.navy, fontFamily: F.sans, fontSize: 13 },
                    children: [
                      _jsx("option", { children: "Door to Door" }),
                      _jsx("option", { children: "Hand to Hand" }),
                      _jsx("option", { children: "Business Distribution" })
                    ]
                  }),
                  _jsx("input", { value: u.qty, onChange: H => h({ ...u, qty: H.target.value.replace(/\D/g, "") }), placeholder: "Volantini", inputMode: "numeric", style: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,.08)", background: "#f8fafc", color: C.navy, fontFamily: F.sans, fontSize: 13 } })
                ]
              })
            ]
          }) : null,
          _jsx("button", {
            className: "vb",
            onClick: J,
            style: { marginTop: "auto", width: "100%", minHeight: 44, padding: "0 20px", borderRadius: 8, fontFamily: F.sans, fontSize: 14, fontWeight: 700, border: V ? "1px solid rgba(0,0,0,.15)" : "none", background: V ? C.white : "rgba(0,0,0,.03)", color: C.navy, cursor: "pointer", textAlign: "center", transition: "all 0.3s ease" },
            children: B
          })
        ]
      }))
    })
  ]
})]})}),_jsx("section",{ref:kpiBandRef,className:"section-tight",style:{display:"none",background:C.navy,paddingLeft:28,paddingRight:28,borderTop:`3px solid ${C.orange}`,opacity:kpiBandVisible?1:0,transform:kpiBandVisible?"none":"translateY(22px)",transition:"opacity .5s ease, transform .7s cubic-bezier(.2,.8,.2,1)",willChange:"transform, opacity"},children:_jsx("div",{style:{maxWidth:1200,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:2},children:x.map(({value:D,l:W,src:A},F)=>_jsxs("div",{style:{padding:"34px 26px",borderLeft:F>0?"1px solid rgba(255,255,255,.07)":"none"},children:[_jsx("div",{style:{width:26,height:3,background:C.orange,borderRadius:2,marginBottom:16}}),_jsx("div",{style:{fontFamily:F.serif,fontSize:typeof D=="string"&&D.length>8?34:50,color:C.white,letterSpacing:"-1.4px",lineHeight:1,marginBottom:10,fontVariantNumeric:"tabular-nums"},children:D}),_jsx("div",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.8)",lineHeight:1.4,marginBottom:8},children:W}),_jsx("div",{style:{display:"inline-flex",padding:"3px 7px",borderRadius:4,background:"rgba(232,87,26,.12)",fontFamily:F.sans,fontSize:9,color:C.orange},children:A})]},W))})}),_jsx("section",{id:"come-funziona",className:"section",style:{background:C.cream,paddingLeft:28,paddingRight:28,scrollMarginTop:80},children:_jsxs("div",{style:{maxWidth:1200,margin:"0 auto"},children:[_jsxs("div",{style:{marginBottom:64},children:[_jsx("div",{style:{fontFamily:F.sans,fontSize:11,fontWeight:700,letterSpacing:".15em",textTransform:"uppercase",color:C.orange,marginBottom:12},children:"Dall'idea al volantino in mano"}),_jsxs("h2",{style:{fontFamily:F.serif,fontSize:48,color:C.navy,letterSpacing:"-1.5px",marginBottom:14,lineHeight:1.06},children:["Dall'idea alla campagna",_jsx("br",{}),"in 4 step misurabili."]}),_jsx("p",{style:{fontFamily:F.sans,fontSize:16,color:C.muted,maxWidth:520,lineHeight:1.65},children:"Un flusso unico per definire servizio, zona, date operative e preventivo finale."})]}),_jsx("div",{className:"steps-grid",style:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12},children:T.map(({n:D,t:W,d:A,b:F,c:B},P)=>_jsxs("div",{className:"vc",style:{padding:"34px 28px",background:C.white,borderRadius:16,border:"1px solid rgba(0,0,0,.04)",boxShadow:"0 8px 24px rgba(0,0,0,.02)",position:"relative",overflow:"hidden"},children:[_jsx("div",{style:{position:"absolute",top:-8,right:12,fontFamily:F.sans,fontWeight:900,fontSize:94,color:"#F4F6F8",lineHeight:1,userSelect:"none"},children:D}),_jsx("div",{style:{width:24,height:3,borderRadius:2,background:B,marginBottom:24}}),_jsx("h3",{style:{fontFamily:F.serif,fontSize:22,color:C.navy,marginBottom:12,letterSpacing:"-.3px"},children:W}),_jsx("p",{style:{fontFamily:F.sans,fontSize:14,color:C.muted,lineHeight:1.6,marginBottom:20},children:A}),_jsx("div",{style:{display:"inline-flex",padding:"4px 10px",borderRadius:6,background:`${B}12`,fontFamily:F.sans,fontSize:11,fontWeight:700,color:B},children:F})]},D))}),_jsx("div",{style:{textAlign:"center",marginTop:56},children:_jsx("button",{className:"vb",onClick:()=>n("step1"),style:{padding:"14px 34px",borderRadius:8,border:"none",background:C.orange,color:C.white,fontFamily:F.sans,fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:`0 6px 16px rgba(232, 87, 26, 0.25)`},children:"Configura la tua campagna "})})]})}),_jsx(ServicesSection,{onConfigure:()=>n("step1")}),_jsx(FeatureZonaMappa,{onConfigure:()=>n("step1")}),_jsx(FeatureSmartPairing,{onConfigure:()=>n("step1")}),_jsx(RisultatiSection,{}),_jsx(FAQSection,{onContact:()=>n("consultant")}),_jsx(PricingSection,{onConfigure:()=>n("step1"),onConsultant:()=>n("consultant")}),_jsx(Footer,{onNav:n,onHowItWorks:i}),_jsx("footer",{style:{display:"none",background:"#070D1A",borderTop:"1px solid rgba(255,255,255,.05)",padding:"52px 28px 34px"},children:_jsxs("div",{style:{maxWidth:1200,margin:"0 auto"},children:[_jsxs("div",{style:{display:"flex",gap:64,marginBottom:44},children:[_jsxs("div",{style:{flex:"0 0 250px"},children:[_jsxs("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:16},children:[_jsx("div",{style:{width:30,height:30,borderRadius:7,background:C.orange,display:"flex",alignItems:"center",justifyContent:"center"},children:_jsxs("svg",{width:"16",height:"16",viewBox:"0 0 20 20",fill:"none",children:[_jsx("path",{d:"M3 17L10 3L17 17H3Z",fill:"white"}),_jsx("circle",{cx:"10",cy:"12",r:"2",fill:"white",opacity:".7"})]})}),_jsxs("span",{style:{fontFamily:F.serif,fontSize:18,color:C.white},children:["Volantini",_jsx("span",{style:{color:C.orange},children:"Pro"})]})]}),_jsx("p",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.33)",lineHeight:1.65,marginBottom:16},children:"Piattaforma B2B per configurare campagne di volantinaggio con dati territoriali, GPS e report operativo."}),_jsx("div",{style:{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:6,background:"rgba(232,87,26,.1)",fontFamily:F.sans,fontSize:11,color:C.orange},children:"Operativo su Milano e Lombardia"})]}),_jsx("div",{style:{display:"flex",gap:52,flex:1},children:m.map(({t:D,items:W})=>_jsxs("div",{children:[_jsx("div",{style:{fontFamily:F.sans,fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:C.orange,marginBottom:16},children:D}),_jsx("div",{style:{display:"flex",flexDirection:"column",gap:9},children:W.map(([A,F])=>_jsx("button",{onClick:()=>F==="home"&&A==="Come funziona"?i():n(F),style:{padding:0,border:"none",background:"transparent",textAlign:"left",fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.6)",cursor:"pointer"},children:A},A))})]},D))})]}),_jsxs("div",{style:{borderTop:"1px solid rgba(255,255,255,.05)",paddingTop:24,display:"flex",justifyContent:"space-between"},children:[_jsx("span",{style:{fontFamily:F.sans,fontSize:12,color:"rgba(255,255,255,.2)"},children:"2025 VolantiniPro S.r.l. - Milano"}),_jsx("span",{style:{display:"flex",gap:10,alignItems:"center"},children:[["Privacy","privacy"],["Termini","terms"],["Cookie","cookie"]].map(([D,W])=>_jsx("button",{onClick:()=>n(W),style:{padding:0,border:"none",background:"transparent",fontFamily:F.sans,fontSize:12,color:"rgba(255,255,255,.2)",cursor:"pointer"},children:D},D))})]})]})})]})}

// JSX runtime shim for reconstructed bundle code
function _jsx(type, props, key) {
  if (!props) return React.createElement(type, null);
const { children,...rest } = props;
  if (key !== undefined) rest.key = key;
  if (children === undefined) return React.createElement(type, rest);
  if (Array.isArray(children)) return React.createElement(type, rest,...children);
  return React.createElement(type, rest, children);
}
const _jsxs = _jsx;
const GEO_DATA=[{id:"cormano",name:"Cormano",lat:45.551,lng:9.163},{id:"sesto",name:"Sesto San Giovanni",lat:45.533,lng:9.237},{id:"bresso",name:"Bresso",lat:45.542,lng:9.192},{id:"cinisello",name:"Cinisello Balsamo",lat:45.559,lng:9.212},{id:"monza",name:"Monza",lat:45.584,lng:9.274},{id:"niguarda",name:"Milano Niguarda",lat:45.507,lng:9.188},{id:"varedo",name:"Varedo",lat:45.574,lng:9.161},{id:"paderno",name:"Paderno Dugnano",lat:45.568,lng:9.163},{id:"cusano",name:"Cusano Milanino",lat:45.551,lng:9.18},{id:"quarto",name:"Quarto Oggiaro",lat:45.5,lng:9.137},{id:"senago",name:"Senago",lat:45.576,lng:9.13}],ZONE_DATA=[{id:"cormano",name:"Cormano",area:6.8,pop:21800,families:8500,mailboxes:7100,coverage:78,flyersMin:1e4,flyersMax:12e3,operDays:3,familyIdx:72,reachD2D:84,roiD2D:68,confD2D:81,eta14:null,eta34:null,eta64:null,eta65:null,genderM:49,genderF:51,areaType:"Residenziale mista",poi:145,nearbyBiz:38,commDens:61,flowScore:74,transitStops:23,trainStations:3,operDaysH2H:2,reachH2H:79,roiH2H:65,confH2H:76,hotspots:"Piazza centrale – Stazione",timeSlots:"08-10 – 12-14",strongPts:7,bizTotal:92,competitors:11,commDensB2B:74,operDaysB2B:2,cdIdx:74,reachB2B:82,roiB2B:71,confB2B:80,clusters:3,topCats:"Retail – Food – Servizi",targetBiz:41,strongZone:"Asse centrale",reddito:24200,densita:3200,stranieri:10.4,indVec:189,occup:65.2,imprese:1240,dist:{cormano:0,sesto:5.8,bresso:3.1,cinisello:3.9,monza:10.1,niguarda:4.8,varedo:2.8,paderno:1.4,cusano:1.8,quarto:5.2,senago:3.8}},{id:"bresso",name:"Bresso",area:3.1,pop:27100,families:11200,mailboxes:9400,coverage:87,flyersMin:13e3,flyersMax:15e3,operDays:2,familyIdx:80,reachD2D:88,roiD2D:74,confD2D:85,eta14:null,eta34:null,eta64:null,eta65:null,genderM:48,genderF:52,areaType:"Urbano residenziale",poi:198,nearbyBiz:54,commDens:71,flowScore:82,transitStops:14,trainStations:1,operDaysH2H:2,reachH2H:83,roiH2H:70,confH2H:80,hotspots:"Corso principale – Metro",timeSlots:"08-10 – 17-19",strongPts:5,bizTotal:120,competitors:18,commDensB2B:79,operDaysB2B:1,cdIdx:79,reachB2B:85,roiB2B:74,confB2B:82,clusters:4,topCats:"Food – Retail – Salute",targetBiz:54,strongZone:"Via principale",reddito:25800,densita:8900,stranieri:12.8,indVec:150,occup:66.8,imprese:1980,dist:{cormano:3.1,sesto:4.2,bresso:0,cinisello:2.8,monza:8.9,niguarda:2.1,varedo:4.8,paderno:4,cusano:2.9,quarto:7.4,senago:6.1}},{id:"cinisello",name:"Cinisello Balsamo",area:12.1,pop:73800,families:29100,mailboxes:24800,coverage:92,flyersMin:3e4,flyersMax:36e3,operDays:6,familyIdx:75,reachD2D:90,roiD2D:72,confD2D:88,eta14:null,eta34:null,eta64:null,eta65:null,genderM:48,genderF:52,areaType:"Misto residenziale",poi:320,nearbyBiz:98,commDens:78,flowScore:88,transitStops:18,trainStations:2,operDaysH2H:3,reachH2H:87,roiH2H:74,confH2H:84,hotspots:"C.C. – Stazione – Piazze",timeSlots:"08-10 – 12-14 – 17-19",strongPts:9,bizTotal:210,competitors:32,commDensB2B:82,operDaysB2B:3,cdIdx:82,reachB2B:88,roiB2B:76,confB2B:85,clusters:7,topCats:"Retail – Food – Uffici",targetBiz:94,strongZone:"C.C. + direzionale",reddito:23400,densita:5800,stranieri:15.2,indVec:154,occup:65.4,imprese:4800,dist:{cormano:3.9,sesto:2.2,bresso:2.8,cinisello:0,monza:5.8,niguarda:3.4,varedo:5.6,paderno:4.8,cusano:3.1,quarto:8.2,senago:4.4}},{id:"varedo",name:"Varedo",area:4.2,pop:13200,families:5400,mailboxes:3800,coverage:100,flyersMin:6e3,flyersMax:7e3,operDays:2,familyIdx:68,reachD2D:76,roiD2D:60,confD2D:78,eta14:null,eta34:null,eta64:null,eta65:null,genderM:49,genderF:51,areaType:"Bassa densità",poi:82,nearbyBiz:22,commDens:44,flowScore:46,transitStops:6,trainStations:1,operDaysH2H:1,reachH2H:62,roiH2H:52,confH2H:68,hotspots:"Piazza municipio",timeSlots:"08-10 – 16-18",strongPts:3,bizTotal:48,competitors:6,commDensB2B:52,operDaysB2B:1,cdIdx:52,reachB2B:64,roiB2B:55,confB2B:70,clusters:2,topCats:"Bar – Retail",targetBiz:21,strongZone:"Centro storico",reddito:22800,densita:3140,stranieri:8.4,indVec:203,occup:62.8,imprese:620,dist:{cormano:2.8,sesto:7.4,bresso:4.8,cinisello:5.6,monza:8.8,niguarda:6.2,varedo:0,paderno:1.8,cusano:3.2,quarto:6.4,senago:2.2}},{id:"paderno",name:"Paderno Dugnano",area:10.8,pop:37800,families:15200,mailboxes:12800,coverage:82,flyersMin:16e3,flyersMax:19e3,operDays:4,familyIdx:71,reachD2D:82,roiD2D:65,confD2D:80,eta14:null,eta34:null,eta64:null,eta65:null,genderM:49,genderF:51,areaType:"Residenziale mista",poi:168,nearbyBiz:48,commDens:62,flowScore:68,transitStops:14,trainStations:1,operDaysH2H:2,reachH2H:76,roiH2H:62,confH2H:74,hotspots:"Stazione – Piazze – Mercato",timeSlots:"08-10 – 12-14",strongPts:5,bizTotal:108,competitors:14,commDensB2B:68,operDaysB2B:2,cdIdx:68,reachB2B:77,roiB2B:64,confB2B:76,clusters:4,topCats:"Food – Retail – Salute",targetBiz:48,strongZone:"Asse ferroviario",reddito:23200,densita:3500,stranieri:11.2,indVec:167,occup:64.2,imprese:2100,dist:{cormano:1.4,sesto:5.2,bresso:4,cinisello:4.8,monza:9.2,niguarda:5.8,varedo:1.8,paderno:0,cusano:2.4,quarto:5.8,senago:3.4}},{id:"sesto",name:"Sesto S. Giovanni",area:11.6,pop:81200,families:33500,mailboxes:28200,coverage:94,flyersMin:34e3,flyersMax:4e4,operDays:6,familyIdx:77,reachD2D:91,roiD2D:75,confD2D:89,eta14:null,eta34:null,eta64:null,eta65:null,genderM:48,genderF:52,areaType:"Urbano denso",poi:380,nearbyBiz:112,commDens:82,flowScore:90,transitStops:22,trainStations:3,operDaysH2H:3,reachH2H:89,roiH2H:77,confH2H:86,hotspots:"Metro M1 – Centro – Stazione",timeSlots:"07-09 – 12-14 – 17-19",strongPts:11,bizTotal:280,competitors:42,commDensB2B:86,operDaysB2B:3,cdIdx:86,reachB2B:91,roiB2B:79,confB2B:88,clusters:8,topCats:"Retail – Food – Uffici",targetBiz:126,strongZone:"P.za Resistenza",reddito:26200,densita:6200,stranieri:14.8,indVec:181,occup:67.2,imprese:6200,dist:{cormano:5.8,sesto:0,bresso:4.2,cinisello:2.2,monza:7.1,niguarda:3.8,varedo:7.4,paderno:5.2,cusano:4.9,quarto:9.4,senago:7.2}},{id:"cusano",name:"Cusano Milanino",area:4,pop:19300,families:7600,mailboxes:6200,coverage:85,flyersMin:8e3,flyersMax:1e4,operDays:2,familyIdx:70,reachD2D:80,roiD2D:64,confD2D:79,eta14:null,eta34:null,eta64:null,eta65:null,genderM:49,genderF:51,areaType:"Medio-alta",poi:124,nearbyBiz:36,commDens:58,flowScore:62,transitStops:8,trainStations:0,operDaysH2H:2,reachH2H:72,roiH2H:60,confH2H:72,hotspots:"Centro – Parco",timeSlots:"08-10 – 16-18",strongPts:4,bizTotal:78,competitors:9,commDensB2B:62,operDaysB2B:1,cdIdx:62,reachB2B:74,roiB2B:62,confB2B:74,clusters:3,topCats:"Retail – Salute",targetBiz:35,strongZone:"Via Roma + centro",reddito:24800,densita:4800,stranieri:9.8,indVec:188,occup:64.8,imprese:980,dist:{cormano:1.8,sesto:4.9,bresso:2.9,cinisello:3.1,monza:9.4,niguarda:4.2,varedo:3.2,paderno:2.4,cusano:0,quarto:6.8,senago:3.2}}],LAYERS={d2d:[{id:"families",label:"Famiglie",field:"families",fmt:n=>n.toLocaleString("it-IT", { useGrouping: true }),unit:"nuclei",src:"ISTAT",lo:"#FFF5F0",hi:"#C2410C"},{id:"pop",label:"Popolazione",field:"pop",fmt:n=>n.toLocaleString("it-IT", { useGrouping: true }),unit:"ab.",src:"ISTAT",lo:"#EFF6FF",hi:"#1E3A8A"},{id:"densita",label:"Densità ab.",field:"densita",fmt:n=>n.toLocaleString("it-IT", { useGrouping: true }),unit:"ab/km²",src:"ISTAT",lo:"#F5F3FF",hi:"#4C1D95"},{id:"coverage",label:"Peso sul totale",field:"coverage",fmt:n=>n+"%",unit:"%",src:"Dati geografici",lo:"#ECFDF5",hi:"#065F3C"},{id:"flyersMin",label:"Volantini consigliati",field:"flyersMin",fmt:n=>n.toLocaleString("it-IT", { useGrouping: true })+"+",unit:"pz.",src:"Analisi interna",lo:"#F0F9FF",hi:"#075985"},{id:"familyIdx",label:"Residential relevance",field:"familyIdx",fmt:n=>n+"/100",unit:"/100",src:"Analisi interna",lo:"#FDF2F8",hi:"#701A75"},{id:"eta65",label:"Età 65+",field:"eta65",fmt:n=>n+"%",unit:"over 65",src:"ISTAT",lo:"#FFFBEB",hi:"#78350F"}],h2h:[{id:"flowScore",label:"Intensità passaggio",field:"flowScore",fmt:n=>n+"/100",unit:"/100",src:"Analisi interna",lo:"#EFF6FF",hi:"#1E3A8A"},{id:"poi",label:"POI concentration",field:"poi",fmt:n=>n.toLocaleString("it-IT", { useGrouping: true }),unit:"POI",src:"Google Places",lo:"#EFF6FF",hi:"#1E3A8A"},{id:"transitStops",label:"Transit proximity",field:"transitStops",fmt:n=>n+" fermate",unit:"fermate",src:"Trasporto pubblico / GTFS",lo:"#F5F3FF",hi:"#4C1D95"},{id:"strongPts",label:"Hotspot operativi",field:"strongPts",fmt:n=>n+" punti",unit:"punti",src:"Analisi interna",lo:"#ECFDF5",hi:"#065F3C"},{id:"commDens",label:"Densità passaggio",field:"commDens",fmt:n=>n+"/100",unit:"/100",src:"Analisi interna",lo:"#FFF5F0",hi:"#C2410C"},{id:"nearbyBiz",label:"Attrattori locali",field:"nearbyBiz",fmt:n=>n.toLocaleString("it-IT", { useGrouping: true }),unit:"att.",src:"Google Places",lo:"#ECFDF5",hi:"#065F3C"}],b2b:[{id:"bizTotal",label:"Attività rilevate",field:"bizTotal",fmt:n=>n.toLocaleString("it-IT", { useGrouping: true }),unit:"att.",src:"Google Places",lo:"#FDF2F8",hi:"#701A75"},{id:"competitors",label:"Competitor",field:"competitors",fmt:n=>n.toLocaleString("it-IT", { useGrouping: true }),unit:"comp.",src:"Google Places",lo:"#FFF5F0",hi:"#C2410C"},{id:"commDensB2B",label:"Densità commerciale",field:"commDensB2B",fmt:n=>n+"/100",unit:"/100",src:"Analisi interna",lo:"#FFFBEB",hi:"#78350F"},{id:"clusters",label:"Forza cluster",field:"clusters",fmt:n=>n+" cluster",unit:"cluster",src:"Analisi interna",lo:"#EFF6FF",hi:"#1E3A8A"},{id:"targetBiz",label:"Rilevanza target",field:"targetBiz",fmt:n=>n.toLocaleString("it-IT", { useGrouping: true })+" att.",unit:"att.",src:"Google Places",lo:"#ECFDF5",hi:"#065F3C"},{id:"reddito",label:"Reddito medio",field:"reddito",fmt:n=>"EUR "+n.toLocaleString("it-IT", { useGrouping: true }),unit:"EUR /anno",src:"Dati territoriali",lo:"#F0FDF4",hi:"#14532D"},{id:"cdIdx",label:"Commercial Density Index",field:"cdIdx",fmt:n=>n+"/100",unit:"/100",src:"Analisi interna",lo:"#F5F3FF",hi:"#4C1D95"}]},SERVICE_META={d2d:{label:"Door to Door",icon:" ",color:C.orange,mode:"residential",src:["ISTAT","Mapbox","OpenStreetMap","landuse / buildings","Dati geografici","Analisi interna"],allocationSort:(n,i)=>(i.familyIdx||0)*1.8+(i.coverage||0)*1.2+(i.families||0)*.006-(i.dist||0)*5-((n.familyIdx||0)*1.8+(n.coverage||0)*1.2+(n.families||0)*.006-(n.dist||0)*5),mainKpis:n=>[{l:"Famiglie stimate",v:n.families.toLocaleString("it-IT", { useGrouping: true }),u:"nuclei",src:"ISTAT",c:C.orange,icon:""},{l:"Popolazione stimata",v:n.pop.toLocaleString("it-IT", { useGrouping: true }),u:"abitanti",src:"ISTAT",c:C.orange,icon:""},{l:"Superficie coperta",v:n.area+" km²",u:"",src:"Dati geografici",c:C.blue,icon:""},{l:"Copertura stimata",v:n.coverage+"%",u:"",src:"ISTAT+GIS",c:C.green,icon:""},{l:"Range operativo",v:n.flyersMin.toLocaleString("it-IT", { useGrouping: true })+" - "+n.flyersMax.toLocaleString("it-IT", { useGrouping: true }),u:"pz.",src:"Calc.",c:C.green,icon:""},{l:"Giorni operativi",v:n.operDays+" giorni",u:"",src:"Operativo",c:C.yellow,icon:""},{l:"Comuni nel raggio",v:"-",u:"",src:"Dati geografici",c:C.blue,icon:""}],advKpis:n=>[{l:"Family Index",v:n.familyIdx,c:C.orange},{l:"Reach Score",v:n.reachD2D,c:C.blue},{l:"ROI Score",v:n.roiD2D,c:C.green},{l:"Confidence",v:n.confD2D,c:C.purple}],aiCats:[{group:"Residential profile",l:"Famiglie",v:n=>n.families.toLocaleString("it-IT", { useGrouping: true })+" nuclei"},{group:"Residential profile",l:"Popolazione",v:n=>n.pop.toLocaleString("it-IT", { useGrouping: true })+" ab."},{group:"Residential profile",l:"Densità residenziale",v:n=>n.densita.toLocaleString("it-IT", { useGrouping: true })+" ab/km²"},{group:"Residential profile",l:"Tipologia area",v:n=>n.areaType},{group:"Demographic profile",l:"Età 0-14",v:n=>n.eta14+"%"},{group:"Demographic profile",l:"Età 15-34",v:n=>n.eta34+"%"},{group:"Demographic profile",l:"Età 35-64",v:n=>n.eta64+"%"},{group:"Demographic profile",l:"Età 65+",v:n=>n.eta65+"%"},{group:"Demographic profile",l:"Genere",v:n=>"M "+n.genderM+"% – F "+n.genderF+"%"},{group:"Demographic profile",l:"Indice vecchiaia",v:n=>n.indVec+"/100"},{group:"Demographic profile",l:"% Stranieri",v:n=>n.stranieri+"%"},{group:"Economic context",l:"Reddito medio",v:n=>"EUR "+n.reddito.toLocaleString("it-IT", { useGrouping: true }),c:"green"},{group:"Economic context",l:"Tasso occupazione",v:n=>n.occup+"%",c:"green"},{group:"Economic context",l:"Imprese come contesto",v:n=>n.imprese.toLocaleString("it-IT", { useGrouping: true })},{group:"Operational reading",l:"Residential strength",v:n=>n.familyIdx+"/100"},{group:"Operational reading",l:"Copertura consigliata",v:n=>n.coverage>=88?"Copertura piena":n.coverage>=75?"Copertura selettiva estesa":"Copertura selettiva"},{group:"Operational reading",l:"Suitability campagna",v:n=>n.reachD2D>=86?"Alta":n.reachD2D>=76?"Buona":"Mirata"},{group:"Operational reading",l:"Confidence level",v:n=>n.confD2D+"/100"}]},h2h:{label:"Hand to Hand",icon:"",color:C.blue,mode:"movement",src:["Google Places","Google Places","OpenStreetMap","Overpass","Trasporto pubblico / GTFS","Mapbox","Analisi interna","Dati geografici"],allocationSort:(n,i)=>(i.flowScore||0)*2.4+(i.strongPts||0)*13+(i.transitStops||0)*1.9+(i.poi||0)*.18+(i.commDens||0)*1.2-(i.dist||0)*4-((n.flowScore||0)*2.4+(n.strongPts||0)*13+(n.transitStops||0)*1.9+(n.poi||0)*.18+(n.commDens||0)*1.2-(n.dist||0)*4),mainKpis:n=>{const i=n.flowScore,r=i<40?"Basso":i<60?"Medio":i<80?"Alto":"Molto Alto",l=i<40?C.red:i<60?C.yellow:i<80?C.green:C.purple;return[{l:"POI rilevanti",v:n.poi.toLocaleString("it-IT", { useGrouping: true }),u:"POI",src:"Google Places",c:C.blue,icon:""},{l:"Competitor rilevati",v:Math.round(n.nearbyBiz*.28),u:"comp.",src:"Google Places",c:C.red,icon:"–"},{l:"Densità passaggio",v:n.commDens+"/100",u:"",src:"Analisi interna",c:C.orange,icon:" "},{l:"Flusso potenziale",v:r+" – "+i+"/100",u:"",src:"Analisi interna",c:l,icon:""},{l:"Fermate / stazioni",v:n.transitStops+" fermate – "+n.trainStations+" staz.",u:"",src:"Trasporto pubblico / GTFS",c:C.purple,icon:""},{l:"Hotspot operativi",v:n.strongPts+" punti",u:"",src:"Analisi interna",c:C.green,icon:""},{l:"Giorni operativi",v:n.operDaysH2H+" giorni",u:"",src:"Operativo",c:C.yellow,icon:""}]},advKpis:n=>[{l:"Reach Score",v:n.reachH2H,c:C.blue},{l:"ROI Score",v:n.roiH2H,c:C.green},{l:"Confidence",v:n.confH2H,c:C.purple},{l:"Reddito medio",v:n.reddito,c:C.green}],aiCats:[{group:"Movement profile",l:"Intensità passaggio",v:n=>n.flowScore+"/100"},{group:"Movement profile",l:"Anchor trasporto",v:n=>n.transitStops+" fermate – "+n.trainStations+" staz."},{group:"Movement profile",l:"Scuole / eventi",v:n=>n.strongPts+" punti"},{group:"Movement profile",l:"Rilevanza pedonale",v:n=>n.commDens>=75?"Alta":n.commDens>=58?"Media":"Locale"},{group:"Local attractiveness",l:"POI rilevanti",v:n=>n.poi.toLocaleString("it-IT", { useGrouping: true })},{group:"Local attractiveness",l:"Attività vicine",v:n=>n.nearbyBiz.toLocaleString("it-IT", { useGrouping: true })},{group:"Local attractiveness",l:"Contesto mixed-use",v:n=>n.areaType},{group:"Operational timing",l:"Fasce consigliate",v:n=>n.timeSlots},{group:"Operational timing",l:"opportunità mattina",v:n=>n.timeSlots.includes("08")||n.timeSlots.includes("07")?"Forte":"Media"},{group:"Operational timing",l:"opportunità pranzo",v:n=>n.timeSlots.includes("12")?"Forte":"Da validare"},{group:"Operational reading",l:"Hotspot principale",v:n=>n.hotspots},{group:"Operational reading",l:"Punti operativi",v:n=>n.strongPts+" suggeriti"},{group:"Operational reading",l:"Exposure quality",v:n=>n.flowScore>=80?"Alta":n.flowScore>=65?"Buona":"Mirata"},{group:"Operational reading",l:"Confidence level",v:n=>n.confH2H+"/100"}]},b2b:{label:"Business Distribution",icon:"",color:C.purple,mode:"business",src:["Google Places","Google Places","OpenStreetMap","Mapbox","Analisi interna","Dati geografici","Dati territoriali"],allocationSort:(n,i)=>(i.targetBiz||0)*1.9+(i.commDensB2B||0)*2.2+(i.clusters||0)*10-(i.competitors||0)*.35-(i.dist||0)*3-((n.targetBiz||0)*1.9+(n.commDensB2B||0)*2.2+(n.clusters||0)*10-(n.competitors||0)*.35-(n.dist||0)*3),mainKpis:n=>[{l:"Attività rilevate",v:n.bizTotal.toLocaleString("it-IT", { useGrouping: true }),u:"att.",src:"Google Places",c:C.purple,icon:""},{l:"Competitor rilevati",v:n.competitors,u:"comp.",src:"Google Places",c:C.red,icon:"–"},{l:"Densità commerciale",v:n.commDensB2B+"/100",u:"",src:"Analisi interna",c:C.orange,icon:" "},{l:"Reddito medio stimato",v:"EUR "+n.reddito.toLocaleString("it-IT", { useGrouping: true }),u:"anno",src:"Dati territoriali",c:C.green,icon:""},{l:"Commercial Density Index",v:n.cdIdx+"/100",u:"",src:"Analisi interna",c:C.purple,icon:"-–"},{l:"Giorni operativi",v:n.operDaysB2B+" giorni",u:"",src:"Operativo",c:C.yellow,icon:""}],advKpis:n=>[{l:"Comm. Density",v:n.cdIdx,c:C.purple},{l:"Reach Score",v:n.reachB2B,c:C.blue},{l:"ROI Score",v:n.roiB2B,c:C.green},{l:"Confidence",v:n.confB2B,c:C.orange}],aiCats:[{group:"Commercial profile",l:"Attività rilevate",v:n=>n.bizTotal.toLocaleString("it-IT", { useGrouping: true })+" attività"},{group:"Commercial profile",l:"Categorie dominanti",v:n=>n.topCats},{group:"Commercial profile",l:"Densità commerciale",v:n=>n.commDensB2B+"/100"},{group:"Commercial profile",l:"Attività target",v:n=>n.targetBiz.toLocaleString("it-IT", { useGrouping: true })+" att."},{group:"Economic context",l:"Reddito medio stimato",v:n=>"EUR "+n.reddito.toLocaleString("it-IT", { useGrouping: true }),c:"green"},{group:"Economic context",l:"Tasso occupazione",v:n=>n.occup+"%"},{group:"Economic context",l:"Base imprese locale",v:n=>n.imprese.toLocaleString("it-IT", { useGrouping: true })},{group:"Competitive context",l:"Competitor rilevati",v:n=>n.competitors.toLocaleString("it-IT", { useGrouping: true })},{group:"Competitive context",l:"Livello competizione",v:n=>n.competitors>30?"Alto":n.competitors>12?"Medio":"Contenuto"},{group:"Operational reading",l:"Cluster commerciali",v:n=>n.clusters+" cluster"},{group:"Operational reading",l:"Zona business forte",v:n=>n.strongZone},{group:"Operational reading",l:"Attrattività commerciale",v:n=>n.commDensB2B>=78?"Alta":n.commDensB2B>=62?"Media":"Da validare"},{group:"Operational reading",l:"Confidence level",v:n=>n.confB2B+"/100"}]}};
function getTargetBizMeta(n){const i=n.businessCategory||n.targetBusinessType||n.businessSector||"altro";return BUSINESS_CATEGORIES[i]||BUSINESS_CATEGORIES.altro}function bizCategoryChart(n,i){const r={};n.forEach(u=>(u.topCats||"").split(" – ").filter(Boolean).forEach((h,f)=>{r[h]=(r[h]||0)+Math.max(1,Math.round((u.bizTotal||0)*(f===0?.34:f===1?.24:.16)))}));
const l=Object.entries(r).map(([u,h])=>({label:u,count:h,target:i.aliases.some(f=>u.toLowerCase().includes(f.toLowerCase()))||u.toLowerCase().includes(i.label.toLowerCase().split(" ")[0])})).sort((u,h)=>h.count-u.count);return l.length?l:[{label:i.label,count:n.reduce((u,h)=>u+(h.targetBiz||0),0),target:!0}]}function businessZoneScore(n){return Math.round(Math.min(100,(n.commDensB2B||0)*.34+(n.reachB2B||0)*.22+(n.roiB2B||0)*.18+(n.targetBiz||0)/Math.max(1,n.bizTotal||1)*100*.16+Math.min(10,(n.clusters||0)*1.2)))}function businessRows(n,i){return[...n].sort((r,l)=>businessZoneScore(l)-businessZoneScore(r)).map(r=>({id:r.id,name:r.strongZone||r.name,zoneName:r.name,score:businessZoneScore(r),activities:r.bizTotal||0,target:r.targetBiz||0,competitors:r.competitors||0,density:r.commDensB2B||0,clusters:r.clusters||0,dominant:(r.topCats||i.label).split(" – ")[0]}))}function h2hHotspotStrength(n){return Math.round(Math.min(100,(n.flowScore||0)*.42+(n.commDens||0)*.2+Math.min(22,(n.transitStops||0)*.9)+Math.min(12,(n.strongPts||0)*1.2)+Math.min(8,(n.poi||0)/38)))}function h2hHotspotRows(n){return[...n].sort((i,r)=>h2hHotspotStrength(r)-h2hHotspotStrength(i)).map(i=>({id:i.id,name:(i.hotspots||i.name).split(" – ")[0],zoneName:i.name,strength:h2hHotspotStrength(i),poi:i.poi||0,transit:(i.transitStops||0)+(i.trainStations||0),anchors:i.strongPts||0,flow:i.flowScore||0,density:i.commDens||0,time:i.timeSlots||"Da validare",reason:i.flowScore>=82?"Alta concentrazione di passaggio vicino ad anchor urbani.":i.transitStops>=14?"Buona opportunità per flussi scuola-lavoro e trasporto.":"Zona utile per distribuzione manuale breve e mirata."}))}function normalizeH2HCategory(n){return String(n||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}function countPoisByCategory(n,i){return n.filter(r=>i.some(l=>normalizeH2HCategory(r.category).includes(l))).length}function countTransportByType(n,i){return (n?.stops||[]).filter(r=>{const l=[r.stopType,...(r.routes||[]).map(u=>u.routeTypeLabel)].map(normalizeH2HCategory);return l.some(u=>i.includes(u))}).length}function buildH2HOperationalClusters(n,i,r){const l=Array.isArray(n)?n.filter(u=>Number.isFinite(Number(u.lat))&&Number.isFinite(Number(u.lng))):[];if(!l.length)return[];const u=r<=2?.0015:r<=5?.003:.005,h=new Map;l.forEach(f=>{const m=`${Math.round(Number(f.lat)/u)}_${Math.round(Number(f.lng)/u)}`;if(!h.has(m))h.set(m,[]);h.get(m).push(f)});const T=Array.from(h.values()).map((f,m)=>{const y=f.reduce((A,B)=>A+Number(B.lat),0)/f.length,x=f.reduce((A,B)=>A+Number(B.lng),0)/f.length,w=f.reduce((A,B)=>A+(Number(B.priority)||0),0),j=f.filter(A=>(Number(A.priority)||0)>=8).length,z=countPoisByCategory(f,["stazione","metro"]),R=countPoisByCategory(f,["universit","scuola"]),D=countPoisByCategory(f,["centro comm","teatro","cinema","attrazione","mercato","biblioteca","bar","caffe","caff","ristorante"]),W=Math.round(Math.min(100,w*3+j*10+z*8+R*6+Math.min(18,D*2))),A=[...f].sort((B,P)=>(Number(P.priority)||0)-(Number(B.priority)||0))[0];return{id:`h2h_cluster_${m}`,name:A?.name||`Zona operativa ${m+1}`,zoneName:A?.category||"Cluster POI",lat:y,lng:x,poi:f.length,transit:z,anchors:R,attractions:D,strength:W,flow:W,density:Math.min(100,Math.round(f.length*8)),time:"Da validare",reason:`${f.length.toLocaleString("it-IT", { useGrouping: true })} POI reali nel cluster`,items:f}}).sort((f,m)=>m.strength-f.strength);return T.map((f,m)=>({...f,rank:m+1,name:`Zona ${m+1} · ${f.name}`}))}function getH2HMetrics(n,i,r){const l=Array.isArray(n)?n:[],u=Array.isArray(i?.stops)?i.stops:[],h=buildH2HOperationalClusters(l,i,r),f=countPoisByCategory(l,["stazione"]),m=countPoisByCategory(l,["metro"])+countTransportByType(i,["metro"]),y=countTransportByType(i,["train"])+f,x=countPoisByCategory(l,["universit"]),w=countPoisByCategory(l,["centro comm","teatro","cinema","attrazione","mercato","biblioteca","bar","caffe","caff","ristorante"]);return{poi:l.length,zones:h.length,hotspots:h.length,clusters:h,tplStops:u.length,stations:y,metro:m,universities:x,localAttractors:w,transitTotal:u.length+f+m,flowScore:h.length?Math.round(h.reduce((z,R)=>z+R.strength,0)/h.length):0}}function categoryMatchesBusiness(n,i){const r=normalizeH2HCategory(`${n?.category||""} ${n?.name||""}`),l=Array.isArray(i?.aliases)?i.aliases.map(normalizeH2HCategory):[];return l.length?l.some(u=>r.includes(u)):true}function buildBusinessOperationalClusters(n,i,r){const l=Array.isArray(n)?n.filter(u=>Number.isFinite(Number(u.lat))&&Number.isFinite(Number(u.lng))):[];if(!l.length)return[];const u=r<=2?.0015:r<=5?.003:.005,h=new Map;l.forEach(f=>{const m=`${Math.round(Number(f.lat)/u)}_${Math.round(Number(f.lng)/u)}`;if(!h.has(m))h.set(m,[]);h.get(m).push(f)});return Array.from(h.values()).map((f,m)=>{const y=f.reduce((A,B)=>A+Number(B.lat),0)/f.length,x=f.reduce((A,B)=>A+Number(B.lng),0)/f.length,w=f.reduce((A,B)=>A+(Number(B.priority)||0),0),j=f.filter(A=>categoryMatchesBusiness(A,i)).length,z=f.reduce((A,B)=>{const P=B.category||"Altro";A[P]=(A[P]||0)+1;return A},{}),R=Object.entries(z).sort((A,B)=>B[1]-A[1])[0]?.[0]||i?.label||"Business",D=Math.round(Math.min(100,w*3+j*8+f.length*4)),W=[...f].sort((A,B)=>(Number(B.priority)||0)-(Number(A.priority)||0))[0];return{id:`b2b_cluster_${m}`,name:`Zona ${m+1} · ${W?.name||R}`,zoneName:R,lat:y,lng:x,activities:f.length,target:j,competitors:Math.max(0,f.length-j),density:Math.min(100,Math.round(f.length*8)),clusters:1,dominant:R,score:D,items:f}}).sort((f,m)=>m.score-f.score)}function getBusinessMetrics(n,i,r){const l=Array.isArray(n)?n:[],h=buildBusinessOperationalClusters(l,i,r),f=l.filter(m=>categoryMatchesBusiness(m,i)).length,u=l.reduce((m,y)=>{const x=y.category||"Altro";m[x]=(m[x]||0)+1;return m},{}),T=Object.entries(u).map(([m,y])=>({label:m,count:y,target:categoryMatchesBusiness({category:m},i)})).sort((m,y)=>y.count-m.count);return{businesses:l.length,competitors:Math.max(0,l.length-f),commercialDensity:h.length?Math.round(h.reduce((m,y)=>m+y.density,0)/h.length):0,clusters:h.length,targetBusinesses:f,categories:T,clusterRows:h,cdIdx:h.length?Math.round(h.reduce((m,y)=>m+y.score,0)/h.length):0}}function Pv(n){const i=n.reduce((h,f)=>h+(f.poi||0),0),r=n.reduce((h,f)=>h+(f.transitStops||0)+(f.trainStations||0),0),l=n.reduce((h,f)=>h+(f.strongPts||0),0),u=n.reduce((h,f)=>h+(f.nearbyBiz||0),0);return[{label:"POI rilevanti",value:i,color:Qi.pedestrian.color},{label:"Fermate / stazioni",value:r,color:Qi.transit.color},{label:"Scuole / eventi",value:l,color:Qi.school.color},{label:"Attrattori locali",value:u,color:Qi.retail.color}]}function residentialStrength(n){return Math.round(Math.min(100,(n.familyIdx||0)*.34+(n.reachD2D||0)*.22+(n.coverage||0)*.2+Math.min(16,(n.families||0)/1850)+Math.min(8,(n.mailboxes||0)/2400)))}function residentialRows(n){return[...n].sort((i,r)=>residentialStrength(r)-residentialStrength(i)).map((i,r)=>({id:i.id,rank:r+1,name:i.name,strength:residentialStrength(i),families:i.families||0,population:i.pop||0,coverage:i.coverage||0,required:i.families||0,recommended:`${(i.flyersMin||0).toLocaleString("it-IT", { useGrouping: true })}-${(i.flyersMax||0).toLocaleString("it-IT", { useGrouping: true })}`,contribution:n.reduce((l,u)=>l+(u.families||0),0)>0?Math.round((i.families||0)/n.reduce((l,u)=>l+(u.families||0),0)*100):0,areaType:i.areaType}))}const ZONE_COLORS=["#2563EB","#16A34A","#7C3AED","#0891B2","#65A30D","#0F766E","#4F46E5","#0284C7","#15803D","#6D28D9","#0D9488"];
function getComuneColor(n=""){const p=["#14b8a6","#3b82f6","#8b5cf6","#06b6d4","#22c55e","#6366f1"],i=[...n].reduce((r,l)=>r+l.charCodeAt(0),0);return p[i%p.length]}
function normalizeTerritoryName(value=""){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
function isMilanoTerritory(value){return /\bmilano\b/.test(normalizeTerritoryName(value));}function isMilanoCoordinates(lat,lng){const nLat=Number(lat),nLng=Number(lng);if(!Number.isFinite(nLat)||!Number.isFinite(nLng))return false;return nLat>=45.38&&nLat<=45.56&&nLng>=9.04&&nLng<=9.31;}
function pickRealComuneGeometry(z) {
  const geomRaw = z?.geometry_geojson || z?.geometry || z?.geojson || z?.geom || z?.feature?.geometry || null;
  if (!geomRaw) return null;
  if (typeof geomRaw === 'object') return geomRaw;
  try {
    const first = JSON.parse(geomRaw);
    if (typeof first === 'string') {
      const s = first.trim();
      if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
        return JSON.parse(s);
      }
    }
    return first;
  } catch {
    return null;
  }
}
const RADIUS_OPTIONS=[.5,1,2,3,5,8,10],MW=580,MH=360,LAT_C=45.548,LNG_C=9.175,SCALE_Y=4200,SCALE_X=2800;
function s2proj(n,i){return{x:MW/2+(i-LNG_C)*SCALE_X,y:MH/2-(n-LAT_C)*SCALE_Y}}function kmToPx(n){return n*SCALE_X/111.32}function computePct(n,i,r){const l=Math.sqrt(r/Math.PI);return n<=Math.max(0,i-l)?100:n>=i+l?0:Math.max(5,Math.min(99,Math.round((i+l-n)/(2*l)*100)))}function thColor(n,i,r,l,u){if(n==null)return"rgba(255,255,255,.06)";
const h=Math.max(0,Math.min(1,(n-i)/(r-i||1))),f=(w,j)=>parseInt(w.slice(j,j+2),16),m=Math.round(f(l,1)*(1-h)+f(u,1)*h),y=Math.round(f(l,3)*(1-h)+f(u,3)*h),x=Math.round(f(l,5)*(1-h)+f(u,5)*h);return`rgb(${m},${y},${x})`}function ScoreCircle({label:n,value:i,color:r}){const l=typeof i=="number"?i:parseInt(i)||0,u=22,h=26,f=26,m=2*Math.PI*u,y=m*(l/100);return _jsxs("div",{style:{textAlign:"center",padding:"10px 4px",background:"rgba(255,255,255,.04)",borderRadius:10,border:"1px solid rgba(255,255,255,.06)"},children:[_jsxs("svg",{width:"52",height:"52",viewBox:"0 0 52 52",style:{display:"block",margin:"0 auto 5px"},children:[_jsx("circle",{cx:h,cy:f,r:u,fill:"none",stroke:"rgba(255,255,255,.08)",strokeWidth:"4"}),_jsx("circle",{cx:h,cy:f,r:u,fill:"none",stroke:r,strokeWidth:"4",strokeDasharray:`${y} ${m}`,strokeLinecap:"round",transform:"rotate(-90 26 26)"}),_jsx("text",{x:h,y:f+4,textAnchor:"middle",fontFamily:F.serif,fontSize:"12",fill:r,fontWeight:"700",children:l})]}),_jsx("div",{style:{fontFamily:F.sans,fontSize:9,color:"rgba(255,255,255,.65)",lineHeight:1.3},children:n})]})}function DonutChart({data:n,colors:i,size:r=72}){const l=r/2,u=r/2,h=r*.36,f=r*.22,m=n.reduce((x,w)=>x+w,0)||1;
let y=-Math.PI/2;return _jsx("svg",{width:r,height:r,viewBox:`0 0 ${r} ${r}`,style:{flexShrink:0},children:n.map((x,w)=>{const j=x/m*2*Math.PI;if(j<.01)return null;
const T=l+h*Math.cos(y),z=u+h*Math.sin(y),R=l+h*Math.cos(y+j),D=u+h*Math.sin(y+j),W=l+f*Math.cos(y+j),A=u+f*Math.sin(y+j),F=l+f*Math.cos(y),B=u+f*Math.sin(y),P=j>Math.PI?1:0,J=`M${T},${z}A${h},${h},0,${P},1,${R},${D}L${W},${A}A${f},${f},0,${P},0,${F},${B}Z`;return y+=j,_jsx("path",{d:J,fill:i[w]||"#888"},w)})})}
const S2_CITIES = ZONE_DATA.map(z => ({...z,...(GEO_DATA.find(c => c.id === z.id)||{})}));
const S2_RADII = RADIUS_OPTIONS;
const S2_ZONES = S2_CITIES;

// Dataset CAP Lombardia statico (fallback quando DB e vuoto)
const CAP_LOMBARDIA = [
  {postal_code:"20121",municipality_name:"Milano (Centro)"},
  {postal_code:"20122",municipality_name:"Milano (Duomo)"},
  {postal_code:"20123",municipality_name:"Milano (S.Ambrogio)"},
  {postal_code:"20124",municipality_name:"Milano (Repubblica)"},
  {postal_code:"20125",municipality_name:"Milano (Isola)"},
  {postal_code:"20126",municipality_name:"Milano (Bicocca)"},
  {postal_code:"20127",municipality_name:"Milano (Turro)"},
  {postal_code:"20128",municipality_name:"Milano (Crescenzago)"},
  {postal_code:"20129",municipality_name:"Milano (Porta Venezia)"},
  {postal_code:"20130",municipality_name:"Milano (Città Studi)"},
  {postal_code:"20131",municipality_name:"Milano (Lambrate)"},
  {postal_code:"20132",municipality_name:"Milano (Cologno)"},
  {postal_code:"20133",municipality_name:"Milano (Argonne)"},
  {postal_code:"20134",municipality_name:"Milano (Mecenate)"},
  {postal_code:"20135",municipality_name:"Milano (Porta Romana)"},
  {postal_code:"20136",municipality_name:"Milano (Porta Ticinese)"},
  {postal_code:"20137",municipality_name:"Milano (Corsica)"},
  {postal_code:"20138",municipality_name:"Milano (Forlanini)"},
  {postal_code:"20139",municipality_name:"Milano (Vigentino)"},
  {postal_code:"20140",municipality_name:"Milano (Gratosoglio)"},
  {postal_code:"20141",municipality_name:"Milano (Bagnolo)"},
  {postal_code:"20142",municipality_name:"Milano (Barona)"},
  {postal_code:"20143",municipality_name:"Milano (Lorenteggio)"},
  {postal_code:"20144",municipality_name:"Milano (Porta Genova)"},
  {postal_code:"20145",municipality_name:"Milano (Pagano)"},
  {postal_code:"20146",municipality_name:"Milano (De Angeli)"},
  {postal_code:"20147",municipality_name:"Milano (Bande Nere)"},
  {postal_code:"20148",municipality_name:"Milano (S.Leonardo)"},
  {postal_code:"20149",municipality_name:"Milano (Washington)"},
  {postal_code:"20150",municipality_name:"Milano (S.Siro)"},
  {postal_code:"20151",municipality_name:"Milano (QT8)"},
  {postal_code:"20152",municipality_name:"Milano (Quinto Romano)"},
  {postal_code:"20153",municipality_name:"Milano (Baggio)"},
  {postal_code:"20154",municipality_name:"Milano (Sempione)"},
  {postal_code:"20155",municipality_name:"Milano (Musocco)"},
  {postal_code:"20156",municipality_name:"Milano (Vialba)"},
  {postal_code:"20157",municipality_name:"Milano (Quarto Oggiaro)"},
  {postal_code:"20158",municipality_name:"Milano (Niguarda)"},
  {postal_code:"20159",municipality_name:"Milano (Bruzzano)"},
  {postal_code:"20160",municipality_name:"Milano (Affori)"},
  {postal_code:"20161",municipality_name:"Milano (Bovisa)"},
  {postal_code:"20162",municipality_name:"Milano (Comasina)"},
  {postal_code:"20041",municipality_name:"Agrate Brianza"},
  {postal_code:"20048",municipality_name:"Carate Brianza"},
  {postal_code:"20020",municipality_name:"Lainate"},
  {postal_code:"20021",municipality_name:"Bollate"},
  {postal_code:"20032",municipality_name:"Cormano"},
  {postal_code:"20091",municipality_name:"Bresso"},
  {postal_code:"20092",municipality_name:"Cinisello Balsamo"},
  {postal_code:"20093",municipality_name:"Cologno Monzese"},
  {postal_code:"20094",municipality_name:"Corsico"},
  {postal_code:"20095",municipality_name:"Cusano Milanino"},
  {postal_code:"20096",municipality_name:"Pioltello"},
  {postal_code:"20097",municipality_name:"San Donato Milanese"},
  {postal_code:"20098",municipality_name:"San Giuliano Milanese"},
  {postal_code:"20099",municipality_name:"Sesto San Giovanni"},
  {postal_code:"20100",municipality_name:"Milano"},
  {postal_code:"20010",municipality_name:"Pogliano Milanese"},
  {postal_code:"20011",municipality_name:"Corbetta"},
  {postal_code:"20012",municipality_name:"Cuggiono"},
  {postal_code:"20013",municipality_name:"Magenta"},
  {postal_code:"20014",municipality_name:"Nerviano"},
  {postal_code:"20015",municipality_name:"Parabiago"},
  {postal_code:"20016",municipality_name:"Pero"},
  {postal_code:"20017",municipality_name:"Rho"},
  {postal_code:"20018",municipality_name:"Sedriano"},
  {postal_code:"20019",municipality_name:"Settimo Milanese"},
  {postal_code:"20022",municipality_name:"Castano Primo"},
  {postal_code:"20023",municipality_name:"Cerro Maggiore"},
  {postal_code:"20024",municipality_name:"Garbagnate Milanese"},
  {postal_code:"20025",municipality_name:"Legnano"},
  {postal_code:"20026",municipality_name:"Novate Milanese"},
  {postal_code:"20027",municipality_name:"Rescaldina"},
  {postal_code:"20028",municipality_name:"San Vittore Olona"},
  {postal_code:"20029",municipality_name:"Turbigo"},
  {postal_code:"20030",municipality_name:"Barlassina"},
  {postal_code:"20031",municipality_name:"Cesano Maderno"},
  {postal_code:"20033",municipality_name:"Desio"},
  {postal_code:"20034",municipality_name:"Giussano"},
  {postal_code:"20035",municipality_name:"Lissone"},
  {postal_code:"20036",municipality_name:"Meda"},
  {postal_code:"20037",municipality_name:"Paderno Dugnano"},
  {postal_code:"20038",municipality_name:"Seregno"},
  {postal_code:"20039",municipality_name:"Varedo"},
  {postal_code:"20040",municipality_name:"Agrate Brianza"},
  {postal_code:"20042",municipality_name:"Brugherio"},
  {postal_code:"20043",municipality_name:"Arcore"},
  {postal_code:"20044",municipality_name:"Bellusco"},
  {postal_code:"20045",municipality_name:"Besana in Brianza"},
  {postal_code:"20046",municipality_name:"Biassono"},
  {postal_code:"20047",municipality_name:"Briosco"},
  {postal_code:"20049",municipality_name:"Concorezzo"},
  {postal_code:"20050",municipality_name:"Burago di Molgora"},
  {postal_code:"20051",municipality_name:"Limbiate"},
  {postal_code:"20052",municipality_name:"Monza"},
  {postal_code:"20053",municipality_name:"Muggiò"},
  {postal_code:"20054",municipality_name:"Nova Milanese"},
  {postal_code:"20055",municipality_name:"Renate"},
  {postal_code:"20056",municipality_name:"Trezzo sull'Adda"},
  {postal_code:"20057",municipality_name:"Vedano al Lambro"},
  {postal_code:"20058",municipality_name:"Villasanta"},
  {postal_code:"20059",municipality_name:"Vimercate"},
  {postal_code:"20060",municipality_name:"Bussero"},
  {postal_code:"20061",municipality_name:"Carugate"},
  {postal_code:"20062",municipality_name:"Cassano d'Adda"},
  {postal_code:"20063",municipality_name:"Cernusco sul Naviglio"},
  {postal_code:"20064",municipality_name:"Gorgonzola"},
  {postal_code:"20065",municipality_name:"Inzago"},
  {postal_code:"20066",municipality_name:"Melzo"},
  {postal_code:"20067",municipality_name:"Paullo"},
  {postal_code:"20068",municipality_name:"Peschiera Borromeo"},
  {postal_code:"20069",municipality_name:"Vaprio d'Adda"},
  {postal_code:"20070",municipality_name:"Dresano"},
  {postal_code:"20071",municipality_name:"Casalpusterlengo"},
  {postal_code:"20072",municipality_name:"Fizzonasco"},
  {postal_code:"20073",municipality_name:"Opera"},
  {postal_code:"20074",municipality_name:"Ornago"},
  {postal_code:"20075",municipality_name:"Lodi Vecchio"},
  {postal_code:"20076",municipality_name:"Milanofiori"},
  {postal_code:"20077",municipality_name:"Melegnano"},
  {postal_code:"20078",municipality_name:"S. Colombano al Lambro"},
  {postal_code:"20079",municipality_name:"Zibido San Giacomo"},
  {postal_code:"20080",municipality_name:"Albairate"},
  {postal_code:"20081",municipality_name:"Abbiategrasso"},
  {postal_code:"20082",municipality_name:"Noviglio"},
  {postal_code:"20083",municipality_name:"Gaggiano"},
  {postal_code:"20084",municipality_name:"Lacchiarella"},
  {postal_code:"20085",municipality_name:"Locate di Triulzi"},
  {postal_code:"20086",municipality_name:"Motta Visconti"},
  {postal_code:"20087",municipality_name:"Robecco sul Naviglio"},
  {postal_code:"20088",municipality_name:"Rosate"},
  {postal_code:"20089",municipality_name:"Rozzano"},
  {postal_code:"20090",municipality_name:"Assago"},
  {postal_code:"24100",municipality_name:"Bergamo"},
  {postal_code:"24121",municipality_name:"Bergamo (Centro)"},
  {postal_code:"24122",municipality_name:"Bergamo"},
  {postal_code:"24123",municipality_name:"Bergamo"},
  {postal_code:"24124",municipality_name:"Bergamo"},
  {postal_code:"24125",municipality_name:"Bergamo"},
  {postal_code:"24126",municipality_name:"Bergamo"},
  {postal_code:"24127",municipality_name:"Bergamo"},
  {postal_code:"24128",municipality_name:"Bergamo"},
  {postal_code:"24129",municipality_name:"Bergamo"},
  {postal_code:"25100",municipality_name:"Brescia"},
  {postal_code:"25121",municipality_name:"Brescia (Centro)"},
  {postal_code:"25122",municipality_name:"Brescia"},
  {postal_code:"25123",municipality_name:"Brescia"},
  {postal_code:"25124",municipality_name:"Brescia"},
  {postal_code:"25125",municipality_name:"Brescia"},
  {postal_code:"25126",municipality_name:"Brescia"},
  {postal_code:"25127",municipality_name:"Brescia"},
  {postal_code:"25128",municipality_name:"Brescia"},
  {postal_code:"25129",municipality_name:"Brescia"},
  {postal_code:"25131",municipality_name:"Brescia"},
  {postal_code:"25132",municipality_name:"Brescia"},
  {postal_code:"22100",municipality_name:"Como"},
  {postal_code:"22100",municipality_name:"Como (Centro)"},
  {postal_code:"23100",municipality_name:"Sondrio"},
  {postal_code:"26100",municipality_name:"Cremona"},
  {postal_code:"27100",municipality_name:"Pavia"},
  {postal_code:"28100",municipality_name:"Novara"},
  {postal_code:"46100",municipality_name:"Mantova"},
  {postal_code:"21100",municipality_name:"Varese"},
  {postal_code:"21013",municipality_name:"Gallarate"},
  {postal_code:"21047",municipality_name:"Saronno"},
  {postal_code:"21052",municipality_name:"Busto Arsizio"},
  {postal_code:"21053",municipality_name:"Castellanza"},
  {postal_code:"21057",municipality_name:"Olgiate Olona"},
];
const BUSINESS_CATEGORIES = {
  retail: { label: "Retail / Negozio", color: C.orange, aliases: ["negozio", "retail", "abbigliamento"] },
  food: { label: "Ristorazione / Food", color: C.blue, aliases: ["food", "ristorante", "bar", "pizzeria"] },
  servizi: { label: "Servizi alla persona", color: C.purple, aliases: ["servizi", "estetica", "parrucchiere"] },
  salute: { label: "Salute / Benessere", color: C.green, aliases: ["salute", "farmacia", "clinica"] },
  immobiliare: { label: "Immobiliare", color: C.teal, aliases: ["immobiliare", "agenzia"] },
  gdo: { label: "GDO / Supermercati", color: C.yellow, aliases: ["gdo", "supermercato"] },
  altro: { label: "Altro", color: C.white, aliases: [] }
};
const H2H_HOTSPOT_META = {
  transit: { label: "Transit / Stazioni", color: C.purple, icon: "" },
  school: { label: "Scuole / Eventi", color: C.orange, icon: "" },
  retail: { label: "Retail / Piazze", color: C.blue, icon: "" },
  flow: { label: "Flusso / Passaggio", color: C.teal, icon: "" }
};
const Qi = {
  pedestrian: { color: C.blue },
  transit: { color: C.purple },
  school: { color: C.orange },
  retail: { color: C.green }
};
const truthfulSourceLabel = s => s || "Dati interni";
function ScoreGauge({ label, value, color }) {
  const hasValue = value !== null && value !== undefined && value !== "";
  const numericValue = hasValue && Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 0;
  return (
    <div style={{ padding: "8px", borderRadius: 8, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)" }}>
      <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,.1)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${numericValue}%`, height: "100%", background: color }} />
        </div>
        <div style={{ fontFamily: F.serif, fontSize: 12, color: color, fontWeight: 700 }}>
          <MetricValue value={value} />
        </div>
      </div>
    </div>
  );
}
function MiniDonut({ data, colors, size = 48 }) {
  return <DonutChart data={data} colors={colors} size={size} />;
}
function QuickQuotePage({onStart:n,onContact:i}){const[r,l]=useState({service:"d2d",comune:"",qty:1e4,printed:"true",format:"A5",urgency:"standard",startDate:"",endDate:""}),[u,h]=useState({}),f=j=>({width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${j?"#F8717188":"rgba(255,255,255,.12)"}`,background:j?"rgba(248,113,113,.04)":"rgba(255,255,255,.06)",color:C.white,fontFamily:F.sans,fontSize:14,colorScheme:"dark",transition:"all.2s"}),m=()=>{const j={};return r.service||(j.service="Seleziona un servizio"),r.comune.trim()||(j.comune="Inserisci un comune o una zona"),(!r.qty||r.qty<100)&&(j.qty="Inserisci una quantità (min. 100)"),r.format||(j.format="Seleziona un formato"),r.printed||(j.printed="Specifica se già stampato"),r.urgency||(j.urgency="Seleziona urgenza"),h(j),Object.keys(j).length===0},y=()=>{m()&&n("step4",{...r,source:"quick_quote"})},x=({m:j})=>j?_jsx("div",{style:{fontFamily:F.sans,fontSize:10,color:C.red,marginTop:4,fontWeight:600},children:j}):null,w=({children:j})=>_jsx("div",{style:{fontFamily:F.sans,fontSize:11,fontWeight:700,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:8},children:j});return _jsx("div",{style:{minHeight:"100vh",background:C.navyDeep,padding:"72px 28px 120px"},children:_jsxs("div",{style:{maxWidth:720,margin:"0 auto"},children:[_jsx("button",{onClick:()=>n("home"),style:{marginBottom:24,padding:"8px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.62)",fontFamily:F.sans,fontSize:12,cursor:"pointer",transition:"all.2s"},className:"vb",children:"Torna alla Home"}),_jsxs("div",{style:{marginBottom:32},children:[_jsx("div",{style:{fontFamily:F.sans,fontSize:11,fontWeight:700,letterSpacing:".15em",textTransform:"uppercase",color:C.blue,marginBottom:12},children:"Scorciatoia"}),_jsx("h1",{style:{fontFamily:F.serif,fontSize:48,color:C.white,letterSpacing:"-1.5px",marginBottom:12},children:"Preventivo rapido"}),_jsx("p",{style:{fontFamily:F.sans,fontSize:17,color:"rgba(255,255,255,.52)",lineHeight:1.6},children:"Ricevi una stima immediata in Step 4. Potrai poi completare la configurazione o parlare con un consulente."})]}),_jsxs("div",{style:{background:"rgba(255,255,255,.03)",borderRadius:20,border:"1px solid rgba(255,255,255,.08)",padding:"32px",boxShadow:"0 20px 50px rgba(0,0,0,.3)"},children:[_jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:24},children:[_jsxs("div",{children:[_jsx(w,{children:"Tipo di servizio"}),_jsxs("select",{value:r.service,onChange:j=>l(T=>({...T,service:j.target.value})),style:f(u.service),children:[_jsx("option",{value:"d2d",children:"Door to Door (Cassette)"}),_jsx("option",{value:"h2h",children:"Hand to Hand (Promoter)"}),_jsx("option",{value:"b2b",children:"Business Distribution (Attività )"})]}),_jsx(x,{m:u.service})]}),_jsxs("div",{children:[_jsx(w,{children:"Comune o zona target"}),_jsx("input",{value:r.comune,onChange:j=>l(T=>({...T,comune:j.target.value})),placeholder:"Es: Milano, Cormano...",style:f(u.comune)}),_jsx(x,{m:u.comune})]})]}),_jsxs("div",{style:{marginBottom:24},children:[_jsx(w,{children:"quantità volantini"}),_jsx("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12},children:[5e3,1e4,25e3,5e4,1e5].map(j=>_jsx("button",{onClick:()=>l(T=>({...T,qty:j})),style:{padding:"8px 14px",borderRadius:8,border:`1px solid ${r.qty===j?C.blue:"rgba(255,255,255,.12)"}`,background:r.qty===j?`${C.blue}22`:"rgba(255,255,255,.04)",color:r.qty===j?C.blue:"rgba(255,255,255,.6)",fontFamily:F.sans,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all.2s"},children:j.toLocaleString("it-IT", { useGrouping: true })},j))}),_jsxs("div",{style:{position:"relative"},children:[_jsx("input",{type:"number",value:r.qty,onChange:j=>l(T=>({...T,qty:parseInt(j.target.value)||0})),placeholder:"Inserisci quantità manuale",style:f(u.qty)}),_jsx("div",{style:{position:"absolute",right:14,top:12,fontFamily:F.sans,fontSize:12,color:"rgba(255,255,255,.3)"},children:"pz."})]}),_jsx(x,{m:u.qty})]}),_jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:24},children:[_jsxs("div",{children:[_jsx(w,{children:"Formato materiale"}),_jsxs("select",{value:r.format,onChange:j=>l(T=>({...T,format:j.target.value})),style:f(u.format),children:[_jsx("option",{value:"A6",children:"A6 (10x15)"}),_jsx("option",{value:"A5",children:"A5 (15x21)"}),_jsx("option",{value:"A4",children:"A4 (21x29)"}),_jsx("option",{value:"DL",children:"DL (10x21)"})]}),_jsx(x,{m:u.format})]}),_jsxs("div",{children:[_jsx(w,{children:"Stato materiale"}),_jsxs("select",{value:r.printed,onChange:j=>l(T=>({...T,printed:j.target.value})),style:f(u.printed),children:[_jsx("option",{value:"true",children:"Sì, già stampato"}),_jsx("option",{value:"false",children:"No, devo stamparlo"})]}),_jsx(x,{m:u.printed})]})]}),_jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:32},children:[_jsxs("div",{children:[_jsx(w,{children:"Urgenza"}),_jsxs("select",{value:r.urgency,onChange:j=>l(T=>({...T,urgency:j.target.value})),style:f(u.urgency),children:[_jsx("option",{value:"standard",children:"Standard"}),_jsx("option",{value:"urgent",children:"Urgente (+30%)"})]}),_jsx(x,{m:u.urgency})]}),_jsxs("div",{children:[_jsx(w,{children:"Periodo (Inizio - Fine)"}),_jsxs("div",{style:{display:"flex",gap:8,alignItems:"center"},children:[_jsx("input",{type:"date",value:r.startDate,onChange:j=>l(T=>({...T,startDate:j.target.value})),style:{...f(),padding:"10px 8px"}}),_jsx("span",{style:{color:"rgba(255,255,255,.2)"},children:"-"}),_jsx("input",{type:"date",value:r.endDate,onChange:j=>l(T=>({...T,endDate:j.target.value})),style:{...f(),padding:"10px 8px"}})]})]})]}),_jsx("div",{style:{padding:"14px",borderRadius:12,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",marginBottom:24},children:_jsxs("div",{style:{fontFamily:F.sans,fontSize:12,color:"rgba(255,255,255,.5)",lineHeight:1.5},children:[_jsx("b",{children:"Nota:"})," Il periodo è indicativo. Il preventivo rapido non include lo Smart Pairing. Potrai analizzare le opportunità di risparmio nel configuratore completo."]})}),_jsx("button",{onClick:y,className:"vb",style:{width:"100%",padding:"16px",borderRadius:12,border:"none",background:C.blue,color:C.white,fontFamily:F.sans,fontSize:16,fontWeight:800,cursor:"pointer",boxShadow:`0 10px 30px ${C.blue}33`},children:"Calcola preventivo rapido"})]}),_jsxs("div",{style:{marginTop:32,textAlign:"center"},children:[_jsx("p",{style:{fontFamily:F.sans,fontSize:14,color:"rgba(255,255,255,.65)",marginBottom:12},children:"Preferisci supporto diretto?"}),_jsx("button",{onClick:()=>i("consultant"),style:{padding:"10px 24px",borderRadius:10,border:"1px solid rgba(255,255,255,.15)",background:"transparent",color:C.white,fontFamily:F.sans,fontSize:13,fontWeight:700,cursor:"pointer"},className:"vb",children:"Parla con un consulente"})]})]})})}
function ConsultantPage({onStart:n}){const[i,r]=useState({nome:"",telefono:"",email:"",comune:"",service:"d2d",qty:1e4,periodo:"",messaggio:""}),[l,u]=useState(!1),h={padding:"11px 13px",borderRadius:9,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.06)",color:C.white,fontFamily:F.sans,fontSize:13,colorScheme:"dark"};return _jsx("div",{style:{minHeight:"100vh",background:C.navyDeep,padding:"72px 28px 120px"},children:_jsxs("div",{style:{maxWidth:860,margin:"0 auto"},children:[_jsx("button",{onClick:()=>n("home"),style:{marginBottom:22,padding:"8px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,.12)",background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.62)",fontFamily:F.sans,fontSize:12,cursor:"pointer"},children:"Home"}),_jsxs("div",{style:{marginBottom:28},children:[_jsx("div",{style:{fontFamily:F.sans,fontSize:11,fontWeight:700,letterSpacing:".15em",textTransform:"uppercase",color:C.green,marginBottom:12},children:"Supporto diretto"}),_jsx("h1",{style:{fontFamily:F.serif,fontSize:46,color:C.white,letterSpacing:"-1.4px",marginBottom:10},children:"Parla con un consulente"}),_jsx("p",{style:{fontFamily:F.sans,fontSize:16,color:"rgba(255,255,255,.52)",maxWidth:660,lineHeight:1.65},children:"Raccontaci la campagna e ti ricontattiamo per costruire una proposta operativa sulla tua zona."})]}),_jsxs("div",{style:{borderRadius:16,padding:"24px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)"},children:[_jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginBottom:12},children:[_jsx("input",{value:i.nome,onChange:f=>r(m=>({...m,nome:f.target.value})),placeholder:"Nome e Cognome",style:h}),_jsx("input",{value:i.telefono,onChange:f=>r(m=>({...m,telefono:f.target.value})),placeholder:"Telefono / WhatsApp",style:h}),_jsx("input",{value:i.email,onChange:f=>r(m=>({...m,email:f.target.value})),placeholder:"Email",style:h}),_jsx("input",{value:i.comune,onChange:f=>r(m=>({...m,comune:f.target.value})),placeholder:"Comune o zona",style:h}),_jsxs("select",{value:i.service,onChange:f=>r(m=>({...m,service:f.target.value})),style:h,children:[_jsx("option",{value:"d2d",children:"Door to Door"}),_jsx("option",{value:"h2h",children:"Hand to Hand"}),_jsx("option",{value:"b2b",children:"Business Distribution"})]}),_jsx("select",{value:i.qty,onChange:f=>r(m=>({...m,qty:+f.target.value})),style:h,children:[5e3,1e4,25e3,5e4,1e5].map(f=>_jsxs("option",{value:f,children:[f.toLocaleString("it-IT", { useGrouping: true })," volantini"]},f))}),_jsx("input",{value:i.periodo,onChange:f=>r(m=>({...m,periodo:f.target.value})),placeholder:"Periodo desiderato",style:h})]}),_jsx("textarea",{value:i.messaggio,onChange:f=>r(m=>({...m,messaggio:f.target.value})),placeholder:"Messaggio opzionale",rows:4,style:{...h,width:"100%",resize:"vertical",marginBottom:12}}),_jsxs("div",{style:{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"},children:[_jsx("button",{onClick:()=>u(!0),className:"vb",style:{padding:"12px 18px",borderRadius:10,border:"none",background:C.green,color:C.white,fontFamily:F.sans,fontSize:14,fontWeight:700,cursor:"pointer"},children:"Invia richiesta "}),_jsx("button",{onClick:()=>n("quick"),style:{padding:"12px 18px",borderRadius:10,border:"1px solid rgba(255,255,255,.14)",background:"rgba(255,255,255,.05)",color:C.white,fontFamily:F.sans,fontSize:14,fontWeight:700,cursor:"pointer"},children:"Preventivo rapido"})]}),l&&_jsx("div",{style:{marginTop:12,padding:"10px 12px",borderRadius:8,background:"rgba(46,204,138,.08)",border:"1px solid rgba(46,204,138,.22)",fontFamily:F.sans,fontSize:12,color:C.green},children:"Richiesta registrata. Ti ricontattiamo per costruire una proposta operativa sulla tua zona."})]})]})})}
const xn=({children})=>_jsx("div",{style:{fontFamily:F.sans,fontSize:11,fontWeight:700,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:8},children});
const yr="div";
const Ov=[{value:"ristorazione",label:"Ristorazione"},{value:"retail",label:"Retail"},{value:"immobiliare",label:"Immobiliare"},{value:"fitness",label:"Fitness"},{value:"beauty",label:"Beauty"},{value:"automotive",label:"Automotive"},{value:"sanitario",label:"Sanitario"},{value:"servizi",label:"Servizi"},{value:"altro",label:"Altro"}];
const Bv=[{value:1,label:"1 Promoter"},{value:2,label:"2 Promoter"},{value:3,label:"3 Promoter"},{value:4,label:"4 Promoter"},{value:5,label:"5 Promoter (Team)"}];
const Mv=[{value:"07:30-11:30",label:"Mattina Presto (7:30 - 11:30)"},{value:"09:00-13:00",label:"Mattina (9:00 - 13:00)"},{value:"11:30-15:30",label:"Pranzo (11:30 - 15:30)"},{value:"15:00-19:00",label:"Pomeriggio (15:00 - 19:00)"},{value:"18:00-22:00",label:"Sera / Aperitivo (18:00 - 22:00)"}];
const Fv=[{value:4,label:"4 Ore (Mezza giornata)"},{value:8,label:"8 Ore (Giornata intera)"}];
const Nv=[{value:"stazione",label:"Stazione Treno / Metro"},{value:"piazza",label:"Piazza / Via Principale"},{value:"centro_commerciale",label:"Centro Commerciale (Esterno)"},{value:"universita",label:"Universita / Scuole"},{value:"fiera_evento",label:"Fiera / Evento"}];
const $v=[{value:"negozi",label:"Negozi al dettaglio"},{value:"uffici",label:"Uffici e Studi"},{value:"ristoranti",label:"Ristoranti e Bar"},{value:"aziende",label:"Aziende / B2B puro"}];
const Lv=[{value:"abbigliamento",label:"Abbigliamento / Moda"},{value:"tecnologia",label:"Tecnologia / Elettronica"},{value:"servizi_professionali",label:"Servizi Professionali"},{value:"horeca",label:"Ho.Re.Ca."},{value:"tutte",label:"Qualsiasi categoria locale"}];
const Iv=[{value:50,label:"Circa 50 attività"},{value:100,label:"Circa 100 attività"},{value:200,label:"Circa 200 attività"},{value:500,label:"Circa 500 attività"}];
const km=[{value:"reception",label:"Consegna a Reception / Banco"},{value:"cassetta",label:"Cassetta Postale Aziendale"},{value:"mano_manager",label:"Consegna a mano al Responsabile (+20%)"}];
const Uv=[{id:"A6",label:"A6",size:"10x15 cm"},{id:"A5",label:"A5",size:"15x21 cm"},{id:"A4",label:"A4",size:"21x29 cm"},{id:"DL",label:"DL",size:"10x21 cm"}];
const Kp=[{id:"photo_report_advanced",icon:"",label:"Report fotografico avanzato",price:"Extra",desc:"Report fotografico più dettagliato con evidenze ordinate per zona.",col:C.purple},{id:"report_analytics",icon:"",label:"Report Analytics",price:"Extra",desc:"Analisi post-campagna con KPI operativi e riepilogo territoriale.",col:C.green},{id:"photo_certification",icon:"",label:"Certificazione fotografica",price:"Extra",desc:"Validazione fotografica con prove organizzate e verificabili.",col:C.orange},{id:"supervision",icon:"",label:"Supervisione",price:"Extra",desc:"Controllo operativo aggiuntivo sulla campagna.",col:C.blue}];
const Gu=[{id:"single",label:"Singola",icon:"",disc:0},{id:"monthly3",label:"Trimestrale",icon:"",disc:5},{id:"monthly6",label:"Semestrale",icon:"",disc:10},{id:"monthly12",label:"Annuale",icon:"–",disc:15}];
function Step1ActivityPills({value,onChange,isMobile}){return _jsx("div",{style:{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(3,1fr)",gap:8},children:Ov.map(opt=>{const active=value===opt.value;return _jsx("button",{type:"button",onClick:()=>onChange(opt.value),style:{padding:"10px 11px",borderRadius:10,border:`1.5px solid ${active?C.orange:"rgba(255,255,255,.1)"}`,background:active?"rgba(232,87,26,.12)":"rgba(255,255,255,.04)",color:active?C.orange:"rgba(255,255,255,.68)",fontFamily:F.sans,fontSize:12,fontWeight:active?850:700,cursor:"pointer",textAlign:"center",transition:"all.18s"},children:opt.label},opt.value)})})}
function Step1PeriodPresets({value,onChange,isMobile}){const opts=[{id:"asap",label:"Appena possibile"},{id:"within7",label:"Entro 7 giorni"},{id:"within15",label:"Entro 15 giorni"},{id:"custom",label:"Scelgo una data"}];return _jsx("div",{style:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12},children:opts.map(opt=>{const active=(value||"custom")===opt.id;return _jsx("button",{type:"button",onClick:()=>onChange(opt.id),className:`vp-s1-pill ${active?"active":""}`,children:opt.label},opt.id)})})}
function Step1ConfigSummary({data}){
  const service={d2d:"Door to Door",h2h:"Hand to Hand",b2b:"Business Distribution","business-distribution":"Business Distribution"}[data.type]||"Da selezionare";
  const plan={single:"Singola",monthly3:"Trimestrale",monthly6:"Semestrale",monthly12:"Annuale"}[data.subscription]||"Da selezionare";
  const urgency={normal:"Standard",urgent:"Urgente",standard:"Standard"}[data.urgency]||"Da selezionare";
  const print=data.hasFlyers==="yes"?"Già stampati":data.hasFlyers==="no"?"Da stampare":"Da selezionare";
  const fmt=data.flyerFormat?String(data.flyerFormat).toUpperCase():"Da selezionare";
  const qty=data.qty?Number(data.qty).toLocaleString("it-IT", { useGrouping: true }):"Da selezionare";
  const basePrint=data.hasFlyers==="no"&&data.qty?Math.round(Number(data.qty||0)/1000*29):0;
  const partialSubtotal=basePrint;
  const rows=[["Servizio",service],["Quantità",qty],["Formato",fmt],["Urgenza",urgency],["Piano",plan],["Stampa",print]];
  return _jsxs("div",{className:"vp-s1-summary-container", style:{position:"sticky",bottom:18,zIndex:5},children:[
    _jsx("div",{style:{fontFamily:F.sans,fontSize:10,fontWeight:800,color:C.orange,letterSpacing:".1em",textTransform:"uppercase",marginBottom:10},children:"Riepilogo configurazione"}),
    _jsx("div",{className:"vp-s1-summary-grid",children:rows.map(([label,val])=>_jsxs("div",{className:"vp-s1-summary-item",children:[_jsx("div",{style:{fontFamily:F.sans,fontSize:10,color:"rgba(255,255,255,.7)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3},children:label}),_jsx("div",{style:{fontFamily:F.sans,fontSize:12,fontWeight:800,color:val==="Da selezionare"?"rgba(255,255,255,.34)":C.white},children:val})]},label))}),
    _jsxs("div",{className:"vp-s1-summary-totals",children:[
      _jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:12,fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.85)"},children:[_jsx("span",{children:"Distribuzione"}),_jsx("b",{style:{color:C.white},children:"Calcolata sulla tua zona (Step 2)"})]}),
      basePrint>0&&_jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:12,fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.85)"},children:[_jsx("span",{children:"Stampa indicativa"}),_jsxs("b",{style:{color:C.orange},children:["EUR ",basePrint.toLocaleString("it-IT", { useGrouping: true })]})]}),
      _jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:12,fontFamily:F.sans,fontSize:14,color:C.white,borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:7},children:[_jsx("span",{children:"Subtotale parziale"}),_jsxs("b",{style:{color:C.orange},children:["EUR ",partialSubtotal.toLocaleString("it-IT", { useGrouping: true })]})]})
    ]}),
    _jsxs("p",{style:{margin:"10px 0 0",fontFamily:F.sans,fontSize:12,lineHeight:1.5,color:"rgba(255,255,255,.85)"},children:["Configurazione attuale: distribuzione da calcolare sulla zona · piano ",plan," · formato ",fmt]})
  ]})
}
function Step1({data:n,setData:i,onNext:r}){const[showSmartPairingModal,setShowSmartPairingModal]=useState(false);const l=useIsMobile(),u=[{id:"d2d",name:"Door to Door",code:"D2D",desc:"Distribuzione in cassette postali, condomini, palazzi, villette e zone residenziali.",features:["Famiglie stimate","Popolazione stimata","Copertura zona","Volantini consigliati","Comuni nel raggio"],c:C.orange},{id:"h2h",name:"Hand to Hand",code:"H2H",desc:"Distribuzione manuale in punti ad alto passaggio.",features:["POI rilevanti","Fermate metro/bus/treno","Scuole, universit\u00e0, eventi","Flusso potenziale","Smart Pairing"],c:C.blue,popular:!0},{id:"b2b",name:"Distribuzione Business",code:"B2B",desc:"Distribuzione presso attività commerciali, uffici e zone business.",features:["Attività rilevate","Categorie commerciali","Competitor vicini","Densità commerciale","Cluster zona"],c:C.purple}],h={single:1,monthly3:3,monthly6:6,monthly12:12},f={single:0,monthly3:5,monthly6:10,monthly12:15},m=n.type==="h2h",y=n.type==="b2b"||n.type==="business-distribution",x=!!(n.type&&n.qty>0&&n.flyerFormat&&n.hasFlyers&&n.urgency&&n.subscription&&(!m||n.promoterCount&&n.timeSlot&&n.serviceDurationHours&&(n.distributionLocation||n.distributionPointType))&&(!y||n.targetBusinessType&&n.businessCategory&&n.targetBusinessCount&&(n.businessZone||n.cityName))),w=!!(n.startDate&&n.endDate&&n.endDate<n.startDate),j=A=>{if(!A)return"";
const F=A.split("-");return F.length===3?`${F[2]}/${F[1]}/${F[0]}`:""},T=A=>{const F=A.replace(/\D/g,"").slice(0,8);return F.length<=2?F:F.length<=4?`${F.slice(0,2)}/${F.slice(2)}`:`${F.slice(0,2)}/${F.slice(2,4)}/${F.slice(4)}`},z=A=>{const F=A.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!F)return"";
const[,B,P,J]=F,V=new Date(Number(J),Number(P)-1,Number(B));return V.getFullYear()!==Number(J)||V.getMonth()!==Number(P)-1||V.getDate()!==Number(B)?"":`${J}-${P}-${B}`},R=(n.campaignsPerMonth||1)*(h[n.subscription]||1),D=A=>i(F=>{const B={...F,...A},P=h[B.subscription]||1,J=f[B.subscription]||0,V=B.subscription==="single"?1:B.campaignsPerMonth||1;return{...B,campaignsPerMonth:V,selectedService:B.type,businessSector:B.activityType,flyerQuantity:B.qty,campaignPeriodStart:B.startDate,campaignPeriodEnd:B.endDate,alreadyPrinted:B.hasFlyers==="yes",printServices:(B.extraServices||[]).filter(H=>["stampa","grafica"].includes(H)),paperWeight:B.printGramm,printSides:B.printSide,colorMode:B.printColor,campaignPlan:B.subscription,totalCampaigns:V*P,planDiscount:J,promoterCount:B.promoterCount,timeSlot:B.timeSlot,serviceDurationHours:B.serviceDurationHours,distributionLocation:B.distributionLocation,distributionPointType:B.distributionPointType,operationalNotes:B.operationalNotes,targetBusinessType:B.targetBusinessType,businessCategory:B.businessCategory,targetBusinessCount:B.targetBusinessCount,businessZone:B.businessZone,deliveryType:B.deliveryType}}),W=A=>i(F=>{const B=F.extraServices||[],P=B.includes(A)?B.filter(ge=>ge!==A):[...B,A],J={...F,extraServices:P},V=h[J.subscription]||1,H=f[J.subscription]||0,ue=J.subscription==="single"?1:J.campaignsPerMonth||1;return{...J,campaignsPerMonth:ue,selectedService:J.type,businessSector:J.activityType,flyerQuantity:J.qty,campaignPeriodStart:J.startDate,campaignPeriodEnd:J.endDate,alreadyPrinted:J.hasFlyers==="yes",printServices:P.filter(ge=>["stampa","grafica"].includes(ge)),paperWeight:J.printGramm,printSides:J.printSide,colorMode:J.printColor,campaignPlan:J.subscription,totalCampaigns:ue*V,planDiscount:H}});return _jsxs("div",{style:{maxWidth:1020,margin:"0 auto",padding:"64px 28px 140px"},children:[_jsx("style",{children:`
.vp-s1-header { margin-bottom: 48px; }
.vp-s1-title { font-family: 'DM Serif Display', Georgia, serif; font-size: clamp(32px, 4vw, 48px); color: #fff; letter-spacing: -1.5px; margin-bottom: 12px; line-height: 1.1; }
.vp-s1-subtitle { font-family: 'DM Sans', Inter, system-ui, sans-serif; font-size: 16px; color: rgba(255,255,255,0.85); max-width: 600px; line-height: 1.6; }
.vp-s1-sp-banner { margin-top: 24px; padding: 16px 20px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: flex-start; gap: 12px; }
.vp-s1-sp-text { font-family: 'DM Sans', Inter, system-ui, sans-serif; font-size: 14px; color: rgba(255,255,255,0.7); line-height: 1.5; margin: 0; }
.vp-s1-section-num { font-family: 'DM Sans', Inter, system-ui, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; color: #E8571A; margin-bottom: 16px; display: block; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 12px; }
.vp-s1-card { background: #0A0D14; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 32px 28px; cursor: pointer; position: relative; overflow: hidden; display: flex; flex-direction: column; min-height: 420px; transition: transform 0.3s ease, border-color 0.3s ease, background 0.3s ease; }
.vp-s1-card:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.15); background: #0E121A; }
.vp-s1-card.vp-active { border-color: #E8571A; background: rgba(232,87,26,0.04); box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.vp-s1-badge { position: absolute; top: 16px; right: 16px; background: rgba(232,87,26,0.15); color: #E8571A; padding: 6px 12px; border-radius: 20px; font-family: 'DM Sans', Inter, system-ui, sans-serif; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; border: 1px solid rgba(232,87,26,0.2); }

.vp-s1-range { -webkit-appearance: none; width: 100%; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); outline: none; margin: 8px 0; }
.vp-s1-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #E8571A; cursor: pointer; transition: transform 0.15s; border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
.vp-s1-range::-webkit-slider-thumb:hover { transform: scale(1.15); }
.vp-s1-range:focus::-webkit-slider-thumb { outline: 2px solid rgba(232,87,26,0.5); outline-offset: 2px; }
.vp-s1-range::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #E8571A; cursor: pointer; transition: transform 0.15s; border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
/* Nuove classi Fase 3B-1 */
.vp-s1-card-inner { background: rgba(8, 14, 28, 0.55); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.25); }
.vp-s1-input { width: 100%; padding: 12px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: #fff; font-family: 'DM Sans', sans-serif; font-size: 14px; transition: border-color 0.2s, background 0.2s, box-shadow 0.2s; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
.vp-s1-input:focus { border-color: #E8571A; background: rgba(232,87,26,0.05); outline: none; box-shadow: 0 0 0 1px #E8571A, inset 0 2px 4px rgba(0,0,0,0.1); }
.vp-s1-input.active { border-color: rgba(232,87,26,0.5); }
.vp-s1-pill { padding: 8px 16px; border-radius: 8px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; border: 1px solid rgba(255,255,255,0.08); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: rgba(255,255,255,0.7); box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s ease; }
.vp-s1-pill:hover { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; }
.vp-s1-pill.active { border-color: #E8571A; background: rgba(232,87,26,0.15); color: #E8571A; box-shadow: 0 0 12px rgba(232,87,26,0.2), 0 4px 12px rgba(0,0,0,0.1); }
.vp-s1-option-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 11px; cursor: pointer; border: 1px solid rgba(255,255,255,0.08); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s ease; }
.vp-s1-option-card:hover { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); }
.vp-s1-option-card.active { border-color: #E8571A; background: rgba(232,87,26,0.12); box-shadow: 0 0 12px rgba(232,87,26,0.2), 0 4px 12px rgba(0,0,0,0.1); }

.vp-s1-format-card { border-radius: 9px; padding: 11px; cursor: pointer; text-align: center; border: 1px solid rgba(255,255,255,0.08); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s ease; }
.vp-s1-format-card:hover { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); }
.vp-s1-format-card.active { border-color: #E8571A; background: rgba(232,87,26,0.12); box-shadow: 0 0 12px rgba(232,87,26,0.2), 0 4px 12px rgba(0,0,0,0.1); }

.vp-s1-plan-card { border-radius: 11px; padding: 16px 14px; cursor: pointer; border: 1px solid rgba(255,255,255,0.07); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s ease; text-align: center; position: relative; }
.vp-s1-plan-card:hover { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); }
.vp-s1-plan-card.active { border-color: #E8571A; background: rgba(232,87,26,0.12); box-shadow: 0 0 12px rgba(232,87,26,0.2), 0 4px 12px rgba(0,0,0,0.1); }

.vp-s1-campaign-btn { width: 56px; height: 56px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(8, 14, 28, 0.4); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: rgba(255,255,255,0.7); font-family: 'DM Serif Display', serif; font-size: 28px; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.vp-s1-campaign-btn:hover { border-color: rgba(255,255,255,0.2); }
.vp-s1-campaign-btn.active { border-color: #E8571A; background: rgba(232,87,26,0.15); color: #E8571A; }

.vp-s1-summary-container { margin-bottom: 18px; padding: 14px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
.vp-s1-summary-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(130px,1fr)); gap: 8px; }
.vp-s1-summary-item { padding: 9px 10px; border-radius: 9px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); }
.vp-s1-summary-totals { display: grid; gap: 7px; margin-top: 10px; padding: 11px 12px; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); }

.vp-s1-cta { padding: 15px 36px !important; border-radius: 12px !important; border: none !important; background: #E8571A !important; color: #fff !important; font-family: 'DM Sans', sans-serif !important; font-size: 16px !important; font-weight: 700 !important; cursor: pointer; box-shadow: 0 4px 0 #A1360B !important; transition: transform 0.1s !important; }
.vp-s1-cta:active { transform: translateY(4px) !important; box-shadow: 0 0 0 #A1360B !important; }`}),_jsxs("div",{className:"vp-s1-header",children:[_jsx("h2",{className:"vp-s1-title",children:"Configura la tua campagna di volantinaggio"}),_jsx("p",{className:"vp-s1-subtitle",children:"Scegli servizio, quantità e periodo. Nel passaggio successivo calcoli zona, copertura e raggio sulla mappa."}),_jsx("div",{className:"vp-s1-sp-banner",children:_jsxs("p",{className:"vp-s1-sp-text",children:[_jsx("span",{style:{color:C.orange,fontWeight:800},children:"Smart Pairing:"}),"\u00a0non trovi la data desiderata? Invia comunque la richiesta. Ti avvisiamo quando siamo operativi nella tua zona o vicino.\u00a0",_jsx("button",{type:"button",onClick:()=>setShowSmartPairingModal(true),style:{color:C.orange,textDecoration:"none",fontWeight:700,background:"none",border:"none",cursor:"pointer",fontSize:14,fontFamily:F.sans,padding:0,display:"inline-block",marginTop:4},children:"Scopri come funziona →"})]})})]}),_jsxs("div",{id:"section-servizio",style:{marginBottom:48},children:[_jsx("div",{className:"vp-s1-section-num",children:"1 \u2013 Tipo di distribuzione"}),_jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:20,alignItems:"stretch"},children:u.map(({id:A,name:F,code:B,desc:P,features:J,c:V,popular:H})=>{const ue=n.type===A;return _jsxs("div",{className:`vp-s1-card ${ue?"vp-active":""}`,role:"button",tabIndex:0,"aria-pressed":ue,onClick:()=>D({type:A}),onKeyDown:ge=>{(ge.key==="Enter"||ge.key===" ")&&(ge.preventDefault(),D({type:A}))},onFocus:ge=>{ge.currentTarget.style.boxShadow=`0 0 0 2px ${V}40`},onBlur:ge=>{ge.currentTarget.style.boxShadow="none"},style:{},children:[H&&_jsx("div",{className:"vp-s1-badge",children:"Popolare"}),ue&&_jsx("div",{style:{position:"absolute",top:20,left:20,width:24,height:24,borderRadius:"50%",background:C.orange,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1},children:_jsx("svg",{width:"12",height:"12",viewBox:"0 0 10 10",children:_jsx("path",{d:"M1.5 5l2.4 2.4L8.5 2.5",stroke:"white",strokeWidth:"2",fill:"none",strokeLinecap:"round",strokeLinejoin:"round"})})}),_jsxs("div",{style:{display:"flex",alignItems:"center",gap:16,marginBottom:24,paddingLeft:ue?36:0,transition:"padding .3s ease"},children:[_jsx("div",{style:{width:48,height:48,borderRadius:12,background:`${V}15`,border:`1px solid ${V}30`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F.sans,fontSize:14,fontWeight:800,color:V,letterSpacing:".06em"},children:B})]}),_jsx("div",{style:{fontFamily:F.serif,fontSize:26,color:C.white,letterSpacing:"-.4px",lineHeight:1.1,marginBottom:12},children:F}),_jsx("p",{style:{fontFamily:F.sans,fontSize:14,color:"rgba(255,255,255,.8)",lineHeight:1.6,marginBottom:24},children:P}),_jsx("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:18},children:J.map(ge=>_jsxs("div",{style:{display:"flex",gap:10,alignItems:"flex-start"},children:[_jsx("div",{style:{width:16,height:16,borderRadius:4,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2},children:_jsx("svg",{width:"8",height:"8",viewBox:"0 0 8 8",children:_jsx("path",{d:"M1.2 4.1l1.7 1.7 3.8-4",stroke:"rgba(255,255,255,.4)",strokeWidth:"1.5",fill:"none",strokeLinecap:"round",strokeLinejoin:"round"})})}),_jsx("span",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.7)",lineHeight:1.4},children:ge})]},ge))}),_jsxs("div",{style:{marginTop:"auto"},children:[ue?_jsx("div",{style:{fontFamily:F.sans,fontSize:11,fontWeight:800,color:C.orange,letterSpacing:".08em",textTransform:"uppercase"},children:"Servizio selezionato"}):null]})]},A)})})]}),_jsx(Step1ZoneCountSelector,{setData:i}),n.type==="d2d"&&_jsxs("div",{style:{marginBottom:22},children:[_jsx("div",{className:"vp-s1-section-num",children:"2 – Tipo di attività del cliente"}),_jsxs("div",{className:"vp-s1-card-inner",children:[_jsx("p",{style:{fontFamily:F.sans,fontSize:12,color:"rgba(255,255,255,.65)",marginBottom:12},children:[_jsx("span",{style:{color:C.orange,fontWeight:700,marginRight:6},children:"Opzionale ma consigliato."}),"Serve per adattare suggerimenti, zone e orari al tipo di attività pubblicizzata."]}),_jsx(Step1ActivityPills,{value:n.activityType,onChange:A=>D({activityType:A,businessSector:A}),isMobile:l}),n.activityType==="altro"&&_jsx("input",{type:"text",placeholder:"Descrivi l'attività...",value:n.activityNote||"",onChange:A=>D({activityNote:A.target.value}),className:"vp-s1-input",style:{marginTop:12}})]})]}),m&&_jsxs("div",{style:{marginBottom:22},children:[_jsx("div",{className:"vp-s1-section-num",children:"2 – Configurazione Hand to Hand"}),_jsxs("div",{className:"vp-s1-card-inner",children:[_jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14,marginBottom:14},children:[_jsxs("div",{children:[_jsx("label",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)",display:"block",marginBottom:6},children:"Numero promoter"}),_jsxs("select",{value:n.promoterCount||"",onChange:A=>D({promoterCount:A.target.value}),className:"vp-s1-input",children:[_jsx("option",{value:"",children:"Seleziona..."}),Bv.map(A=>_jsx("option",{value:A.value,children:A.label},A.value))]})]}),_jsxs("div",{children:[_jsx("label",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)",display:"block",marginBottom:6},children:"Fascia oraria"}),_jsxs("select",{value:n.timeSlot||"",onChange:A=>D({timeSlot:A.target.value}),className:"vp-s1-input",children:[_jsx("option",{value:"",children:"Seleziona..."}),Mv.map(A=>_jsx("option",{value:A.value,children:A.label},A.value))]})]}),_jsxs("div",{children:[_jsx("label",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)",display:"block",marginBottom:6},children:"Durata servizio"}),_jsxs("select",{value:n.serviceDurationHours||"",onChange:A=>D({serviceDurationHours:A.target.value}),className:"vp-s1-input",children:[_jsx("option",{value:"",children:"Seleziona..."}),Fv.map(A=>_jsx("option",{value:A.value,children:A.label},A.value))]})]})]}),_jsxs("div",{style:{display:"grid",gridTemplateColumns:l?"1fr":"1fr 1fr",gap:14,marginBottom:14},children:[_jsxs("div",{children:[_jsx("label",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)",display:"block",marginBottom:6},children:"Luogo principale"}),_jsx("input",{type:"text",placeholder:"es. Duomo, Stazione Centrale...",value:n.distributionLocation||"",onChange:A=>D({distributionLocation:A.target.value}),className:"vp-s1-input"})]}),_jsxs("div",{children:[_jsx("label",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)",display:"block",marginBottom:6},children:"Tipo punto di distribuzione"}),_jsxs("select",{value:n.distributionPointType||"",onChange:A=>D({distributionPointType:A.target.value}),className:"vp-s1-input",children:[_jsx("option",{value:"",children:"Seleziona..."}),Nv.map(A=>_jsx("option",{value:A.value,children:A.label},A.value))]})]})]}),_jsx("textarea",{placeholder:"Note operative (es. target studenti, uscita uffici...)",value:n.operationalNotes||"",onChange:A=>D({operationalNotes:A.target.value}),rows:2,className:"vp-s1-input",style:{resize:"vertical"}}),_jsxs("div",{style:{marginTop:12,fontFamily:F.sans,fontSize:12,color:C.blue,background:"rgba(96,165,250,.08)",padding:"8px 12px",borderRadius:8,border:"1px solid rgba(96,165,250,.2)"},children:[" ",_jsx("b",{children:"Hand to Hand:"})," il prezzo dipende da numero promoter, ore di servizio, luogo e quantità materiale."]})]})]}),y&&_jsxs("div",{style:{marginBottom:22},children:[_jsx("div",{className:"vp-s1-section-num",children:"2 – Configurazione Distribuzione Business"}),_jsxs("div",{className:"vp-s1-card-inner",children:[_jsxs("div",{style:{display:"grid",gridTemplateColumns:l?"1fr":"1fr 1fr",gap:14,marginBottom:14},children:[_jsxs("div",{children:[_jsx("label",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)",display:"block",marginBottom:6},children:"Tipo attività target"}),_jsxs("select",{value:n.targetBusinessType||"",onChange:A=>D({targetBusinessType:A.target.value}),className:"vp-s1-input",children:[_jsx("option",{value:"",children:"Seleziona..."}),$v.map(A=>_jsx("option",{value:A.value,children:A.label},A.value))]})]}),_jsxs("div",{children:[_jsx("label",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)",display:"block",marginBottom:6},children:"Categoria commerciale"}),_jsxs("select",{value:n.businessCategory||"",onChange:A=>D({businessCategory:A.target.value}),className:"vp-s1-input",children:[_jsx("option",{value:"",children:"Seleziona..."}),Lv.map(A=>_jsx("option",{value:A.value,children:A.label},A.value))]})]})]}),_jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14,marginBottom:14},children:[_jsxs("div",{children:[_jsx("label",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)",display:"block",marginBottom:6},children:"Numero attività target"}),_jsxs("select",{value:n.targetBusinessCount||"",onChange:A=>D({targetBusinessCount:A.target.value}),className:"vp-s1-input",children:[_jsx("option",{value:"",children:"Seleziona..."}),Iv.map(A=>_jsx("option",{value:A.value,children:A.label},A.value))]})]}),_jsxs("div",{children:[_jsx("label",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)",display:"block",marginBottom:6},children:"Zona commerciale / comune"}),_jsx("input",{type:"text",placeholder:"es. zona uffici, area industriale...",value:n.businessZone||"",onChange:A=>D({businessZone:A.target.value}),className:"vp-s1-input"})]}),_jsxs("div",{children:[_jsx("label",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)",display:"block",marginBottom:6},children:"Tipo consegna"}),_jsxs("select",{value:n.deliveryType||"",onChange:A=>D({deliveryType:A.target.value}),className:"vp-s1-input",children:[_jsx("option",{value:"",children:"Seleziona..."}),km.map(A=>_jsx("option",{value:A.value,children:A.label},A.value))]})]})]}),_jsx("textarea",{placeholder:"Note operative (es. solo ristoranti, evitare catene...)",value:n.operationalNotes||"",onChange:A=>D({operationalNotes:A.target.value}),rows:2,className:"vp-s1-input",style:{resize:"vertical"}}),_jsxs("div",{style:{marginTop:12,fontFamily:F.sans,fontSize:12,color:C.purple,background:"rgba(167,139,250,.08)",padding:"8px 12px",borderRadius:8,border:"1px solid rgba(167,139,250,.2)"},children:[" ",_jsx("b",{children:"Business:"})," il prezzo dipende da attività target, zona, quantità e tipo consegna."]})]})]}),_jsxs("div",{style:{display:"grid",gridTemplateColumns:l?"1fr":"1fr 1fr",gap:16,marginBottom:22},children:[_jsxs("div",{id:"section-quantita",className:"vp-s1-card-inner",children:[_jsx("div",{className:"vp-s1-section-num",style:{marginBottom:6,paddingBottom:0,borderBottom:"none"},children:"3 \u2013 Quantit\u00e0 volantini"}),_jsx("p",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.85)",marginBottom:20,marginTop:-4},children:"Seleziona una quantità o trascina il cursore."}),_jsx("div",{style:{display:"flex",gap:6,flexWrap:l?"wrap":"nowrap",marginBottom:24},children:[5e3,1e4,25e3,5e4,1e5].map(A=>_jsx("button",{onClick:()=>D({qty:A}),className:`vp-s1-pill ${n.qty===A?"active":""}`,style:{flex:1,minWidth:l?"30%":0,textAlign:"center"},children:new Intl.NumberFormat("it-IT").format(A)},A))}),_jsxs("div",{style:{position:"relative", paddingBottom:24},children:[
  _jsx("input",{type:"range",min:5000,max:100000,step:1000,value:Math.max(5000,Math.min(100000,n.qty||10000)),onChange:A=>D({qty:+A.target.value}),className:"vp-s1-range","aria-label":"Seleziona quantità volantini",style:{"--progress": `${(((Math.max(5000,Math.min(100000,n.qty||10000)))-5000)/(100000-5000))*100}%`}}),
  _jsx("div",{style:{position:"absolute",left:0,right:0,top:28,display:"flex",pointerEvents:"none",padding:"0 10px"},children:
    [5000, 10000, 25000, 50000, 100000].map(val => {
      const p = ((val - 5000) / (100000 - 5000)) * 100;
      return _jsx("div",{key: val, style:{position:"absolute",left:`calc(${p}% + ${10 - p*0.2}px)`,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center"},children:
        _jsx("div",{style:{width:1,height:6,background:"rgba(255,255,255,0.3)"}})
      });
    })
  })
]}),_jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,flexWrap:"wrap",gap:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.06)"},children:[_jsxs("div",{style:{fontFamily:F.sans,fontSize:14,color:"rgba(255,255,255,.9)",fontWeight:500},children:["Quantità selezionata: ",_jsx("b",{style:{color:C.orange,fontSize:18,marginLeft:6,letterSpacing:"-0.5px"},children:new Intl.NumberFormat("it-IT").format(n.qty||0)})," volantini"]}),_jsx("input",{type:"text",inputMode:"numeric",value:n.qty ? new Intl.NumberFormat("it-IT").format(n.qty) : "",onChange:A=>{const v = A.target.value.replace(/\D/g, "");D({qty: v ? parseInt(v, 10) : ""})},onBlur:A=>{const v = A.target.value.replace(/\D/g, "");D({qty: Math.max(5000, Math.min(100000, v ? parseInt(v, 10) : 10000))})},className:"vp-s1-input",style:{width:110,padding:"8px 12px",textAlign:"right",fontSize:14,fontWeight:700}})]})]}),_jsxs("div",{id:"section-periodo",className:"vp-s1-card-inner",children:[_jsx("div",{className:"vp-s1-section-num",children:"4 \u2013 Quando vuoi distribuire?"}),_jsx("p",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.85)",marginBottom:14,marginTop:-4},children:"Scegli il periodo o indica una data preferita."}),_jsx(Step1PeriodPresets,{value:n.campaignPeriodPreset,onChange:A=>D({campaignPeriodPreset:A,...A!=="custom"?{startDate:"",endDate:"",startDateDraft:"",endDateDraft:""}:{}}),isMobile:l}),_jsx("div",{style:{display:"grid",gridTemplateColumns:l?"1fr":"1fr 1fr",gap:10,marginBottom:10},children:[{l:"Data inizio",k:"startDate"},{l:"Data fine",k:"endDate"}].map(({l:A,k:F})=>{const B=n[F]||"",P=`${F}Draft`,J=n[P]??j(B);return _jsxs("div",{children:[_jsx("label",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.6)",display:"block",marginBottom:5},children:A}),_jsxs("div",{style:{position:"relative"},children:[_jsx("input",{type:"text",inputMode:"numeric",placeholder:"gg/mm/aaaa",value:J,onChange:V=>{const H=T(V.target.value),ue=z(H);D({[P]:H,...ue?{[F]:ue}:H?{}:{[F]:""}})},className:`vp-s1-input ${B?"active":""}`,style:{paddingRight:38,colorScheme:"dark"}}),_jsx("input",{type:"date",style:{position:"absolute",right:0,top:0,opacity:0,width:"100%",height:"100%",cursor:"pointer",pointerEvents:"none"},id:`picker-${F}`,value:B||"",onChange:V=>{const H=V.target.value;if(!H)return;
const[ue,ge,Fe]=H.split("-");D({[P]:`${Fe}/${ge}/${ue}`,[F]:H})}}),_jsx("span",{onClick:()=>{try{document.getElementById(`picker-${F}`).showPicker()}catch{document.getElementById(`picker-${F}`).click()}},style:{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"auto",cursor:"pointer",zIndex:10},children:React.createElement("svg",{width:15,height:15,viewBox:"0 0 16 16",fill:"none",xmlns:"http://www.w3.org/2000/svg",style:{display:"block",stroke:"rgba(255,255,255,.55)"}},React.createElement("rect",{x:1.5,y:2.5,width:13,height:12,rx:1.8,strokeWidth:1.2}),React.createElement("path",{d:"M5 1v3M11 1v3M1.5 6.5h13",strokeWidth:1.2,strokeLinecap:"round"}))})]}),B&&_jsxs("div",{style:{fontFamily:F.sans,fontSize:10,color:C.orange,marginTop:3},children:[" ",j(B)]})]},F)})}),_jsx("div",{style:{marginTop:12,padding:"8px 12px",borderRadius:8,background:"rgba(255,255,255,.02)",border:`1px solid ${w?C.red:"rgba(255,255,255,.05)"}`,fontFamily:F.sans,fontSize:11,color:w?C.red:"rgba(255,255,255,.45)",lineHeight:1.4},children:w?"Data fine precedente alla data inizio. Puoi correggerla ora o inviare una richiesta nello Step 3.":"Smart Pairing: non trovi la data desiderata? Invia comunque la richiesta. Ti avvisiamo quando siamo operativi nella tua zona o vicino."})]})]}),_jsxs("div",{id:"section-formato",className:"vp-s1-card-inner",style:{marginBottom:22},children:[_jsx("div",{className:"vp-s1-section-num",children:"5 \u2013 Tipo di volantino"}),_jsxs("div",{children:[_jsxs("div",{style:{marginBottom:14},children:[_jsx("div",{style:{fontFamily:F.sans,fontSize:12,fontWeight:600,color:"rgba(255,255,255,.65)",marginBottom:10},children:"Hai già i volantini stampati?"}),_jsx("div",{style:{display:"grid",gridTemplateColumns:l?"1fr":"1fr 1fr",gap:10},children:[{id:"yes",icon:"",label:"Sì, li ho già",sub:"Inserisci solo il formato"},{id:"no",icon:"",label:"No, devo stamparli",sub:"Aggiungi stampa nei servizi extra"}].map(({id:A,icon:F,label:B,sub:P})=>{const J=(n.hasFlyers||"no")===A;return _jsxs("div",{onClick:()=>D({hasFlyers:A,extraServices:A==="yes"?(n.extraServices||[]).filter(V=>!["stampa","grafica"].includes(V)):n.extraServices||[]}),className:`vp-s1-option-card ${J?"active":""}`,children:[_jsx("span",{style:{fontSize:20},children:F}),_jsxs("div",{children:[_jsx("div",{style:{fontFamily:F.sans,fontSize:13,fontWeight:600,color:C.white,marginBottom:2},children:B}),_jsx("div",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)"},children:P})]})]},A)})})]}),_jsxs("div",{children:[_jsxs("div",{style:{fontFamily:F.sans,fontSize:11,fontWeight:600,color:"rgba(255,255,255,.7)",marginBottom:10},children:["Formato volantino ",_jsx("span",{style:{color:"rgba(255,255,255,.28)",fontWeight:400},children:"(per il calcolo della distribuzione)"})]}),_jsx("div",{style:{display:"grid",gridTemplateColumns:l?"repeat(2,1fr)":"repeat(4,1fr)",gap:7},children:Uv.map(({id:A,label:F,size:B})=>{const P=n.flyerFormat===A;return _jsxs("div",{onClick:()=>D({flyerFormat:A}),className:`vp-s1-format-card ${P?"active":""}`,children:[_jsx("div",{style:{fontFamily:F.serif,fontSize:18,color:P?C.orange:C.white},children:F}),_jsx("div",{style:{fontFamily:F.sans,fontSize:10,color:"rgba(255,255,255,.65)"},children:B})]},A)})})]})]}),_jsxs("div",{id:"section-urgenza",className:"vp-s1-card-inner",style:{marginBottom:22},children:[_jsx("div",{className:"vp-s1-section-num",children:"6 \u2013 Priorit\u00e0 operativa"}),_jsx("p",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.85)",marginBottom:14,marginTop:-4},children:"Standard oppure urgente se vuoi partire più velocemente."}),_jsx("div",{style:{display:"grid",gridTemplateColumns:l?"1fr":"1fr 1fr",gap:11},children:[{id:"normal",icon:"",label:"Standard",sub:"5-7 giorni lavorativi"},{id:"urgent",icon:"",label:"Urgente",sub:"24-48h – maggiorazione applicata"}].map(({id:A,icon:F,label:B,sub:P})=>{const J=n.urgency===A;return _jsxs("div",{onClick:()=>D({urgency:A}),className:`vp-s1-option-card ${J?"active":""}`,children:[_jsx("div",{style:{fontSize:22},children:F}),_jsxs("div",{style:{flex:1},children:[_jsx("div",{style:{fontFamily:F.sans,fontSize:14,fontWeight:600,color:C.white,marginBottom:2},children:B}),_jsx("div",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)"},children:P})]}),_jsx("div",{style:{width:19,height:19,borderRadius:"50%",border:`2px solid ${J?C.orange:"rgba(255,255,255,.2)"}`,background:J?C.orange:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},children:J&&_jsx("svg",{width:"9",height:"9",viewBox:"0 0 9 9",children:_jsx("path",{d:"M1.5 4.5l2 2 4-4.5",stroke:"white",strokeWidth:"1.5",fill:"none",strokeLinecap:"round"})})})]},A)})})]}),_jsxs("div",{id:"section-piano",className:"vp-s1-card-inner",style:{marginBottom:32},children:[_jsx("div",{className:"vp-s1-section-num",children:"7 \u2013 Piano campagna"}),_jsx("div",{style:{display:"grid",gridTemplateColumns:l?"repeat(2,1fr)":"repeat(4,1fr)",gap:9,marginBottom:12},children:Gu.map(({id:A,label:F,icon:B,disc:P})=>{const J=n.subscription===A,qp=n.type==="h2h"?2.20:n.type==="b2b"||n.type==="business-distribution"?3.50:1.85,qr=P>0&&n.qty>0?Math.round((n.qty/1000)*qp*12*(P/100)):0;return _jsxs("div",{onClick:()=>D({subscription:A,campaignsPerMonth:A==="single"?1:n.campaignsPerMonth||1}),className:`vp-s1-plan-card ${J?"active":""}`,children:[P>0&&_jsxs("div",{style:{position:"absolute",top:-8,right:8,background:"#F59E0B",color:C.white,fontFamily:F.sans,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20},children:["-",P,"%"]}),_jsx("div",{style:{fontSize:22,marginBottom:8},children:B}),_jsx("div",{style:{fontFamily:F.sans,fontSize:12,fontWeight:700,color:J?C.white:"rgba(255,255,255,.65)"},children:F}),P>0&&_jsxs("div",{style:{fontFamily:F.sans,fontSize:11,color:"#F59E0B",fontWeight:700,marginTop:4},children:["\u2212",P,"% sul totale"]})]},A)})}),n.subscription&&n.subscription!=="single"&&_jsxs("div",{style:{padding:"16px 18px",borderRadius:12,background:"rgba(232,87,26,.08)",border:"1px solid rgba(232,87,26,.2)"},children:[_jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12},children:[_jsxs("div",{children:[_jsx("div",{style:{fontFamily:F.sans,fontSize:13,fontWeight:700,color:C.white,marginBottom:3},children:"Quante campagne al mese?"}),_jsxs("div",{style:{fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.7)"},children:[Gu.find(A=>A.id===n.subscription)?.label," – sconto ",Gu.find(A=>A.id===n.subscription)?.disc,"% sulla distribuzione"]})]}),_jsx("div",{style:{display:"flex",gap:8},children:[1,2,4].map(A=>{const F=(n.campaignsPerMonth||1)===A;return _jsx("button",{onClick:()=>D({campaignsPerMonth:A}),className:`vp-s1-campaign-btn ${F?"active":""}`,children:A},A)})})]}),n.campaignsPerMonth&&_jsxs("div",{style:{marginTop:10,fontFamily:F.sans,fontSize:11,color:"rgba(255,255,255,.65)"},children:[n.campaignsPerMonth," campagna",n.campaignsPerMonth>1?"e":""," al mese  - ",h[n.subscription]||1," mesi = ",_jsxs("b",{style:{color:C.orange},children:[R," campagne totali"]})]})]})]}),_jsx(Step1ConfigSummary,{data:n}),_jsx("div",{style:{display:"flex",justifyContent:"flex-end"},children:_jsx("button",{className:"vb vp-s1-cta",onClick:()=>{const sc=[{f:!n.type,i:"section-servizio"},{f:!n.qty||n.qty<1,i:"section-quantita"},{f:!n.flyerFormat||!n.hasFlyers,i:"section-formato"},{f:!n.urgency,i:"section-urgenza"},{f:!n.subscription,i:"section-piano"}];for(const{f:ok,i:si}of sc){if(ok){const el=document.getElementById(si);if(el){el.scrollIntoView({behavior:"smooth",block:"center"});el.style.outline="2px solid rgba(232,87,26,.55)";el.style.borderRadius="12px";setTimeout(()=>{el.style.outline="";el.style.borderRadius=""},2500);}return;}}r();},children:"Scegli la zona"})}),showSmartPairingModal&&_jsx("div",{style:{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"},children:_jsxs("div",{style:{position:"relative",width:"100%",maxWidth:420},children:[_jsx("div",{style:{position:"absolute",inset:0,background:"rgba(0,0,0,.6)"},onClick:()=>setShowSmartPairingModal(false)}),_jsxs("div",{style:{position:"relative",background:"rgba(8, 14, 28, 0.65)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",boxShadow:"0 12px 48px rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,.1)",borderRadius:16,padding:24,zIndex:1},children:[_jsx("button",{onClick:()=>setShowSmartPairingModal(false),style:{position:"absolute",top:14,right:14,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.65)",fontSize:20,lineHeight:1},children:"x"}),_jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:16},children:[_jsx("span",{style:{width:8,height:8,borderRadius:"50%",background:C.green,display:"inline-block"}}),_jsx("h3",{style:{fontFamily:F.sans,fontWeight:600,fontSize:15,color:C.white,margin:0},children:"Come funziona Smart Pairing"})]}),_jsxs("div",{style:{display:"flex",flexDirection:"column",gap:12},children:[_jsxs("p",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.65)",lineHeight:1.65,margin:0},children:["Il calendario Smart Pairing ",_jsx("strong",{style:{color:"rgba(255,255,255,.85)"},children:"non è un calendario completo di disponibilità"}),". Mostra solo le opportunità di abbinamento già pianificate."]}),_jsxs("p",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.65)",lineHeight:1.65,margin:0},children:["Nello Step 3 vedrai eventuali opportunità di abbinamento quando esistono campagne compatibili nella tua area."]}),_jsx("p",{style:{fontFamily:F.sans,fontSize:13,color:"rgba(255,255,255,.65)",lineHeight:1.65,margin:0},children:"Non trovi la data desiderata? Puoi sempre inviare una richiesta. Smart Pairing \u00e8 una opportunit\u00e0 opzionale di risparmio e non limita le date disponibili."})]}),_jsx("button",{onClick:()=>setShowSmartPairingModal(false),style:{marginTop:18,width:"100%",background:C.orange,color:C.white,border:"none",borderRadius:8,padding:"10px",fontFamily:F.sans,fontSize:13,fontWeight:600,cursor:"pointer"},children:"Capito"})]})]})})]})]})}

function apiToZones(apiData, city) {
  if (import.meta.env.DEV) {
    console.debug('[DBG apiToZones normalized]', apiData
      ? { error: apiData.error, hasValues: !!apiData.values, breakdownLen: apiData.comuni_breakdown?.length, firstKeys: apiData.comuni_breakdown?.[0] ? Object.keys(apiData.comuni_breakdown[0]) : [] }
      : null);
  }
  if (!apiData || apiData.error || !apiData.values) return null;
  const v = apiData.values;
  const analysisLevel = apiData.metadata?.analysis_level || apiData.values?.analysis_level || "comune";
  const breakdown = analysisLevel === "nil" && Array.isArray(apiData.nil_breakdown) && apiData.nil_breakdown.length
    ? apiData.nil_breakdown
    : apiData.comuni_breakdown || [];
  const totF = v.famiglie_stimate || v.families || v.households || 0;
  const totP = v.popolazione_stimata || v.population || 0;
  const totV = v.volantini_consigliati || v.volantini_stimati || v.recommended_flyers || 0;
  const nC = breakdown.length || 1;
  const items = breakdown.length > 0 ? breakdown : [{ comune_name: city?.name || 'Area', pct_copertura: v.copertura_stimata || 80, volantini_nel_raggio: totV }];
  return items.map((c, idx) => {
    const territoryLevel = c.territory_level || analysisLevel;
    const isNil = territoryLevel === "nil";
    const territoryName = c.nil_name || c.comune_name || c.municipality_name || `Zona ${idx + 1}`;
    const territoryCode = c.nil_code || c.comune_code || c.municipality_code || null;
    const pct = c.pct_copertura || c.percentuale || Math.round(100 / nC);
    const ratio = pct / 100;
    // Use per-municipality values when available (more accurate than total * ratio)
    const vol = c.volantini_nel_raggio || c.volantini_stimati || c.recommended_flyers || Math.round(totV * ratio);
    const fam = c.households_in_radius > 0 ? Math.round(c.households_in_radius) : c.households_total > 0 ? Math.round(c.households_total * ratio) : c.households > 0 ? Math.round(c.households) : c.families > 0 ? Math.round(c.families) : Math.round(vol / 1.1);
    const pop = c.population_in_radius > 0 ? Math.round(c.population_in_radius) : c.population_total > 0 ? Math.round(c.population_total * ratio) : c.population > 0 ? Math.round(c.population) : Math.round(totP * ratio);
    const ri = v.reach_score || 70, ro = v.roi_score || 70, co = v.confidence_score || 75, fi = v.family_index || 70;
    const area = c.area_km2 > 0 ? Math.round(c.area_km2 * ratio * 10) / 10 : Math.round((v.area_km2 || 0) * ratio * 10) / 10;
    return {
      id: `${isNil ? "nil" : "api"}_${idx}_${String(territoryCode || territoryName).toLowerCase().replace(/\s+/g, '_')}`,
      name: territoryName,
      territoryLevel,
      isNil,
      nilCode: c.nil_code || null,
      municipality_code: c.comune_code || c.municipality_code || null,
      area,
      pop, families: fam, mailboxes: Math.round(fam * 0.93),
      coverage: pct, volantiniNelRaggio: Math.round(vol), familiesInRadius: fam, flyersMin: Math.round(vol), flyersMax: Math.round(vol * 1.1),
      operDays: Math.max(1, Math.ceil(vol / 4000)),
      familyIdx: fi, reachD2D: ri, roiD2D: ro, confD2D: co,
      eta14: null, eta34: null, eta64: null, eta65: null, genderM: 49, genderF: 51,
      stranieri: null, indVec: c.old_age_index ?? null, densita: c.density_per_km2 > 0 ? Math.round(c.density_per_km2) : Math.round(pop / Math.max(0.1, area || 1)),
      reddito: c.average_income ?? null, occup: null, imprese: c.businesses_total ?? null, areaType: isNil ? 'NIL Milano' : 'Territoriale',
      poi: 0, nearbyBiz: 0,
      commDens: Math.min(100, Math.round(fi * 0.72)),
      flowScore: Math.min(100, Math.round(ri * 0.82)),
      transitStops: Math.max(2, Math.round((v.area_km2||5)*ratio*2)), trainStations: 0,
      operDaysH2H: Math.max(1, Math.ceil(vol/8000)),
      reachH2H: Math.round(ri*0.85), roiH2H: Math.round(ro*0.8), confH2H: Math.round(co*0.85),
      hotspots: territoryName, timeSlots: null, strongPts: 0,
      bizTotal: 0, competitors: 0,
      commDensB2B: Math.min(100, Math.round(fi*0.65)),
      operDaysB2B: Math.max(1, Math.ceil(vol/10000)),
      cdIdx: Math.min(100, Math.round(fi*0.65)),
      reachB2B: Math.round(ri*0.8), roiB2B: Math.round(ro*0.75), confB2B: Math.round(co*0.8),
      clusters: Math.max(1, Math.round((area || 0)/3)),
      topCats: null,
      targetBiz: 0, strongZone: territoryName, dist: {},
      geometry_geojson: pickRealComuneGeometry(c),
      geometry: pickRealComuneGeometry(c),
      source_flags: isNil ? ['NIL ufficiale Comune di Milano', 'ISTAT ripartito su geometria'] : [],
    };
  });
}

function getZoneCoords(z, city, idx, total) {
  const geo = GEO_DATA.find(c => c.id === z.id);
  if (geo) return geo;
  if (!city) return null;
  const angle = (idx / Math.max(1, total)) * 2 * Math.PI - Math.PI / 2;
  const d = 0.012 + (idx % 3) * 0.007;
  return { lat: city.lat + Math.sin(angle) * d, lng: city.lng + Math.cos(angle) * d * 1.4 };
}

function capToZone(capData, idx) {
  const fam = Math.round(Number(capData.households_estimated) || 0);
  const pop = Math.round(Number(capData.population_estimated) || 0);
  const area = Math.round((Number(capData.area_km2) || 0) * 10) / 10;
  const vol = Math.round(Number(capData.recommended_flyers) || (fam * 1.05));
  return {
    id: `cap_${capData.postal_code}`,
    name: `CAP ${capData.postal_code}`,
    isCap: true,
    postalCode: capData.postal_code,
    municipalityName: capData.municipality_name,
    area, pop, families: fam, mailboxes: Math.round(fam * 0.93),
    coverage: 100, volantiniNelRaggio: Math.round(vol), familiesInRadius: fam, flyersMin: Math.round(vol), flyersMax: Math.round(vol * 1.05),
    operDays: Math.max(1, Math.ceil(vol / 4000)),
    familyIdx: 75, reachD2D: 80, roiD2D: 75, confD2D: 85,
    eta14: null, eta34: null, eta64: null, eta65: null, genderM: 49, genderF: 51,
    stranieri: 10, indVec: 170, densita: area > 0 ? Math.round(pop / area) : 0,
    reddito: 25000, occup: 65, imprese: Math.round(fam * 0.06), areaType: 'Residenziale (CAP)',
    poi: Math.round(fam / 70), nearbyBiz: Math.round(fam / 150),
    commDens: 70, flowScore: 75, transitStops: Math.max(2, Math.round(area * 3)),
    trainStations: 0, operDaysH2H: Math.max(1, Math.ceil(vol / 8000)),
    reachH2H: 82, roiH2H: 78, confH2H: 80,
    hotspots: 'Centro CAP', timeSlots: '08-12 – 14-18', strongPts: 4,
    bizTotal: Math.round(fam * 0.05), competitors: Math.max(1, Math.round(fam * 0.003)),
    commDensB2B: 72, operDaysB2B: Math.max(1, Math.ceil(vol / 10000)),
    cdIdx: 72, reachB2B: 78, roiB2B: 75, confB2B: 82,
    clusters: Math.max(1, Math.round(area / 2)),
    topCats: 'Retail – Food – Servizi',
    targetBiz: Math.round(fam * 0.03), strongZone: 'Centro CAP', dist: {},
    geometry_geojson: pickRealComuneGeometry(capData),
    source_flags: capData.source_flags || ['Stima territoriale']
  };
}


const ZONE_VERDICT_RULES = [
  { min: 78, title: "Zona molto adatta", tone: "strong", text: "Buona concentrazione di famiglie e copertura coerente con una campagna porta a porta." },
  { min: 58, title: "Zona adatta", tone: "good", text: "Area valida per distribuire in modo selettivo, con dati territoriali sufficienti per procedere." },
  { min: 0, title: "Zona da valutare", tone: "watch", text: "Area utilizzabile, ma conviene controllare quantit� e copertura prima di confermare." },
];

function getZoneVerdict({ families = 0, density = 0, coverage = 0, comuniCount = 0 }) {
  const score = Math.round(
    Math.min(34, families / 900) +
    Math.min(26, density / 180) +
    Math.min(24, coverage / 4) +
    Math.min(16, comuniCount * 4)
  );
  const rule = ZONE_VERDICT_RULES.find(item => score >= item.min) || ZONE_VERDICT_RULES[ZONE_VERDICT_RULES.length - 1];
  return { ...rule, score };
}

function Step2({ data, setData, onNext, onBack }) {
  const isMobile = useIsMobile();
const svcRaw = data.selectedService || data.activeService || data.type || "d2d";
const svcType = ({door_to_door:"d2d","door-to-door":"d2d",door:"d2d",hand_to_hand:"h2h","hand-to-hand":"h2h",business:"b2b","business-distribution":"b2b",business_b2b:"b2b"})[svcRaw] || svcRaw;
const serviceMeta = SERVICE_META[svcType] || SERVICE_META.d2d;
const col = serviceMeta.color;
const layers = LAYERS[svcType] || LAYERS.d2d;
const isResidentialStep2 = serviceMeta.mode === "residential";
const isBusinessStep2 = serviceMeta.mode === "business";
const isMovementStep2 = serviceMeta.mode === "movement";
const targetBusinessMeta = isBusinessStep2 ? getTargetBizMeta(data) : null;
const [viewMode, setViewMode] = useState("distribuzione");
const [thLayerId, setThLayerId] = useState(layers[0]?.id || null);
const resolveStep2City = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (normalizeTerritoryName(raw) === "milano") return { id: "milano", name: "Milano", label: "Milano", lat: 45.4642, lng: 9.19 };
  return GEO_DATA.find(g => {
    const name = String(g.name || g.label || "").trim().toLowerCase();
    return name && (name === raw || raw.includes(name) || name.includes(raw));
  }) || null;
};
const initialCity = data.city || resolveStep2City(data.cityName) || null;
const [search, setSearch] = useState(data.cityName || "");
const [city, setCity] = useState(initialCity);
const [radius, setRadius] = useState(data.radius || 3);
const [selected, setSelected] = useState(data.zones || []);
const [dropOpen, setDropOpen] = useState(false);
const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
const [showAdv, setShowAdv] = useState(false);
const [omiExpanded, setOmiExpanded] = useState(false);
const [detailExpanded, setDetailExpanded] = useState(false);
const [zoneListSort, setZoneListSort] = useState("relevance");
const [showMarginalZones, setShowMarginalZones] = useState(false);
const [activeMapLayers, setActiveMapLayers] = useState(() => defaultLayerState(svcType));
useEffect(() => {
  if (!data.selectedService && !data.activeService && !data.type) {
    setData(d => ({ ...d, type: "d2d", selectedService: "d2d", activeService: "d2d" }));
  }
}, [data.selectedService, data.activeService, data.type, setData]);
  const [geocodeSuggestions, setGeocodeSuggestions] = useState([]);
  const [allocationMode, setAllocationMode] = useState(data.allocationMode || "auto");
  const [manualAssignments, setManualAssignments] = useState(data.manualAssignments || {});
  const [searchMode, setSearchMode] = useState(data.searchMode || "municipality");
  const [capSuggestions, setCapSuggestions] = useState([]);
  const [capSearchLoading, setCapSearchLoading] = useState(false);
const [selectedCaps, setSelectedCaps] = useState(data.selectedCaps || []);
const [capDataMap, setCapDataMap] = useState(data.capDataMap || {});
const activeZoneForRadius = data.campaignZones?.find(z => z.id === data.activeZoneId) || null;
const radiusKm = Number(radius ?? activeZoneForRadius?.radiusKm ?? activeZoneForRadius?.radius ?? data.radiusKm ?? data.radius ?? 3);
const quantityForAnalysis = Number(activeZoneForRadius?.assigned_flyers || data.qty || 10000);

  const prevActiveZoneIdRef = useRef(null);

  // Mount Prefill / Initialization effect
  useEffect(() => {
    if (!data.campaignZones || data.campaignZones.length === 0) {
      const defaultZoneId = "zone_" + Date.now();
      const flyerQuantityFromStep1 = data.qty || 10000;
      const initialZoneCount = data.zoneCountIntent === "few" ? 2 : data.zoneCountIntent === "multi" ? 3 : 1;
      const makeInitialZone = (index) => ({
        id: defaultZoneId,
        zone_label: `Zona ${index + 1}`,
        store_name: data.storeName || "",
        service_type: svcType,
        service_variant: data.flyerFormat || "a5",
        assigned_flyers: flyerQuantityFromStep1,
        assigned_budget: flyerQuantityFromStep1 * ((QUOTE_PRICES[svcType] || 18.5) / 1000),
        coverage_percent: 100,
        recommended_flyers: flyerQuantityFromStep1,
        searchMode: index === 0 ? data.searchMode || "municipality" : "municipality",
        city: index === 0 ? data.city || initialCity || null : null,
        cityName: index === 0 ? data.cityName || initialCity?.label || initialCity?.name || "" : "",
        radius: index === 0 ? data.radiusKm || data.radius || 3 : 3,
        radiusKm: index === 0 ? data.radiusKm || data.radius || 3 : 3,
        selected: index === 0 ? data.zones || [] : [],
        selectedCaps: index === 0 ? data.selectedCaps || [] : [],
        capDataMap: index === 0 ? data.capDataMap || {} : {},
        manualAssignments: index === 0 ? data.manualAssignments || {} : {},
        allocationMode: data.allocationMode || "auto",
        startDate: data.startDate || "",
        endDate: data.endDate || "",
        activeMapLayers: defaultLayerState(svcType)
      });
      const initZone = makeInitialZone(0);
      const initialZones = Array.from({ length: initialZoneCount }, (_, index) => (
        index === 0 ? initZone : { ...makeInitialZone(index), id: `zone_${Date.now()}_${index}` }
      ));
      setData(prev => ({
        ...prev,
        campaignZones: initialZones,
        activeZoneId: defaultZoneId,
        selectedService: svcType,
        activeService: svcType,
        type: svcType,
        flyerQuantityFromStep1: flyerQuantityFromStep1,
        qty: flyerQuantityFromStep1,
        flyerQuantity: flyerQuantityFromStep1
      }));
      prevActiveZoneIdRef.current = defaultZoneId;
    } else if (!data.activeZoneId && data.campaignZones.length > 0) {
      const activeZone = data.campaignZones[0];
      setData(prev => ({
        ...prev,
        activeZoneId: activeZone.id,
        selectedService: activeZone.service_type || "d2d",
        activeService: activeZone.service_type || "d2d",
        type: activeZone.service_type || "d2d",
        flyerQuantityFromStep1: activeZone.assigned_flyers || 10000,
        qty: activeZone.assigned_flyers || 10000,
        flyerQuantity: activeZone.assigned_flyers || 10000,
        flyerFormat: activeZone.service_variant || "a5"
      }));
      prevActiveZoneIdRef.current = activeZone.id;
    } else {
      prevActiveZoneIdRef.current = data.activeZoneId;
    }
  }, []);

  // Load active zone to local states when activeZoneId changes
  useEffect(() => {
    if (!data.activeZoneId || !data.campaignZones || data.campaignZones.length === 0) return;
    const activeZone = data.campaignZones.find(z => z.id === data.activeZoneId);
    if (!activeZone) return;
    const resolvedCity = activeZone.city || GEO_DATA.find(g => {
      const name = String(activeZone.cityName || activeZone.zone_label || "").trim().toLowerCase();
      return name && (g.name.toLowerCase() === name || name.includes(g.name.toLowerCase()) || g.name.toLowerCase().includes(name));
    }) || null;

    // Load only if activeZoneId actually changed to avoid overwriting typed input
    if (prevActiveZoneIdRef.current !== data.activeZoneId || (!city && resolvedCity)) {
      prevActiveZoneIdRef.current = data.activeZoneId;

      // Update local states
      setSearch(activeZone.cityName || resolvedCity?.name || "");
      setCity(resolvedCity);
      setRadius(activeZone.radiusKm || activeZone.radius || 3);
      setSelected(activeZone.selected || []);
      setSelectedCaps(activeZone.selectedCaps || []);
      setCapDataMap(activeZone.capDataMap || {});
      setManualAssignments(activeZone.manualAssignments || {});
      setAllocationMode(activeZone.allocationMode || "auto");
      setSearchMode(activeZone.searchMode || "municipality");
      if (activeZone.activeMapLayers) {
        setActiveMapLayers(activeZone.activeMapLayers);
      }

      // Sync active zone parameters back to global data for compatibility with other modules and hooks
      const zSvc = activeZone.service_type || "d2d";
      setData(prev => ({
        ...prev,
        selectedService: zSvc,
        activeService: zSvc,
        type: zSvc,
        flyerFormat: activeZone.service_variant || "a5",
        qty: activeZone.assigned_flyers || 10000,
        flyerQuantity: activeZone.assigned_flyers || 10000,
        flyerQuantityFromStep1: activeZone.assigned_flyers || 10000,
        cityName: activeZone.cityName || resolvedCity?.label || resolvedCity?.name || "",
        city: resolvedCity,
        radius: activeZone.radiusKm || activeZone.radius || 3,
        radiusKm: activeZone.radiusKm || activeZone.radius || 3,
        zones: activeZone.selected || [],
        selectedCaps: activeZone.selectedCaps || [],
        capDataMap: activeZone.capDataMap || {},
        manualAssignments: activeZone.manualAssignments || {},
        allocationMode: activeZone.allocationMode || "auto",
        startDate: activeZone.startDate || "",
        endDate: activeZone.endDate || ""
      }));
    }
  }, [data.activeZoneId, data.campaignZones]);

  // Reciprocally update data.campaignZones when local states change
  useEffect(() => {
    if (!data.activeZoneId || !data.campaignZones || data.campaignZones.length === 0) return;

    setData(prev => {
      if (!prev.campaignZones || !prev.activeZoneId) return prev;
      const zoneIndex = prev.campaignZones.findIndex(z => z.id === prev.activeZoneId);
      if (zoneIndex === -1) return prev;

      const currentZone = prev.campaignZones[zoneIndex];

      const changed =
        currentZone.cityName !== search ||
        JSON.stringify(currentZone.city) !== JSON.stringify(city) ||
        Number(currentZone.radiusKm ?? currentZone.radius) !== Number(radiusKm) ||
        JSON.stringify(currentZone.selected) !== JSON.stringify(selected) ||
        JSON.stringify(currentZone.selectedCaps) !== JSON.stringify(selectedCaps) ||
        JSON.stringify(currentZone.capDataMap) !== JSON.stringify(capDataMap) ||
        JSON.stringify(currentZone.manualAssignments) !== JSON.stringify(manualAssignments) ||
        currentZone.allocationMode !== allocationMode ||
        currentZone.searchMode !== searchMode ||
        JSON.stringify(currentZone.activeMapLayers) !== JSON.stringify(activeMapLayers);

      if (!changed) return prev;

      const updatedZones = [...prev.campaignZones];
      updatedZones[zoneIndex] = {
        ...currentZone,
        cityName: search,
        city: city,
        radius: radiusKm,
        radiusKm: radiusKm,
        selected: selected,
        selectedCaps: selectedCaps,
        capDataMap: capDataMap,
        manualAssignments: manualAssignments,
        allocationMode: allocationMode,
        searchMode: searchMode,
        activeMapLayers: activeMapLayers
      };

      return {
        ...prev,
        campaignZones: updatedZones,
        cityName: search,
        city: city,
        radius: radiusKm,
        radiusKm: radiusKm,
        selectedRadius: radiusKm,
        zones: selected,
        selectedCaps: selectedCaps,
        capDataMap: capDataMap,
        manualAssignments: manualAssignments,
        allocationMode: allocationMode,
        searchMode: searchMode
      };
    });
  }, [search, city, radiusKm, selected, selectedCaps, capDataMap, manualAssignments, allocationMode, searchMode, activeMapLayers, data.activeZoneId]);

  const updateActiveRadius = (nextRadiusKm) => {
    const normalizedRadius = Number(nextRadiusKm);
    setRadius(normalizedRadius);
    setSelected([]);
    setData(prev => {
      const updatedZones = (prev.campaignZones || []).map(zone => (
        zone.id === prev.activeZoneId
          ? { ...zone, radius: normalizedRadius, radiusKm: normalizedRadius, selected: [] }
          : zone
      ));
      return {
        ...prev,
        radius: normalizedRadius,
        radiusKm: normalizedRadius,
        selectedRadius: normalizedRadius,
        zones: [],
        campaignZones: updatedZones,
      };
    });
  };

  const resetActiveZone = () => {
    setSearch("");
    setCity(null);
    setRadius(3);
    setSelected([]);
    setSelectedCaps([]);
    setCapDataMap({});
    setManualAssignments({});
    setGeocodeSuggestions([]);
    setCapSuggestions([]);
    setDropOpen(false);
    setSearchMode("municipality");
    setData(prev => {
      const updatedZones = (prev.campaignZones || []).map(zone => (
        zone.id === prev.activeZoneId
          ? {
              ...zone,
              city: null,
              cityName: "",
              radius: 3,
              radiusKm: 3,
              selected: [],
              selectedCaps: [],
              capDataMap: {},
              manualAssignments: {},
              searchMode: "municipality"
            }
          : zone
      ));
      return {
        ...prev,
        searchedLocation: "",
        comune: "",
        cityName: "",
        city: null,
        radius: 3,
        radiusKm: 3,
        selectedRadius: 3,
        zones: [],
        selectedZones: [],
        selectedComuni: [],
        selectedCaps: [],
        capDataMap: {},
        manualAssignments: {},
        searchMode: "municipality",
        campaignZones: updatedZones,
      };
    });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("comune");
      url.searchParams.delete("municipality");
      url.searchParams.set("step", "2");
      const qs = url.searchParams.toString();
      window.history.replaceState(null, "", qs ? `${url.pathname}?${qs}` : url.pathname);
    }
  };

  const handleDuplicateZone = (zoneToClone, e) => {
    if (e) e.stopPropagation();
    const newId = "zone_" + Date.now();
    const clonedZone = {
      ...zoneToClone,
      id: newId,
      zone_label: `${zoneToClone.zone_label} (Copia)`,
    };
    setData(prev => ({
      ...prev,
      campaignZones: [...prev.campaignZones, clonedZone],
      activeZoneId: newId
    }));
  };

  const handleDeleteZone = (zoneId, e) => {
    if (e) e.stopPropagation();
    if (data.campaignZones.length <= 1) return;
    
    setData(prev => {
      const newZones = prev.campaignZones.filter(z => z.id !== zoneId);
      const newActiveId = prev.activeZoneId === zoneId ? newZones[0].id : prev.activeZoneId;
      return {
        ...prev,
        campaignZones: newZones,
        activeZoneId: newActiveId
      };
    });
  };

  const handleMoveZone = (idx, direction, e) => {
    if (e) e.stopPropagation();
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === data.campaignZones.length - 1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    
    setData(prev => {
      const newZones = [...prev.campaignZones];
      const temp = newZones[idx];
      newZones[idx] = newZones[targetIdx];
      newZones[targetIdx] = temp;
      return {
        ...prev,
        campaignZones: newZones
      };
    });
  };

  const handleAddZone = () => {
    const newId = "zone_" + Date.now();
    const nextSvc = svcType || data.type || "d2d";
    const newZone = {
      id: newId,
      zone_label: `Zona ${(data.campaignZones || []).length + 1}`,
      store_name: "",
      service_type: nextSvc,
      service_variant: data.flyerFormat || "a5",
      assigned_flyers: data.qty || 10000,
      assigned_budget: (data.qty || 10000) * ((QUOTE_PRICES[nextSvc] || 18.5) / 1000),
      coverage_percent: 100,
      recommended_flyers: data.qty || 10000,
      searchMode: "municipality",
      city: null,
      cityName: "",
      radius: 3,
      selected: [],
      selectedCaps: [],
      capDataMap: {},
      manualAssignments: {},
      allocationMode: "auto",
      startDate: data.startDate || "",
      endDate: data.endDate || "",
      activeMapLayers: defaultLayerState(nextSvc)
    };
    setData(prev => ({
      ...prev,
      campaignZones: [...prev.campaignZones, newZone],
      activeZoneId: newId
    }));
  };

  const updateZoneField = (zoneId, field, val) => {
    setData(prev => {
      if (!prev.campaignZones) return prev;
      const updated = prev.campaignZones.map(z => {
        if (z.id !== zoneId) return z;
        const newZ = { ...z, [field]: val };
        
        if (field === "assigned_flyers" || field === "service_type") {
          const qty = parseInt(newZ.assigned_flyers || 0);
          const svc = newZ.service_type || "d2d";
          newZ.assigned_budget = qty * ((QUOTE_PRICES[svc] || 18.5) / 1000);
        }
        
        return newZ;
      });
      
      if (prev.activeZoneId === zoneId) {
        const activeZ = updated.find(z => z.id === zoneId);
        const zSvc = activeZ.service_type || "d2d";
        return {
          ...prev,
          campaignZones: updated,
          qty: activeZ.assigned_flyers,
          flyerQuantity: activeZ.assigned_flyers,
          flyerQuantityFromStep1: activeZ.assigned_flyers,
          selectedService: zSvc,
          activeService: zSvc,
          type: zSvc,
          flyerFormat: activeZ.service_variant || "a5"
        };
      }
      
      return { ...prev, campaignZones: updated };
    });
  };

const selectedMunicipality = useMemo(
  () => {
    if (searchMode === "cap") return null;
    const raw = city?.label || city?.name || search || data.cityName || null;
    if (isResidentialStep2 && (isMilanoTerritory(raw) || isMilanoCoordinates(city?.lat, city?.lng))) return "Milano";
    return raw;
  },
  [searchMode, city?.label, city?.name, city?.lat, city?.lng, search, data.cityName, isResidentialStep2]
);
const requestedAnalysisLevel = useMemo(
  () => isResidentialStep2 && (isMilanoTerritory(selectedMunicipality) || isMilanoCoordinates(city?.lat, city?.lng)) ? "nil" : "comune",
  [isResidentialStep2, selectedMunicipality, city?.lat, city?.lng]
);
const analysisScope = useMemo(() => data.activeZoneId || "zone", [data.activeZoneId]);
const analysisParams = useMemo(() => ({
  lat: city?.lat ?? null,
  lng: city?.lng ?? null,
  radiusKm,
  serviceType: svcType,
  municipality: selectedMunicipality,
  analysisLevel: requestedAnalysisLevel,
  quantity: quantityForAnalysis,
  scope: analysisScope,
}), [city?.lat, city?.lng, radiusKm, svcType, selectedMunicipality, requestedAnalysisLevel, quantityForAnalysis, analysisScope]);
const { data: apiData, loading: apiLoading, error: apiError } = useServiceAnalysis(
  analysisParams.lat,
  analysisParams.lng,
  analysisParams.radiusKm,
  analysisParams.serviceType,
  analysisParams.municipality,
  analysisParams.quantity,
  analysisParams.scope,
  analysisParams.analysisLevel
);
const omiInfo = apiData?.metadata?.omi ?? null;
const { sectors, loading: sectorsLoading } = useSectors(city?.lat, city?.lng, radiusKm, svcType);
const { pois, loading: poiLoading }    = usePoi(city?.lat, city?.lng, radiusKm, svcType);
const { transportState, loading: transportLoading } = useTransportStops(city?.lat, city?.lng, radiusKm, svcType);
const addressPointParams = useMemo(() => ({
  lat: city?.lat ?? null,
  lng: city?.lng ?? null,
  radiusKm,
  serviceType: svcType,
}), [city?.lat, city?.lng, radiusKm, svcType]);
const civiciFetchEnabled =
  svcType === "d2d" &&
  activeMapLayers?.civici === true &&
  Boolean(city?.lat && city?.lng && radiusKm);

const { civiciState, loading: civiciLoading } = useAddressPoints(
  addressPointParams.lat,
  addressPointParams.lng,
  addressPointParams.radiusKm,
  addressPointParams.serviceType,
  civiciFetchEnabled
);
  const analysisLoading = apiLoading;
  const gisLoading = Boolean(city && (apiLoading || sectorsLoading || poiLoading || civiciLoading || transportLoading));
  const [gisTimedOut, setGisTimedOut] = useState(false);
  useEffect(() => {
    setGisTimedOut(false);
    if (!gisLoading) return undefined;
    const timeoutId = window.setTimeout(() => setGisTimedOut(true), 12000);
    return () => window.clearTimeout(timeoutId);
  }, [gisLoading, data.activeZoneId, city?.lat, city?.lng, radiusKm, svcType]);
const primaryMunicipalityCode = useMemo(
  () => apiData?.comuni_breakdown?.[0]?.municipality_code ?? apiData?.comuni_breakdown?.[0]?.comune_code ?? null,
  [apiData]
);
const demographicsParams = useMemo(() => {
  const lat = Number(city?.lat);
  const lng = Number(city?.lng);
  const canLoadDemographics =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    primaryMunicipalityCode != null;
  if (!canLoadDemographics) return null;
  return { geographyRef: primaryMunicipalityCode, year: 2025 };
}, [city?.lat, city?.lng, primaryMunicipalityCode]);
const { data: demoData, loading: demoLoading, error: demoError } = useDemographicIndicators(demographicsParams);
  const analysisError = apiError;
const confirmedSources = confirmedSourcesOrFallback(apiData, apiError);
const confirmedStep2Sources = confirmedSources;
const dataSourceLabel = (src) => sourceIsConfirmed(src, confirmedSources) ? normalizeDataSourceLabel(src) : (apiError || apiData?.error ? "Dati non disponibili" : "Stima interna");
const responseBreakdownRows = Array.isArray(apiData?.nil_breakdown) && apiData.nil_breakdown.length ? apiData.nil_breakdown : (apiData?.comuni_breakdown || []);
const responseTerritoryLevel = responseBreakdownRows.find(row => row?.territory_level)?.territory_level;
const activeAnalysisLevel = apiData?.metadata?.analysis_level || apiData?.values?.analysis_level || responseTerritoryLevel || "comune";
const isNilAnalysis = isResidentialStep2 && activeAnalysisLevel === "nil";
const nilUnavailable = isResidentialStep2 && requestedAnalysisLevel === "nil" && apiData?.metadata?.nil_unavailable;
const territoryPluralLabel = isNilAnalysis ? "Zone NIL" : "Comuni";
const territorySingularLabel = isNilAnalysis ? "NIL" : "Comune";
const civiciCount =
  Number(civiciState?.count || 0) ||
  Number(civiciState?.bboxCount || 0);
const civiciAvailable =
  Boolean(civiciState?.available) || civiciCount > 0;


  useEffect(() => { setThLayerId(layers[0]?.id || null); }, [svcType]);
  useEffect(() => { setActiveMapLayers(defaultLayerState(svcType)); }, [svcType]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!civiciLoading && !civiciAvailable) {
      setActiveMapLayers(prev => prev?.civici ? ({ ...prev, civici: false }) : prev);
    }
  }, [civiciLoading, civiciAvailable]);

  useEffect(() => {
    if (!search || search.length < 2) { setGeocodeSuggestions([]); setCapSuggestions([]); return; }
    const t = setTimeout(async () => {
      if (searchMode === "cap") {
        if (/^\d{1,5}$/.test(search)) {
          setCapSearchLoading(true);
          // Prima prova dal DB Supabase
          const { data: caps, error } = await supabase.from('geo_postal_areas').select('postal_code, municipality_name').ilike('postal_code', `${search}%`).limit(8);
          setCapSearchLoading(false);
          // Se il DB e vuoto, usa il dataset statico locale
          const results = (!error && caps && caps.length > 0)
            ? caps
            : CAP_LOMBARDIA.filter(c => c.postal_code.startsWith(search)).slice(0, 8);
          setCapSuggestions(results.map(c => ({ id: c.postal_code, name: `${c.postal_code} - ${c.municipality_name}`, postalCode: c.postal_code })));
        } else {
          setCapSuggestions([]);
        }
        return;
      }
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
      if (mapboxToken) {
        try {
          const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(search)}.json?access_token=${mapboxToken}&country=IT&types=place,locality,neighborhood&language=it&limit=6`);
          const d = await r.json();
          if (d.features?.length) {
            setGeocodeSuggestions(d.features.map(f => ({ id: f.id, name: f.place_name_it || f.place_name || f.text, label: f.text, lat: f.center[1], lng: f.center[0] })));
            return;
          }
        } catch {}
      }
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&countrycodes=it&format=json&limit=6&featuretype=city`);
        const d = await r.json();
        setGeocodeSuggestions(d.map(f => ({ id: f.place_id, name: f.display_name.split(',').slice(0,2).join(', '), label: f.display_name.split(',')[0], lat: parseFloat(f.lat), lng: parseFloat(f.lon) })));
      } catch { setGeocodeSuggestions([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [search, searchMode]);

const activeLay = layers.find(l => l.id === thLayerId) || layers[0];
const apiZones = useMemo(
  () => (apiData && !apiData.error && apiData.values) ? apiToZones(apiData, city) : null,
  [apiData, city]
);
const hasUsefulApiZones = useMemo(
  () => Array.isArray(apiZones) && apiZones.length > 0 && apiZones.some(z => Number(z.families || z.familiesInRadius || z.flyersMin || 0) > 0),
  [apiZones]
);
const apiZonesByName = useMemo(
  () => new Map((apiZones || []).map(z => [String(z.name || "").trim().toLowerCase(), z])),
  [apiZones]
);
const zonesInRadius = useMemo(
  () => hasUsefulApiZones ? apiZones : [],
  [hasUsefulApiZones, apiZones]
);
useEffect(() => {
  if (!apiData) return;
  const nilRows = Array.isArray(apiData.nil_breakdown) && apiData.nil_breakdown.length ? apiData.nil_breakdown : (apiData.comuni_breakdown || []).filter(row => row?.territory_level === "nil");
  const territoryLevel = nilRows.length ? "nil" : activeAnalysisLevel;
}, [apiData, requestedAnalysisLevel, activeAnalysisLevel, zonesInRadius]);
const territorialDataUnavailable = Boolean(city && !apiLoading && !hasUsefulApiZones);
  const capZones = useMemo(
    () => selectedCaps.map(cap => capDataMap[cap]).filter(zone => zone && !zone.unavailable),
    [selectedCaps, capDataMap]
  );
  const allZones = useMemo(() => [...zonesInRadius,...capZones], [zonesInRadius, capZones]);

  useEffect(() => {
    if (hasUsefulApiZones) {
      setSelected(apiZones.map(z => z.id));
    } else {
      setSelected([]);
    }
  }, [city?.id, radius, hasUsefulApiZones, apiZones]);

  // In CAP mode, selZones = only selected CAPs; in Comune mode = zones in radius
  const selZones = searchMode === "cap"
    ? selectedCaps.map(cap => capDataMap[cap]).filter(zone => zone && !zone.unavailable)
    : allZones.filter(z => selected.includes(z.id));

  async function handleCapSelect(capSuggestion) {
    setSearch("");
    setDropOpen(false);
    if (selectedCaps.includes(capSuggestion.postalCode)) return;

    const localEntry = CAP_LOMBARDIA.find(c => c.postal_code === capSuggestion.postalCode);
    const unavailableCap = {
      id: `cap_${capSuggestion.postalCode}`,
      name: `CAP ${capSuggestion.postalCode}`,
      postalCode: capSuggestion.postalCode,
      municipalityName: localEntry?.municipality_name || capSuggestion.name,
      isCap: true,
      unavailable: true,
      unavailableMessage: "Dati CAP non disponibili. Usa Comune o Indirizzo + raggio.",
    };

    try {
      const { data: analysis, error } = await supabase.rpc('get_postal_areas_analysis', { postal_codes: [capSuggestion.postalCode] });
      if (!error && analysis && analysis[0]) {
        const zone = capToZone(analysis[0], selectedCaps.length);
        setCapDataMap(prev => ({...prev, [capSuggestion.postalCode]: zone }));
      } else {
        setCapDataMap(prev => ({...prev, [capSuggestion.postalCode]: unavailableCap }));
      }
    } catch {
      setCapDataMap(prev => ({...prev, [capSuggestion.postalCode]: unavailableCap }));
    }
    setSelectedCaps(prev => [...prev, capSuggestion.postalCode]);
  }
const flyerQuantityFromStep1 = data.flyerQuantity || data.qty || 10000;
function zCap(z) { return svcType === "d2d" ? z.families : svcType === "h2h" ? z.poi * 2 : z.bizTotal * 3; }
  function toggleZone(id) {
    if (id.startsWith("cap_")) {
      const cp = id.replace("cap_", "");
      setSelectedCaps(prev => prev.includes(cp) ? prev.filter(x => x !== cp) : [...prev, cp]);
    } else {
      setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
  }

  const thVals = activeLay ? zonesInRadius.map(z => z[activeLay.field]).filter(v => v != null) : [];
const thMin = thVals.length ? Math.min(...thVals) : 0;
const thMax = thVals.length ? Math.max(...thVals) : 1;
function zoneColor(z) { return activeLay ? thColor(z[activeLay.field], thMin, thMax, activeLay.lo, activeLay.hi) : col + "88"; }

  const localProj = city ? (lat, lng) => ({ x: MW/2 + (lng - city.lng) * SCALE_X, y: MH/2 - (lat - city.lat) * SCALE_Y }) : s2proj;
  const center = city ? localProj(city.lat, city.lng) : { x: MW / 2, y: MH / 2 };
const rPx = kmToPx(radius);
const businessMapZones = isBusinessStep2 ? zonesInRadius.map(z => ({...z, businessScore: businessZoneScore(z), clusterRows: businessRows([z], targetBusinessMeta)})).sort((a, b) => businessZoneScore(b) - businessZoneScore(a)) : [];
const doorCoverage = isResidentialStep2
    ? computeDoorToDoorCoverage({ insertedFlyers: flyerQuantityFromStep1, selectedZones: selZones })
    : null;
const totalCapacity = isResidentialStep2 ? doorCoverage.fullCoverageFlyers : selZones.reduce((a, z) => a + zCap(z), 0);
  const requiredFlyers = isResidentialStep2 ? doorCoverage.fullCoverageFlyers : selZones.reduce((a, z) => a + zCap(z), 0);
  const isPartial = isResidentialStep2 ? doorCoverage.status === "partial" : flyerQuantityFromStep1 < requiredFlyers;

  let remainingForAuto = flyerQuantityFromStep1;
  const zonesAllocation = selZones.map(z => {
    const req = isResidentialStep2 ? getZoneFullCoverageFlyers(z) : zCap(z);
    let assigned = 0;
    if (allocationMode === "auto") {
      assigned = Math.min(req, remainingForAuto);
      remainingForAuto -= assigned;
    } else {
      assigned = manualAssignments[z.id] || 0;
    }
    return {
      id: z.id,
      name: z.name,
      requiredFlyers: req,
      assignedFlyers: assigned,
      coveragePercent: req > 0 ? Math.round((assigned / req) * 100) : 0,
      allocationStatus: assigned >= req ? "full" : assigned > 0 ? "partial" : "none"
    };
  });

  const totalAssigned = zonesAllocation.reduce((a, v) => a + v.assignedFlyers, 0);
  const isInvalid = allocationMode === "manual" && totalAssigned > flyerQuantityFromStep1;

  function updateManual(id, val) {
    const num = parseInt(val) || 0;
    setManualAssignments(prev => ({...prev, [id]: num }));
  }

  function handleNext() {
    const isCapMode = searchMode === "cap";
    setData(prev => ({...prev,
      zones: isCapMode ? [] : selected,
      selectedCaps,
      capDataMap,
      searchMode,
      areaMode: isCapMode ? "cap" : activeAnalysisLevel,
      analysisLevel: isCapMode ? "cap" : activeAnalysisLevel,
      capAnalysis: isCapMode ? selectedCaps.map(cap => capDataMap[cap]).filter(Boolean) : [],
      nearbyAreasExplicitlyAdded: false,
      selectedComuni: isCapMode
        ? []
        : selZones.map(z => z.name),
      selectedNil: !isCapMode && isNilAnalysis ? selZones.map(z => ({ code: z.nilCode, name: z.name })) : [],
      selectedMunicipalities: isCapMode ? [] : selZones.map(z => z.name),
      cityName: isCapMode ? (selectedCaps.length === 1 ? `CAP ${selectedCaps[0]}` : `${selectedCaps.length} CAP selezionati`) : (city?.label || city?.name || ""),
      allocationMode,
      manualAssignments,
      totalAssigned,
      totalCapacity,
      isPartial,
      requiredFlyers,
      operationalWaypoints,
      gpsPlannedPoints: operationalWaypoints,
      requiredTotalFlyers: requiredFlyers,
      fullCoverageFlyers: requiredFlyers,
      missingFlyers: isResidentialStep2 ? doorCoverage.missingFlyers : Math.max(0, requiredFlyers - flyerQuantityFromStep1),
      remainingFlyers: isResidentialStep2 ? doorCoverage.remainingFlyers : Math.max(0, flyerQuantityFromStep1 - requiredFlyers),
      coverageStatus: isResidentialStep2 ? doorCoverage.status : (isPartial ? "partial" : "sufficient"),
      zonesAllocation,
      serviceKpis,
      radius,
      city,
      sources: confirmedStep2Sources,
      activeService: svcType,
      selectedService: svcType,
      comuniNelRaggio: zonesInRadius.length,
      metadata: { omi: omiInfo, operational_waypoints: operationalWaypoints, analysis_level: activeAnalysisLevel, nil_unavailable: nilUnavailable },
    }));
    onNext();
  }

const coverageStatus = selZones.length === 0 && !isMovementStep2 && !isBusinessStep2 ? "empty" : isPartial ? "partial" : "sufficient";
const remainingFlyers = isResidentialStep2 && doorCoverage ? doorCoverage.remainingFlyers : (coverageStatus === "sufficient" ? flyerQuantityFromStep1 - requiredFlyers : 0);
const canGo = searchMode === "cap" ? selectedCaps.length > 0 : (selZones.length > 0 || ((isMovementStep2 || isBusinessStep2) && pois.length > 0));
const h2hMetrics = useMemo(
  () => getH2HMetrics(pois, transportState, radiusKm),
  [pois, transportState, radiusKm]
);
const businessMetrics = useMemo(
  () => getBusinessMetrics(pois, targetBusinessMeta, radiusKm),
  [pois, targetBusinessMeta, radiusKm]
);
const operationalWaypoints = useMemo(() => {
  if (isMovementStep2) {
    return h2hMetrics.clusters.slice(0, 24).map((point) => ({
      id: point.id,
      type: "h2h_hotspot",
      label: point.name,
      category: point.zoneName,
      lat: point.lat,
      lng: point.lng,
      score: point.strength,
      poiCount: point.poi,
      source: "POI/TPL cluster",
    })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }
  if (isBusinessStep2) {
    return businessMetrics.clusterRows.slice(0, 24).map((point) => ({
      id: point.id,
      type: "b2b_cluster",
      label: point.name,
      category: point.dominant || point.zoneName,
      lat: point.lat,
      lng: point.lng,
      score: point.score,
      poiCount: point.activities,
      source: "POI business cluster",
    })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }
  return (civiciState?.points || []).slice(0, 50).map((point) => ({
    id: point.id,
    type: "d2d_address_sample",
    label: [point.via, point.numeroCivico].filter(Boolean).join(" ") || "Civico OSM",
    category: point.comune || "Civico",
    lat: point.lat,
    lng: point.lng,
    score: null,
    poiCount: null,
    source: "OSM address sample",
  })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}, [isMovementStep2, isBusinessStep2, h2hMetrics.clusters, businessMetrics.clusterRows, civiciState?.points]);
const serviceKpis = selZones.length > 0 ? {
    area: selZones.reduce((a, z) => a + (Number(z.area) || 0), 0).toFixed(1),
    hotspotStrength: isMovementStep2 ? h2hMetrics.zones : Math.round(selZones.reduce((a, z) => a + (h2hHotspotStrength(z) || 0), 0) / selZones.length),
    families: isResidentialStep2 ? selZones.reduce((a, z) => a + (Number(z.families) || 0), 0) : 0,
    pop: isResidentialStep2 ? selZones.reduce((a, z) => a + (Number(z.pop) || 0), 0) : 0,
    population: isResidentialStep2 ? selZones.reduce((a, z) => a + (Number(z.pop) || 0), 0) : 0,
    coverage: isResidentialStep2 ? (requiredFlyers > 0 ? Math.min(100, Math.round((flyerQuantityFromStep1 / requiredFlyers) * 100)) : Math.round(selZones.reduce((a, z) => a + (Number(z.coverage) || 0), 0) / selZones.length)) : null,
    recommendedFlyers: isResidentialStep2 ? selZones.reduce((a, z) => a + (Number(z.flyersMin) || 0), 0) : 0,
    selectedComuni: selZones.map(z => z.name),
    selectedNil: isNilAnalysis ? selZones.map(z => ({ code: z.nilCode, name: z.name })) : [],
    analysisLevel: activeAnalysisLevel,
    comuniCount: selZones.length,
    poi: isMovementStep2 ? h2hMetrics.poi : selZones.reduce((a, z) => a + (Number(z.poi) || 0), 0),
    operationalZones: isMovementStep2 ? h2hMetrics.zones : selZones.length,
    hotspotCount: isMovementStep2 ? h2hMetrics.zones : 0,
    tplStops: isMovementStep2 ? h2hMetrics.tplStops : 0,
    stations: isMovementStep2 ? h2hMetrics.stations : 0,
    metro: isMovementStep2 ? h2hMetrics.metro : 0,
    universities: isMovementStep2 ? h2hMetrics.universities : 0,
    localAttractors: isMovementStep2 ? h2hMetrics.localAttractors : 0,
    gpsWaypoints: operationalWaypoints.length,
    transitStops: isMovementStep2 ? h2hMetrics.transitTotal : selZones.reduce((a, z) => a + (Number(z.transitStops) || 0) + (Number(z.trainStations) || 0), 0),
    flowScore: isMovementStep2 ? h2hMetrics.flowScore : selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.flowScore) || 0), 0) / selZones.length) : 0,
    businesses: isBusinessStep2 ? businessMetrics.businesses : selZones.reduce((a, z) => a + (Number(z.bizTotal) || 0), 0),
    competitors: isBusinessStep2 ? businessMetrics.competitors : selZones.reduce((a, z) => a + (Number(z.competitors) || 0), 0),
    commercialDensity: isBusinessStep2 ? businessMetrics.commercialDensity : (selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.commDensB2B) || 0), 0) / selZones.length) : 0),
    clusters: isBusinessStep2 ? businessMetrics.clusters : selZones.reduce((a, z) => a + (Number(z.clusters) || 0), 0),
    targetBusinesses: isBusinessStep2 ? businessMetrics.targetBusinesses : selZones.reduce((a, z) => a + (Number(z.targetBiz) || 0), 0),
    cdIdx: isBusinessStep2 ? businessMetrics.cdIdx : (selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.cdIdx) || 0), 0) / selZones.length) : 0),
    familyIndex: isResidentialStep2 && selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.familyIdx) || 0), 0) / selZones.length) : null,
    reachScore: isResidentialStep2 && selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.reachD2D) || 0), 0) / selZones.length) : null,
    roiScore: isResidentialStep2 && selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.roiD2D) || 0), 0) / selZones.length) : null,
    confidenceScore: isResidentialStep2 && selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.confD2D) || 0), 0) / selZones.length) : null,
  } : { area: "0", hotspotStrength: isMovementStep2 ? h2hMetrics.zones : 0, families: 0, pop: 0, population: 0, coverage: 0, recommendedFlyers: 0, selectedComuni: [], selectedNil: [], analysisLevel: activeAnalysisLevel, comuniCount: 0, poi: isMovementStep2 ? h2hMetrics.poi : 0, operationalZones: isMovementStep2 ? h2hMetrics.zones : isBusinessStep2 ? businessMetrics.clusters : 0, hotspotCount: isMovementStep2 ? h2hMetrics.zones : 0, tplStops: isMovementStep2 ? h2hMetrics.tplStops : 0, stations: isMovementStep2 ? h2hMetrics.stations : 0, metro: isMovementStep2 ? h2hMetrics.metro : 0, universities: isMovementStep2 ? h2hMetrics.universities : 0, localAttractors: isMovementStep2 ? h2hMetrics.localAttractors : 0, gpsWaypoints: operationalWaypoints.length, transitStops: isMovementStep2 ? h2hMetrics.transitTotal : 0, flowScore: isMovementStep2 ? h2hMetrics.flowScore : 0, businesses: isBusinessStep2 ? businessMetrics.businesses : 0, competitors: isBusinessStep2 ? businessMetrics.competitors : 0, commercialDensity: isBusinessStep2 ? businessMetrics.commercialDensity : 0, clusters: isBusinessStep2 ? businessMetrics.clusters : 0, targetBusinesses: isBusinessStep2 ? businessMetrics.targetBusinesses : 0, cdIdx: isBusinessStep2 ? businessMetrics.cdIdx : 0, familyIndex: null, reachScore: null, roiScore: null, confidenceScore: null };
const radiusInsightRows = zonesInRadius.map(z => ({
      id: z.id,
      name: z.name,
      selected: selected.includes(z.id),
      pct: z.pct,
      score: isResidentialStep2 ? residentialStrength(z) : isMovementStep2 ? h2hHotspotStrength(z) : isBusinessStep2 ? businessZoneScore(z) : z.pct,
      detail: isResidentialStep2
        ? `${z.families.toLocaleString("it-IT", { useGrouping: true })} famiglie`
        : isMovementStep2
          ? `${z.poi} POI – ${z.transitStops} fermate`
          : isBusinessStep2
            ? `${z.targetBiz} target – ${z.competitors} competitor`
            : `${zCap(z).toLocaleString("it-IT", { useGrouping: true })} volantini`
    }));

  const addBestUnselectedZone = () => {
    const next = radiusInsightRows.find(z => !selected.includes(z.id));
    if (next) setSelected(prev => [...new Set([...prev, next.id])]);
  };

  const zoneSortValue = (zone, sortId) => {
    if (sortId === "coverage") return Number(zone.coverage ?? zone.pct ?? zone.percent_nel_raggio ?? 0);
    if (sortId === "families") return Number(zone.families ?? zone.famiglie ?? 0);
    return Number(zone.families ?? zone.famiglie ?? zCap(zone) ?? 0);
  };
  const sortedResidentialZones = useMemo(
    () => [...allZones].sort((a, b) => {
      const diff = zoneSortValue(b, zoneListSort) - zoneSortValue(a, zoneListSort);
      return diff || String(a.name || "").localeCompare(String(b.name || ""), "it");
    }),
    [allZones, zoneListSort, svcType]
  );
  const shouldGroupMarginalZones = isResidentialStep2 && searchMode !== "cap" && sortedResidentialZones.length > GRANDE_CITTA_ZONE_THRESHOLD;
  const relevantResidentialZones = useMemo(() => {
    if (!shouldGroupMarginalZones) return sortedResidentialZones;
    const relevant = sortedResidentialZones.filter(z => isZonaRilevante(z));
    return relevant.length || !sortedResidentialZones.length ? relevant : [sortedResidentialZones[0]];
  }, [shouldGroupMarginalZones, sortedResidentialZones]);
  const relevantResidentialZoneIds = useMemo(() => new Set(relevantResidentialZones.map(z => z.id)), [relevantResidentialZones]);
  const marginalResidentialZones = useMemo(
    () => shouldGroupMarginalZones ? sortedResidentialZones.filter(z => !relevantResidentialZoneIds.has(z.id)) : [],
    [shouldGroupMarginalZones, sortedResidentialZones, relevantResidentialZoneIds]
  );
  const marginalZoneFamilies = marginalResidentialZones.reduce((sum, z) => sum + Number(z.families ?? z.famiglie ?? 0), 0);
  const marginalZoneCoverage = Math.min(100, Math.round(marginalResidentialZones.reduce((sum, z) => sum + Number(z.coverage ?? z.pct ?? z.percent_nel_raggio ?? 0), 0)));
  const zoneRowsForList = useMemo(() => {
    if (isMovementStep2) return h2hMetrics.clusters.map(z => ({ type: "zone", zone: z }));
    if (isBusinessStep2 && businessMetrics.clusterRows.length) return businessMetrics.clusterRows.map(z => ({ type: "zone", zone: z }));
    const rows = relevantResidentialZones.map(z => ({ type: "zone", zone: z }));
    if (marginalResidentialZones.length) {
      rows.push({ type: "marginal-summary" });
      if (showMarginalZones) rows.push(...marginalResidentialZones.map(z => ({ type: "zone", zone: z, marginal: true })));
    }
    return rows;
  }, [isMovementStep2, isBusinessStep2, h2hMetrics.clusters, businessMetrics.clusterRows, relevantResidentialZones, marginalResidentialZones, showMarginalZones]);
  const zoneListSourceCount = isMovementStep2 ? h2hMetrics.clusters.length : isBusinessStep2 && businessMetrics.clusterRows.length ? businessMetrics.clusterRows.length : sortedResidentialZones.length;
  const primaryCoveredZones = zonesAllocation
    .filter(z => Number(z.assignedFlyers || 0) > 0)
    .sort((a, b) => Number(b.assignedFlyers || 0) - Number(a.assignedFlyers || 0))
    .slice(0, 3)
    .map(z => z.name)
    .filter(Boolean);

  const aiAgg = selZones.length > 0 ? {
    pop: selZones.reduce((a, z) => a + (z.pop || 0), 0),
    families: selZones.reduce((a, z) => a + (z.families || 0), 0),
    bizTotal: selZones.reduce((a, z) => a + (z.bizTotal || 0), 0),
    commDensB2B: Math.round(selZones.reduce((a, z) => a + (z.commDensB2B || 0), 0) / selZones.length),
    areaType: selZones.length === 1 ? (selZones[0].areaType || "-") : "Mista (" + selZones.length + " zone)",
    poi: selZones.reduce((a, z) => a + (z.poi || 0), 0),
    reddito: Math.round(selZones.reduce((a, z) => a + (z.reddito || 0), 0) / selZones.length),
    densita: Math.round(selZones.reduce((a, z) => a + (z.densita || 0), 0) / selZones.length),
    occup: Math.round(selZones.reduce((a, z) => a + (z.occup || 0), 0) / selZones.length),
    stranieri: Math.round(selZones.reduce((a, z) => a + (z.stranieri || 0), 0) / selZones.length * 10) / 10,
    imprese: selZones.reduce((a, z) => a + (z.imprese || 0), 0),
    indVec: Math.round(selZones.reduce((a, z) => a + (z.indVec || 0), 0) / selZones.length),
    eta14: (() => { const v = selZones.map(z => z.eta14).filter(n => n != null); return v.length ? Math.round(v.reduce((a,n) => a+n, 0)/v.length*10)/10 : null; })(),
    eta34: (() => { const v = selZones.map(z => z.eta34).filter(n => n != null); return v.length ? Math.round(v.reduce((a,n) => a+n, 0)/v.length*10)/10 : null; })(),
    eta64: (() => { const v = selZones.map(z => z.eta64).filter(n => n != null); return v.length ? Math.round(v.reduce((a,n) => a+n, 0)/v.length*10)/10 : null; })(),
    eta65: (() => { const v = selZones.map(z => z.eta65).filter(n => n != null); return v.length ? Math.round(v.reduce((a,n) => a+n, 0)/v.length*10)/10 : null; })(),
    genderM: Math.round(selZones.reduce((a, z) => a + (z.genderM || 49), 0) / selZones.length),
    genderF: Math.round(selZones.reduce((a, z) => a + (z.genderF || 51), 0) / selZones.length),
    hotspots: selZones.map(z => z.hotspots).filter(Boolean).join(" – ") || null,
    timeSlots: selZones[0]?.timeSlots || "-",
    strongPts: selZones.reduce((a, z) => a + (z.strongPts || 0), 0),
    flowScore: Math.round(selZones.reduce((a, z) => a + (z.flowScore || 0), 0) / selZones.length),
    commDens: Math.round(selZones.reduce((a, z) => a + (z.commDens || 0), 0) / selZones.length),
    familyIdx: Math.round(selZones.reduce((a, z) => a + (z.familyIdx || 0), 0) / selZones.length),
    reachD2D: Math.round(selZones.reduce((a, z) => a + (z.reachD2D || 0), 0) / selZones.length),
    roiD2D: Math.round(selZones.reduce((a, z) => a + (z.roiD2D || 0), 0) / selZones.length),
    confD2D: Math.round(selZones.reduce((a, z) => a + (z.confD2D || 0), 0) / selZones.length),
    transitStops: selZones.reduce((a, z) => a + (z.transitStops || 0), 0),
    trainStations: selZones.reduce((a, z) => a + (z.trainStations || 0), 0),
    nearbyBiz: selZones.reduce((a, z) => a + (z.nearbyBiz || 0), 0),
    reachH2H: Math.round(selZones.reduce((a, z) => a + (z.reachH2H || 0), 0) / selZones.length),
    roiH2H: Math.round(selZones.reduce((a, z) => a + (z.roiH2H || 0), 0) / selZones.length),
    confH2H: Math.round(selZones.reduce((a, z) => a + (z.confH2H || 0), 0) / selZones.length),
    topCats: selZones[0]?.topCats || "-",
    clusters: selZones.reduce((a, z) => a + (z.clusters || 0), 0),
    targetBiz: selZones.reduce((a, z) => a + (z.targetBiz || 0), 0),
    strongZone: selZones.map(z => z.strongZone).filter(Boolean).join(" – ") || null,
    cdIdx: Math.round(selZones.reduce((a, z) => a + (z.cdIdx || 0), 0) / selZones.length),
    reachB2B: Math.round(selZones.reduce((a, z) => a + (z.reachB2B || 0), 0) / selZones.length),
    roiB2B: Math.round(selZones.reduce((a, z) => a + (z.roiB2B || 0), 0) / selZones.length),
    confB2B: Math.round(selZones.reduce((a, z) => a + (z.confB2B || 0), 0) / selZones.length),
  } : null;
  // Pill button style helper
  const pill = (active, c) => ({
    padding: "6px 14px", borderRadius: 100, cursor: "pointer", fontFamily: F.sans, fontSize: 12,
    fontWeight: active ? 700 : 400, border: `1px solid ${active ? c : "rgba(255,255,255,.1)"}`,
    background: active ? `${c}18` : "rgba(255,255,255,.04)",
    color: active ? c : "rgba(255,255,255,.48)", transition: "all.15s", whiteSpace: "nowrap",
  });
  const MAP_H_PX = 420;

  const _totalFamiliesInRadius = zonesInRadius.reduce((a, z) => a + (z.families || 0), 0);
  const zonesWithCoords = zonesInRadius.map((z, i) => {
    const coords = getZoneCoords(z, city, i, zonesInRadius.length);
    if (!coords) return null;
    const weightPct = _totalFamiliesInRadius > 0 ? Math.round((z.families || 0) / _totalFamiliesInRadius * 100) : 0;
    return {
      id: z.id, name: z.name, lat: coords.lat, lng: coords.lng,
      territoryLevel: z.territoryLevel,
      isNil: z.isNil,
      families: z.families || 0, coverage: z.coverage || 0, area: z.area || 1,
      color: getComuneColor(z.id), geometry: pickRealComuneGeometry(z),
      weightPct, pop: z.pop || 0, volantiniNelRaggio: z.volantiniNelRaggio || z.volantini_nel_raggio || z.flyersMin || 0, flyersMin: z.flyersMin || 0, flyersMax: z.flyersMax || 0,
    };
  }).filter(Boolean);

  const targetTotal = serviceKpis ? (isResidentialStep2 ? serviceKpis.families : isMovementStep2 ? serviceKpis.poi : serviceKpis.businesses) : 0;
  const mainTargetLabel = isResidentialStep2 ? "Famiglie stim." : isMovementStep2 ? "POI rilevanti" : "Attività tot.";
  const hasAtLeastOne = totalAssigned > 0 || selZones.length > 0;
  const flyerSurplus = remainingFlyers;
  const missingFlyers = isResidentialStep2 && doorCoverage
    ? doorCoverage.missingFlyers
    : Math.max(0, requiredFlyers - flyerQuantityFromStep1);
  if (import.meta.env.DEV && isResidentialStep2 && doorCoverage) {
    const _legacyMissing = Math.max(0, requiredFlyers - flyerQuantityFromStep1);
    if (_legacyMissing !== doorCoverage.missingFlyers) {
      console.warn("[Phase5] missingFlyers divergence", { canonical: doorCoverage.missingFlyers, legacy: _legacyMissing });
    }
  }
  const firstZ = selZones[0] || null;
  const cfg = serviceMeta;
  const d2dKpiZone = selZones.length > 0 ? {...selZones[0],
    families: selZones.reduce((a, z) => a + (z.families || 0), 0),
    pop: selZones.reduce((a, z) => a + (z.pop || 0), 0),
    area: parseFloat(serviceKpis.area || 0),
    coverage: serviceKpis.coverage,
    flyersMin: serviceKpis.recommendedFlyers,
    flyersMax: selZones.reduce((a, z) => a + (z.flyersMax || 0), 0),
    operDays: selZones.reduce((a, z) => a + (z.operDays || 0), 0),
  } : null;
  const safeMainKpis = (meta, zone) => {
    try {
      return zone && meta?.mainKpis ? meta.mainKpis(zone) : [];
    } catch {
      return [];
    }
  };
  const residentialMainOutputs = d2dKpiZone ? safeMainKpis(SERVICE_META.d2d, d2dKpiZone).map(k =>
    k.l === "Comuni nel raggio" ? { ...k, v: String(zonesInRadius.length) } : k
  ) : [];
  const h2hMainOutputs = isMovementStep2 && firstZ ? safeMainKpis(SERVICE_META.h2h, firstZ) : [];
  const businessMainOutputs = isBusinessStep2 && firstZ ? safeMainKpis(SERVICE_META.b2b, firstZ) : [];
  const serviceOutputRows = firstZ ? safeMainKpis(serviceMeta, firstZ) : [];
  const residentialMainOutputsNormalized = residentialMainOutputs.map(k =>
    k.l === "Comuni nel raggio" ? { ...k, l: `${territoryPluralLabel} nel raggio`, v: String(zonesInRadius.length) } : k
  );
  const residentialScores = aiAgg ? SERVICE_META.d2d.advKpis(aiAgg) : [];
  const h2hScores = aiAgg ? SERVICE_META.h2h.advKpis(aiAgg) : [];
  const businessScores = aiAgg ? SERVICE_META.b2b.advKpis(aiAgg) : [];
  const baseScoreRows = isResidentialStep2
    ? residentialScores
    : isMovementStep2
      ? [
        { l: "Hotspot Score", v: aiAgg?.reachH2H, c: C.orange },
        { l: "Reach Score", v: aiAgg?.reachH2H, c: C.blue },
        { l: "ROI Score", v: aiAgg?.roiH2H, c: C.green },
        { l: "Confidence", v: aiAgg?.confH2H, c: C.purple },
      ]
      : isBusinessStep2
        ? [
          { l: "Cluster Score", v: aiAgg?.cdIdx, c: C.orange },
          { l: "Reach Score", v: aiAgg?.reachB2B, c: C.blue },
          { l: "ROI Score", v: aiAgg?.roiB2B, c: C.green },
          { l: "Confidence", v: aiAgg?.confB2B, c: C.purple },
        ]
        : [];
  const advancedScoreRows = [
    ...baseScoreRows,
    ...(isResidentialStep2 ? [
      { l: "Densità media", v: serviceKpis.area && serviceKpis.population ? Math.round(serviceKpis.population / Number(serviceKpis.area)) : null, c: C.blue },
      { l: "Indice vecchiaia", v: aiAgg?.indVec, c: C.yellow },
      { l: "Occupazione", v: aiAgg?.occup, c: C.green },
      { l: "Stranieri", v: aiAgg?.stranieri, c: C.teal },
    ] : []),
    ...(isMovementStep2 ? [
      { l: "Foot Traffic", v: serviceKpis.flowScore, c: C.blue },
      { l: "Hotspot Strength", v: serviceKpis.hotspotStrength, c: C.green },
      { l: "Transit Index", v: serviceKpis.transitStops, c: C.purple },
      { l: "Attrattori locali", v: serviceKpis.nearbyBiz, c: C.orange },
    ] : []),
    ...(isBusinessStep2 ? [
      { l: "Competition Index", v: serviceKpis.competitors, c: C.red },
      { l: "Commercial Density", v: serviceKpis.cdIdx, c: C.purple },
      { l: "Cluster Strength", v: serviceKpis.clusters, c: C.blue },
      { l: "Target Businesses", v: serviceKpis.targetBusinesses, c: C.green },
    ] : []),
  ];
  const residentialRadiusRows = residentialRows(zonesInRadius);
  const businessCategorySummary = isBusinessStep2 && targetBusinessMeta ? (businessMetrics.categories.length ? businessMetrics.categories : bizCategoryChart(selZones, targetBusinessMeta)) : [];
  const businessClusterSummary = isBusinessStep2 && targetBusinessMeta ? (businessMetrics.clusterRows.length ? businessMetrics.clusterRows : businessRows(selZones, targetBusinessMeta)) : [];

  const h2hAttractionSummary = isMovementStep2 ? [
      {label: "POI rilevanti", value: h2hMetrics.poi, color: "#3B82F6"},
      {label: "Fermate TPL", value: h2hMetrics.tplStops, color: "#10B981"},
      {label: "Metro", value: h2hMetrics.metro, color: "#8B5CF6"},
      {label: "Attrattori locali", value: h2hMetrics.localAttractors, color: "#F59E0B"}
    ] : [];
  const h2hHotspotSummary = isMovementStep2 ? h2hMetrics.clusters.slice(0, 6) : [];
  const campaignZones = data.campaignZones || [];
  const totalCampaignFlyers = campaignZones.reduce((sum, z) => sum + Number(z.assigned_flyers || 0), 0);
  const totalCampaignBudget = campaignZones.reduce((sum, z) => sum + Number(z.assigned_budget || 0), 0);
  const uniqueCampaignComuni = new Set(campaignZones.reduce((acc, z) => { if (z.selected) acc.push(...z.selected); return acc; }, [])).size;
  const activeCampaignZone = useMemo(
    () => campaignZones.find(z => z.id === data.activeZoneId) || campaignZones[0] || null,
    [campaignZones, data.activeZoneId]
  );
  const zoneDensity = serviceKpis.area && serviceKpis.population ? Math.round(serviceKpis.population / Number(serviceKpis.area)) : 0;
  const zoneVerdict = getZoneVerdict({ families: serviceKpis.families, density: zoneDensity, coverage: serviceKpis.coverage || 0, comuniCount: zonesInRadius.length });
  const zoneHumanTitle = city?.label || city?.name || activeCampaignZone?.cityName || search || "Zona selezionata";
  const resolveCampaignZoneCity = useCallback((zone) => zone?.city || GEO_DATA.find(g => {
    const name = String(zone?.cityName || zone?.zone_label || "").trim().toLowerCase();
    return name && (g.name.toLowerCase() === name || name.includes(g.name.toLowerCase()) || g.name.toLowerCase().includes(name));
  }) || null, []);
  const getCampaignZoneLabel = useCallback((zone, index) => {
    const cityLabel = zone?.cityName || zone?.city?.name || zone?.city?.label || "";
    if (cityLabel) return `Zona ${index + 1} · ${cityLabel}`;
    return zone?.zone_label || `Zona ${index + 1}`;
  }, []);
  const selectCampaignZone = useCallback((zoneId) => {
    const zone = campaignZones.find(z => z.id === zoneId);
    if (!zone) return;
    const resolvedCity = resolveCampaignZoneCity(zone);
    const zSvc = zone.service_type || svcType;
    setData(prev => ({
      ...prev,
      activeZoneId: zone.id,
      selectedService: zSvc,
      activeService: zSvc,
      type: zSvc,
      flyerFormat: zone.service_variant || prev.flyerFormat || "a5",
      qty: zone.assigned_flyers || prev.qty || 10000,
      flyerQuantity: zone.assigned_flyers || prev.qty || 10000,
      flyerQuantityFromStep1: zone.assigned_flyers || prev.qty || 10000,
      cityName: zone.cityName || resolvedCity?.name || "",
      city: resolvedCity,
      radius: zone.radiusKm || zone.radius || 3,
      radiusKm: zone.radiusKm || zone.radius || 3,
      selectedRadius: zone.radiusKm || zone.radius || 3,
      zones: zone.selected || [],
      selectedCaps: zone.selectedCaps || [],
      capDataMap: zone.capDataMap || {},
      manualAssignments: zone.manualAssignments || {},
      allocationMode: zone.allocationMode || "auto",
      searchMode: zone.searchMode || "municipality",
    }));
  }, [campaignZones, resolveCampaignZoneCity, setData, svcType]);
  const gisSkeleton = (width = 54) => (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width,
        height: 11,
        borderRadius: 999,
        background: "linear-gradient(90deg, rgba(255,255,255,.08), rgba(255,255,255,.18), rgba(255,255,255,.08))",
        boxShadow: "0 0 18px rgba(255,255,255,.04)",
      }}
    />
  );
  const gisKpi = (value, width) => gisLoading ? gisSkeleton(width) : value;
  const step2ZonesReady = (data.campaignZones || []).length > 0 && (data.campaignZones || []).every(z =>
    (z.searchMode === "cap" ? (z.selectedCaps && z.selectedCaps.length > 0) : (z.city !== null)) &&
    (z.assigned_flyers || 0) > 0
  );
  const canContinueCalendar = step2ZonesReady && !gisLoading && !gisTimedOut;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "34px clamp(16px, 4vw, 32px) 160px", background: C.navyMid, minHeight: "100vh", overflow: "visible" }}>

      {/* Section */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        {/* Titolo */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: F.serif, fontSize: 22, color: C.white, letterSpacing: "-.5px" }}>Zona & Mappa</div>
        </div>

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,.1)", flexShrink: 0 }} />

        {/* SERVICE PILLS - cambiano il servizio */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[{ id: "d2d", icon: " ", l: "Door to Door", c: C.orange }, { id: "h2h", icon: "", l: "Hand to Hand", c: C.blue }, { id: "b2b", icon: "", l: "Business", c: C.green }].map(({ id, icon, l, c }) => (
            <button key={id} onClick={() => setData(d => ({...d, type: id, selectedService: id, activeService: id }))} style={pill(svcType === id, c)}>
              {icon} {l}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,.1)", flexShrink: 0 }} />

        {/* VIEW PILLS - cambiano la vista */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[{ id: "distribuzione", icon: "", l: "Distribuzione" }, { id: "tematica", icon: "", l: "Heatmap" }, { id: "admininfo", icon: " ", l: "Demografia" }].map(({ id, icon, l }) => (
            <button key={id} onClick={() => setViewMode(id)} style={pill(viewMode === id, col)}>
              {icon} {l}
            </button>
          ))}
        </div>

      </div>

      {/* INFO BANNER */}
      <div style={{ marginBottom: 12, padding: "9px 14px", borderRadius: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}></span>
        <div style={{ flex: 1 }}>
          <span style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)" }}>
            Stai configurando la zona. Tutti i dati dettagliati (KPI, ISTAT, profilo demografico, output servizi) saranno visibili nel
          </span>
          <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: col }}> Riepilogo completo nel preventivo finale</span>
          <span style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)" }}>.</span>
        </div>
      </div>

      {/* Section */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "0 0 340px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 0, padding: 0, borderRadius: 10, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", overflow: "hidden" }}>
            <div style={{ display: "flex", background: "rgba(255,255,255,.03)", borderRight: "1px solid rgba(255,255,255,.12)" }}>
              <button onClick={() => { setSearchMode("municipality"); setSearch(""); }} style={{ padding: "9px 10px", background: searchMode === "municipality" ? col : "transparent", border: "none", color: C.white, fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all.2s" }}>Comune</button>
              <button onClick={() => { setSearchMode("cap"); setSearch(""); }} style={{ padding: "9px 10px", background: searchMode === "cap" ? col : "transparent", border: "none", color: C.white, fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all.2s" }}>CAP</button>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
              <span style={{ fontSize: 13 }}>{searchMode === "cap" ? "" : ""} </span>
              <input value={search} onChange={e => { setSearch(e.target.value); setDropOpen(true); }} onFocus={() => setDropOpen(true)}
                placeholder={searchMode === "cap" ? "Inserisci CAP (es. 20121)..." : "Cerca comune o indirizzo..."}
                style={{ flex: 1, background: "transparent", border: "none", color: C.white, fontFamily: F.sans, fontSize: 13, height: 38 }} />
              {search && <button onClick={() => { setSearch(""); setDropOpen(false); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", cursor: "pointer", fontSize: 16 }}>-</button>}
            </div>
          </div>
          {dropOpen && search.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#1a2a40", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, zIndex: 80, overflow: "hidden", boxShadow: "0 14px 36px rgba(0,0,0,.55)" }}>
              {searchMode === "municipality" ? (
                geocodeSuggestions.length === 0 && search.length >= 2 ? <div style={{ padding: "9px 14px", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.35)" }}>Nessun risultato...</div> :
                geocodeSuggestions.map(c => (
                  <div key={c.id} onClick={() => { setCity(c); setSearch(c.label || c.name); setDropOpen(false); setSelected([]); }}
                    style={{ padding: "9px 14px", cursor: "pointer", fontFamily: F.sans, fontSize: 13, color: C.white, borderBottom: "1px solid rgba(255,255,255,.05)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(232,87,26,.12)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                     {c.label || c.name}
                  </div>
                ))
              ) : (
                capSearchLoading ? <div style={{ padding: "9px 14px", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.35)" }}>Ricerca CAP in corso––</div> :
                capSuggestions.length === 0 && search.length >= 2 ? <div style={{ padding: "9px 14px", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.35)" }}>Nessun CAP trovato</div> :
                capSuggestions.map(c => (
                  <div key={c.id} onClick={() => handleCapSelect(c)}
                    style={{ padding: "9px 14px", cursor: "pointer", fontFamily: F.sans, fontSize: 13, color: C.white, borderBottom: "1px solid rgba(255,255,255,.05)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(232,87,26,.12)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                     {c.name}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Radius pills - hidden in CAP mode */}
        {searchMode !== "cap" && (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginRight: 4, whiteSpace: "nowrap" }}>Raggio:</span>
            {S2_RADII.map(r => (
              <button key={r} onClick={() => updateActiveRadius(r)}
                style={{
                  padding: "7px 10px", borderRadius: 7, border: `1px solid ${radiusKm === r ? C.orange : "rgba(255,255,255,.1)"}`,
                  background: radiusKm === r ? "rgba(232,87,26,.18)" : "rgba(255,255,255,.04)",
                  color: radiusKm === r ? C.orange : "rgba(255,255,255,.5)",
                  fontFamily: F.sans, fontSize: 11, fontWeight: radiusKm === r ? 700 : 400, cursor: "pointer", transition: "all.15s"
                }}>
                {r < 1 ? `${r * 1000}m` : `${r}km`}
              </button>
            ))}
            <span style={{ fontFamily: F.serif, fontSize: 18, color: C.orange, marginLeft: 6 }}>{radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km`}</span>
          </div>
        )}
        {searchMode === "cap" && selectedCaps.length > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", whiteSpace: "nowrap" }}>CAP selezionati:</span>
            {selectedCaps.map(cap => (
              <span key={cap} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 100, background: `${col}18`, border: `1px solid ${col}35`, fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: col }}>
                 {cap}
                <button onClick={() => { setSelectedCaps(prev => prev.filter(c => c !== cap)); setCapDataMap(prev => { const n={...prev}; delete n[cap]; return n; }); }}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0, marginLeft: 2 }}>-</button>
              </span>
            ))}
          </div>
        )}

        {/* Layer pills - solo in tematica */}
        {(viewMode === "tematica" || viewMode === "distribuzione") && layers.length > 0 && (
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginRight: 2, whiteSpace: "nowrap" }}>Layer:</span>
            {layers.map(lay => {
              const active = activeLay?.id === lay.id;
              return (
                <button key={lay.id} onClick={() => setThLayerId(lay.id)}
                  style={{
                    padding: "5px 10px", borderRadius: 6, border: `1px solid ${active ? col : "rgba(255,255,255,.1)"}`,
                    background: active ? `${col}18` : "rgba(255,255,255,.04)",
                    color: active ? col : "rgba(255,255,255,.45)",
                    fontFamily: F.sans, fontSize: 11, fontWeight: active ? 700 : 400, cursor: "pointer", transition: "all.14s", whiteSpace: "nowrap"
                  }}>
                  {lay.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Section */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "-4px 0 12px", overflowX: "auto", paddingBottom: 2 }}>
        {campaignZones.map((z, idx) => {
          const isActive = z.id === data.activeZoneId;
          const zoneSvcColor = SERVICE_META[z.service_type || "d2d"]?.color || C.orange;
          const configured = z.searchMode === "cap" ? (z.selectedCaps || []).length > 0 : !!z.city;
          return (
            <button key={z.id} onClick={() => selectCampaignZone(z.id)}
              style={{
                minHeight: 32,
                padding: "0 10px",
                borderRadius: 8,
                border: `1px solid ${isActive ? zoneSvcColor : "rgba(255,255,255,.09)"}`,
                background: isActive ? `${zoneSvcColor}18` : "rgba(255,255,255,.035)",
                color: isActive ? C.white : "rgba(255,255,255,.58)",
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                flexShrink: 0
              }}>
              <span>{getCampaignZoneLabel(z, idx)}</span>
              <span style={{ fontSize: 9, color: configured ? C.green : C.yellow }}>{configured ? "OK" : "Da configurare"}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => setDropOpen(true)}
          style={{ minHeight: 32, padding: "0 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.72)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
          Modifica zona
        </button>
        <button type="button" onClick={resetActiveZone}
          style={{ minHeight: 32, padding: "0 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.58)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
          Reset zona
        </button>
        <button onClick={handleAddZone}
          style={{ minHeight: 32, padding: "0 10px", borderRadius: 8, border: `1px dashed ${col}`, background: `${col}0f`, color: col, fontFamily: F.sans, fontSize: 11, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
          + Aggiungi un'altra zona / comune
        </button>
      </div>

      {/* Section */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 280px", gap: 14 }}>

        {/* Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* MAPPA GRANDE */}
          <div style={{
            borderRadius: 14, overflow: "hidden", position: "relative",
            background: "linear-gradient(135deg,#081610 0%,#080f1e 60%,#100819 100%)",
            border: "1px solid rgba(255,255,255,.08)"
          }}>
            <Step2Map
              city={city}
              radius={radiusKm}
              svcType={svcType}
              serviceColor={col}
              zonesWithCoords={zonesWithCoords}
              selected={selected}
              onToggleZone={toggleZone}
              apiData={apiData}
              targetColor={targetBusinessMeta?.color || '#a78bfa'}
              activeLayers={activeMapLayers}
              settori={sectors}
              pois={pois}
              civiciState={civiciState}
              onLayerToggle={(id) => {
                if (id === "civici" && !civiciAvailable) return;
                if (id === "settori" && !sectors) return;
                setActiveMapLayers(prev => ({ ...prev, [id]: !prev[id] }));
              }}
              layerPanelConfig={LAYER_PANEL_CONFIG[svcType] || LAYER_PANEL_CONFIG.d2d}
              campaignZones={data.campaignZones}
              activeZoneId={data.activeZoneId}
              onSelectZone={selectCampaignZone}
            />
            {(gisLoading || gisTimedOut) && (
              <div style={{
                position: "absolute",
                inset: 0,
                zIndex: 760,
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: gisTimedOut ? "rgba(8,15,30,.18)" : "rgba(8,15,30,.08)"
              }}>
                <div style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(8,15,30,.88)",
                  border: `1px solid ${gisTimedOut ? "rgba(239,68,68,.26)" : "rgba(255,255,255,.12)"}`,
                  color: gisTimedOut ? "#FCA5A5" : C.white,
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  boxShadow: "0 10px 28px rgba(0,0,0,.34)",
                  backdropFilter: "blur(10px)"
                }}>
                  {gisTimedOut ? "Dati non disponibili, riprova o cambia raggio." : "Analisi GIS in corso..."}
                </div>
              </div>
            )}

            {/* Map overlays */}
            <div style={{ position: "absolute", bottom: 10, left: 10, display: "flex", gap: 6 }}>
              <div style={{ background: "rgba(8,15,30,.9)", backdropFilter: "blur(8px)", borderRadius: 6, padding: "4px 9px", fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.07)" }}>
                CartoDB – OSM
              </div>
              {activeLay && viewMode !== "distribuzione" && (
                <div style={{ background: "rgba(8,15,30,.88)", borderRadius: 6, padding: "4px 9px", fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.55)", border: "1px solid rgba(255,255,255,.06)" }}>
                  Layer: <b style={{ color: col }}>{activeLay.label}</b>
                </div>
              )}
            </div>
            {city && selZones.length > 0 && (
              <div style={{ position: "absolute", top: 58, right: 10, pointerEvents: "none", background: "rgba(8,15,30,.82)", border: `1px solid ${col}55`, borderRadius: 6, padding: "4px 10px", fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: C.white }}>
                {selZones.length} {selZones.length === 1 ? "zona" : "zone"} selezionate
              </div>
            )}
            {isResidentialStep2 && city && (
              <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(8,15,30,.88)", borderRadius: 8, padding: "8px 10px", border: "1px solid rgba(255,255,255,.08)", maxWidth: 230 }}>
                <div style={{ fontFamily: F.sans, fontSize: 8, fontWeight: 800, color: C.orange, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>{isNilAnalysis ? "NIL Milano" : "Residential territory"}</div>
                {residentialRadiusRows.slice(0, 4).map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: getComuneColor(r.id), display: "inline-block" }} />
                    <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.58)", flex: 1 }}>{r.name}</span>
                    <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: C.white }}>{r.strength}/100</span>
                  </div>
                ))}
              </div>
            )}
            {isBusinessStep2 && city && (
              <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(8,15,30,.88)", borderRadius: 8, padding: "8px 10px", border: "1px solid rgba(255,255,255,.08)", maxWidth: 220 }}>
                <div style={{ fontFamily: F.sans, fontSize: 8, fontWeight: 800, color: targetBusinessMeta.color, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>Commercial intelligence</div>
                {[
                  { c: targetBusinessMeta.color, l: "attività target / categoria" },
                  { c: C.red, l: "competitor rilevati" },
                  { c: C.purple, l: "pocket commerciali forti" },
                ].map(({ c, l }) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />
                    <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.58)" }}>{l}</span>
                  </div>
                ))}
              </div>
            )}
            {isMovementStep2 && city && (
              <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(8,15,30,.88)", borderRadius: 8, padding: "8px 10px", border: "1px solid rgba(255,255,255,.08)", maxWidth: 230 }}>
                <div style={{ fontFamily: F.sans, fontSize: 8, fontWeight: 800, color: C.blue, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>Movement intelligence</div>
                {[
                  { c: H2H_HOTSPOT_META.transit.color, l: "transit / stazioni" },
                  { c: H2H_HOTSPOT_META.school.color, l: "scuole, eventi, anchor" },
                  { c: H2H_HOTSPOT_META.retail.color, l: "POI e strade attive" },
                  { c: C.blue, l: "flusso e pass-through" },
                ].map(({ c, l }) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />
                    <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.58)" }}>{l}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Legend tematica overlay */}
            {viewMode === "tematica" && activeLay && zonesInRadius.length > 0 && (
              <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(8,15,30,.9)", backdropFilter: "blur(8px)", borderRadius: 8, padding: "8px 12px", border: "1px solid rgba(255,255,255,.08)" }}>
                <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>{activeLay.label}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.4)", marginBottom: 3 }}>
                  <span>{activeLay.fmt(Math.round(thMin))}</span><span>{activeLay.fmt(Math.round(thMax))}</span>
                </div>
                <div style={{ width: 120, height: 6, borderRadius: 3, background: `linear-gradient(to right,${activeLay.lo},${activeLay.hi})` }} />
                <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", marginTop: 3 }}>{truthfulSourceLabel(activeLay.src)}</div>
              </div>
            )}
          </div>

          {/* CAP MODE: CAP selezionati */}
          {searchMode === "cap" && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: `1px solid ${col}28`, overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }}></span>
                    <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.white }}>CAP selezionati</div>
                    <span style={{ padding: "2px 7px", borderRadius: 100, background: `${col}18`, fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: col }}>Modalità CAP</span>
                  </div>
                  <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: 3 }}>
                    Solo i CAP selezionati - nessun comune aggiunto automaticamente
                  </div>
                </div>
                <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)" }}>
                  Budget: <b style={{ color: col }}>{flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true })}</b> vol.
                </div>
              </div>
              {selectedCaps.length === 0 ? (
                <div style={{ padding: "28px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}></div>
                  <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.45)", marginBottom: 6 }}>Nessun CAP selezionato</div>
                  <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.28)" }}>Digita un codice postale nella barra di ricerca qui sopra</div>
                </div>
              ) : (
                <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {selectedCaps.map(cap => {
                    const zone = capDataMap[cap];
                    const required = zone ? zCap(zone) : 0;
                    const assigned = Math.min(required, flyerQuantityFromStep1);
                    return (
                      <div key={cap} style={{ borderRadius: 10, border: `1px solid ${col}35`, background: `${col}08`, padding: "10px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 16 }}></span>
                              <span style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: C.white }}>CAP {cap}</span>
                              <span style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(251,191,36,.12)", border: "1px solid rgba(251,191,36,.25)", fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: C.yellow }}>Stima</span>
                            </div>
                            {zone && (
                              <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.45)", paddingLeft: 24 }}>
                                {zone.municipalityName} – ~{zone.families?.toLocaleString("it-IT", { useGrouping: true })} famiglie – {zone.area} km²
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 700, color: C.white }}>{assigned.toLocaleString("it-IT", { useGrouping: true })} pz.</div>
                            <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.3)" }}>consigliati {required.toLocaleString("it-IT", { useGrouping: true })}</div>
                          </div>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 24 }}>
                          <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.35)" }}>Modalit : Solo CAP – Nessun comune aggiunto</span>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                          <button onClick={() => { setSelectedCaps(prev => prev.filter(c => c !== cap)); setCapDataMap(prev => { const n={...prev}; delete n[cap]; return n; }); }}
                            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(248,113,113,.3)", background: "rgba(232,87,26,.08)", color: C.red, fontFamily: F.sans, fontSize: 10, cursor: "pointer" }}>
                            Rimuovi CAP
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedCaps.length > 0 && (
                <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,.05)", background: "rgba(46,204,138,.04)" }}>
                  <div style={{ fontFamily: F.sans, fontSize: 10, color: C.green, fontWeight: 700, marginBottom: 4 }}> Campagna limitata ai CAP selezionati</div>
                  <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)" }}>I dati mostrati sono stime. Per aggiungere aree vicine usa i pulsanti qui sotto.</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button disabled style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.3)", fontFamily: F.sans, fontSize: 10, cursor: "not-allowed" }}>+ Aggiungi CAP vicino</button>
                    <button disabled style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.3)", fontFamily: F.sans, fontSize: 10, cursor: "not-allowed" }}>+ Aggiungi comune vicino</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* COMUNE MODE: Zone di distribuzione */}
          {searchMode !== "cap" && city && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 2 }}>{isNilAnalysis ? `Zone NIL nel raggio: ${zoneListSourceCount}` : `Zone di distribuzione: ${zoneListSourceCount}`}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)" }}>
                    Budget disponibile: <b style={{ color: col }}>{flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true })}</b> volantini
                  </div>
                </div>
                <div style={{ display: "flex", background: "rgba(0,0,0,.2)", padding: 3, borderRadius: 9, border: "1px solid rgba(255,255,255,.05)" }}>
                  {[
                    { id: "auto", l: "Auto", icon: "" },
                    { id: "manual", l: "Manuale", icon: "" }
                  ].map(m => (
                    <button key={m.id} onClick={() => setAllocationMode(m.id)}
                      style={{
                        padding: "6px 12px", borderRadius: 7, border: "none",
                        background: allocationMode === m.id ? col : "transparent",
                        color: allocationMode === m.id ? C.white : "rgba(255,255,255,.4)",
                        fontFamily: F.sans, fontSize: 11, fontWeight: allocationMode === m.id ? 700 : 400,
                        cursor: "pointer", transition: "all.15s", display: "flex", alignItems: "center", gap: 5
                      }}>
                      <span>{m.icon}</span> {m.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Microcopy & Manual Summary */}
              <div style={{ padding: "10px 14px", background: "rgba(255,255,255,.02)", borderBottom: "1px solid rgba(255,255,255,.05)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.45)", lineHeight: 1.4, maxWidth: 400 }}>
                  {allocationMode === "auto"
                    ? "Il sistema distribuisce automaticamente i volantini partendo dalle zone più vicine e più coerenti."
                    : `Modalità manuale: scegli tu quanti volantini assegnare a ogni ${territorySingularLabel.toLowerCase()}.`
                  }
                </div>
                {isResidentialStep2 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
                    <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.38)" }}>Ordina per:</span>
                    {[
                      { id: "relevance", l: "Rilevanza" },
                      { id: "families", l: "Famiglie" },
                      { id: "coverage", l: "Copertura" },
                    ].map(opt => (
                      <button key={opt.id} onClick={() => setZoneListSort(opt.id)}
                        style={{
                          padding: "5px 8px", borderRadius: 7, border: `1px solid ${zoneListSort === opt.id ? `${col}55` : "rgba(255,255,255,.08)"}`,
                          background: zoneListSort === opt.id ? `${col}18` : "rgba(255,255,255,.035)",
                          color: zoneListSort === opt.id ? col : "rgba(255,255,255,.45)",
                          fontFamily: F.sans, fontSize: 10, fontWeight: 800, cursor: "pointer"
                        }}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                )}
                {allocationMode === "manual" && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginBottom: 2 }}>Riepilogo assegnazione</div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: isInvalid ? C.red : C.green }}>
                      {totalAssigned.toLocaleString("it-IT", { useGrouping: true })} / {flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true })}
                    </div>
                  </div>
                )}
              </div>

              {/* Lista zone */}
              <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 6 }}>
                {analysisLoading && <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,.4)", fontFamily: F.sans, fontSize: 12 }}>Caricamento analisi territoriale...</div>}
                {analysisError === "TERRITORIAL_DATA_NOT_AVAILABLE" && (
                  <div style={{ padding: 24, textAlign: "center", color: C.red, background: "rgba(232,87,26,.08)", border: `1px solid ${C.red}33`, borderRadius: 12, fontFamily: F.sans, fontSize: 13 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Dati territoriali non disponibili per questo comune.</div>
                    <div style={{ opacity: 0.8, fontSize: 12 }}>La copertura dati reale e attualmente attiva per la Lombardia.</div>
                  </div>
                )}
                {nilUnavailable && (
                  <div style={{ padding: 14, textAlign: "center", color: C.yellow, background: "rgba(251,191,36,.08)", border: `1px solid ${C.yellow}33`, borderRadius: 10, fontFamily: F.sans, fontSize: 12 }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>Dati NIL non disponibili</div>
                    <div style={{ opacity: 0.82 }}>Milano viene analizzata con il comportamento comunale attuale.</div>
                  </div>
                )}
                {territorialDataUnavailable && analysisError !== "TERRITORIAL_DATA_NOT_AVAILABLE" && (
                  <div style={{ padding: 24, textAlign: "center", color: C.red, background: "rgba(232,87,26,.08)", border: `1px solid ${C.red}33`, borderRadius: 12, fontFamily: F.sans, fontSize: 13 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Dati territoriali non disponibili per questa zona.</div>
                    <div style={{ opacity: 0.8, fontSize: 12 }}>I POI reali restano visibili dove disponibili, ma non vengono creati comuni o zone territoriali da dati locali.</div>
                  </div>
                )}
                {analysisError === "POI_DATA_NOT_AVAILABLE" && <div style={{ padding: 20, textAlign: "center", color: C.orange, background: "rgba(232,87,26,.08)", borderRadius: 8, fontFamily: F.sans, fontSize: 12 }}>Dati POI non disponibili per questa zona.</div>}
                {shouldGroupMarginalZones && (
                  <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(232,87,26,.08)", border: "1px solid rgba(232,87,26,.22)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.62)", lineHeight: 1.45 }}>
                      <b style={{ color: C.white }}>{city.name || city.label} è una città grande:</b> con un raggio di 1km la campagna sarà più mirata.
                      {primaryCoveredZones.length > 0 && <> Con {flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true })} volantini coprirai principalmente: <b style={{ color: col }}>{primaryCoveredZones.join(", ")}</b>.</>}
                    </div>
                    <button onClick={() => updateActiveRadius(1)}
                      style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${col}55`, background: `${col}16`, color: col, fontFamily: F.sans, fontSize: 10, fontWeight: 900, cursor: "pointer" }}>
                      Riduci a 1km
                    </button>
                  </div>
                )}
                
                {zoneRowsForList.map(row => {
                  if (row.type === "marginal-summary") {
                    return (
                      <div key="marginal-summary" style={{ borderRadius: 10, border: "1px dashed rgba(255,255,255,.13)", background: "rgba(255,255,255,.025)", padding: "9px 10px" }}>
                        <button onClick={() => setShowMarginalZones(v => !v)}
                          style={{ width: "100%", padding: 0, border: "none", background: "transparent", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}>
                          <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,.72)" }}>
                            {showMarginalZones ? "-" : "+"} Altre {marginalResidentialZones.length} zone marginali <span style={{ color: "rgba(255,255,255,.38)", fontWeight: 700 }}>(basso impatto)</span>
                          </span>
                          <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.42)" }}>{showMarginalZones ? "nascondi" : "espandi"}</span>
                        </button>
                        <div style={{ marginTop: 5, fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.42)" }}>
                          totale aggregato: <b style={{ color: C.white }}>{marginalZoneFamilies.toLocaleString("it-IT", { useGrouping: true })}</b> famiglie · <b style={{ color: C.white }}>{marginalZoneCoverage}%</b> del raggio
                        </div>
                      </div>
                    );
                  }
                  const z = row.zone;
                  const sel = isMovementStep2 || (isBusinessStep2 && businessMetrics.clusterRows.length) ? true : z.isCap ? selectedCaps.includes(z.postalCode) : selected.includes(z.id);
                  const alloc = zonesAllocation.find(a => a.id === z.id) || { requiredFlyers: zCap(z), assignedFlyers: 0, coveragePercent: 0, allocationStatus: "none" };
const isManual = allocationMode === "manual";
                  const assignedFlyers = Math.max(0, Math.round(Number(alloc.assignedFlyers || alloc.assigned || alloc.allocated || alloc.volantini_assegnati || 0)));
                  const requiredFlyers = Math.max(0, Math.round(Number(alloc.requiredFlyers || alloc.needed || alloc.volantini_necessari || zCap(z) || 0)));
                  const coveragePercent = assignedFlyers <= 0
                    ? 0
                    : assignedFlyers >= requiredFlyers
                      ? 100
                      : Math.max(1, Math.min(99, Math.round((assignedFlyers / Math.max(1, requiredFlyers)) * 100)));
                  const coverageState = assignedFlyers <= 0 ? "none" : coveragePercent >= 100 ? "full" : "partial";
                  const coverageLabel = coverageState === "none" ? "Nel raggio" : coverageState === "full" ? "Copertura totale" : "Copertura selettiva";

                  return (
                    <div key={z.id} style={{
                      borderRadius: 10, border: `1px solid ${sel ? `${col}40` : "rgba(255,255,255,.05)"}`,
                      background: sel ? `${col}08` : "rgba(255,255,255,.01)", padding: "8px 10px",
                      transition: "all.15s"
                    }}>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "24px minmax(160px,1fr) 32px" : "24px 1fr 180px 120px 32px", gap: 12, alignItems: "center" }}>
                        {/* Checkbox */}
                        <div onClick={() => { if (!isMovementStep2 && !(isBusinessStep2 && businessMetrics.clusterRows.length)) toggleZone(z.id); }} style={{
                          width: 18, height: 18, borderRadius: 5, cursor: "pointer",
                          border: `2px solid ${coverageState !== "none" ? col : "rgba(255,255,255,.2)"}`,
                          background: coverageState === "full" ? col : coverageState === "partial" ? `${col}33` : "transparent", display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                          {coverageState === "full" && <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>}
                          {coverageState === "partial" && <div style={{ width: 6, height: 2, background: col, borderRadius: 1 }} />}
                        </div>

                        {/* Nome & Info */}
                        <div onClick={() => { if (!isMovementStep2 && !(isBusinessStep2 && businessMetrics.clusterRows.length)) toggleZone(z.id); }} style={{ cursor: isMovementStep2 || (isBusinessStep2 && businessMetrics.clusterRows.length) ? "default" : "pointer", flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: coverageState !== "none" ? 700 : 400, color: coverageState !== "none" ? C.white : "rgba(255,255,255,.45)" }}>{z.name}</div>
                            {coverageState === "partial" && <span style={{ padding: "1px 5px", borderRadius: 4, background: `${col}15`, border: `1px solid ${col}40`, fontFamily: F.sans, fontSize: 8, color: col, fontWeight: 800 }}>PARZIALE</span>}
                            {z.isNil && <span style={{ padding: "1px 5px", borderRadius: 4, background: `${getComuneColor(z.id)}22`, border: `1px solid ${getComuneColor(z.id)}55`, fontFamily: F.sans, fontSize: 8, color: getComuneColor(z.id), fontWeight: 800 }}>NIL</span>}
                            {z.isCap && <span style={{ padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,.1)", fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.4)", fontWeight: 700 }}>CAP</span>}
                            {z.source_flags?.includes('Stima territoriale') && <span style={{ padding: "1px 5px", borderRadius: 4, background: "rgba(251,191,36,.15)", border: "1px solid rgba(251,191,36,.3)", fontFamily: F.sans, fontSize: 8, color: C.yellow, fontWeight: 700 }}>Stima territoriale</span>}
                          </div>
                          <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.25)", marginTop: 2 }}>
                            {isResidentialStep2
                              ? `${z.families.toLocaleString("it-IT", { useGrouping: true })} famiglie – ${z.pop.toLocaleString("it-IT", { useGrouping: true })} ab. – ${z.area} km² – ${z.coverage}% nel raggio`
                              : isBusinessStep2
                              ? `${z.targetBiz} target – ${z.competitors} competitor – ${z.clusters} cluster – ${z.topCats}`
                              : isMovementStep2
                                ? `${z.poi} POI reali - ${z.transit || 0} nodi TPL/metro - score ${z.strength}/100`
                              : z.dist ? `${z.dist.toFixed(1)} km dal centro` : "Zona nel raggio"}
                          </div>
                        </div>

                        {/* Barra e Copertura */}
                        {sel ? (
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                              <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: coverageState === "full" ? C.green : coverageState === "partial" ? C.orange : "rgba(255,255,255,.38)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                                {coverageLabel}
                              </span>
                              {coverageState !== "none" && <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: C.white }}>{coveragePercent}%</span>}
                            </div>
                            {coverageState !== "none" && (
                              <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                                <div style={{ width: `${coveragePercent}%`, height: "100%", background: coverageState === "full" ? C.green : C.orange, borderRadius: 3 }} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.2)", fontStyle: "italic" }}>Non selezionata</div>
                        )}

                        {/* Input/Valore Volantini */}
                        <div style={{ textAlign: "right" }}>
                          {sel ? (
                            isManual ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <input
                                    type="number"
                                    value={manualAssignments[z.id] || 0}
                                    onChange={(e) => updateManual(z.id, e.target.value)}
                                    style={{
                                      width: 70, background: "rgba(0,0,0,.3)", border: `1px solid ${col}40`,
                                      borderRadius: 5, color: C.white, fontFamily: F.sans, fontSize: 12,
                                      padding: "4px 6px", textAlign: "right"
                                    }}
                                  />
                                  <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.3)" }}>pz</span>
                                </div>
                                <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", marginTop: 2 }}>di {alloc.requiredFlyers.toLocaleString("it-IT", { useGrouping: true })}</div>
                              </div>
                            ) : (
                              <div>
                                {assignedFlyers === 0 ? (
                                  <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.32)", fontStyle: "italic", lineHeight: 1.4, textAlign: "right" }}>
                                    Non coperto dal budget attuale
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 700, color: C.white }}>
                                      {assignedFlyers.toLocaleString("it-IT", { useGrouping: true })}
                                    </div>
                                    <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)" }}>di {requiredFlyers.toLocaleString("it-IT", { useGrouping: true })} necessari</div>
                                  </>
                                )}
                              </div>
                            )
                          ) : (
                            <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.15)" }}>{alloc.requiredFlyers.toLocaleString("it-IT", { useGrouping: true })} pz</div>
                          )}
                        </div>

                        {/* Azione rapida */}
                        <button onClick={() => toggleZone(z.id)} style={{
                          width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,.1)",
                          background: "rgba(255,255,255,.05)", color: sel ? C.red : "rgba(255,255,255,.3)",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                          {sel ? "" : "+"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Avvisi */}
              {selZones.length > 0 && (
                <div style={{ padding: "12px", background: "rgba(0,0,0,.15)", borderTop: "1px solid rgba(255,255,255,.05)" }}>
                  {allocationMode === "auto" ? (
                    isPartial ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(232,87,26,.08)", border: "1px solid rgba(232,87,26,.28)", fontFamily: F.sans, fontSize: 11, color: C.orange, lineHeight: 1.5 }}>
                          {isResidentialStep2 ? `Hai selezionato ${flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true })} volantini su ${requiredFlyers.toLocaleString("it-IT", { useGrouping: true })} necessari per copertura completa. Puoi procedere con copertura parziale oppure aumentare la quantità.` : `Hai selezionato ${flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true })} volantini su ${requiredFlyers.toLocaleString("it-IT", { useGrouping: true })} necessari per copertura completa. Puoi procedere con copertura parziale oppure aumentare la quantità.`}
                        </div>
                        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
                          <button onClick={handleNext}
                            style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: col, color: C.white, border: "none", fontFamily: F.sans, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                            Procedi con i miei {flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true })} volantini
                          </button>
                          <button onClick={() => setData(d => ({...d, qty: requiredFlyers, flyerQuantity: requiredFlyers }))}
                            style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: "transparent", color: col, border: `1px solid ${col}55`, fontFamily: F.sans, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                            Aumenta a {requiredFlyers.toLocaleString("it-IT", { useGrouping: true })} vol. (copertura completa)
                          </button>
                          <button onClick={() => setAllocationMode("manual")}
                            style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: "transparent", color: col, border: `1px solid ${col}45`, fontFamily: F.sans, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                            Modifica manualmente
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: "10px 14px", background: "rgba(46,204,138,.08)", border: "1px solid rgba(46,204,138,.2)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: C.green }}>quantità sufficiente per la copertura totale.</div>
                        {remainingFlyers > 0 && (
                          <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)" }}>Avanzano {remainingFlyers.toLocaleString("it-IT", { useGrouping: true })} pz.</div>
                        )}
                        {remainingFlyers > 0 && radiusInsightRows.some(z => !selected.includes(z.id)) && (
                          <button onClick={addBestUnselectedZone}
                            style={{ padding: "7px 11px", borderRadius: 8, background: "rgba(46,204,138,.12)", color: C.green, border: "1px solid rgba(46,204,138,.28)", fontFamily: F.sans, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>
                            Aggiungi {territorySingularLabel.toLowerCase()} consigliato
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    /* Manual Mode Footer */
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {isInvalid ? (
                        <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 10, padding: "10px 14px" }}>
                          <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 4 }}>Errore assegnazione</div>
                          <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.7)" }}>
                            Hai assegnato <b style={{ color: C.white }}>{totalAssigned.toLocaleString("it-IT", { useGrouping: true })}</b> volantini, ma ne hai disponibili solo <b style={{ color: C.white }}>{flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true })}</b>.
                            Riduci una zona o aumenta la quantità.
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: "rgba(46,204,138,.08)", border: "1px solid rgba(46,204,138,.2)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: C.green }}>Assegnazione manuale valida.</div>
                            <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)", marginTop: 2 }}>
                              {remainingFlyers > 0 ? `Rimanenti: ${remainingFlyers.toLocaleString("it-IT", { useGrouping: true })} volantini` : "Tutti i volantini sono stati assegnati."}
                            </div>
                          </div>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        {isInvalid && (
                          <button onClick={() => setData(d => ({...d, qty: totalAssigned, flyerQuantity: totalAssigned }))}
                            style={{ padding: "8px 14px", borderRadius: 8, background: col, color: C.white, border: "none", fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            Aumenta quantità a {totalAssigned.toLocaleString("it-IT", { useGrouping: true })}
                          </button>
                        )}
                        <button onClick={() => setAllocationMode("auto")}
                          style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.6)", border: "1px solid rgba(255,255,255,.1)", fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          Ripristina automatico
                        </button>
                        {!isInvalid && hasAtLeastOne && (
                          <button onClick={handleNext}
                            style={{ padding: "8px 14px", borderRadius: 8, background: col, color: C.white, border: "none", fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>
                            Continua con distribuzione manuale
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section */}
        {/* RIGHT COLUMN - ACTIVE ZONE SUMMARY */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {activeCampaignZone && (
            <div style={{ background: "rgba(255,255,255,.025)", borderRadius: 10, padding: "10px 12px", border: `1px solid rgba(255,255,255,.06)` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,.45)", letterSpacing: ".08em", textTransform: "uppercase" }}>Zona attiva</div>
                
              </div>
              <div style={{ fontFamily: F.serif, fontSize: 22, color: C.white, lineHeight: 1, marginBottom: 4 }}>{activeCampaignZone.zone_label || "Zona"}</div>
              <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.46)", lineHeight: 1.45 }}>
                {activeCampaignZone.cityName || "Da configurare"} · {(activeCampaignZone.assigned_flyers || data.qty || 0).toLocaleString("it-IT", { useGrouping: true })} volantini · {activeCampaignZone.radius || radius}km
              </div>
            </div>
          )}
          {city && isResidentialStep2 && selZones.length > 0 && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "14px 16px", border: `1px solid ${col}24` }}>
              <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: col, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>Lettura zona</div>
              <div style={{ fontFamily: F.serif, fontSize: 24, color: C.white, lineHeight: 1.05, marginBottom: 5 }}>{zoneHumanTitle}</div>
              <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.52)", lineHeight: 1.45, marginBottom: 12 }}>
                {formatNumber(serviceKpis.families)} famiglie raggiungibili nel raggio selezionato.
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 10, background: `${col}12`, border: `1px solid ${col}26`, marginBottom: 10 }}>
                <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 900, color: C.white, marginBottom: 4 }}>{zoneVerdict.title}</div>
                <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.58)", lineHeight: 1.5 }}>{zoneVerdict.text}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                {[
                  { l: "Copertura", v: serviceKpis.coverage != null ? serviceKpis.coverage + "%" : null },
                  { l: territoryPluralLabel, v: String(zonesInRadius.length) },
                  { l: "Densità", v: zoneDensity ? formatNumber(zoneDensity) + " ab/km²" : null },
                  { l: "Copertura completa", v: requiredFlyers ? formatNumber(requiredFlyers) + " pz" : null },
                ].filter(row => row.v != null && row.v !== "0").map(row => (
                  <div key={row.l} style={{ padding: "7px 8px", borderRadius: 8, background: "rgba(255,255,255,.045)" }}>
                    <div style={{ fontFamily: F.sans, fontSize: 7, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 2 }}>{row.l}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.white }}><MetricValue value={row.v} /></div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowTechnicalDetails(v => !v)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${col}35`, background: "transparent", color: col, fontFamily: F.sans, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                {showTechnicalDetails ? "Nascondi dettagli tecnici" : "Mostra dettagli tecnici"}
              </button>
            </div>
          )}
          {/* TELEMETRIA GIS COLLAPSIBLE CONTAINER */}
          {showTechnicalDetails && city && (
            <div style={{ background: "rgba(255,255,255,.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
              <div
                style={{
                  padding: "10px 14px",
                  background: "rgba(255,255,255,.02)",
                  borderBottom: "1px solid rgba(255,255,255,.05)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.5)", letterSpacing: ".06em" }}>
                  DETTAGLI & TELEMETRIA GIS ZONA ATTIVA
                </span>
              </div>
              
              {true && (
                <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 10 }}>
          {searchMode !== "cap" && !city && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "18px", border: "1px solid rgba(255,255,255,.07)", textAlign: "center" }}>
              <div style={{ width: 42, height: 42, margin: "0 auto 10px", borderRadius: 12, background: `${col}14`, border: `1px solid ${col}28`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>-–</div>
              <div style={{ fontFamily: F.serif, fontSize: 18, color: C.white, marginBottom: 6 }}>Cerca un comune per iniziare</div>
              <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.45)", lineHeight: 1.55 }}>
                Qui appariranno analisi zona, copertura, comuni nel raggio e suggerimenti automatici dai dati territoriali.
              </div>
            </div>
          )}
          {searchMode === "cap" && selectedCaps.length === 0 && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "18px", border: `1px solid ${col}22`, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}></div>
              <div style={{ fontFamily: F.serif, fontSize: 16, color: C.white, marginBottom: 6 }}>Modalità CAP attiva</div>
              <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.45)", lineHeight: 1.55 }}>Digita un CAP (es. 20121) per selezionare solo quella zona postale. I comuni del raggio NON vengono aggiunti automaticamente.</div>
            </div>
          )}

          {/* Totale selezione / CAP Summary */}
          <div style={{ background: `${col}10`, borderRadius: 12, padding: "14px 16px", border: `1px solid ${col}28` }}>
            <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: col, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>
              {searchMode === "cap" ? "Summary – Modalità CAP" : isResidentialStep2 ? "Summary – area residenziale" : isBusinessStep2 ? "Summary – area business" : isMovementStep2 ? "Summary – area operativa" : "Totale selezione"}
            </div>
            <div style={{ fontFamily: F.serif, fontSize: 32, color: C.white, letterSpacing: "-1.5px", lineHeight: 1, marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>
              {targetTotal.toLocaleString("it-IT", { useGrouping: true })}
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.45)", marginBottom: 10 }}>
              {mainTargetLabel}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
              {(isResidentialStep2 ? [
                { l: "Area", v: search || null },
                { l: "Raggio", v: radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km` },
                { l: "Superficie", v: serviceKpis?.area ? formatAreaKm2(serviceKpis.area) : null },
                { l: "Comuni", v: selZones.length },
                { l: "Inseriti", v: flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true }) },
                { l: "Copertura completa", v: requiredFlyers.toLocaleString("it-IT", { useGrouping: true }) + " vol." },
                { l: coverageStatus === "partial" ? "Mancanti" : "Rimanenti", v: (coverageStatus === "partial" ? missingFlyers : remainingFlyers).toLocaleString("it-IT", { useGrouping: true }) },
                { l: "Stato", v: coverageStatus === "sufficient" ? "Sufficiente" : coverageStatus === "empty" ? "Da selezionare" : "Copertura selettiva" },
              ] : isMovementStep2 ? [
                { l: "Area", v: search || null },
                { l: "Raggio", v: radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km` },
                { l: "Zone", v: serviceKpis?.operationalZones ?? 0 },
                { l: "Hotspot", v: serviceKpis?.hotspotCount ?? 0 },
                { l: "Inseriti", v: flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true }) },
                { l: "Necessari", v: requiredFlyers.toLocaleString("it-IT", { useGrouping: true }) },
                { l: coverageStatus === "partial" ? "Mancanti" : "Rimanenti", v: (coverageStatus === "partial" ? missingFlyers : remainingFlyers).toLocaleString("it-IT", { useGrouping: true }) },
                { l: "Stato", v: coverageStatus === "sufficient" ? "Sufficiente" : coverageStatus === "empty" ? "Da selezionare" : "Copertura selettiva" },
              ] : isBusinessStep2 ? [
                { l: "Area", v: search || null },
                { l: "Raggio", v: radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km` },
                { l: "Categoria", v: targetBusinessMeta?.label ?? null },
                { l: "Zone", v: serviceKpis?.operationalZones ?? selZones.length },
                { l: "Inseriti", v: flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true }) },
                { l: "Necessari", v: requiredFlyers.toLocaleString("it-IT", { useGrouping: true }) },
                { l: coverageStatus === "partial" ? "Mancanti" : "Rimanenti", v: (coverageStatus === "partial" ? missingFlyers : remainingFlyers).toLocaleString("it-IT", { useGrouping: true }) },
                { l: "Stato", v: coverageStatus === "sufficient" ? "Sufficiente" : coverageStatus === "empty" ? "Da selezionare" : "Copertura selettiva" },
              ] : [
                { l: "Zone", v: selZones.length },
                { l: "Raggio", v: radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km` },
                { l: "Inseriti", v: flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true }) },
                { l: "Necessari", v: requiredFlyers.toLocaleString("it-IT", { useGrouping: true }) },
              ]).map(({ l, v, unit }) => (
                <div key={l} style={{ padding: "5px 8px", borderRadius: 7, background: "rgba(255,255,255,.06)" }}>
                  <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 1 }}>{l}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: C.white }}><MetricValue value={v} unit={unit} /></div>
                </div>
              ))}
            </div>
            {selZones.length > 0 && (
              <div style={{ padding: "8px 10px", borderRadius: 8, background: coverageStatus === "sufficient" ? "rgba(46,204,138,.08)" : "rgba(232,87,26,.08)", border: `1px solid ${coverageStatus === "sufficient" ? "rgba(46,204,138,.22)" : "rgba(232,87,26,.24)"}` }}>
                <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: coverageStatus === "sufficient" ? C.green : C.orange, marginBottom: 2 }}>
                  {coverageStatus === "sufficient" ? "quantità sufficiente" : "Distribuzione selettiva"}
                </div>
                <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.52)", lineHeight: 1.45 }}>
                  {coverageStatus === "sufficient"
                    ? `quantità sufficiente per coprire le zone selezionate. Avanzano ${flyerSurplus.toLocaleString("it-IT", { useGrouping: true })} volantini.`
                    : `Hai ${flyerQuantityFromStep1.toLocaleString("it-IT", { useGrouping: true })} volantini, servono ${requiredFlyers.toLocaleString("it-IT", { useGrouping: true })}. Mancano ${missingFlyers.toLocaleString("it-IT", { useGrouping: true })} volantini.`}
                </div>
              </div>
            )}
          </div>

          {/* KPI Output - compact 2x2 grid, service-specific */}
          {viewMode === "distribuzione" && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 11 }}>{serviceMeta.icon}</span>
                <div style={{ width: 16, height: 3, background: col, borderRadius: 2 }} />
                <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", flex: 1 }}>
                  {isResidentialStep2 ? "D2D — Output residenziale" : isMovementStep2 ? "H2H — Output pedonale" : isBusinessStep2 ? "B2B — Output commerciale" : "Output servizio"}
                </span>
              </div>
              {selZones.length === 0 && !isMovementStep2 && !isBusinessStep2 ? (
                <div style={{ padding: "14px 0", textAlign: "center", fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.28)" }}>Seleziona almeno un comune</div>
              ) : (
                <div style={{ padding: "8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {(isResidentialStep2 ? [
                    { l: "Copertura stimata", v: gisLoading ? gisKpi(null, 46) : serviceKpis.coverage, format: "percent", c: C.green },
                    { l: "Volantini consigliati", v: gisLoading ? gisKpi(null, 62) : serviceKpis.recommendedFlyers, format: "number", c: C.white },
                    ...(aiAgg?.operDays != null ? [{ l: "Giorni operativi", v: aiAgg.operDays, c: C.yellow }] : []),
                    ...(aiAgg?.mailboxes != null ? [{ l: "Cassette stimate", v: aiAgg.mailboxes, format: "number", c: col }] : []),
                  ] : isMovementStep2 ? [
                    { l: "POI rilevati", v: gisLoading ? gisKpi(null, 62) : serviceKpis.poi, format: "number", c: col },
                    { l: "Fermate transit", v: gisLoading ? gisKpi(null, 48) : serviceKpis.transitStops, format: "number", c: C.purple },
                    { l: "Hotspot", v: gisLoading ? gisKpi(null, 54) : serviceKpis.hotspotCount, format: "number", c: C.green },
                    { l: "Waypoint GPS", v: gisLoading ? gisKpi(null, 44) : serviceKpis.gpsWaypoints, format: "number", c: C.yellow },
                    { l: "Flusso potenziale", v: gisLoading ? gisKpi(null, 54) : serviceKpis.flowScore, unit: "/100", c: C.white },
                  ] : isBusinessStep2 ? [
                    { l: "Attività rilevate", v: serviceKpis.businesses, format: "number", c: col },
                    { l: "Competitor vicini", v: gisLoading ? gisKpi(null, 48) : serviceKpis.competitors, format: "number", c: C.red },
                    { l: "Cluster commerciali", v: gisLoading ? gisKpi(null, 42) : serviceKpis.clusters, format: "number", c: C.white },
                    { l: "Waypoint GPS", v: gisLoading ? gisKpi(null, 44) : serviceKpis.gpsWaypoints, format: "number", c: C.yellow },
                    { l: "Attività target", v: gisLoading ? gisKpi(null, 58) : serviceKpis.targetBusinesses, format: "number", c: C.green },
                  ] : [
                    { l: "Zone", v: selZones.length, format: "number", c: col },
                    { l: `${territoryPluralLabel} nel raggio`, v: gisLoading ? gisKpi(null, 34) : zonesInRadius.length, format: "number", c: C.blue },
                  ]).map(({ l, v, c, format, unit }) => (
                    <div key={l} style={{ padding: "7px 9px", borderRadius: 8, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.055)" }}>
                      <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.32)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>{l}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: c }}><MetricValue value={v} format={format} unit={unit} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* OMI — compact with expand for additional typologies */}
          {city && !isMovementStep2 && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(232,87,26,.12)", overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 16, height: 3, background: C.orange, borderRadius: 2 }} />
                <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", flex: 1 }}>Valori OMI</span>
                <span style={{ padding: "1px 5px", borderRadius: 3, background: "rgba(232,87,26,.12)", fontFamily: F.sans, fontSize: 7, color: C.orange }}>Agenzia Entrate</span>
              </div>
              <div style={{ padding: "8px 10px" }}>
                {analysisLoading ? (
                  <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.28)", padding: "6px 0" }}>Caricamento–</div>
                ) : !omiInfo?.available ? (
                  <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.32)", padding: "4px 0" }}>Dato OMI non disponibile per il raggio selezionato.</div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                      {omiInfo.municipality && (
                        <div style={{ flex: 1, padding: "5px 8px", borderRadius: 7, background: "rgba(255,255,255,.04)" }}>
                          <div style={{ fontFamily: F.sans, fontSize: 7, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>Comune OMI</div>
                          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.white }}>{omiInfo.municipality}</div>
                        </div>
                      )}
                      {omiInfo.zone_name && (
                        <div style={{ flex: 1, padding: "5px 8px", borderRadius: 7, background: "rgba(255,255,255,.04)" }}>
                          <div style={{ fontFamily: F.sans, fontSize: 7, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>Zona OMI</div>
                          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.white }}>{omiInfo.zone_name}</div>
                        </div>
                      )}
                    </div>
                    {(omiInfo.values || []).slice(0, omiExpanded ? undefined : 1).map((v, i) => (
                      <div key={i} style={{ padding: "6px 8px", borderRadius: 8, background: "rgba(232,87,26,.06)", border: "1px solid rgba(232,87,26,.14)", marginBottom: 4 }}>
                        <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.38)", marginBottom: 2 }}>{v.typology}</div>
                        <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.orange }}>
                          {v.min_value != null && v.max_value != null ? (
                            <>
                              {v.min_value.toLocaleString("it-IT", { useGrouping: true })}{" – "}{v.max_value.toLocaleString("it-IT", { useGrouping: true })}
                              <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.28)", marginLeft: 4 }}>€/mq</span>
                            </>
                          ) : <MetricValue value={null} />}
                        </div>
                      </div>
                    ))}
                    {(omiInfo.values || []).length > 1 && (
                      <button onClick={() => setOmiExpanded(v => !v)} style={{ width: "100%", padding: "5px 0", borderRadius: 7, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "rgba(255,255,255,.4)", fontFamily: F.sans, fontSize: 9, cursor: "pointer", marginTop: 2 }}>
                        {omiExpanded ? "Mostra meno" : `Mostra tutte le tipologie (${(omiInfo.values || []).length})`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {city && isMovementStep2 && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: `1px solid ${col}22`, overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 16, height: 3, background: col, borderRadius: 2 }} />
                <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", flex: 1 }}>Mobilità e attrattori H2H</span>
                <span style={{ padding: "1px 5px", borderRadius: 3, background: `${col}18`, fontFamily: F.sans, fontSize: 7, color: col }}>POI / TPL reali</span>
              </div>
              <div style={{ padding: "8px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  { l: "Fermate TPL", v: serviceKpis.tplStops, c: C.purple },
                  { l: "Stazioni", v: serviceKpis.stations, c: C.blue },
                  { l: "Metro", v: serviceKpis.metro, c: C.green },
                  { l: "Università", v: serviceKpis.universities, c: C.yellow },
                  { l: "Attrattori locali", v: serviceKpis.localAttractors, c: col },
                ].map(({ l, v, c }) => (
                  <div key={l} style={{ padding: "6px 7px", borderRadius: 7, background: "rgba(255,255,255,.04)" }}>
                    <div style={{ fontFamily: F.sans, fontSize: 7, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>{l}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: c }}><MetricValue value={v} format="number" /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ISTAT inline compact (D2D distribuzione only) */}
          {showTechnicalDetails && isResidentialStep2 && viewMode === "distribuzione" && (serviceKpis.families > 0 || zonesInRadius.length > 0) && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 16, height: 3, background: col, borderRadius: 2 }} />
                <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", flex: 1 }}>ISTAT – riepilogo area</span>
                <button onClick={() => setViewMode("admininfo")} style={{ padding: "2px 7px", borderRadius: 5, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "rgba(255,255,255,.38)", fontFamily: F.sans, fontSize: 8, cursor: "pointer" }}>Dettagli →</button>
              </div>
              <div style={{ padding: "8px 10px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                {[
                  { l: "Popolazione", v: formatNumber(serviceKpis.pop || serviceKpis.families) },
                  { l: "Densità", v: serviceKpis.area && serviceKpis.pop ? `${formatNumber(Math.round(serviceKpis.pop / Number(serviceKpis.area)))} ab/km²` : null },
                  { l: `${territoryPluralLabel} nel raggio`, v: String(zonesInRadius.length) },
                ].map(({ l, v }) => (
                  <div key={l} style={{ padding: "6px 7px", borderRadius: 7, background: "rgba(255,255,255,.04)" }}>
                    <div style={{ fontFamily: F.sans, fontSize: 7, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>{l}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.white }}><MetricValue value={v} /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Residential scores — compact gauges with expandable comuni list */}
          {showTechnicalDetails && isResidentialStep2 && viewMode === "distribuzione" && selZones.length > 0 && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 16, height: 3, background: col, borderRadius: 2 }} />
                <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", flex: 1 }}>Score residenziale</span>
                {isResidentialStep2 && <button onClick={() => setDetailExpanded(v => !v)} style={{ padding: "2px 7px", borderRadius: 5, border: `1px solid ${col}35`, background: "transparent", color: col, fontFamily: F.sans, fontSize: 9, cursor: "pointer" }}>{detailExpanded ? "Meno" : "Comuni"}</button>}
              </div>
              <div style={{ padding: 9 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {baseScoreRows.map(s => <ScoreGauge key={s.l} label={s.l} value={s.v} color={s.c} />)}
                </div>
                {isResidentialStep2 && detailExpanded && residentialRadiusRows.length > 0 && (
                  <div style={{ marginTop: 8, padding: 8, borderRadius: 9, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.05)" }}>
                    <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>Top {territoryPluralLabel.toLowerCase()} nel raggio</div>
                    {residentialRadiusRows.slice(0, 6).map(r => {
                      const selectedRow = selected.includes(r.id);
                      return (
                        <div key={r.id} style={{ display: "grid", gridTemplateColumns: "8px 1fr 46px 36px", gap: 6, alignItems: "center", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: getComuneColor(r.id) }} />
                          <span style={{ fontFamily: F.sans, fontSize: 10, color: selectedRow ? C.white : "rgba(255,255,255,.5)", fontWeight: selectedRow ? 700 : 400 }}>{r.name}</span>
                          <span style={{ fontFamily: F.sans, fontSize: 10, color: selectedRow ? C.green : "rgba(255,255,255,.42)", textAlign: "right" }}>{r.strength}/100</span>
                          <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.38)", textAlign: "right" }}>{r.contribution === 0 && r.families > 0 ? "<1%" : r.contribution + "%"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Business intelligence — compact target + top categories + expandable clusters */}
          {showTechnicalDetails && isBusinessStep2 && viewMode === "distribuzione" && (selZones.length > 0 || businessMetrics.businesses > 0) && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 16, height: 3, background: col, borderRadius: 2 }} />
                <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", flex: 1 }}>Commercial intelligence</span>
                {businessClusterSummary.length > 0 && (
                  <button onClick={() => setDetailExpanded(v => !v)} style={{ padding: "2px 7px", borderRadius: 5, border: `1px solid ${col}35`, background: "transparent", color: col, fontFamily: F.sans, fontSize: 9, cursor: "pointer" }}>{detailExpanded ? "Meno" : "Cluster"}</button>
                )}
              </div>
              <div style={{ padding: "8px 10px" }}>
                <div style={{ padding: "5px 8px", marginBottom: 6, borderRadius: 8, background: `${targetBusinessMeta.color}12`, border: `1px solid ${targetBusinessMeta.color}28` }}>
                  <div style={{ fontFamily: F.sans, fontSize: 7, color: "rgba(255,255,255,.3)", marginBottom: 1 }}>Categoria target</div>
                  <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: targetBusinessMeta.color }}>{targetBusinessMeta.label}</div>
                </div>
                {businessCategorySummary.slice(0, 3).map(cat => (
                  <div key={cat.label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: cat.target ? targetBusinessMeta.color : "rgba(255,255,255,.25)", flexShrink: 0 }} />
                    <span style={{ fontFamily: F.sans, fontSize: 10, color: cat.target ? C.white : "rgba(255,255,255,.5)", flex: 1 }}>{cat.label}</span>
                    <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: cat.target ? targetBusinessMeta.color : "rgba(255,255,255,.42)" }}>{cat.count.toLocaleString("it-IT", { useGrouping: true })}</span>
                  </div>
                ))}
                {detailExpanded && businessClusterSummary.map(cl => (
                  <div key={cl.id} style={{ padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.05)", marginTop: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.white }}>{cl.name}</span>
                      <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: cl.score >= 78 ? C.green : cl.score >= 62 ? C.yellow : C.orange }}>{cl.score}/100</span>
                    </div>
                    <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.42)", lineHeight: 1.4 }}>{cl.dominant} – {cl.target} target – {cl.competitors} comp.</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* H2H Movement intelligence — compact attrattori + expandable hotspot */}
          {showTechnicalDetails && isMovementStep2 && viewMode === "distribuzione" && h2hMetrics.poi > 0 && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", overflow: "hidden" }}>
              <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 16, height: 3, background: col, borderRadius: 2 }} />
                <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", flex: 1 }}>Movement / hotspot</span>
                {h2hHotspotSummary.length > 0 && (
                  <button onClick={() => setDetailExpanded(v => !v)} style={{ padding: "2px 7px", borderRadius: 5, border: `1px solid ${col}35`, background: "transparent", color: col, fontFamily: F.sans, fontSize: 9, cursor: "pointer" }}>{detailExpanded ? "Meno" : "Hotspot"}</button>
                )}
              </div>
              <div style={{ padding: "8px 10px" }}>
                {h2hAttractionSummary.map(row => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.55)", flex: 1 }}>{row.label}</span>
                    <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: C.white }}>{row.value.toLocaleString("it-IT", { useGrouping: true })}</span>
                  </div>
                ))}
                {detailExpanded && h2hHotspotSummary.map(h => (
                  <div key={h.id} style={{ padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.05)", marginTop: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.white }}>{h.name}</span>
                      <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: h.strength >= 78 ? C.green : h.strength >= 62 ? C.yellow : C.orange }}>{h.strength}/100</span>
                    </div>
                    <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.42)", lineHeight: 1.4 }}>{h.poi} POI – {h.transit} transit – {h.time}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legenda + ranking - vista Tematica */}
          {showTechnicalDetails && viewMode === "tematica" && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", padding: "12px" }}>
              <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>Classifica – {activeLay?.label}</div>
              {zonesInRadius.length === 0
                ? <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.28)", textAlign: "center", padding: "12px 0" }}>Cerca un comune</div>
                : [...zonesInRadius].sort((a, b) => b[activeLay?.field || "families"] - a[activeLay?.field || "families"]).map((z, i) => {
                  const v = activeLay ? z[activeLay.field] : 0;
const pct2 = thMax > 0 ? Math.round((v / thMax) * 100) : 0;
                  return (
                    <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                      <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.25)", width: 14 }}>{i + 1}.</span>
                      <span style={{ fontFamily: F.sans, fontSize: 11, color: C.white, flex: 1, fontWeight: i === 0 ? 700 : 400 }}>{z.name.split(" ")[0]}</span>
                      <div style={{ width: 44, height: 3, borderRadius: 2, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
                        <div style={{ width: `${pct2}%`, height: "100%", background: activeLay ? thColor(v, thMin, thMax, activeLay.lo, activeLay.hi) : col, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.55)", width: 54, textAlign: "right" }}>{activeLay ? activeLay.fmt(v) : v}</span>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* Profilo demografico */}
          {showTechnicalDetails && isResidentialStep2 && (
            <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase" }}>
                Profilo demografico
              </div>
              {!aiAgg
                ? <div style={{ padding: "18px", textAlign: "center", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.28)" }}>Seleziona zone per vedere il profilo demografico</div>
                : isResidentialStep2 && false ? (
                  <div style={{ padding: "10px", display: "grid", gap: 10 }}>
                    {["Residential profile", "Demographic profile", "Economic context", "Operational reading"].map(group => (
                      <div key={group} style={{ borderRadius: 10, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
                        <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,.05)", fontFamily: F.sans, fontSize: 8, fontWeight: 800, color: C.orange, letterSpacing: ".09em", textTransform: "uppercase" }}>{group}</div>
                        <div style={{ padding: "7px 10px" }}>
                          {serviceMeta.aiCats.filter(row => row.group === group).map((row, i) => {
                            const v = row.v(aiAgg);
const unavailable = v === null || v === undefined || v === "" || String(v).includes("undefined");
                            return (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                                <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.38)" }}>{row.l}</span>
                                <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: unavailable ? "rgba(255,255,255,.28)" : row.c === "green" ? C.green : C.white, textAlign: "right", maxWidth: 150 }}><MetricValue value={unavailable ? null : v} /></span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div style={{ padding: "9px 10px", borderRadius: 9, background: "rgba(232,87,26,.08)", border: "1px solid rgba(232,87,26,.2)", fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.58)", lineHeight: 1.45 }}>
                      Lettura residenziale: priorità a comuni con alta concentrazione famiglie, buona copertura cassette e quantità coerente con il fabbisogno stimato.
                    </div>
                  </div>
                ) : isResidentialStep2 ? (
                  <div style={{ padding: "10px", display: "grid", gap: 10 }}>
                    <div style={{ borderRadius: 10, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
                      <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,.05)", fontFamily: F.sans, fontSize: 8, fontWeight: 800, color: C.orange, letterSpacing: ".09em", textTransform: "uppercase" }}>Copertura reale Lombardia</div>
                      <div style={{ padding: "7px 10px" }}>
                        {[
                          { l: "Famiglie stimate", v: gisKpi(formatNumber(serviceKpis.families || aiAgg.families), 68), c: C.green },
                          { l: "Popolazione stimata", v: formatNumber(serviceKpis.population || aiAgg.pop), c: C.white },
                          { l: "Superficie analizzata", v: serviceKpis.area ? formatAreaKm2(serviceKpis.area) : null, c: C.white },
                          { l: "Densità media", v: serviceKpis.area && (serviceKpis.population || aiAgg.pop) ? `${formatNumber(Math.round((serviceKpis.population || aiAgg.pop) / serviceKpis.area))} ab./km²` : null, c: C.white },
                          { l: `${territoryPluralLabel} nel raggio`, v: gisKpi(formatNumber(zonesInRadius.length), 34), c: C.white },
                        ].map(({ l, v, c }) => (
                          <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                            <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.38)" }}>{l}</span>
                            <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: v == null ? "rgba(255,255,255,.28)" : c, textAlign: "right", maxWidth: 170 }}><MetricValue value={v} /></span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ borderRadius: 10, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
                      <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,.05)", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: F.sans, fontSize: 8, fontWeight: 800, color: C.orange, letterSpacing: ".09em", textTransform: "uppercase", flex: 1 }}>Indicatori demografici</span>
                        {demoData && <span style={{ fontFamily: F.sans, fontSize: 7, color: "rgba(255,255,255,.3)" }}>Anno {demoData.referenceYear}</span>}
                      </div>
                      <div style={{ padding: "7px 10px" }}>
                        {demoLoading ? (
                          <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.28)", padding: "6px 0" }}>Caricamento...</div>
                        ) : [
                          { l: "Età 0-14",  v: demoData?.age_0_14_pct  != null ? `${demoData.age_0_14_pct.toFixed(1)}%`  : null, c: "#93C5FD" },
                          { l: "Età 15-34", v: demoData?.age_15_34_pct != null ? `${demoData.age_15_34_pct.toFixed(1)}%` : null, c: "#34D399" },
                          { l: "Età 35-64", v: demoData?.age_35_64_pct != null ? `${demoData.age_35_64_pct.toFixed(1)}%` : null, c: "#FBBF24" },
                          { l: "Età 65+",   v: demoData?.age_65_plus_pct != null ? `${demoData.age_65_plus_pct.toFixed(1)}%` : null, c: "#F87171" },
                        ].map(({ l, v, c }) => (
                          <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                            <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.38)" }}>{l}</span>
                            <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: v == null ? "rgba(255,255,255,.28)" : c, textAlign: "right", maxWidth: 170 }}><MetricValue value={v} /></span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ padding: "9px 10px", borderRadius: 9, background: "rgba(232,87,26,.08)", border: "1px solid rgba(232,87,26,.2)", fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.58)", lineHeight: 1.45 }}>
                      Distribuzione demografica comunale da dati reali. Non calcolata sul singolo raggio.
                    </div>
                  </div>
                ) : isMovementStep2 ? (
                  <div style={{ padding: "10px", display: "grid", gap: 10 }}>
                    {["Movement profile", "Local attractiveness", "Operational timing", "Operational reading"].map(group => (
                      <div key={group} style={{ borderRadius: 10, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
                        <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,.05)", fontFamily: F.sans, fontSize: 8, fontWeight: 800, color: C.blue, letterSpacing: ".09em", textTransform: "uppercase" }}>{group}</div>
                        <div style={{ padding: "7px 10px" }}>
                          {serviceMeta.aiCats.filter(row => row.group === group).map((row, i) => {
                            const v = row.v(aiAgg);
const unavailable = v === null || v === undefined || v === "" || String(v).includes("undefined");
                            return (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                                <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.38)" }}>{row.l}</span>
                                <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: unavailable ? "rgba(255,255,255,.28)" : C.white, textAlign: "right", maxWidth: 150 }}><MetricValue value={unavailable ? null : v} /></span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div style={{ padding: "9px 10px", borderRadius: 9, background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.2)", fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.58)", lineHeight: 1.45 }}>
                      Lettura operativa: priorità a punti con flusso alto, anchor trasporto/scuola-evento e fasce orarie coerenti. Le metriche demografiche restano secondarie.
                    </div>
                  </div>
                ) : isBusinessStep2 ? (
                  <div style={{ padding: "10px", display: "grid", gap: 10 }}>
                    {["Commercial profile", "Economic context", "Competitive context", "Operational reading"].map(group => (
                      <div key={group} style={{ borderRadius: 10, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
                        <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,.05)", fontFamily: F.sans, fontSize: 8, fontWeight: 800, color: targetBusinessMeta.color, letterSpacing: ".09em", textTransform: "uppercase" }}>{group}</div>
                        <div style={{ padding: "7px 10px" }}>
                          {serviceMeta.aiCats.filter(row => row.group === group).map((row, i) => {
                            const v = row.v(aiAgg);
const unavailable = v === null || v === undefined || v === "" || String(v).includes("undefined");
                            return (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                                <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.38)" }}>{row.l}</span>
                                <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: unavailable ? "rgba(255,255,255,.28)" : row.c === "green" ? C.green : C.white, textAlign: "right", maxWidth: 150 }}><MetricValue value={unavailable ? null : v} /></span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div style={{ padding: "9px 10px", borderRadius: 9, background: `${targetBusinessMeta.color}10`, border: `1px solid ${targetBusinessMeta.color}22`, fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.58)", lineHeight: 1.45 }}>
                      Lettura operativa: priorità alle zone con più attività target, cluster forti e densità commerciale alta. I competitor sono contesto decisionale, non blocco automatico.
                    </div>
                  </div>
                ) : <div style={{ padding: "10px" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <MiniDonut data={[aiAgg.eta14, aiAgg.eta34, aiAgg.eta64, aiAgg.eta65]} colors={["#93C5FD", "#34D399", "#FBBF24", "#F87171"]} size={64} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {[["0-14", aiAgg.eta14, "#93C5FD"], ["15-34", aiAgg.eta34, "#34D399"], ["35-64", aiAgg.eta64, "#FBBF24"], ["65+", aiAgg.eta65, "#F87171"]].map(([l, v, c]) => (
                        <div key={l} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          <div style={{ width: 6, height: 6, borderRadius: 1, background: c, flexShrink: 0 }} />
                          <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.5)" }}>{l}: <b style={{ color: v != null ? C.white : "rgba(255,255,255,.28)" }}><MetricValue value={v != null ? `${v}%` : null} /></b></span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {[
                    { l: "Reddito medio", v: "EUR " + aiAgg.reddito.toLocaleString("it-IT", { useGrouping: true }), c: C.green },
                    { l: "Tasso occupaz.", v: aiAgg.occup + "%", c: C.blue },
                    { l: "% Stranieri", v: aiAgg.stranieri + "%", c: C.teal },
                    { l: "Imprese tot.", v: aiAgg.imprese.toLocaleString("it-IT", { useGrouping: true }), c: C.purple },
                  ].map(({ l, v, c }) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                      <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)" }}>{l}</span>
                      <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: c }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, maxHeight: 200, overflowY: "auto" }}>
                    {serviceMeta.aiCats.map((row, i) => {
                      const v = row.v(aiAgg);
const unavailable = v === null || v === undefined || v === "" || String(v).includes("undefined");
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,.04)" }}>
                          <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.35)" }}>{row.l}</span>
                          <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: unavailable ? "rgba(255,255,255,.28)" : row.c === "green" ? C.green : C.white, textAlign: "right", maxWidth: 140 }}><MetricValue value={unavailable ? null : v} /></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              }
            </div>
          )}

          {/* Score avanzati */}
          {showTechnicalDetails && (
          <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,.07)", overflow: "hidden" }}>
            <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.3)", letterSpacing: ".1em", textTransform: "uppercase" }}>Score avanzati</span>
              <button onClick={() => setShowAdv(v => !v)} style={{ padding: "2px 8px", borderRadius: 5, border: `1px solid ${col}35`, background: "transparent", color: col, fontFamily: F.sans, fontSize: 9, cursor: "pointer" }}>{showAdv ? "-" : "+"}</button>
            </div>
            {showAdv && (
              <div style={{ padding: "10px" }}>
                {!firstZ
                  ? <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.26)", textAlign: "center", padding: "8px 0" }}>Seleziona una zona</div>
                  : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {advancedScoreRows.filter(s => s.v !== null && s.v !== undefined && s.v !== 0 && s.v !== "0").map((s, i) => <ScoreGauge key={i} label={s.l} value={s.v} color={s.c} />)}
                  </div>
                }
              </div>
            )}
          </div>

          )}

          {/* Fonti */}
          <div style={{ background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ fontFamily: F.sans, fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,.25)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>Fonti dati</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {confirmedStep2Sources.map(s => <span key={s} style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,.06)", fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.42)" }}>{s}</span>)}
            </div>
          </div>

          {/* Bottom actions container */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
            <button className="btn" onClick={onBack}
              style={{ width: "100%", minHeight: 42, padding: "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.58)", fontFamily: F.sans, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "center" }}>
              Tipo campagna
            </button>
            <button className="btn" onClick={handleNext} disabled={!canContinueCalendar}
              style={{ width: "100%", minHeight: 52, padding: "0 14px", borderRadius: 11, border: "none", background: canContinueCalendar ? col : "rgba(255,255,255,.1)", color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 800, cursor: canContinueCalendar ? "pointer" : "not-allowed", boxShadow: canContinueCalendar ? `0 6px 18px ${C.orangeGlow}` : "none", textAlign: "center" }}>
              {gisTimedOut ? "Dati GIS non disponibili" : gisLoading ? "Analisi GIS in corso..." : step2ZonesReady ? "Continua al calendario" : "Seleziona/configura le zone"}
            </button>
            {!step2ZonesReady && (
              <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.38)", textAlign: "center", lineHeight: 1.5, padding: "0 4px" }}>
                Assicurati che tutte le zone abbiano un'area geografica e una quantità di volantini valida.
              </div>
            )}
            <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.18)", textAlign: "center" }}>
              Scegli le date disponibili per ciascuna zona configurata. Nessun pagamento ora.
            </div>
          </div>
        </div>
      )}
      </div>
    )}
        </div>
      </div>
    </div>
  );
}

function Step3({ data, setData, onNext, onBack }) {
  const isMobile = useIsMobile();
  const initialCalendarDate = (() => {
    const raw = data.startDate || data.campaignPeriodStart;
    const parsed = raw ? new Date(`${raw}T00:00:00`) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  })();
  
  const [activeCalZoneId, setActiveCalZoneId] = useState(data.activeZoneId || data.campaignZones?.[0]?.id);
  const [selDays, setSelDays] = useState([]);
  
  useEffect(() => {
    if (!data.dateMode) {
      setData(prev => ({ ...prev, dateMode: "global" }));
    }
  }, []);

  const activeZone = data.dateMode === "per_zone" ? (data.campaignZones || []).find(z => z.id === activeCalZoneId) : null;

  useEffect(() => {
    if (data.dateMode === "per_zone" && activeCalZoneId) {
      const z = (data.campaignZones || []).find(x => x.id === activeCalZoneId);
      setSelDays(z?.selectedDates || z?.days || []);
    } else {
      setSelDays(data.selectedDates || data.days || []);
    }
  }, [activeCalZoneId, data.dateMode, data.campaignZones, data.selectedDates, data.days]);

  const getMinMaxDates = (dates) => {
    if (!dates || dates.length === 0) return { start: null, end: null };
    const sorted = [...dates].sort();
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  };

  const updateDays = (newDays) => {
    setSelDays(newDays);
    if (data.dateMode === "per_zone" && activeCalZoneId) {
      setData(prev => {
        const minMax = getMinMaxDates(newDays);
        const updatedZones = (prev.campaignZones || []).map(z => {
          if (z.id === activeCalZoneId) {
            return {
              ...z,
              selectedDates: newDays,
              days: newDays,
              startDate: minMax.start,
              endDate: minMax.end,
              start_date: minMax.start,
              end_date: minMax.end,
            };
          }
          return z;
        });
        
        const allDates = updatedZones.reduce((acc, z) => {
          if (z.selectedDates) acc.push(...z.selectedDates);
          return acc;
        }, []);
        const uniqueDates = [...new Set(allDates)];
        const overallMinMax = getMinMaxDates(uniqueDates);
        
        return {
          ...prev,
          campaignZones: updatedZones,
          selectedDates: uniqueDates,
          days: uniqueDates,
          startDate: overallMinMax.start,
          endDate: overallMinMax.end,
        };
      });
    } else {
      setData(prev => {
        const minMax = getMinMaxDates(newDays);
        const updatedZones = (prev.campaignZones || []).map(z => ({
          ...z,
          selectedDates: newDays,
          days: newDays,
          startDate: minMax.start,
          endDate: minMax.end,
          start_date: minMax.start,
          end_date: minMax.end,
        }));
        
        return {
          ...prev,
          selectedDates: newDays,
          days: newDays,
          startDate: minMax.start,
          endDate: minMax.end,
          campaignZones: updatedZones,
        };
      });
    }
  };

  const [month, setMonth] = useState(data.selectedMonth?.month ?? initialCalendarDate.getMonth());
  const [year, setYear] = useState(data.selectedMonth?.year ?? initialCalendarDate.getFullYear());
  const [form, setForm] = useState(data.contactRequestData || { nome: "", telefono: "", email: "", periodo: "", note: "" });
  const [showRequest, setShowRequest] = useState(Boolean(data.smartPairingRequestSent));
  const [formSent, setFormSent] = useState(false);
  const [formError, setFormError] = useState("");
  const DI = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];
  const planMonths = { single: 1, monthly3: 3, monthly6: 6, monthly12: 12 };
  const planLabel = { single: "Campagna singola", monthly3: "Piano 3 mesi", monthly6: "Piano 6 mesi", monthly12: "Piano 12 mesi" }[data.subscription] || "Campagna singola";
  const isContinuativePlan = data.subscription && data.subscription !== "single";
  const totalCampaigns = data.totalCampaigns || ((data.campaignsPerMonth || 1) * (planMonths[data.subscription] || 1));
  const realSmartPairingSlots = Array.isArray(data.smartPairingSlots) ? data.smartPairingSlots : [];
  const realAvailabilityDates = Array.isArray(data.availableDates) ? data.availableDates : [];
  const pairs = Object.fromEntries(realSmartPairingSlots.map(slot => {
    const key = slot.date || slot.day || slot.giorno;
    if (!key) return null;
    const type = slot.type === "same" || slot.matchType === "same" ? "same" : "nearby";
    const maxDisc = type === "same" ? 40 : 20;
    const rawDiscount = Number(slot.discountPercent ?? slot.discount_pct ?? slot.discount ?? 0);
    return [key, {
      type,
      disc: Math.max(0, Math.min(maxDisc, Number.isFinite(rawDiscount) ? rawDiscount : 0)),
      zone: slot.zone || slot.area || slot.comune || "Zona compatibile",
      source: slot.source || "backend",
    }];
  }).filter(Boolean));
  const availableDates = new Set(realAvailabilityDates.map(d => typeof d === "string" ? d : d?.date).filter(Boolean));
  const wx = {};
  const dim = (m, y) => new Date(y, m + 1, 0).getDate();
  const fdow = (m, y) => { let d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; };
  const fmtDay = k => { const [y, m, d] = k.split("-"); return `${d} ${MONTHS_FULL[parseInt(m)]} ${y}`; };
  const selectedInfo = selDays.filter(k => pairs[k]).map(k => ({ key: k, pair: pairs[k] }));
  const pairingDays = selectedInfo.filter(x => x.pair).map(x => x.key);
  const normalDays = [];
  const requestOnlyDays = [];
  const totalPairDisc = pairingDays.reduce((a, k) => a + (pairs[k]?.disc || 0), 0);
  const averagePairingDiscount = pairingDays.length ? Math.round(totalPairDisc / pairingDays.length) : 0;
  const maxPairingDiscount = pairingDays.length ? Math.max(...pairingDays.map(k => pairs[k].disc)) : 0;
  const requiresManualConfirmation = false;
  const calendarStatus = pairingDays.length === 0 ? "empty" : "smart_pairing_selected";

  const currentServiceType = activeZone ? activeZone.service_type : (data.type || "d2d");
  const svcLabel = { d2d: "Door to Door", h2h: "Hand to Hand", b2b: "Business Distribution" }[currentServiceType] || "Servizio";

  const zoneLabel = activeZone
    ? (activeZone.zone_label || activeZone.cityName || `Zona ${activeCalZoneId}`)
    : ((data.selectedComuni && data.selectedComuni.length ? data.selectedComuni : (data.zones || [])).join(" – ") || data.cityName || "Zona da Step 2");

  const fmtIsoDate = (v) => {
    if (!v) return "";
    const p = v.split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "";
  };
  const periodLabel = data.startDate && data.endDate ? `${fmtIsoDate(data.startDate)}  ${fmtIsoDate(data.endDate)}` : data.startDate ? `Dal ${fmtIsoDate(data.startDate)}` : "";
  const basePrice = BASE_PRICES[currentServiceType] || 1.85;
  const activeQty = activeZone ? Number(activeZone.assigned_flyers || 0) : Number(data.qty || 0);
  const baseCost = activeZone
    ? (activeQty / 1000) * basePrice
    : (activeQty / 1000) * basePrice * ((data.campaignZones || []).length || 1);
  const saved = baseCost * (averagePairingDiscount / 100);
function toggle(d) {
    const k = `${year}-${month}-${d}`;
    if (!pairs[k]) return;
    const newDays = selDays.includes(k) ? selDays.filter(x => x !== k) : [...selDays, k];
    updateDays(newDays);
    setShowRequest(false);
    setFormSent(false);
  }

  function buildPayload(contactOverride) {
    const pairingByDay = Object.fromEntries(selDays.map(k => [k, pairs[k] ? pairs[k].type : "none"]));
    const discountByDay = Object.fromEntries(selDays.map(k => [k, pairs[k]?.disc || 0]));
    return {
      days: selDays,
      avgDiscount: averagePairingDiscount,
      selectedDates: selDays,
      selectedMonth: { month, year, label: `${MONTHS_FULL[month]} ${year}` },
      selectedDaysCount: selDays.length,
      pairingDays,
      normalDays,
      requestOnlyDays,
      pairingType: pairingByDay,
      pairingDiscountPercent: discountByDay,
      averagePairingDiscount,
      maxPairingDiscount,
      calendarStatus,
      requiresManualConfirmation,
      availableDates: realAvailabilityDates,
      smartPairingSlots: realSmartPairingSlots,
      smartPairingAvailabilitySource: realSmartPairingSlots.length || realAvailabilityDates.length ? "backend" : "none",
      smartPairingRequestSent: false,
      smartPairingStatus: pairingDays.length ? "selected" : "none",
      contactRequestData: contactOverride || data.contactRequestData || null
    };
  }

  function buildFinalPayload(contactOverride) {
    if (data.dateMode === "per_zone") {
      const allSelectedDates = (data.campaignZones || []).reduce((acc, z) => {
        if (z.selectedDates) acc.push(...z.selectedDates);
        return acc;
      }, []);
      const uniqueSelectedDates = [...new Set(allSelectedDates)];
      const minMax = getMinMaxDates(uniqueSelectedDates);
      
      const pairingByDay = Object.fromEntries(uniqueSelectedDates.map(k => [k, pairs[k] ? pairs[k].type : "none"]));
      const discountByDay = Object.fromEntries(uniqueSelectedDates.map(k => [k, pairs[k]?.disc || 0]));
      
      const allZonePairingDays = uniqueSelectedDates.filter(k => pairs[k]);
      const totalAllZonePairDisc = allZonePairingDays.reduce((a, k) => a + (pairs[k]?.disc || 0), 0);
      const overallAverageDiscount = allZonePairingDays.length ? Math.round(totalAllZonePairDisc / allZonePairingDays.length) : 0;
      const overallMaxDiscount = allZonePairingDays.length ? Math.max(...allZonePairingDays.map(k => pairs[k].disc)) : 0;

      return {
        days: uniqueSelectedDates,
        avgDiscount: overallAverageDiscount,
        selectedDates: uniqueSelectedDates,
        selectedMonth: { month, year, label: `${MONTHS_FULL[month]} ${year}` },
        selectedDaysCount: uniqueSelectedDates.length,
        pairingDays: allZonePairingDays,
        normalDays,
        requestOnlyDays,
        pairingType: pairingByDay,
        pairingDiscountPercent: discountByDay,
        averagePairingDiscount: overallAverageDiscount,
        maxPairingDiscount: overallMaxDiscount,
        calendarStatus: allZonePairingDays.length ? "smart_pairing_selected" : "no_smart_pairing",
        requiresManualConfirmation,
        availableDates: realAvailabilityDates,
        smartPairingSlots: realSmartPairingSlots,
        smartPairingAvailabilitySource: realSmartPairingSlots.length || realAvailabilityDates.length ? "backend" : "none",
        smartPairingRequestSent: false,
        smartPairingStatus: allZonePairingDays.length ? "selected" : "none",
        contactRequestData: contactOverride || data.contactRequestData || null,
        startDate: minMax.start,
        endDate: minMax.end,
      };
    } else {
      return buildPayload(contactOverride);
    }
  }

  function validateRequestForm() {
    if (!form.nome.trim()) { setFormError("Inserisci nome e cognome"); return false; }
    if (!form.telefono.replace(/\s/g, "").match(/^\+?[0-9]{8,}$/)) { setFormError("Inserisci un numero WhatsApp valido"); return false; }
    if (!form.email.includes("@")) { setFormError("Inserisci una email valida"); return false; }
    if (!form.periodo.trim()) { setFormError("Indica il periodo o i giorni preferiti"); return false; }
    setFormError("");
    return true;
  }

  async function handleRequestSubmit() {
    if (!validateRequestForm()) return;
    setFormSent(true);
    if (hasSupabaseConfig()) {
      try {
        await saveSmartPairingWaitlist({
          email: form.email,
          telefono: form.telefono,
          zone: zoneLabel,
          preferred_period: form.periodo,
          note: form.note,
        });
      } catch (err) {
        console.warn("Smart Pairing waitlist Supabase save failed", err);
      }
    }
    setData(d => ({...d,
      days: [],
      avgDiscount: 0,
      selectedDates: [],
      selectedDaysCount: 0,
      pairingDays: [],
      normalDays: [],
      requestOnlyDays: [],
      pairingType: {},
      pairingDiscountPercent: {},
      averagePairingDiscount: 0,
      maxPairingDiscount: 0,
      calendarStatus: "smart_pairing_request",
      smartPairingStatus: "request_sent",
      smartPairingRequestSent: true,
      requiresManualConfirmation: true,
      contactRequestData: form
    }));
    onNext();
  }

  function handlePrimary() {
    if (data.dateMode === "per_zone") {
      const hasUnplanned = (data.campaignZones || []).some(z => !z.selectedDates || z.selectedDates.length === 0);
      if (hasUnplanned) {
        const firstUnplanned = (data.campaignZones || []).find(z => !z.selectedDates || z.selectedDates.length === 0);
        if (firstUnplanned) {
          setActiveCalZoneId(firstUnplanned.id);
          alert(`Pianifica le date anche per la zona: ${firstUnplanned.zone_label || firstUnplanned.cityName || "successiva"}`);
          return;
        }
      }
    }
    if (selDays.length === 0 && data.dateMode !== "per_zone") return;
    setData(d => ({...d,...buildFinalPayload(null) }));
    onNext();
  }

  function handleSkipPairing() {
    setData(d => ({...d,...buildFinalPayload(null),
      days: [],
      avgDiscount: 0,
      selectedDates: [],
      selectedDaysCount: 0,
      pairingDays: [],
      pairingType: {},
      pairingDiscountPercent: {},
      averagePairingDiscount: 0,
      maxPairingDiscount: 0,
      calendarStatus: "no_smart_pairing",
      smartPairingStatus: "request_based",
      availableDates: [],
      smartPairingSlots: [],
      smartPairingAvailabilitySource: "none"
    }));
    onNext();
  }

  const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.07)", color: C.white, fontFamily: F.sans, fontSize: 14 };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 28px 130px" }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: F.serif, fontSize: 34, color: C.white, letterSpacing: "-1px", marginBottom: 7 }}>Smart Pairing</h2>
        <p style={{ fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.48)", lineHeight: 1.65, maxWidth: 760 }}>
          Il calendario mostra opportunità Smart Pairing solo quando arrivano da disponibilità reali del backend. Se non ci sono slot confermati, puoi inviare una richiesta di disponibilità.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 330px", gap: 20, alignItems: "start" }}>
        <div>
          {isContinuativePlan && (
            <div style={{ marginBottom: 14, padding: "13px 15px", borderRadius: 12, background: "rgba(232,87,26,.08)", border: "1px solid rgba(232,87,26,.22)", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 10 }}>
              {[{ l: "Piano", v: planLabel }, { l: "Campagne/mese", v: data.campaignsPerMonth || 1 }, { l: "Totale campagne", v: totalCampaigns }].map(({ l, v }) => (
                <div key={l} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,.05)" }}>
                  <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>{l}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 700, color: C.white }}>{v}</div>
                </div>
              ))}
              <div style={{ gridColumn: "1 / -1", fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.45 }}>
                Per piani continuativi, lo Smart Pairing mostra solo abbinamenti compatibili confermati dal backend. Se non trovi slot adatti, invia una richiesta e il team ti avviserà quando ci sono campagne compatibili.
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { c: C.green, l: "Verde: Smart Pairing stessa zona confermato" },
              { c: C.purple, l: "Viola/Blu: Smart Pairing zona compatibile confermato" },
              { c: C.orange, l: "Bordo/check: selezionato" },
              { c: "rgba(255,255,255,.08)", l: "Nessun colore: disponibilità non configurata" },
            ].map(({ c, l }) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: c, flexShrink: 0 }} />
                <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.52)" }}>{l}</span>
              </div>
            ))}
          </div>
          {realSmartPairingSlots.length === 0 && (
            <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 10, background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.2)", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.62)", lineHeight: 1.55 }}>
              Disponibilità reale non ancora configurata. Puoi inviare una richiesta. Nessuno slot Smart Pairing disponibile per questa zona nelle date selezionate.
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <button onClick={() => { if (month > 0) setMonth(m => m - 1); else { setMonth(11); setYear(y => y - 1); } }} style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: C.white, cursor: "pointer", fontSize: 14 }}>-</button>
            <span style={{ fontFamily: F.serif, fontSize: 20, color: C.white, minWidth: 165, textAlign: "center" }}>{MONTHS_FULL[month]} {year}</span>
            <button onClick={() => { if (month < 11) setMonth(m => m + 1); else { setMonth(0); setYear(y => y + 1); } }} style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: C.white, cursor: "pointer", fontSize: 14 }}>-–</button>
          </div>

          <div style={{ background: "rgba(255,255,255,.03)", borderRadius: 13, padding: 16, border: "1px solid rgba(255,255,255,.06)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 5 }}>
              {DI.map(d => <div key={d} style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.26)", textAlign: "center", padding: "3px 0", letterSpacing: ".05em" }}>{d}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
              {Array(fdow(month, year)).fill(null).map((_, i) => <div key={`e${i}`} />)}
              {Array(dim(month, year)).fill(null).map((_, i) => {
                const d = i + 1, k = `${year}-${month}-${d}`, pair = pairs[k];
const sel = selDays.includes(k);
let bg = "rgba(255,255,255,.025)", border = "1px solid rgba(255,255,255,.04)", tc = "rgba(255,255,255,.22)";
                if (sel && pair) { bg = pair.type === "same" ? "rgba(46,204,138,.25)" : "rgba(167,139,250,.22)"; border = `2px solid ${pair.type === "same" ? C.green : C.purple}`; tc = C.white; }
                else if (pair?.type === "same") { bg = "rgba(46,204,138,.1)"; border = "1px solid rgba(46,204,138,.3)"; tc = C.green; }
                else if (pair?.type === "nearby") { bg = "rgba(167,139,250,.1)"; border = "1px solid rgba(167,139,250,.3)"; tc = C.purple; }
                return (
                  <div key={d} onClick={() => toggle(d)} style={{ minHeight: isMobile ? 46 : 58, borderRadius: 8, padding: isMobile ? "6px 2px" : "8px 3px", textAlign: "center", cursor: pair ? "pointer" : "default", background: bg, border, transition: "all.14s" }}>
                    <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: sel ? 700 : 400, color: tc, marginBottom: 1 }}>{d}</div>
                    {pair && wx[d] && <div style={{ fontSize: 8 }}>{wx[d]}</div>}
                    {pair && !sel && <div style={{ fontFamily: F.sans, fontSize: 7, fontWeight: 700, color: pair.type === "same" ? C.green : C.purple, marginTop: 1 }}>-{pair.disc}%</div>}
                    {sel && <div style={{ fontSize: 7, marginTop: 1, color: C.white }}> -{pair.disc}%</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={() => { setShowRequest(v => !v); setSelDays([]); setFormSent(false); setFormError(""); }} style={{ marginTop: 14, padding: "11px 15px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Non trovo il giorno che voglio
          </button>

          {showRequest && (
            <div style={{ marginTop: 16, borderRadius: 14, padding: "20px", background: "rgba(255,255,255,.05)", border: "2px solid rgba(251,191,36,.28)" }}>
              <div style={{ fontFamily: F.serif, fontSize: 18, color: C.white, marginBottom: 6 }}>Richiedi avviso Smart Pairing</div>
              <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.48)", lineHeight: 1.55, marginBottom: 14 }}>
                Ti avviseremo via WhatsApp o Email quando lavoriamo nella tua zona o in una zona vicina compatibile.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                <input value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value }))} placeholder="Nome e Cognome" style={inputStyle} />
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <input value={form.telefono} onChange={e => setForm(f => ({...f, telefono: e.target.value }))} placeholder="WhatsApp" type="tel" style={inputStyle} />
                  <input value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value }))} placeholder="Email" type="email" style={inputStyle} />
                </div>
                <input value={form.periodo || ""} onChange={e => setForm(f => ({...f, periodo: e.target.value }))} placeholder="Periodo o giorni preferiti" style={inputStyle} />
                <textarea value={form.note || ""} onChange={e => setForm(f => ({...f, note: e.target.value }))} placeholder="Note opzionali" rows={3} style={{...inputStyle, resize: "vertical" }} />
              </div>
              {formError && <div style={{ padding: "7px 12px", borderRadius: 7, background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.28)", fontFamily: F.sans, fontSize: 11, color: C.red, marginBottom: 10 }}>{formError}</div>}
              <button className="btn" onClick={handleRequestSubmit} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Avvisami quando siete nella mia zona
              </button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "16px", border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Riepilogo selezione</div>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.5)", lineHeight: 1.7 }}>
              <b style={{ color: C.white }}>Servizio:</b> {svcLabel}<br />
              <b style={{ color: C.white }}>Zona:</b> {zoneLabel}<br />
              {periodLabel && <><b style={{ color: C.white }}>Periodo Step 1:</b> {periodLabel}<br /></>}
              <b style={{ color: C.white }}>Stato:</b> {pairingDays.length ? "Smart Pairing selezionato" : "nessuna opportunità selezionata"}
            </div>
            {selDays.length === 0 ? <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.3)", textAlign: "center", padding: "14px 0" }}>Richiedi disponibilità per questa zona.</div> :
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                {selDays.map(k => { const p = pairs[k]; return <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 9px", borderRadius: 8, background: "rgba(255,255,255,.05)", fontFamily: F.sans, fontSize: 11 }}><span style={{ color: C.white }}>{fmtDay(k)}</span><span style={{ color: p?.type === "same" ? C.green : C.purple, fontWeight: 700 }}>{p ? `Smart Pairing -${p.disc}%` : "Data richiesta"}</span></div> })}
              </div>}
          </div>

          <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "16px", border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>Riepilogo Smart Pairing</div>
            {[
              { l: "Giorni totali", v: selDays.length },
              { l: "Giorni con Smart Pairing", v: pairingDays.length, c: pairingDays.length ? C.green : undefined },
              { l: "Richiesta data diversa", v: showRequest ? "in compilazione" : "-", c: showRequest ? C.yellow : undefined },
              { l: "Sconto medio stimato", v: averagePairingDiscount ? `-${averagePairingDiscount}%` : "-", c: averagePairingDiscount ? C.green : undefined },
              maxPairingDiscount && maxPairingDiscount !== averagePairingDiscount ? { l: "Vantaggio massimo", v: `-${maxPairingDiscount}%`, c: C.green } : null,
            ].filter(Boolean).map(({ l, v, c }) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                <span style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.44)" }}>{l}</span>
                <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 700, color: c || C.white }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "16px", border: "1px solid rgba(255,255,255,.08)" }}>
            <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>Impatto preventivo</div>
            <div style={{ fontFamily: F.serif, fontSize: 28, color: averagePairingDiscount ? C.green : C.white, letterSpacing: "-1px", marginBottom: 3 }}>{averagePairingDiscount ? `-${averagePairingDiscount}%` : "calcolato in Step 4"}</div>
            {averagePairingDiscount > 0 && <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.38)", marginBottom: 8 }}>Sconto pairing stimato sul costo distribuzione. Stima attuale: -?{saved.toFixed(2)}.</div>}
            <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.34)", lineHeight: 1.55 }}>Il prezzo finale viene calcolato nello Step 4 in base a servizio, zona, quantità e date.</div>
          </div>

          <div style={{ padding: "11px 13px", borderRadius: 10, background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.16)", fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.45 }}>
            Disponibilità reale non ancora configurata. Puoi inviare una richiesta per questa zona.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: "auto" }}>
            <button className="btn" onClick={handlePrimary} disabled={selDays.length === 0}
              style={{ width: "100%", padding: "14px", borderRadius: 11, border: "none", background: selDays.length === 0 ? "rgba(255,255,255,.1)" : C.orange, color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 700, cursor: selDays.length === 0 ? "not-allowed" : "pointer", boxShadow: selDays.length ? `0 6px 18px ${C.orangeGlow}` : "none" }}>
              {selDays.length === 0 ? "Nessuno slot disponibile" : "Genera preventivo"}
            </button>
            {isContinuativePlan && <button className="btn" onClick={() => setShowRequest(true)} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "1px solid rgba(167,139,250,.28)", background: "rgba(167,139,250,.08)", color: C.purple, fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Richiedi avviso per piano continuativo</button>}
            <button className="btn" onClick={handleSkipPairing} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.035)", color: "rgba(255,255,255,.66)", fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Continua con richiesta disponibilità</button>
            <button className="btn" onClick={onBack} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "rgba(255,255,255,.42)", fontFamily: F.sans, fontSize: 13, cursor: "pointer" }}>Zona & Mappa</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step4({ data, setData, onBack, onHome, onCampaignSaved }) {
  const isMobile = useIsMobile();
const [aiOn, setAiOn] = useState(data.aiOptimizer || false);
const [sent, setSent] = useState(false);
const [emailSent, setEmailSent] = useState(false);
const [pdfBusy, setPdfBusy] = useState(false);
const [pdfError, setPdfError] = useState("");
const [confirmSyncStatus, setConfirmSyncStatus] = useState("");
const svcType = data.type || "d2d";
const isQuick = data.quickSource === "quick_quote";
const cfg = SERVICE_META[svcType] || SERVICE_META.d2d;
const col = cfg.color;
const tLabel = { d2d: "Door to Door", h2h: "Hand to Hand", b2b: "Business Distribution" }[svcType] || "N/D";
const flyerQty = data.flyerQuantity || data.qty || 0;
const pricePerThousand = QUOTE_PRICES[svcType] || 18.5;
const unitPricePerFlyer = pricePerThousand / 1000;
const zones = data.zones || [];
  const selZ = [...S2_ZONES.filter(z => zones.includes(z.id)),...(data.selectedCaps || []).map(cap => data.capDataMap?.[cap]).filter(Boolean)
  ].filter(z => !z.unavailable);
const totF = selZ.reduce((a, z) => a + z.families, 0);
const totP = selZ.reduce((a, z) => a + z.pop, 0);
const avgCov = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.coverage, 0) / selZ.length) : 0;
const avgFIdx = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.familyIdx, 0) / selZ.length) : 0;
const avgFlow = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.flowScore, 0) / selZ.length) : 0;
const avgCD = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.commDens, 0) / selZ.length) : 0;
const avgRed = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.reddito, 0) / selZ.length) : 0;
const avgStr = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.stranieri, 0) / selZ.length * 10) / 10 : 0;
const avgOcc = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.occup, 0) / selZ.length * 10) / 10 : 0;
const avgImp = selZ.reduce((a, z) => a + z.imprese, 0);
const avgIV = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.indVec, 0) / selZ.length) : 0;
const avgGM = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + (z.genderM || 49), 0) / selZ.length) : 49;
const avgGF = 100 - avgGM;
const maxOpDays = { d2d: selZ.reduce((a, z) => Math.max(a, z.operDays), 0), h2h: selZ.reduce((a, z) => Math.max(a, z.operDaysH2H), 0), b2b: selZ.reduce((a, z) => Math.max(a, z.operDaysB2B), 0) };
const selDays = data.selectedDates || data.days || [];
const realStep3Slots = Array.isArray(data.smartPairingSlots) ? data.smartPairingSlots : [];
const realStep3Pairs = Object.fromEntries(realStep3Slots.map(slot => {
      const key = slot.date || slot.day || slot.giorno;
      if (!key) return null;
      const type = slot.type === "same" || slot.matchType === "same" ? "same" : "nearby";
      const maxDisc = type === "same" ? 40 : 20;
      const rawDiscount = Number(slot.discountPercent ?? slot.discount_pct ?? slot.discount ?? 0);
      return [key, {
        type,
        disc: Math.max(0, Math.min(maxDisc, Number.isFinite(rawDiscount) ? rawDiscount : 0)),
        zone: slot.zone || slot.area || slot.comune || "Zona compatibile",
        source: slot.source || "backend",
      }];
    }).filter(Boolean));
const realSelectedPairingDiscounts = selDays.map(k => realStep3Pairs[k]?.disc).filter(v => Number(v) > 0);
const disc = realSelectedPairingDiscounts.length ? Math.round(realSelectedPairingDiscounts.reduce((a, v) => a + v, 0) / realSelectedPairingDiscounts.length) : 0;
const baseCost = flyerQty * unitPricePerFlyer;
const afterDisc = baseCost * (1 - disc / 100);
const alreadyPrinted = data.alreadyPrinted ?? data.hasFlyers === "yes";
const productionServices = [...new Set([...(data.printServices || []),...(data.extraServices || [])])].filter(s => ["stampa", "grafica"].includes(s));
const normalizeSelectedExtras = (data) => {
    const mapping = [
      { id: "tracking_gps", oldIds: ["gps", "tracking_gps"], l: "Tracking GPS", d: "Monitoraggio operativo della distribuzione con tracciamento delle attività.", icon: "", p: 25 },
      { id: "photo_proof", oldIds: ["foto", "photo_proof", "foto_localizzate"], l: "Foto localizzate", d: "Prove fotografiche con data, zona e riferimento operativo.", icon: "", p: 35 },
      { id: "advanced_report", oldIds: ["report", "advanced_report", "report_avanzato"], l: "Report avanzato", d: "Report finale più dettagliato con riepilogo operativo e indicatori principali.", icon: " ", p: 19 },
      { id: "ai_analysis", oldIds: ["ai", "ai_analysis", "analisi_ai"], l: "AI Optimizer", d: "Ottimizzazione AI di zona, copertura e raccomandazioni operative.", icon: "", p: 49 },
      { id: "printing", oldIds: ["stampa", "printing"], l: "Stampa materiale", d: "Produzione del materiale prima della distribuzione.", icon: "", p: Math.ceil((flyerQty || 10000) / 1000) * 12 },
      { id: "design", oldIds: ["grafica", "design", "preparazione_grafica"], l: "Preparazione grafica", d: "Supporto per preparazione o adattamento del file grafico.", icon: "", p: 49 },
      { id: "quality_control", oldIds: ["quality", "quality_control", "controllo_qualita"], l: "Controllo qualità", d: "Verifica aggiuntiva sulla corretta esecuzione della distribuzione.", icon: "", p: 25 },
      { id: "operator_support", oldIds: ["operator", "operator_support", "supporto_operatore"], l: "Supporto operatore", d: "Assistenza diretta per configurazione, pianificazione o conferma campagna.", icon: "", p: 39 },
      { id: "urgent_distribution", oldIds: ["urgent", "urgent_distribution", "distribuzione_urgente"], l: "Distribuzione urgente", d: "Gestione prioritaria della campagna in tempi ridotti.", icon: "", p: 0, isUrgent: true }
    ];
const currentServices = [...(data.extraServices || []),...(data.printServices || []),...(data.aiOptimizer ? ["ai"] : []),...(data.urgency === "urgent" ? ["urgent"] : [])
    ];

    return mapping.filter(ext => 
      ext.oldIds.some(oid => currentServices.includes(oid)) || 
      data[ext.id] === true || 
      (ext.id === "ai_analysis" && (data.aiOptimizer || data.aiExtraSelected))
    ).map(ext => ({
      id: ext.id,
      label: ext.l,
      description: ext.d,
      price: ext.p,
      icon: ext.icon,
      status: ext.isUrgent ? "selected" : (ext.p === 0 ? "included" : "selected"),
      isUrgent: ext.isUrgent
    }));
  };
const selectedExtras = normalizeSelectedExtras(data);
const optionalExtras = [
    { id: "gps", label: "Tracking GPS", description: "Tracciamento operativo e timeline distributori.", icon: "", price: 25 },
    { id: "foto", label: "Foto localizzate", description: "Proof fotografici con data e zona.", icon: "", price: 35 },
    { id: "report", label: "Report avanzato", description: "Report finale con indicatori e riepilogo operativo.", icon: " ", price: 19 },
    { id: "ai", label: "AI Optimizer", description: "Ottimizzazione AI di zona, copertura e raccomandazioni.", icon: "", price: 49 },
  ].filter(ext => !(data.extraServices || []).includes(ext.id));
const addOptionalExtra = (id) => setData(d => ({...d, extraServices: [...new Set([...(d.extraServices || []), id])] }));
const extraCost = selectedExtras.reduce((a, s) => a + (s.price || 0), 0);
const smartPairingDiscount = baseCost * (disc / 100);
const urgSurch = data.urgency === "urgent" ? baseCost * 0.3 : 0;
const subDiscPct = data.planDiscount || { single: 0, monthly3: 5, monthly6: 10, monthly12: 15 }[data.subscription] || 0;
const subtotalBeforePlan = baseCost - smartPairingDiscount + urgSurch;
const planDiscountAmount = subtotalBeforePlan * (subDiscPct / 100);
const total = subtotalBeforePlan - planDiscountAmount + extraCost;
const flyWRaw = { 80: 80, 115: 115, 135: 135, 170: 170, 300: 300 }[data.printGramm || data.flyerWeight] || null;
const flyW = flyWRaw ? `${flyWRaw} g/m²` : (data.printGramm || data.flyerWeight ? formatPaperWeight(data.printGramm || data.flyerWeight) : "-");
const subL = { single: "Singola", monthly3: "3 mesi", monthly6: "6 mesi", monthly12: "12 mesi" }[data.campaignPlan || data.subscription] || "-";
const isH2H = svcType === "h2h";
const isB2B = svcType === "b2b" || svcType === "business-distribution";
const hasOperationalWaypoints = (data.operationalWaypoints?.length || data.gpsPlannedPoints?.length || data.metadata?.operational_waypoints?.length || 0) > 0;
const hasZones = (data.selectedCaps && data.selectedCaps.length > 0) || (data.selectedComuni && data.selectedComuni.length > 0) || zones.length > 0 || ((isH2H || isB2B) && hasOperationalWaypoints);
const coverageBlocked = false;
const canConfirm = Boolean(svcType && flyerQty > 0 && data.flyerFormat && hasZones && Number.isFinite(total) && !coverageBlocked);
const confirmProblem = !hasZones ? "Completa la zona" : coverageBlocked ? "quantità volantini insufficiente" : !Number.isFinite(total) ? "Totale non calcolabile" : "";
const pairingMonth = data.selectedMonth?.month ?? (data.startDate ? new Date(`${data.startDate}T00:00:00`).getMonth() : new Date().getMonth());
const pairingYear = data.selectedMonth?.year ?? (data.startDate ? new Date(`${data.startDate}T00:00:00`).getFullYear() : new Date().getFullYear());
const pairsData = realStep3Pairs;
const box = (e = {}) => ({ background: "rgba(255,255,255,.04)", borderRadius: 13, border: "1px solid rgba(255,255,255,.08)",...e });
const eur = n => `€${(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const eur4 = n => `€${(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
const cleanSource = s => truthfulSourceLabel(s || "");
const nonEmpty = arr => arr.filter(x => x && x.v !== undefined && x.v !== null && x.v !== "" && x.v !== "-");
const kpis = data.serviceKpis || {};
const step4Omi = data.metadata?.omi ?? null;
const step4AnalysisLevel = data.analysisLevel || data.metadata?.analysis_level || kpis.analysisLevel || "comune";
const step4TerritoryPluralLabel = step4AnalysisLevel === "nil" ? "Zone NIL" : "Comuni";
const zoneAllocs = data.zonesAllocation || [];
const plannedGpsPoints = data.operationalWaypoints || data.gpsPlannedPoints || data.metadata?.operational_waypoints || [];
const requiredQty = data.fullCoverageFlyers || data.requiredTotalFlyers || kpis.recommendedFlyers || zoneAllocs.reduce((a, z) => a + (z.requiredFlyers || 0), 0);
const rawRemainingQty = flyerQty - requiredQty;
const remainingQty = data.remainingFlyers ?? data.remainingQuantity ?? Math.max(0, rawRemainingQty);
const missingQty = Math.max(0, requiredQty - flyerQty);
const quantityIsSufficient = rawRemainingQty >= 0;
const selectedZoneNames = data.areaMode === "cap"
    ? (data.selectedCaps || []).map(cap => `CAP ${cap}`)
    : (() => {
        const fromData = data.selectedComuni?.length ? data.selectedComuni
          : data.selectedMunicipalities?.length ? data.selectedMunicipalities
          : null;
        if (fromData) return fromData;
        const fromAllocs = zoneAllocs.map(z => z.name).filter(Boolean);
        return fromAllocs.length ? fromAllocs : selZ.map(z => z.name);
      })();
const radiusZoneRows = !isQuick && data.radius
    ? S2_ZONES.filter(z => {
      if (selectedZoneNames.includes(z.name)) return true;
      if (!data.city?.id && !data.cityName) return false;
const cityId = data.city?.id || S2_CITIES.find(c => c.name === data.cityName)?.id;
const dist = cityId ? z.dist?.[cityId] : null;
      return dist != null && dist <= data.radius + Math.sqrt(z.area / Math.PI);
    })
    : selZ;
const breakdownRows = radiusZoneRows.map(z => {
    const isCapZone = (z.id || "").startsWith("cap_");
    const alloc = zoneAllocs.find(a => a.id === z.id);
    const selectedRow = isCapZone || Boolean(alloc) || zones.includes(z.id);
    const estimatedFlyers = alloc?.assignedFlyers ?? (selectedRow ? (svcType === "d2d" ? getZoneFullCoverageFlyers(z) : z.families) : null);
    const coveragePercent = alloc?.coveragePercent ?? (selectedRow ? z.coverage : null);
    const contribution = requiredQty > 0 && selectedRow ? Math.round(((alloc?.requiredFlyers || estimatedFlyers || 0) / requiredQty) * 100) : null;
    return {...z, alloc, selectedRow, estimatedFlyers, coveragePercent, contribution };
  });
const mainAreaLabel = data.cityName || data.comune || selectedZoneNames[0] || "l'area selezionata";
const estimatedFamiliesForSummary = svcType === "d2d" ? (kpis.families ?? totF) : null;
const coverageForSummary = svcType === "d2d" ? (kpis.coverage ?? avgCov) : null;
const operationalSummary = svcType === "d2d" ? (quantityIsSufficient
    ? `La campagna copre ${mainAreaLabel} con una stima di ${estimatedFamiliesForSummary.toLocaleString("it-IT", { useGrouping: true })} famiglie e ${coverageForSummary}% di copertura. La quantità inserita è sufficiente; restano ${remainingQty.toLocaleString("it-IT", { useGrouping: true })} volantini disponibili per estensione zona o scorta operativa.`
    : `La quantità inserita non copre completamente l'area selezionata. Mancano ${missingQty.toLocaleString("it-IT", { useGrouping: true })} volantini per raggiungere la copertura stimata.`)
    : svcType === "h2h"
      ? `La campagna Hand to Hand copre ${mainAreaLabel} con ${formatNumber(kpis.poi)} POI rilevanti, ${formatNumber(kpis.operationalZones || kpis.hotspotCount)} hotspot e ${formatNumber(kpis.gpsWaypoints || plannedGpsPoints.length)} waypoint GPS pianificati.`
      : isB2B
        ? `La campagna Business copre ${mainAreaLabel} con ${formatNumber(kpis.businesses)} attività rilevate, ${formatNumber(kpis.clusters)} cluster commerciali e ${formatNumber(kpis.targetBusinesses)} attività target.`
        : `La campagna copre ${mainAreaLabel} con i dati operativi disponibili per il servizio selezionato.`;
const selectedDatesLabel = selDays.length
    ? selDays.map(k => { const pts = k.split("-"); return `${pts[2]} ${MONTHS_SHORT[parseInt(pts[1])]}`; }).join(" – ")
    : "Nessuna data selezionata";
const serviceExtras = selectedExtras.map(e => ({
    l: e.label,
    v: e.price > 0 ? `+${eur(e.price)}` : (e.isUrgent ? "Incluso in urgenza" : "Incluso"),
    c: e.isUrgent ? C.red : (e.price > 0 ? C.blue : C.green),
    d: e.description,
    icon: e.icon,
    status: e.status
  }));
const d2dScores = [
    { l: "Family Index", v: kpis.familyIndex ?? avgFIdx, c: C.orange, d: "Qualità residenziale dell'area", src: "Analisi interna" },
    { l: "Reach Score", v: kpis.reachScore ?? (selZ.length ? Math.round(selZ.reduce((a, z) => a + z.reachD2D, 0) / selZ.length) : 0), c: C.blue, d: "Potenziale copertura famiglie", src: "Analisi interna" },
    { l: "ROI Score", v: kpis.roiScore ?? (selZ.length ? Math.round(selZ.reduce((a, z) => a + z.roiD2D, 0) / selZ.length) : 0), c: C.green, d: "Coerenza costo/opportunità", src: "Analisi interna" },
    { l: "Confidence Score", v: kpis.confidenceScore ?? (selZ.length ? Math.round(selZ.reduce((a, z) => a + z.confD2D, 0) / selZ.length) : 0), c: C.purple, d: "Affidabilità della stima", src: "Analisi interna" },
  ];
const kpisPopulation = kpis.population ?? kpis.pop ?? (totP || null);
const kpisComuniCount = kpis.comuniCount ?? data.comuniNelRaggio ?? data.selectedComuni?.length ?? data.zones?.length ?? breakdownRows.length ?? selZ.length ?? null;
const d2dAreaKm2 = kpis.area || (selZ.length ? Math.round(selZ.reduce((a, z) => a + z.area, 0) * 10) / 10 : null);
const d2dAvgDensity = d2dAreaKm2 && kpisPopulation ? Math.round(kpisPopulation / d2dAreaKm2) : null;
const d2dSummarySources = data.sources?.length ? data.sources : [];
const serviceSummaryConfig = {
    d2d: {
      title: "Output Door to Door",
      fields: [
        { l: "Famiglie stimate", v: formatNumber(kpis.families ?? totF), src: "ISTAT", c: C.orange },
        { l: "Popolazione stimata", v: formatNumber(kpisPopulation) || "—", src: "ISTAT", c: C.orange },
        { l: "Copertura stimata", v: `${kpis.coverage ?? avgCov}%`, src: "Dati geografici", c: C.green },
        { l: "Volantini consigliati", v: formatNumber(requiredQty || flyerQty), src: "Analisi interna", c: C.green },
        { l: "Volantini inseriti", v: formatNumber(flyerQty), src: "Step 1", c: C.white },
        remainingQty > 0 ? { l: "quantità residua", v: formatNumber(remainingQty), src: "Calcolo", c: C.green } : missingQty > 0 ? { l: "quantità mancante", v: formatNumber(missingQty), src: "Calcolo", c: C.red } : null,
      ],
      scores: d2dScores,
      admin: [
        { l: "Età 0-14", v: (() => { const vs = selZ.map(z => z.eta14).filter(n => n != null); return vs.length ? `${Math.round(vs.reduce((a,n) => a+n, 0)/vs.length*10)/10}%` : null; })() },
        { l: "Età 15-34", v: (() => { const vs = selZ.map(z => z.eta34).filter(n => n != null); return vs.length ? `${Math.round(vs.reduce((a,n) => a+n, 0)/vs.length*10)/10}%` : null; })() },
        { l: "Età 35-64", v: (() => { const vs = selZ.map(z => z.eta64).filter(n => n != null); return vs.length ? `${Math.round(vs.reduce((a,n) => a+n, 0)/vs.length*10)/10}%` : null; })() },
        { l: "Età 65+", v: (() => { const vs = selZ.map(z => z.eta65).filter(n => n != null); return vs.length ? `${Math.round(vs.reduce((a,n) => a+n, 0)/vs.length*10)/10}%` : null; })() },
        { l: "Reddito medio stimato", v: avgRed ? eur(avgRed).replace(",00", "") : null },
        { l: "Tasso occupazione", v: avgOcc ? `${avgOcc}%` : null },
        { l: "% stranieri", v: avgStr ? `${avgStr}%` : null },
        { l: "Indice vecchiaia", v: avgIV ? `${avgIV} anziani ogni 100 giovani` : null },
        { l: "Imprese totali", v: avgImp ? formatNumber(avgImp) : null },
      ],
      sources: d2dSummarySources,
    },
    h2h: {
      title: "Output Hand to Hand",
      fields: [
        { l: "POI rilevanti", v: formatNumber(kpis.poi), src: "Google Places", c: C.blue },
        { l: "Fermate / stazioni", v: formatNumber(kpis.transitStops), src: "Trasporto pubblico / GTFS", c: C.purple },
        { l: "Scuole / eventi", v: formatNumber(kpis.schoolsEvents), src: "Analisi interna", c: C.green },
        { l: "Flusso potenziale", v: kpis.flowScore != null ? `${kpis.flowScore}/100` : null, src: "Analisi interna", c: C.blue },
        { l: "Densità passaggio", v: kpis.passageDensity != null ? `${kpis.passageDensity}/100` : null, src: "Analisi interna", c: C.orange },
        { l: "Fasce consigliate", v: kpis.suggestedWindows, src: "Analisi interna", c: C.white },
      ],
      scores: [
        { l: "Reach Score", v: kpis.reachScore, c: C.blue, d: "Esposizione stimata" },
        { l: "ROI Score", v: kpis.roiScore, c: C.green, d: "Efficienza area/flusso" },
        { l: "Confidence Score", v: kpis.confidenceScore, c: C.orange, d: "Affidabilità della stima" },
      ],
      admin: [
        { l: "Hotspot principale", v: kpis.strongestHotspot },
        { l: "Attività vicine", v: kpis.nearbyBiz ? formatNumber(kpis.nearbyBiz) : null },
        { l: "Forza hotspot", v: kpis.hotspotStrength != null ? `${kpis.hotspotStrength}/100` : null },
      ],
    sources: data.sources?.length ? data.sources : [],
    },
    b2b: {
      title: "Output Business Distribution",
      fields: [
        { l: "Attività rilevate", v: formatNumber(kpis.businesses), src: "Google Places", c: C.purple },
        { l: "Categorie principali", v: kpis.categories || kpis.dominantProfile, src: "Google Places", c: C.blue },
        { l: "Competitor", v: formatNumber(kpis.competitors), src: "Google Places", c: C.red },
        { l: "Cluster commerciali", v: formatNumber(kpis.clusters), src: "Analisi interna", c: C.purple },
        { l: "Commercial Density Index", v: kpis.cdIdx != null ? `${kpis.cdIdx}/100` : null, src: "Analisi interna", c: C.orange },
        { l: "Attività target", v: formatNumber(kpis.targetBusinesses), src: "Google Places", c: C.green },
      ],
      scores: [
        { l: "Reach Score", v: kpis.reachScore, c: C.blue, d: "Potenziale raggiungimento target" },
        { l: "ROI Score", v: kpis.roiScore, c: C.green, d: "Efficienza commerciale" },
        { l: "Confidence Score", v: kpis.confidenceScore, c: C.orange, d: "Affidabilità della stima" },
      ],
      admin: [
        { l: "Profilo commerciale", v: kpis.dominantProfile },
        { l: "Zona più forte", v: kpis.strongestZone },
        { l: "Reddito medio stimato", v: kpis.avgIncome ? eur(kpis.avgIncome).replace(",00", "") : null },
      ],
      sources: data.sources?.length ? data.sources : [],
    },
  }[svcType] || {};
  if (svcType === "d2d") {
    serviceSummaryConfig.admin = [
      { l: "Famiglie stimate", v: formatNumber(kpis.families ?? totF), src: "ISTAT" },
      { l: "Popolazione stimata", v: formatNumber(kpisPopulation) || "dato non disponibile", src: "ISTAT" },
      { l: "Superficie analizzata", v: d2dAreaKm2 ? formatAreaKm2(d2dAreaKm2) : null, src: "Dati geografici / PostGIS" },
      { l: "Densità media", v: d2dAvgDensity ? `${formatNumber(d2dAvgDensity)} ab./km²` : null, src: "ISTAT" },
      { l: `${step4TerritoryPluralLabel} nel raggio`, v: kpisComuniCount != null ? formatNumber(kpisComuniCount) : null, src: "Dati geografici / PostGIS" },
    ];
    serviceSummaryConfig.sources = d2dSummarySources;
  }
  const fieldCard = ({ l, v, src, c = C.white }) => (
    <div key={l} style={{ padding: "10px 11px", background: "rgba(255,255,255,.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,.055)" }}>
      <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{l}</div>
      <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: c }}>{v || "Dato non disponibile"}</div>
      {src && <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.26)", marginTop: 4 }}>{cleanSource(src)}</div>}
    </div>
  );
const slug = value => (value || "preventivo").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const quoteDate = new Date().toISOString().slice(0, 10);
const pdfFileName = `volantinipro-preventivo-${slug(tLabel)}-${slug(mainAreaLabel)}-${quoteDate}.pdf`;
const pdfMunicipalities = breakdownRows.map(row => ({
    name: row.name,
    status: row.selectedRow
      ? row.alloc?.allocationStatus === "full" || row.coveragePercent >= 100 ? "Selezionato – copertura completa" : "Selezionato – copertura parziale"
      : "Nel raggio, non selezionato",
    estimatedFlyers: row.estimatedFlyers,
    coveragePct: row.coveragePercent,
    contributionPct: row.contribution,
  }));
const pdfPlanningRows = selDays.map(k => {
    const p = pairsData[k] || null;
const pts = k.split("-");
    return {
      date: `${pts[2]} ${MONTHS_SHORT[parseInt(pts[1])]}`,
      pair: p,
    };
  });
const quotePdfData = {
    quoteId: data.quoteId || data.id,
    generatedAt: new Date().toISOString(),
    status: sent ? "Preventivo confermato" : isQuick ? "Stima indicativa" : "Preventivo stimato",
    service: tLabel,
    campaign: {
      variant: svcType === "d2d" ? data.distributionVariant || data.residentialType || data.coverageType || "Copertura residenziale" : null,
      quantity: flyerQty,
      format: (data.flyerFormat || data.format || "").toUpperCase(),
      grammage: flyW !== "-" ? flyW : null,
      materialStatus: alreadyPrinted ? "già stampato" : "Da produrre",
      graphicStatus: data.graphicsReady === true || data.designReady === true ? "File disponibile" : data.needGraphic || productionServices.includes("grafica") ? "File da preparare" : "Non specificato",
      plan: subL,
      campaignsPerMonth: data.subscription && data.subscription !== "single" ? data.campaignsPerMonth || 1 : null,
      duration: data.subscription && data.subscription !== "single" ? subL : null,
      areaMode: data.areaMode || null,
    },
    area: {
      mainArea: mainAreaLabel,
      areaMode: data.areaMode || "comune",
      selectedCaps: data.selectedCaps || [],
      capAnalysis: data.capAnalysis || [],
      radiusKm: data.areaMode === "cap" ? null : data.radius,
      coveredAreaKm2: kpis.area || (selZ.length ? Math.round(selZ.reduce((a, z) => a + z.area, 0) * 10) / 10 : null),
      selectedMunicipalities: selectedZoneNames,
      selectionMode: data.allocationMode === "manual" ? "Manuale" : "Auto",
    },
    outputs: {
      estimatedFamilies: svcType === "d2d" ? (kpis.families ?? totF) : null,
      estimatedPopulation: svcType === "d2d" ? kpisPopulation : null,
      estimatedCoverage: svcType === "d2d" ? (kpis.coverage ?? avgCov) : null,
      recommendedFlyers: svcType === "d2d" ? (requiredQty || null) : null,
      fullCoverageFlyers: svcType === "d2d" ? (requiredQty || null) : null,
      insertedFlyers: flyerQty,
      remainingFlyers: quantityIsSufficient ? remainingQty : 0,
      missingFlyers: missingQty,
      coverageStatus: quantityIsSufficient ? "sufficient" : "partial",
    },
    quantityExplanation: quantityIsSufficient
      ? "La quantità consigliata copre l'area selezionata. Eventuali volantini residui possono essere usati per ampliare il raggio, aggiungere comuni vicini o mantenere una scorta operativa."
      : `La quantità inserita non copre completamente l'area selezionata. Mancano ${missingQty.toLocaleString("it-IT", { useGrouping: true })} volantini per raggiungere la copertura stimata.`,
    municipalities: pdfMunicipalities,
    scores: (serviceSummaryConfig.scores || []).filter(s => s?.v != null).map(s => ({ label: s.l, value: s.v, description: s.d })),
    adminInfo: (serviceSummaryConfig.admin || []).filter(i => i?.v).map(i => ({ label: i.l, value: i.v })),
    omi: svcType === "d2d" && step4Omi?.available ? { municipality: step4Omi.municipality, zone_name: step4Omi.zone_name, values: step4Omi.values || [], source: step4Omi.source || "Agenzia delle Entrate – OMI" } : null,
    extras: selectedExtras.map(e => ({
      id: e.id,
      label: e.label,
      description: e.description,
      price: e.price,
      status: e.status === "included" ? "Incluso" : "Selezionato"
    })),
    aiAnalysis: {
      enabled: selectedExtras.some(e => e.id === "ai_analysis"),
      serviceType: svcType,
      mainArea: mainAreaLabel,
    },
    planning: {
      selectedDates: pdfPlanningRows.map(r => r.date),
      availabilityLabel: disc > 0 ? "Smart Pairing confermato dal backend" : "Smart Pairing non disponibile per questa configurazione.",
      smartPairingApplied: disc > 0,
      smartPairingDiscountPct: disc > 0 ? disc : null,
      operationalWaypoints: plannedGpsPoints,
      compatibleZone: pdfPlanningRows.find(r => r.pair)?.pair ? `${pdfPlanningRows.find(r => r.pair).pair.zone} – ${pdfPlanningRows.find(r => r.pair).pair.type === "same" ? "stessa zona" : "zona vicina"}` : null,
    },
    pricing: {
      lines: [{ label: `Distribuzione ${tLabel}`, detail: `${flyerQty.toLocaleString("it-IT", { useGrouping: true })} volantini  - ${eur4(unitPricePerFlyer)}`, quantity: flyerQty, unitPrice: unitPricePerFlyer, total: baseCost }],
      subtotal: baseCost,
      extras: selectedExtras.map(e => ({ label: e.label, amount: e.price, status: e.status })),
      discounts: [
        disc > 0 ? { label: `Smart Pairing -${disc}%`, amount: smartPairingDiscount, percentage: disc } : null,
        subDiscPct > 0 ? { label: `Piano -${subDiscPct}%`, amount: planDiscountAmount, percentage: subDiscPct } : null,
      ].filter(Boolean),
      total,
    },
    sources: svcType === "d2d" ? d2dSummarySources : (serviceSummaryConfig.sources || []),
  };
function handleDownloadPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError("");
    try {
      printQuotePdf(quotePdfData);
    } catch (err) {
      setPdfError("Non è stato possibile aprire il preventivo. Controlla che i popup siano abilitati.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleConfirmCampaign() {
    if (!canConfirm) return;
    setSent(true);
    setConfirmSyncStatus(hasSupabaseConfig() ? "Salvataggio campagna in corso..." : "Backend non configurato: puoi scaricare il PDF o inviare una richiesta disponibilità.");
    if (!hasSupabaseConfig()) {
      return;
    }
    try {
      const savedCampaign = await saveCampaign({
        service_type: svcType,
        status: "confermata",
        city_name: data.cityName || data.searchedLocation || mainAreaLabel,
        zone_ids: zones,
        flyer_quantity: flyerQty,
        flyer_format: data.flyerFormat,
        start_date: data.startDate || data.campaignPeriodStart || null,
        end_date: data.endDate || data.campaignPeriodEnd || null,
        smart_pairing_discount: disc,
        total_amount: Number(total.toFixed(2)),
        metadata: {
          selected_comuni: selectedZoneNames,
          selected_dates: selDays,
          extra_services: selectedExtras.map(e => e.id),
          pricing: quotePdfData.pricing,
          service_kpis: kpis,
          operational_waypoints: plannedGpsPoints,
          source: data.quickSource || "configurator",
        },
      });
const id = savedCampaign?.[0]?.id;
const savedRow = savedCampaign?.[0] || {};
      sendEmailConferma({
        cliente: { email: savedRow.metadata?.client_email || "", nome: savedRow.metadata?.client_name || "Cliente" },
        campagna: {
          servizio: tLabel,
          zona: mainAreaLabel,
          totale_euro: Number(total.toFixed(2)),
          causale_bonifico: savedRow.causale_bonifico || `VP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(id || "REQ001").slice(0, 6).toUpperCase()}`,
        },
      }).catch(err => console.warn("Email conferma bonifico non inviata", err));
      setConfirmSyncStatus(id ? `Campagna salvata su Supabase (${id.slice(0, 8)}).` : "Campagna salvata su Supabase.");
      if (id && onCampaignSaved) onCampaignSaved(id, "payment");
    } catch (err) {
      console.warn("Campaign Supabase save failed", err);
      setConfirmSyncStatus("Campagna non salvata: verifica login e variabili ambiente Supabase.");
    }
  }

  const secHead = (num, label, sub, c = col) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,.07)" }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: c, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 13, fontWeight: 700, color: C.white, flexShrink: 0 }}>{num}</div>
      <div>
        <div style={{ fontFamily: F.serif, fontSize: 18, color: C.white }}>{label}</div>
        <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.4)" }}>{sub}</div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 140px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5 }}>
            <div style={{ padding: "4px 12px", borderRadius: 100, background: `${col}18`, border: `1px solid ${col}35`, fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: col }}>{cfg.icon} {cfg.label}</div>
            {isQuick && <div style={{ padding: "4px 12px", borderRadius: 100, background: "rgba(251,191,36,.12)", border: "1px solid rgba(251,191,36,.3)", fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.yellow, textTransform: "uppercase" }}>Stima indicativa</div>}
            <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.3)" }}>Preventivo – {isQuick ? "Rapido" : "Riepilogo completo"}</div>
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: 28, color: C.white, letterSpacing: "-1px" }}>{isQuick ? "Preventivo Rapido" : "Riepilogo campagna"}</h2>
          {isQuick && <p style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.45)", marginTop: 6 }}>Questo preventivo è stato generato con dati parziali. Il prezzo finale può variare dopo l'analisi zona completa.</p>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 290px", gap: 16, paddingBottom: isMobile ? 96 : 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{...box(), padding: "18px" }}>
            {secHead("1", "Tipo campagna", "Servizio, volantino, quantità, piano", C.orange)}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 8 }}>
              {nonEmpty([
                { icon: cfg.icon, l: "Servizio", v: tLabel, c: col },
                svcType === "d2d" && { icon: "", l: "Variante", v: data.distributionVariant || data.residentialType || data.coverageType || "Copertura residenziale", c: C.orange },
                { icon: "", l: "Zona/Comune", v: data.comune || data.cityName || "-", c: C.white },
                { icon: "", l: "quantità", v: flyerQty.toLocaleString("it-IT", { useGrouping: true }) + " pz.", c: C.white },
                { icon: "", l: "Formato", v: (data.flyerFormat || data.format || "-").toUpperCase(), c: C.green },
                { icon: "", l: "Materiale", v: alreadyPrinted ? "già stampato" : "Da produrre", c: alreadyPrinted ? C.green : C.blue },
                !alreadyPrinted && { icon: "", l: "Grammatura", v: flyW, c: C.green },
                { icon: "", l: "Grafica", v: data.graphicsReady === true || data.designReady === true ? "File già disponibile" : data.needGraphic || productionServices.includes("grafica") ? "File da preparare" : null, c: C.purple },
                isH2H && { icon: "", l: "Luogo", v: data.distributionLocation || "-", c: C.blue },
                isB2B && { icon: "", l: "Consegna", v: B2B_DELIVERY_TYPES.find(o => o.value === data.deliveryType)?.label || "-", c: C.purple },
                { icon: "", l: "Piano", v: subL, c: subDiscPct > 0 ? C.orange : C.white },
                (data.subscription && data.subscription !== "single") && { icon: "", l: "Campagne/mese", v: data.campaignsPerMonth || 1, c: C.orange },
                (data.subscription && data.subscription !== "single") && { icon: "", l: "Durata", v: subL, c: C.orange },
                (data.subscription && data.subscription !== "single") && { icon: "", l: "quantità/campagna", v: flyerQty.toLocaleString("it-IT", { useGrouping: true }) + " pz.", c: C.white },
                (data.subscription && data.subscription !== "single") && { icon: "", l: "Area piano", v: data.recurringAreaMode || "Area fissa", c: C.white },
                (data.subscription && data.subscription !== "single") && { icon: "", l: "Calendario", v: data.recurringCalendarMode || "Flessibile", c: C.white },
              ]).map(({ icon, l, v, c }) => (
                <div key={l} style={{ padding: "10px 11px", background: "rgba(255,255,255,.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,.055)" }}>
                  <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11 }}>{icon}</span>
                    <span style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.3)", textTransform: "uppercase" }}>{l}</span>
                  </div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{...box(), padding: "18px" }}>
            {secHead("2", "Analisi zona & output servizio", "Dati territoriali e operativi generati in Step 2", col)}
            {isQuick ? (
              <div style={{ padding: "14px", borderRadius: 10, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.42)", lineHeight: 1.55 }}>
                Preventivo rapido: il dettaglio completo di KPI, comuni e profilo demografico sarà disponibile dopo l'analisi zona completa.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Area selezionata</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 8 }}>
                    {nonEmpty([
                      { l: "Comune / zona principale", v: data.cityName || data.comune || selectedZoneNames[0], src: "Step 2", c: C.white },
                      { l: "Modalità", v: data.areaMode === "cap" ? "CAP" : data.areaMode === "address-radius" ? "Indirizzo + raggio" : "Comune con raggio di analisi", src: "Step 2", c: col },
                      { l: "CAP selezionati", v: data.areaMode === "cap" ? (data.selectedCaps || []).join(" – ") : null, src: "Step 2", c: C.white },
                      { l: "Raggio analisi", v: data.areaMode !== "cap" && data.radius ? `${data.radius < 1 ? data.radius * 1000 + "m" : data.radius + "km"}` : null, src: "Step 2", c: C.white },
                      { l: "Superficie coperta", v: (() => { const a = kpis.area || (selZ.length ? selZ.reduce((s, z) => s + (z.area || 0), 0) : null); return a ? formatAreaKm2(a) : null; })(), src: "Dati geografici", c: C.blue },
                      { l: "Modalità selezione", v: data.allocationMode === "manual" ? "Manuale" : "Auto", src: "Step 2", c: col },
                    ]).map(fieldCard)}
                    {selectedZoneNames.length > 0 && (
                      <div style={{ padding: "10px 11px", background: "rgba(255,255,255,.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,.055)" }}>
                        <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Comuni selezionati</div>
                        <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.white }}>{selectedZoneNames.length} {selectedZoneNames.length === 1 ? "comune" : "comuni"}</div>
                        <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.45)", marginTop: 4, lineHeight: 1.55 }}>{selectedZoneNames.join(", ")}</div>
                        <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.26)", marginTop: 4 }}>Dati geografici</div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>{serviceSummaryConfig.title}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 8 }}>
                    {nonEmpty(serviceSummaryConfig.fields || []).map(fieldCard)}
                  </div>
                  {svcType === "d2d" && requiredQty > 0 && (
                    <div style={{ marginTop: 8, padding: "10px 11px", borderRadius: 10, background: quantityIsSufficient ? "rgba(46,204,138,.08)" : "rgba(232,87,26,.08)", border: `1px solid ${quantityIsSufficient ? "rgba(46,204,138,.2)" : "rgba(248,113,113,.22)"}` }}>
                      <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: quantityIsSufficient ? C.green : C.red, marginBottom: 4 }}>{quantityIsSufficient ? "quantità sufficiente" : "quantità insufficiente"}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.58)", lineHeight: 1.5 }}>
                        {quantityIsSufficient
                          ? "La quantità consigliata copre l'area selezionata. I volantini residui possono essere usati per ampliare il raggio, aggiungere comuni vicini o mantenere una scorta operativa."
                          : "La quantità inserita non copre tutta l'area stimata. Puoi aumentare la quantità oppure procedere con copertura parziale se supportata dal piano operativo."}
                      </div>
                    </div>
                  )}
                </div>

                {breakdownRows.length > 0 && (
                  <div>
                    <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>{svcType === "d2d" ? `${step4TerritoryPluralLabel} nel raggio / distribuzione` : "Zone selezionate / distribuzione"}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {breakdownRows.map(row => {
                        return (
                          <div key={row.id} style={{ padding: "9px 10px", borderRadius: 9, background: row.selectedRow ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.02)", border: `1px solid ${row.selectedRow ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.04)"}`, display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10, alignItems: "center" }}>
                            <div>
                              <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: row.selectedRow ? C.white : "rgba(255,255,255,.55)" }}>{row.name}</div>
                              <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.38)" }}>
                                {row.selectedRow
                                  ? row.alloc?.allocationStatus === "full" || row.coveragePercent >= 100 ? "Selezionato – copertura completa" : "Selezionato – copertura parziale"
                                  : "Nel raggio – non selezionato"}
                                {!row.selectedRow && " – disponibile per estensione zona"}
                              </div>
                            </div>
                            <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: row.selectedRow ? col : "rgba(255,255,255,.36)" }}>{row.estimatedFlyers != null ? `${row.estimatedFlyers.toLocaleString("it-IT", { useGrouping: true })} volantini` : "Estensione"}</div>
                            <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: row.coveragePercent >= 100 ? C.green : row.coveragePercent != null ? C.orange : "rgba(255,255,255,.35)" }}>{row.coveragePercent != null ? `${Math.min(100, row.coveragePercent)}%` : "-"}</div>
                            <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.42)" }}>{row.contribution != null ? `${row.contribution}%` : "-"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Indicatori servizio</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
                    {nonEmpty(serviceSummaryConfig.scores || []).map(s => (
                      <div key={s.l} style={{ padding: "10px 11px", borderRadius: 10, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.055)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.36)" }}>{s.l}</span>
                          <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 900, color: s.c }}>{s.v}/100</span>
                        </div>
                        <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.43)", lineHeight: 1.4 }}>{s.d}</div>
                        {s.src && <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.24)", marginTop: 4 }}>{cleanSource(s.src)}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Profilo demografico / ISTAT</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 8 }}>
                    {nonEmpty(serviceSummaryConfig.admin || []).map(fieldCard)}
                  </div>
                  {false && svcType === "d2d" && (
                    <div style={{ marginTop: 7, fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.34)", lineHeight: 1.45 }}>
                      "Imprese totali- e mostrato come contesto territoriale secondario: la valutazione Door to Door resta basata su famiglie, copertura e profilo residenziale.
                    </div>
                  )}
                  {svcType === "d2d" && (
                    <div style={{ marginTop: 7, fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.34)", lineHeight: 1.45 }}>
                      Copertura dati reale attiva per la Lombardia. Indicatori non ancora disponibili in questa vista: fasce et, % stranieri, tasso occupazione, reddito medio, imprese totali e codice catastale.
                    </div>
                  )}
                </div>

                {svcType === "d2d" && step4Omi?.available && (
                  <div>
                    <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Valori immobiliari OMI</div>
                    <div style={{ padding: "12px 13px", borderRadius: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                        {step4Omi.municipality && (
                          <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(96,165,250,.12)", border: "1px solid rgba(96,165,250,.22)", fontFamily: F.sans, fontSize: 9, color: C.blue }}>{step4Omi.municipality}</span>
                        )}
                        {step4Omi.zone_name && (
                          <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.65)" }}>Zona: {step4Omi.zone_name}</span>
                        )}
                      </div>
                      {(step4Omi.values || []).slice(0, 3).map((tv, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: i > 0 ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                          <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.55)" }}>{tv.typology}</span>
                          <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.white }}>{formatNumber(tv.min_value)}–{formatNumber(tv.max_value)} €/mq</span>
                        </div>
                      ))}
                      {(step4Omi.values || []).length > 3 && (
                        <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.38)", marginTop: 6 }}>+{step4Omi.values.length - 3} altre tipologie</div>
                      )}
                      <div style={{ fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,.28)", marginTop: 8 }}>Fonte: Agenzia delle Entrate – OMI</div>
                    </div>
                  </div>
                )}

                <div style={{ padding: "11px 12px", borderRadius: 11, background: `${col}10`, border: `1px solid ${col}24`, fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.62)", lineHeight: 1.55 }}>
                  {operationalSummary}
                </div>

                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Fonti dati</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {(serviceSummaryConfig.sources || []).map(s => (
                      <span key={s} style={{ padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.06)", fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.52)" }}>{cleanSource(s)}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{...box(), padding: "18px" }}>
            {secHead("3", "Servizi extra selezionati", "Opzioni aggiuntive incluse nel preventivo", C.purple)}
            {selectedExtras.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 10, fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.34)" }}>
                Nessun servizio extra selezionato per questa campagna.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                {selectedExtras.map(ext => (
                  <div key={ext.id} style={{ padding: "14px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", display: "flex", gap: 14, alignItems: "start" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${ext.price === 0 && !ext.isUrgent ? C.green : (ext.isUrgent ? C.red : C.blue)}15`, border: `1px solid ${ext.price === 0 && !ext.isUrgent ? C.green : (ext.isUrgent ? C.red : C.blue)}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                      {ext.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontFamily: F.serif, fontSize: 16, color: C.white }}>{ext.label}</span>
                        <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: ext.price === 0 && !ext.isUrgent ? C.green : (ext.isUrgent ? C.red : C.blue), padding: "2px 8px", borderRadius: 6, background: `${ext.price === 0 && !ext.isUrgent ? C.green : (ext.isUrgent ? C.red : C.blue)}10` }}>
                          {ext.price > 0 ? eur(ext.price) : (ext.isUrgent ? "Urgente" : "Incluso")}
                        </span>
                      </div>
                      <p style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.45)", lineHeight: 1.5, marginBottom: 8 }}>{ext.description}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
                        <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(46,204,138,.8)", textTransform: "uppercase", letterSpacing: ".05em" }}>{ext.status === "included" ? "Incluso nel preventivo" : "Extra selezionato"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedExtras.some(e => e.id === "ai_analysis") && (
              <div style={{ marginTop: 14, padding: "14px", borderRadius: 12, background: "rgba(46,204,138,.06)", border: "1px solid rgba(46,204,138,.18)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}></span>
                  <span style={{ fontFamily: F.serif, fontSize: 16, color: C.green }}>Analisi AI della campagna</span>
                </div>
                <p style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)", lineHeight: 1.6 }}>
                  Report AI incluso nel preventivo se selezionato. Le raccomandazioni verranno generate solo dai dati disponibili della configurazione, dell'area e della campagna.
                </p>
              </div>
            )}
            {optionalExtras.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Optional disponibili</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 8 }}>
                  {optionalExtras.map(ext => (
                    <div key={ext.id} style={{ padding: "11px", borderRadius: 10, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)", display: "grid", gap: 7 }}>
                      <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                        <span style={{ fontSize: 17 }}>{ext.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.white }}>{ext.label}</div>
                          <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.38)" }}>{ext.description}</div>
                        </div>
                        <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.orange }}>+{eur(ext.price)}</span>
                      </div>
                      <button onClick={() => addOptionalExtra(ext.id)} style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${C.orange}35`, background: `${C.orange}12`, color: C.orange, fontFamily: F.sans, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>Aggiungi al preventivo</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selZ.length > 0 && svcType !== "d2d" && (
              <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(96,165,250,.07)", border: "1px solid rgba(96,165,250,.18)", fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.55)", lineHeight: 1.45 }}>
                {svcType === "h2h"
                  ? "Hand to Hand richiede meno volantini: la distribuzione avviene su passanti e hotspot ad alto flusso, non su tutte le cassette postali."
                  : "Business Distribution usa quantità mirate: il conteggio si basa su attività target e cluster commerciali, non su copertura residenziale completa."}
              </div>
            )}
          </div>

          <div style={{...box(), padding: "18px" }}>
            {secHead("4", "Pianificazione campagna", "Date selezionate e opportunità disponibili", C.green)}
            {data.smartPairingRequestSent
              ? <div style={{ padding: "14px", fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.58)", background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)", borderRadius: 10, lineHeight: 1.6 }}>
                <b style={{ color: C.yellow }}>Richiesta data diversa inviata.</b><br />
                Periodo preferito: {data.contactRequestData?.periodo || "Dato non disponibile"}<br />
                Ti avviseremo via WhatsApp o Email.
              </div>
              : selDays.length === 0
                ? <div style={{ padding: "14px", textAlign: "center", fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.42)", background: "rgba(255,255,255,.03)", borderRadius: 10 }}>Nessuna data selezionata. Potrai definire o confermare la pianificazione con il team.</div>
                : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 4 }}>
                      {nonEmpty([
                        selDays.length > 1 && { l: "Date selezionate", v: selectedDatesLabel, src: "Step 3", c: C.white },
                        { l: "Disponibilità", v: disc > 0 ? "opportunità backend confermata" : "Richiesta disponibilità", src: "Step 3", c: disc > 0 ? C.green : C.white },
                        disc > 0 && { l: "Vantaggio Smart Pairing", v: "Applicato", src: "Step 3", c: C.green },
                        disc > 0 && { l: "Sconto operativo", v: `Smart Pairing -${disc}%`, src: "Calcolo", c: C.green },
                      ]).map(fieldCard)}
                    </div>
                    {selDays.map(k => {
                      const p = pairsData[k] || null;
const pts = k.split("-");
                      return (
                        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, background: p?.type === "same" ? "rgba(46,204,138,.1)" : p ? "rgba(232,87,26,.1)" : "rgba(255,255,255,.035)", border: `1px solid ${p?.type === "same" ? "rgba(46,204,138,.25)" : p ? "rgba(232,87,26,.25)" : "rgba(255,255,255,.08)"}` }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: C.white }}>{pts[2]} {MONTHS_SHORT[parseInt(pts[1])]}</div>
                            <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.45)" }}>{p ? `Zona compatibile: ${p.zone} – ${p.type === "same" ? "stessa zona" : "zona vicina"}` : "Data richiesta, non confermata"}</div>
                          </div>
                          {p?.disc > 0 && <span style={{ padding: "3px 9px", borderRadius: 100, background: p.type === "same" ? "rgba(46,204,138,.2)" : "rgba(232,87,26,.2)", fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: p.type === "same" ? C.green : C.orange }}>-{p.disc}%</span>}
                        </div>
                      );
                    })}
                  </div>
                )
            }
          </div>
        </div>

        {/* Section */}
        <div>
          <div style={{...box(), padding: "18px", position: isMobile ? "static" : "sticky", top: 140 }}>
            <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.32)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>Preventivo & Costo</div>
            <div style={{ padding: "10px 11px", borderRadius: 10, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.06)", marginBottom: 12 }}>
              <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 4 }}>Distribuzione {tLabel}</div>
              <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.48)", lineHeight: 1.55 }}>
                {flyerQty.toLocaleString("it-IT", { useGrouping: true })} volantini  - {eur4(unitPricePerFlyer)} = <b style={{ color: C.white }}>{eur(baseCost)}</b>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
              {[
                { l: "Subtotale distribuzione", v: eur(baseCost), c: "rgba(255,255,255,.72)" },...serviceExtras,
                disc > 0 ? { l: `Smart Pairing -${disc}%`, v: `-${eur(smartPairingDiscount)}`, c: C.green } : null,
                data.urgency === "urgent" && { l: "Urgenza +30%", v: `+${eur(urgSurch)}`, c: "#FF6666" },
                subDiscPct > 0 && { l: `Piano -${subDiscPct}%`, v: `-${eur(planDiscountAmount)}`, c: C.orange },
              ].filter(Boolean).map(({ l, v, c }) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                  <span style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.5)" }}>{l}</span>
                  <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: c }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ background: `${col}10`, borderRadius: 10, padding: "12px", border: `1px solid ${col}28`, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 700, color: C.white }}>{isQuick ? "Prezzo indicativo" : "Totale stimato"}</span>
                <span style={{ fontFamily: F.serif, fontSize: 26, color: col, letterSpacing: "-1px" }}>{eur(total)}</span>
              </div>
            </div>
            {isQuick ? (
              <button className="btn" onClick={() => onHome("step1")}
                style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: col, color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 6, boxShadow: `0 8px 20px ${col}33` }}>
                Completa configurazione 
              </button>
            ) : (
              <button className="btn" disabled={!canConfirm} onClick={handleConfirmCampaign}
                style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: !canConfirm ? "rgba(255,255,255,.08)" : sent ? "rgba(46,204,138,.9)" : col, color: !canConfirm ? "rgba(255,255,255,.35)" : C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 700, cursor: canConfirm ? "pointer" : "not-allowed", marginBottom: 6 }}>
                {sent ? "Confermata" : "Conferma campagna "}
              </button>
            )}
            {sent && (
              <div style={{ marginBottom: 8, padding: "11px", borderRadius: 10, background: "rgba(46,204,138,.08)", border: "1px solid rgba(46,204,138,.22)", fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.62)", lineHeight: 1.5 }}>
                <b style={{ color: C.green }}>Campagna confermata.</b><br />
                Riceverai una email entro 1h con dettagli operativi e link dashboard campagna.
                {confirmSyncStatus && <><br />{confirmSyncStatus}</>}
              </div>
            )}
            {!canConfirm && confirmProblem && !isQuick && <div style={{ fontFamily: F.sans, fontSize: 10, color: C.red, textAlign: "center", marginBottom: 8 }}>{confirmProblem}</div>}
            <button className="btn" onClick={handleDownloadPdf} disabled={pdfBusy}
              style={{ width: "100%", padding: "10px", borderRadius: 9, border: `1px solid ${col}45`, background: `${col}12`, color: col, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: pdfBusy ? "wait" : "pointer", marginBottom: 6 }}>
              {pdfBusy ? "Generazione PDF––" : "Scarica PDF"}
            </button>
            <button className="btn" onClick={() => setEmailSent(true)}
              style={{ width: "100%", padding: "10px", borderRadius: 9, border: "1px solid rgba(46,204,138,.28)", background: "rgba(46,204,138,.08)", color: C.green, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 6 }}>
              {emailSent ? "Preventivo inviato" : "Invia preventivo via email"}
            </button>
            {emailSent && <div style={{ fontFamily: F.sans, fontSize: 10, color: C.green, textAlign: "center", marginBottom: 8 }}>Invio email reale non configurato. Scarica il PDF per condividere il preventivo.</div>}
            {pdfError && <div style={{ fontFamily: F.sans, fontSize: 10, color: C.red, textAlign: "center", marginBottom: 8 }}>{pdfError}</div>}
            <button className="btn" onClick={onBack} title="Torna a zona, date e configurazione precedente" style={{ width: "100%", padding: "9px", borderRadius: 8, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "rgba(255,255,255,.42)", fontFamily: F.sans, fontSize: 12, cursor: "pointer", marginBottom: 5 }}>Modifica configurazione</button>
            <button onClick={onHome} style={{ width: "100%", padding: "7px", borderRadius: 7, border: "none", background: "transparent", color: "rgba(255,255,255,.22)", fontFamily: F.sans, fontSize: 11, cursor: "pointer" }}>  Home</button>
          </div>
        </div>
      </div>
      {isMobile && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 220, padding: "10px 14px", background: "rgba(10,18,34,.96)", borderTop: "1px solid rgba(255,255,255,.1)", backdropFilter: "blur(14px)", boxShadow: "0 -12px 30px rgba(0,0,0,.28)" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.42)", textTransform: "uppercase", letterSpacing: ".08em" }}>{isQuick ? "Prezzo indicativo" : "Totale stimato"}</div>
              <div style={{ fontFamily: F.serif, fontSize: 22, color: col, letterSpacing: "-.4px" }}>{eur(total)}</div>
            </div>
            {isQuick ? (
              <button className="btn" onClick={() => onHome("step1")} style={{ minHeight: 48, padding: "0 16px", borderRadius: 10, border: "none", background: col, color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Completa</button>
            ) : (
              <button className="btn" disabled={!canConfirm} onClick={handleConfirmCampaign} style={{ minHeight: 48, padding: "0 16px", borderRadius: 10, border: "none", background: !canConfirm ? "rgba(255,255,255,.08)" : sent ? "rgba(46,204,138,.9)" : col, color: !canConfirm ? "rgba(255,255,255,.35)" : C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: canConfirm ? "pointer" : "not-allowed" }}>{sent ? "Confermata" : "Conferma"}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Section
// ADMIN DASHBOARD - VolantiniPro
// Section

// Mock data
const ADMIN_CAMPAIGNS = [
  { id: "C001", client: "Farmacia Centrale", svc: "d2d", zone: "Cormano – Varedo", qty: 12000, status: "active", date: "2025-05-05", total: 204.60, days: 3, discount: 40 },
  { id: "C002", client: "Bar Sport Srl", svc: "h2h", zone: "Sesto – Cinisello", qty: 8000, status: "pending", date: "2025-05-08", total: 176.00, days: 2, discount: 0 },
  { id: "C003", client: "Studio Rossi", svc: "b2b", zone: "Bresso – Cusano", qty: 5000, status: "done", date: "2025-04-28", total: 420.00, days: 1, discount: 20 },
  { id: "C004", client: "Pizzeria Napoli", svc: "d2d", zone: "Paderno Dugnano", qty: 15000, status: "active", date: "2025-05-06", total: 277.50, days: 4, discount: 30 },
  { id: "C005", client: "GymFit Center", svc: "h2h", zone: "Cinisello Balsamo", qty: 10000, status: "pending", date: "2025-05-10", total: 198.00, days: 3, discount: 0 },
  { id: "C006", client: "Ottica Bianchi", svc: "b2b", zone: "Cormano", qty: 3000, status: "done", date: "2025-04-20", total: 315.00, days: 1, discount: 0 },
  { id: "C007", client: "Supermercato OK", svc: "d2d", zone: "Varedo – Senago", qty: 20000, status: "active", date: "2025-05-04", total: 333.00, days: 5, discount: 40 },
  { id: "C008", client: "Studio Legale MT", svc: "b2b", zone: "Sesto S.G.", qty: 2000, status: "pending", date: "2025-05-12", total: 280.00, days: 1, discount: 0 },
];
const ADMIN_WAITLIST = [
  { name: "Marco Ferretti", tel: "+39 333 111 2222", email: "marco@mail.it", days: "23, 24, 25 Mag", zone: "Cormano", date: "2025-05-02" },
  { name: "Laura Conti", tel: "+39 347 222 3333", email: "laura@mail.it", days: "12, 13 Mag", zone: "Bresso", date: "2025-05-03" },
  { name: "Giuseppe Marra", tel: "+39 366 333 4444", email: "giuseppe@mail.it", days: "19, 20 Mag", zone: "Cinisello", date: "2025-05-04" },
  { name: "Anna Ricci", tel: "+39 380 444 5555", email: "anna@mail.it", days: "26, 27 Mag", zone: "Sesto", date: "2025-05-05" },
  { name: "Paolo Greco", tel: "+39 392 555 6666", email: "paolo@mail.it", days: "5, 6 Mag", zone: "Varedo", date: "2025-05-01" },
];
const ADMIN_MONTHLY = [
  { m: "Gen", rev: 1240, camp: 4 }, { m: "Feb", rev: 1680, camp: 6 }, { m: "Mar", rev: 2100, camp: 7 },
  { m: "Apr", rev: 1890, camp: 6 }, { m: "Mag", rev: 2640, camp: 8 }, { m: "Giu", rev: 0, camp: 0 },
];
const SVC_BADGE = {
  d2d: { icon: " ", label: "D2D", col: "#E8571A" },
  h2h: { icon: "", label: "H2H", col: "#60A5FA" },
  b2b: { icon: "", label: "B2B", col: "#A78BFA" },
};
const STATUS_CFG = {
  active: { label: "In distribuzione", bg: "rgba(46,204,138,.15)", col: "#2ECC8A", dot: "#2ECC8A" },
  pending: { label: "In attesa", bg: "rgba(251,191,36,.12)", col: "#FBBF24", dot: "#FBBF24" },
  done: { label: "Completata", bg: "rgba(255,255,255,.06)", col: "rgba(255,255,255,.45)", dot: "rgba(255,255,255,.3)" },
};
const ADMIN_OP_FILTERS = [
  { id: "pairing", label: "Con Smart Pairing" },
  { id: "confirm", label: "Da confermare" },
  { id: "compatible", label: "Zona compatibile" },
];
function adminCampaignZones(campaign) {
  const zoneText = (campaign.zone || "").toLowerCase();
  return S2_ZONES.filter(z => zoneText.includes(z.name.split(" ")[0].toLowerCase()));
}
function adminServiceAnalysis(campaign) {
  const zones = adminCampaignZones(campaign);
  if (!zones.length) return { rows: [], scores: [], notes: ["Dato non disponibile"], zones };
  if (campaign.svc === "d2d") {
    const families = zones.reduce((a, z) => a + z.families, 0);
const required = zones.reduce((a, z) => a + z.families, 0);
const remaining = campaign.qty - required;
    return {
      zones,
      rows: [
        { l: "Famiglie stimate", v: families.toLocaleString("it-IT", { useGrouping: true }) },
        { l: "Popolazione stimata", v: zones.reduce((a, z) => a + z.pop, 0).toLocaleString("it-IT", { useGrouping: true }) },
        { l: "Copertura stimata", v: `${Math.round(zones.reduce((a, z) => a + z.coverage, 0) / zones.length)}%` },
        { l: "Volantini consigliati", v: required.toLocaleString("it-IT", { useGrouping: true }) },
        { l: "Volantini inseriti", v: campaign.qty.toLocaleString("it-IT", { useGrouping: true }) },
        { l: remaining >= 0 ? "quantità residua" : "quantità mancante", v: Math.abs(remaining).toLocaleString("it-IT", { useGrouping: true }) },
        { l: "Comuni selezionati", v: zones.map(z => z.name).join(" – ") },
      ],
      scores: [
        { l: "Family Index", v: Math.round(zones.reduce((a, z) => a + z.familyIdx, 0) / zones.length) },
        { l: "Reach Score", v: Math.round(zones.reduce((a, z) => a + z.reachD2D, 0) / zones.length) },
        { l: "ROI Score", v: Math.round(zones.reduce((a, z) => a + z.roiD2D, 0) / zones.length) },
        { l: "Confidence Score", v: Math.round(zones.reduce((a, z) => a + z.confD2D, 0) / zones.length) },
      ],
      notes: [remaining >= 0 ? "quantità sufficiente per copertura stimata" : "quantità insufficiente da verificare"],
    };
  }
  if (campaign.svc === "h2h") {
    return {
      zones,
      rows: [
        { l: "POI rilevanti", v: zones.reduce((a, z) => a + z.poi, 0).toLocaleString("it-IT", { useGrouping: true }) },
        { l: "Fermate / stazioni", v: zones.reduce((a, z) => a + z.transitStops + z.trainStations, 0).toLocaleString("it-IT", { useGrouping: true }) },
        { l: "Scuole / eventi", v: zones.reduce((a, z) => a + (z.strongPts || 0), 0).toLocaleString("it-IT", { useGrouping: true }) },
        { l: "Flusso potenziale", v: `${Math.round(zones.reduce((a, z) => a + z.flowScore, 0) / zones.length)}/100` },
        { l: "Densità passaggio", v: `${Math.round(zones.reduce((a, z) => a + z.commDens, 0) / zones.length)}/100` },
        { l: "Hotspot consigliati", v: zones.map(z => z.hotspots).filter(Boolean).join(" – ") },
        { l: "Fasce orarie consigliate", v: zones[0]?.timeSlots || "Dato non disponibile" },
      ],
      scores: [
        { l: "Reach Score", v: Math.round(zones.reduce((a, z) => a + z.reachH2H, 0) / zones.length) },
        { l: "ROI Score", v: Math.round(zones.reduce((a, z) => a + z.roiH2H, 0) / zones.length) },
        { l: "Confidence Score", v: Math.round(zones.reduce((a, z) => a + z.confH2H, 0) / zones.length) },
      ],
      notes: ["Priorità a hotspot, transito e fasce orarie operative"],
    };
  }
  return {
    zones,
    rows: [
      { l: "Attività rilevate", v: zones.reduce((a, z) => a + z.bizTotal, 0).toLocaleString("it-IT", { useGrouping: true }) },
      { l: "Categorie principali", v: [...new Set(zones.flatMap(z => (z.topCats || "").split(" – ").filter(Boolean)))].join(" – ") },
      { l: "Competitor vicini", v: zones.reduce((a, z) => a + z.competitors, 0).toLocaleString("it-IT", { useGrouping: true }) },
      { l: "Cluster commerciali", v: zones.reduce((a, z) => a + z.clusters, 0).toLocaleString("it-IT", { useGrouping: true }) },
      { l: "Attività target", v: zones.reduce((a, z) => a + z.targetBiz, 0).toLocaleString("it-IT", { useGrouping: true }) },
      { l: "Commercial Density Index", v: `${Math.round(zones.reduce((a, z) => a + z.cdIdx, 0) / zones.length)}/100` },
    ],
    scores: [
      { l: "Reach Score", v: Math.round(zones.reduce((a, z) => a + z.reachB2B, 0) / zones.length) },
      { l: "ROI Score", v: Math.round(zones.reduce((a, z) => a + z.roiB2B, 0) / zones.length) },
      { l: "Confidence Score", v: Math.round(zones.reduce((a, z) => a + z.confB2B, 0) / zones.length) },
    ],
    notes: ["Priorità a categorie, competitor e cluster commerciali"],
  };
}
function adminCompatibleCampaign(wait) {
  if (!allowMockData) return null;
  return ADMIN_CAMPAIGNS.find(c => c.status === "active" && c.zone.toLowerCase().includes(wait.zone.split(" ")[0].toLowerCase()))
    || ADMIN_CAMPAIGNS.find(c => c.status === "active");
}
function adminCampaignHasCompatibleZone(campaign) {
  if (!allowMockData) return false;
  const zone = (campaign.zone || "").toLowerCase();
  return ADMIN_WAITLIST.some(w => zone.includes((w.zone || "").toLowerCase().split(" ")[0]));
}
function adminOperationalStatus(campaign) {
  if (campaign.status === "pending") return "Da confermare";
  if (campaign.discount > 0) return `Smart Pairing -${campaign.discount}%`;
  if (adminCampaignHasCompatibleZone(campaign)) return "Zona compatibile";
  return "Operativa";
}
function adminAnalysisPreview(campaign) {
  const analysis = adminServiceAnalysis(campaign);
const first = analysis.rows?.[0];
const second = analysis.scores?.[0];
  return [first ? `${first.l}: ${first.v}` : "Dato non disponibile", second ? `${second.l}: ${second.v}/100` : null].filter(Boolean).join(" – ");
}

// –-– ButtonConfermaPagamento –------------------------------------------------–
// Admin button that calls confirmCampaignPayment and sends confirmation email.
function ButtonConfermaPagamento({ campagnaId, clienteEmail, clienteNome, zona, onConfirmed }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [msg, setMsg]     = useState("");
const handleClick = async () => {
    if (state === "loading" || state === "done") return;
    setState("loading");
    try {
      await confirmCampaignPayment(campagnaId);
      sendEmailConferma({
        cliente: { email: clienteEmail, nome: clienteNome || "Cliente" },
        campagna: { servizio: campagnaId, zona: zona || "Campagna", dashboard_url: `${window.location.origin}/dashboard` },
        type: "pagamento_ricevuto"
      }).catch(() => {});
      setState("done");
      setMsg(`Pagamento ${campagnaId} confermato.`);
      if (onConfirmed) onConfirmed(campagnaId);
    } catch (e) {
      setState("error");
      setMsg(`Errore: ${e.message}`);
    }
  };
const btnStyle = {
    padding: "5px 9px", borderRadius: 7, fontFamily: F.sans, fontSize: 9, fontWeight: 800, cursor: state === "done" ? "default" : "pointer",
    border: state === "done" ? "1px solid rgba(46,204,138,.3)" : state === "error" ? "1px solid rgba(248,113,113,.3)" : "1px solid rgba(245,183,77,.26)",
    background: state === "done" ? "rgba(46,204,138,.12)" : state === "error" ? "rgba(248,113,113,.10)" : "rgba(245,183,77,.10)",
    color: state === "done" ? C.green : state === "error" ? C.red : C.yellow,
    whiteSpace: "nowrap", transition: "all.18s"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button onClick={handleClick} disabled={state === "done"} style={btnStyle}>
        {state === "loading" ? "..." : state === "done" ? " Confermato" : state === "error" ? "Riprova" : "Conferma"}
      </button>
      {msg && <span style={{ fontFamily: F.sans, fontSize: 8, color: state === "error" ? C.red : C.green, lineHeight: 1.3 }}>{msg}</span>}
    </div>
  );
}

function AdminDashboard({ onNav }) {
  return <RealAdminDashboard onNav={onNav} />;
  const devAdminCampaigns = allowMockData ? ADMIN_CAMPAIGNS : [];
const adminWaitlist = allowMockData ? ADMIN_WAITLIST : [];
const adminMonthly = allowMockData ? ADMIN_MONTHLY : [];
  const [campaigns, setCampaigns] = useState(devAdminCampaigns);
const [filterStatus, setFilterStatus] = useState("all");
const [filterSvc, setFilterSvc] = useState("all");
const [filterOp, setFilterOp] = useState("all");
const [expandedCampaign, setExpandedCampaign] = useState(null);
const [showNewForm, setShowNewForm] = useState(false);
const [newCamp, setNewCamp] = useState({ client: "", svc: "d2d", zone: "", qty: 10000 });
const [adminNotice, setAdminNotice] = useState("");
const totalRev = campaigns.reduce((a, c) => a + c.total, 0);
const activeCount = campaigns.filter(c => c.status === "active").length;
const doneCount = campaigns.filter(c => c.status === "done").length;
const totalQty = campaigns.reduce((a, c) => a + c.qty, 0);
const avgCPM = totalQty > 0 ? (totalRev / totalQty * 1000).toFixed(2) : "0.00";
const maxRev = Math.max(1,...adminMonthly.map(m => m.rev));
const filtered = campaigns.filter(c => filterStatus === "all" || c.status === filterStatus).filter(c => filterSvc === "all" || c.svc === filterSvc).filter(c => filterOp === "all"
      || (filterOp === "pairing" && c.discount > 0)
      || (filterOp === "confirm" && c.status === "pending")
      || (filterOp === "compatible" && adminCampaignHasCompatibleZone(c)));
const box = (e = {}) => ({ background: "rgba(255,255,255,.04)", borderRadius: 13, border: "1px solid rgba(255,255,255,.08)",...e });
const pill = (active, c = "#E8571A") => ({
    padding: "5px 12px", borderRadius: 100, cursor: "pointer", fontFamily: F.sans, fontSize: 11, fontWeight: active ? 700 : 400,
    border: `1px solid ${active ? c : "rgba(255,255,255,.1)"}`, background: active ? `${c}18` : "rgba(255,255,255,.04)",
    color: active ? c : "rgba(255,255,255,.45)", transition: "all.15s",
  });
const resetAdminFilters = () => {
    setFilterStatus("all");
    setFilterSvc("all");
    setFilterOp("all");
  };
const saveNewCampaign = () => {
    if (!newCamp.client.trim() || !newCamp.zone.trim() || !(Number(newCamp.qty) > 0)) {
      setAdminNotice("Compila cliente, zona e quantità prima di salvare.");
      return;
    }
    const qty = Number(newCamp.qty);
const price = QUOTE_PRICES[newCamp.svc] || 18.5;
const next = {
      id: `C${String(campaigns.length + 1).padStart(3, "0")}`,
      client: newCamp.client.trim(),
      svc: newCamp.svc,
      zone: newCamp.zone.trim(),
      qty,
      status: "pending",
      date: new Date().toISOString().slice(0, 10),
      total: Math.round((qty / 1000) * price * 100) / 100,
      days: Math.max(1, Math.ceil(qty / 5000)),
      discount: 0,
      stato_pagamento: "in_attesa"
    };
    setCampaigns(prev => [next,...prev]);
    setShowNewForm(false);
    setNewCamp({ client: "", svc: "d2d", zone: "", qty: 10000 });
    resetAdminFilters();
    setAdminNotice(`Campagna ${next.id} salvata in stato In attesa.`);
  };
const downloadAdminCsv = () => {
    const rows = [["id", "cliente", "servizio", "zona", "quantità", "status", "data", "totale", "sconto"],...filtered.map(c => [c.id, c.client, c.svc, c.zone, c.qty, c.status, c.date, c.total.toFixed(2), c.discount])];
const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
    a.href = url;
    a.download = "volantinipro-campagne.csv";
    a.click();
    URL.revokeObjectURL(url);
    setAdminNotice(`CSV esportato con ${filtered.length} campagne.`);
  };
const confermaPagamentoAdmin = async (id) => {
    setCampaigns(prev => prev.map(c => c.id === id ? {...c, stato_pagamento: "pagato", status: "active" } : c));
    try {
      await confirmCampaignPayment(id);
      setAdminNotice(`Pagamento ${id} confermato.`);
    } catch {
      setAdminNotice(`Pagamento ${id} non sincronizzato: Supabase non configurato o non disponibile.`);
    }
  };
const exportAdminPdfMock = () => {
    setAdminNotice("PDF preventivi disponibile dallo Step 4 per le campagne configurate.");
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 60px", minHeight: "100vh" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ padding: "3px 10px", borderRadius: 100, background: "rgba(232,87,26,.15)", border: "1px solid rgba(232,87,26,.3)", fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: C.orange }}>
              ADMIN
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.3)" }}>
              VolantiniPro – Dashboard operativa
            </div>
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: 28, color: C.white, letterSpacing: "-1px", marginBottom: 3 }}>Dashboard Admin</h2>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.38)" }}>
            Campagne – Revenue – Smart Pairing Waitlist – Gestione zona
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowNewForm(v => !v)}
            style={{ padding: "9px 18px", borderRadius: 10, border: `1px solid ${showNewForm ? C.orange : "rgba(255,255,255,.1)"}`, background: showNewForm ? `${C.orange}18` : "rgba(255,255,255,.04)", color: showNewForm ? C.orange : "rgba(255,255,255,.6)", fontFamily: F.sans, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {showNewForm ? "Chiudi" : "+ Nuova campagna"}
          </button>
          <button onClick={() => onNav("home")}
            style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.5)", fontFamily: F.sans, fontSize: 12, cursor: "pointer" }}>
              Home
          </button>
        </div>
      </div>

      {adminNotice && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(46,204,138,.08)", border: "1px solid rgba(46,204,138,.2)", fontFamily: F.sans, fontSize: 12, color: C.green }}>
          {adminNotice}
        </div>
      )}

      {/* KPI STRIP */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 18 }}>
        {[
          { icon: "", label: "Revenue totale", value: `€${totalRev.toFixed(2)}`, sub: `${campaigns.length} campagne`, col: C.orange },
          { icon: "", label: "In distribuzione", value: activeCount, sub: "campagne attive oggi", col: C.green },
          { icon: "", label: "In attesa", value: campaigns.filter(c => c.status === "pending").length, sub: "da confermare", col: C.yellow },
          { icon: "", label: "Completate", value: doneCount, sub: "questo mese", col: "rgba(255,255,255,.5)" },
          { icon: " ", label: "CPM medio", value: `€${avgCPM}`, sub: "per 1.000 volantini", col: C.blue },
        ].map(({ icon, label, value, sub, col }) => (
          <div key={label} style={{...box(), padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</span>
            </div>
            <div style={{ fontFamily: F.serif, fontSize: 26, color: col, letterSpacing: "-1px", marginBottom: 3 }}>{value}</div>
            <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.3)" }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* NUOVA CAMPAGNA FORM */}
      {showNewForm && (
        <div style={{...box(), padding: "18px", marginBottom: 18, border: "1px solid rgba(232,87,26,.25)", background: "rgba(232,87,26,.05)" }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.orange, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>+ Inserisci nuova campagna</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10, alignItems: "flex-end" }}>
            {[
              { l: "Cliente", type: "text", key: "client", ph: "es. Farmacia Centrale" },
              { l: "Zona", type: "text", key: "zone", ph: "es. Cormano – Bresso" },
              { l: "quantità", type: "number", key: "qty", ph: "10000" },
            ].map(({ l, type, key, ph }) => (
              <div key={key}>
                <label style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>{l}</label>
                <input type={type} value={newCamp[key]} onChange={e => setNewCamp(p => ({...p, [key]: e.target.value }))}
                  placeholder={ph}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.07)", color: C.white, fontFamily: F.sans, fontSize: 13 }} />
              </div>
            ))}
            <div>
              <label style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.4)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>Servizio</label>
              <select value={newCamp.svc} onChange={e => setNewCamp(p => ({...p, svc: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.12)", background: "#1a2a40", color: C.white, fontFamily: F.sans, fontSize: 13 }}>
                <option value="d2d">  Door to Door</option>
                <option value="h2h"> Hand to Hand</option>
                <option value="b2b"> Business</option>
              </select>
            </div>
            <button onClick={saveNewCampaign}
              style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Salva 
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>

        {/* Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* REVENUE CHART */}
          <div style={{...box(), padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: ".1em", textTransform: "uppercase" }}>Revenue mensile 2025</div>
              <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.4)" }}>Tot. ?{totalRev.toFixed(0)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 90 }}>
              {adminMonthly.length === 0 ? (
                <div style={{ gridColumn: "1 / -1", padding: 18, textAlign: "center", fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.45)" }}>Nessuna campagna presente.</div>
              ) : adminMonthly.map(({ m, rev, camp }) => (
                <div key={m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.4)" }}>
                    {rev > 0 ? `€${rev}` : ""}</div>
                  <div style={{
                    width: "100%", borderRadius: "4px 4px 0 0", background: rev > 0 ? C.orange : "rgba(255,255,255,.06)",
                    height: `${rev > 0 ? Math.round((rev / maxRev) * 70) + 10 : 8}px`, transition: "height.3s", position: "relative"
                  }}>
                    {camp > 0 && <div style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", fontFamily: F.sans, fontSize: 8, color: C.orange, fontWeight: 700 }}>{camp}</div>}
                  </div>
                  <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.4)" }}>{m}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: C.orange }} />
                <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.35)" }}>Revenue EUR </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.35)" }}>Numero sopra barra = campagne</span>
              </div>
            </div>
          </div>

          {/* CAMPAGNE LIST */}
          <div style={{...box(), overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: ".1em", textTransform: "uppercase" }}>
                Campagne – {filtered.length} risultati
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {[{ id: "all", l: "Tutte" }, { id: "active", l: "Attive" }, { id: "pending", l: "In attesa" }, { id: "done", l: "Completate" }].map(({ id, l }) => (
                  <button key={id} onClick={() => setFilterStatus(id)} style={pill(filterStatus === id)}>
                    {STATUS_CFG[id] ? <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: STATUS_CFG[id].dot, marginRight: 4 }} /> : null}{l}
                  </button>
                ))}
                <div style={{ width: 1, height: 20, background: "rgba(255,255,255,.1)", margin: "0 2px" }} />
                {[{ id: "all", l: "Tutti" }, { id: "d2d", l: "D2D" }, { id: "h2h", l: "H2H" }, { id: "b2b", l: "B2B" }].map(({ id, l }) => (
                  <button key={id} onClick={() => setFilterSvc(id)} style={pill(filterSvc === id, id === "d2d" ? C.orange : id === "h2h" ? C.blue : C.purple)}>
                    {id !== "all" && SVC_BADGE[id]?.icon + " "}{l}
                  </button>
                ))}
                <div style={{ width: 1, height: 20, background: "rgba(255,255,255,.1)", margin: "0 2px" }} />
                <button onClick={resetAdminFilters} style={pill(filterOp === "all" && filterStatus === "all" && filterSvc === "all", C.green)}>Reset filtri</button>
                {ADMIN_OP_FILTERS.map(({ id, label }) => (
                  <button key={id} onClick={() => setFilterOp(id)} style={pill(filterOp === id, id === "pairing" ? C.green : id === "confirm" ? C.yellow : C.blue)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 82px 118px 80px 90px 116px 96px 84px", gap: 0, padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              {["ID", "Cliente", "Servizio", "Zona", "Quantità", "Totale EUR", "Pagamento", "Stato", "Analisi"].map(h => (
                <div key={h} style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.28)", textTransform: "uppercase", letterSpacing: ".07em" }}>{h}</div>
              ))}
            </div>

            {/* Table rows */}
            {filtered.map(c => {
              const svc = SVC_BADGE[c.svc];
const sts = STATUS_CFG[c.status];
const analysis = adminServiceAnalysis(c);
const expanded = expandedCampaign === c.id;
const paymentStatus = c.stato_pagamento || (c.status === "done" ? "pagato" : "in_attesa");
              return (
                <div key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 82px 118px 80px 90px 116px 96px 84px", gap: 0, padding: "11px 16px", transition: "background.14s", background: expanded ? "rgba(255,255,255,.035)" : "transparent" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.03)"}
                    onMouseLeave={e => e.currentTarget.style.background = expanded ? "rgba(255,255,255,.035)" : "transparent"}>
                    <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.4)", fontWeight: 600 }}>{c.id}</div>
                    <div>
                      <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: C.white }}>{c.client}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)" }}>{c.date} – {c.days}gg – {adminOperationalStatus(c)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 5, background: `${svc.col}18`, fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: svc.col }}>{svc.icon} {svc.label}</span>
                    </div>
                    <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.6)", display: "flex", alignItems: "center" }}>{c.zone}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: C.white, display: "flex", alignItems: "center" }}>{c.qty.toLocaleString("it-IT", { useGrouping: true })}</div>
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontFamily: F.serif, fontSize: 15, color: C.orange }}>?{c.total.toFixed(2)}</div>
                      {c.discount > 0 && <div style={{ fontFamily: F.sans, fontSize: 9, color: C.green }}>-{c.discount}% pairing</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      {paymentStatus === "pagato" ? (
                        <div style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(95,194,124,.12)", color: C.green, border: "1px solid rgba(95,194,124,.22)", fontFamily: F.sans, fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>Pagato</div>
                      ) : (
                        <ButtonConfermaPagamento campagnaId={c.id} clienteEmail={c.email || ""} clienteNome={c.client} zona={c.zone} onConfirmed={(id) => confermaPagamentoAdmin(id)} />
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <div style={{ padding: "3px 8px", borderRadius: 6, background: sts.bg, display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: sts.dot, flexShrink: 0 }} />
                        <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 600, color: sts.col, whiteSpace: "nowrap" }}>{sts.label}</span>
                      </div>
                    </div>
                    <button onClick={() => setExpandedCampaign(expanded ? null : c.id)}
                      style={{ alignSelf: "center", justifySelf: "start", padding: "5px 8px", borderRadius: 7, border: `1px solid ${svc.col}35`, background: expanded ? `${svc.col}18` : "rgba(255,255,255,.035)", color: expanded ? svc.col : "rgba(255,255,255,.55)", fontFamily: F.sans, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                      {expanded ? "Chiudi" : "Dettagli"}
                    </button>
                  </div>
                  {expanded && (
                    <div style={{ margin: "0 16px 14px 86px", padding: "13px", borderRadius: 11, background: "rgba(255,255,255,.035)", border: `1px solid ${svc.col}24` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: svc.col, letterSpacing: ".08em", textTransform: "uppercase" }}>Dettagli analisi Step 2</div>
                          <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.42)", marginTop: 3 }}>{adminAnalysisPreview(c)}</div>
                        </div>
                        <button disabled style={{ padding: "5px 9px", borderRadius: 7, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.28)", fontFamily: F.sans, fontSize: 10, cursor: "not-allowed" }}>Apri campagna – non disponibile</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1.15fr.85fr", gap: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 7 }}>
                          {analysis.rows.map(({ l, v }) => (
                            <div key={l} style={{ padding: "8px", borderRadius: 8, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.05)" }}>
                              <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.33)", textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
                              <div style={{ fontFamily: F.sans, fontSize: 12, color: C.white, fontWeight: 700, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis" }}>{v || "Dato non disponibile"}</div>
                            </div>
                          ))}
                        </div>
                        <div>
                          <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                            {analysis.scores.map(({ l, v }) => (
                              <div key={l} style={{ display: "grid", gridTemplateColumns: "1fr 46px", gap: 8, alignItems: "center" }}>
                                <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.48)" }}>{l}</span>
                                <span style={{ fontFamily: F.sans, fontSize: 11, color: svc.col, fontWeight: 800, textAlign: "right" }}>{v}/100</span>
                                <div style={{ gridColumn: "1 / -1", height: 4, borderRadius: 4, background: "rgba(255,255,255,.07)", overflow: "hidden" }}>
                                  <div style={{ width: `${Math.max(0, Math.min(100, v))}%`, height: "100%", background: svc.col }} />
                                </div>
                              </div>
                            ))}
                          </div>
                          {analysis.notes.map(n => (
                            <div key={n} style={{ padding: "8px 9px", borderRadius: 8, background: `${svc.col}10`, border: `1px solid ${svc.col}20`, fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.62)", lineHeight: 1.35 }}>{n}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* MAPPA LIVE ZONE */}
          <div style={{...box(), overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: ".1em", textTransform: "uppercase" }}>Mappa operativa – campagne e compatibilità</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {[{ c: C.green, l: "In distribuzione" }, { c: C.yellow, l: "In attesa" }, { c: C.blue, l: "Smart Pairing" }, { c: "rgba(255,255,255,.2)", l: "Completata" }].map(({ c, l }) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                    <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.4)" }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: "linear-gradient(135deg,#081610,#080f1e)", position: "relative" }}>
              <svg viewBox="0 0 580 280" width="100%" style={{ display: "block" }}>
                <defs><pattern id="adm-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,.03)" strokeWidth=".5" /></pattern></defs>
                <rect width="100%" height="100%" fill="url(#adm-grid)" />
                {S2_ZONES.map(z => {
                  const cr = S2_CITIES.find(c => c.id === z.id); if (!cr) return null;
const p = { x: 580 / 2 + (cr.lng - 9.175) * 2800, y: 280 / 2 - (cr.lat - 45.548) * 4200 * (280 / 360) };
const activeC = campaigns.find(c => c.zone.toLowerCase().includes(z.name.split(" ")[0].toLowerCase()) && c.status === "active");
const pendC = campaigns.find(c => c.zone.toLowerCase().includes(z.name.split(" ")[0].toLowerCase()) && c.status === "pending");
const doneC = campaigns.find(c => c.zone.toLowerCase().includes(z.name.split(" ")[0].toLowerCase()) && c.status === "done");
const camp = activeC || pendC || doneC;
const compatible = adminWaitlist.some(w => z.name.toLowerCase().includes(w.zone.toLowerCase().split(" ")[0]));
const dotCol = activeC ? C.green : pendC ? C.yellow : "rgba(255,255,255,.2)";
const r = activeC ? 8 : pendC ? 6 : doneC ? 5 : 4;
const markerTitle = camp
                    ? `${camp.id} – ${camp.client}\n${SVC_BADGE[camp.svc].label} – ${camp.zone}\n${camp.qty.toLocaleString("it-IT", { useGrouping: true })} volantini – ${STATUS_CFG[camp.status].label}\nData: ${camp.date}${camp.discount > 0 ? `\nSmart Pairing: -${camp.discount}%` : ""}`
                    : `${z.name}\nNessuna campagna attiva`;
                  return (
                    <g key={z.id}>
                      <title>{markerTitle}</title>
                      {compatible && <circle cx={p.x} cy={p.y} r={r + 12} fill="none" stroke={C.blue} strokeWidth="1.2" strokeDasharray="3 3" opacity=".75" />}
                      {(activeC || pendC) && <circle cx={p.x} cy={p.y} r={r + 6} fill={dotCol} fillOpacity=".12" />}
                      <circle cx={p.x} cy={p.y} r={r} fill={dotCol} opacity={activeC || pendC ? 1 :.4} />
                      <text x={p.x} y={p.y - 11} textAnchor="middle" fontFamily={F.sans} fontSize="8.5"
                        fill={activeC ? C.green : pendC ? C.yellow : "rgba(255,255,255,.3)"} fontWeight={activeC || pendC ? "700" : "400"}>
                        {z.name.split(" ")[0]}
                      </text>
                      {camp && (
                        <text x={p.x} y={p.y + 14} textAnchor="middle" fontFamily={F.sans} fontSize="7.5" fill={SVC_BADGE[camp.svc].col}>
                          {SVC_BADGE[camp.svc].icon} {camp.id}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Section */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* SMART PAIRING WAITLIST */}
          <div style={{...box(), overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: ".1em", textTransform: "uppercase" }}>Smart Pairing Waitlist</div>
                <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.3)", marginTop: 1 }}>{adminWaitlist.length} richieste in attesa</div>
              </div>
              <div style={{ padding: "3px 9px", borderRadius: 100, background: "rgba(232,87,26,.18)", fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.orange }}>{adminWaitlist.length}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {adminWaitlist.length === 0 ? (
                <div style={{ padding: 18, textAlign: "center", fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.45)" }}>Nessuna richiesta Smart Pairing presente.</div>
              ) : adminWaitlist.map((w, i) => {
                const match = adminCompatibleCampaign(w);
const svc = match ? SVC_BADGE[match.svc] : null;
                return (
                  <div key={i} style={{ padding: "11px 14px", borderBottom: "1px solid rgba(255,255,255,.04)", transition: "background.12s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.03)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: C.white }}>{w.name}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.3)" }}>{w.date}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ padding: "2px 7px", borderRadius: 5, background: "rgba(167,139,250,.1)", border: "1px solid rgba(167,139,250,.2)", fontFamily: F.sans, fontSize: 9, color: C.purple }}> {w.days}</span>
                      <span style={{ padding: "2px 7px", borderRadius: 5, background: `${C.orange}12`, border: `1px solid ${C.orange}28`, fontFamily: F.sans, fontSize: 9, color: C.orange }}> {w.zone}</span>
                      {svc && <span style={{ padding: "2px 7px", borderRadius: 5, background: `${svc.col}12`, border: `1px solid ${svc.col}25`, fontFamily: F.sans, fontSize: 9, color: svc.col }}>{svc.icon} {svc.label}</span>}
                    </div>
                    <div style={{ padding: "7px 8px", borderRadius: 8, background: "rgba(46,204,138,.08)", border: "1px solid rgba(46,204,138,.16)", marginBottom: 7 }}>
                      <div style={{ fontFamily: F.sans, fontSize: 10, color: C.green, fontWeight: 800 }}>Compatibilità operativa</div>
                      <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.55)", lineHeight: 1.35, marginTop: 2 }}>
                        {match ? `Compatibile con ${match.id} – ${match.zone} – ${match.qty.toLocaleString("it-IT", { useGrouping: true })} volantini${match.discount > 0 ? ` – potenziale -${match.discount}%` : ""}` : "Dato non disponibile"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <a href={`https://wa.me/${w.tel.replace(/\s/g, "")}`} style={{ padding: "4px 9px", borderRadius: 7, background: "rgba(37,211,102,.12)", border: "1px solid rgba(37,211,102,.25)", fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: "#25D366", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                         WhatsApp
                      </a>
                      <a href={`mailto:${w.email}`} style={{ padding: "4px 9px", borderRadius: 7, background: "rgba(96,165,250,.1)", border: "1px solid rgba(96,165,250,.2)", fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: C.blue, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                         Email
                      </a>
                      <button onClick={() => { setFilterOp("compatible"); setFilterStatus("all"); setFilterSvc("all"); }}
                        style={{ padding: "4px 9px", borderRadius: 7, border: `1px solid ${C.orange}25`, background: `${C.orange}10`, color: C.orange, fontFamily: F.sans, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Apri compatibilità</button>
                      <button disabled style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.28)", fontFamily: F.sans, fontSize: 10, cursor: "not-allowed" }}>Abbina – non disponibile</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* STATISTICHE SERVIZI */}
          <div style={{...box(), padding: "14px" }}>
            <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Mix servizi</div>
            {["d2d", "h2h", "b2b"].map(svc => {
              const svcCamps = campaigns.filter(c => c.svc === svc);
const svcRev = svcCamps.reduce((a, c) => a + c.total, 0);
const pct = Math.round((svcCamps.length / campaigns.length) * 100);
const { icon, label, col } = SVC_BADGE[svc];
              return (
                <div key={svc} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 13 }}>{icon}</span>
                      <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: C.white }}>{label}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: col }}>?{svcRev.toFixed(0)}</span>
                      <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", marginLeft: 6 }}>{svcCamps.length} camp.</span>
                    </div>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 3, transition: "width.4s" }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* AZIONI RAPIDE */}
          <div style={{...box(), padding: "14px" }}>
            <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>Azioni rapide</div>
            {[
              { icon: "", l: "Nuova campagna", action: () => setShowNewForm(true), col: C.orange },
              { icon: "", l: "Trova Smart Pairing", action: () => { setFilterOp("compatible"); setFilterStatus("all"); setFilterSvc("all"); }, col: C.green },
              { icon: "", l: "Apri analisi zona", action: () => onNav("step2"), col: C.orange },
              { icon: " ", l: "Esporta campagne operative", action: downloadAdminCsv, hint: "CSV", col: C.blue },
              { icon: "", l: "Genera PDF preventivi", action: exportAdminPdfMock, hint: "Step 4", col: C.purple },
              { icon: "", l: "Ricalcola compatibilità", disabled: true, hint: "Non ancora disponibile", col: C.green },
              { icon: "", l: "Invia avvisi batch", disabled: true, hint: "Non ancora disponibile", col: C.yellow },
            ].map(({ icon, l, action, disabled, hint, col }) => (
              <button key={l} onClick={disabled ? undefined : action} disabled={disabled}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.07)", background: "rgba(255,255,255,.03)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ?.55 : 1, marginBottom: 5, transition: "all.15s" }}
                onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = `${col}10`; }}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.03)"}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                <span style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.65)", fontWeight: 500, flex: 1, textAlign: "left" }}>{l}</span>
                <span style={{ fontFamily: F.sans, fontSize: 9, color: disabled ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.25)" }}>{hint || ""}</span>
              </button>
            ))}
          </div>

          {/* ULTIME NOTIFICHE */}
          <div style={{...box(), padding: "14px" }}>
            <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>Ultime attività</div>
            {[
              { icon: "", msg: "Campagna C007 avviata - Varedo – Senago", t: "09:14" },
              { icon: "", msg: "Compatibilità zona trovata - Paolo Greco → C007", t: "08:52" },
              { icon: "", msg: "PDF preventivo generato - C004 Pizzeria Napoli", t: "ieri" },
              { icon: "", msg: "Campagna C003 completata - Studio Rossi", t: "ieri" },
              { icon: "", msg: "quantità da verificare - C002 in attesa", t: "ieri" },
              { icon: "", msg: "Pagamento ricevuto C004 277,50€", t: "ieri" },
              { icon: "", msg: "WhatsApp inviato a 3 clienti waitlist", t: "2gg fa" },
            ].map(({ icon, msg, t }, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                <div style={{ flex: 1, fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.55)", lineHeight: 1.4 }}>{msg}</div>
                <span style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.25)", flexShrink: 0 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getSupabaseEnv() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL || "",
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ""
  };
}

function LoginPage({ onNav }) {
  const [email, setEmail] = useState("");
const [status, setStatus] = useState("");
const [busy, setBusy] = useState(false);
const { url, anonKey } = getSupabaseEnv();
const configured = Boolean(url && anonKey);
const sendMagicLink = async (e) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setStatus("Inserisci una email valida.");
      return;
    }
    if (!configured) {
      setStatus("Configura VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY in.env.local per inviare magic link reali.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(`${url}/auth/v1/otp`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          create_user: true,
          type: "magiclink",
          options: { email_redirect_to: `${window.location.origin}/dashboard` }
        })
      });
      if (!res.ok) throw new Error("magic_link_failed");
      setStatus("Magic link inviato. Controlla la tua email per entrare nella dashboard.");
    } catch {
      setStatus("Non sono riuscito a inviare il magic link. Verifica chiavi Supabase e redirect URL.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg,${C.navyDeep},${C.navyMid})`, padding: "110px 24px 80px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 16, padding: 26, boxShadow: "0 30px 70px rgba(0,0,0,.28)" }}>
        <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 12 }}>Accesso cliente</div>
        <h1 style={{ fontFamily: F.serif, fontSize: 34, color: C.white, letterSpacing: "-1px", marginBottom: 8 }}>Entra con magic link</h1>
        <p style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.5)", lineHeight: 1.6, marginBottom: 20 }}>Niente password: inserisci la tua email e riceverai un link sicuro per aprire la dashboard campagna.</p>
        <form onSubmit={sendMagicLink} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@azienda.it" style={{ width: "100%", padding: "13px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.07)", color: C.white, fontFamily: F.sans, fontSize: 14 }} />
          <button className="btn" disabled={busy} style={{ minHeight: 46, borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 800, cursor: busy ? "wait" : "pointer" }}>{busy ? "Invio in corso..." : "Invia magic link"}</button>
        </form>
        {status && <div style={{ marginTop: 14, padding: "11px 12px", borderRadius: 10, background: configured ? "rgba(46,204,138,.08)" : "rgba(251,191,36,.08)", border: `1px solid ${configured ? "rgba(46,204,138,.22)" : "rgba(251,191,36,.22)"}`, fontFamily: F.sans, fontSize: 12, color: configured ? C.green : C.yellow, lineHeight: 1.45 }}>{status}</div>}
        {!configured && <div style={{ marginTop: 12, fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.38)", lineHeight: 1.5 }}>Modalità prototipo: la pagina e il flusso sono pronti, l'invio reale parte appena inserisci le variabili ambiente Supabase.</div>}
        <button onClick={() => onNav("home")} style={{ marginTop: 18, border: "none", background: "transparent", color: "rgba(255,255,255,.38)", fontFamily: F.sans, fontSize: 12, cursor: "pointer" }}>Torna alla homepage</button>
      </div>
    </div>
  );
}

function DashboardPage({ onNav }) {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vp_supabase_session") || "null"); } catch { return null; }
  });
const { cliente } = useCliente();
const { campagne, loading, error } = useCampagne();

  useEffect(() => {
    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
const accessToken = hash.get("access_token");
    if (accessToken) {
      const next = {
        accessToken,
        refreshToken: hash.get("refresh_token"),
        expiresAt: hash.get("expires_at"),
        tokenType: hash.get("token_type") || "bearer"
      };
      localStorage.setItem("vp_supabase_session", JSON.stringify(next));
      setSession(next);
      window.history.replaceState(null, "", "/dashboard");
    }
  }, []);

  useEffect(() => {
    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    if (hasSupabaseConfig() && !session && !hash.get("access_token")) onNav("login");
  }, [session]);
const logout = () => {
    localStorage.removeItem("vp_supabase_session");
    setSession(null);
    onNav("login");
  };
const statusCfg = {
    confermata: ["Confermata", C.yellow],
    in_preparazione: ["In preparazione", C.orange],
    in_distribuzione: ["In distribuzione", C.green],
    completata: ["Completata", C.blue],
  };
const svcCfg = {
    d2d: ["D2D", C.orange],
    h2h: ["H2H", C.blue],
    b2b: ["B2B", C.purple],
  };
const activeCount = campagne.filter(c => ["confermata", "in_preparazione", "in_distribuzione"].includes(c.stato)).length;
const waitingPaymentCount = campagne.filter(c => c.stato_pagamento !== "pagato").length;
const totalSpent = campagne.reduce((a, c) => a + Number(c.totale_euro || 0), 0);
const flyersDone = campagne.reduce((a, c) => a + Number(c.volantini_distribuiti || 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: C.navyMid, padding: "105px 24px 80px" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.green, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 10 }}>Dashboard cliente</div>
            <h1 style={{ fontFamily: F.serif, fontSize: 34, color: C.white, letterSpacing: "-1px" }}>Ciao {cliente?.nome || cliente?.email || "Cliente"}</h1>
            <div style={{ marginTop: 7, display: "inline-flex", padding: "4px 9px", borderRadius: 999, background: session ? "rgba(46,204,138,.1)" : "rgba(251,191,36,.1)", color: session ? C.green : C.yellow, fontFamily: F.sans, fontSize: 11, fontWeight: 800 }}>{session ? "Sessione attiva" : "Accesso richiesto"}</div>
          </div>
          <button onClick={session ? logout : () => onNav("login")} style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)", color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{session ? "Logout" : "Accedi"}</button>
        </div>

        {error && <div style={{ marginBottom: 14, padding: "11px 13px", borderRadius: 10, background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.22)", color: C.yellow, fontFamily: F.sans, fontSize: 12 }}>Supabase non disponibile: nessuna campagna reale da mostrare.</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 16 }}>
          {[
            ["Campagne attive", activeCount, C.green],
            ["In attesa pagamento", waitingPaymentCount, C.yellow],
            ["Totale speso", `€${totalSpent.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`, C.orange],
            ["Volantini distribuiti", flyersDone.toLocaleString("it-IT", { useGrouping: true }), C.blue],
          ].map(([l, v, c]) => (
            <div key={l} style={{ padding: 16, borderRadius: 13, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ fontFamily: F.serif, fontSize: 28, color: c, letterSpacing: "-.6px" }}>{v}</div>
              <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.42)", marginTop: 5 }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 14 }}>Lista campagne</div>
          {loading ? (
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </>
          ) : campagne.length === 0 ? (
            <div style={{ padding: 22, borderRadius: 12, background: "rgba(255,255,255,.035)", textAlign: "center" }}>
              <div style={{ fontFamily: F.serif, fontSize: 24, color: C.white }}>Nessuna campagna ancora</div>
              <button onClick={() => onNav("step1")} style={{ marginTop: 14, minHeight: 44, padding: "0 16px", borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Nuova campagna </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {campagne.map(campagna => {
                const [svcLabel, svcColor] = svcCfg[campagna.service_type] || [campagna.servizio, C.orange];
const [statusLabel, statusColor] = statusCfg[campagna.stato] || [campagna.stato, C.white];
                return (
                  <div key={campagna.id} style={{ padding: 16, borderRadius: 13, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                        <span style={{ padding: "3px 8px", borderRadius: 999, background: `${svcColor}18`, color: svcColor, fontFamily: F.sans, fontSize: 10, fontWeight: 900 }}>{svcLabel}</span>
                        <span style={{ padding: "3px 8px", borderRadius: 999, background: `${statusColor}18`, color: statusColor, fontFamily: F.sans, fontSize: 10, fontWeight: 900 }}>{statusLabel}</span>
                        <span style={{ padding: "3px 8px", borderRadius: 999, background: campagna.stato_pagamento === "pagato" ? "rgba(46,204,138,.14)" : "rgba(251,191,36,.14)", color: campagna.stato_pagamento === "pagato" ? C.green : C.yellow, fontFamily: F.sans, fontSize: 10, fontWeight: 900 }}>{campagna.stato_pagamento === "pagato" ? "Pagato" : "In attesa pagamento"}</span>
                      </div>
                      <div style={{ fontFamily: F.serif, fontSize: 22, color: C.white }}>{campagna.zona}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.45)", marginTop: 5 }}>{(campagna.comuni || []).join(" – ") || "Comuni da confermare"} – {campagna.quantita.toLocaleString("it-IT", { useGrouping: true })} volantini – {campagna.data_inizio || "data da definire"}  {campagna.data_fine || "fine da definire"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: F.serif, fontSize: 24, color: C.green }}>?{Number(campagna.totale_euro || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</div>
                      <button onClick={() => onNav("campaign", { campaignId: campagna.id })} style={{ marginTop: 8, minHeight: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${C.orange}35`, background: `${C.orange}12`, color: C.orange, fontFamily: F.sans, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Vedi dettaglio </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => onNav("step1")} style={{ minHeight: 46, padding: "0 16px", borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Nuova campagna </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignDashboardPage({ onNav, campaignId }) {
  const routeCampaignId = campaignId || window.location.pathname.split("/").filter(Boolean).pop() || null;
const nuovo = new URLSearchParams(window.location.search).get("nuovo") === "true";
const { campagna, loading, error } = useCampagnaDetail(routeCampaignId);
  if (loading) {
    return <div style={{ minHeight: "100vh", background: C.navyMid, padding: "105px 24px 80px" }}><div style={{ maxWidth: 1040, margin: "0 auto" }}><SkeletonCard /><SkeletonCard /><SkeletonCard /></div></div>;
  }
  if (campagna) {
    const progressSteps = [["confermata", "Confermata"], ["in_preparazione", "In preparazione"], ["in_distribuzione", "Distribuzione"], ["completata", "Completata"]];
const activeIndex = Math.max(0, progressSteps.findIndex(([key]) => key === campagna.stato));
const distributedPct = campagna.quantita ? Math.min(100, Math.round((campagna.volantini_distribuiti / campagna.quantita) * 100)) : 0;
const gpsPoints = campagna.gps_punti?.length ? campagna.gps_punti.map((_, i) => [18 + i * 10, 68 - i * 5]) : [];
const proof = campagna.foto_proof || [];
const daysRemaining = campagna.data_fine ? Math.max(0, Math.ceil((new Date(`${campagna.data_fine}T00:00:00`) - new Date()) / 86400000)) : 0;
const pricing = campagna.pricing || {};
const extras = (pricing.extras || []).reduce((a, x) => a + Number(x.amount || 0), 0);
const discounts = (pricing.discounts || []).reduce((a, x) => a + Number(x.amount || 0), 0);
const base = pricing.subtotal || campagna.totale_euro || 0;
const total = pricing.total || campagna.totale_euro || 0;
    return (
      <div style={{ minHeight: "100vh", background: C.navyMid, padding: "105px 24px 80px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          {nuovo && <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 11, background: "rgba(46,204,138,.1)", border: "1px solid rgba(46,204,138,.24)", color: C.green, fontFamily: F.sans, fontSize: 13, fontWeight: 800 }}>Campagna confermata! Ti contatteremo entro 24 ore per confermare i dettagli operativi.</div>}
          {error && <div style={{ marginBottom: 14, padding: "11px 13px", borderRadius: 10, background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.22)", color: C.yellow, fontFamily: F.sans, fontSize: 12 }}>Dettaglio reale non disponibile.</div>}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 22 }}>
            <div>
              <button onClick={() => onNav("dashboard")} style={{ padding: 0, border: "none", background: "transparent", color: "rgba(255,255,255,.45)", fontFamily: F.sans, fontSize: 12, cursor: "pointer", marginBottom: 9 }}>Dashboard  Campagna #{String(campagna.id).slice(0, 8)}</button>
              <h1 style={{ fontFamily: F.serif, fontSize: 34, color: C.white, letterSpacing: "-1px" }}>Campagna {campagna.servizio} – {campagna.zona}</h1>
              <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.45)", marginTop: 6 }}>{campagna.quantita.toLocaleString("it-IT", { useGrouping: true })} volantini – Smart Pairing {campagna.smart_pairing_sconto}%</div>
            </div>
            <button style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)", color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Scarica report PDF</button>
          </div>

          <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18, marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              {progressSteps.map(([id, label], i) => {
                const done = i <= activeIndex;
                return <div key={id} style={{ padding: 12, borderRadius: 11, background: done ? "rgba(46,204,138,.08)" : "rgba(255,255,255,.035)", border: `1px solid ${done ? "rgba(46,204,138,.24)" : "rgba(255,255,255,.06)"}` }}><div style={{ width: 24, height: 24, borderRadius: "50%", background: done ? C.green : "rgba(255,255,255,.1)", color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 12, fontWeight: 800, marginBottom: 8 }}>{i + 1}</div><div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: done ? C.white : "rgba(255,255,255,.42)" }}>{label}</div></div>;
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(280px,.75fr)", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: 14, borderRadius: 12, background: campagna.stato_pagamento === "pagato" ? "rgba(46,204,138,.08)" : "rgba(251,191,36,.08)", border: `1px solid ${campagna.stato_pagamento === "pagato" ? "rgba(46,204,138,.22)" : "rgba(251,191,36,.22)"}`, color: campagna.stato_pagamento === "pagato" ? C.green : C.yellow, fontFamily: F.sans, fontSize: 13, fontWeight: 800 }}>
                {campagna.stato_pagamento === "pagato" ? "Pagamento ricevuto" : "In attesa del tuo bonifico"}
                {campagna.stato_pagamento !== "pagato" && <button onClick={() => onNav("payment", { campaignId: campagna.id })} style={{ marginLeft: 12, minHeight: 34, padding: "0 11px", borderRadius: 8, border: "none", background: C.yellow, color: C.navyDeep, fontFamily: F.sans, fontSize: 11, fontWeight: 900, cursor: "pointer" }}>Vedi istruzioni pagamento </button>}
              </div>
              <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18 }}>
                <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.green, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 12 }}>Statistiche distribuzione</div>
                {[["Volantini distribuiti", `${campagna.volantini_distribuiti.toLocaleString("it-IT", { useGrouping: true })} / ${campagna.quantita.toLocaleString("it-IT", { useGrouping: true })}`, distributedPct, C.green], ["Copertura raggiunta", `${campagna.copertura_pct}%`, campagna.copertura_pct, C.orange], ["Comuni completati", `${Math.max(1, Math.round((campagna.comuni?.length || 1) * distributedPct / 100))}/${campagna.comuni?.length || 1}`, distributedPct, C.blue], ["Giorni rimanenti", String(daysRemaining), Math.max(0, 100 - daysRemaining * 20), C.purple]].map(([l, v, pct, c]) => <div key={l} style={{ marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 12, color: C.white, marginBottom: 5 }}><span>{l}</span><b style={{ color: c }}>{v}</b></div><div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}><div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: c }} /></div></div>)}
              </div>

              <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18 }}>
                <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.blue, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 12 }}>Percorso GPS live</div>
                <div style={{ height: 300, borderRadius: 12, background: "linear-gradient(135deg,#173225,#182b42 52%,#2b2648)", border: "1px solid rgba(255,255,255,.08)", position: "relative", overflow: "hidden" }}>
                  {gpsPoints.length > 0 ? <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}><polyline points={gpsPoints.map(p => p.join(",")).join(" ")} fill="none" stroke={C.green} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />{gpsPoints.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === gpsPoints.length - 1 ? 2.3 : 1.3} fill={i === gpsPoints.length - 1 ? C.orange : C.green} />)}</svg> : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.48)" }}>GPS tracking disponibile durante la distribuzione</div>}
                </div>
              </div>

              <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18 }}>
                <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.purple, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 12 }}>Foto proof geolocalizzate</div>
                {proof.length > 0 ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>{proof.map((p, i) => <div key={i} style={{ aspectRatio: "4/3", borderRadius: 11, background: `url(${p.url}) center/cover, rgba(255,255,255,.05)`, border: "1px solid rgba(255,255,255,.08)" }} />)}</div> : <div style={{ padding: 22, borderRadius: 11, background: "rgba(255,255,255,.035)", fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.48)", textAlign: "center" }}>Le foto verranno caricate durante la distribuzione</div>}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18 }}><div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.green, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 12 }}>Smart Pairing</div><div style={{ fontFamily: F.serif, fontSize: 30, color: C.green, letterSpacing: "-.8px" }}>{campagna.smart_pairing_sconto}%</div><div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.48)", lineHeight: 1.55, marginTop: 6 }}>{(campagna.selected_dates || []).join(" – ") || "Date da confermare"} – sconto applicato al preventivo.</div></div>
              <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18 }}><div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 12 }}>Riepilogo economico</div>{[["Distribuzione base", base], ["Servizi extra", extras], ["Smart Pairing sconto", -discounts], ["Totale pagato", total]].map(([l, v]) => <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,.06)", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.58)" }}><span>{l}</span><b style={{ color: v < 0 ? C.green : C.white }}>?{Number(v || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</b></div>)}</div>
              <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18 }}><div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.blue, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 10 }}>Fonti dati</div><div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.48)", lineHeight: 1.6 }}>ISTAT – Mapbox – OpenStreetMap – Analisi interna</div><a href="https://wa.me/" style={{ display: "inline-block", marginTop: 12, color: C.green, fontFamily: F.sans, fontSize: 12, fontWeight: 800, textDecoration: "none" }}>Hai domande? Contattaci via WhatsApp </a></div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: C.navyMid, padding: "105px 24px 80px" }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 24, borderRadius: 14, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", textAlign: "center" }}>
        <h1 style={{ fontFamily: F.serif, fontSize: 30, color: C.white, letterSpacing: "-1px", marginBottom: 8 }}>Nessuna campagna presente.</h1>
        <p style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.52)", lineHeight: 1.6 }}>Il dettaglio campagna richiede dati reali dal database.</p>
        <button onClick={() => onNav("dashboard")} style={{ marginTop: 16, minHeight: 42, padding: "0 16px", borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Torna dashboard</button>
      </div>
    </div>
  );
  const steps = [
    ["confermata", "Confermata"],
    ["preparazione", "In preparazione"],
    ["distribuzione", "Distribuzione"],
    ["completata", "Completata"],
  ];
const activeIdx = 2;
const gpsPoints = [
    [18, 68], [28, 58], [38, 62], [48, 45], [58, 50], [70, 36], [82, 42]
  ];
const stats = [
    ["Volantini distribuiti", "7.420", C.green],
    ["Copertura stimata", "74%", C.orange],
    ["Zone completate", "3/5", C.blue],
    ["Proof foto", "12", C.purple],
  ];
const history = [
    ["VP-12052026-001", "Door to Door", "Cormano", "Completata", "386€"],
    ["VP-18042026-002", "Business Distribution", "Bresso", "Completata", "420€"],
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.navyMid, padding: "105px 24px 80px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 22 }}>
          <div>
            <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 9 }}>Campagna VP-12052026-001</div>
            <h1 style={{ fontFamily: F.serif, fontSize: 34, color: C.white, letterSpacing: "-1px" }}>Dashboard campagna</h1>
            <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.45)", marginTop: 6 }}>Dettaglio campagna non disponibile</div>
          </div>
          <button onClick={() => onNav("dashboard")} style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)", color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Torna dashboard</button>
        </div>

        <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            {steps.map(([id, label], i) => {
              const done = i <= activeIdx;
              return (
                <div key={id} style={{ padding: 12, borderRadius: 11, background: done ? "rgba(46,204,138,.08)" : "rgba(255,255,255,.035)", border: `1px solid ${done ? "rgba(46,204,138,.24)" : "rgba(255,255,255,.06)"}` }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: done ? C.green : "rgba(255,255,255,.1)", color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 12, fontWeight: 800, marginBottom: 8 }}>{i + 1}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: done ? C.white : "rgba(255,255,255,.42)" }}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(280px,.75fr)", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18 }}>
              <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.blue, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 12 }}>Percorso GPS live</div>
              <div style={{ height: 300, borderRadius: 12, background: "linear-gradient(135deg,#173225,#182b42 52%,#2b2648)", border: "1px solid rgba(255,255,255,.08)", position: "relative", overflow: "hidden" }}>
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
                  <defs><pattern id="vp-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth=".35" /></pattern></defs>
                  <rect width="100" height="100" fill="url(#vp-grid)" />
                  <polyline points={gpsPoints.map(p => p.join(",")).join(" ")} fill="none" stroke={C.green} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  {gpsPoints.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === gpsPoints.length - 1 ? 2.3 : 1.3} fill={i === gpsPoints.length - 1 ? C.orange : C.green} />)}
                </svg>
                <div style={{ position: "absolute", left: 12, top: 12, padding: "7px 10px", borderRadius: 8, background: "rgba(15,26,48,.86)", fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.72)", border: "1px solid rgba(255,255,255,.08)" }}>Ultimo ping: 14:32 – Bresso</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
              {stats.map(([l, v, c]) => (
                <div key={l} style={{ padding: 15, borderRadius: 13, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)" }}>
                  <div style={{ fontFamily: F.serif, fontSize: 28, color: c, letterSpacing: "-.5px" }}>{v}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.42)", marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18 }}>
              <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.purple, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 12 }}>Foto proof geolocalizzate</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
                {["Cormano centro", "Bresso nord", "Via Roma", "Zona scuole"].map((label, i) => (
                  <div key={label} style={{ aspectRatio: "4/3", borderRadius: 11, background: `linear-gradient(135deg,rgba(232,87,26,${.16 + i *.03}),rgba(96,165,250,.16))`, border: "1px solid rgba(255,255,255,.08)", padding: 10, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.white }}>{label}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 9, color: "rgba(255,255,255,.45)" }}>GPS – oggi</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18 }}>
              <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.green, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 12 }}>Smart Pairing</div>
              <div style={{ fontFamily: F.serif, fontSize: 30, color: C.green, letterSpacing: "-.8px" }}>-20%</div>
              <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.48)", lineHeight: 1.55, marginTop: 6 }}>Slot 13 Mag – zona compatibile Bresso – sconto applicato al preventivo.</div>
            </div>

            <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18 }}>
              <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 12 }}>Report finale</div>
              <button className="btn" style={{ width: "100%", minHeight: 44, borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Download PDF report</button>
              <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.34)", marginTop: 10, lineHeight: 1.45 }}>Il report reale verra generato dai dati `tracking_gps` e proof foto.</div>
            </div>

            <div style={{ background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 18 }}>
              <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.blue, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 10 }}>Storico campagne</div>
              {history.map(([id, service, zone, status, total]) => (
                <div key={id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.white }}>{id}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.green }}>{total}</div>
                  </div>
                  <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.42)", marginTop: 3 }}>{service} – {zone} – {status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const BONIFICO_IBAN          = import.meta.env.VITE_IBAN          || "IT60 X0000 0000 0000 0000 0000 000";
const BONIFICO_INTESTATARIO  = import.meta.env.VITE_INTESTATARIO  || "VolantiniPro Srl";
const BONIFICO_BANCA         = import.meta.env.VITE_BANCA         || "Banca Sella";
function PagamentoBonificoPage({ onNav, campaignId }) {
  const routeCampaignId = campaignId || window.location.pathname.split("/").filter(Boolean)[1] || null;
const { campagna, loading } = useCampagnaDetail(routeCampaignId);
const { cliente } = useCliente();
const [toast, setToast] = useState(null);
const [paid, setPaid] = useState(false);
const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    if (campagna?.stato_pagamento === "pagato") { setPaid(true); return; }
    const poll = async () => {
      try {
        if (!supabase || !routeCampaignId) return;
const { data } = await supabase.from("campagne").select("stato_pagamento").eq("id", routeCampaignId).single();
        if (data?.stato_pagamento === "pagato") setPaid(true);
      } catch { /* silently skip */ }
    };
    poll();
const t = setInterval(poll, 30000);
    return () => clearInterval(t);
  }, [routeCampaignId, campagna?.stato_pagamento]);
const copy = async (label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copiato!`);
    } catch {
      showToast("Copia non disponibile");
    }
  };

  if (loading) return <div style={{ minHeight: "100vh", background: C.navyMid, padding: "105px 24px" }}><div style={{ maxWidth: 720, margin: "0 auto" }}><SkeletonCard /></div></div>;
  if (!campagna) {
    return (
      <div style={{ minHeight: "100vh", background: C.navyMid, padding: "105px 24px 80px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 16, padding: 24 }}>
          <div style={{ fontFamily: F.serif, fontSize: 34, color: C.white, marginBottom: 8 }}>Pagamento non disponibile</div>
          <div style={{ fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.55)", lineHeight: 1.6 }}>Le istruzioni di bonifico richiedono una campagna reale salvata nel database.</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: C.navyMid, padding: "105px 24px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 16, padding: 24 }}>
        <div style={{ fontFamily: F.serif, fontSize: 34, color: C.white, marginBottom: 8 }}>Campagna confermata!</div>
        <div style={{ fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.55)", lineHeight: 1.6, marginBottom: 18 }}>Completa il pagamento per avviare la distribuzione.</div>
        {paid ? (
          <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: "rgba(46,204,138,.1)", border: "1px solid rgba(46,204,138,.24)", color: C.green, fontFamily: F.sans, fontSize: 13, fontWeight: 800 }}>
             Pagamento ricevuto &mdash; la distribuzione partira entro 24 ore.
          </div>
        ) : (
          <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.3)", color: C.yellow, fontFamily: F.sans, fontSize: 13, fontWeight: 800 }}>
            – In attesa del bonifico
          </div>
        )}
        <div style={{ padding: 18, borderRadius: 13, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", marginBottom: 14 }}>
          <div style={{ fontFamily: F.sans, fontSize: 10, color: C.orange, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 14 }}>Istruzioni bonifico</div>
          {[
            ["Intestatario", BONIFICO_INTESTATARIO],
            ["Banca", BONIFICO_BANCA],
            ["IBAN", BONIFICO_IBAN],
            ["Importo", `€${Number(campagna.totale_euro || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`],
            ["Causale", campagna.causale_bonifico],
          ].map(([l, v]) => <div key={l} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,.06)", fontFamily: F.sans, fontSize: 13 }}><span style={{ color: "rgba(255,255,255,.42)" }}>{l}</span><b style={{ color: C.white }}>{v}</b></div>)}
        </div>
        <div style={{ padding: 12, borderRadius: 10, background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.22)", color: C.yellow, fontFamily: F.sans, fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>Inserire la causale esatta per il corretto abbinamento. La distribuzione parte entro 24h dalla ricezione del bonifico.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <button onClick={() => copy("IBAN", BONIFICO_IBAN)} style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: `1px solid ${C.orange}35`, background: `${C.orange}12`, color: C.orange, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Copia IBAN</button>
          <button onClick={() => copy("Causale", campagna.causale_bonifico)} style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)", color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Copia causale</button>
          <button onClick={() => showToast(`Istruzioni inviate a ${cliente?.email || "email"}`)} style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)", color: "rgba(255,255,255,.7)", fontFamily: F.sans, fontSize: 13, cursor: "pointer" }}> Invia istruzioni</button>
          <button onClick={() => onNav("campaign", { campaignId: campagna.id })} style={{ minHeight: 44, padding: "0 14px", borderRadius: 10, border: "none", background: C.green, color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Dashboard </button>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,.35)", textAlign: "center", marginTop: 16 }}>
           Aiuto? <a href="https://wa.me/393331234567" target="_blank" rel="noreferrer" style={{ color: "#25D366", textDecoration: "none" }}>WhatsApp</a> o <a href="mailto:info@volantinipro.it" style={{ color: C.orange, textDecoration: "none" }}>Email</a>
        </p>
      </div>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1A2744", color: "white", padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.orange}66`, fontWeight: 700, fontSize: 14, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,.4)", animation: "fadeIn.3s ease both" }}>
           {toast}
        </div>
      )}
    </div>
  );
}

function LegalPage({ type, onNav }) {
  const config = {
    privacy: {
      eyebrow: "Privacy",
      title: "Privacy Policy",
      intro: "Informativa sintetica per il prototipo VolantiniPro. Prima del go-live andra completata con dati societari, DPO/contatti privacy e fornitori effettivi.",
      rows: [
        ["Dati raccolti", "Dati di contatto, informazioni campagna, dati tecnici di navigazione e dati operativi legati a GPS/proof foto quando il servizio e attivo."],
        ["Finalita", "Gestione preventivi, campagne, dashboard cliente, comunicazioni operative e miglioramento del servizio."],
        ["Base giuridica", "Esecuzione del contratto, misure precontrattuali, consenso per comunicazioni opzionali e legittimo interesse per sicurezza e analytics essenziali."],
        ["Conservazione", "Per il tempo necessario alla gestione del servizio, agli obblighi fiscali e alla tutela dei diritti."],
      ]
    },
    terms: {
      eyebrow: "Termini",
      title: "Termini e condizioni",
      intro: "Condizioni base del servizio in versione prototipo. Il testo legale definitivo va validato prima della pubblicazione.",
      rows: [
        ["Oggetto", "VolantiniPro consente di configurare e stimare campagne di distribuzione volantini con strumenti digitali di pianificazione e reporting."],
        ["Preventivi", "I preventivi generati nel prototipo sono stime non vincolanti finche non confermati dal team operativo."],
        ["Dati territoriali", "I dati mostrati sono disponibili solo quando arrivano da configurazione, API o database."],
        ["Responsabilità", "Tempi, disponibilità e copertura possono variare in base a condizioni operative, meteo, accessibilità e conferma finale."],
      ]
    },
    cookie: {
      eyebrow: "Cookie",
      title: "Cookie Policy",
      intro: "Policy cookie minima per il prototipo. Il banner consensi è predisposto e sarà collegato agli strumenti reali quando attivati.",
      rows: [
        ["Cookie tecnici", "Necessari per navigazione, preferenze locali e funzionamento del configuratore."],
        ["Analytics", "Google Analytics 4 e Microsoft Clarity sono pianificati ma non ancora attivi nel prototipo."],
        ["Marketing", "Non attivi nel prototipo. Andranno abilitati solo dopo consenso esplicito."],
        ["Gestione consenso", "Il consenso può essere aggiornato dal banner cookie o da questa pagina quando il modulo definitivo sarà collegato."],
      ]
    }
  }[type] || {};

  return (
    <div style={{ minHeight: "100vh", background: C.navyMid, padding: "105px 24px 80px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 12 }}>{config.eyebrow}</div>
        <h1 style={{ fontFamily: F.serif, fontSize: 40, color: C.white, letterSpacing: "-1px", marginBottom: 10 }}>{config.title}</h1>
        <p style={{ fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.55)", lineHeight: 1.7, maxWidth: 720, marginBottom: 22 }}>{config.intro}</p>
        <div style={{ display: "grid", gap: 10 }}>
          {config.rows.map(([title, body]) => (
            <div key={title} style={{ padding: 18, borderRadius: 13, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.white, marginBottom: 6 }}>{title}</div>
              <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.5)", lineHeight: 1.6 }}>{body}</div>
            </div>
          ))}
        </div>
        <button onClick={() => onNav("home")} style={{ marginTop: 22, minHeight: 44, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.05)", color: C.white, fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Torna alla homepage</button>
      </div>
    </div>
  );
}

function CookieBanner({ onNav }) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("vp_cookie_consent") !== "accepted";
  });
  if (!visible) return null;
  return (
    <div style={{ position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 500, maxWidth: 920, margin: "0 auto", padding: 16, borderRadius: 14, background: "rgba(10,18,34,.96)", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 20px 60px rgba(0,0,0,.35)", display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center" }}>
      <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.62)", lineHeight: 1.55 }}>
        Usiamo cookie tecnici per far funzionare il configuratore. Analytics e marketing saranno attivati solo dopo consenso.
        <button onClick={() => onNav("cookie")} style={{ marginLeft: 8, border: "none", background: "transparent", color: C.orange, fontFamily: F.sans, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Cookie policy</button>
      </div>
      <button onClick={() => { localStorage.setItem("vp_cookie_consent", "accepted"); setVisible(false); }} style={{ minHeight: 42, padding: "0 15px", borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Accetta</button>
    </div>
  );
}

function Step1ZoneCountSelector({ setData }) {
  return (
    <div style={{ marginTop: 8, marginBottom: 24 }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,.8)", margin: 0, padding: "12px 16px", background: "rgba(255,255,255,.04)", borderRadius: 8, border: "1px solid rgba(255,255,255,.08)" }}>
        Potrai aggiungere una o più zone nel passaggio «Zona e Mappa».
      </p>
    </div>
  );
}
function makeOperationalZone(index, base = {}) {
  const service = base.service_type || base.service || "d2d";
  const qty = Number(base.assigned_flyers || base.qty || 10000);
  const cityName = base.cityName || "";
  const geo = GEO_DATA.find(g => g.name.toLowerCase() === cityName.trim().toLowerCase()) || null;
  return {
    id: base.id || `zone_${Date.now()}_${index}`,
    zone_label: base.zone_label || `Zona ${index + 1}`,
    store_name: base.store_name || "",
    service_type: service,
    service_variant: base.service_variant || base.flyerFormat || "a5",
    assigned_flyers: qty,
    assigned_budget: qty * ((QUOTE_PRICES[service] || 18.5) / 1000),
    coverage_percent: base.coverage_percent || 100,
    recommended_flyers: base.recommended_flyers || qty,
    searchMode: base.searchMode || "municipality",
    city: base.city || geo,
    cityName,
    radius: Number(base.radius || 3),
    selected: base.selected || (geo?.id ? [geo.id] : []),
    selectedCaps: base.selectedCaps || [],
    capDataMap: base.capDataMap || {},
    manualAssignments: base.manualAssignments || {},
    allocationMode: base.allocationMode || "auto",
    startDate: base.startDate || "",
    endDate: base.endDate || "",
    activeMapLayers: base.activeMapLayers || defaultLayerState(service),
  };
}


export default function App() {
  const readPrefill = () => {
    if (typeof window === "undefined") return { has: false, patch: {} };
const p = new URLSearchParams(window.location.search);
const service = p.get("service");
const comune = p.get("comune") || "";
const qty = Number(p.get("qty") || 0);
const printed = p.get("printed");
const format = p.get("format");
const urgency = p.get("urgency");
const startDate = p.get("startDate") || "";
const endDate = p.get("endDate") || "";
const serviceOk = ["d2d", "h2h", "b2b"].includes(service || "");
const has = serviceOk || Boolean(comune) || qty > 0;
    return {
      has, patch: {...(serviceOk ? { type: service, selectedService: service, activeService: service } : {}),...(qty > 0 ? { qty, flyerQuantity: qty, flyerQuantityFromStep1: qty } : {}),...(comune ? { cityName: comune, searchedLocation: comune } : {}),...(printed ? { hasFlyers: printed === "true" ? "yes" : "no", alreadyPrinted: printed === "true" } : {}),...(format ? { flyerFormat: format.toLowerCase() } : {}),...(urgency ? { urgency: urgency === "urgent" ? "urgent" : "normal" } : {}),...(startDate ? { startDate, campaignPeriodStart: startDate } : {}),...(endDate ? { endDate, campaignPeriodEnd: endDate } : {}),
        quickSource: p.get("source") || ""
      }
    };
  };
const prefill = readPrefill();
const routeToPage = path => {
    const p = path.toLowerCase();
const url = new URL(window.location.href);
const step = url.searchParams.get("step");

    if (p === "/" || p === "/index.html" || p === "/volantinipro-final.jsx") return "home";
    if (p.includes("login")) return "login";
    if (p.includes("dashboard")) return "dashboard";
    if (p.includes("pagamento")) return "payment";
    if (p.includes("campagna")) return "campaign";
    if (p.includes("privacy")) return "privacy";
    if (p.includes("termini") || p.includes("terms")) return "terms";
    if (p.includes("cookie-policy") || p.includes("cookie")) return "cookie";
    if (p.includes("preventivo-rapido")) return "quick";
    if (p.includes("consulente")) return "consultant";
    if (p.includes("configuratore") || prefill.has) {
      if (step) return `step${step}`;
      return "step1";
    }
    if (p.includes("admin")) return "admin";
    return "home";
  };
const [page, setPage] = useState(routeToPage(window.location.pathname));

  useEffect(() => {
    const handlePop = () => setPage(routeToPage(window.location.pathname));
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);
const [data, setData] = useState({
    type: null, activityType: "", activityNote: "", qty: 10000,
    hasFlyers: "no", flyerFormat: "a5", flyerWeight: "115", extraServices: [], printGramm: "115", printSide: "fronte", printColor: "cmyk",
    urgency: "normal", subscription: "single", campaignsPerMonth: 1,
    selectedService: null, activeService: null, businessSector: "", flyerQuantity: 10000,
    campaignPeriodStart: "", campaignPeriodEnd: "", alreadyPrinted: false,
    printServices: [], paperWeight: "115", printSides: "fronte", colorMode: "cmyk",
    campaignPlan: "single", totalCampaigns: 1, planDiscount: 0,
    redistExtra: null, zoneMode: "auto", zoneCountIntent: "single",
    city: null, cityName: "", radius: 3, selectedRadius: 3, searchedLocation: "", zones: [], selectedZones: [], selectedComuni: [],
    layerValues: {}, adminInfoSummary: null, serviceKpis: null, requiredFlyers: 0,
    flyerQuantityFromStep1: 10000, missingFlyers: 0, coverageStatus: "empty", recommendations: [],
    days: [], avgDiscount: 0, selectedDates: [], selectedMonth: null, selectedDaysCount: 0,
    pairingDays: [], normalDays: [], requestOnlyDays: [], pairingType: {}, pairingDiscountPercent: {},
    averagePairingDiscount: 0, maxPairingDiscount: 0, calendarStatus: "empty",
    smartPairingStatus: "none", smartPairingRequestSent: false,
    requiresManualConfirmation: false, contactRequestData: null,
    aiOptimizer: false, startDate: "", endDate: "",...prefill.patch
  });
const goTo = (p, prefillPatch = null) => {
    if (prefillPatch) {
      const service = prefillPatch.service;
const qty = Number(prefillPatch.qty || 0);
const comune = prefillPatch.comune || "";
const printed = prefillPatch.printed;
const format = prefillPatch.format;
const urgency = prefillPatch.urgency;
      setData(d => ({...d,...(service ? { type: service, selectedService: service, activeService: service } : {}),...(qty > 0 ? { qty, flyerQuantity: qty, flyerQuantityFromStep1: qty } : {}),...(comune ? { cityName: comune, searchedLocation: comune } : {}),...(printed ? { hasFlyers: printed === "true" ? "yes" : "no", alreadyPrinted: printed === "true" } : {}),...(format ? { flyerFormat: format.toLowerCase() } : {}),...(urgency ? { urgency: urgency === "urgent" ? "urgent" : "normal" } : {}),
        quickSource: prefillPatch.source || d.quickSource || ""
      }));
    }
    const paths = { home: "/", login: "/login", dashboard: "/dashboard", campaign: prefillPatch?.campaignId ? `/campagna/${prefillPatch.campaignId}${prefillPatch?.new ? "?nuovo=true" : ""}` : "/dashboard", payment: prefillPatch?.campaignId ? `/campagna/${prefillPatch.campaignId}/pagamento` : "/dashboard", privacy: "/privacy", terms: "/termini", cookie: "/cookie-policy", quick: "/preventivo-rapido", consultant: "/consulente", step1: "/configuratore", step2: "/configuratore", step3: "/configuratore", step4: "/configuratore", admin: "/admin" };
    if (typeof window !== "undefined") {
      const params = new URLSearchParams();
      if (p.startsWith("step")) {
        const s = prefillPatch || data;
        if (s.type || s.service) params.set("service", s.type || s.service);
        if (s.cityName || s.comune) params.set("comune", s.cityName || s.comune);
        if (s.qty) params.set("qty", String(s.qty));
        if (s.hasFlyers || s.printed) params.set("printed", s.hasFlyers === "yes" || s.printed === "true" ? "true" : "false");
        if (s.flyerFormat || s.format) params.set("format", (s.flyerFormat || s.format).toUpperCase());
        if (s.urgency) params.set("urgency", s.urgency);
        if (s.startDate) params.set("startDate", s.startDate);
        if (s.endDate) params.set("endDate", s.endDate);
        if (s.source || s.quickSource) params.set("source", s.source || s.quickSource);
        params.set("step", p.replace("step", ""));
        window.history.pushState(null, "", `/configuratore?${params.toString()}`);
      } else {
        window.history.pushState(null, "", paths[p] || "/");
      }
    }
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
const isConfiguratorPage = page === "step1" || page === "step2" || page === "step3" || page === "step4";

  return (
    <div style={{ fontFamily: F.sans, minHeight: "100vh", background: C.navyMid }}>
      <Bootstrap />
      <SeoMeta page={page} />
      {!isConfiguratorPage && page !== "home" && <Navbar onNav={goTo} page={page} />}
      <div style={{ paddingTop: 0 }}>
        {page === "home" && <HomePage onStart={goTo} />}
        {page === "quick" && <QuickQuotePage onStart={goTo} onContact={goTo} />}
        {page === "consultant" && <ConsultantPage onStart={goTo} />}
        {page === "login" && <LoginPage onNav={goTo} />}
        {page === "dashboard" && <DashboardPage onNav={goTo} />}
        {page === "campaign" && <CampaignDashboardPage onNav={goTo} campaignId={window.location.pathname.split("/").filter(Boolean).pop() || null} />}
        {page === "payment" && <PagamentoBonificoPage onNav={goTo} campaignId={window.location.pathname.split("/").filter(Boolean)[1] || null} />}
        {page === "privacy" && <LegalPage type="privacy" onNav={goTo} />}
        {page === "terms" && <LegalPage type="terms" onNav={goTo} />}
        {page === "cookie" && <LegalPage type="cookie" onNav={goTo} />}
        {page === "admin" && <AdminDashboard onNav={goTo} />}
        {isConfiguratorPage && (
          <>
            <StepperBar current={page} onGo={goTo} />
            {page === "step1" && <Step1 data={data} setData={setData} onNext={() => goTo("step2")} />}
            {page === "step2" && <Step2ErrorBoundary><Step2 data={data} setData={setData} onNext={() => goTo("step3")} onBack={() => goTo("step1")} /></Step2ErrorBoundary>}
            {page === "step3" && <Step3 data={data} setData={setData} onNext={() => goTo("step4")} onBack={() => goTo("step2")} />}
            {page === "step4" && <Step4 data={data} setData={setData} onBack={() => goTo("step3")} onHome={() => goTo("home")} onCampaignSaved={(id) => goTo("payment", { campaignId: id })} />}
          </>
        )}
      </div>
      <CookieBanner onNav={goTo} />
    </div>
  );
}















