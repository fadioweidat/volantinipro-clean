import React, { Component, Fragment, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { printQuotePdf } from "./src/lib/pdf/printQuotePdf.js";
import { supabase, confirmCampaignPayment, hasSupabaseConfig, saveCampaign, saveSmartPairingWaitlist, getStoredSupabaseSession } from "./src/lib/supabaseClient.js";
import { supabase as authSupabase } from "./src/supabaseClient.js";
import {
  consumeSupabaseAuthHash,
  parseSupabaseAuthHashError,
  clearSupabaseAuthHashError,
  rememberPendingAuthContext,
  clearPendingAuthContext,
  rememberPendingAuthReturnPath,
  readPendingAuthReturnPath,
  clearPendingAuthReturnPath,
  rememberPendingAuthOrigin,
  readPendingAuthOrigin,
  clearPendingAuthOrigin,
  restoreSupabaseSession,
  verifySupabaseAdminRole
} from "./src/auth/session.js";
import { useCampagne } from "./src/hooks/useCampagne.js";
import { useCampagnaDetail } from "./src/hooks/useCampagnaDetail.js";
import { useCliente } from "./src/hooks/useCliente.js";
import { customerValue, CUSTOMER_DATA_UNAVAILABLE, CUSTOMER_PAYMENT_STATE, getCustomerPaymentState, MARKETPLACE_STATUS_LABELS } from "./src/lib/customerCampaigns.js";
import { CustomerQuotesView } from "./src/pages/customer/CustomerQuotesView.jsx";
import { CampaignConfigSection, CustomerMessagesPanel } from "./src/components/customer/CampaignHubPanels.jsx";
import { isAuthorizedAdminEmail, normalizeEmail } from "./src/auth/adminAuthorization.js";
import { getBankTransferDetails, BANK_TRANSFER_UNAVAILABLE_MESSAGE } from "./src/lib/bankTransfer.js";
import { IS_MANUAL_CONTACT, buildCampaignContactWhatsAppUrl, buildCampaignContactMailtoUrl } from "./src/lib/paymentMode.js";
import { getAuthRedirectBase } from "./src/lib/publicAppUrl.js";
import { logError, ERROR_CATEGORIES, ERROR_SEVERITY } from "./src/lib/monitoring/errorLog.js";

// Badge neutro per "Dato non disponibile": usato al posto del rendering
// grande/colorato di un valore reale, cosi' un dato mancante non sembra un
// numero vero (es. "0" o un colore acceso) ma resta visivamente distinto
// come stato neutro. Nessun impatto sui dati: solo su come vengono mostrati.
function MissingValueBadge() {
  return <span style={{
    display: "inline-block",
    padding: "3px 9px",
    borderRadius: 999,
    background: "rgba(255,255,255,.06)",
    color: "rgba(255,255,255,.4)",
    fontFamily: F.sans,
    fontSize: 11,
    fontWeight: 800
  }}>{CUSTOMER_DATA_UNAVAILABLE}</span>;
}
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
import RisultatiSection from "./src/components/home/RisultatiSection.jsx";
import Footer from "./src/components/home/Footer.jsx";
import Button from "./src/components/ui/Button.jsx";
import { MetricValue } from "./src/components/ui/MetricValue.tsx";
import { sendEmailConferma } from "./src/api/sendEmailConferma.js";
import { computeDoorToDoorCoverage, getZoneFullCoverageFlyers } from "./src/lib/doorToDoorCoverage.js";
import { allowMockData, isProduction, isCustomerAiDashboardEnabled, isTerritorialStep2AiEnabled } from "./src/lib/runtimeFlags.js";
import { LAYER_PANEL_CONFIG, defaultLayerState } from "./src/lib/dataSources.js";
const CustomerAiAssistantPanel = React.lazy(() => import("./src/components/ai/customer/CustomerAiAssistantPanel.jsx"));
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
  OpenStreetMap: "OpenStreetMap / Overpass"
};
function normalizeDataSourceLabel(source) {
  return SOURCE_ALIASES[source] || source;
}
function formatAreaKm2(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return `${n.toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })} km`;
}
function formatPaperWeight(value) {
  if (!value) return "";
  const s = String(value).replace(/g\/m[2]?/gi, "").replace(/[\-]+$/, "").trim();
  const n = Number(s.replace(",", "."));
  if (Number.isFinite(n) && n > 0) return `${n} g/m`;
  return `${s} g/m`;
}
function formatEuroPerMq(min, max) {
  const fmt2 = v => Number(v).toLocaleString("it-IT");
  if (min && max) return `${fmt2(min)}  ${fmt2(max)} /mq`;
  if (min) return `da ${fmt2(min)} /mq`;
  return "";
}
function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return String(n);
}
function formatNumber(value, fallback = "0") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    const n = Number(value);
    if (!Number.isFinite(n)) return value; // non-numeric string: return unchanged
    return n.toLocaleString("it-IT");
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fallback; // NaN or Infinity
    return value.toLocaleString("it-IT");
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
  if (analysisData) return ["Stima interna"]; // has data response but no sources listed
  return []; // no API data yet (city not selected or loading)
}
export const C = {
  orange: "#E8571A",
  orangeGlow: "rgba(232,87,26,.35)",
  navy: "#1A2744",
  navyDeep: "#0F1A30",
  navyMid: "#162238",
  cream: "#FAF9F7",
  steelDark: "#E2E6EC",
  green: "#2ECC8A",
  blue: "#60A5FA",
  purple: "#A78BFA",
  yellow: "#FBBF24",
  red: "#F87171",
  teal: "#2DD4BF",
  text: "#1A1A1A",
  muted: "#6B7280",
  white: "#FFFFFF"
};
export const F = {
  serif: "'DM Serif Display',Georgia,serif",
  sans: "'DM Sans',sans-serif"
};
// Step3 preview pricing ( per 1000 flyers  simplified estimate formula)
const BASE_PRICES = {
  d2d: 1.85,
  h2h: 2.20,
  b2b: 3.50
};
// Step4 canonical pricing ( per 1000 flyers  final quote formula, 10 denominator differs)
const QUOTE_PRICES = {
  d2d: 18.5,
  h2h: 22.0,
  b2b: 35.0
};
const MONTHS_FULL = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const MONTHS_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
class Step2ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      info: null
    };
  }
  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    };
  }
  componentDidCatch(error, info) {
    this.setState({
      info
    });
    console.error('[Step2ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return <div style={{
        padding: 40,
        background: '#0F1A30',
        minHeight: '100vh',
        fontFamily: 'monospace'
      }}>
          <h2 style={{
          color: '#F87171',
          marginBottom: 16
        }}> Step2 Runtime Error</h2>
          <pre style={{
          color: '#FBBF24',
          background: '#1a2a40',
          padding: 20,
          borderRadius: 8,
          overflow: 'auto',
          fontSize: 13,
          lineHeight: 1.5
        }}>
            {this.state.error?.toString()}{'\n\n'}
            {this.state.error?.stack}
          </pre>
          <pre style={{
          color: '#60A5FA',
          background: '#1a2a40',
          padding: 20,
          borderRadius: 8,
          marginTop: 16,
          overflow: 'auto',
          fontSize: 11,
          lineHeight: 1.5
        }}>
            {this.state.info?.componentStack}
          </pre>
        </div>;
    }
    return this.props.children;
  }
}
function CountUp({
  end,
  suffix = "",
  duration = 2000
}) {
  const [n, setN] = useState(0);
  const ref = useRef();
  const done = useRef(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true;
        const t0 = Date.now();
        const tick = () => {
          const p = Math.min((Date.now() - t0) / duration, 1);
          setN(Math.floor((1 - Math.pow(1 - p, 3)) * end));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, {
      threshold: 0.3
    });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [end, duration]);
  return <span ref={ref}>{n.toLocaleString("it-IT")}{suffix}</span>;
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

// Section

// Section
// HOME PAGE
// Section

function MiniDashboard() {
  const [active, setActive] = useState(0);
  const zones = [{
    name: "Cormano",
    families: 8420,
    cov: 92,
    c: C.orange
  }, {
    name: "Bresso",
    families: 11200,
    cov: 87,
    c: "#FF8C42"
  }, {
    name: "Cusano M.",
    families: 6100,
    cov: 78,
    c: "#FFB347"
  }];
  const kpis = [{
    l: "Famiglie",
    v: "25.720",
    c: C.orange
  }, {
    l: "Raggio",
    v: "3 km",
    c: C.green
  }, {
    l: "Comuni",
    v: "3",
    c: C.blue
  }, {
    l: "Output",
    v: "Report",
    c: C.purple
  }];
  return <div style={{
    background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.1)",
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 40px 80px rgba(0,0,0,.5)"
  }}>
      <div style={{
      background: "rgba(255,255,255,.05)",
      padding: "11px 16px",
      display: "flex",
      alignItems: "center",
      gap: 8,
      borderBottom: "1px solid rgba(255,255,255,.06)"
    }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map(c => <div key={c} style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: c
      }} />)}
        <div style={{
        flex: 1,
        marginLeft: 10,
        background: "rgba(255,255,255,.06)",
        borderRadius: 6,
        padding: "3px 12px",
        fontFamily: "monospace",
        fontSize: 10,
        color: "rgba(255,255,255,.3)"
      }}>volantinipro.it/configuratore/zona</div>
      </div>
      <div style={{
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 12
    }}>
        <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4,1fr)",
        gap: 8
      }}>
          {kpis.map(({
          l,
          v,
          c
        }) => <div key={l} style={{
          background: "rgba(255,255,255,.04)",
          borderRadius: 10,
          padding: "10px",
          border: "1px solid rgba(255,255,255,.06)"
        }}>
              <div style={{
            fontFamily: F.serif,
            fontSize: 18,
            color: c
          }}>{v}</div><div style={{
            fontFamily: F.sans,
            fontSize: 9,
            color: "rgba(255,255,255,.4)",
            marginTop: 2
          }}>{l}</div>
            </div>)}
        </div>
        <div style={{
        height: 164,
        borderRadius: 12,
        overflow: "hidden",
        position: "relative",
        background: "linear-gradient(135deg,#193328 0%,#1a2a3a 50%,#27233d 100%)",
        border: "1px solid rgba(255,255,255,.06)"
      }}>
          <svg width="100%" height="100%" style={{
          position: "absolute",
          inset: 0
        }}>
            <defs><pattern id="g" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,.04)" strokeWidth=".5" /></pattern></defs>
            <rect width="100%" height="100%" fill="url(#g)" />
            <ellipse cx="45%" cy="50%" rx="30%" ry="36%" fill="rgba(232,87,26,.16)" stroke="rgba(232,87,26,.45)" strokeWidth="1.5" />
            <ellipse cx="62%" cy="38%" rx="16%" ry="20%" fill="rgba(96,165,250,.16)" stroke="rgba(96,165,250,.35)" strokeWidth="1" />
            <path d="M95 112 C140 86 184 118 234 70" stroke="rgba(46,204,138,.75)" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="45%" cy="50%" r="5" fill={C.orange} /><circle cx="62%" cy="38%" r="4" fill={C.blue} /><circle cx="32%" cy="62%" r="4" fill={C.green} />
          </svg>
          <div style={{
          position: "absolute",
          top: 10,
          left: 10,
          background: "rgba(15,26,48,.9)",
          backdropFilter: "blur(8px)",
          borderRadius: 7,
          padding: "6px 10px",
          fontFamily: F.sans,
          fontSize: 10,
          color: "rgba(255,255,255,.68)",
          border: "1px solid rgba(255,255,255,.07)"
        }}>Analisi raggio: 3 km</div>
          <div style={{
          position: "absolute",
          bottom: 10,
          left: 10,
          background: "rgba(15,26,48,.9)",
          backdropFilter: "blur(8px)",
          borderRadius: 7,
          padding: "6px 10px",
          fontFamily: F.sans,
          fontSize: 10,
          color: "rgba(255,255,255,.68)",
          border: "1px solid rgba(255,255,255,.07)"
        }}>ISTAT + Mapbox + GPS</div>
          <div style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          display: "flex",
          flexDirection: "column",
          gap: 5
        }}>
            {["Comuni nel raggio", "Dati territoriali", "Output operativo"].map(x => <span key={x} style={{
            background: "rgba(255,255,255,.08)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 6,
            padding: "4px 8px",
            fontFamily: F.sans,
            fontSize: 9,
            color: "rgba(255,255,255,.68)"
          }}>{x}</span>)}
          </div>
        </div>
        {zones.map((z, i) => <div key={z.name} onClick={() => setActive(i)} style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 9,
        cursor: "pointer",
        background: active === i ? "rgba(232,87,26,.1)" : "rgba(255,255,255,.03)",
        border: `1px solid ${active === i ? "rgba(232,87,26,.25)" : "rgba(255,255,255,.05)"}`,
        transition: "all.2s"
      }}>
            <div style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: z.c,
          flexShrink: 0
        }} />
            <span style={{
          fontFamily: F.sans,
          fontSize: 12,
          color: C.white,
          flex: 1
        }}>{z.name}</span>
            <span style={{
          fontFamily: "monospace",
          fontSize: 11,
          color: "rgba(255,255,255,.45)"
        }}>{z.families.toLocaleString("it-IT")} famiglie</span>
            <div style={{
          width: 50,
          height: 3,
          borderRadius: 2,
          background: "rgba(255,255,255,.1)",
          overflow: "hidden"
        }}><div style={{
            width: `${z.cov}%`,
            height: "100%",
            background: z.c,
            borderRadius: 2
          }} /></div>
            <span style={{
          fontFamily: F.sans,
          fontSize: 10,
          color: z.c,
          width: 30,
          textAlign: "right"
        }}>{z.cov}%</span>
          </div>)}
      </div>
    </div>;
}
// JSX runtime shim for reconstructed bundle code
function _jsx(type, props, key) {
  if (!props) return React.createElement(type, null);
  const {
    children,
    ...rest
  } = props;
  if (key !== undefined) rest.key = key;
  if (children === undefined) return React.createElement(type, rest);
  if (Array.isArray(children)) return React.createElement(type, rest, ...children);
  return React.createElement(type, rest, children);
}
const _jsxs = _jsx;
const GEO_DATA = [{
    id: "cormano",
    name: "Cormano",
    lat: 45.551,
    lng: 9.163
  }, {
    id: "sesto",
    name: "Sesto San Giovanni",
    lat: 45.533,
    lng: 9.237
  }, {
    id: "bresso",
    name: "Bresso",
    lat: 45.542,
    lng: 9.192
  }, {
    id: "cinisello",
    name: "Cinisello Balsamo",
    lat: 45.559,
    lng: 9.212
  }, {
    id: "monza",
    name: "Monza",
    lat: 45.584,
    lng: 9.274
  }, {
    id: "niguarda",
    name: "Milano Niguarda",
    lat: 45.507,
    lng: 9.188
  }, {
    id: "varedo",
    name: "Varedo",
    lat: 45.574,
    lng: 9.161
  }, {
    id: "paderno",
    name: "Paderno Dugnano",
    lat: 45.568,
    lng: 9.163
  }, {
    id: "cusano",
    name: "Cusano Milanino",
    lat: 45.551,
    lng: 9.18
  }, {
    id: "quarto",
    name: "Quarto Oggiaro",
    lat: 45.5,
    lng: 9.137
  }, {
    id: "senago",
    name: "Senago",
    lat: 45.576,
    lng: 9.13
  }],
  ZONE_DATA = [{
    id: "cormano",
    name: "Cormano",
    area: 6.8,
    pop: 21800,
    families: 8500,
    mailboxes: 7100,
    coverage: 78,
    flyersMin: 1e4,
    flyersMax: 12e3,
    operDays: 3,
    familyIdx: 72,
    reachD2D: 84,
    roiD2D: 68,
    confD2D: 81,
    eta14: null,
    eta34: null,
    eta64: null,
    eta65: null,
    genderM: 49,
    genderF: 51,
    areaType: "Residenziale mista",
    poi: 145,
    nearbyBiz: 38,
    commDens: 61,
    flowScore: 74,
    transitStops: 23,
    trainStations: 3,
    operDaysH2H: 2,
    reachH2H: 79,
    roiH2H: 65,
    confH2H: 76,
    hotspots: "Piazza centrale  Stazione",
    timeSlots: "08-10  12-14",
    strongPts: 7,
    bizTotal: 92,
    competitors: 11,
    commDensB2B: 74,
    operDaysB2B: 2,
    cdIdx: 74,
    reachB2B: 82,
    roiB2B: 71,
    confB2B: 80,
    clusters: 3,
    topCats: "Retail  Food  Servizi",
    targetBiz: 41,
    strongZone: "Asse centrale",
    reddito: 24200,
    densita: 3200,
    stranieri: 10.4,
    indVec: 189,
    occup: 65.2,
    imprese: 1240,
    dist: {
      cormano: 0,
      sesto: 5.8,
      bresso: 3.1,
      cinisello: 3.9,
      monza: 10.1,
      niguarda: 4.8,
      varedo: 2.8,
      paderno: 1.4,
      cusano: 1.8,
      quarto: 5.2,
      senago: 3.8
    }
  }, {
    id: "bresso",
    name: "Bresso",
    area: 3.1,
    pop: 27100,
    families: 11200,
    mailboxes: 9400,
    coverage: 87,
    flyersMin: 13e3,
    flyersMax: 15e3,
    operDays: 2,
    familyIdx: 80,
    reachD2D: 88,
    roiD2D: 74,
    confD2D: 85,
    eta14: null,
    eta34: null,
    eta64: null,
    eta65: null,
    genderM: 48,
    genderF: 52,
    areaType: "Urbano residenziale",
    poi: 198,
    nearbyBiz: 54,
    commDens: 71,
    flowScore: 82,
    transitStops: 14,
    trainStations: 1,
    operDaysH2H: 2,
    reachH2H: 83,
    roiH2H: 70,
    confH2H: 80,
    hotspots: "Corso principale  Metro",
    timeSlots: "08-10  17-19",
    strongPts: 5,
    bizTotal: 120,
    competitors: 18,
    commDensB2B: 79,
    operDaysB2B: 1,
    cdIdx: 79,
    reachB2B: 85,
    roiB2B: 74,
    confB2B: 82,
    clusters: 4,
    topCats: "Food  Retail  Salute",
    targetBiz: 54,
    strongZone: "Via principale",
    reddito: 25800,
    densita: 8900,
    stranieri: 12.8,
    indVec: 150,
    occup: 66.8,
    imprese: 1980,
    dist: {
      cormano: 3.1,
      sesto: 4.2,
      bresso: 0,
      cinisello: 2.8,
      monza: 8.9,
      niguarda: 2.1,
      varedo: 4.8,
      paderno: 4,
      cusano: 2.9,
      quarto: 7.4,
      senago: 6.1
    }
  }, {
    id: "cinisello",
    name: "Cinisello Balsamo",
    area: 12.1,
    pop: 73800,
    families: 29100,
    mailboxes: 24800,
    coverage: 92,
    flyersMin: 3e4,
    flyersMax: 36e3,
    operDays: 6,
    familyIdx: 75,
    reachD2D: 90,
    roiD2D: 72,
    confD2D: 88,
    eta14: null,
    eta34: null,
    eta64: null,
    eta65: null,
    genderM: 48,
    genderF: 52,
    areaType: "Misto residenziale",
    poi: 320,
    nearbyBiz: 98,
    commDens: 78,
    flowScore: 88,
    transitStops: 18,
    trainStations: 2,
    operDaysH2H: 3,
    reachH2H: 87,
    roiH2H: 74,
    confH2H: 84,
    hotspots: "C.C.  Stazione  Piazze",
    timeSlots: "08-10  12-14  17-19",
    strongPts: 9,
    bizTotal: 210,
    competitors: 32,
    commDensB2B: 82,
    operDaysB2B: 3,
    cdIdx: 82,
    reachB2B: 88,
    roiB2B: 76,
    confB2B: 85,
    clusters: 7,
    topCats: "Retail  Food  Uffici",
    targetBiz: 94,
    strongZone: "C.C. + direzionale",
    reddito: 23400,
    densita: 5800,
    stranieri: 15.2,
    indVec: 154,
    occup: 65.4,
    imprese: 4800,
    dist: {
      cormano: 3.9,
      sesto: 2.2,
      bresso: 2.8,
      cinisello: 0,
      monza: 5.8,
      niguarda: 3.4,
      varedo: 5.6,
      paderno: 4.8,
      cusano: 3.1,
      quarto: 8.2,
      senago: 4.4
    }
  }, {
    id: "varedo",
    name: "Varedo",
    area: 4.2,
    pop: 13200,
    families: 5400,
    mailboxes: 3800,
    coverage: 100,
    flyersMin: 6e3,
    flyersMax: 7e3,
    operDays: 2,
    familyIdx: 68,
    reachD2D: 76,
    roiD2D: 60,
    confD2D: 78,
    eta14: null,
    eta34: null,
    eta64: null,
    eta65: null,
    genderM: 49,
    genderF: 51,
    areaType: "Bassa densita",
    poi: 82,
    nearbyBiz: 22,
    commDens: 44,
    flowScore: 46,
    transitStops: 6,
    trainStations: 1,
    operDaysH2H: 1,
    reachH2H: 62,
    roiH2H: 52,
    confH2H: 68,
    hotspots: "Piazza municipio",
    timeSlots: "08-10  16-18",
    strongPts: 3,
    bizTotal: 48,
    competitors: 6,
    commDensB2B: 52,
    operDaysB2B: 1,
    cdIdx: 52,
    reachB2B: 64,
    roiB2B: 55,
    confB2B: 70,
    clusters: 2,
    topCats: "Bar  Retail",
    targetBiz: 21,
    strongZone: "Centro storico",
    reddito: 22800,
    densita: 3140,
    stranieri: 8.4,
    indVec: 203,
    occup: 62.8,
    imprese: 620,
    dist: {
      cormano: 2.8,
      sesto: 7.4,
      bresso: 4.8,
      cinisello: 5.6,
      monza: 8.8,
      niguarda: 6.2,
      varedo: 0,
      paderno: 1.8,
      cusano: 3.2,
      quarto: 6.4,
      senago: 2.2
    }
  }, {
    id: "paderno",
    name: "Paderno Dugnano",
    area: 10.8,
    pop: 37800,
    families: 15200,
    mailboxes: 12800,
    coverage: 82,
    flyersMin: 16e3,
    flyersMax: 19e3,
    operDays: 4,
    familyIdx: 71,
    reachD2D: 82,
    roiD2D: 65,
    confD2D: 80,
    eta14: null,
    eta34: null,
    eta64: null,
    eta65: null,
    genderM: 49,
    genderF: 51,
    areaType: "Residenziale mista",
    poi: 168,
    nearbyBiz: 48,
    commDens: 62,
    flowScore: 68,
    transitStops: 14,
    trainStations: 1,
    operDaysH2H: 2,
    reachH2H: 76,
    roiH2H: 62,
    confH2H: 74,
    hotspots: "Stazione  Piazze  Mercato",
    timeSlots: "08-10  12-14",
    strongPts: 5,
    bizTotal: 108,
    competitors: 14,
    commDensB2B: 68,
    operDaysB2B: 2,
    cdIdx: 68,
    reachB2B: 77,
    roiB2B: 64,
    confB2B: 76,
    clusters: 4,
    topCats: "Food  Retail  Salute",
    targetBiz: 48,
    strongZone: "Asse ferroviario",
    reddito: 23200,
    densita: 3500,
    stranieri: 11.2,
    indVec: 167,
    occup: 64.2,
    imprese: 2100,
    dist: {
      cormano: 1.4,
      sesto: 5.2,
      bresso: 4,
      cinisello: 4.8,
      monza: 9.2,
      niguarda: 5.8,
      varedo: 1.8,
      paderno: 0,
      cusano: 2.4,
      quarto: 5.8,
      senago: 3.4
    }
  }, {
    id: "sesto",
    name: "Sesto S. Giovanni",
    area: 11.6,
    pop: 81200,
    families: 33500,
    mailboxes: 28200,
    coverage: 94,
    flyersMin: 34e3,
    flyersMax: 4e4,
    operDays: 6,
    familyIdx: 77,
    reachD2D: 91,
    roiD2D: 75,
    confD2D: 89,
    eta14: null,
    eta34: null,
    eta64: null,
    eta65: null,
    genderM: 48,
    genderF: 52,
    areaType: "Urbano denso",
    poi: 380,
    nearbyBiz: 112,
    commDens: 82,
    flowScore: 90,
    transitStops: 22,
    trainStations: 3,
    operDaysH2H: 3,
    reachH2H: 89,
    roiH2H: 77,
    confH2H: 86,
    hotspots: "Metro M1  Centro  Stazione",
    timeSlots: "07-09  12-14  17-19",
    strongPts: 11,
    bizTotal: 280,
    competitors: 42,
    commDensB2B: 86,
    operDaysB2B: 3,
    cdIdx: 86,
    reachB2B: 91,
    roiB2B: 79,
    confB2B: 88,
    clusters: 8,
    topCats: "Retail  Food  Uffici",
    targetBiz: 126,
    strongZone: "P.za Resistenza",
    reddito: 26200,
    densita: 6200,
    stranieri: 14.8,
    indVec: 181,
    occup: 67.2,
    imprese: 6200,
    dist: {
      cormano: 5.8,
      sesto: 0,
      bresso: 4.2,
      cinisello: 2.2,
      monza: 7.1,
      niguarda: 3.8,
      varedo: 7.4,
      paderno: 5.2,
      cusano: 4.9,
      quarto: 9.4,
      senago: 7.2
    }
  }, {
    id: "cusano",
    name: "Cusano Milanino",
    area: 4,
    pop: 19300,
    families: 7600,
    mailboxes: 6200,
    coverage: 85,
    flyersMin: 8e3,
    flyersMax: 1e4,
    operDays: 2,
    familyIdx: 70,
    reachD2D: 80,
    roiD2D: 64,
    confD2D: 79,
    eta14: null,
    eta34: null,
    eta64: null,
    eta65: null,
    genderM: 49,
    genderF: 51,
    areaType: "Medio-alta",
    poi: 124,
    nearbyBiz: 36,
    commDens: 58,
    flowScore: 62,
    transitStops: 8,
    trainStations: 0,
    operDaysH2H: 2,
    reachH2H: 72,
    roiH2H: 60,
    confH2H: 72,
    hotspots: "Centro  Parco",
    timeSlots: "08-10  16-18",
    strongPts: 4,
    bizTotal: 78,
    competitors: 9,
    commDensB2B: 62,
    operDaysB2B: 1,
    cdIdx: 62,
    reachB2B: 74,
    roiB2B: 62,
    confB2B: 74,
    clusters: 3,
    topCats: "Retail  Salute",
    targetBiz: 35,
    strongZone: "Via Roma + centro",
    reddito: 24800,
    densita: 4800,
    stranieri: 9.8,
    indVec: 188,
    occup: 64.8,
    imprese: 980,
    dist: {
      cormano: 1.8,
      sesto: 4.9,
      bresso: 2.9,
      cinisello: 3.1,
      monza: 9.4,
      niguarda: 4.2,
      varedo: 3.2,
      paderno: 2.4,
      cusano: 0,
      quarto: 6.8,
      senago: 3.2
    }
  }],
  LAYERS = {
    d2d: [{
      id: "families",
      label: "Famiglie",
      field: "families",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "nuclei",
      src: "ISTAT",
      lo: "#FFF5F0",
      hi: "#C2410C"
    }, {
      id: "pop",
      label: "Popolazione",
      field: "pop",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "ab.",
      src: "ISTAT",
      lo: "#EFF6FF",
      hi: "#1E3A8A"
    }, {
      id: "densita",
      label: "Densit ab.",
      field: "densita",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "ab/km",
      src: "ISTAT",
      lo: "#F5F3FF",
      hi: "#4C1D95"
    }, {
      id: "coverage",
      label: "Peso sul totale",
      field: "coverage",
      fmt: n => n + "%",
      unit: "%",
      src: "Dati geografici",
      lo: "#ECFDF5",
      hi: "#065F3C"
    }, {
      id: "flyersMin",
      label: "Volantini consigliati",
      field: "flyersMin",
      fmt: n => n.toLocaleString("it-IT") + "+",
      unit: "pz.",
      src: "Analisi interna",
      lo: "#F0F9FF",
      hi: "#075985"
    }, {
      id: "familyIdx",
      label: "Residential relevance",
      field: "familyIdx",
      fmt: n => n + "/100",
      unit: "/100",
      src: "Analisi interna",
      lo: "#FDF2F8",
      hi: "#701A75"
    }, {
      id: "eta65",
      label: "Et 65+",
      field: "eta65",
      fmt: n => n + "%",
      unit: "over 65",
      src: "ISTAT",
      lo: "#FFFBEB",
      hi: "#78350F"
    }],
    h2h: [{
      id: "flowScore",
      label: "Intensita passaggio",
      field: "flowScore",
      fmt: n => n + "/100",
      unit: "/100",
      src: "Analisi interna",
      lo: "#EFF6FF",
      hi: "#1E3A8A"
    }, {
      id: "poi",
      label: "POI concentration",
      field: "poi",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "POI",
      src: "Google Places",
      lo: "#EFF6FF",
      hi: "#1E3A8A"
    }, {
      id: "transitStops",
      label: "Transit proximity",
      field: "transitStops",
      fmt: n => n + " fermate",
      unit: "fermate",
      src: "Trasporto pubblico / GTFS",
      lo: "#F5F3FF",
      hi: "#4C1D95"
    }, {
      id: "strongPts",
      label: "Hotspot operativi",
      field: "strongPts",
      fmt: n => n + " punti",
      unit: "punti",
      src: "Analisi interna",
      lo: "#ECFDF5",
      hi: "#065F3C"
    }, {
      id: "commDens",
      label: "Densit passaggio",
      field: "commDens",
      fmt: n => n + "/100",
      unit: "/100",
      src: "Analisi interna",
      lo: "#FFF5F0",
      hi: "#C2410C"
    }, {
      id: "nearbyBiz",
      label: "Attrattori locali",
      field: "nearbyBiz",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "att.",
      src: "Google Places",
      lo: "#ECFDF5",
      hi: "#065F3C"
    }],
    b2b: [{
      id: "bizTotal",
      label: "Attivit rilevate",
      field: "bizTotal",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "att.",
      src: "Google Places",
      lo: "#FDF2F8",
      hi: "#701A75"
    }, {
      id: "competitors",
      label: "Competitor",
      field: "competitors",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "comp.",
      src: "Google Places",
      lo: "#FFF5F0",
      hi: "#C2410C"
    }, {
      id: "commDensB2B",
      label: "Densit commerciale",
      field: "commDensB2B",
      fmt: n => n + "/100",
      unit: "/100",
      src: "Analisi interna",
      lo: "#FFFBEB",
      hi: "#78350F"
    }, {
      id: "clusters",
      label: "Forza cluster",
      field: "clusters",
      fmt: n => n + " cluster",
      unit: "cluster",
      src: "Analisi interna",
      lo: "#EFF6FF",
      hi: "#1E3A8A"
    }, {
      id: "targetBiz",
      label: "Rilevanza target",
      field: "targetBiz",
      fmt: n => n.toLocaleString("it-IT") + " att.",
      unit: "att.",
      src: "Google Places",
      lo: "#ECFDF5",
      hi: "#065F3C"
    }, {
      id: "reddito",
      label: "Reddito medio",
      field: "reddito",
      fmt: n => "EUR " + n.toLocaleString("it-IT"),
      unit: "EUR /anno",
      src: "Dati territoriali",
      lo: "#F0FDF4",
      hi: "#14532D"
    }, {
      id: "cdIdx",
      label: "Commercial Density Index",
      field: "cdIdx",
      fmt: n => n + "/100",
      unit: "/100",
      src: "Analisi interna",
      lo: "#F5F3FF",
      hi: "#4C1D95"
    }]
  },
  SERVICE_META = {
    d2d: {
      label: "Door to Door",
      icon: " ",
      color: C.orange,
      mode: "residential",
      src: ["ISTAT", "Mapbox", "OpenStreetMap", "landuse / buildings", "Dati geografici", "Analisi interna"],
      allocationSort: (n, i) => (i.familyIdx || 0) * 1.8 + (i.coverage || 0) * 1.2 + (i.families || 0) * .006 - (i.dist || 0) * 5 - ((n.familyIdx || 0) * 1.8 + (n.coverage || 0) * 1.2 + (n.families || 0) * .006 - (n.dist || 0) * 5),
      mainKpis: n => [{
        l: "Famiglie stimate",
        v: n.families.toLocaleString("it-IT"),
        u: "nuclei",
        src: "ISTAT",
        c: C.orange,
        icon: ""
      }, {
        l: "Popolazione stimata",
        v: n.pop.toLocaleString("it-IT"),
        u: "abitanti",
        src: "ISTAT",
        c: C.orange,
        icon: ""
      }, {
        l: "Superficie coperta",
        v: n.area + " km",
        u: "",
        src: "Dati geografici",
        c: C.blue,
        icon: ""
      }, {
        l: "Copertura stimata",
        v: n.coverage + "%",
        u: "",
        src: "ISTAT+GIS",
        c: C.green,
        icon: ""
      }, {
        l: "Range operativo",
        v: n.flyersMin.toLocaleString("it-IT") + " - " + n.flyersMax.toLocaleString("it-IT"),
        u: "pz.",
        src: "Calc.",
        c: C.green,
        icon: ""
      }, {
        l: "Giorni operativi",
        v: n.operDays + " giorni",
        u: "",
        src: "Operativo",
        c: C.yellow,
        icon: ""
      }, {
        l: "Comuni nel raggio",
        v: "-",
        u: "",
        src: "Dati geografici",
        c: C.blue,
        icon: ""
      }],
      advKpis: n => [{
        l: "Family Index",
        v: n.familyIdx,
        c: C.orange
      }, {
        l: "Reach Score",
        v: n.reachD2D,
        c: C.blue
      }, {
        l: "ROI Score",
        v: n.roiD2D,
        c: C.green
      }, {
        l: "Confidence",
        v: n.confD2D,
        c: C.purple
      }],
      aiCats: [{
        group: "Residential profile",
        l: "Famiglie",
        v: n => n.families.toLocaleString("it-IT") + " nuclei"
      }, {
        group: "Residential profile",
        l: "Popolazione",
        v: n => n.pop.toLocaleString("it-IT") + " ab."
      }, {
        group: "Residential profile",
        l: "Densita residenziale",
        v: n => n.densita.toLocaleString("it-IT") + " ab/km"
      }, {
        group: "Residential profile",
        l: "Tipologia area",
        v: n => n.areaType
      }, {
        group: "Demographic profile",
        l: "Eta 0-14",
        v: n => n.eta14 + "%"
      }, {
        group: "Demographic profile",
        l: "Eta 15-34",
        v: n => n.eta34 + "%"
      }, {
        group: "Demographic profile",
        l: "Eta 35-64",
        v: n => n.eta64 + "%"
      }, {
        group: "Demographic profile",
        l: "Et 65+",
        v: n => n.eta65 + "%"
      }, {
        group: "Demographic profile",
        l: "Genere",
        v: n => "M " + n.genderM + "%  F " + n.genderF + "%"
      }, {
        group: "Demographic profile",
        l: "Indice vecchiaia",
        v: n => n.indVec + "/100"
      }, {
        group: "Demographic profile",
        l: "% Stranieri",
        v: n => n.stranieri + "%"
      }, {
        group: "Economic context",
        l: "Reddito medio",
        v: n => "EUR " + n.reddito.toLocaleString("it-IT"),
        c: "green"
      }, {
        group: "Economic context",
        l: "Tasso occupazione",
        v: n => n.occup + "%",
        c: "green"
      }, {
        group: "Economic context",
        l: "Imprese come contesto",
        v: n => n.imprese.toLocaleString("it-IT")
      }, {
        group: "Operational reading",
        l: "Residential strength",
        v: n => n.familyIdx + "/100"
      }, {
        group: "Operational reading",
        l: "Copertura consigliata",
        v: n => n.coverage >= 88 ? "Copertura piena" : n.coverage >= 75 ? "Copertura selettiva estesa" : "Copertura selettiva"
      }, {
        group: "Operational reading",
        l: "Suitability campagna",
        v: n => n.reachD2D >= 86 ? "Alta" : n.reachD2D >= 76 ? "Buona" : "Mirata"
      }, {
        group: "Operational reading",
        l: "Confidence level",
        v: n => n.confD2D + "/100"
      }]
    },
    h2h: {
      label: "Hand to Hand",
      icon: "",
      color: C.blue,
      mode: "movement",
      src: ["Google Places", "Google Places", "OpenStreetMap", "Overpass", "Trasporto pubblico / GTFS", "Mapbox", "Analisi interna", "Dati geografici"],
      allocationSort: (n, i) => (i.flowScore || 0) * 2.4 + (i.strongPts || 0) * 13 + (i.transitStops || 0) * 1.9 + (i.poi || 0) * .18 + (i.commDens || 0) * 1.2 - (i.dist || 0) * 4 - ((n.flowScore || 0) * 2.4 + (n.strongPts || 0) * 13 + (n.transitStops || 0) * 1.9 + (n.poi || 0) * .18 + (n.commDens || 0) * 1.2 - (n.dist || 0) * 4),
      mainKpis: n => {
        const i = n.flowScore,
          r = i < 40 ? "Basso" : i < 60 ? "Medio" : i < 80 ? "Alto" : "Molto Alto",
          l = i < 40 ? C.red : i < 60 ? C.yellow : i < 80 ? C.green : C.purple;
        return [{
          l: "POI rilevanti",
          v: n.poi.toLocaleString("it-IT"),
          u: "POI",
          src: "Google Places",
          c: C.blue,
          icon: ""
        }, {
          l: "Competitor rilevati",
          v: Math.round(n.nearbyBiz * .28),
          u: "comp.",
          src: "Google Places",
          c: C.red,
          icon: ""
        }, {
          l: "Densit passaggio",
          v: n.commDens + "/100",
          u: "",
          src: "Analisi interna",
          c: C.orange,
          icon: " "
        }, {
          l: "Flusso potenziale",
          v: r + "  " + i + "/100",
          u: "",
          src: "Analisi interna",
          c: l,
          icon: ""
        }, {
          l: "Fermate / stazioni",
          v: n.transitStops + " fermate  " + n.trainStations + " staz.",
          u: "",
          src: "Trasporto pubblico / GTFS",
          c: C.purple,
          icon: ""
        }, {
          l: "Hotspot operativi",
          v: n.strongPts + " punti",
          u: "",
          src: "Analisi interna",
          c: C.green,
          icon: ""
        }, {
          l: "Giorni operativi",
          v: n.operDaysH2H + " giorni",
          u: "",
          src: "Operativo",
          c: C.yellow,
          icon: ""
        }];
      },
      advKpis: n => [{
        l: "Reach Score",
        v: n.reachH2H,
        c: C.blue
      }, {
        l: "ROI Score",
        v: n.roiH2H,
        c: C.green
      }, {
        l: "Confidence",
        v: n.confH2H,
        c: C.purple
      }, {
        l: "Reddito medio",
        v: n.reddito,
        c: C.green
      }],
      aiCats: [{
        group: "Movement profile",
        l: "Intensita passaggio",
        v: n => n.flowScore + "/100"
      }, {
        group: "Movement profile",
        l: "Anchor trasporto",
        v: n => n.transitStops + " fermate  " + n.trainStations + " staz."
      }, {
        group: "Movement profile",
        l: "Scuole / eventi",
        v: n => n.strongPts + " punti"
      }, {
        group: "Movement profile",
        l: "Rilevanza pedonale",
        v: n => n.commDens >= 75 ? "Alta" : n.commDens >= 58 ? "Media" : "Locale"
      }, {
        group: "Local attractiveness",
        l: "POI rilevanti",
        v: n => n.poi.toLocaleString("it-IT")
      }, {
        group: "Local attractiveness",
        l: "Attivit vicine",
        v: n => n.nearbyBiz.toLocaleString("it-IT")
      }, {
        group: "Local attractiveness",
        l: "Contesto mixed-use",
        v: n => n.areaType
      }, {
        group: "Operational timing",
        l: "Fasce consigliate",
        v: n => n.timeSlots
      }, {
        group: "Operational timing",
        l: "opportunita mattina",
        v: n => n.timeSlots.includes("08") || n.timeSlots.includes("07") ? "Forte" : "Media"
      }, {
        group: "Operational timing",
        l: "opportunita pranzo",
        v: n => n.timeSlots.includes("12") ? "Forte" : "Da validare"
      }, {
        group: "Operational reading",
        l: "Hotspot principale",
        v: n => n.hotspots
      }, {
        group: "Operational reading",
        l: "Punti operativi",
        v: n => n.strongPts + " suggeriti"
      }, {
        group: "Operational reading",
        l: "Exposure quality",
        v: n => n.flowScore >= 80 ? "Alta" : n.flowScore >= 65 ? "Buona" : "Mirata"
      }, {
        group: "Operational reading",
        l: "Confidence level",
        v: n => n.confH2H + "/100"
      }]
    },
    b2b: {
      label: "Business Distribution",
      icon: "",
      color: C.purple,
      mode: "business",
      src: ["Google Places", "Google Places", "OpenStreetMap", "Mapbox", "Analisi interna", "Dati geografici", "Dati territoriali"],
      allocationSort: (n, i) => (i.targetBiz || 0) * 1.9 + (i.commDensB2B || 0) * 2.2 + (i.clusters || 0) * 10 - (i.competitors || 0) * .35 - (i.dist || 0) * 3 - ((n.targetBiz || 0) * 1.9 + (n.commDensB2B || 0) * 2.2 + (n.clusters || 0) * 10 - (n.competitors || 0) * .35 - (n.dist || 0) * 3),
      mainKpis: n => [{
        l: "Attivit rilevate",
        v: n.bizTotal.toLocaleString("it-IT"),
        u: "att.",
        src: "Google Places",
        c: C.purple,
        icon: ""
      }, {
        l: "Competitor rilevati",
        v: n.competitors,
        u: "comp.",
        src: "Google Places",
        c: C.red,
        icon: ""
      }, {
        l: "Densit commerciale",
        v: n.commDensB2B + "/100",
        u: "",
        src: "Analisi interna",
        c: C.orange,
        icon: " "
      }, {
        l: "Reddito medio stimato",
        v: "EUR " + n.reddito.toLocaleString("it-IT"),
        u: "anno",
        src: "Dati territoriali",
        c: C.green,
        icon: ""
      }, {
        l: "Commercial Density Index",
        v: n.cdIdx + "/100",
        u: "",
        src: "Analisi interna",
        c: C.purple,
        icon: "-"
      }, {
        l: "Giorni operativi",
        v: n.operDaysB2B + " giorni",
        u: "",
        src: "Operativo",
        c: C.yellow,
        icon: ""
      }],
      advKpis: n => [{
        l: "Comm. Density",
        v: n.cdIdx,
        c: C.purple
      }, {
        l: "Reach Score",
        v: n.reachB2B,
        c: C.blue
      }, {
        l: "ROI Score",
        v: n.roiB2B,
        c: C.green
      }, {
        l: "Confidence",
        v: n.confB2B,
        c: C.orange
      }],
      aiCats: [{
        group: "Commercial profile",
        l: "Attivit rilevate",
        v: n => n.bizTotal.toLocaleString("it-IT") + " attivita"
      }, {
        group: "Commercial profile",
        l: "Categorie dominanti",
        v: n => n.topCats
      }, {
        group: "Commercial profile",
        l: "Densit commerciale",
        v: n => n.commDensB2B + "/100"
      }, {
        group: "Commercial profile",
        l: "Attivit target",
        v: n => n.targetBiz.toLocaleString("it-IT") + " att."
      }, {
        group: "Economic context",
        l: "Reddito medio stimato",
        v: n => "EUR " + n.reddito.toLocaleString("it-IT"),
        c: "green"
      }, {
        group: "Economic context",
        l: "Tasso occupazione",
        v: n => n.occup + "%"
      }, {
        group: "Economic context",
        l: "Base imprese locale",
        v: n => n.imprese.toLocaleString("it-IT")
      }, {
        group: "Competitive context",
        l: "Competitor rilevati",
        v: n => n.competitors.toLocaleString("it-IT")
      }, {
        group: "Competitive context",
        l: "Livello competizione",
        v: n => n.competitors > 30 ? "Alto" : n.competitors > 12 ? "Medio" : "Contenuto"
      }, {
        group: "Operational reading",
        l: "Cluster commerciali",
        v: n => n.clusters + " cluster"
      }, {
        group: "Operational reading",
        l: "Zona business forte",
        v: n => n.strongZone
      }, {
        group: "Operational reading",
        l: "Attrattivita commerciale",
        v: n => n.commDensB2B >= 78 ? "Alta" : n.commDensB2B >= 62 ? "Media" : "Da validare"
      }, {
        group: "Operational reading",
        l: "Confidence level",
        v: n => n.confB2B + "/100"
      }]
    }
  };
