import React, { useEffect, useMemo, useState } from "react";
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

export function VolantiniProHeroMap({ onConfigure, onLogin, onAdmin, onHowItWorks }) {
  const compact = useCompact();
  const [menuOpen, setMenuOpen] = useState(false);
  const goAdmin = () => {
    if (typeof onAdmin === "function") return onAdmin();
    window.location.href = "/admin/campaigns/11111111-1111-1111-1111-111111111111/gps";
  };

  const benefits = [
    {
      icon: "target",
      text: "Analisi precisa del raggio di distribuzione",
    },
    {
      icon: "chart",
      text: "Dati territoriali sempre aggiornati",
    },
    {
      icon: "report",
      text: "Report chiari e azionabili",
    },
  ];

  return (
    <section
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "visible",
        background:
          "radial-gradient(circle at 78% 56%, rgba(37, 99, 235, 0.18), transparent 33%), radial-gradient(circle at 13% 28%, rgba(249, 115, 22, 0.14), transparent 28%), linear-gradient(145deg, #050d1a 0%, #081426 54%, #06101f 100%)",
        padding: compact ? "24px 20px 64px" : "24px 42px 64px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "radial-gradient(circle, rgba(59, 130, 246, 0.38) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)",
          backgroundSize: "92px 92px, 64px 64px, 64px 64px",
          maskImage: "linear-gradient(to bottom, black 0%, transparent 86%)",
        }}
      />

      <nav
        style={{
          position: "relative",
          zIndex: 30,
          maxWidth: 1500,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          marginBottom: compact ? 54 : 34,
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
          <div style={centerNavStyle}>
            <button onClick={onHowItWorks} style={navButtonStyle}>Come funziona</button>
            <button onClick={onConfigure} style={navButtonStyle}>Prezzi</button>
            <button onClick={onHowItWorks} style={navButtonStyle}>Funzionalit&agrave;</button>
            <button onClick={onHowItWorks} style={navButtonStyle}>Chi siamo</button>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {!compact && (
            <Button variant="secondary" onClick={goAdmin} style={headerOutlineButtonStyle}>
              <ShieldIcon />
              Area Admin
            </Button>
          )}
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
              aria-label={menuOpen ? "Chiudi menu" : "Apri menu"}
              aria-expanded={menuOpen}
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
          <button onClick={() => { setMenuOpen(false); onHowItWorks?.(); }} style={mobileMenuItemStyle}>Come funziona</button>
          <button onClick={() => { setMenuOpen(false); onConfigure?.(); }} style={mobileMenuItemStyle}>Prezzi</button>
          <button onClick={() => { setMenuOpen(false); onHowItWorks?.(); }} style={mobileMenuItemStyle}>Funzionalit&agrave;</button>
          <button onClick={() => { setMenuOpen(false); onHowItWorks?.(); }} style={mobileMenuItemStyle}>Chi siamo</button>
          <button onClick={() => { setMenuOpen(false); goAdmin(); }} style={{ ...mobileMenuItemStyle, color: C.orange }}>Area Admin</button>
          <button onClick={() => { setMenuOpen(false); onLogin?.(); }} style={{ ...mobileMenuItemStyle, color: C.orange }}>Accedi</button>
        </div>
      )}

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1500,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "0.82fr 1.9fr",
          alignItems: "center",
          gap: compact ? 42 : 34,
        }}
      >
        <div style={{ paddingTop: compact ? 0 : 22 }}>
          <div style={heroEyebrowStyle}>PIANIFICA &middot; DISTRIBUISCI &middot; OTTIENI RISULTATI</div>

          {/*
            ALT 1 - volantinaggio di precisione
            Titolo:   Volantinaggio di precisione.
            Sottot.:  Dati territoriali reali, copertura GPS, prova fotografica di ogni consegna.

            ALT 2 - misurabilita
            Titolo:   Il volantinaggio, finalmente misurabile.
            Sottot.:  Sai esattamente dove vanno i tuoi volantini - e puoi dimostrarlo.
          */}
          <h1 style={headlineStyle(compact)}>
            <span style={{ display: "block" }}>Il volantinaggio</span>
            <span style={{ display: "block" }}>diventa <span style={{ color: C.orange }}>geomarketing.</span></span>
          </h1>

          <p style={copyStyle(compact)}>
            Pianifica sui dati reali del territorio, distribuisci con tracciamento GPS,
            ricevi la prova di ogni consegna.
          </p>

          <div style={{ display: "grid", gap: 22 }}>
            {benefits.map((benefit) => (
              <div key={benefit.text} style={benefitRowStyle}>
                <BenefitIcon type={benefit.icon} />
                {benefit.text}
              </div>
            ))}
          </div>

          <div style={antiGhostClaimStyle}>
            <span style={antiGhostIconStyle}>GPS</span>
            <span>
              <strong>Paghi per 10.000 volantini?</strong> Il GPS ti dimostra che sono 10.000.
            </span>
          </div>
        </div>

        <HeroRealMapPreview compact={compact} />
      </div>
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
        .vp-hero-map-preview .leaflet-overlay-pane svg path[stroke-dasharray],
        .vp-hero-map-preview .gis-radius-glow {
          animation: vpHeroRadiusDraw .8s ease-out both;
        }
        .vp-hero-zone-row {
          opacity: 0;
          transform: translateY(8px);
          animation: vpHeroRowIn .38s ease-out forwards;
        }
      }
      @keyframes vpHeroPolygonIn {
        from { fill-opacity: 0; stroke-opacity: .25; }
        to { fill-opacity: var(--leaflet-fill-opacity, .45); stroke-opacity: 1; }
      }
      @keyframes vpHeroRadiusDraw {
        from { stroke-dashoffset: 70; opacity: .15; }
        to { stroke-dashoffset: 0; opacity: 1; }
      }
      @keyframes vpHeroRowIn {
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
    return undefined;
  }, []);
}

