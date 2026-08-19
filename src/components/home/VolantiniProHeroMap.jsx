import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Button from "../ui/Button.jsx";
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

function MapPinLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 3C11.03 3 7 7.03 7 12c0 7 9 17 9 17s9-10 9-17c0-4.97-4.03-9-9-9Z" fill={C.orange} />
      <circle cx="16" cy="12" r="3.2" fill="#ffe7dc" />
    </svg>
  );
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
  const compact = useCompact();
  const [menuOpen, setMenuOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);

  const scrollToSection = (id) => {
    setMenuOpen(false);
    setPlatformOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const benefits = [
    { icon: "target", text: "Servizi di distribuzione per ogni tipo di campagna" },
    { icon: "chart", text: "Mappa operativa con zona, raggio e comuni coinvolti" },
    { icon: "report", text: "GPS, prove fotografiche e report finale verificabile" },
  ];

  return (
    <section
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
          <MapPinLogo />
          <span style={{ fontFamily: F.sans, fontSize: compact ? 18 : 22, fontWeight: 900, letterSpacing: "-0.03em" }}>
            Volantini<span style={{ color: C.orange }}>Pro</span>
          </span>
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
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {!compact && (
            <Button variant="secondary" onClick={onLogin} style={headerOutlineButtonStyle}>
              Accedi
            </Button>
          )}
          <Button variant="primary" className="vb" onClick={onConfigure} style={primaryButtonStyle}>
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
          <button onClick={() => { setMenuOpen(false); scrollToSection("come-funziona"); }} style={mobileMenuItemStyle}>Come funziona</button>
          <button onClick={() => { setMenuOpen(false); scrollToSection("prezzi"); }} style={mobileMenuItemStyle}>Prezzi</button>
          <button onClick={() => { setMenuOpen(false); onConfigure?.(); }} style={mobileMenuItemStyle}>Piattaforma: Configuratore</button>
          <button onClick={() => { setMenuOpen(false); onLogin?.(); }} style={{ ...mobileMenuItemStyle, color: C.orange }}>Accedi</button>
        </div>
      )}

      <div
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
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{ maxWidth: compact ? "100%" : "45%", pointerEvents: "auto" }}
        >
          <div style={{ ...heroEyebrowStyle, marginBottom: compact ? 12 : 16 }}>VOLANTINAGGIO &middot; CONTROLLO GPS</div>

          <h1 style={{ ...headlineStyle(compact), maxWidth: 580 }}>
            Distribuisci volantini e<br/>
            verifica ogni consegna<br/>
            con <span style={{ color: C.orange }}>GPS e report fotografico</span>
          </h1>

          <p style={{ ...copyStyle(compact), maxWidth: 540, margin: compact ? "16px 0 24px" : "20px 0 28px" }}>
            Pianifica la zona, calcola quante famiglie puoi raggiungere e ricevi prove concrete al termine della distribuzione. Senza contratti fissi.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15 }}>
              <Button variant="primary" className="vb" onClick={onQuote || (() => window.location.href = "/preventivo")} style={{ ...heroPrimaryButtonStyle, minHeight: 44, padding: "0 20px" }}>
                Calcola la tua copertura
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15 }}>
              <Button variant="secondary" onClick={onHowItWorks} style={{ ...heroOutlineButtonStyle, minHeight: 44, padding: "0 20px" }}>
                Vedi i servizi
              </Button>
            </motion.div>
          </div>
          
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["Door to Door", "Hand to Hand", "Negozi", "Scuole"].map(chip => (
              <span key={chip} style={{ padding: "4px 10px", borderRadius: 100, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 10, color: "rgba(226, 232, 240, 0.7)", fontWeight: 700, letterSpacing: "0.02em" }}>
                {chip}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
      <div style={{ height: compact ? 480 : 220, width: "100%", flexShrink: 0, pointerEvents: "none" }} />
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
      .vp-hero-map-preview .leaflet-radiusCenter-pane {
        display: none !important;
      }
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
  const { data, loading, error } = useServiceAnalysis(
    previewCity.lat,
    previewCity.lng,
    radiusKm,
    "d2d",
    previewCity.name,
    10000,
    "hero_preview",
    "comune",
    previewCity.municipality_code,
  );

  const preview = useMemo(() => normalizeHeroPreview(data, previewCity), [data, previewCity]);
  const unavailable = !loading && (error || data?.error || !preview.zones.length);
  const visibleZoneCount = compact ? 3 : 5;
  const visibleZones = preview.zones.slice(0, visibleZoneCount);
  const hiddenZoneCount = Math.max(0, preview.zones.length - visibleZones.length);
  const animateMetrics = previewVisible && !loading && !unavailable;
  const totalFamilies = preview.zones.reduce((s, z) => s + z.families, 0);
  const animatedTotalFamilies = useCountUpNumber(totalFamilies, animateMetrics, { duration: 900 });

  return (
    <>
      <div ref={previewRef} className="vp-hero-map-preview" style={{
        position: "absolute",
        top: 0, right: 0, bottom: -60, left: compact ? 0 : "45%",
        zIndex: 1,
        pointerEvents: "auto",
        overflow: "hidden"
      }}>
        <div style={{
          position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
          background: compact 
            ? "linear-gradient(to bottom, #07101f 0%, rgba(7,16,31,0.85) 15%, rgba(7,16,31,0.2) 50%, #07101f 100%)"
            : "linear-gradient(90deg, #07101f 0%, rgba(7,16,31,0.92) 10%, rgba(7,16,31,0.45) 30%, rgba(7,16,31,0) 60%, transparent 100%), linear-gradient(0deg, #07101f 0%, rgba(7,16,31,0) 15%)"
        }} />

        <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          {loading && <PreviewLoading />}
          {!unavailable && (
            <Step2Map
              city={previewCity}
              radius={radiusKm}
              svcType="d2d"
              serviceColor={C.orange}
              zonesWithCoords={preview.zones}
              selected={preview.zones.map((zone) => zone.id)}
              activeLayers={{ radius: true, comuni: true, settori: false, civici: false, poi: false }}
              settori={[]}
              pois={[]}
              civiciState={{ count: 0 }}
              campaignZones={[{ id: "hero_preview", city: previewCity, cityName: previewCity.name, radiusKm, service_type: "d2d" }]}
              activeZoneId="hero_preview"
              themeMode={false}
              opacityLevel="normal"
              interactive={false}
            />
          )}
        </div>

        {!unavailable && !loading && (
          // Il wrapper coincide in pixel con .leaflet-container (stesso box:
          // vedi vp-hero-map-preview/vp-step2-map-shell), quindi 50%/50% e'
          // esattamente il container point del center passato a Step2Map
          // (stesso previewCity usato dal L.circle) — non un'approssimazione
          // visiva. Dimensioni del wrapper = dimensioni del pallino, cosi'
          // translate(-50%,-50%) centra il pallino stesso, non il blocco
          // pallino+etichetta: l'etichetta e' un figlio assoluto sotto di
          // esso e non influenza il centraggio.
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 3, pointerEvents: "none", width: 18, height: 18 }}>
            <motion.div
              animate={{
                scale: [1, 1.25, 1],
                boxShadow: [
                  "0 0 16px rgba(232,87,26,0.85), 0 2px 8px rgba(0,0,0,0.5)",
                  "0 0 28px rgba(232,87,26,1), 0 4px 12px rgba(0,0,0,0.6)",
                  "0 0 16px rgba(232,87,26,0.85), 0 2px 8px rgba(0,0,0,0.5)"
                ]
              }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              style={{ width: 18, height: 18, background: C.orange, borderRadius: "50%", border: "3px solid #fff" }}
            />
            <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 6, background: "rgba(8,15,30,0.85)", padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 800, color: "#fff", border: "1px solid rgba(232,87,26,0.35)", whiteSpace: "nowrap", boxShadow: "0 2px 10px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <span style={{ fontSize: 8, color: C.orange, textTransform: "uppercase", letterSpacing: "0.06em" }}>Centro campagna</span>
              <span>Raggio {radiusKm} km</span>
            </div>
          </div>
        )}

        {!unavailable && (
          <div style={{
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
            <FloatingKPI loading={loading} number={preview.families} animate={animateMetrics} label="Famiglie raggiungibili" highlight />
            <FloatingKPI loading={loading} number={radiusKm} suffix=" Km" animate={animateMetrics} label="Raggio analisi" />
            <FloatingKPI loading={loading} number={preview.zones.length || null} animate={animateMetrics} label="Comuni coinvolti" />
            <FloatingKPI loading={loading} number={preview.coverage || null} suffix="%" animate={animateMetrics} label="Copertura stimata" fallback={preview.coverageLabel} />
          </div>
        )}
      </div>

      {!unavailable && (
        <div style={{
          position: "absolute",
          bottom: compact ? 12 : 12,
          left: "50%",
          transform: "translateX(-50%)",
          width: "calc(100% - 24px)",
          maxWidth: 1360,
          zIndex: 20,
          background: "rgba(8, 16, 28, 0.25)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: compact ? 16 : "20px 28px",
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "1.2fr 1fr 0.8fr",
          gap: compact ? 20 : 40,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
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
            <div style={{ fontSize: 11, fontWeight: 900, color: C.orange, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Analisi Zona</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "6px" }}>
              {visibleZones.map((z, i) => (
                <div key={z.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, animation: animateMetrics ? `vpHeroRowIn .45s cubic-bezier(0.16, 1, 0.3, 1) forwards ${350 + i * 90}ms` : 'none', opacity: animateMetrics ? 0 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: z.color, flexShrink: 0 }} />
                    <span style={{ color: "#f8fafc", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{z.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 800 }}>{formatHeroNumber(z.families)}</span>
                    <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 700, minWidth: 28, textAlign: "right" }}>{Math.round(z.coverage || 0)}%</span>
                  </div>
                </div>
              ))}
              {hiddenZoneCount > 0 && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, marginTop: 2 }}>+ altri {hiddenZoneCount} comuni ({formatHeroNumber(preview.zones.slice(visibleZoneCount).reduce((s, z) => s + z.families, 0))} fam.)</div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", borderLeft: compact ? "none" : "1px solid rgba(255,255,255,0.08)", paddingLeft: compact ? 0 : 28, paddingTop: compact ? 16 : 0, borderTop: compact ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.05em", marginBottom: 4 }}>Totale famiglie</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.white, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.04em", lineHeight: 1 }}>{formatHeroNumber(animatedTotalFamilies ?? 0)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.05em", marginBottom: 4 }}>Copertura stimata</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.orange, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.04em", lineHeight: 1 }}>{preview.coverage ? `${Math.round(preview.coverage)}%` : preview.coverageLabel}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FloatingKPI({ loading, number, value, suffix = "", label, highlight, animate, fallback = "n/d" }) {
  const counted = useCountUpNumber(number, animate);
  const hasNumber = number != null && Number.isFinite(Number(number));
  const displayValue = hasNumber ? `${formatHeroNumber(counted)}${suffix}` : value ?? fallback;

  return (
    <div style={{
      background: "rgba(8, 14, 26, 0.18)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 12,
      padding: "10px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 2,
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      minWidth: 120,
    }}>
      {loading ? <span style={heroMetricSkeletonStyle} /> : <strong style={{ color: highlight ? C.orange : C.white, fontSize: 18, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, letterSpacing: "-0.03em" }}>{displayValue}</strong>}
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.02em", fontWeight: 700 }}>{label}</span>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div style={heroPreviewLoadingStyle}>
      <span style={heroSpinnerStyle} />
      Caricamento dati territoriali...
    </div>
  );
}