function getTargetBizMeta(n) {
  const i = n.businessCategory || n.targetBusinessType || n.businessSector || "altro";
  return BUSINESS_CATEGORIES[i] || BUSINESS_CATEGORIES.altro;
}
function bizCategoryChart(n, i) {
  const r = {};
  n.forEach(u => (u.topCats || "").split("  ").filter(Boolean).forEach((h, f) => {
    r[h] = (r[h] || 0) + Math.max(1, Math.round((u.bizTotal || 0) * (f === 0 ? .34 : f === 1 ? .24 : .16)));
  }));
  const l = Object.entries(r).map(([u, h]) => ({
    label: u,
    count: h,
    target: i.aliases.some(f => u.toLowerCase().includes(f.toLowerCase())) || u.toLowerCase().includes(i.label.toLowerCase().split(" ")[0])
  })).sort((u, h) => h.count - u.count);
  return l.length ? l : [{
    label: i.label,
    count: n.reduce((u, h) => u + (h.targetBiz || 0), 0),
    target: !0
  }];
}
function businessZoneScore(n) {
  return Math.round(Math.min(100, (n.commDensB2B || 0) * .34 + (n.reachB2B || 0) * .22 + (n.roiB2B || 0) * .18 + (n.targetBiz || 0) / Math.max(1, n.bizTotal || 1) * 100 * .16 + Math.min(10, (n.clusters || 0) * 1.2)));
}
function businessRows(n, i) {
  return [...n].sort((r, l) => businessZoneScore(l) - businessZoneScore(r)).map(r => ({
    id: r.id,
    name: r.strongZone || r.name,
    zoneName: r.name,
    score: businessZoneScore(r),
    activities: r.bizTotal || 0,
    target: r.targetBiz || 0,
    competitors: r.competitors || 0,
    density: r.commDensB2B || 0,
    clusters: r.clusters || 0,
    dominant: (r.topCats || i.label).split("  ")[0]
  }));
}
function h2hHotspotStrength(n) {
  return Math.round(Math.min(100, (n.flowScore || 0) * .42 + (n.commDens || 0) * .2 + Math.min(22, (n.transitStops || 0) * .9) + Math.min(12, (n.strongPts || 0) * 1.2) + Math.min(8, (n.poi || 0) / 38)));
}
function h2hHotspotRows(n) {
  return [...n].sort((i, r) => h2hHotspotStrength(r) - h2hHotspotStrength(i)).map(i => ({
    id: i.id,
    name: (i.hotspots || i.name).split("  ")[0],
    zoneName: i.name,
    strength: h2hHotspotStrength(i),
    poi: i.poi || 0,
    transit: (i.transitStops || 0) + (i.trainStations || 0),
    anchors: i.strongPts || 0,
    flow: i.flowScore || 0,
    density: i.commDens || 0,
    time: i.timeSlots || "Da validare",
    reason: i.flowScore >= 82 ? "Alta concentrazione di passaggio vicino ad anchor urbani." : i.transitStops >= 14 ? "Buona opportunita per flussi scuola-lavoro e trasporto." : "Zona utile per distribuzione manuale breve e mirata."
  }));
}
function normalizeH2HCategory(n) {
  return String(n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function countPoisByCategory(n, i) {
  return n.filter(r => i.some(l => normalizeH2HCategory(r.category).includes(l))).length;
}
function countTransportByType(n, i) {
  return (n?.stops || []).filter(r => {
    const l = [r.stopType, ...(r.routes || []).map(u => u.routeTypeLabel)].map(normalizeH2HCategory);
    return l.some(u => i.includes(u));
  }).length;
}
function buildH2HOperationalClusters(n, i, r) {
  const l = Array.isArray(n) ? n.filter(u => Number.isFinite(Number(u.lat)) && Number.isFinite(Number(u.lng))) : [];
  if (!l.length) return [];
  const u = r <= 2 ? .0015 : r <= 5 ? .003 : .005,
    h = new Map();
  l.forEach(f => {
    const m = `${Math.round(Number(f.lat) / u)}_${Math.round(Number(f.lng) / u)}`;
    if (!h.has(m)) h.set(m, []);
    h.get(m).push(f);
  });
  const T = Array.from(h.values()).map((f, m) => {
    const y = f.reduce((A, B) => A + Number(B.lat), 0) / f.length,
      x = f.reduce((A, B) => A + Number(B.lng), 0) / f.length,
      w = f.reduce((A, B) => A + (Number(B.priority) || 0), 0),
      j = f.filter(A => (Number(A.priority) || 0) >= 8).length,
      z = countPoisByCategory(f, ["stazione", "metro"]),
      R = countPoisByCategory(f, ["universit", "scuola"]),
      D = countPoisByCategory(f, ["centro comm", "teatro", "cinema", "attrazione", "mercato", "biblioteca", "bar", "caffe", "caff", "ristorante"]),
      W = Math.round(Math.min(100, w * 3 + j * 10 + z * 8 + R * 6 + Math.min(18, D * 2))),
      A = [...f].sort((B, P) => (Number(P.priority) || 0) - (Number(B.priority) || 0))[0];
    return {
      id: `h2h_cluster_${m}`,
      name: A?.name || `Zona operativa ${m + 1}`,
      zoneName: A?.category || "Cluster POI",
      lat: y,
      lng: x,
      poi: f.length,
      transit: z,
      anchors: R,
      attractions: D,
      strength: W,
      flow: W,
      density: Math.min(100, Math.round(f.length * 8)),
      time: "Da validare",
      reason: `${f.length.toLocaleString("it-IT")} POI reali nel cluster`,
      items: f
    };
  }).sort((f, m) => m.strength - f.strength);
  return T.map((f, m) => ({
    ...f,
    rank: m + 1,
    name: `Zona ${m + 1}  ${f.name}`
  }));
}
function getH2HMetrics(n, i, r) {
  const l = Array.isArray(n) ? n : [],
    u = Array.isArray(i?.stops) ? i.stops : [],
    h = buildH2HOperationalClusters(l, i, r),
    f = countPoisByCategory(l, ["stazione"]),
    m = countPoisByCategory(l, ["metro"]) + countTransportByType(i, ["metro"]),
    y = countTransportByType(i, ["train"]) + f,
    x = countPoisByCategory(l, ["universit"]),
    w = countPoisByCategory(l, ["centro comm", "teatro", "cinema", "attrazione", "mercato", "biblioteca", "bar", "caffe", "caff", "ristorante"]);
  return {
    poi: l.length,
    zones: h.length,
    hotspots: h.length,
    clusters: h,
    tplStops: u.length,
    stations: y,
    metro: m,
    universities: x,
    localAttractors: w,
    transitTotal: u.length + f + m,
    flowScore: h.length ? Math.round(h.reduce((z, R) => z + R.strength, 0) / h.length) : 0
  };
}
function categoryMatchesBusiness(n, i) {
  const r = normalizeH2HCategory(`${n?.category || ""} ${n?.name || ""}`),
    l = Array.isArray(i?.aliases) ? i.aliases.map(normalizeH2HCategory) : [];
  return l.length ? l.some(u => r.includes(u)) : true;
}
function buildBusinessOperationalClusters(n, i, r) {
  const l = Array.isArray(n) ? n.filter(u => Number.isFinite(Number(u.lat)) && Number.isFinite(Number(u.lng))) : [];
  if (!l.length) return [];
  const u = r <= 2 ? .0015 : r <= 5 ? .003 : .005,
    h = new Map();
  l.forEach(f => {
    const m = `${Math.round(Number(f.lat) / u)}_${Math.round(Number(f.lng) / u)}`;
    if (!h.has(m)) h.set(m, []);
    h.get(m).push(f);
  });
  return Array.from(h.values()).map((f, m) => {
    const y = f.reduce((A, B) => A + Number(B.lat), 0) / f.length,
      x = f.reduce((A, B) => A + Number(B.lng), 0) / f.length,
      w = f.reduce((A, B) => A + (Number(B.priority) || 0), 0),
      j = f.filter(A => categoryMatchesBusiness(A, i)).length,
      z = f.reduce((A, B) => {
        const P = B.category || "Altro";
        A[P] = (A[P] || 0) + 1;
        return A;
      }, {}),
      R = Object.entries(z).sort((A, B) => B[1] - A[1])[0]?.[0] || i?.label || "Business",
      D = Math.round(Math.min(100, w * 3 + j * 8 + f.length * 4)),
      W = [...f].sort((A, B) => (Number(B.priority) || 0) - (Number(A.priority) || 0))[0];
    return {
      id: `b2b_cluster_${m}`,
      name: `Zona ${m + 1}  ${W?.name || R}`,
      zoneName: R,
      lat: y,
      lng: x,
      activities: f.length,
      target: j,
      competitors: Math.max(0, f.length - j),
      density: Math.min(100, Math.round(f.length * 8)),
      clusters: 1,
      dominant: R,
      score: D,
      items: f
    };
  }).sort((f, m) => m.score - f.score);
}
function getBusinessMetrics(n, i, r) {
  const l = Array.isArray(n) ? n : [],
    h = buildBusinessOperationalClusters(l, i, r),
    f = l.filter(m => categoryMatchesBusiness(m, i)).length,
    u = l.reduce((m, y) => {
      const x = y.category || "Altro";
      m[x] = (m[x] || 0) + 1;
      return m;
    }, {}),
    T = Object.entries(u).map(([m, y]) => ({
      label: m,
      count: y,
      target: categoryMatchesBusiness({
        category: m
      }, i)
    })).sort((m, y) => y.count - m.count);
  return {
    businesses: l.length,
    competitors: Math.max(0, l.length - f),
    commercialDensity: h.length ? Math.round(h.reduce((m, y) => m + y.density, 0) / h.length) : 0,
    clusters: h.length,
    targetBusinesses: f,
    categories: T,
    clusterRows: h,
    cdIdx: h.length ? Math.round(h.reduce((m, y) => m + y.score, 0) / h.length) : 0
  };
}
function Pv(n) {
  const i = n.reduce((h, f) => h + (f.poi || 0), 0),
    r = n.reduce((h, f) => h + (f.transitStops || 0) + (f.trainStations || 0), 0),
    l = n.reduce((h, f) => h + (f.strongPts || 0), 0),
    u = n.reduce((h, f) => h + (f.nearbyBiz || 0), 0);
  return [{
    label: "POI rilevanti",
    value: i,
    color: Qi.pedestrian.color
  }, {
    label: "Fermate / stazioni",
    value: r,
    color: Qi.transit.color
  }, {
    label: "Scuole / eventi",
    value: l,
    color: Qi.school.color
  }, {
    label: "Attrattori locali",
    value: u,
    color: Qi.retail.color
  }];
}
function residentialStrength(n) {
  return Math.round(Math.min(100, (n.familyIdx || 0) * .34 + (n.reachD2D || 0) * .22 + (n.coverage || 0) * .2 + Math.min(16, (n.families || 0) / 1850) + Math.min(8, (n.mailboxes || 0) / 2400)));
}
function residentialRows(n) {
  return [...n].sort((i, r) => residentialStrength(r) - residentialStrength(i)).map((i, r) => ({
    id: i.id,
    rank: r + 1,
    name: i.name,
    strength: residentialStrength(i),
    families: i.families || 0,
    population: i.pop || 0,
    coverage: i.coverage || 0,
    required: i.families || 0,
    recommended: `${(i.flyersMin || 0).toLocaleString("it-IT")}-${(i.flyersMax || 0).toLocaleString("it-IT")}`,
    contribution: n.reduce((l, u) => l + (u.families || 0), 0) > 0 ? Math.round((i.families || 0) / n.reduce((l, u) => l + (u.families || 0), 0) * 100) : 0,
    areaType: i.areaType
  }));
}
const ZONE_COLORS = ["#2563EB", "#16A34A", "#7C3AED", "#0891B2", "#65A30D", "#0F766E", "#4F46E5", "#0284C7", "#15803D", "#6D28D9", "#0D9488"];
function getComuneColor(n = "") {
  const p = ["#14b8a6", "#3b82f6", "#8b5cf6", "#06b6d4", "#22c55e", "#6366f1"],
    i = [...n].reduce((r, l) => r + l.charCodeAt(0), 0);
  return p[i % p.length];
}
function normalizeTerritoryName(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function isMilanoTerritory(value) {
  return /\bmilano\b/.test(normalizeTerritoryName(value));
}
function isMilanoCoordinates(lat, lng) {
  const nLat = Number(lat),
    nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  return nLat >= 45.38 && nLat <= 45.56 && nLng >= 9.04 && nLng <= 9.31;
}
function pickRealComuneGeometry(z) {
  const geomRaw = z?.geometry_geojson || z?.geometry || z?.geojson || z?.geom || z?.feature?.geometry || null;
  if (!geomRaw) return null;
  if (typeof geomRaw === 'object') return geomRaw;
  try {
    const first = JSON.parse(geomRaw);
    if (typeof first === 'string') {
      const s = first.trim();
      if (s.startsWith('{') && s.endsWith('}') || s.startsWith('[') && s.endsWith(']')) {
        return JSON.parse(s);
      }
    }
    return first;
  } catch {
    return null;
  }
}
const RADIUS_OPTIONS = [.5, 1, 2, 3, 5, 8, 10],
  MW = 580,
  MH = 360,
  LAT_C = 45.548,
  LNG_C = 9.175,
  SCALE_Y = 4200,
  SCALE_X = 2800;
function s2proj(n, i) {
  return {
    x: MW / 2 + (i - LNG_C) * SCALE_X,
    y: MH / 2 - (n - LAT_C) * SCALE_Y
  };
}
function kmToPx(n) {
  return n * SCALE_X / 111.32;
}
function computePct(n, i, r) {
  const l = Math.sqrt(r / Math.PI);
  return n <= Math.max(0, i - l) ? 100 : n >= i + l ? 0 : Math.max(5, Math.min(99, Math.round((i + l - n) / (2 * l) * 100)));
}
function thColor(n, i, r, l, u) {
  if (n == null) return "rgba(255,255,255,.06)";
  const h = Math.max(0, Math.min(1, (n - i) / (r - i || 1))),
    f = (w, j) => parseInt(w.slice(j, j + 2), 16),
    m = Math.round(f(l, 1) * (1 - h) + f(u, 1) * h),
    y = Math.round(f(l, 3) * (1 - h) + f(u, 3) * h),
    x = Math.round(f(l, 5) * (1 - h) + f(u, 5) * h);
  return `rgb(${m},${y},${x})`;
}
function ScoreCircle({
  label: n,
  value: i,
  color: r
}) {
  const l = typeof i == "number" ? i : parseInt(i) || 0,
    u = 22,
    h = 26,
    f = 26,
    m = 2 * Math.PI * u,
    y = m * (l / 100);
  return _jsxs("div", {
    style: {
      textAlign: "center",
      padding: "10px 4px",
      background: "rgba(255,255,255,.04)",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,.06)"
    },
    children: [_jsxs("svg", {
      width: "52",
      height: "52",
      viewBox: "0 0 52 52",
      style: {
        display: "block",
        margin: "0 auto 5px"
      },
      children: [_jsx("circle", {
        cx: h,
        cy: f,
        r: u,
        fill: "none",
        stroke: "rgba(255,255,255,.08)",
        strokeWidth: "4"
      }), _jsx("circle", {
        cx: h,
        cy: f,
        r: u,
        fill: "none",
        stroke: r,
        strokeWidth: "4",
        strokeDasharray: `${y} ${m}`,
        strokeLinecap: "round",
        transform: "rotate(-90 26 26)"
      }), _jsx("text", {
        x: h,
        y: f + 4,
        textAnchor: "middle",
        fontFamily: F.serif,
        fontSize: "12",
        fill: r,
        fontWeight: "700",
        children: l
      })]
    }), _jsx("div", {
      style: {
        fontFamily: F.sans,
        fontSize: 9,
        color: "rgba(255,255,255,.42)",
        lineHeight: 1.3
      },
      children: n
    })]
  });
}
function DonutChart({
  data: n,
  colors: i,
  size: r = 72
}) {
  const l = r / 2,
    u = r / 2,
    h = r * .36,
    f = r * .22,
    m = n.reduce((x, w) => x + w, 0) || 1;
  let y = -Math.PI / 2;
  return _jsx("svg", {
    width: r,
    height: r,
    viewBox: `0 0 ${r} ${r}`,
    style: {
      flexShrink: 0
    },
    children: n.map((x, w) => {
      const j = x / m * 2 * Math.PI;
      if (j < .01) return null;
      const T = l + h * Math.cos(y),
        z = u + h * Math.sin(y),
        R = l + h * Math.cos(y + j),
        D = u + h * Math.sin(y + j),
        W = l + f * Math.cos(y + j),
        A = u + f * Math.sin(y + j),
        F = l + f * Math.cos(y),
        B = u + f * Math.sin(y),
        P = j > Math.PI ? 1 : 0,
        J = `M${T},${z}A${h},${h},0,${P},1,${R},${D}L${W},${A}A${f},${f},0,${P},0,${F},${B}Z`;
      return y += j, _jsx("path", {
        d: J,
        fill: i[w] || "#888"
      }, w);
    })
  });
}
const S2_CITIES = ZONE_DATA.map(z => ({
  ...z,
  ...(GEO_DATA.find(c => c.id === z.id) || {})
}));
const S2_RADII = RADIUS_OPTIONS;
const S2_ZONES = S2_CITIES;

// Dataset CAP Lombardia statico (fallback quando DB e vuoto)
const CAP_LOMBARDIA = [{
  postal_code: "20121",
  municipality_name: "Milano (Centro)"
}, {
  postal_code: "20122",
  municipality_name: "Milano (Duomo)"
}, {
  postal_code: "20123",
  municipality_name: "Milano (S.Ambrogio)"
}, {
  postal_code: "20124",
  municipality_name: "Milano (Repubblica)"
}, {
  postal_code: "20125",
  municipality_name: "Milano (Isola)"
}, {
  postal_code: "20126",
  municipality_name: "Milano (Bicocca)"
}, {
  postal_code: "20127",
  municipality_name: "Milano (Turro)"
}, {
  postal_code: "20128",
  municipality_name: "Milano (Crescenzago)"
}, {
  postal_code: "20129",
  municipality_name: "Milano (Porta Venezia)"
}, {
  postal_code: "20130",
  municipality_name: "Milano (Citt Studi)"
}, {
  postal_code: "20131",
  municipality_name: "Milano (Lambrate)"
}, {
  postal_code: "20132",
  municipality_name: "Milano (Cologno)"
}, {
  postal_code: "20133",
  municipality_name: "Milano (Argonne)"
}, {
  postal_code: "20134",
  municipality_name: "Milano (Mecenate)"
}, {
  postal_code: "20135",
  municipality_name: "Milano (Porta Romana)"
}, {
  postal_code: "20136",
  municipality_name: "Milano (Porta Ticinese)"
}, {
  postal_code: "20137",
  municipality_name: "Milano (Corsica)"
}, {
  postal_code: "20138",
  municipality_name: "Milano (Forlanini)"
}, {
  postal_code: "20139",
  municipality_name: "Milano (Vigentino)"
}, {
  postal_code: "20140",
  municipality_name: "Milano (Gratosoglio)"
}, {
  postal_code: "20141",
  municipality_name: "Milano (Bagnolo)"
}, {
  postal_code: "20142",
  municipality_name: "Milano (Barona)"
}, {
  postal_code: "20143",
  municipality_name: "Milano (Lorenteggio)"
}, {
  postal_code: "20144",
  municipality_name: "Milano (Porta Genova)"
}, {
  postal_code: "20145",
  municipality_name: "Milano (Pagano)"
}, {
  postal_code: "20146",
  municipality_name: "Milano (De Angeli)"
}, {
  postal_code: "20147",
  municipality_name: "Milano (Bande Nere)"
}, {
  postal_code: "20148",
  municipality_name: "Milano (S.Leonardo)"
}, {
  postal_code: "20149",
  municipality_name: "Milano (Washington)"
}, {
  postal_code: "20150",
  municipality_name: "Milano (S.Siro)"
}, {
  postal_code: "20151",
  municipality_name: "Milano (QT8)"
}, {
  postal_code: "20152",
  municipality_name: "Milano (Quinto Romano)"
}, {
  postal_code: "20153",
  municipality_name: "Milano (Baggio)"
}, {
  postal_code: "20154",
  municipality_name: "Milano (Sempione)"
}, {
  postal_code: "20155",
  municipality_name: "Milano (Musocco)"
}, {
  postal_code: "20156",
  municipality_name: "Milano (Vialba)"
}, {
  postal_code: "20157",
  municipality_name: "Milano (Quarto Oggiaro)"
}, {
  postal_code: "20158",
  municipality_name: "Milano (Niguarda)"
}, {
  postal_code: "20159",
  municipality_name: "Milano (Bruzzano)"
}, {
  postal_code: "20160",
  municipality_name: "Milano (Affori)"
}, {
  postal_code: "20161",
  municipality_name: "Milano (Bovisa)"
}, {
  postal_code: "20162",
  municipality_name: "Milano (Comasina)"
}, {
  postal_code: "20041",
  municipality_name: "Agrate Brianza"
}, {
  postal_code: "20048",
  municipality_name: "Carate Brianza"
}, {
  postal_code: "20020",
  municipality_name: "Lainate"
}, {
  postal_code: "20021",
  municipality_name: "Bollate"
}, {
  postal_code: "20032",
  municipality_name: "Cormano"
}, {
  postal_code: "20091",
  municipality_name: "Bresso"
}, {
  postal_code: "20092",
  municipality_name: "Cinisello Balsamo"
}, {
  postal_code: "20093",
  municipality_name: "Cologno Monzese"
}, {
  postal_code: "20094",
  municipality_name: "Corsico"
}, {
  postal_code: "20095",
  municipality_name: "Cusano Milanino"
}, {
  postal_code: "20096",
  municipality_name: "Pioltello"
}, {
  postal_code: "20097",
  municipality_name: "San Donato Milanese"
}, {
  postal_code: "20098",
  municipality_name: "San Giuliano Milanese"
}, {
  postal_code: "20099",
  municipality_name: "Sesto San Giovanni"
}, {
  postal_code: "20100",
  municipality_name: "Milano"
}, {
  postal_code: "20010",
  municipality_name: "Pogliano Milanese"
}, {
  postal_code: "20011",
  municipality_name: "Corbetta"
}, {
  postal_code: "20012",
  municipality_name: "Cuggiono"
}, {
  postal_code: "20013",
  municipality_name: "Magenta"
}, {
  postal_code: "20014",
  municipality_name: "Nerviano"
}, {
  postal_code: "20015",
  municipality_name: "Parabiago"
}, {
  postal_code: "20016",
  municipality_name: "Pero"
}, {
  postal_code: "20017",
  municipality_name: "Rho"
}, {
  postal_code: "20018",
  municipality_name: "Sedriano"
}, {
  postal_code: "20019",
  municipality_name: "Settimo Milanese"
}, {
  postal_code: "20022",
  municipality_name: "Castano Primo"
}, {
  postal_code: "20023",
  municipality_name: "Cerro Maggiore"
}, {
  postal_code: "20024",
  municipality_name: "Garbagnate Milanese"
}, {
  postal_code: "20025",
  municipality_name: "Legnano"
}, {
  postal_code: "20026",
  municipality_name: "Novate Milanese"
}, {
  postal_code: "20027",
  municipality_name: "Rescaldina"
}, {
  postal_code: "20028",
  municipality_name: "San Vittore Olona"
}, {
  postal_code: "20029",
  municipality_name: "Turbigo"
}, {
  postal_code: "20030",
  municipality_name: "Barlassina"
}, {
  postal_code: "20031",
  municipality_name: "Cesano Maderno"
}, {
  postal_code: "20033",
  municipality_name: "Desio"
}, {
  postal_code: "20034",
  municipality_name: "Giussano"
}, {
  postal_code: "20035",
  municipality_name: "Lissone"
}, {
  postal_code: "20036",
  municipality_name: "Meda"
}, {
  postal_code: "20037",
  municipality_name: "Paderno Dugnano"
}, {
  postal_code: "20038",
  municipality_name: "Seregno"
}, {
  postal_code: "20039",
  municipality_name: "Varedo"
}, {
  postal_code: "20040",
  municipality_name: "Agrate Brianza"
}, {
  postal_code: "20042",
  municipality_name: "Brugherio"
}, {
  postal_code: "20043",
  municipality_name: "Arcore"
}, {
  postal_code: "20044",
  municipality_name: "Bellusco"
}, {
  postal_code: "20045",
  municipality_name: "Besana in Brianza"
}, {
  postal_code: "20046",
  municipality_name: "Biassono"
}, {
  postal_code: "20047",
  municipality_name: "Briosco"
}, {
  postal_code: "20049",
  municipality_name: "Concorezzo"
}, {
  postal_code: "20050",
  municipality_name: "Burago di Molgora"
}, {
  postal_code: "20051",
  municipality_name: "Limbiate"
}, {
  postal_code: "20052",
  municipality_name: "Monza"
}, {
  postal_code: "20053",
  municipality_name: "Muggi"
}, {
  postal_code: "20054",
  municipality_name: "Nova Milanese"
}, {
  postal_code: "20055",
  municipality_name: "Renate"
}, {
  postal_code: "20056",
  municipality_name: "Trezzo sull'Adda"
}, {
  postal_code: "20057",
  municipality_name: "Vedano al Lambro"
}, {
  postal_code: "20058",
  municipality_name: "Villasanta"
}, {
  postal_code: "20059",
  municipality_name: "Vimercate"
}, {
  postal_code: "20060",
  municipality_name: "Bussero"
}, {
  postal_code: "20061",
  municipality_name: "Carugate"
}, {
  postal_code: "20062",
  municipality_name: "Cassano d'Adda"
}, {
  postal_code: "20063",
  municipality_name: "Cernusco sul Naviglio"
}, {
  postal_code: "20064",
  municipality_name: "Gorgonzola"
}, {
  postal_code: "20065",
  municipality_name: "Inzago"
}, {
  postal_code: "20066",
  municipality_name: "Melzo"
}, {
  postal_code: "20067",
  municipality_name: "Paullo"
}, {
  postal_code: "20068",
  municipality_name: "Peschiera Borromeo"
}, {
  postal_code: "20069",
  municipality_name: "Vaprio d'Adda"
}, {
  postal_code: "20070",
  municipality_name: "Dresano"
}, {
  postal_code: "20071",
  municipality_name: "Casalpusterlengo"
}, {
  postal_code: "20072",
  municipality_name: "Fizzonasco"
}, {
  postal_code: "20073",
  municipality_name: "Opera"
}, {
  postal_code: "20074",
  municipality_name: "Ornago"
}, {
  postal_code: "20075",
  municipality_name: "Lodi Vecchio"
}, {
  postal_code: "20076",
  municipality_name: "Milanofiori"
}, {
  postal_code: "20077",
  municipality_name: "Melegnano"
}, {
  postal_code: "20078",
  municipality_name: "S. Colombano al Lambro"
}, {
  postal_code: "20079",
  municipality_name: "Zibido San Giacomo"
}, {
  postal_code: "20080",
  municipality_name: "Albairate"
}, {
  postal_code: "20081",
  municipality_name: "Abbiategrasso"
}, {
  postal_code: "20082",
  municipality_name: "Noviglio"
}, {
  postal_code: "20083",
  municipality_name: "Gaggiano"
}, {
  postal_code: "20084",
  municipality_name: "Lacchiarella"
}, {
  postal_code: "20085",
  municipality_name: "Locate di Triulzi"
}, {
  postal_code: "20086",
  municipality_name: "Motta Visconti"
}, {
  postal_code: "20087",
  municipality_name: "Robecco sul Naviglio"
}, {
  postal_code: "20088",
  municipality_name: "Rosate"
}, {
  postal_code: "20089",
  municipality_name: "Rozzano"
}, {
  postal_code: "20090",
  municipality_name: "Assago"
}, {
  postal_code: "24100",
  municipality_name: "Bergamo"
}, {
  postal_code: "24121",
  municipality_name: "Bergamo (Centro)"
}, {
  postal_code: "24122",
  municipality_name: "Bergamo"
}, {
  postal_code: "24123",
  municipality_name: "Bergamo"
}, {
  postal_code: "24124",
  municipality_name: "Bergamo"
}, {
  postal_code: "24125",
  municipality_name: "Bergamo"
}, {
  postal_code: "24126",
  municipality_name: "Bergamo"
}, {
  postal_code: "24127",
  municipality_name: "Bergamo"
}, {
  postal_code: "24128",
  municipality_name: "Bergamo"
}, {
  postal_code: "24129",
  municipality_name: "Bergamo"
}, {
  postal_code: "25100",
  municipality_name: "Brescia"
}, {
  postal_code: "25121",
  municipality_name: "Brescia (Centro)"
}, {
  postal_code: "25122",
  municipality_name: "Brescia"
}, {
  postal_code: "25123",
  municipality_name: "Brescia"
}, {
  postal_code: "25124",
  municipality_name: "Brescia"
}, {
  postal_code: "25125",
  municipality_name: "Brescia"
}, {
  postal_code: "25126",
  municipality_name: "Brescia"
}, {
  postal_code: "25127",
  municipality_name: "Brescia"
}, {
  postal_code: "25128",
  municipality_name: "Brescia"
}, {
  postal_code: "25129",
  municipality_name: "Brescia"
}, {
  postal_code: "25131",
  municipality_name: "Brescia"
}, {
  postal_code: "25132",
  municipality_name: "Brescia"
}, {
  postal_code: "22100",
  municipality_name: "Como"
}, {
  postal_code: "22100",
  municipality_name: "Como (Centro)"
}, {
  postal_code: "23100",
  municipality_name: "Sondrio"
}, {
  postal_code: "26100",
  municipality_name: "Cremona"
}, {
  postal_code: "27100",
  municipality_name: "Pavia"
}, {
  postal_code: "28100",
  municipality_name: "Novara"
}, {
  postal_code: "46100",
  municipality_name: "Mantova"
}, {
  postal_code: "21100",
  municipality_name: "Varese"
}, {
  postal_code: "21013",
  municipality_name: "Gallarate"
}, {
  postal_code: "21047",
  municipality_name: "Saronno"
}, {
  postal_code: "21052",
  municipality_name: "Busto Arsizio"
}, {
  postal_code: "21053",
  municipality_name: "Castellanza"
}, {
  postal_code: "21057",
  municipality_name: "Olgiate Olona"
}];
const BUSINESS_CATEGORIES = {
  retail: {
    label: "Retail / Negozio",
    color: C.orange,
    aliases: ["negozio", "retail", "abbigliamento"]
  },
  food: {
    label: "Ristorazione / Food",
    color: C.blue,
    aliases: ["food", "ristorante", "bar", "pizzeria"]
  },
  servizi: {
    label: "Servizi alla persona",
    color: C.purple,
    aliases: ["servizi", "estetica", "parrucchiere"]
  },
  salute: {
    label: "Salute / Benessere",
    color: C.green,
    aliases: ["salute", "farmacia", "clinica"]
  },
  immobiliare: {
    label: "Immobiliare",
    color: C.teal,
    aliases: ["immobiliare", "agenzia"]
  },
  gdo: {
    label: "GDO / Supermercati",
    color: C.yellow,
    aliases: ["gdo", "supermercato"]
  },
  altro: {
    label: "Altro",
    color: C.white,
    aliases: []
  }
};
const H2H_HOTSPOT_META = {
  transit: {
    label: "Transit / Stazioni",
    color: C.purple,
    icon: ""
  },
  school: {
    label: "Scuole / Eventi",
    color: C.orange,
    icon: ""
  },
  retail: {
    label: "Retail / Piazze",
    color: C.blue,
    icon: ""
  },
  flow: {
    label: "Flusso / Passaggio",
    color: C.teal,
    icon: ""
  }
};
const Qi = {
  pedestrian: {
    color: C.blue
  },
  transit: {
    color: C.purple
  },
  school: {
    color: C.orange
  },
  retail: {
    color: C.green
  }
};
const truthfulSourceLabel = s => s || "Dati interni";
function ScoreGauge({
  label,
  value,
  color
}) {
  const hasValue = value !== null && value !== undefined && value !== "";
  const numericValue = hasValue && Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 0;
  return <div style={{
    padding: "8px",
    borderRadius: 8,
    background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.06)"
  }}>
      <div style={{
      fontFamily: F.sans,
      fontSize: 8,
      color: "rgba(255,255,255,.3)",
      textTransform: "uppercase",
      marginBottom: 4
    }}>{label}</div>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8
    }}>
        <div style={{
        flex: 1,
        height: 4,
        background: "rgba(255,255,255,.1)",
        borderRadius: 2,
        overflow: "hidden"
      }}>
          <div style={{
          width: `${numericValue}%`,
          height: "100%",
          background: color
        }} />
        </div>
        <div style={{
        fontFamily: F.serif,
        fontSize: 12,
        color: color,
        fontWeight: 700
      }}>
          <MetricValue value={value} />
        </div>
      </div>
    </div>;
}
function MiniDonut({
  data,
  colors,
  size = 48
}) {
  return <DonutChart data={data} colors={colors} size={size} />;
}
const xn = ({
  children
}) => _jsx("div", {
  style: {
    fontFamily: F.sans,
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,.35)",
    textTransform: "uppercase",
    letterSpacing: ".05em",
    marginBottom: 8
  },
  children
});
const yr = "div";
const Ov = [{
  value: "retail",
  label: "Retail / Negozio"
}, {
  value: "food",
  label: "Ristorazione / Food"
}, {
  value: "servizi",
  label: "Servizi alla persona"
}, {
  value: "salute",
  label: "Salute / Benessere"
}, {
  value: "immobiliare",
  label: "Immobiliare"
}, {
  value: "gdo",
  label: "GDO / Supermercati"
}, {
  value: "altro",
  label: "Altro"
}];
const Bv = [{
  value: 1,
  label: "1 Promoter"
}, {
  value: 2,
  label: "2 Promoter"
}, {
  value: 3,
  label: "3 Promoter"
}, {
  value: 4,
  label: "4 Promoter"
}, {
  value: 5,
  label: "5 Promoter (Team)"
}];
const Mv = [{
  value: "07:30-11:30",
  label: "Mattina Presto (7:30 - 11:30)"
}, {
  value: "09:00-13:00",
  label: "Mattina (9:00 - 13:00)"
}, {
  value: "11:30-15:30",
  label: "Pranzo (11:30 - 15:30)"
}, {
  value: "15:00-19:00",
  label: "Pomeriggio (15:00 - 19:00)"
}, {
  value: "18:00-22:00",
  label: "Sera / Aperitivo (18:00 - 22:00)"
}];
const Fv = [{
  value: 4,
  label: "4 Ore (Mezza giornata)"
}, {
  value: 8,
  label: "8 Ore (Giornata intera)"
}];
const Nv = [{
  value: "stazione",
  label: "Stazione Treno / Metro"
}, {
  value: "piazza",
  label: "Piazza / Via Principale"
}, {
  value: "centro_commerciale",
  label: "Centro Commerciale (Esterno)"
}, {
  value: "universita",
  label: "Universita / Scuole"
}, {
  value: "fiera_evento",
  label: "Fiera / Evento"
}];
const $v = [{
  value: "negozi",
  label: "Negozi al dettaglio"
}, {
  value: "uffici",
  label: "Uffici e Studi"
}, {
  value: "ristoranti",
  label: "Ristoranti e Bar"
}, {
  value: "aziende",
  label: "Aziende / B2B puro"
}];
const Lv = [{
  value: "abbigliamento",
  label: "Abbigliamento / Moda"
}, {
  value: "tecnologia",
  label: "Tecnologia / Elettronica"
}, {
  value: "servizi_professionali",
  label: "Servizi Professionali"
}, {
  value: "horeca",
  label: "Ho.Re.Ca."
}, {
  value: "tutte",
  label: "Qualsiasi categoria locale"
}];
const Iv = [{
  value: 50,
  label: "Circa 50 attivita"
}, {
  value: 100,
  label: "Circa 100 attivita"
}, {
  value: 200,
  label: "Circa 200 attivita"
}, {
  value: 500,
  label: "Circa 500 attivita"
}];
const km = [{
  value: "reception",
  label: "Consegna a Reception / Banco"
}, {
  value: "cassetta",
  label: "Cassetta Postale Aziendale"
}, {
  value: "mano_manager",
  label: "Consegna a mano al Responsabile (+20%)"
}];
const Uv = [{
  id: "A6",
  label: "A6",
  size: "10x15 cm"
}, {
  id: "A5",
  label: "A5",
  size: "15x21 cm"
}, {
  id: "A4",
  label: "A4",
  size: "21x29 cm"
}, {
  id: "DL",
  label: "DL",
  size: "10x21 cm"
}];
const Kp = [{
  id: "gps_pro",
  icon: "",
  label: "Tracking GPS Live",
  price: "49 flat",
  desc: "Accesso mappa GPS in tempo reale durante la campagna",
  col: C.blue
}, {
  id: "proof_foto",
  icon: "",
  label: "Proof Fotografico",
  price: "29 flat",
  desc: "Report fotografico (20-30 foto) dei volantini consegnati",
  col: C.purple
}, {
  id: "report_plus",
  icon: "",
  label: "Report Analytics",
  price: "39 flat",
  desc: "Analisi post-campagna dettagliata su conversioni stimate",
  col: C.green
}];
const Gu = [{
  id: "single",
  label: "Singola",
  icon: "",
  disc: 0
}, {
  id: "monthly3",
  label: "Trimestrale",
  icon: "",
  disc: 5
}, {
  id: "monthly6",
  label: "Semestrale",
  icon: "",
  disc: 10
}, {
  id: "monthly12",
  label: "Annuale",
  icon: "",
  disc: 15
}];
function apiToZones(apiData, city) {
  if (import.meta.env.DEV) {
    console.debug('[DBG apiToZones normalized]', apiData ? {
      error: apiData.error,
      hasValues: !!apiData.values,
      breakdownLen: apiData.comuni_breakdown?.length,
      firstKeys: apiData.comuni_breakdown?.[0] ? Object.keys(apiData.comuni_breakdown[0]) : []
    } : null);
  }
  if (!apiData || apiData.error || !apiData.values) return null;
  const v = apiData.values;
  const analysisLevel = apiData.metadata?.analysis_level || apiData.values?.analysis_level || "comune";
  const breakdown = analysisLevel === "nil" && Array.isArray(apiData.nil_breakdown) && apiData.nil_breakdown.length ? apiData.nil_breakdown : apiData.comuni_breakdown || [];
  const totF = v.famiglie_stimate || v.families || v.households || 0;
  const totP = v.popolazione_stimata || v.population || 0;
  const totV = v.volantini_consigliati || v.volantini_stimati || v.recommended_flyers || 0;
  const nC = breakdown.length || 1;
  const items = breakdown.length > 0 ? breakdown : [{
    comune_name: city?.name || 'Area',
    pct_copertura: v.copertura_stimata || 80,
    volantini_nel_raggio: totV
  }];
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
    const ri = v.reach_score || 70,
      ro = v.roi_score || 70,
      co = v.confidence_score || 75,
      fi = v.family_index || 70;
    const area = c.area_km2 > 0 ? Math.round(c.area_km2 * ratio * 10) / 10 : Math.round((v.area_km2 || 0) * ratio * 10) / 10;
    return {
      id: `${isNil ? "nil" : "api"}_${idx}_${String(territoryCode || territoryName).toLowerCase().replace(/\s+/g, '_')}`,
      name: territoryName,
      territoryLevel,
      isNil,
      nilCode: c.nil_code || null,
      municipality_code: c.comune_code || c.municipality_code || null,
      area,
      pop,
      families: fam,
      mailboxes: Math.round(fam * 0.93),
      coverage: pct,
      volantiniNelRaggio: Math.round(vol),
      familiesInRadius: fam,
      flyersMin: Math.round(vol),
      flyersMax: Math.round(vol * 1.1),
      operDays: Math.max(1, Math.ceil(vol / 4000)),
      familyIdx: fi,
      reachD2D: ri,
      roiD2D: ro,
      confD2D: co,
      eta14: null,
      eta34: null,
      eta64: null,
      eta65: null,
      genderM: 49,
      genderF: 51,
      stranieri: null,
      indVec: c.old_age_index ?? null,
      densita: c.density_per_km2 > 0 ? Math.round(c.density_per_km2) : Math.round(pop / Math.max(0.1, area || 1)),
      reddito: c.average_income ?? null,
      occup: null,
      imprese: c.businesses_total ?? null,
      areaType: isNil ? 'NIL Milano' : 'Territoriale',
      poi: 0,
      nearbyBiz: 0,
      commDens: Math.min(100, Math.round(fi * 0.72)),
      flowScore: Math.min(100, Math.round(ri * 0.82)),
      transitStops: Math.max(2, Math.round((v.area_km2 || 5) * ratio * 2)),
      trainStations: 0,
      operDaysH2H: Math.max(1, Math.ceil(vol / 8000)),
      reachH2H: Math.round(ri * 0.85),
      roiH2H: Math.round(ro * 0.8),
      confH2H: Math.round(co * 0.85),
      hotspots: territoryName,
      timeSlots: null,
      strongPts: 0,
      bizTotal: 0,
      competitors: 0,
      commDensB2B: Math.min(100, Math.round(fi * 0.65)),
      operDaysB2B: Math.max(1, Math.ceil(vol / 10000)),
      cdIdx: Math.min(100, Math.round(fi * 0.65)),
      reachB2B: Math.round(ri * 0.8),
      roiB2B: Math.round(ro * 0.75),
      confB2B: Math.round(co * 0.8),
      clusters: Math.max(1, Math.round((area || 0) / 3)),
      topCats: null,
      targetBiz: 0,
      strongZone: territoryName,
      dist: {},
      geometry_geojson: pickRealComuneGeometry(c),
      geometry: pickRealComuneGeometry(c),
      source_flags: isNil ? ['NIL ufficiale Comune di Milano', 'ISTAT ripartito su geometria'] : []
    };
  });
}
function getZoneCoords(z, city, idx, total) {
  const geo = GEO_DATA.find(c => c.id === z.id);
  if (geo) return geo;
  if (!city) return null;
  const angle = idx / Math.max(1, total) * 2 * Math.PI - Math.PI / 2;
  const d = 0.012 + idx % 3 * 0.007;
  return {
    lat: city.lat + Math.sin(angle) * d,
    lng: city.lng + Math.cos(angle) * d * 1.4
  };
}
function capToZone(capData, idx) {
  const fam = Math.round(Number(capData.households_estimated) || 0);
  const pop = Math.round(Number(capData.population_estimated) || 0);
  const area = Math.round((Number(capData.area_km2) || 0) * 10) / 10;
  const vol = Math.round(Number(capData.recommended_flyers) || fam * 1.05);
  return {
    id: `cap_${capData.postal_code}`,
    name: `CAP ${capData.postal_code}`,
    isCap: true,
    postalCode: capData.postal_code,
    municipalityName: capData.municipality_name,
    area,
    pop,
    families: fam,
    mailboxes: Math.round(fam * 0.93),
    coverage: 100,
    volantiniNelRaggio: Math.round(vol),
    familiesInRadius: fam,
    flyersMin: Math.round(vol),
    flyersMax: Math.round(vol * 1.05),
    operDays: Math.max(1, Math.ceil(vol / 4000)),
    familyIdx: 75,
    reachD2D: 80,
    roiD2D: 75,
    confD2D: 85,
    eta14: null,
    eta34: null,
    eta64: null,
    eta65: null,
    genderM: 49,
    genderF: 51,
    stranieri: 10,
    indVec: 170,
    densita: area > 0 ? Math.round(pop / area) : 0,
    reddito: 25000,
    occup: 65,
    imprese: Math.round(fam * 0.06),
    areaType: 'Residenziale (CAP)',
    poi: Math.round(fam / 70),
    nearbyBiz: Math.round(fam / 150),
    commDens: 70,
    flowScore: 75,
    transitStops: Math.max(2, Math.round(area * 3)),
    trainStations: 0,
    operDaysH2H: Math.max(1, Math.ceil(vol / 8000)),
    reachH2H: 82,
    roiH2H: 78,
    confH2H: 80,
    hotspots: 'Centro CAP',
    timeSlots: '08-12  14-18',
    strongPts: 4,
    bizTotal: Math.round(fam * 0.05),
    competitors: Math.max(1, Math.round(fam * 0.003)),
    commDensB2B: 72,
    operDaysB2B: Math.max(1, Math.ceil(vol / 10000)),
    cdIdx: 72,
    reachB2B: 78,
    roiB2B: 75,
    confB2B: 82,
    clusters: Math.max(1, Math.round(area / 2)),
    topCats: 'Retail  Food  Servizi',
    targetBiz: Math.round(fam * 0.03),
    strongZone: 'Centro CAP',
    dist: {},
    geometry_geojson: pickRealComuneGeometry(capData),
    source_flags: capData.source_flags || ['Stima territoriale']
  };
}
// Section
// ADMIN DASHBOARD - VolantiniPro
// Section

