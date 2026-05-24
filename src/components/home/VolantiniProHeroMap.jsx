import React, { useEffect, useState } from "react";
import HeroMapMockup from "./HeroMapMockup.jsx";
import Button from "../ui/Button.jsx";

const C = {
  orange: "#ff5a14",
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
            <button onClick={onHowItWorks} style={navButtonStyle}>Funzionalità</button>
            <button onClick={onHowItWorks} style={navButtonStyle}>Chi siamo</button>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {!compact && (
            <Button variant="secondary" onClick={onLogin} style={headerOutlineButtonStyle}>
              Accedi
            </Button>
          )}
          <Button variant="primary" className="vb" onClick={onConfigure} style={primaryButtonStyle}>
            Configura zona
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
          <button onClick={() => { setMenuOpen(false); onHowItWorks?.(); }} style={mobileMenuItemStyle}>Funzionalità</button>
          <button onClick={() => { setMenuOpen(false); onHowItWorks?.(); }} style={mobileMenuItemStyle}>Chi siamo</button>
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
          <h1 style={headlineStyle(compact)}>
            <span style={{ display: "block" }}>Pianifica.</span>
            <span style={{ display: "block" }}>Distribuisci.</span>
            <span style={{ display: "block", color: C.orange }}>Ottieni risultati.</span>
          </h1>

          <p style={copyStyle(compact)}>
            VolantiniPro ti aiuta a trovare le zone giuste,
            raggiungere più famiglie e massimizzare
            l'impatto delle tue campagne.
          </p>

          <div style={{ display: "grid", gap: 22 }}>
            {benefits.map((benefit) => (
              <div key={benefit.text} style={benefitRowStyle}>
                <BenefitIcon type={benefit.icon} />
                {benefit.text}
              </div>
            ))}
          </div>
        </div>

        <HeroMapMockup />
      </div>
    </section>
  );
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

const headlineStyle = (compact) => ({
  margin: 0,
  fontFamily: F.sans,
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

export default VolantiniProHeroMap;
