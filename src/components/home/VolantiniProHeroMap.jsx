import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Button from "../ui/Button.jsx";
import { Logo } from "../common/Logo.jsx";
import { Step2Map } from "../Step2Map.jsx";
import { useServiceAnalysis } from "../../hooks/useServiceAnalysis.js";
import { formatNumero } from "../../lib/utils/format.js";

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



function BenefitIcon({ type }) {
  if (type === "target") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke={C.orange} strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4" stroke={C.orange} strokeWidth="1.8" />
        <circle cx="12" cy="12" r="1.5" fill={C.orange} />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "chart") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 19h18" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5 15l5-5 4 4 6-8" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="4" y="10" width="2" height="5" fill={C.orange} opacity="0.5" />
        <rect x="9" y="5" width="2" height="10" fill={C.orange} opacity="0.5" />
        <rect x="14" y="9" width="2" height="6" fill={C.orange} opacity="0.5" />
        <rect x="19" y="2" width="2" height="13" fill={C.orange} opacity="0.5" />
      </svg>
    );
  }

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke={C.orange} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VolantiniProHeroMap({ onConfigure, onQuote, onLogin, onAdmin, onHowItWorks }) {
  const compact = useCompact(1120);
  const [menuOpen, setMenuOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false); // dropdown "Lavora con noi"

  const scrollToSection = (id) => {
    setMenuOpen(false);
    setPlatformOpen(false);
    setWorkOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const benefits = [
    { icon: "target", text: "Servizi di distribuzione per ogni tipo di campagna" },
    { icon: "chart", text: "Mappa operativa con zona, raggio e comuni coinvolti" },
    { icon: "report", text: "GPS, prove fotografiche e report finale verificabile" },
  ];

  return (
    <section
      className="vp-home-hero"
      style={{
        minHeight: compact ? "100vh" : "680px",
        maxHeight: "none",
        position: "relative",
        overflow: "hidden",
        background: "#07101f",
        padding: compact ? "16px 16px 16px" : "24px 48px 24px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <HeroRealMapPreview compact={compact} benefits={benefits} />

      <nav
        className="vp-home-hero-nav"
        style={{
          position: "relative",
          zIndex: 30,
          maxWidth: 1400,
          width: "100%",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
        aria-label="Navigazione principale"
      >
        <button onClick={onHowItWorks} style={brandButtonStyle}>
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
                    onClick={() => onConfigure?.()}
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
                onClick={() => setWorkOpen((v) => !v)}
                style={{ ...navButtonStyle, display: "flex", alignItems: "center", gap: 6 }}
              >
                <span>Lavora con noi</span>
                <span style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.5)", transform: workOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
              </button>
              {workOpen && (
                <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 240, padding: 8, background: "rgba(10, 18, 34, 0.98)", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6)", display: "flex", flexDirection: "column", gap: 4, zIndex: 210 }}>
                  <button
                    onClick={() => { setWorkOpen(false); window.location.href = "/supplier"; }}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, background: "transparent", border: "none", color: C.white, fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
                  >
                    Diventa fornitore
                  </button>
                  <button
                    onClick={() => { setWorkOpen(false); window.location.href = "/supplier"; }}
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
          <Button variant="primary" className="vb vp-home-hero-header-cta" onClick={onConfigure} style={primaryButtonStyle}>
            Configura la tua campagna
          </Button>
          {compact && (
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              style={hamburgerButtonStyle}
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
          <button onClick={() => { setMenuOpen(false); onConfigure?.(); }} style={{ ...mobileMenuItemStyle, color: C.orange, fontWeight: 800 }}>Configura la tua campagna</button>
          <button onClick={() => { setMenuOpen(false); onLogin?.(); }} style={mobileMenuItemStyle}>Area Cliente</button>
          <button onClick={() => { setMenuOpen(false); scrollToSection("contatti"); }} style={mobileMenuItemStyle}>Contatti</button>
          <button onClick={() => setWorkOpen((v) => !v)} aria-expanded={workOpen} aria-haspopup="true" style={{ ...mobileMenuItemStyle, display: "flex", alignItems: "center", gap: 6 }}>
            <span>Lavora con noi</span>
            <span style={{ fontSize: 10, transform: workOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
          </button>
          {workOpen && (
            <>
              <button onClick={() => { setMenuOpen(false); setWorkOpen(false); window.location.href = "/supplier"; }} style={{ ...mobileMenuItemStyle, paddingLeft: 16 }}>↳ Diventa fornitore</button>
              <button onClick={() => { setMenuOpen(false); setWorkOpen(false); window.location.href = "/supplier"; }} style={{ ...mobileMenuItemStyle, paddingLeft: 16 }}>↳ Sei già fornitore? Accedi</button>
            </>
          )}
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "6px 0" }} />
          <button onClick={() => { setMenuOpen(false); scrollToSection("come-funziona"); }} style={mobileMenuItemStyle}>Come funziona</button>
          <button onClick={() => { setMenuOpen(false); scrollToSection("prezzi"); }} style={mobileMenuItemStyle}>Prezzi</button>
          <button onClick={() => { setMenuOpen(false); onConfigure?.(); }} style={mobileMenuItemStyle}>Piattaforma: Configuratore</button>
        </div>
      )}

      <div
        className="vp-home-hero-content"
        style={{
          position: "relative",
          zIndex: 10,
          maxWidth: 1400,
          width: "100%",
          margin: compact ? "16px auto 0" : "0 auto",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <motion.div
          className="vp-home-hero-copy-block"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{ maxWidth: compact ? "100%" : "45%", pointerEvents: "auto" }}
        >
          <div style={{ ...heroEyebrowStyle, marginBottom: compact ? 12 : 16 }}>VOLANTINAGGIO &middot; CONTROLLO GPS</div>

          <h1 className="vp-home-hero-title" style={{ ...headlineStyle(compact), maxWidth: 580 }}>
            Distribuisci volantini e<br className="vp-home-hero-break"/>{" "}
            verifica ogni consegna<br className="vp-home-hero-break"/>{" "}
            con <span style={{ color: C.orange }}>GPS e report fotografico</span>
          </h1>

          <p className="vp-home-hero-copy" style={{ ...copyStyle(compact), maxWidth: 540, margin: compact ? "16px 0 24px" : "20px 0 28px" }}>
            Configura la campagna con dati territoriali reali, segui la distribuzione con il tracking GPS degli operatori e ricevi foto, prove di consegna e report finale. Senza contratti fissi.
          </p>

          <div className="vp-home-hero-actions" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15 }}>
              <Button variant="primary" className="vb" onClick={onConfigure || onQuote || (() => window.location.href = "/preventivo")} style={{ ...heroPrimaryButtonStyle, minHeight: 44, padding: "0 20px" }}>
                Configura la tua campagna
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15 }}>
              <Button variant="secondary" onClick={onHowItWorks} style={{ ...heroOutlineButtonStyle, minHeight: 44, padding: "0 20px" }}>
                Vedi come funziona
              </Button>
            </motion.div>
          </div>
          
          <div className="vp-home-hero-chips" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["Door to Door", "Hand to Hand", "Negozi", "Scuole"].map(chip => (
              <span key={chip} style={{ padding: "4px 10px", borderRadius: 100, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 10, color: "rgba(226, 232, 240, 0.7)", fontWeight: 700, letterSpacing: "0.02em" }}>
                {chip}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
      <div className="vp-home-hero-spacer" style={{ height: compact ? 480 : 220, width: "100%", flexShrink: 0, pointerEvents: "none" }} />
    </section>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

function useInViewOnce() {
  const [node, setNode] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!node || visible) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, visible]);

  return [setNode, visible];
}

function easeOutExpo(progress) {
  return progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
}

function useCountUpNumber(target, enabled, { duration = 1100, decimals = 0 } = {}) {
  const reducedMotion = usePrefersReducedMotion();
  const finalValue = Number(target);
  const [value, setValue] = useState(Number.isFinite(finalValue) ? finalValue : 0);

  useEffect(() => {
    if (!Number.isFinite(finalValue)) {
      setValue(0);
      return undefined;
    }

    if (!enabled || reducedMotion) {
      setValue(finalValue);
      return undefined;
    }

    let frame = 0;
    const start = performance.now();
    setValue(0);

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const next = finalValue * easeOutExpo(progress);
      setValue(decimals > 0 ? Number(next.toFixed(decimals)) : Math.round(next));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [decimals, duration, enabled, finalValue, reducedMotion]);

  return value;
}

function useHeroMapPreviewStyles() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("vp-hero-map-preview-animations")) return undefined;
    const style = document.createElement("style");
    style.id = "vp-hero-map-preview-animations";
    style.textContent = `
      @media (prefers-reduced-motion: no-preference) {
        .vp-hero-map-preview .leaflet-interactive {
          animation: vpHeroPolygonIn .42s ease-out both;
          transition: fill-opacity .35s ease-out, stroke-opacity .35s ease-out;
        }
        .vp-hero-map-preview .gis-radius-glow {
          animation: vpHeroRadiusDraw 1.2s ease-out both, vpHeroRadiusPulse 6s infinite ease-in-out 1.2s;
          stroke: #E8571A !important;
          stroke-dasharray: 10, 14 !important;
          stroke-width: 4.5 !important;
          filter: drop-shadow(0 0 10px rgba(232, 87, 26, 0.8));
        }
        .vp-hero-badge {
          opacity: 0;
          animation: vpHeroFadeIn .6s ease-out forwards;
          animation-delay: 100ms;
        }
        .vp-hero-card {
          opacity: 0;
          transform: translateY(16px);
          animation: vpHeroCardIn .6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: 200ms;
        }
        .vp-hero-zone-row {
          opacity: 0;
          transform: translateX(-8px);
          animation: vpHeroRowIn .45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .vp-hero-coverage-fill {
          transform: scaleX(0);
          transform-origin: left;
          animation: vpHeroScaleX .8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      }
      .vp-hero-map-preview .vp-step2-map-shell {
        height: 100% !important;
      }
      /* Marker centro campagna: reso più evidente (era nascosto). È il punto
         geografico esatto al centro del cerchio raggio disegnato da Step2Map. */
      .vp-hero-map-preview .leaflet-radiusCenter-pane .leaflet-marker-icon {
        filter: drop-shadow(0 0 6px rgba(232, 87, 26, 0.9)) drop-shadow(0 1px 4px rgba(0,0,0,0.5));
      }
      .vp-hero-map-preview .leaflet-radiusCenter-pane .leaflet-marker-icon::after {
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        width: 26px;
        height: 26px;
        margin: -13px 0 0 -13px;
        border-radius: 50%;
        border: 1.5px solid rgba(232, 87, 26, 0.55);
        animation: vpHeroCenterPulse 2.6s ease-out infinite;
        pointer-events: none;
      }
      @keyframes vpHeroCenterPulse {
        0%   { transform: scale(0.55); opacity: 0.9; }
        70%  { transform: scale(1.7); opacity: 0; }
        100% { transform: scale(1.7); opacity: 0; }
      }
      /* Etichetta centro ancorata al punto (tooltip permanente Leaflet). */
      .vp-hero-map-preview .gis-center-label.leaflet-tooltip {
        background: rgba(8, 15, 30, 0.92);
        color: #fff;
        border: 1px solid rgba(232, 87, 26, 0.45);
        border-radius: 7px;
        padding: 4px 9px;
        font-size: 10.5px;
        font-weight: 800;
        font-family: 'DM Sans', Inter, system-ui, sans-serif;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        white-space: nowrap;
      }
      .vp-hero-map-preview .gis-center-label.leaflet-tooltip::before { display: none; }
      .vp-hero-map-preview .leaflet-control-attribution {
        background: rgba(10, 18, 32, 0.2) !important;
        backdrop-filter: blur(4px) !important;
        -webkit-backdrop-filter: blur(4px) !important;
        border-radius: 4px !important;
        border: 1px solid rgba(255,255,255,0.05) !important;
        color: rgba(255,255,255,0.4) !important;
        font-size: 8px !important;
        padding: 1px 4px !important;
        margin-bottom: 70px !important;
        margin-right: 10px !important;
      }
      .vp-hero-map-preview .leaflet-control-attribution a {
        color: rgba(255,255,255,0.5) !important;
      }
      @keyframes vpHeroPolygonIn {
        from { fill-opacity: 0; stroke-opacity: .25; }
        to { fill-opacity: var(--leaflet-fill-opacity, .45); stroke-opacity: 1; }
      }
      @keyframes vpHeroRadiusDraw {
        from { stroke-dashoffset: 70; opacity: .15; }
        to { stroke-dashoffset: 0; opacity: 1; }
      }
      @keyframes vpHeroRadiusPulse {
        0%, 100% { filter: drop-shadow(0 0 10px rgba(232, 87, 26, 0.7)); stroke-width: 4.5px; }
        50% { filter: drop-shadow(0 0 18px rgba(232, 87, 26, 1)); stroke-width: 5.5px; }
      }
      @keyframes vpHeroCardIn {
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes vpHeroRowIn {
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes vpHeroScaleX {
        to { transform: scaleX(1); }
      }
      @keyframes vpHeroFadeIn {
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    return undefined;
  }, []);
}

// Fallback SOLO quando l'analisi live non restituisce comuni: sono tutti
// COMUNI reali del catchment Cormano + 3 km (codici ISTAT), MAI NIL/quartieri
// di Milano — il KPI accanto dice "Comuni coinvolti" e non deve mescolare
// livelli territoriali diversi.
const DEFAULT_MILANO_NORD_ZONES = [
  { id: "comune:015086", name: "Cormano", families: 8420, coverage: 96, color: "#2ECC8A" },
  { id: "comune:015096", name: "Cusano Milanino", families: 7850, coverage: 94, color: "#60A5FA" },
  { id: "comune:015157", name: "Novate Milanese", families: 9120, coverage: 91, color: "#A78BFA" },
  { id: "comune:015032", name: "Bresso", families: 11400, coverage: 93, color: "#FBBF24" },
  { id: "comune:015166", name: "Paderno Dugnano", families: 14200, coverage: 95, color: "#14B8A6" },
];

function HeroRealMapPreview({ compact, benefits }) {
  useHeroMapPreviewStyles();
  const [previewRef, previewVisible] = useInViewOnce();
  const previewCity = useMemo(() => ({
    id: "cormano",
    name: "Cormano",
    label: "Cormano",
    lat: 45.551,
    lng: 9.163,
    municipality_code: "015086",
  }), []);
  const radiusKm = 3;
  // L'analisi territoriale del preview Hero (Cormano, scope "hero_preview") deve
  // partire SOLO quando il preview e' davvero visibile in viewport. Prima
  // veniva chiamata all'mount incondizionatamente: se questo componente veniva
  // montato senza mai entrare in viewport (es. brevissimo passaggio dalla home
  // prima di navigare al configuratore) sparava comunque una richiesta
  // analysis-istat per Cormano, che compariva nei log mentre l'utente era gia'
  // su Step 2 con un altro comune. `null` -> isAnalysisZoneValid() false ->
  // il hook non fa nessun fetch e non logga.
  const analysisActive = previewVisible;
  const { data, loading, error } = useServiceAnalysis(
    analysisActive ? previewCity.lat : null,
    analysisActive ? previewCity.lng : null,
    radiusKm,
    "d2d",
    analysisActive ? previewCity.name : null,
    10000,
    "hero_preview",
    "comune",
    analysisActive ? previewCity.municipality_code : null,
  );

  const hasError = Boolean(error);
  const hasEmptyComuni = Boolean(data && Array.isArray(data.comuni_breakdown) && data.comuni_breakdown.length === 0);

  const preview = useMemo(() => normalizeHeroPreview(data, previewCity), [data, previewCity]);

  const zonesForMap = hasEmptyComuni
    ? []
    : (Array.isArray(preview.zones) && preview.zones.length > 0
      ? preview.zones
      : DEFAULT_MILANO_NORD_ZONES);
  const selectedZoneIds = zonesForMap.map((zone) => zone.id);
  const totalFamilies = zonesForMap.reduce((s, z) => s + z.families, 0);

  const visibleZoneCount = compact ? 3 : 5;
  const visibleZones = zonesForMap.slice(0, visibleZoneCount);
  const hiddenZoneCount = Math.max(0, zonesForMap.length - visibleZones.length);
  const animateMetrics = previewVisible;
  const animatedTotalFamilies = useCountUpNumber(totalFamilies, animateMetrics, { duration: 900 });

  return (
    <>
      {/* La mappa è il LIVELLO VISIVO PRINCIPALE dell'hero: copre l'intera
          sezione (left:0), non un pannello staccato sul lato destro. Il testo a
          sinistra ci sta SOPRA grazie allo scrim/gradiente qui sotto. Un solo
          hero continuo, non "due pagine". */}
      <div ref={previewRef} className="vp-hero-map-preview" style={{
        position: "absolute",
        top: 0, right: 0, bottom: -60, left: 0,
        zIndex: 1,
        pointerEvents: "auto",
        overflow: "hidden"
      }}>
        {/* MAPPA REALE: stesso motore GIS dello Step 2 (Step2Map = Leaflet +
            tile CartoDB Voyager reali + L.geoJSON dei confini comunali reali +
            L.circle geodetico del raggio + fitBounds). Nessun SVG decorativo.
            Comuni e geometrie vengono dall'analisi live (useServiceAnalysis
            analysisLevel="comune" -> comuni_breakdown, geometry_geojson reale);
            se una geometria manca, Step2Map non la disegna (nessun poligono
            inventato). */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden", background: "#07101f" }}>
          <Step2Map
            city={{ lat: previewCity.lat, lng: previewCity.lng, label: previewCity.label, name: previewCity.name, municipality_code: previewCity.municipality_code }}
            radius={radiusKm}
            svcType="d2d"
            serviceColor={C.orange}
            zonesWithCoords={zonesForMap}
            selected={selectedZoneIds}
            activeLayers={{ comuni: true, radius: true, poi: false }}
            interactive={false}
            centerLabel={`Cormano (MI) · raggio ${radiusKm} km`}
          />
        </div>

        {/* Scrim: unifica testo e mappa in UN hero. Desktop: gradiente
            orizzontale opaco a sinistra (leggibilità copy) che sfuma verso la
            mappa a destra, + vignette in alto/basso per nav e pannelli. Tablet/
            mobile: gradiente verticale (testo in alto sulla mappa). Sotto i
            600px il gradiente e' rafforzato da .vp-home-hero-shade in
            HomePage.jsx. pointer-events:none. */}
        <div aria-hidden="true" className="vp-home-hero-shade" style={{
          position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
          background: compact
            ? "linear-gradient(180deg, #07101f 0%, rgba(7,16,31,0.95) 20%, rgba(7,16,31,0.7) 46%, rgba(7,16,31,0.34) 66%, rgba(7,16,31,0.08) 82%, rgba(7,16,31,0) 92%), linear-gradient(0deg, rgba(7,16,31,0.7) 0%, rgba(7,16,31,0) 30%)"
            : "linear-gradient(90deg, #07101f 0%, rgba(7,16,31,0.97) 26%, rgba(7,16,31,0.78) 40%, rgba(7,16,31,0.4) 54%, rgba(7,16,31,0.12) 68%, rgba(7,16,31,0) 80%), linear-gradient(0deg, rgba(7,16,31,0.6) 0%, rgba(7,16,31,0) 34%), linear-gradient(180deg, rgba(7,16,31,0.5) 0%, rgba(7,16,31,0) 20%)",
        }} />

        {/* Overlay caricamento o stato dati */}
        {loading && (
          <div style={heroDataBadgeStyle}>
            <span style={heroSpinnerStyle} />
            Calibrazione GIS territoriale...
          </div>
        )}
        {hasError && (
          <div style={heroDataBadgeStyle}>
            Dati territoriali momentaneamente non disponibili
          </div>
        )}
        {hasEmptyComuni && (
          <div style={heroDataBadgeStyle}>
            Dati comune non disponibili
          </div>
        )}

        {/* Il centro campagna + il cerchio raggio sono resi dal motore Step2Map:
            marker (pane radiusCenterPane) al centro geografico ESATTO del
            L.circle geodetico, con etichetta permanente ancorata (centerLabel).
            Nessuna targhetta d'angolo scollegata dalla mappa. */}

        {/* Floating KPI Cards in alto a destra */}
        <div className="vp-home-hero-kpis" style={{
          position: "absolute",
          top: compact ? 64 : 90,
          right: compact ? 16 : "6%",
          left: compact ? 16 : "auto",
          zIndex: 4,
          display: "grid",
          gridTemplateColumns: compact ? "1fr 1fr" : "repeat(4, auto)",
          justifyContent: compact ? "stretch" : "end",
          gap: compact ? 8 : 12,
          pointerEvents: "none"
        }}>
          <FloatingKPI loading={loading} number={hasError ? null : totalFamilies} animate={animateMetrics} label="Famiglie raggiungibili" highlight />
          <FloatingKPI loading={loading} number={hasError ? null : radiusKm} suffix=" Km" animate={animateMetrics} label="Raggio analisi" />
          <FloatingKPI loading={loading} number={hasError ? null : zonesForMap.length} animate={animateMetrics} label="Comuni coinvolti" />
          <FloatingKPI loading={loading} number={hasError ? null : (preview.coverage || 94.8)} suffix="%" animate={animateMetrics} label="Copertura stimata" fallback="94.8%" />
        </div>
      </div>

      {/* Summary Card inferiore con Analisi Territoriale Milano Nord */}
      <div className="vp-home-hero-summary" style={{
        position: "absolute",
        bottom: compact ? 12 : 12,
        left: "50%",
        transform: "translateX(-50%)",
        width: "calc(100% - 24px)",
        maxWidth: 1360,
        zIndex: 20,
        background: "rgba(8, 16, 28, 0.45)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 16,
        padding: compact ? 16 : "20px 28px",
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "1.2fr 1fr 0.8fr",
        gap: compact ? 20 : 40,
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}>
          {benefits.map(b => (
            <div key={b.text} style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "rgba(226, 232, 240, 0.9)", fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
               <div style={{ flexShrink: 0, marginTop: 1 }}><BenefitIcon type={b.icon} /></div>
               <span>{b.text}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: compact ? "1px solid rgba(255,255,255,0.08)" : "none", paddingTop: compact ? 16 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: C.orange, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Analisi Territorio Milano Nord</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "6px" }}>
            {visibleZones.map((z, i) => (
              <div key={z.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, animation: animateMetrics ? `vpHeroRowIn .45s cubic-bezier(0.16, 1, 0.3, 1) forwards ${350 + i * 90}ms` : 'none', opacity: animateMetrics ? 0 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: z.color || HERO_ZONE_COLORS[i % HERO_ZONE_COLORS.length], flexShrink: 0 }} />
                  <span style={{ color: "#f8fafc", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{z.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 800 }}>{formatHeroNumber(z.families)}</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 700, minWidth: 28, textAlign: "right" }}>{Math.round(z.coverage || 94)}%</span>
                </div>
              </div>
            ))}
            {hiddenZoneCount > 0 && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, marginTop: 2 }}>+ altri {hiddenZoneCount} comuni ({formatHeroNumber(zonesForMap.slice(visibleZoneCount).reduce((s, z) => s + z.families, 0))} fam.)</div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", borderLeft: compact ? "none" : "1px solid rgba(255,255,255,0.08)", paddingLeft: compact ? 0 : 28, paddingTop: compact ? 16 : 0, borderTop: compact ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.05em", marginBottom: 4 }}>Totale famiglie</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.white, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.04em", lineHeight: 1 }}>{formatHeroNumber(animatedTotalFamilies ?? totalFamilies)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.05em", marginBottom: 4 }}>Copertura stimata</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.orange, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.04em", lineHeight: 1 }}>{preview.coverage ? `${Math.round(preview.coverage)}%` : "94.8%"}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function FloatingKPI({ loading, number, value, suffix = "", label, highlight, animate, fallback = "n/d" }) {
  const counted = useCountUpNumber(number, animate);
  const hasNumber = number != null && Number.isFinite(Number(number));
  const displayValue = hasNumber ? `${formatHeroNumber(counted)}${suffix}` : value ?? fallback;

  return (
    <div style={{
      background: "rgba(8, 14, 26, 0.4)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 12,
      padding: "10px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 2,
      boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
      minWidth: 120,
    }}>
      {loading ? <span style={heroMetricSkeletonStyle} /> : <strong style={{ color: highlight ? C.orange : C.white, fontSize: 18, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, letterSpacing: "-0.03em" }}>{displayValue}</strong>}
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.02em", fontWeight: 700 }}>{label}</span>
    </div>
  );
}

function normalizeHeroPreview(data, city) {
  // "Comuni coinvolti": SOLO comuni. Qualunque riga a livello NIL/quartiere
  // (Milano: Affori, Dergano, Bovisa, ...) viene esclusa dal conteggio e
  // dalla lista, indipendentemente da come l'API la etichetta.
  const rows = (Array.isArray(data?.comuni_breakdown) ? data.comuni_breakdown : [])
    .filter((row) => row?.territory_level !== "nil" && row?.is_nil !== true && !row?.nil_code && !row?.nil_name)
    .map((row, index) => normalizeHeroZone(row, index))
    .filter((zone) => zone.geometry);
  const values = data?.values || {};
  const families = rows.reduce((sum, row) => sum + row.families, 0);
  const coverage = firstPositive(values.copertura_stimata, values.coverage_percent, values.coverage);
  return {
    zones: rows.length > 0 ? rows : DEFAULT_MILANO_NORD_ZONES,
    families: families > 0 ? families : 50990,
    coverage: coverage || 94.8,
    coverageLabel: coverage ? `${Math.round(coverage)}%` : "94.8%",
    city,
  };
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number !== 0) return number;
  }
  return null;
}

function normalizeHeroZone(row, index) {
  const territoryCode = row.comune_code || row.municipality_code || row.nil_code || row.code || row.name || index;
  const families = firstPositive(row.households_in_radius, row.famiglie_nel_raggio, row.households, row.families);
  const flyers = firstPositive(row.volantini_nel_raggio, row.volantini_stimati, row.recommended_flyers);
  const geometry = parseGeometry(row.geometry_geojson || row.geometry || row.geojson || row.geom);
  // lat/lng reali del comune per il motore mappa Step 2 (centroide / centro).
  const lat = firstFiniteNumber(row.centroid_lat, row.center_lat, row.lat, row.latitude);
  const lng = firstFiniteNumber(row.centroid_lng, row.center_lng, row.lng, row.longitude);
  return {
    id: `comune:${territoryCode}`,
    code: String(territoryCode),
    name: row.comune_name || row.municipality_name || row.name || `Comune ${index + 1}`,
    territoryLevel: "comune",
    isNil: false,
    lat,
    lng,
    families,
    pop: firstPositive(row.population_in_radius, row.popolazione_nel_raggio, row.population),
    population: firstPositive(row.population_in_radius, row.popolazione_nel_raggio, row.population),
    coverage: firstPositive(row.pct_copertura, row.coverage_percent, row.coverage),
    volantiniNelRaggio: flyers,
    flyersMin: flyers,
    recommendedFlyers: flyers,
    assignedFlyers: flyers,
    coveragePercent: flyers > 0 ? 100 : null,
    geometry,
    color: HERO_ZONE_COLORS[index % HERO_ZONE_COLORS.length],
  };
}

function parseGeometry(value) {
  if (!value) return null;
  if (typeof value === "object") return value.type === "Feature" ? value.geometry : value;
  try {
    const parsed = JSON.parse(value);
    return parsed?.type === "Feature" ? parsed.geometry : parsed;
  } catch {
    return null;
  }
}

function firstPositive(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return Math.round(number);
  }
  return 0;
}

function formatHeroNumber(value) {
  return formatNumero(value);
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2L3 5.5v5C3 14.09 6.03 17.87 10 19c3.97-1.13 7-4.91 7-8.5v-5L10 2Z" stroke={C.orange} strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M7 10l2 2 4-4" stroke={C.orange} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10h12M12 6l4 4-4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const HERO_ZONE_COLORS = ["#2ECC8A", "#60A5FA", "#A78BFA", "#FBBF24", "#14B8A6", "#F472B6"];

const heroPreviewShellStyle = {
  width: "100%",
  position: "relative",
  overflow: "hidden",
  borderRadius: 20,
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "linear-gradient(145deg, rgba(7, 15, 29, 0.98), rgba(10, 20, 36, 0.98) 48%, rgba(12, 27, 48, 0.98))",
  boxShadow: "0 40px 100px -10px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  color: "#f8fafc",
  fontFamily: F.sans,
};

const heroPreviewTopbarStyle = {
  height: "auto",
  minHeight: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: "8px 18px",
  borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
  background: "rgba(3, 8, 18, 0.8)",
  flexWrap: "wrap",
};

const heroPreviewAddressStyle = {
  height: 26,
  minWidth: 0,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 6,
  color: "rgba(226, 232, 240, 0.5)",
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(255, 255, 255, 0.04)",
};

const heroPreviewBadgeStyle = {
  padding: "4px 8px",
  borderRadius: 6,
  background: "rgba(232,87,26,.1)",
  border: "1px solid rgba(232,87,26,.2)",
  color: C.orange,
  fontSize: 10,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const heroPreviewContentStyle = {
  height: "calc(100% - 52px)",
  padding: 18,
  display: "grid",
  gridTemplateRows: "78px minmax(0, 1fr)",
  gap: 14,
};

const heroPreviewMetricsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
  gap: 8,
};

const heroMetricStyle = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 2,
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "rgba(5, 10, 20, 0.6)",
};

const heroMetricSkeletonStyle = {
  width: "70%",
  height: 18,
  borderRadius: 999,
  background: "linear-gradient(90deg, rgba(255,255,255,.08), rgba(255,255,255,.2), rgba(255,255,255,.08))",
};

const heroPreviewMapFrameStyle = {
  minHeight: 280,
  height: "clamp(240px, 25vw, 320px)",
  position: "relative",
  overflow: "hidden",
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "#0a1527",
};

const heroPreviewPanelStyle = {
  position: "absolute",
  zIndex: 500,
  right: 14,
  top: 14,
  width: "min(260px, 42%)",
  minWidth: 205,
  padding: 16,
  borderRadius: 12,
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "rgba(8, 18, 32, 0.85)",
  boxShadow: "0 24px 48px rgba(0,0,0,.4)",
  backdropFilter: "blur(16px)",
};

const heroPreviewPanelMobileStyle = {
  ...heroPreviewPanelStyle,
  position: "absolute",
  bottom: 14,
  top: "auto",
  left: 14,
  right: 14,
  width: "calc(100% - 28px)",
  minWidth: 0,
};

const heroPreviewPanelTitleStyle = {
  marginBottom: 10,
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 900,
};

const heroPreviewZoneRowStyle = {
  display: "grid",
  gridTemplateColumns: "10px minmax(0,1fr) auto",
  alignItems: "center",
  gap: 7,
  marginBottom: 8,
};

const heroPreviewMoreRowStyle = {
  marginTop: 2,
  marginBottom: 8,
  color: "rgba(226,232,240,.62)",
  fontSize: 11,
  fontWeight: 900,
};

const heroPreviewDotStyle = {
  width: 8,
  height: 8,
  borderRadius: "50%",
};

const heroPreviewZoneNameStyle = {
  color: "#f8fafc",
  fontSize: 12,
  fontWeight: 850,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const heroPreviewZoneValueStyle = {
  color: "rgba(255,255,255,.9)",
  fontSize: 10,
  fontWeight: 800,
};

const heroPreviewTotalStyle = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid rgba(255,255,255,.08)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  color: "rgba(255,255,255,.85)",
  fontSize: 12,
};

const heroAnalisiZonaCardStyle = {
  marginTop: 16,
  padding: "18px 22px",
  borderRadius: 16,
  border: "1px solid rgba(255, 255, 255, 0.08)",
  background: "rgba(10, 20, 36, 0.7)",
  boxShadow: "0 12px 40px rgba(0,0,0,.3)",
  color: "#f8fafc",
  fontFamily: F.sans,
};

const heroPreviewLoadingStyle = {
  position: "absolute",
  inset: 0,
  zIndex: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  color: "rgba(255,255,255,.74)",
  background: "rgba(8,15,30,.42)",
  fontSize: 12,
  fontWeight: 900,
};

const heroSpinnerStyle = {
  width: 14,
  height: 14,
  borderRadius: "50%",
  border: "2px solid rgba(255,255,255,.28)",
  borderTopColor: C.orange,
};

// Badge dati territoriali — piccolo, angolo in basso a sinistra della mappa,
// NON copre la base map. Usato sia per il loading sia per lo stato "dati non
// disponibili" (messaggio non tecnico).
const heroDataBadgeStyle = {
  position: "absolute",
  bottom: 92,
  left: 16,
  zIndex: 5,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  maxWidth: "min(320px, 70%)",
  padding: "6px 12px",
  borderRadius: 999,
  background: "rgba(8,15,30,0.72)",
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  color: "rgba(255,255,255,0.82)",
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1.3,
  pointerEvents: "none",
  boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
};

const heroPreviewUnavailableStyle = {
  position: "absolute",
  inset: 0,
  zIndex: 650,
  display: "grid",
  placeContent: "center",
  gap: 8,
  textAlign: "center",
  padding: 24,
  color: "rgba(255,255,255,.72)",
  background: "rgba(8,15,30,.78)",
};

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

const heroPrimaryButtonStyle = {
  minHeight: 48,
  padding: "0 24px",
  borderRadius: 8,
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 700,
  background: C.orange,
  color: C.white,
  border: "none",
  boxShadow: "0 6px 16px rgba(232, 87, 26, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
  cursor: "pointer",
  transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const heroOutlineButtonStyle = {
  minHeight: 48,
  padding: "0 24px",
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.2)",
  background: "rgba(255, 255, 255, 0.05)",
  color: C.white,
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.2s ease",
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
  zIndex: 20,
  padding: "96px 24px 32px",
  background: "rgba(5, 13, 26, 0.97)",
  backdropFilter: "blur(14px)",
  display: "grid",
  alignContent: "start",
  gap: 10,
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

const ctaLargeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  minHeight: 56,
  padding: "0 32px",
  borderRadius: 14,
  border: "none",
  background: C.orange,
  color: C.white,
  fontFamily: F.sans,
  fontSize: 16,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 20px 48px rgba(249, 115, 22, 0.42)",
  letterSpacing: "-0.01em",
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 22,
  padding: "6px 14px",
  borderRadius: 20,
  border: "1px solid rgba(255, 90, 20, 0.38)",
  background: "rgba(255, 90, 20, 0.10)",
  color: "rgba(255, 200, 160, 0.92)",
  fontFamily: F.sans,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const badgeDotStyle = {
  display: "inline-block",
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: C.orange,
  boxShadow: "0 0 6px rgba(255, 90, 20, 0.8)",
};

const heroEyebrowStyle = {
  marginBottom: 20,
  color: C.orange,
  fontFamily: F.sans,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
};

const headlineStyle = (compact) => ({
  margin: 0,
  fontFamily: "'DM Serif Display', Georgia, serif",
  fontSize: compact ? 42 : "clamp(58px, 5vw, 82px)",
  lineHeight: 1.02,
  fontWeight: 400,
  letterSpacing: "-0.02em",
  color: C.white,
  textShadow: "0 16px 32px rgba(0, 0, 0, 0.4)",
});

const copyStyle = (compact) => ({
  maxWidth: 420,
  margin: "32px 0 40px",
  color: "rgba(255, 255, 255, 0.65)",
  fontFamily: F.sans,
  fontSize: compact ? 16 : 18,
  lineHeight: 1.6,
  fontWeight: 400,
});

const benefitRowStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: 16,
  color: "rgba(226, 232, 240, 0.8)",
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 500,
  lineHeight: 1.5,
};

const antiGhostClaimStyle = {
  marginTop: 40,
  maxWidth: 460,
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "16px 20px",
  borderRadius: 12,
  border: "1px solid rgba(232, 87, 26, 0.2)",
  background: "rgba(232, 87, 26, 0.08)",
  color: "rgba(255, 255, 255, 0.85)",
  fontFamily: F.sans,
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 1.5,
};

const antiGhostIconStyle = {
  flex: "0 0 auto",
  minWidth: 40,
  minHeight: 26,
  padding: "0 10px",
  borderRadius: 6,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: C.orange,
  color: C.white,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.06em",
};

export default VolantiniProHeroMap;