// Mock data
const ADMIN_CAMPAIGNS = [{
  id: "C001",
  client: "Farmacia Centrale",
  svc: "d2d",
  zone: "Cormano  Varedo",
  qty: 12000,
  status: "active",
  date: "2025-05-05",
  total: 204.60,
  days: 3,
  discount: 40
}, {
  id: "C002",
  client: "Bar Sport Srl",
  svc: "h2h",
  zone: "Sesto  Cinisello",
  qty: 8000,
  status: "pending",
  date: "2025-05-08",
  total: 176.00,
  days: 2,
  discount: 0
}, {
  id: "C003",
  client: "Studio Rossi",
  svc: "b2b",
  zone: "Bresso  Cusano",
  qty: 5000,
  status: "done",
  date: "2025-04-28",
  total: 420.00,
  days: 1,
  discount: 20
}, {
  id: "C004",
  client: "Pizzeria Napoli",
  svc: "d2d",
  zone: "Paderno Dugnano",
  qty: 15000,
  status: "active",
  date: "2025-05-06",
  total: 277.50,
  days: 4,
  discount: 30
}, {
  id: "C005",
  client: "GymFit Center",
  svc: "h2h",
  zone: "Cinisello Balsamo",
  qty: 10000,
  status: "pending",
  date: "2025-05-10",
  total: 198.00,
  days: 3,
  discount: 0
}, {
  id: "C006",
  client: "Ottica Bianchi",
  svc: "b2b",
  zone: "Cormano",
  qty: 3000,
  status: "done",
  date: "2025-04-20",
  total: 315.00,
  days: 1,
  discount: 0
}, {
  id: "C007",
  client: "Supermercato OK",
  svc: "d2d",
  zone: "Varedo  Senago",
  qty: 20000,
  status: "active",
  date: "2025-05-04",
  total: 333.00,
  days: 5,
  discount: 40
}, {
  id: "C008",
  client: "Studio Legale MT",
  svc: "b2b",
  zone: "Sesto S.G.",
  qty: 2000,
  status: "pending",
  date: "2025-05-12",
  total: 280.00,
  days: 1,
  discount: 0
}];
const ADMIN_WAITLIST = [{
  name: "Marco Ferretti",
  tel: "+39 333 111 2222",
  email: "marco@mail.it",
  days: "23, 24, 25 Mag",
  zone: "Cormano",
  date: "2025-05-02"
}, {
  name: "Laura Conti",
  tel: "+39 347 222 3333",
  email: "laura@mail.it",
  days: "12, 13 Mag",
  zone: "Bresso",
  date: "2025-05-03"
}, {
  name: "Giuseppe Marra",
  tel: "+39 366 333 4444",
  email: "giuseppe@mail.it",
  days: "19, 20 Mag",
  zone: "Cinisello",
  date: "2025-05-04"
}, {
  name: "Anna Ricci",
  tel: "+39 380 444 5555",
  email: "anna@mail.it",
  days: "26, 27 Mag",
  zone: "Sesto",
  date: "2025-05-05"
}, {
  name: "Paolo Greco",
  tel: "+39 392 555 6666",
  email: "paolo@mail.it",
  days: "5, 6 Mag",
  zone: "Varedo",
  date: "2025-05-01"
}];
const ADMIN_MONTHLY = [{
  m: "Gen",
  rev: 1240,
  camp: 4
}, {
  m: "Feb",
  rev: 1680,
  camp: 6
}, {
  m: "Mar",
  rev: 2100,
  camp: 7
}, {
  m: "Apr",
  rev: 1890,
  camp: 6
}, {
  m: "Mag",
  rev: 2640,
  camp: 8
}, {
  m: "Giu",
  rev: 0,
  camp: 0
}];
const SVC_BADGE = {
  d2d: {
    icon: " ",
    label: "D2D",
    col: "#E8571A"
  },
  h2h: {
    icon: "",
    label: "H2H",
    col: "#60A5FA"
  },
  b2b: {
    icon: "",
    label: "B2B",
    col: "#A78BFA"
  }
};
const STATUS_CFG = {
  active: {
    label: "In distribuzione",
    bg: "rgba(46,204,138,.15)",
    col: "#2ECC8A",
    dot: "#2ECC8A"
  },
  pending: {
    label: "In attesa",
    bg: "rgba(251,191,36,.12)",
    col: "#FBBF24",
    dot: "#FBBF24"
  },
  done: {
    label: "Completata",
    bg: "rgba(255,255,255,.06)",
    col: "rgba(255,255,255,.45)",
    dot: "rgba(255,255,255,.3)"
  }
};
const ADMIN_OP_FILTERS = [{
  id: "pairing",
  label: "Con Smart Pairing"
}, {
  id: "confirm",
  label: "Da confermare"
}, {
  id: "compatible",
  label: "Zona compatibile"
}];
function adminCampaignZones(campaign) {
  const zoneText = (campaign.zone || "").toLowerCase();
  return S2_ZONES.filter(z => zoneText.includes(z.name.split(" ")[0].toLowerCase()));
}
function adminServiceAnalysis(campaign) {
  const zones = adminCampaignZones(campaign);
  if (!zones.length) return {
    rows: [],
    scores: [],
    notes: ["Dato non disponibile"],
    zones
  };
  if (campaign.svc === "d2d") {
    const families = zones.reduce((a, z) => a + z.families, 0);
    const required = zones.reduce((a, z) => a + z.families, 0);
    const remaining = campaign.qty - required;
    return {
      zones,
      rows: [{
        l: "Famiglie stimate",
        v: families.toLocaleString("it-IT")
      }, {
        l: "Popolazione stimata",
        v: zones.reduce((a, z) => a + z.pop, 0).toLocaleString("it-IT")
      }, {
        l: "Copertura stimata",
        v: `${Math.round(zones.reduce((a, z) => a + z.coverage, 0) / zones.length)}%`
      }, {
        l: "Volantini consigliati",
        v: required.toLocaleString("it-IT")
      }, {
        l: "Volantini inseriti",
        v: campaign.qty.toLocaleString("it-IT")
      }, {
        l: remaining >= 0 ? "quantita residua" : "quantita mancante",
        v: Math.abs(remaining).toLocaleString("it-IT")
      }, {
        l: "Comuni selezionati",
        v: zones.map(z => z.name).join("  ")
      }],
      scores: [{
        l: "Family Index",
        v: Math.round(zones.reduce((a, z) => a + z.familyIdx, 0) / zones.length)
      }, {
        l: "Reach Score",
        v: Math.round(zones.reduce((a, z) => a + z.reachD2D, 0) / zones.length)
      }, {
        l: "ROI Score",
        v: Math.round(zones.reduce((a, z) => a + z.roiD2D, 0) / zones.length)
      }, {
        l: "Confidence Score",
        v: Math.round(zones.reduce((a, z) => a + z.confD2D, 0) / zones.length)
      }],
      notes: [remaining >= 0 ? "quantita sufficiente per copertura stimata" : "quantita insufficiente da verificare"]
    };
  }
  if (campaign.svc === "h2h") {
    return {
      zones,
      rows: [{
        l: "POI rilevanti",
        v: zones.reduce((a, z) => a + z.poi, 0).toLocaleString("it-IT")
      }, {
        l: "Fermate / stazioni",
        v: zones.reduce((a, z) => a + z.transitStops + z.trainStations, 0).toLocaleString("it-IT")
      }, {
        l: "Scuole / eventi",
        v: zones.reduce((a, z) => a + (z.strongPts || 0), 0).toLocaleString("it-IT")
      }, {
        l: "Flusso potenziale",
        v: `${Math.round(zones.reduce((a, z) => a + z.flowScore, 0) / zones.length)}/100`
      }, {
        l: "Densit passaggio",
        v: `${Math.round(zones.reduce((a, z) => a + z.commDens, 0) / zones.length)}/100`
      }, {
        l: "Hotspot consigliati",
        v: zones.map(z => z.hotspots).filter(Boolean).join("  ")
      }, {
        l: "Fasce orarie consigliate",
        v: zones[0]?.timeSlots || "Dato non disponibile"
      }],
      scores: [{
        l: "Reach Score",
        v: Math.round(zones.reduce((a, z) => a + z.reachH2H, 0) / zones.length)
      }, {
        l: "ROI Score",
        v: Math.round(zones.reduce((a, z) => a + z.roiH2H, 0) / zones.length)
      }, {
        l: "Confidence Score",
        v: Math.round(zones.reduce((a, z) => a + z.confH2H, 0) / zones.length)
      }],
      notes: ["Priorit a hotspot, transito e fasce orarie operative"]
    };
  }
  return {
    zones,
    rows: [{
      l: "Attivit rilevate",
      v: zones.reduce((a, z) => a + z.bizTotal, 0).toLocaleString("it-IT")
    }, {
      l: "Categorie principali",
      v: [...new Set(zones.flatMap(z => (z.topCats || "").split("  ").filter(Boolean)))].join("  ")
    }, {
      l: "Competitor vicini",
      v: zones.reduce((a, z) => a + z.competitors, 0).toLocaleString("it-IT")
    }, {
      l: "Cluster commerciali",
      v: zones.reduce((a, z) => a + z.clusters, 0).toLocaleString("it-IT")
    }, {
      l: "Attivit target",
      v: zones.reduce((a, z) => a + z.targetBiz, 0).toLocaleString("it-IT")
    }, {
      l: "Commercial Density Index",
      v: `${Math.round(zones.reduce((a, z) => a + z.cdIdx, 0) / zones.length)}/100`
    }],
    scores: [{
      l: "Reach Score",
      v: Math.round(zones.reduce((a, z) => a + z.reachB2B, 0) / zones.length)
    }, {
      l: "ROI Score",
      v: Math.round(zones.reduce((a, z) => a + z.roiB2B, 0) / zones.length)
    }, {
      l: "Confidence Score",
      v: Math.round(zones.reduce((a, z) => a + z.confB2B, 0) / zones.length)
    }],
    notes: ["Priorit a categorie, competitor e cluster commerciali"]
  };
}
function adminCompatibleCampaign(wait) {
  if (!allowMockData) return null;
  return ADMIN_CAMPAIGNS.find(c => c.status === "active" && c.zone.toLowerCase().includes(wait.zone.split(" ")[0].toLowerCase())) || ADMIN_CAMPAIGNS.find(c => c.status === "active");
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
  return [first ? `${first.l}: ${first.v}` : "Dato non disponibile", second ? `${second.l}: ${second.v}/100` : null].filter(Boolean).join("  ");
}

