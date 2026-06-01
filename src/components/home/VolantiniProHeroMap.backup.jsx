import React, { useEffect, useState } from "react";
import HeroMapMockup from "./HeroMapMockup.jsx";

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

function PaperPlaneLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M28 4 4 14.2l9.2 3.8L18 28 28 4Z" fill={C.orange} />
      <path d="m13.2 18 5.9-5.6-3.9 7.9L13.2 18Z" fill="#ffe7dc" opacity="0.78" />
    </svg>
  );
}

function BenefitIcon({ type }) {
  if (type === "chart") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H3" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round" />
        <path d="m4 12 6-5 6 4 5-7" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "report") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 3h8l4 4v14H6V3Z" stroke={C.orange} strokeWidth="1.8" />
        <path d="M14 3v5h4M9 12h6M9 16h5" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke={C.orange} strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" stroke={C.orange} strokeWidth="1.8" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function VolantiniProHeroMap({ onConfigure, onLogin, onAdmin, onHowItWorks }) {
  const compact = useCompact();

  const benefits = [
    { icon: "target", text: "Analisi precisa del raggio di distribuzione" },
    { icon: "chart", text: "Dati territoriali sempre aggiornati" },
    { icon: "report", text: "Report chiari e azionabili" },
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
          zIndex: 2,
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
          <PaperPlaneLogo />
          <span style={{ fontFamily: F.sans, fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em" }}>
            Volantini<span style={{ color: C.orange }}>Pro</span>
          </span>
        </button>

        {!compact && (
          <div style={centerNavStyle}>
            <button onClick={onHowItWorks} style={navButtonStyle}>Funzionalita</button>
            <button onClick={onConfigure} style={navButtonStyle}>Prezzi</button>
            <button onClick={onHowItWorks} style={navButtonStyle}>Risorse v</button>
            <button onClick={onHowItWorks} style={navButtonStyle}>Chi siamo</button>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {!compact && (
            <button onClick={onAdmin} style={headerOutlineButtonStyle}>
              <span style={shieldStyle}>v</span>
              Area Admin
            </button>
          )}
          {!compact && (
            <button onClick={onLogin} style={headerOutlineButtonStyle}>
              Accedi
            </button>
          )}
          <button className="vb" onClick={onConfigure} style={primaryButtonStyle}>
            Configura la tua campagna
          </button>
        </div>
      </nav>

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
            VolantiniPro ti aiuta a trovare le zone giuste, raggiungere piu
            famiglie e massimizzare l'impatto delle tue campagne.
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
  border: "1px solid rgba(148, 163, 184, 0.36)",
  background: "rgba(10, 20, 36, 0.78)",
  color: C.white,
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
};

const shieldStyle = {
  width: 18,
  height: 18,
  border: `2px solid ${C.orange}`,
  borderRadius: 5,
  color: C.orange,
  fontSize: 10,
  lineHeight: "14px",
  textAlign: "center",
};

const primaryButtonStyle = {
  minHeight: 52,
  padding: "0 27px",
  borderRadius: 12,
  border: "1px solid rgba(255, 255, 255, 0.14)",
  background: C.orange,
  color: C.white,
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 18px 44px rgba(249, 115, 22, 0.38)",
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
  alignItems: "center",
  gap: 16,
  color: "rgba(226, 232, 240, 0.7)",
  fontFamily: F.sans,
  fontSize: 15,
  fontWeight: 600,
};

export default VolantiniProHeroMap;