function normalizeHeroPreview(data, city) {
  const rows = (Array.isArray(data?.comuni_breakdown) ? data.comuni_breakdown : [])
    .filter((row) => row?.territory_level !== "nil")
    .map((row, index) => normalizeHeroZone(row, index))
    .filter((zone) => zone.geometry);
  const values = data?.values || {};
  const families = rows.reduce((sum, row) => sum + row.families, 0);
  const coverage = firstPositive(values.copertura_stimata, values.coverage_percent, values.coverage);
  return {
    zones: rows,
    families,
    coverage,
    coverageLabel: coverage ? `${Math.round(coverage)}%` : rows.length ? `${rows.length} zone` : "n/d",
    city,
  };
}

function normalizeHeroZone(row, index) {
  const territoryCode = row.comune_code || row.municipality_code || row.nil_code || row.code || row.name || index;
  const families = firstPositive(row.households_in_radius, row.famiglie_nel_raggio, row.households, row.families);
  const flyers = firstPositive(row.volantini_nel_raggio, row.volantini_stimati, row.recommended_flyers);
  const geometry = parseGeometry(row.geometry_geojson || row.geometry || row.geojson || row.geom);
  return {
    id: `comune:${territoryCode}`,
    name: row.comune_name || row.municipality_name || row.name || `Comune ${index + 1}`,
    territoryLevel: "comune",
    isNil: false,
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