// - ButtonConfermaPagamento ------------------------------------------------
// Admin button that calls confirmCampaignPayment and sends confirmation email.
function ButtonConfermaPagamento({
  campagnaId,
  clienteEmail,
  clienteNome,
  zona,
  onConfirmed
}) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [msg, setMsg] = useState("");
  const handleClick = async () => {
    if (state === "loading" || state === "done") return;
    setState("loading");
    try {
      await confirmCampaignPayment(campagnaId);
      sendEmailConferma({
        cliente: {
          email: clienteEmail,
          nome: clienteNome || "Cliente"
        },
        campagna: {
          servizio: campagnaId,
          zona: zona || "Campagna",
          dashboard_url: `${window.location.origin}/dashboard`
        },
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
    padding: "5px 9px",
    borderRadius: 7,
    fontFamily: F.sans,
    fontSize: 9,
    fontWeight: 800,
    cursor: state === "done" ? "default" : "pointer",
    border: state === "done" ? "1px solid rgba(46,204,138,.3)" : state === "error" ? "1px solid rgba(248,113,113,.3)" : "1px solid rgba(245,183,77,.26)",
    background: state === "done" ? "rgba(46,204,138,.12)" : state === "error" ? "rgba(248,113,113,.10)" : "rgba(245,183,77,.10)",
    color: state === "done" ? C.green : state === "error" ? C.red : C.yellow,
    whiteSpace: "nowrap",
    transition: "all.18s"
  };
  return <div style={{
    display: "flex",
    flexDirection: "column",
    gap: 4
  }}>
      <button onClick={handleClick} disabled={state === "done"} style={btnStyle}>
        {state === "loading" ? "..." : state === "done" ? " Confermato" : state === "error" ? "Riprova" : "Conferma"}
      </button>
      {msg && <span style={{
      fontFamily: F.sans,
      fontSize: 8,
      color: state === "error" ? C.red : C.green,
      lineHeight: 1.3
    }}>{msg}</span>}
    </div>;
}
export function AdminDashboard({
  onNav,
  adminSession
}) {
  return <RealAdminDashboard onNav={onNav} adminSession={adminSession} />;
  const devAdminCampaigns = allowMockData ? ADMIN_CAMPAIGNS : [];
  const adminWaitlist = allowMockData ? ADMIN_WAITLIST : [];
  const adminMonthly = allowMockData ? ADMIN_MONTHLY : [];
  const [campaigns, setCampaigns] = useState(devAdminCampaigns);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSvc, setFilterSvc] = useState("all");
  const [filterOp, setFilterOp] = useState("all");
  const [expandedCampaign, setExpandedCampaign] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCamp, setNewCamp] = useState({
    client: "",
    svc: "d2d",
    zone: "",
    qty: 10000
  });
  const [adminNotice, setAdminNotice] = useState("");
  const totalRev = campaigns.reduce((a, c) => a + c.total, 0);
  const activeCount = campaigns.filter(c => c.status === "active").length;
  const doneCount = campaigns.filter(c => c.status === "done").length;
  const totalQty = campaigns.reduce((a, c) => a + c.qty, 0);
  const avgCPM = totalQty > 0 ? (totalRev / totalQty * 1000).toFixed(2) : "0.00";
  const maxRev = Math.max(1, ...adminMonthly.map(m => m.rev));
  const filtered = campaigns.filter(c => filterStatus === "all" || c.status === filterStatus).filter(c => filterSvc === "all" || c.svc === filterSvc).filter(c => filterOp === "all" || filterOp === "pairing" && c.discount > 0 || filterOp === "confirm" && c.status === "pending" || filterOp === "compatible" && adminCampaignHasCompatibleZone(c));
  const box = (e = {}) => ({
    background: "rgba(255,255,255,.04)",
    borderRadius: 13,
    border: "1px solid rgba(255,255,255,.08)",
    ...e
  });
  const pill = (active, c = "#E8571A") => ({
    padding: "5px 12px",
    borderRadius: 100,
    cursor: "pointer",
    fontFamily: F.sans,
    fontSize: 11,
    fontWeight: active ? 700 : 400,
    border: `1px solid ${active ? c : "rgba(255,255,255,.1)"}`,
    background: active ? `${c}18` : "rgba(255,255,255,.04)",
    color: active ? c : "rgba(255,255,255,.45)",
    transition: "all.15s"
  });
  const resetAdminFilters = () => {
    setFilterStatus("all");
    setFilterSvc("all");
    setFilterOp("all");
  };
  const saveNewCampaign = () => {
    if (!newCamp.client.trim() || !newCamp.zone.trim() || !(Number(newCamp.qty) > 0)) {
      setAdminNotice("Compila cliente, zona e quantit prima di salvare.");
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
      total: Math.round(qty / 1000 * price * 100) / 100,
      days: Math.max(1, Math.ceil(qty / 5000)),
      discount: 0,
      stato_pagamento: "in_attesa"
    };
    setCampaigns(prev => [next, ...prev]);
    setShowNewForm(false);
    setNewCamp({
      client: "",
      svc: "d2d",
      zone: "",
      qty: 10000
    });
    resetAdminFilters();
    setAdminNotice(`Campagna ${next.id} salvata in stato In attesa.`);
  };
  const downloadAdminCsv = () => {
    const rows = [["id", "cliente", "servizio", "zona", "quantita", "status", "data", "totale", "sconto"], ...filtered.map(c => [c.id, c.client, c.svc, c.zone, c.qty, c.status, c.date, c.total.toFixed(2), c.discount])];
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "volantinipro-campagne.csv";
    a.click();
    URL.revokeObjectURL(url);
    setAdminNotice(`CSV esportato con ${filtered.length} campagne.`);
  };
  const confermaPagamentoAdmin = async id => {
    setCampaigns(prev => prev.map(c => c.id === id ? {
      ...c,
      stato_pagamento: "pagato",
      status: "active"
    } : c));
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
  return <div style={{
    maxWidth: 1280,
    margin: "0 auto",
    padding: "24px 24px 60px",
    minHeight: "100vh"
  }}>

      {/* HEADER */}
      <div style={{
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 22,
      flexWrap: "wrap",
      gap: 12
    }}>
        <div>
          <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6
        }}>
            <div style={{
            padding: "3px 10px",
            borderRadius: 100,
            background: "rgba(232,87,26,.15)",
            border: "1px solid rgba(232,87,26,.3)",
            fontFamily: F.sans,
            fontSize: 10,
            fontWeight: 700,
            color: C.orange
          }}>
              ADMIN
            </div>
            <div style={{
            fontFamily: F.sans,
            fontSize: 11,
            color: "rgba(255,255,255,.3)"
          }}>
              VolantiniPro  Dashboard operativa
            </div>
          </div>
          <h2 style={{
          fontFamily: F.serif,
          fontSize: 28,
          color: C.white,
          letterSpacing: "-1px",
          marginBottom: 3
        }}>Dashboard Admin</h2>
          <div style={{
          fontFamily: F.sans,
          fontSize: 12,
          color: "rgba(255,255,255,.38)"
        }}>
            Campagne  Revenue  Smart Pairing Waitlist  Gestione zona
          </div>
        </div>
        <div style={{
        display: "flex",
        gap: 8
      }}>
          <button onClick={() => setShowNewForm(v => !v)} style={{
          padding: "9px 18px",
          borderRadius: 10,
          border: `1px solid ${showNewForm ? C.orange : "rgba(255,255,255,.1)"}`,
          background: showNewForm ? `${C.orange}18` : "rgba(255,255,255,.04)",
          color: showNewForm ? C.orange : "rgba(255,255,255,.6)",
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer"
        }}>
            {showNewForm ? "Chiudi" : "+ Nuova campagna"}
          </button>
          <button onClick={() => onNav("home")} style={{
          padding: "9px 16px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.1)",
          background: "rgba(255,255,255,.04)",
          color: "rgba(255,255,255,.5)",
          fontFamily: F.sans,
          fontSize: 12,
          cursor: "pointer"
        }}>
              Home
          </button>
        </div>
      </div>

      {adminNotice && <div style={{
      marginBottom: 14,
      padding: "10px 14px",
      borderRadius: 10,
      background: "rgba(46,204,138,.08)",
      border: "1px solid rgba(46,204,138,.2)",
      fontFamily: F.sans,
      fontSize: 12,
      color: C.green
    }}>
          {adminNotice}
        </div>}

      {/* KPI STRIP */}
      <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(5,1fr)",
      gap: 10,
      marginBottom: 18
    }}>
        {[{
        icon: "",
        label: "Revenue totale",
        value: `${totalRev.toFixed(2)}`,
        sub: `${campaigns.length} campagne`,
        col: C.orange
      }, {
        icon: "",
        label: "In distribuzione",
        value: activeCount,
        sub: "campagne attive oggi",
        col: C.green
      }, {
        icon: "",
        label: "In attesa",
        value: campaigns.filter(c => c.status === "pending").length,
        sub: "da confermare",
        col: C.yellow
      }, {
        icon: "",
        label: "Completate",
        value: doneCount,
        sub: "questo mese",
        col: "rgba(255,255,255,.5)"
      }, {
        icon: " ",
        label: "CPM medio",
        value: `${avgCPM}`,
        sub: "per 1.000 volantini",
        col: C.blue
      }].map(({
        icon,
        label,
        value,
        sub,
        col
      }) => <div key={label} style={{
        ...box(),
        padding: "16px"
      }}>
            <div style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 10
        }}>
              <span style={{
            fontSize: 16
          }}>{icon}</span>
              <span style={{
            fontFamily: F.sans,
            fontSize: 10,
            color: "rgba(255,255,255,.35)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: ".06em"
          }}>{label}</span>
            </div>
            <div style={{
          fontFamily: F.serif,
          fontSize: 26,
          color: col,
          letterSpacing: "-1px",
          marginBottom: 3
        }}>{value}</div>
            <div style={{
          fontFamily: F.sans,
          fontSize: 10,
          color: "rgba(255,255,255,.3)"
        }}>{sub}</div>
          </div>)}
      </div>

      {/* NUOVA CAMPAGNA FORM */}
      {showNewForm && <div style={{
      ...box(),
      padding: "18px",
      marginBottom: 18,
      border: "1px solid rgba(232,87,26,.25)",
      background: "rgba(232,87,26,.05)"
    }}>
          <div style={{
        fontFamily: F.sans,
        fontSize: 11,
        fontWeight: 700,
        color: C.orange,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        marginBottom: 14
      }}>+ Inserisci nuova campagna</div>
          <div style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
        gap: 10,
        alignItems: "flex-end"
      }}>
            {[{
          l: "Cliente",
          type: "text",
          key: "client",
          ph: "es. Farmacia Centrale"
        }, {
          l: "Zona",
          type: "text",
          key: "zone",
          ph: "es. Cormano  Bresso"
        }, {
          l: "quantita",
          type: "number",
          key: "qty",
          ph: "10000"
        }].map(({
          l,
          type,
          key,
          ph
        }) => <div key={key}>
                <label style={{
            fontFamily: F.sans,
            fontSize: 10,
            color: "rgba(255,255,255,.4)",
            display: "block",
            marginBottom: 5,
            textTransform: "uppercase",
            letterSpacing: ".06em"
          }}>{l}</label>
                <input type={type} value={newCamp[key]} onChange={e => setNewCamp(p => ({
            ...p,
            [key]: e.target.value
          }))} placeholder={ph} style={{
            width: "100%",
            padding: "9px 12px",
            borderRadius: 9,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.07)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 13
          }} />
              </div>)}
            <div>
              <label style={{
            fontFamily: F.sans,
            fontSize: 10,
            color: "rgba(255,255,255,.4)",
            display: "block",
            marginBottom: 5,
            textTransform: "uppercase",
            letterSpacing: ".06em"
          }}>Servizio</label>
              <select value={newCamp.svc} onChange={e => setNewCamp(p => ({
            ...p,
            svc: e.target.value
          }))} style={{
            width: "100%",
            padding: "9px 12px",
            borderRadius: 9,
            border: "1px solid rgba(255,255,255,.12)",
            background: "#1a2a40",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 13
          }}>
                <option value="d2d">  Door to Door</option>
                <option value="h2h"> Hand to Hand</option>
                <option value="b2b"> Business</option>
              </select>
            </div>
            <button onClick={saveNewCampaign} style={{
          padding: "9px 16px",
          borderRadius: 9,
          border: "none",
          background: C.orange,
          color: C.white,
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer"
        }}>
              Salva 
            </button>
          </div>
        </div>}

      <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 340px",
      gap: 16
    }}>

        {/* Section */}
        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 14
      }}>

          {/* REVENUE CHART */}
          <div style={{
          ...box(),
          padding: "18px"
        }}>
            <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,.35)",
              letterSpacing: ".1em",
              textTransform: "uppercase"
            }}>Revenue mensile 2025</div>
              <div style={{
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.4)"
            }}>Tot. ?{totalRev.toFixed(0)}</div>
            </div>
            <div style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            height: 90
          }}>
              {adminMonthly.length === 0 ? <div style={{
              gridColumn: "1 / -1",
              padding: 18,
              textAlign: "center",
              fontFamily: F.sans,
              fontSize: 13,
              color: "rgba(255,255,255,.45)"
            }}>Nessuna campagna presente.</div> : adminMonthly.map(({
              m,
              rev,
              camp
            }) => <div key={m} style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4
            }}>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 9,
                color: "rgba(255,255,255,.4)"
              }}>
                    {rev > 0 ? `${rev}` : ""}</div>
                  <div style={{
                width: "100%",
                borderRadius: "4px 4px 0 0",
                background: rev > 0 ? C.orange : "rgba(255,255,255,.06)",
                height: `${rev > 0 ? Math.round(rev / maxRev * 70) + 10 : 8}px`,
                transition: "height.3s",
                position: "relative"
              }}>
                    {camp > 0 && <div style={{
                  position: "absolute",
                  top: -16,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontFamily: F.sans,
                  fontSize: 8,
                  color: C.orange,
                  fontWeight: 700
                }}>{camp}</div>}
                  </div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 9,
                color: "rgba(255,255,255,.4)"
              }}>{m}</div>
                </div>)}
            </div>
            <div style={{
            display: "flex",
            gap: 10,
            marginTop: 8
          }}>
              <div style={{
              display: "flex",
              alignItems: "center",
              gap: 5
            }}>
                <div style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: C.orange
              }} />
                <span style={{
                fontFamily: F.sans,
                fontSize: 9,
                color: "rgba(255,255,255,.35)"
              }}>Revenue EUR </span>
              </div>
              <div style={{
              display: "flex",
              alignItems: "center",
              gap: 5
            }}>
                <span style={{
                fontFamily: F.sans,
                fontSize: 9,
                color: "rgba(255,255,255,.35)"
              }}>Numero sopra barra = campagne</span>
              </div>
            </div>
          </div>

          {/* CAMPAGNE LIST */}
          <div style={{
          ...box(),
          overflow: "hidden"
        }}>
            <div style={{
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255,255,255,.07)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,.35)",
              letterSpacing: ".1em",
              textTransform: "uppercase"
            }}>
                Campagne  {filtered.length} risultati
              </div>
              <div style={{
              display: "flex",
              gap: 5,
              flexWrap: "wrap"
            }}>
                {[{
                id: "all",
                l: "Tutte"
              }, {
                id: "active",
                l: "Attive"
              }, {
                id: "pending",
                l: "In attesa"
              }, {
                id: "done",
                l: "Completate"
              }].map(({
                id,
                l
              }) => <button key={id} onClick={() => setFilterStatus(id)} style={pill(filterStatus === id)}>
                    {STATUS_CFG[id] ? <span style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: STATUS_CFG[id].dot,
                  marginRight: 4
                }} /> : null}{l}
                  </button>)}
                <div style={{
                width: 1,
                height: 20,
                background: "rgba(255,255,255,.1)",
                margin: "0 2px"
              }} />
                {[{
                id: "all",
                l: "Tutti"
              }, {
                id: "d2d",
                l: "D2D"
              }, {
                id: "h2h",
                l: "H2H"
              }, {
                id: "b2b",
                l: "B2B"
              }].map(({
                id,
                l
              }) => <button key={id} onClick={() => setFilterSvc(id)} style={pill(filterSvc === id, id === "d2d" ? C.orange : id === "h2h" ? C.blue : C.purple)}>
                    {id !== "all" && SVC_BADGE[id]?.icon + " "}{l}
                  </button>)}
                <div style={{
                width: 1,
                height: 20,
                background: "rgba(255,255,255,.1)",
                margin: "0 2px"
              }} />
                <button onClick={resetAdminFilters} style={pill(filterOp === "all" && filterStatus === "all" && filterSvc === "all", C.green)}>Reset filtri</button>
                {ADMIN_OP_FILTERS.map(({
                id,
                label
              }) => <button key={id} onClick={() => setFilterOp(id)} style={pill(filterOp === id, id === "pairing" ? C.green : id === "confirm" ? C.yellow : C.blue)}>
                    {label}
                  </button>)}
              </div>
            </div>

            {/* Table header */}
            <div style={{
            display: "grid",
            gridTemplateColumns: "70px 1fr 82px 118px 80px 90px 116px 96px 84px",
            gap: 0,
            padding: "8px 16px",
            borderBottom: "1px solid rgba(255,255,255,.05)"
          }}>
              {["ID", "Cliente", "Servizio", "Zona", "Quantita", "Totale EUR", "Pagamento", "Stato", "Analisi"].map(h => <div key={h} style={{
              fontFamily: F.sans,
              fontSize: 9,
              fontWeight: 700,
              color: "rgba(255,255,255,.28)",
              textTransform: "uppercase",
              letterSpacing: ".07em"
            }}>{h}</div>)}
            </div>

            {/* Table rows */}
            {filtered.map(c => {
            const svc = SVC_BADGE[c.svc];
            const sts = STATUS_CFG[c.status];
            const analysis = adminServiceAnalysis(c);
            const expanded = expandedCampaign === c.id;
            const paymentStatus = c.stato_pagamento || (c.status === "done" ? "pagato" : "in_attesa");
            return <div key={c.id} style={{
              borderBottom: "1px solid rgba(255,255,255,.04)"
            }}>
                  <div style={{
                display: "grid",
                gridTemplateColumns: "70px 1fr 82px 118px 80px 90px 116px 96px 84px",
                gap: 0,
                padding: "11px 16px",
                transition: "background.14s",
                background: expanded ? "rgba(255,255,255,.035)" : "transparent"
              }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.03)"} onMouseLeave={e => e.currentTarget.style.background = expanded ? "rgba(255,255,255,.035)" : "transparent"}>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.4)",
                  fontWeight: 600
                }}>{c.id}</div>
                    <div>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.white
                  }}>{c.client}</div>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    color: "rgba(255,255,255,.35)"
                  }}>{c.date}  {c.days}gg  {adminOperationalStatus(c)}</div>
                    </div>
                    <div style={{
                  display: "flex",
                  alignItems: "center"
                }}>
                      <span style={{
                    padding: "2px 8px",
                    borderRadius: 5,
                    background: `${svc.col}18`,
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 700,
                    color: svc.col
                  }}>{svc.icon} {svc.label}</span>
                    </div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.6)",
                  display: "flex",
                  alignItems: "center"
                }}>{c.zone}</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.white,
                  display: "flex",
                  alignItems: "center"
                }}>{c.qty.toLocaleString("it-IT")}</div>
                    <div style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center"
                }}>
                      <div style={{
                    fontFamily: F.serif,
                    fontSize: 15,
                    color: C.orange
                  }}>?{c.total.toFixed(2)}</div>
                      {c.discount > 0 && <div style={{
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: C.green
                  }}>-{c.discount}% pairing</div>}
                    </div>
                    <div style={{
                  display: "flex",
                  alignItems: "center"
                }}>
                      {paymentStatus === "pagato" ? <div style={{
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "rgba(95,194,124,.12)",
                    color: C.green,
                    border: "1px solid rgba(95,194,124,.22)",
                    fontFamily: F.sans,
                    fontSize: 9,
                    fontWeight: 700,
                    whiteSpace: "nowrap"
                  }}>Pagato</div> : <ButtonConfermaPagamento campagnaId={c.id} clienteEmail={c.email || ""} clienteNome={c.client} zona={c.zone} onConfirmed={id => confermaPagamentoAdmin(id)} />}
                    </div>
                    <div style={{
                  display: "flex",
                  alignItems: "center"
                }}>
                      <div style={{
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: sts.bg,
                    display: "flex",
                    alignItems: "center",
                    gap: 4
                  }}>
                        <div style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: sts.dot,
                      flexShrink: 0
                    }} />
                        <span style={{
                      fontFamily: F.sans,
                      fontSize: 9,
                      fontWeight: 600,
                      color: sts.col,
                      whiteSpace: "nowrap"
                    }}>{sts.label}</span>
                      </div>
                    </div>
                    <button onClick={() => setExpandedCampaign(expanded ? null : c.id)} style={{
                  alignSelf: "center",
                  justifySelf: "start",
                  padding: "5px 8px",
                  borderRadius: 7,
                  border: `1px solid ${svc.col}35`,
                  background: expanded ? `${svc.col}18` : "rgba(255,255,255,.035)",
                  color: expanded ? svc.col : "rgba(255,255,255,.55)",
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer"
                }}>
                      {expanded ? "Chiudi" : "Dettagli"}
                    </button>
                  </div>
                  {expanded && <div style={{
                margin: "0 16px 14px 86px",
                padding: "13px",
                borderRadius: 11,
                background: "rgba(255,255,255,.035)",
                border: `1px solid ${svc.col}24`
              }}>
                      <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                  marginBottom: 10
                }}>
                        <div>
                          <div style={{
                      fontFamily: F.sans,
                      fontSize: 10,
                      fontWeight: 800,
                      color: svc.col,
                      letterSpacing: ".08em",
                      textTransform: "uppercase"
                    }}>Dettagli analisi Step 2</div>
                          <div style={{
                      fontFamily: F.sans,
                      fontSize: 11,
                      color: "rgba(255,255,255,.42)",
                      marginTop: 3
                    }}>{adminAnalysisPreview(c)}</div>
                        </div>
                        <button disabled style={{
                    padding: "5px 9px",
                    borderRadius: 7,
                    border: "1px solid rgba(255,255,255,.08)",
                    background: "rgba(255,255,255,.03)",
                    color: "rgba(255,255,255,.28)",
                    fontFamily: F.sans,
                    fontSize: 10,
                    cursor: "not-allowed"
                  }}>Apri campagna  non disponibile</button>
                      </div>
                      <div style={{
                  display: "grid",
                  gridTemplateColumns: "1.15fr.85fr",
                  gap: 10
                }}>
                        <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                    gap: 7
                  }}>
                          {analysis.rows.map(({
                      l,
                      v
                    }) => <div key={l} style={{
                      padding: "8px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,.035)",
                      border: "1px solid rgba(255,255,255,.05)"
                    }}>
                              <div style={{
                        fontFamily: F.sans,
                        fontSize: 9,
                        color: "rgba(255,255,255,.33)",
                        textTransform: "uppercase",
                        letterSpacing: ".04em"
                      }}>{l}</div>
                              <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        color: C.white,
                        fontWeight: 700,
                        marginTop: 3,
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}>{v || "Dato non disponibile"}</div>
                            </div>)}
                        </div>
                        <div>
                          <div style={{
                      display: "grid",
                      gap: 6,
                      marginBottom: 8
                    }}>
                            {analysis.scores.map(({
                        l,
                        v
                      }) => <div key={l} style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 46px",
                        gap: 8,
                        alignItems: "center"
                      }}>
                                <span style={{
                          fontFamily: F.sans,
                          fontSize: 10,
                          color: "rgba(255,255,255,.48)"
                        }}>{l}</span>
                                <span style={{
                          fontFamily: F.sans,
                          fontSize: 11,
                          color: svc.col,
                          fontWeight: 800,
                          textAlign: "right"
                        }}>{v}/100</span>
                                <div style={{
                          gridColumn: "1 / -1",
                          height: 4,
                          borderRadius: 4,
                          background: "rgba(255,255,255,.07)",
                          overflow: "hidden"
                        }}>
                                  <div style={{
                            width: `${Math.max(0, Math.min(100, v))}%`,
                            height: "100%",
                            background: svc.col
                          }} />
                                </div>
                              </div>)}
                          </div>
                          {analysis.notes.map(n => <div key={n} style={{
                      padding: "8px 9px",
                      borderRadius: 8,
                      background: `${svc.col}10`,
                      border: `1px solid ${svc.col}20`,
                      fontFamily: F.sans,
                      fontSize: 10,
                      color: "rgba(255,255,255,.62)",
                      lineHeight: 1.35
                    }}>{n}</div>)}
                        </div>
                      </div>
                    </div>}
                </div>;
          })}
          </div>

          {/* MAPPA LIVE ZONE */}
          <div style={{
          ...box(),
          overflow: "hidden"
        }}>
            <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,.07)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,.35)",
              letterSpacing: ".1em",
              textTransform: "uppercase"
            }}>Mappa operativa  campagne e compatibilit</div>
              <div style={{
              display: "flex",
              gap: 10,
              alignItems: "center"
            }}>
                {[{
                c: C.green,
                l: "In distribuzione"
              }, {
                c: C.yellow,
                l: "In attesa"
              }, {
                c: C.blue,
                l: "Smart Pairing"
              }, {
                c: "rgba(255,255,255,.2)",
                l: "Completata"
              }].map(({
                c,
                l
              }) => <div key={l} style={{
                display: "flex",
                alignItems: "center",
                gap: 4
              }}>
                    <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: c
                }} />
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.4)"
                }}>{l}</span>
                  </div>)}
              </div>
            </div>
            <div style={{
            background: "linear-gradient(135deg,#081610,#080f1e)",
            position: "relative"
          }}>
              <svg viewBox="0 0 580 280" width="100%" style={{
              display: "block"
            }}>
                <defs><pattern id="adm-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,.03)" strokeWidth=".5" /></pattern></defs>
                <rect width="100%" height="100%" fill="url(#adm-grid)" />
                {S2_ZONES.map(z => {
                const cr = S2_CITIES.find(c => c.id === z.id);
                if (!cr) return null;
                const p = {
                  x: 580 / 2 + (cr.lng - 9.175) * 2800,
                  y: 280 / 2 - (cr.lat - 45.548) * 4200 * (280 / 360)
                };
                const activeC = campaigns.find(c => c.zone.toLowerCase().includes(z.name.split(" ")[0].toLowerCase()) && c.status === "active");
                const pendC = campaigns.find(c => c.zone.toLowerCase().includes(z.name.split(" ")[0].toLowerCase()) && c.status === "pending");
                const doneC = campaigns.find(c => c.zone.toLowerCase().includes(z.name.split(" ")[0].toLowerCase()) && c.status === "done");
                const camp = activeC || pendC || doneC;
                const compatible = adminWaitlist.some(w => z.name.toLowerCase().includes(w.zone.toLowerCase().split(" ")[0]));
                const dotCol = activeC ? C.green : pendC ? C.yellow : "rgba(255,255,255,.2)";
                const r = activeC ? 8 : pendC ? 6 : doneC ? 5 : 4;
                const markerTitle = camp ? `${camp.id}  ${camp.client}\n${SVC_BADGE[camp.svc].label}  ${camp.zone}\n${camp.qty.toLocaleString("it-IT")} volantini  ${STATUS_CFG[camp.status].label}\nData: ${camp.date}${camp.discount > 0 ? `\nSmart Pairing: -${camp.discount}%` : ""}` : `${z.name}\nNessuna campagna attiva`;
                return <g key={z.id}>
                      <title>{markerTitle}</title>
                      {compatible && <circle cx={p.x} cy={p.y} r={r + 12} fill="none" stroke={C.blue} strokeWidth="1.2" strokeDasharray="3 3" opacity=".75" />}
                      {(activeC || pendC) && <circle cx={p.x} cy={p.y} r={r + 6} fill={dotCol} fillOpacity=".12" />}
                      <circle cx={p.x} cy={p.y} r={r} fill={dotCol} opacity={activeC || pendC ? 1 : .4} />
                      <text x={p.x} y={p.y - 11} textAnchor="middle" fontFamily={F.sans} fontSize="8.5" fill={activeC ? C.green : pendC ? C.yellow : "rgba(255,255,255,.3)"} fontWeight={activeC || pendC ? "700" : "400"}>
                        {z.name.split(" ")[0]}
                      </text>
                      {camp && <text x={p.x} y={p.y + 14} textAnchor="middle" fontFamily={F.sans} fontSize="7.5" fill={SVC_BADGE[camp.svc].col}>
                          {SVC_BADGE[camp.svc].icon} {camp.id}
                        </text>}
                    </g>;
              })}
              </svg>
            </div>
          </div>
        </div>

        {/* Section */}
        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 12
      }}>

          {/* SMART PAIRING WAITLIST */}
          <div style={{
          ...box(),
          overflow: "hidden"
        }}>
            <div style={{
            padding: "12px 14px",
            borderBottom: "1px solid rgba(255,255,255,.07)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
              <div>
                <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(255,255,255,.35)",
                letterSpacing: ".1em",
                textTransform: "uppercase"
              }}>Smart Pairing Waitlist</div>
                <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                color: "rgba(255,255,255,.3)",
                marginTop: 1
              }}>{adminWaitlist.length} richieste in attesa</div>
              </div>
              <div style={{
              padding: "3px 9px",
              borderRadius: 100,
              background: "rgba(232,87,26,.18)",
              fontFamily: F.sans,
              fontSize: 11,
              fontWeight: 700,
              color: C.orange
            }}>{adminWaitlist.length}</div>
            </div>
            <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 0
          }}>
              {adminWaitlist.length === 0 ? <div style={{
              padding: 18,
              textAlign: "center",
              fontFamily: F.sans,
              fontSize: 13,
              color: "rgba(255,255,255,.45)"
            }}>Nessuna richiesta Smart Pairing presente.</div> : adminWaitlist.map((w, i) => {
              const match = adminCompatibleCampaign(w);
              const svc = match ? SVC_BADGE[match.svc] : null;
              return <div key={i} style={{
                padding: "11px 14px",
                borderBottom: "1px solid rgba(255,255,255,.04)",
                transition: "background.12s"
              }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 4
                }}>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.white
                  }}>{w.name}</div>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.3)"
                  }}>{w.date}</div>
                    </div>
                    <div style={{
                  display: "flex",
                  gap: 6,
                  marginBottom: 6,
                  flexWrap: "wrap"
                }}>
                      <span style={{
                    padding: "2px 7px",
                    borderRadius: 5,
                    background: "rgba(167,139,250,.1)",
                    border: "1px solid rgba(167,139,250,.2)",
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: C.purple
                  }}> {w.days}</span>
                      <span style={{
                    padding: "2px 7px",
                    borderRadius: 5,
                    background: `${C.orange}12`,
                    border: `1px solid ${C.orange}28`,
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: C.orange
                  }}> {w.zone}</span>
                      {svc && <span style={{
                    padding: "2px 7px",
                    borderRadius: 5,
                    background: `${svc.col}12`,
                    border: `1px solid ${svc.col}25`,
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: svc.col
                  }}>{svc.icon} {svc.label}</span>}
                    </div>
                    <div style={{
                  padding: "7px 8px",
                  borderRadius: 8,
                  background: "rgba(46,204,138,.08)",
                  border: "1px solid rgba(46,204,138,.16)",
                  marginBottom: 7
                }}>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    color: C.green,
                    fontWeight: 800
                  }}>Compatibilit operativa</div>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    color: "rgba(255,255,255,.55)",
                    lineHeight: 1.35,
                    marginTop: 2
                  }}>
                        {match ? `Compatibile con ${match.id}  ${match.zone}  ${match.qty.toLocaleString("it-IT")} volantini${match.discount > 0 ? `  potenziale -${match.discount}%` : ""}` : "Dato non disponibile"}
                      </div>
                    </div>
                    <div style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexWrap: "wrap"
                }}>
                      <a href={`https://wa.me/${w.tel.replace(/\s/g, "")}`} style={{
                    padding: "4px 9px",
                    borderRadius: 7,
                    background: "rgba(37,211,102,.12)",
                    border: "1px solid rgba(37,211,102,.25)",
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#25D366",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 4
                  }}>
                         WhatsApp
                      </a>
                      <a href={`mailto:${w.email}`} style={{
                    padding: "4px 9px",
                    borderRadius: 7,
                    background: "rgba(96,165,250,.1)",
                    border: "1px solid rgba(96,165,250,.2)",
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 600,
                    color: C.blue,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 4
                  }}>
                         Email
                      </a>
                      <button onClick={() => {
                    setFilterOp("compatible");
                    setFilterStatus("all");
                    setFilterSvc("all");
                  }} style={{
                    padding: "4px 9px",
                    borderRadius: 7,
                    border: `1px solid ${C.orange}25`,
                    background: `${C.orange}10`,
                    color: C.orange,
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer"
                  }}>Apri compatibilit</button>
                      <button disabled style={{
                    padding: "4px 9px",
                    borderRadius: 7,
                    border: "1px solid rgba(255,255,255,.08)",
                    background: "rgba(255,255,255,.03)",
                    color: "rgba(255,255,255,.28)",
                    fontFamily: F.sans,
                    fontSize: 10,
                    cursor: "not-allowed"
                  }}>Abbina  non disponibile</button>
                    </div>
                  </div>;
            })}
            </div>
          </div>

          {/* STATISTICHE SERVIZI */}
          <div style={{
          ...box(),
          padding: "14px"
        }}>
            <div style={{
            fontFamily: F.sans,
            fontSize: 10,
            fontWeight: 700,
            color: "rgba(255,255,255,.35)",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            marginBottom: 12
          }}>Mix servizi</div>
            {["d2d", "h2h", "b2b"].map(svc => {
            const svcCamps = campaigns.filter(c => c.svc === svc);
            const svcRev = svcCamps.reduce((a, c) => a + c.total, 0);
            const pct = Math.round(svcCamps.length / campaigns.length * 100);
            const {
              icon,
              label,
              col
            } = SVC_BADGE[svc];
            return <div key={svc} style={{
              marginBottom: 10
            }}>
                  <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4
              }}>
                    <div style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center"
                }}>
                      <span style={{
                    fontSize: 13
                  }}>{icon}</span>
                      <span style={{
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.white
                  }}>{label}</span>
                    </div>
                    <div style={{
                  textAlign: "right"
                }}>
                      <span style={{
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 700,
                    color: col
                  }}>?{svcRev.toFixed(0)}</span>
                      <span style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    color: "rgba(255,255,255,.35)",
                    marginLeft: 6
                  }}>{svcCamps.length} camp.</span>
                    </div>
                  </div>
                  <div style={{
                height: 5,
                borderRadius: 3,
                background: "rgba(255,255,255,.08)",
                overflow: "hidden"
              }}>
                    <div style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: col,
                  borderRadius: 3,
                  transition: "width.4s"
                }} />
                  </div>
                </div>;
          })}
          </div>

          {/* AZIONI RAPIDE */}
          <div style={{
          ...box(),
          padding: "14px"
        }}>
            <div style={{
            fontFamily: F.sans,
            fontSize: 10,
            fontWeight: 700,
            color: "rgba(255,255,255,.35)",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            marginBottom: 10
          }}>Azioni rapide</div>
            {[{
            icon: "",
            l: "Nuova campagna",
            action: () => setShowNewForm(true),
            col: C.orange
          }, {
            icon: "",
            l: "Trova Smart Pairing",
            action: () => {
              setFilterOp("compatible");
              setFilterStatus("all");
              setFilterSvc("all");
            },
            col: C.green
          }, {
            icon: "",
            l: "Apri analisi zona",
            action: () => onNav("step2"),
            col: C.orange
          }, {
            icon: " ",
            l: "Esporta campagne operative",
            action: downloadAdminCsv,
            hint: "CSV",
            col: C.blue
          }, {
            icon: "",
            l: "Genera PDF preventivi",
            action: exportAdminPdfMock,
            hint: "Step 4",
            col: C.purple
          }, {
            icon: "",
            l: "Ricalcola compatibilit",
            disabled: true,
            hint: "Non ancora disponibile",
            col: C.green
          }, {
            icon: "",
            l: "Invia avvisi batch",
            disabled: true,
            hint: "Non ancora disponibile",
            col: C.yellow
          }].map(({
            icon,
            l,
            action,
            disabled,
            hint,
            col
          }) => <button key={l} onClick={disabled ? undefined : action} disabled={disabled} style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 12px",
            borderRadius: 9,
            border: "1px solid rgba(255,255,255,.07)",
            background: "rgba(255,255,255,.03)",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? .55 : 1,
            marginBottom: 5,
            transition: "all.15s"
          }} onMouseEnter={e => {
            if (!disabled) e.currentTarget.style.background = `${col}10`;
          }} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.03)"}>
                <span style={{
              fontSize: 14
            }}>{icon}</span>
                <span style={{
              fontFamily: F.sans,
              fontSize: 12,
              color: "rgba(255,255,255,.65)",
              fontWeight: 500,
              flex: 1,
              textAlign: "left"
            }}>{l}</span>
                <span style={{
              fontFamily: F.sans,
              fontSize: 9,
              color: disabled ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.25)"
            }}>{hint || ""}</span>
              </button>)}
          </div>

          {/* ULTIME NOTIFICHE */}
          <div style={{
          ...box(),
          padding: "14px"
        }}>
            <div style={{
            fontFamily: F.sans,
            fontSize: 10,
            fontWeight: 700,
            color: "rgba(255,255,255,.35)",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            marginBottom: 10
          }}>Ultime attivita</div>
            {[{
            icon: "",
            msg: "Campagna C007 avviata - Varedo  Senago",
            t: "09:14"
          }, {
            icon: "",
            msg: "Compatibilit zona trovata - Paolo Greco ? C007",
            t: "08:52"
          }, {
            icon: "",
            msg: "PDF preventivo generato - C004 Pizzeria Napoli",
            t: "ieri"
          }, {
            icon: "",
            msg: "Campagna C003 completata - Studio Rossi",
            t: "ieri"
          }, {
            icon: "",
            msg: "quantita da verificare - C002 in attesa",
            t: "ieri"
          }, {
            icon: "",
            msg: "Pagamento ricevuto C004 277,50",
            t: "ieri"
          }, {
            icon: "",
            msg: "WhatsApp inviato a 3 clienti waitlist",
            t: "2gg fa"
          }].map(({
            icon,
            msg,
            t
          }, i) => <div key={i} style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            paddingBottom: 8,
            marginBottom: 8,
            borderBottom: "1px solid rgba(255,255,255,.04)"
          }}>
                <span style={{
              fontSize: 13,
              flexShrink: 0,
              marginTop: 1
            }}>{icon}</span>
                <div style={{
              flex: 1,
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.55)",
              lineHeight: 1.4
            }}>{msg}</div>
                <span style={{
              fontFamily: F.sans,
              fontSize: 9,
              color: "rgba(255,255,255,.25)",
              flexShrink: 0
            }}>{t}</span>
              </div>)}
          </div>
        </div>
      </div>
    </div>;
}
function getSupabaseEnv() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL || "",
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ""
  };
}
export function LoginPage({
  onNav,
  context
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState(() => parseSupabaseAuthHashError());
  const otpRequestInFlight = useRef(false);
  const {
    url,
    anonKey
  } = getSupabaseEnv();
  const configured = Boolean(url && anonKey);
  const isAdminContext = context === "admin";
  const isDriverContext = context === "driver";
  // context=supplier: stesso Supabase Auth (magic link) di Cliente/Admin, ma
  // dopo il callback l'utente torna su /supplier (protetto da SupplierGuard),
  // non sulla Dashboard Cliente. Nessun secondo sistema auth: solo l'intento
  // di login viene instradato verso l'area giusta (il ruolo resta verificato
  // da SupplierGuard/RPC verified_supplier).
  const isSupplierContext = context === "supplier";
  const isAuthCallback = window.location.pathname.toLowerCase() === "/auth/callback";
  const redirectPath = "/auth/callback";
  const [sessionCheck, setSessionCheck] = useState(() => configured && (isAdminContext || isAuthCallback) ? "checking" : "ready");

  useEffect(() => {
    let cancelled = false;

    if (window.location.hash.includes("access_token")) {
      // Mantieni un landing neutro finche' sessione e ruolo non sono stati
      // verificati. Il path canonico viene scelto soltanto dopo il lookup
      // backend: nessun flash della Home e nessun /admin prematuro.
      const driverReturnPathRaw = isDriverContext ? readPendingAuthReturnPath() : null;
      const driverReturnPath = /^\/driver\/(tracking|assignment)\//.test(driverReturnPathRaw || "")
        ? driverReturnPathRaw
        : null;
      const cleanPath = "/auth/callback";
      const session = consumeSupabaseAuthHash(cleanPath);
      if (session) {
        // Intento del login (Admin vs Cliente), catturato PRIMA di pulire il
        // context ricordato. `isAdminContext` deriva da ?context=admin nella
        // query (precedenza) oppure dal context memorizzato all'invio del
        // magic link (readPendingAuthContext). Serve SOLO a scegliere la
        // destinazione tra route a cui l'utente ha comunque diritto: non
        // concede mai privilegi — il ruolo Admin resta verificato dal backend.
        const loginIntentIsAdmin = isAdminContext;
        // Stesso motivo: intento di login Fornitore catturato PRIMA di pulire
        // il context ricordato (instrada verso /supplier, non concede ruoli).
        const loginIntentIsSupplier = isSupplierContext;
        clearPendingAuthContext();
        // setSession() trasferisce il callback manuale nella sessione SDK
        // persistente e abilita auto-refresh prima di lasciare la login page.
        void restoreSupabaseSession(session).then(async (restoredSession) => {
          if (cancelled) return;
          if (!restoredSession) {
            setSessionCheck("ready");
            setAuthError({ message: "Non sono riuscito a ripristinare la sessione. Richiedi un nuovo magic link." });
            // FASE Auth error logging: qui l'hash conteneva un access_token
            // valido (arrivato direttamente dal redirect di Supabase, non
            // manomesso), eppure restoreSupabaseSession() non e' riuscita a
            // trasformarlo in una sessione SDK persistente — un esito
            // tecnico anomalo, diverso da un link scaduto/gia' usato (quello
            // e' gia' gestito separatamente da hashError sotto e non passa
            // mai da questo ramo). Nessun token/email nel log: solo il fatto
            // che il ripristino e' fallito.
            logError({
              category: ERROR_CATEGORIES.AUTH,
              module: "callback",
              message: "Ripristino sessione fallito dopo callback magic link con access_token valido",
              severity: ERROR_SEVERITY.WARNING,
            });
            return;
          }
          if (isDriverContext) {
            if (!driverReturnPath) {
              setSessionCheck("ready");
              setAuthError({ message: "Link operativo Driver mancante. Apri di nuovo il link della campagna o dell'assegnazione." });
              return;
            }
          // /driver/tracking/* e' un entry point standalone fuori da
          // AppRouter (src/main.jsx), quindi il ritorno richiede una
          // navigazione reale del browser e non onNav/goTo. location.replace
          // (non href=) evita che il redirect resti come voce di history
          // separata e si e' dimostrato piu' affidabile di una semplice
          // assegnazione a location.href per una navigazione innescata da
          // codice subito dopo un replaceState sulla stessa pagina.
          //
          // Origin esplicito (non un path relativo): history.replaceState non
          // puo' mai cambiare origin, quindi se Supabase e' atterrato su un
          // origin diverso da quello che ha avviato il login (es. SITE_URL su
          // un altro IP LAN o su localhost, se quell'host e' raggiungibile),
          // un path relativo resterebbe sull'origin sbagliato. Fallback
          // sull'origin corrente solo se non era stato salvato.
            const driverOrigin = readPendingAuthOrigin() || window.location.origin;
            clearPendingAuthReturnPath();
            clearPendingAuthOrigin();
            window.location.replace(`${driverOrigin}${driverReturnPath}`);
            return;
          }
          // Ruolo Admin reale, verificato dal backend (RPC jwt_is_admin, mai
          // dedotto lato client, fail-closed). Da solo NON basta per atterrare
          // su /admin: serve anche che il login sia partito con intento Admin
          // (loginIntentIsAdmin). Un account con role=admin che entra dal
          // flusso Cliente — o da admin-grant-access, che punta a /dashboard —
          // resta nel flusso Cliente e vede la Dashboard cliente: mai promosso
          // automaticamente all'area Admin solo perche' il suo ruolo e' admin.
          // (Separazione intento/ruolo: il ruolo autorizza, l'intento instrada.)
          const isAdmin = await verifySupabaseAdminRole(restoredSession);
          if (cancelled) return;
          if (isAdmin && loginIntentIsAdmin) {
            onNav("admin");
            return;
          }
          // Intento di login Fornitore: torna su /supplier. SupplierGuard
          // decide poi se mostrare la dashboard o il rifiuto (role != supplier
          // o status != verified) secondo la logica esistente — qui NON si
          // concede alcun privilegio, si sceglie solo la destinazione.
          if (loginIntentIsSupplier) {
            onNav("supplier-dashboard");
            return;
          }
          // Se il login e' stato richiesto da Step4 (vedi handleConfirmCampaign
          // in Step4.jsx, che imposta volantinipro_return_to prima di mandare
          // qui l'utente), torna a Step4 invece che alla Dashboard generica:
          // Step4 rilegge da solo il draft/pending action da localStorage
          // (vedi useState di "data" in AppRouter.jsx) e mostra il banner
          // "Campagna pronta" per completare la conferma. NON pulire qui
          // volantinipro_return_to/pending_action/pending_campaign_draft:
          // restano a Step4.jsx, che li rimuove solo dopo un salvataggio
          // riuscito (o li lascia intatti in caso di errore, cosi' il draft
          // non si perde).
          const pendingReturnToStep4 = (() => {
            try { return localStorage.getItem("volantinipro_return_to") === "step4"; } catch { return false; }
          })();
          onNav(pendingReturnToStep4 ? "step4" : "dashboard");
        });
      }
      return () => { cancelled = true; };
    }
    const hashError = parseSupabaseAuthHashError();
    if (hashError) {
      setAuthError(hashError);
      clearSupabaseAuthHashError(isAdminContext ? "/login?context=admin" : isDriverContext ? "/login?context=driver" : isSupplierContext ? "/login?context=supplier" : "/login?context=customer");
      clearPendingAuthContext();
      // vp_pending_auth_return_path resta: un nuovo tentativo di magic link
      // deve ancora sapere dove tornare (vedi sendMagicLink sotto).
      setSessionCheck("ready");
      return () => { cancelled = true; };
    }

    if (isAdminContext && configured) {
      // Un Admin gia' autenticato non deve poter generare OTP inutili. La SDK
      // ripristina/aggiorna prima la sessione persistita, poi il ruolo viene
      // sempre confermato dal backend.
      void restoreSupabaseSession().then(async (restoredSession) => {
        if (cancelled) return;
        if (restoredSession && await verifySupabaseAdminRole(restoredSession)) {
          if (!cancelled) onNav("admin");
          return;
        }
        if (!cancelled) setSessionCheck("ready");
      });
    } else {
      setSessionCheck("ready");
    }
    return () => { cancelled = true; };
  }, [isAdminContext, isDriverContext, isSupplierContext, onNav]);

  const sendMagicLink = async e => {
    e.preventDefault();
    // `disabled={busy}` segue il render React e da solo non chiude la finestra
    // tra due eventi nello stesso tick. Il ref e' un lock sincrono e impedisce
    // la seconda POST anche sotto double click o submit ravvicinati.
    if (otpRequestInFlight.current) return;
    if (!email.includes("@")) {
      setStatus("Inserisci una email valida.");
      return;
    }
    // TICKET — ADMIN MAGIC LINK SOLO PER fenice.sp@gmail.com: trim+lowercase
    // PRIMA di qualunque confronto/invio (Fase 5: devono essere equivalenti
    // "fenice.sp@gmail.com" / "FENICE.SP@GMAIL.COM" / " Fenice.Sp@gmail.com").
    // Blocco SOLO per il contesto Admin — Cliente/Driver/Supplier invariati,
    // ricevono comunque un'email normalizzata (mai meno corretto).
    const normalizedEmail = normalizeEmail(email);
    if (isAdminContext && !isAuthorizedAdminEmail(normalizedEmail)) {
      setStatus("Email non autorizzata per l'accesso amministratore.");
      return;
    }
    if (!configured) {
      setStatus("Configura VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY in.env.local per inviare magic link reali.");
      // Configurazione auth realmente mancante (non l'assenza di sessione,
      // che e' lo stato normale di un visitatore non loggato): un admin/dev
      // deve saperlo, e' l'unico modo per cui il login smette di funzionare
      // per TUTTI, non per un singolo utente.
      logError({
        category: ERROR_CATEGORIES.AUTH,
        module: "login",
        message: "Configurazione Supabase Auth mancante (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY)",
        severity: ERROR_SEVERITY.CRITICAL,
      });
      return;
    }
    otpRequestInFlight.current = true;
    setBusy(true);
    setStatus("");
    setAuthError(null);
    // L'esito di errore del magic link (vedi useEffect sopra) atterra su
    // {SITE_URL}#error=... senza onorare redirect_to: memorizza qui il
    // context scelto ora, cosi' la pagina di login puo' ripristinarlo anche
    // in quel caso.
    rememberPendingAuthContext(isAdminContext ? "admin" : isDriverContext ? "driver" : isSupplierContext ? "supplier" : "customer");
    if (isDriverContext) {
      const returnTo = new URLSearchParams(window.location.search).get("returnTo") || readPendingAuthReturnPath();
      if (returnTo) rememberPendingAuthReturnPath(returnTo);
      // window.location.origin dell'host che sta davvero inviando la
      // richiesta ORA (localhost sul PC, IP LAN sul telefono) — mai
      // hardcoded, riaffermato qui per coprire anche l'arrivo diretto su
      // /login?context=driver senza passare dalla CTA di TrackingPage.
      rememberPendingAuthOrigin(window.location.origin);
    }
    try {
      // Usa il client ufficiale: emailRedirectTo e' un'opzione SDK che viene
      // serializzata correttamente nel redirect_to del ConfirmationURL.
      // La precedente fetch REST inseriva options.email_redirect_to nel body
      // raw; GoTrue la ignorava e ripiegava sulla Site URL "/".
      //
      // Base via getAuthRedirectBase(), NON window.location.origin: in
      // produzione un magic link richiesto da un dev server LAN/localhost
      // (window.location.origin = http://192.168.x.x:5174) atterrerebbe su
      // quell'IP privato. In dev getAuthRedirectBase() ritorna comunque
      // window.location.origin.
      const { error: otpError } = await authSupabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${getAuthRedirectBase()}${redirectPath}`
        }
      });
      if (otpError) {
        if (otpError.status === 429) {
          throw new Error("Hai richiesto troppi link di accesso. Usa l'ultimo link ricevuto oppure attendi qualche minuto.");
        }
        throw new Error(otpError.message || "magic_link_failed");
      }
      setStatus(isAdminContext ? "Magic link inviato. Controlla la tua email per entrare nella dashboard admin." : "Magic link inviato. Controlla la tua email per entrare nella dashboard.");
    } catch (err) {
      if (err.message !== "magic_link_failed" && err.message !== "Failed to fetch") {
        setStatus(err.message);
      } else {
        setStatus("Non sono riuscito a inviare il codice. Verifica chiavi Supabase e redirect URL.");
      }
      // Fallimento reale della SDK (rate limit, errore Supabase, rete): mai
      // l'indirizzo email del richiedente, solo il messaggio di errore gia'
      // usato per la UI (generico per costruzione — mai un dato personale,
      // vedi i due rami sopra: "Hai richiesto troppi link..."/messaggio SDK
      // grezzo che non contiene mai l'email inserita dall'utente).
      logError({
        category: ERROR_CATEGORIES.AUTH,
        module: "login",
        message: err?.message || "Invio magic link fallito",
        severity: ERROR_SEVERITY.WARNING,
      });
    } finally {
      otpRequestInFlight.current = false;
      setBusy(false);
    }
  };
  if (sessionCheck === "checking") {
    return <div style={{ minHeight: "100vh", background: `linear-gradient(180deg,${C.navyDeep},${C.navyMid})`, padding: "150px 24px", color: "rgba(255,255,255,.72)", textAlign: "center", fontFamily: F.sans }}>
      Accesso in corso...
    </div>;
  }
  return <div style={{
    minHeight: "100vh",
    background: `linear-gradient(180deg,${C.navyDeep},${C.navyMid})`,
    padding: "110px 24px 80px"
  }}>
      <div style={{
      maxWidth: 440,
      margin: "0 auto",
      background: "rgba(255,255,255,.045)",
      border: "1px solid rgba(255,255,255,.09)",
      borderRadius: 16,
      padding: 26,
      boxShadow: "0 30px 70px rgba(0,0,0,.28)"
    }}>
        <div style={{
        fontFamily: F.sans,
        fontSize: 10,
        fontWeight: 800,
        color: C.orange,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        marginBottom: 12
      }}>{isAdminContext ? "Accesso admin" : isDriverContext ? "Accesso operatore" : isSupplierContext ? "Accesso fornitore" : "Accesso cliente"}</div>
        <h1 style={{
        fontFamily: F.serif,
        fontSize: 34,
        color: C.white,
        letterSpacing: "-1px",
        marginBottom: 8
      }}>Entra con magic link</h1>
        <p style={{
        fontFamily: F.sans,
        fontSize: 13,
        color: "rgba(255,255,255,.5)",
        lineHeight: 1.6,
        marginBottom: 20
      }}>Niente password: inserisci la tua email e riceverai un link sicuro per aprire la dashboard campagna.</p>
        {authError && <div style={{
        marginBottom: 16,
        padding: "11px 12px",
        borderRadius: 10,
        background: "rgba(239,68,68,.1)",
        border: "1px solid rgba(239,68,68,.28)",
        fontFamily: F.sans,
        fontSize: 12,
        color: "#fecaca",
        lineHeight: 1.45
      }}>{authError.message}</div>}
        <form onSubmit={sendMagicLink} style={{
        display: "flex",
        flexDirection: "column",
        gap: 12
      }}>
          <input id="login-email" name="email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@azienda.it" style={{
          width: "100%",
          padding: "13px 14px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.14)",
          background: "rgba(255,255,255,.07)",
          color: C.white,
          fontFamily: F.sans,
          fontSize: 14
        }} />
          <button className="btn" disabled={busy} style={{
          minHeight: 46,
          borderRadius: 10,
          border: "none",
          background: C.orange,
          color: C.white,
          fontFamily: F.sans,
          fontSize: 14,
          fontWeight: 800,
          cursor: busy ? "wait" : "pointer"
        }}>{busy ? "Invio in corso..." : authError ? "Invia un nuovo magic link" : "Invia magic link"}</button>
        </form>
        {status && <div style={{
        marginTop: 14,
        padding: "11px 12px",
        borderRadius: 10,
        background: configured ? "rgba(46,204,138,.08)" : "rgba(251,191,36,.08)",
        border: `1px solid ${configured ? "rgba(46,204,138,.22)" : "rgba(251,191,36,.22)"}`,
        fontFamily: F.sans,
        fontSize: 12,
        color: configured ? C.green : C.yellow,
        lineHeight: 1.45
      }}>{status}</div>}
        {!configured && <div style={{
        marginTop: 12,
        fontFamily: F.sans,
        fontSize: 11,
        color: "rgba(255,255,255,.38)",
        lineHeight: 1.5
      }}>Modalita prototipo: la pagina e il flusso sono pronti, l'invio reale parte appena inserisci le variabili ambiente Supabase.</div>}
        <button onClick={() => onNav("home")} style={{
        marginTop: 18,
        border: "none",
        background: "transparent",
        color: "rgba(255,255,255,.38)",
        fontFamily: F.sans,
        fontSize: 12,
        cursor: "pointer"
      }}>Torna alla homepage</button>
      </div>
    </div>;
}
export function DashboardPage({
  onNav
}) {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("vp_supabase_session") || "null");
    } catch {
      return null;
    }
  });
  const {
    cliente,
    sessionInvalid: clienteSessionInvalid
  } = useCliente();
  const {
    campagne,
    loading,
    error,
    sessionInvalid: campagneSessionInvalid
  } = useCampagne();
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
    // P0: useCliente/useCampagne hanno gia' rilevato che supabase.auth.getUser()
    // rifiuta il token bridgeato (sessione scaduta/refresh fallito) e ripulito
    // vp_supabase_session (mai il pending campaign claim, chiave separata). Il
    // badge "Sessione attiva" qui sopra pero' resta legato al solo "session"
    // locale: senza questo, continuerebbe a mostrare "Sessione attiva" a
    // tempo indefinito mentre ogni query reale fallisce silenziosamente.
    // Guardia "&& session" anti-loop: una volta azzerato session, la
    // condizione non e' piu' vera finche' non arriva una sessione valida
    // nuova (nuovo login), quindi questo effect non puo' ri-innescarsi da solo.
    if ((clienteSessionInvalid || campagneSessionInvalid) && session) {
      setSession(null);
      onNav("login");
    }
  }, [clienteSessionInvalid, campagneSessionInvalid, session, onNav]);
  useEffect(() => {
    // Non usare la variabile "session" catturata al render: l'effect qui sopra
    // (stesso componente, stesso passaggio di effect) puo' aver appena salvato
    // la sessione dell'hash del magic link in localStorage senza che questo
    // closure se ne accorga ancora (setSession() si riflette solo al prossimo
    // render). Rileggerla fresca evita il redirect a /login sulla sessione
    // appena creata al primo caricamento del magic link.
    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const currentSession = getStoredSupabaseSession();
    if (hasSupabaseConfig() && !currentSession && !hash.get("access_token")) onNav("login");
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
    // Stati Marketplace (campaigns.status grezzo, non mappato in legacy):
    // etichette italiane professionali, mai "stato sconosciuto".
    requested: [MARKETPLACE_STATUS_LABELS.requested, C.yellow],
    receiving_quotes: [MARKETPLACE_STATUS_LABELS.receiving_quotes, C.orange],
    quote_selected: [MARKETPLACE_STATUS_LABELS.quote_selected, C.blue],
    assigned: [MARKETPLACE_STATUS_LABELS.assigned, C.green]
  };
  const svcCfg = {
    d2d: ["D2D", C.orange],
    h2h: ["H2H", C.blue],
    b2b: ["B2B", C.purple]
  };
  const activeCount = campagne.filter(c => ["confermata", "in_preparazione", "in_distribuzione"].includes(c.stato)).length;
  const waitingPaymentCount = campagne.filter(c => getCustomerPaymentState(c.stato_pagamento) === CUSTOMER_PAYMENT_STATE.PENDING).length;
  const knownTotals = campagne.map(c => c.totale_euro).filter(value => value != null);
  const totalSpent = knownTotals.length ? knownTotals.reduce((a, value) => a + Number(value), 0) : null;
  const flyersDone = campagne.reduce((a, c) => a + Number(c.volantini_distribuiti || 0), 0);
  return <div style={{
    minHeight: "100vh",
    background: C.navyMid,
    padding: "105px 24px 80px"
  }}>
      <div style={{
      maxWidth: 1040,
      margin: "0 auto"
    }}>
        <div style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        alignItems: "center",
        marginBottom: 24,
        flexWrap: "wrap"
      }}>
          <div>
            <div style={{
            fontFamily: F.sans,
            fontSize: 10,
            fontWeight: 800,
            color: C.green,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            marginBottom: 10
          }}>Dashboard cliente</div>
            <h1 style={{
            fontFamily: F.serif,
            fontSize: 34,
            color: C.white,
            letterSpacing: "-1px"
          }}>Ciao {cliente?.nome || cliente?.email || "Cliente"}</h1>
            <div style={{
            marginTop: 7,
            display: "inline-flex",
            padding: "4px 9px",
            borderRadius: 999,
            background: session ? "rgba(46,204,138,.1)" : "rgba(251,191,36,.1)",
            color: session ? C.green : C.yellow,
            fontFamily: F.sans,
            fontSize: 11,
            fontWeight: 800
          }}>{session ? "Sessione attiva" : "Accesso richiesto"}</div>
          </div>
          <button onClick={session ? logout : () => onNav("login")} style={{
          minHeight: 44,
          padding: "0 16px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(255,255,255,.05)",
          color: C.white,
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer"
        }}>{session ? "Logout" : "Accedi"}</button>
        </div>

        {error && <div style={{
        marginBottom: 14,
        padding: "11px 13px",
        borderRadius: 10,
        background: "rgba(251,191,36,.08)",
        border: "1px solid rgba(251,191,36,.22)",
        color: C.yellow,
        fontFamily: F.sans,
        fontSize: 12
      }}>Supabase non disponibile: nessuna campagna reale da mostrare.</div>}

        <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
        gap: 10,
        marginBottom: 16
      }}>
          {[["Campagne attive", activeCount, C.green], ["In attesa pagamento", waitingPaymentCount, C.yellow], ["Totale speso", totalSpent == null ? null : `€${totalSpent.toLocaleString("it-IT", {
          minimumFractionDigits: 2
          })}`, C.orange], ["Volantini distribuiti", flyersDone.toLocaleString("it-IT"), C.blue]].map(([l, v, c]) => <div key={l} style={{
          padding: 16,
          borderRadius: 13,
          background: "rgba(255,255,255,.045)",
          border: "1px solid rgba(255,255,255,.08)"
        }}>
              {v == null ? <MissingValueBadge /> : <div style={{
            fontFamily: F.serif,
            fontSize: 28,
            color: c,
            letterSpacing: "-.6px"
          }}>{v}</div>}
              <div style={{
            fontFamily: F.sans,
            fontSize: 11,
            color: "rgba(255,255,255,.42)",
            marginTop: 5
          }}>{l}</div>
            </div>)}
        </div>
          {isCustomerAiDashboardEnabled && <React.Suspense fallback={<div style={{
        minHeight: 90,
        marginBottom: 16
      }} aria-label="Caricamento Assistente VolantiniPro" />}>
              <CustomerAiAssistantPanel session={session} customer={cliente} campaigns={campagne} dataLoading={loading} dataError={error} />
            </React.Suspense>}


        <div style={{
        background: "rgba(255,255,255,.045)",
        border: "1px solid rgba(255,255,255,.09)",
        borderRadius: 14,
        padding: 20
      }}>
          <div style={{
          fontFamily: F.sans,
          fontSize: 10,
          fontWeight: 800,
          color: C.orange,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          marginBottom: 14
        }}>Lista campagne</div>
          {loading ? <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </> : campagne.length === 0 ? <div style={{
          padding: 22,
          borderRadius: 12,
          background: "rgba(255,255,255,.035)",
          textAlign: "center"
        }}>
              <div style={{
            fontFamily: F.serif,
            fontSize: 24,
            color: C.white
          }}>Nessuna campagna ancora</div>
              <button onClick={() => onNav("step1")} style={{
            marginTop: 14,
            minHeight: 44,
            padding: "0 16px",
            borderRadius: 10,
            border: "none",
            background: C.orange,
            color: C.white,
            fontFamily: F.sans,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer"
          }}>Nuova campagna </button>
            </div> : <div style={{
          display: "grid",
          gap: 10
        }}>
              {campagne.map(campagna => {
            const [svcLabel, svcColor] = svcCfg[campagna.service_type] || [campagna.servizio, C.orange];
            const [statusLabel, statusColor] = statusCfg[campagna.stato] || [campagna.stato, C.white];
            const paymentState = getCustomerPaymentState(campagna.stato_pagamento);
            const paymentLabel = paymentState === CUSTOMER_PAYMENT_STATE.PAID ? "Pagato" : paymentState === CUSTOMER_PAYMENT_STATE.PENDING ? "In attesa pagamento" : CUSTOMER_DATA_UNAVAILABLE;
            const paymentColor = paymentState === CUSTOMER_PAYMENT_STATE.PAID ? C.green : paymentState === CUSTOMER_PAYMENT_STATE.PENDING ? C.yellow : "rgba(255,255,255,.42)";
            const paymentBackground = paymentState === CUSTOMER_PAYMENT_STATE.PAID ? "rgba(46,204,138,.14)" : paymentState === CUSTOMER_PAYMENT_STATE.PENDING ? "rgba(251,191,36,.14)" : "rgba(255,255,255,.06)";
            return <div key={campagna.id} style={{
              padding: 16,
              borderRadius: 13,
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.07)",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 14,
              alignItems: "center"
            }}>
                    <div>
                      <div style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 8
                }}>
                        <span style={{
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: `${svcColor}18`,
                    color: svcColor,
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 900
                  }}>{svcLabel}</span>
                        <span style={{
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: `${statusColor}18`,
                    color: statusColor,
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 900
                  }}>{statusLabel}</span>
                        <span style={{
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: paymentBackground,
                    color: paymentColor,
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 900
                  }}>{paymentLabel}</span>
                      </div>
                      <div style={{
                  fontFamily: F.serif,
                  fontSize: 22,
                  color: C.white
                }}>{campagna.zona}</div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: "rgba(255,255,255,.45)",
                  marginTop: 5
                }}>{(campagna.comuni || []).length > 1 ? `Comuni: ${campagna.comuni.join(", ")}` : (campagna.comuni || [])[0] || customerValue(campagna.zona)}  {campagna.quantita == null ? customerValue(null) : `${campagna.quantita.toLocaleString("it-IT")} volantini`}  {customerValue(campagna.data_inizio)}  {customerValue(campagna.data_fine)}</div>
                    </div>
                    <div style={{
                textAlign: "right"
              }}>
                      {campagna.totale_euro == null ? <MissingValueBadge /> : <div style={{
                  fontFamily: F.serif,
                  fontSize: 24,
                  color: C.green
                }}>{`€${Number(campagna.totale_euro).toLocaleString("it-IT", {
                    minimumFractionDigits: 2
                  })}`}</div>}
                      <button onClick={() => onNav("campaign", {
                  campaignId: campagna.id
                })} style={{
                  marginTop: 8,
                  minHeight: 38,
                  padding: "0 12px",
                  borderRadius: 9,
                  border: `1px solid ${C.orange}35`,
                  background: `${C.orange}12`,
                  color: C.orange,
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer"
                }}>Vedi dettaglio </button>
                    </div>
                  </div>;
          })}
            </div>}
          <div style={{
          marginTop: 16
        }}>
            <button className="btn" onClick={() => onNav("step1")} style={{
            minHeight: 46,
            padding: "0 16px",
            borderRadius: 10,
            border: "none",
            background: C.orange,
            color: C.white,
            fontFamily: F.sans,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer"
          }}>Nuova campagna </button>
          </div>
        </div>
      </div>
    </div>;
}
export function CampaignDashboardPage({
  onNav,
  campaignId
}) {
  const routeCampaignId = campaignId || window.location.pathname.split("/").filter(Boolean).pop() || null;
  const nuovo = new URLSearchParams(window.location.search).get("nuovo") === "true";
  const {
    campagna,
    loading,
    error
  } = useCampagnaDetail(routeCampaignId);
  if (loading) {
    return <div style={{
      minHeight: "100vh",
      background: C.navyMid,
      padding: "105px 24px 80px"
    }}><div style={{
        maxWidth: 1040,
        margin: "0 auto"
      }}><SkeletonCard /><SkeletonCard /><SkeletonCard /></div></div>;
  }
  if (campagna) {
    const progressSteps = [["confermata", "Confermata"], ["in_preparazione", "In preparazione"], ["in_distribuzione", "Distribuzione"], ["completata", "Completata"]];
    const activeIndex = Math.max(0, progressSteps.findIndex(([key]) => key === campagna.stato));
    const distributedPct = campagna.quantita && campagna.volantini_distribuiti != null ? Math.min(100, Math.round(campagna.volantini_distribuiti / campagna.quantita * 100)) : null;
    const gpsPoints = campagna.gps_punti?.length ? campagna.gps_punti.map((_, i) => [18 + i * 10, 68 - i * 5]) : [];
    const proof = campagna.foto_proof || [];
    const daysRemaining = campagna.data_fine ? Math.max(0, Math.ceil((new Date(`${campagna.data_fine}T00:00:00`) - new Date()) / 86400000)) : 0;
    const pricing = campagna.pricing || {};
    const extras = (pricing.extras || []).reduce((a, x) => a + Number(x.amount || 0), 0);
    const discounts = (pricing.discounts || []).reduce((a, x) => a + Number(x.amount || 0), 0);
    const base = pricing.subtotal || campagna.totale_euro || 0;
    const total = pricing.total || campagna.totale_euro || 0;
    return <div style={{
      minHeight: "100vh",
      background: C.navyMid,
      padding: "105px 24px 80px"
    }}>
        <div style={{
        maxWidth: 1180,
        margin: "0 auto"
      }}>
          {nuovo && <div style={{
          marginBottom: 14,
          padding: "12px 14px",
          borderRadius: 11,
          background: "rgba(46,204,138,.1)",
          border: "1px solid rgba(46,204,138,.24)",
          color: C.green,
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 800
        }}>Campagna confermata! Ti contatteremo entro 24 ore per confermare i dettagli operativi.</div>}
          {error && <div style={{
          marginBottom: 14,
          padding: "11px 13px",
          borderRadius: 10,
          background: "rgba(251,191,36,.08)",
          border: "1px solid rgba(251,191,36,.22)",
          color: C.yellow,
          fontFamily: F.sans,
          fontSize: 12
        }}>Dettaglio reale non disponibile.</div>}
          <div style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 22
        }}>
            <div>
              <button onClick={() => onNav("dashboard")} style={{
              padding: 0,
              border: "none",
              background: "transparent",
              color: "rgba(255,255,255,.45)",
              fontFamily: F.sans,
              fontSize: 12,
              cursor: "pointer",
              marginBottom: 9
            }}>Dashboard  Campagna #{String(campagna.id).slice(0, 8)}</button>
              <h1 style={{
              fontFamily: F.serif,
              fontSize: 34,
              color: C.white,
              letterSpacing: "-1px"
            }}>Campagna {campagna.servizio}  {campagna.zona}</h1>
              <div style={{
              fontFamily: F.sans,
              fontSize: 13,
              color: "rgba(255,255,255,.45)",
              marginTop: 6
            }}>{campagna.quantita == null ? customerValue(null) : `${campagna.quantita.toLocaleString("it-IT")} volantini`}  Smart Pairing {campagna.smart_pairing_sconto == null ? customerValue(null) : `${campagna.smart_pairing_sconto}%`}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={() => onNav(`customer-tracking:${campagna.id}`)} style={{
            minHeight: 44,
            padding: "0 16px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.05)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer"
          }}>Tracking live</button><button onClick={() => onNav(`customer-report:${campagna.id}`)} style={{
            minHeight: 44,
            padding: "0 16px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.05)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer"
          }}>Apri report</button></div>
          </div>

          {/* Marketplace: preventivi Fornitore ricevuti + selezione. Il
              componente si auto-nasconde per le campagne legacy (rende null se
              campagna.rawStatus non e' uno stato Marketplace). */}
          <CustomerQuotesView campaignId={routeCampaignId} status={campagna.rawStatus} />

          {/* TICKET — CUSTOMER CONTROL CENTER: Step1-4 in sola lettura +
              "Richiedi modifica" (dati REALI da campagna.metadata, nessuna
              ricostruzione) e chat Cliente<->Admin (mai Cliente<->Driver:
              vincolo strutturale lato RPC/DB, non solo qui). */}
          <CampaignConfigSection campagna={campagna} />
          <CustomerMessagesPanel campaignId={routeCampaignId} />

          <div style={{
          background: "rgba(255,255,255,.045)",
          border: "1px solid rgba(255,255,255,.09)",
          borderRadius: 14,
          padding: 18,
          marginBottom: 14
        }}>
            <div style={{
            fontFamily: F.sans,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,.45)",
            marginBottom: 10
          }}>Zone / Comuni</div>
            {(campagna.campaignZones || []).length === 0 ? <div style={{
            fontFamily: F.sans,
            fontSize: 13,
            color: "rgba(255,255,255,.5)"
          }}>Zone della campagna non disponibili</div> : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {campagna.campaignZones.map((z) => <div key={z.id || z.zone_name} style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: F.sans,
              fontSize: 13,
              color: C.white
            }}><span>{z.zone_name || customerValue(null)}</span><span style={{ color: "rgba(255,255,255,.6)" }}>{z.quantity_assigned == null ? customerValue(null) : `${Number(z.quantity_assigned).toLocaleString("it-IT")} volantini`}</span></div>)}
              <div style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 800,
              color: C.white,
              marginTop: 6,
              paddingTop: 8,
              borderTop: "1px solid rgba(255,255,255,.08)"
            }}><span>Totale</span><span>{campagna.quantita == null ? customerValue(null) : `${campagna.quantita.toLocaleString("it-IT")} volantini`}</span></div>
            </div>}
          </div>

          <div style={{
          background: "rgba(255,255,255,.045)",
          border: "1px solid rgba(255,255,255,.09)",
          borderRadius: 14,
          padding: 18,
          marginBottom: 14
        }}>
            <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
            gap: 10
          }}>
              {progressSteps.map(([id, label], i) => {
              const done = i <= activeIndex;
              return <div key={id} style={{
                padding: 12,
                borderRadius: 11,
                background: done ? "rgba(46,204,138,.08)" : "rgba(255,255,255,.035)",
                border: `1px solid ${done ? "rgba(46,204,138,.24)" : "rgba(255,255,255,.06)"}`
              }}><div style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: done ? C.green : "rgba(255,255,255,.1)",
                  color: C.white,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  marginBottom: 8
                }}>{i + 1}</div><div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  color: done ? C.white : "rgba(255,255,255,.42)"
                }}>{label}</div></div>;
            })}
            </div>
          </div>

          <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1.25fr) minmax(280px,.75fr)",
          gap: 14
        }}>
            <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}>
              <div style={{
              padding: 14,
              borderRadius: 12,
              background: campagna.stato_pagamento === "pagato" ? "rgba(46,204,138,.08)" : "rgba(251,191,36,.08)",
              border: `1px solid ${campagna.stato_pagamento === "pagato" ? "rgba(46,204,138,.22)" : "rgba(251,191,36,.22)"}`,
              color: campagna.stato_pagamento === "pagato" ? C.green : C.yellow,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 800
            }}>
                {campagna.stato_pagamento === "pagato" ? "Pagamento ricevuto" : "In attesa del tuo bonifico"}
                {campagna.stato_pagamento !== "pagato" && <button onClick={() => onNav("payment", {
                campaignId: campagna.id
              })} style={{
                marginLeft: 12,
                minHeight: 34,
                padding: "0 11px",
                borderRadius: 8,
                border: "none",
                background: C.yellow,
                color: C.navyDeep,
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 900,
                cursor: "pointer"
              }}>Vedi istruzioni pagamento </button>}
              </div>
              <div style={{
              background: "rgba(255,255,255,.045)",
              border: "1px solid rgba(255,255,255,.09)",
              borderRadius: 14,
              padding: 18
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 800,
                color: C.green,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                marginBottom: 12
              }}>Statistiche distribuzione</div>
                {[["Volantini distribuiti", campagna.volantini_distribuiti == null || campagna.quantita == null ? customerValue(null) : `${campagna.volantini_distribuiti.toLocaleString("it-IT")} / ${campagna.quantita.toLocaleString("it-IT")}`, distributedPct, C.green], ["Copertura raggiunta", campagna.copertura_pct == null ? customerValue(null) : `${campagna.copertura_pct}%`, campagna.copertura_pct, C.orange], ["Comuni completati", distributedPct == null ? customerValue(null) : `${Math.max(1, Math.round((campagna.comuni?.length || 1) * distributedPct / 100))}/${campagna.comuni?.length || 1}`, distributedPct, C.blue], ["Giorni rimanenti", campagna.data_fine ? String(daysRemaining) : customerValue(null), campagna.data_fine ? Math.max(0, 100 - daysRemaining * 20) : null, C.purple]].map(([l, v, pct, c]) => <div key={l} style={{
                marginBottom: 10
              }}><div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: C.white,
                  marginBottom: 5
                }}><span>{l}</span><b style={{
                    color: v === CUSTOMER_DATA_UNAVAILABLE ? "rgba(255,255,255,.4)" : c,
                    fontWeight: v === CUSTOMER_DATA_UNAVAILABLE ? 700 : 900
                  }}>{v}</b></div><div style={{
                  height: 6,
                  borderRadius: 999,
                  background: "rgba(255,255,255,.08)",
                  overflow: "hidden"
                }}><div style={{
                    width: `${pct == null ? 0 : Math.max(0, Math.min(100, pct))}%`,
                    height: "100%",
                    background: c
                  }} /></div></div>)}
              </div>

              <div style={{
              background: "rgba(255,255,255,.045)",
              border: "1px solid rgba(255,255,255,.09)",
              borderRadius: 14,
              padding: 18
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 800,
                color: C.blue,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                marginBottom: 12
              }}>Percorso GPS live</div>
                <div style={{
                height: 300,
                borderRadius: 12,
                background: "linear-gradient(135deg,#173225,#182b42 52%,#2b2648)",
                border: "1px solid rgba(255,255,255,.08)",
                position: "relative",
                overflow: "hidden"
              }}>
                  {gpsPoints.length > 0 ? <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{
                  position: "absolute",
                  inset: 0
                }}><polyline points={gpsPoints.map(p => p.join(",")).join(" ")} fill="none" stroke={C.green} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />{gpsPoints.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === gpsPoints.length - 1 ? 2.3 : 1.3} fill={i === gpsPoints.length - 1 ? C.orange : C.green} />)}</svg> : <div style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: F.sans,
                  fontSize: 13,
                  color: "rgba(255,255,255,.48)"
                }}>GPS tracking disponibile durante la distribuzione</div>}
                </div>
              </div>

              <div style={{
              background: "rgba(255,255,255,.045)",
              border: "1px solid rgba(255,255,255,.09)",
              borderRadius: 14,
              padding: 18
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 800,
                color: C.purple,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                marginBottom: 12
              }}>Foto proof geolocalizzate</div>
                {proof.length > 0 ? <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
                gap: 10
              }}>{proof.map((p, i) => <div key={i} style={{
                  aspectRatio: "4/3",
                  borderRadius: 11,
                  background: `url(${p.url}) center/cover, rgba(255,255,255,.05)`,
                  border: "1px solid rgba(255,255,255,.08)"
                }} />)}</div> : <div style={{
                padding: 22,
                borderRadius: 11,
                background: "rgba(255,255,255,.035)",
                fontFamily: F.sans,
                fontSize: 13,
                color: "rgba(255,255,255,.48)",
                textAlign: "center"
              }}>Le foto verranno caricate durante la distribuzione</div>}
              </div>
            </div>

            <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}>
              <div style={{
              background: "rgba(255,255,255,.045)",
              border: "1px solid rgba(255,255,255,.09)",
              borderRadius: 14,
              padding: 18
            }}><div style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 800,
                color: C.green,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                marginBottom: 12
              }}>Smart Pairing</div>{campagna.smart_pairing_sconto == null ? <MissingValueBadge /> : <div style={{
                fontFamily: F.serif,
                fontSize: 30,
                color: C.green,
                letterSpacing: "-.8px"
              }}>{`${campagna.smart_pairing_sconto}%`}</div>}<div style={{
                fontFamily: F.sans,
                fontSize: 12,
                color: "rgba(255,255,255,.48)",
                lineHeight: 1.55,
                marginTop: 6
              }}>{(campagna.selected_dates || []).join("  ") || "Date da confermare"}  sconto applicato al preventivo.</div></div>
              <div style={{
              background: "rgba(255,255,255,.045)",
              border: "1px solid rgba(255,255,255,.09)",
              borderRadius: 14,
              padding: 18
            }}><div style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 800,
                color: C.orange,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                marginBottom: 12
              }}>Riepilogo economico</div>{[["Distribuzione base", base], ["Servizi extra", extras], ["Smart Pairing sconto", -discounts], ["Totale pagato", total]].map(([l, v]) => <div key={l} style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "9px 0",
                borderBottom: "1px solid rgba(255,255,255,.06)",
                fontFamily: F.sans,
                fontSize: 12,
                color: "rgba(255,255,255,.58)"
              }}><span>{l}</span><b style={{
                  color: v < 0 ? C.green : C.white
                }}>€{Number(v || 0).toLocaleString("it-IT", {
                    minimumFractionDigits: 2
                  })}</b></div>)}</div>
              <div style={{
              background: "rgba(255,255,255,.045)",
              border: "1px solid rgba(255,255,255,.09)",
              borderRadius: 14,
              padding: 18
            }}><div style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 800,
                color: C.blue,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                marginBottom: 10
              }}>Fonti dati</div><div style={{
                fontFamily: F.sans,
                fontSize: 12,
                color: "rgba(255,255,255,.48)",
                lineHeight: 1.6
              }}>ISTAT  Mapbox  OpenStreetMap  Analisi interna</div><a href="https://wa.me/" style={{
                display: "inline-block",
                marginTop: 12,
                color: C.green,
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 800,
                textDecoration: "none"
              }}>Hai domande? Contattaci via WhatsApp </a></div>
            </div>
          </div>
        </div>
      </div>;
  }
  return <div style={{
    minHeight: "100vh",
    background: C.navyMid,
    padding: "105px 24px 80px"
  }}>
      <div style={{
      maxWidth: 920,
      margin: "0 auto",
      padding: 24,
      borderRadius: 14,
      background: "rgba(255,255,255,.045)",
      border: "1px solid rgba(255,255,255,.09)",
      textAlign: "center"
    }}>
        <h1 style={{
        fontFamily: F.serif,
        fontSize: 30,
        color: C.white,
        letterSpacing: "-1px",
        marginBottom: 8
      }}>Nessuna campagna presente.</h1>
        <p style={{
        fontFamily: F.sans,
        fontSize: 13,
        color: "rgba(255,255,255,.52)",
        lineHeight: 1.6
      }}>Il dettaglio campagna richiede dati reali dal database.</p>
        <button onClick={() => onNav("dashboard")} style={{
        marginTop: 16,
        minHeight: 42,
        padding: "0 16px",
        borderRadius: 10,
        border: "none",
        background: C.orange,
        color: C.white,
        fontFamily: F.sans,
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer"
      }}>Torna dashboard</button>
      </div>
    </div>;
  const steps = [["confermata", "Confermata"], ["preparazione", "In preparazione"], ["distribuzione", "Distribuzione"], ["completata", "Completata"]];
  const activeIdx = 2;
  const gpsPoints = [[18, 68], [28, 58], [38, 62], [48, 45], [58, 50], [70, 36], [82, 42]];
  const stats = [["Volantini distribuiti", "7.420", C.green], ["Copertura stimata", "74%", C.orange], ["Zone completate", "3/5", C.blue], ["Proof foto", "12", C.purple]];
  const history = [["VP-12052026-001", "Door to Door", "Cormano", "Completata", "386"], ["VP-18042026-002", "Business Distribution", "Bresso", "Completata", "420"]];
  return <div style={{
    minHeight: "100vh",
    background: C.navyMid,
    padding: "105px 24px 80px"
  }}>
      <div style={{
      maxWidth: 1180,
      margin: "0 auto"
    }}>
        <div style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 22
      }}>
          <div>
            <div style={{
            fontFamily: F.sans,
            fontSize: 10,
            fontWeight: 800,
            color: C.orange,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            marginBottom: 9
          }}>Campagna VP-12052026-001</div>
            <h1 style={{
            fontFamily: F.serif,
            fontSize: 34,
            color: C.white,
            letterSpacing: "-1px"
          }}>Dashboard campagna</h1>
            <div style={{
            fontFamily: F.sans,
            fontSize: 13,
            color: "rgba(255,255,255,.45)",
            marginTop: 6
          }}>Dettaglio campagna non disponibile</div>
          </div>
          <button onClick={() => onNav("dashboard")} style={{
          minHeight: 44,
          padding: "0 16px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(255,255,255,.05)",
          color: C.white,
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer"
        }}>Torna dashboard</button>
        </div>

        <div style={{
        background: "rgba(255,255,255,.045)",
        border: "1px solid rgba(255,255,255,.09)",
        borderRadius: 14,
        padding: 18,
        marginBottom: 14
      }}>
          <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: 10
        }}>
            {steps.map(([id, label], i) => {
            const done = i <= activeIdx;
            return <div key={id} style={{
              padding: 12,
              borderRadius: 11,
              background: done ? "rgba(46,204,138,.08)" : "rgba(255,255,255,.035)",
              border: `1px solid ${done ? "rgba(46,204,138,.24)" : "rgba(255,255,255,.06)"}`
            }}>
                  <div style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: done ? C.green : "rgba(255,255,255,.1)",
                color: C.white,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 8
              }}>{i + 1}</div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 800,
                color: done ? C.white : "rgba(255,255,255,.42)"
              }}>{label}</div>
                </div>;
          })}
          </div>
        </div>

        <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1.25fr) minmax(280px,.75fr)",
        gap: 14
      }}>
          <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 14
        }}>
            <div style={{
            background: "rgba(255,255,255,.045)",
            border: "1px solid rgba(255,255,255,.09)",
            borderRadius: 14,
            padding: 18
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 800,
              color: C.blue,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 12
            }}>Percorso GPS live</div>
              <div style={{
              height: 300,
              borderRadius: 12,
              background: "linear-gradient(135deg,#173225,#182b42 52%,#2b2648)",
              border: "1px solid rgba(255,255,255,.08)",
              position: "relative",
              overflow: "hidden"
            }}>
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{
                position: "absolute",
                inset: 0
              }}>
                  <defs><pattern id="vp-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth=".35" /></pattern></defs>
                  <rect width="100" height="100" fill="url(#vp-grid)" />
                  <polyline points={gpsPoints.map(p => p.join(",")).join(" ")} fill="none" stroke={C.green} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  {gpsPoints.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === gpsPoints.length - 1 ? 2.3 : 1.3} fill={i === gpsPoints.length - 1 ? C.orange : C.green} />)}
                </svg>
                <div style={{
                position: "absolute",
                left: 12,
                top: 12,
                padding: "7px 10px",
                borderRadius: 8,
                background: "rgba(15,26,48,.86)",
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.72)",
                border: "1px solid rgba(255,255,255,.08)"
              }}>Ultimo ping: 14:32  Bresso</div>
              </div>
            </div>

            <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
            gap: 10
          }}>
              {stats.map(([l, v, c]) => <div key={l} style={{
              padding: 15,
              borderRadius: 13,
              background: "rgba(255,255,255,.045)",
              border: "1px solid rgba(255,255,255,.08)"
            }}>
                  <div style={{
                fontFamily: F.serif,
                fontSize: 28,
                color: c,
                letterSpacing: "-.5px"
              }}>{v}</div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.42)",
                marginTop: 4
              }}>{l}</div>
                </div>)}
            </div>

            <div style={{
            background: "rgba(255,255,255,.045)",
            border: "1px solid rgba(255,255,255,.09)",
            borderRadius: 14,
            padding: 18
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 800,
              color: C.purple,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 12
            }}>Foto proof geolocalizzate</div>
              <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
              gap: 10
            }}>
                {["Cormano centro", "Bresso nord", "Via Roma", "Zona scuole"].map((label, i) => <div key={label} style={{
                aspectRatio: "4/3",
                borderRadius: 11,
                background: `linear-gradient(135deg,rgba(232,87,26,${.16 + i * .03}),rgba(96,165,250,.16))`,
                border: "1px solid rgba(255,255,255,.08)",
                padding: 10,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end"
              }}>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800,
                  color: C.white
                }}>{label}</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.45)"
                }}>GPS  oggi</div>
                  </div>)}
              </div>
            </div>
          </div>

          <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 14
        }}>
            <div style={{
            background: "rgba(255,255,255,.045)",
            border: "1px solid rgba(255,255,255,.09)",
            borderRadius: 14,
            padding: 18
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 800,
              color: C.green,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 12
            }}>Smart Pairing</div>
              <div style={{
              fontFamily: F.serif,
              fontSize: 30,
              color: C.green,
              letterSpacing: "-.8px"
            }}>-20%</div>
              <div style={{
              fontFamily: F.sans,
              fontSize: 12,
              color: "rgba(255,255,255,.48)",
              lineHeight: 1.55,
              marginTop: 6
            }}>Slot 13 Mag  zona compatibile Bresso  sconto applicato al preventivo.</div>
            </div>

            <div style={{
            background: "rgba(255,255,255,.045)",
            border: "1px solid rgba(255,255,255,.09)",
            borderRadius: 14,
            padding: 18
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 800,
              color: C.orange,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 12
            }}>Report finale</div>
              <button className="btn" style={{
              width: "100%",
              minHeight: 44,
              borderRadius: 10,
              border: "none",
              background: C.orange,
              color: C.white,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer"
            }}>Download PDF report</button>
              <div style={{
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.34)",
              marginTop: 10,
              lineHeight: 1.45
            }}>Il report reale verra generato dai dati `tracking_gps` e proof foto.</div>
            </div>

            <div style={{
            background: "rgba(255,255,255,.045)",
            border: "1px solid rgba(255,255,255,.09)",
            borderRadius: 14,
            padding: 18
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 800,
              color: C.blue,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginBottom: 10
            }}>Storico campagne</div>
              {history.map(([id, service, zone, status, total]) => <div key={id} style={{
              padding: "10px 0",
              borderBottom: "1px solid rgba(255,255,255,.06)"
            }}>
                  <div style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8
              }}>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  color: C.white
                }}>{id}</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  color: C.green
                }}>{total}</div>
                  </div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                color: "rgba(255,255,255,.42)",
                marginTop: 3
              }}>{service}  {zone}  {status}</div>
                </div>)}
            </div>
          </div>
        </div>
      </div>
    </div>;
}
// Nessun placeholder: se le coordinate bancarie reali non sono configurate
// (VITE_IBAN / VITE_INTESTATARIO / VITE_BANCA), BONIFICO.available e' false e
// la UI mostra BANK_TRANSFER_UNAVAILABLE_MESSAGE invece di un IBAN finto.
const BONIFICO = getBankTransferDetails();
export function PagamentoBonificoPage({
  onNav,
  campaignId
}) {
  const routeCampaignId = campaignId || window.location.pathname.split("/").filter(Boolean)[1] || null;
  const {
    campagna,
    loading
  } = useCampagnaDetail(routeCampaignId);
  const {
    cliente
  } = useCliente();
  const [toast, setToast] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const showToast = msg => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };
  useEffect(() => {
    if (campagna?.stato_pagamento === "pagato") {
      setPaymentStatus("pagato");
      return;
    }
    setPaymentStatus(campagna?.stato_pagamento || null);
    const poll = async () => {
      try {
        if (!supabase || !routeCampaignId) return;
        const {
          data
        } = await supabase.from("campaigns").select("metadata").eq("id", routeCampaignId).single();
        setPaymentStatus(data?.metadata?.payment_status || null);
      } catch {/* silently skip */}
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
  if (loading) return <div style={{
    minHeight: "100vh",
    background: C.navyMid,
    padding: "105px 24px"
  }}><div style={{
      maxWidth: 720,
      margin: "0 auto"
    }}><SkeletonCard /></div></div>;
  if (!campagna) {
    return <div style={{
      minHeight: "100vh",
      background: C.navyMid,
      padding: "105px 24px 80px"
    }}>
        <div style={{
        maxWidth: 720,
        margin: "0 auto",
        background: "rgba(255,255,255,.045)",
        border: "1px solid rgba(255,255,255,.09)",
        borderRadius: 16,
        padding: 24
      }}>
          <div style={{
          fontFamily: F.serif,
          fontSize: 34,
          color: C.white,
          marginBottom: 8
        }}>Pagamento non disponibile</div>
          <div style={{
          fontFamily: F.sans,
          fontSize: 14,
          color: "rgba(255,255,255,.55)",
          lineHeight: 1.6
        }}>Le istruzioni di bonifico richiedono una campagna reale salvata nel database.</div>
        </div>
      </div>;
  }
  // PAYMENT_MODE "manual_contact": nessun pagamento online, nessuna coordinata
  // bancaria. Il cliente vede la ricevuta + i CTA di contatto. Lo stato di
  // pagamento reale della campagna NON viene toccato. Il blocco bonifico sotto
  // resta nel codice per un futuro ripristino (VITE_PAYMENT_MODE != manual_contact).
  if (IS_MANUAL_CONTACT) {
    const contactId = campagna.id || routeCampaignId || null;
    const waUrl = buildCampaignContactWhatsAppUrl(contactId);
    const mailUrl = buildCampaignContactMailtoUrl(contactId);
    const primaryBtn = {
      minHeight: 48,
      padding: "0 20px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      border: "none",
      background: "#25D366",
      color: "#0B1020",
      fontFamily: F.sans,
      fontSize: 15,
      fontWeight: 900,
      textDecoration: "none",
      cursor: "pointer",
      boxShadow: "0 8px 22px rgba(37,211,102,.28)"
    };
    const secondaryBtn = {
      minHeight: 44,
      padding: "0 16px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11,
      border: `1px solid ${C.orange}55`,
      background: `${C.orange}12`,
      color: C.orange,
      fontFamily: F.sans,
      fontSize: 14,
      fontWeight: 800,
      textDecoration: "none",
      cursor: "pointer"
    };
    const tertiaryBtn = {
      minHeight: 44,
      padding: "0 16px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11,
      border: "1px solid rgba(255,255,255,.14)",
      background: "transparent",
      color: "rgba(255,255,255,.72)",
      fontFamily: F.sans,
      fontSize: 14,
      fontWeight: 700,
      cursor: "pointer"
    };
    return <div style={{
      minHeight: "100vh",
      background: C.navyMid,
      padding: "105px 24px 80px"
    }}>
        <div style={{
        maxWidth: 640,
        margin: "0 auto",
        background: "rgba(255,255,255,.045)",
        border: "1px solid rgba(255,255,255,.09)",
        borderRadius: 16,
        padding: 28
      }}>
          <div style={{
          width: 46,
          height: 46,
          borderRadius: "50%",
          background: "rgba(46,204,138,.14)",
          border: "1px solid rgba(46,204,138,.34)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.green,
          fontSize: 24,
          fontWeight: 900,
          marginBottom: 16
        }}>✓</div>
          <div style={{
          fontFamily: F.serif,
          fontSize: 34,
          color: C.white,
          marginBottom: 10
        }}>Campagna confermata!</div>
          <div style={{
          fontFamily: F.sans,
          fontSize: 16,
          color: C.white,
          fontWeight: 700,
          lineHeight: 1.6,
          marginBottom: 6
        }}>Abbiamo ricevuto correttamente la tua richiesta.</div>
          <div style={{
          fontFamily: F.sans,
          fontSize: 14,
          color: "rgba(255,255,255,.6)",
          lineHeight: 1.6,
          marginBottom: 18
        }}>Ti contatteremo al più presto per completare la conferma della campagna e fornirti le istruzioni di pagamento.</div>
          {contactId && <div style={{
          display: "inline-block",
          padding: "7px 12px",
          borderRadius: 9,
          background: "rgba(255,255,255,.05)",
          border: "1px solid rgba(255,255,255,.1)",
          fontFamily: F.sans,
          fontSize: 12,
          fontWeight: 800,
          color: "rgba(255,255,255,.75)",
          marginBottom: 22
        }}>ID campagna: {contactId}</div>}
          <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "stretch"
        }}>
            {waUrl && <a href={waUrl} target="_blank" rel="noreferrer" style={primaryBtn}>Contattaci su WhatsApp</a>}
            <a href={mailUrl} style={secondaryBtn}>Contattaci via Email</a>
            <button onClick={() => onNav("campaign", {
            campaignId: campagna.id
          })} style={tertiaryBtn}>Vai alla Dashboard</button>
          </div>
          {!waUrl && <p style={{
          fontFamily: F.sans,
          fontSize: 12,
          color: "rgba(255,255,255,.4)",
          lineHeight: 1.5,
          marginTop: 14,
          marginBottom: 0
        }}>Scrivici via email: ti risponderemo al più presto.</p>}
        </div>
      </div>;
  }
  return <div style={{
    minHeight: "100vh",
    background: C.navyMid,
    padding: "105px 24px 80px"
  }}>
      <div style={{
      maxWidth: 720,
      margin: "0 auto",
      background: "rgba(255,255,255,.045)",
      border: "1px solid rgba(255,255,255,.09)",
      borderRadius: 16,
      padding: 24
    }}>
        <div style={{
        fontFamily: F.serif,
        fontSize: 34,
        color: C.white,
        marginBottom: 8
      }}>Campagna confermata!</div>
        <div style={{
        fontFamily: F.sans,
        fontSize: 14,
        color: "rgba(255,255,255,.55)",
        lineHeight: 1.6,
        marginBottom: 18
      }}>Completa il pagamento per avviare la distribuzione.</div>
        {paymentStatus === "pagato" ? <div style={{
        marginBottom: 14,
        padding: 12,
        borderRadius: 10,
        background: "rgba(46,204,138,.1)",
        border: "1px solid rgba(46,204,138,.24)",
        color: C.green,
        fontFamily: F.sans,
        fontSize: 13,
        fontWeight: 800
      }}>
             Pagamento ricevuto &mdash; la distribuzione partira entro 24 ore.
          </div> : paymentStatus === "in_attesa" ? <div style={{
        marginBottom: 14,
        padding: 12,
        borderRadius: 10,
        background: "rgba(251,191,36,.1)",
        border: "1px solid rgba(251,191,36,.3)",
        color: C.yellow,
        fontFamily: F.sans,
        fontSize: 13,
        fontWeight: 800
      }}>
             In attesa del bonifico
          </div> : <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.7)', fontFamily: F.sans }}>Stato pagamento: {customerValue(null)}</div>}
        <div style={{
        padding: 18,
        borderRadius: 13,
        background: "rgba(255,255,255,.04)",
        border: "1px solid rgba(255,255,255,.08)",
        marginBottom: 14
      }}>
          <div style={{
          fontFamily: F.sans,
          fontSize: 10,
          color: C.orange,
          fontWeight: 900,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          marginBottom: 14
        }}>Istruzioni bonifico</div>
          {!BONIFICO.available ? <div style={{
          fontFamily: F.sans,
          fontSize: 13,
          color: "rgba(255,255,255,.7)",
          lineHeight: 1.6
        }}>{BANK_TRANSFER_UNAVAILABLE_MESSAGE}</div> : [["Intestatario", BONIFICO.intestatario], ["Banca", BONIFICO.banca], ["IBAN", BONIFICO.iban], ["Importo", campagna.totale_euro == null ? customerValue(null) : `€${Number(campagna.totale_euro).toLocaleString("it-IT", {
          minimumFractionDigits: 2
        })}`], ["Causale", customerValue(campagna.causale_bonifico)]].map(([l, v]) => <div key={l} style={{
          display: "grid",
          gridTemplateColumns: "130px 1fr",
          gap: 10,
          padding: "9px 0",
          borderBottom: "1px solid rgba(255,255,255,.06)",
          fontFamily: F.sans,
          fontSize: 13
        }}><span style={{
            color: "rgba(255,255,255,.42)"
          }}>{l}</span><b style={{
            color: C.white
          }}>{v}</b></div>)}
        </div>
        <div style={{
        padding: 12,
        borderRadius: 10,
        background: "rgba(251,191,36,.08)",
        border: "1px solid rgba(251,191,36,.22)",
        color: C.yellow,
        fontFamily: F.sans,
        fontSize: 12,
        lineHeight: 1.5,
        marginBottom: 14
      }}>{BONIFICO.available ? "Inserire la causale esatta per il corretto abbinamento. La distribuzione parte entro 24h dalla ricezione del bonifico." : "Le istruzioni di pagamento saranno disponibili a breve. Nessun bonifico va effettuato finche' le coordinate non sono confermate."}</div>
        <div style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: 14
      }}>
          {BONIFICO.available && <button onClick={() => copy("IBAN", BONIFICO.iban)} style={{
          minHeight: 44,
          padding: "0 14px",
          borderRadius: 10,
          border: `1px solid ${C.orange}35`,
          background: `${C.orange}12`,
          color: C.orange,
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 800,
          cursor: "pointer"
        }}>Copia IBAN</button>}
          <button disabled={!campagna.causale_bonifico} onClick={() => copy("Causale", campagna.causale_bonifico)} style={{
          minHeight: 44,
          padding: "0 14px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(255,255,255,.05)",
          color: C.white,
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 800,
          cursor: "pointer"
        }}>Copia causale</button>
          <button onClick={() => showToast(`Istruzioni inviate a ${cliente?.email || "email"}`)} style={{
          minHeight: 44,
          padding: "0 14px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(255,255,255,.05)",
          color: "rgba(255,255,255,.7)",
          fontFamily: F.sans,
          fontSize: 13,
          cursor: "pointer"
        }}> Invia istruzioni</button>
          <button onClick={() => onNav("campaign", {
          campaignId: campagna.id
        })} style={{
          minHeight: 44,
          padding: "0 14px",
          borderRadius: 10,
          border: "none",
          background: C.green,
          color: C.white,
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 800,
          cursor: "pointer"
        }}>Dashboard </button>
        </div>
        <p style={{
        fontSize: 12,
        color: "rgba(255,255,255,.35)",
        textAlign: "center",
        marginTop: 16
      }}>
           Aiuto? <a href="https://wa.me/393331234567" target="_blank" rel="noreferrer" style={{
          color: "#25D366",
          textDecoration: "none"
        }}>WhatsApp</a> o <a href="mailto:info@volantinipro.it" style={{
          color: C.orange,
          textDecoration: "none"
        }}>Email</a>
        </p>
      </div>
      {toast && <div style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      background: "#1A2744",
      color: "white",
      padding: "10px 20px",
      borderRadius: 8,
      border: `1px solid ${C.orange}66`,
      fontWeight: 700,
      fontSize: 14,
      zIndex: 9999,
      boxShadow: "0 4px 20px rgba(0,0,0,.4)",
      animation: "fadeIn.3s ease both"
    }}>
           {toast}
        </div>}
    </div>;
}
function CookieBanner({
  onNav
}) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("vp_cookie_consent") !== "accepted";
  });
  if (!visible) return null;
  return <div style={{
    position: "fixed",
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 500,
    maxWidth: 920,
    margin: "0 auto",
    padding: 16,
    borderRadius: 14,
    background: "rgba(10,18,34,.96)",
    border: "1px solid rgba(255,255,255,.12)",
    boxShadow: "0 20px 60px rgba(0,0,0,.35)",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 14,
    alignItems: "center"
  }}>
      <div style={{
      fontFamily: F.sans,
      fontSize: 12,
      color: "rgba(255,255,255,.62)",
      lineHeight: 1.55
    }}>
        Usiamo cookie tecnici per far funzionare il configuratore. Analytics e marketing saranno attivati solo dopo consenso.
        <button onClick={() => onNav("cookie")} style={{
        marginLeft: 8,
        border: "none",
        background: "transparent",
        color: C.orange,
        fontFamily: F.sans,
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer"
      }}>Cookie policy</button>
      </div>
      <button onClick={() => {
      localStorage.setItem("vp_cookie_consent", "accepted");
      setVisible(false);
    }} style={{
      minHeight: 42,
      padding: "0 15px",
      borderRadius: 10,
      border: "none",
      background: C.orange,
      color: C.white,
      fontFamily: F.sans,
      fontSize: 12,
      fontWeight: 800,
      cursor: "pointer"
    }}>Accetta</button>
    </div>;
}
function Step1ZoneCountSelector({
  setData
}) {
  const ensureZones = intent => {
    const count = intent === "few" ? 2 : intent === "multi" ? 3 : 1;
    setData(prev => {
      const current = prev.campaignZones || [];
      const next = Array.from({
        length: count
      }, (_, index) => current[index] || makeOperationalZone(index, {
        service: prev.type || "d2d",
        qty: prev.qty || 10000,
        flyerFormat: prev.flyerFormat || "a5"
      }));
      return {
        ...prev,
        zoneCountIntent: intent,
        campaignZones: next,
        activeZoneId: next[0]?.id || null
      };
    });
  };
  return <div style={{
    marginTop: 16,
    marginBottom: 48
  }}>
      <button type="button" onClick={() => ensureZones("multi")} onMouseEnter={event => {
      event.currentTarget.style.color = C.orangeHover || "#D14A14";
    }} onMouseLeave={event => {
      event.currentTarget.style.color = C.orange;
    }} style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 12px",
      border: "none",
      background: "transparent",
      color: C.orange,
      cursor: "pointer",
      fontFamily: F.sans,
      fontSize: 14,
      fontWeight: 600,
      transition: "color .16s"
    }}>
        <span aria-hidden="true" style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        border: `1.5px solid ${C.orange}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16,
        lineHeight: 1,
        flexShrink: 0
      }}>+</span>
        Aggiungi un'altra zona / comune
      </button>
      <p style={{
      fontFamily: F.sans,
      fontSize: 12,
      lineHeight: 1.5,
      color: "rgba(255,255,255,.42)",
      maxWidth: 430,
      margin: "8px 0 0"
    }}>
        Aggiungi una seconda zona se hai pi punti vendita o vuoi coprire aree separate. Potrai configurarla sulla mappa nel passaggio successivo.
      </p>
    </div>;
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
    activeMapLayers: base.activeMapLayers || defaultLayerState(service)
  };
}