function HeroRealMapPreview({ compact }) {
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

  return (
    <div ref={previewRef} className="vp-hero-map-preview" style={heroPreviewShellStyle} aria-label="Anteprima reale mappa territoriale">
      <div style={heroPreviewTopbarStyle}>
        <div style={heroPreviewAddressStyle}>app.volantinipro.it/analisi</div>
        <span style={heroPreviewBadgeStyle}>Dati territoriali reali</span>
      </div>

      <div style={heroPreviewContentStyle}>
        <div style={heroPreviewMetricsStyle}>
          <HeroMetric loading={loading} number={preview.families} animate={animateMetrics} label="Famiglie raggiungibili" highlight />
          <HeroMetric loading={loading} number={radiusKm} suffix=" km" animate={animateMetrics} label="Raggio di analisi" />
          <HeroMetric loading={loading} number={preview.zones.length || null} animate={animateMetrics} label="Comuni nel raggio" />
          <HeroMetric loading={loading} number={preview.coverage || null} suffix="%" animate={animateMetrics} label="Copertura stimata" fallback={preview.coverageLabel} />
        </div>

        <div style={heroPreviewMapFrameStyle}>
          {loading && <PreviewLoading />}
          {unavailable ? (
            <div style={heroPreviewUnavailableStyle}>
              <strong>Anteprima dati non disponibile</strong>
              <span>La mappa reale si attiva appena i dati territoriali sono disponibili.</span>
            </div>
          ) : (
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
            />
          )}

          {!unavailable && (
            <div style={heroPreviewPanelStyle}>
              <div style={heroPreviewPanelTitleStyle}>Comuni nel raggio</div>
              {visibleZones.map((zone, index) => (
                <div key={zone.id} className="vp-hero-zone-row" style={{ ...heroPreviewZoneRowStyle, animationDelay: `${index * 90}ms` }}>
                  <span style={{ ...heroPreviewDotStyle, background: zone.color }} />
                  <span style={heroPreviewZoneNameStyle}>{zone.name}</span>
                  <span style={heroPreviewZoneValueStyle}>{zone.coverage ? `${Math.round(zone.coverage)}%` : formatHeroNumber(zone.families)}</span>
                </div>
              ))}
              {hiddenZoneCount > 0 && (
                <div className="vp-hero-zone-row" style={{ ...heroPreviewMoreRowStyle, animationDelay: `${visibleZones.length * 90}ms` }}>
                  + altri {formatNumero(hiddenZoneCount)} comuni
                </div>
              )}
              <div style={heroPreviewTotalStyle}>
                <span>Totale famiglie</span>
                <strong>{formatHeroNumber(preview.families)}</strong>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeroMetric({ loading, number, value, suffix = "", label, highlight, animate, fallback = "n/d" }) {
  const counted = useCountUpNumber(number, animate);
  const hasNumber = number != null && Number.isFinite(Number(number));
  const displayValue = hasNumber ? `${formatNumero(counted)}${suffix}` : value ?? fallback;

  return (
    <div style={heroMetricStyle}>
      {loading ? <span style={heroMetricSkeletonStyle} /> : <strong style={{ color: highlight ? C.orange : C.white }}>{displayValue}</strong>}
      <span>{label}</span>
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
  const families = firstPositive(values.famiglie_stimate, values.families, values.households, rows.reduce((sum, row) => sum + row.families, 0));
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

const HERO_ZONE_COLORS = ["#E8571A", "#2ECC8A", "#60A5FA", "#A78BFA", "#FBBF24", "#14B8A6"];

const heroPreviewShellStyle = {
  width: "100%",
  minHeight: 430,
  height: "clamp(430px, 52vw, 520px)",
  position: "relative",
  overflow: "hidden",
  borderRadius: 24,
  border: "1px solid rgba(148, 163, 184, 0.32)",
  background: "linear-gradient(145deg, rgba(7, 15, 29, 0.98), rgba(10, 20, 36, 0.98) 48%, rgba(12, 27, 48, 0.98))",
  boxShadow: "0 34px 90px rgba(0, 0, 0, 0.5), 0 30px 60px -20px rgba(232, 87, 26, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
  color: "#f8fafc",
  fontFamily: F.sans,
};

const heroPreviewTopbarStyle = {
  height: 52,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: "0 18px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(7, 14, 27, 0.74)",
};

const heroPreviewAddressStyle = {
  height: 28,
  minWidth: 0,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 8,
  color: "rgba(226, 232, 240, 0.64)",
  fontSize: 12,
  fontWeight: 800,
  background: "rgba(255, 255, 255, 0.065)",
};

const heroPreviewBadgeStyle = {
  padding: "5px 9px",
  borderRadius: 999,
  background: "rgba(232,87,26,.14)",
  border: "1px solid rgba(232,87,26,.26)",
  color: C.orange,
  fontSize: 10,
  fontWeight: 900,
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
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const heroMetricStyle = {
  minWidth: 0,
  display: "grid",
  alignContent: "center",
  gap: 5,
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: "linear-gradient(145deg, rgba(15, 27, 47, 0.92), rgba(10, 20, 36, 0.86))",
};

const heroMetricSkeletonStyle = {
  width: "70%",
  height: 18,
  borderRadius: 999,
  background: "linear-gradient(90deg, rgba(255,255,255,.08), rgba(255,255,255,.2), rgba(255,255,255,.08))",
};

const heroPreviewMapFrameStyle = {
  minHeight: 0,
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
  padding: 13,
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.2)",
  background: "rgba(8, 18, 32, 0.90)",
  boxShadow: "0 18px 42px rgba(0,0,0,.32)",
  backdropFilter: "blur(14px)",
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
  fontSize: 11,
  fontWeight: 850,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const heroPreviewZoneValueStyle = {
  color: "rgba(226,232,240,.72)",
  fontSize: 10,
  fontWeight: 800,
};

const heroPreviewTotalStyle = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid rgba(255,255,255,.08)",
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  color: "rgba(226,232,240,.65)",
  fontSize: 11,
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
  padding: 0,
  border: 0,
  background: "transparent",
  color: "rgba(248, 250, 252, 0.84)",
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

const headerOutlineButtonStyle = {
  minHeight: 52,
  padding: "0 22px",
  borderRadius: 12,
  border: "1.5px solid #E8571A",
  background: "rgba(10, 20, 36, 0.78)",
  color: C.orange,
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
};

const primaryButtonStyle = {
  minHeight: 52,
  padding: "0 18px",
  borderRadius: 12,
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 900,
  boxShadow: "0 18px 44px rgba(232, 87, 26, 0.28)",
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
  marginBottom: 16,
  color: C.orange,
  fontFamily: F.sans,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const headlineStyle = (compact) => ({
  margin: 0,
  fontFamily: "'DM Serif Display', Georgia, serif",
  fontSize: compact ? 52 : "clamp(56px, 4.35vw, 82px)",
  lineHeight: 1.1,
  fontWeight: 900,
  letterSpacing: "-0.055em",
  color: C.white,
  textShadow: "0 16px 42px rgba(0, 0, 0, 0.36)",
});

const copyStyle = (compact) => ({
  maxWidth: 390,
  margin: "26px 0 34px",
  color: C.muted,
  fontFamily: F.sans,
  fontSize: compact ? 16 : 17,
  lineHeight: 1.68,
  fontWeight: 500,
});

const benefitRowStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: 16,
  color: "rgba(226, 232, 240, 0.7)",
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.5,
};

const antiGhostClaimStyle = {
  marginTop: 28,
  maxWidth: 430,
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "13px 15px",
  borderRadius: 16,
  border: "1px solid rgba(232, 87, 26, 0.36)",
  background: "rgba(232, 87, 26, 0.12)",
  color: "rgba(255, 255, 255, 0.9)",
  fontFamily: F.sans,
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.45,
};

const antiGhostIconStyle = {
  flex: "0 0 auto",
  minWidth: 38,
  minHeight: 28,
  padding: "0 9px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: C.orange,
  color: C.white,
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: "0.04em",
};

export default VolantiniProHeroMap;
