import React from "react";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C = { orange: "#E8571A", white: "#ffffff" };

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.white }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: C.orange, display: "grid", placeItems: "center" }}>
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 2.5 17 17H3L10 2.5Z" fill="white" />
          <circle cx="10" cy="12" r="2" fill="white" opacity=".7" />
        </svg>
      </div>
      <span style={{ fontFamily: F.serif, fontSize: 22, letterSpacing: "-.02em" }}>
        Volantini<span style={{ color: C.orange }}>Pro</span>
      </span>
    </div>
  );
}

function SocialIcon({ type }) {
  const common = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" };
  if (type === "linkedin") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M16 8a6 6 0 0 1 6 6v6h-4v-6a2 2 0 0 0-4 0v6h-4V9h4v2" />
        <path {...common} d="M2 9h4v11H2zM4 4.5v.1" />
      </svg>
    );
  }
  if (type === "youtube") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M22 12s0-3.5-.5-5a3 3 0 0 0-2.1-2.1C17.8 4.5 12 4.5 12 4.5s-5.8 0-7.4.4A3 3 0 0 0 2.5 7C2 8.5 2 12 2 12s0 3.5.5 5a3 3 0 0 0 2.1 2.1c1.6.4 7.4.4 7.4.4s5.8 0 7.4-.4a3 3 0 0 0 2.1-2.1c.5-1.5.5-5 .5-5Z" />
        <path {...common} d="m10 9 5 3-5 3V9Z" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect {...common} x="3" y="3" width="18" height="18" rx="5" />
      <circle {...common} cx="12" cy="12" r="4" />
      <path {...common} d="M17.5 6.5h.01" />
    </svg>
  );
}

const columns = [
  {
    title: "Prodotto",
    links: [
      ["Come funziona", "how"],
      ["Prezzi", "step1"],
      ["Configura campagna", "step1"],
      ["Smart Pairing", "how"],
      ["API & integrazioni", "consultant"],
    ],
  },
  {
    title: "Azienda",
    links: [
      ["Chi siamo", "how"],
      ["Lavora con noi", "consultant"],
      ["Blog", "home"],
      ["Contatti", "consultant"],
      ["Press kit", "home"],
    ],
  },
  {
    title: "Legale",
    links: [
      ["Privacy policy", "privacy"],
      ["Termini di servizio", "terms"],
      ["Cookie policy", "cookie"],
      ["GDPR", "privacy"],
    ],
  },
];

export default function Footer({ onNav, onHowItWorks }) {
  const go = (target) => {
    if (target === "how") onHowItWorks?.();
    else onNav?.(target);
  };

  return (
    <footer style={{ background: "#0F0F0F", padding: "80px 28px 32px", color: C.white }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="footer-grid">
          <div>
            <Logo />
            <p style={{ margin: "18px 0 24px", maxWidth: 280, fontFamily: F.sans, fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,.5)" }}>
              Distribuzione volantini intelligente per il B2B italiano.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              {["instagram", "linkedin", "youtube"].map((type) => (
                <button key={type} type="button" aria-label={type} style={socialButtonStyle}>
                  <SocialIcon type={type} />
                </button>
              ))}
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <div style={columnTitleStyle}>{column.title}</div>
              <div style={{ display: "grid", gap: 12 }}>
                {column.links.map(([label, target]) => (
                  <button key={label} type="button" onClick={() => go(target)} style={footerLinkStyle}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="footer-bottom">
          <span>© 2026 VolantiniPro · P.IVA 0123456789 · Made in Milano, Italia</span>
          <button type="button" style={languageStyle}>Lingua: IT ▾</button>
        </div>
      </div>
    </footer>
  );
}

const socialButtonStyle = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.1)",
  background: "rgba(255,255,255,.04)",
  color: "rgba(255,255,255,.72)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const columnTitleStyle = {
  fontFamily: F.sans,
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,.5)",
  marginBottom: 18,
};

const footerLinkStyle = {
  padding: 0,
  border: 0,
  background: "transparent",
  textAlign: "left",
  fontFamily: F.sans,
  fontSize: 14,
  color: "rgba(255,255,255,.8)",
  cursor: "pointer",
};

const languageStyle = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.1)",
  background: "rgba(255,255,255,.04)",
  color: "rgba(255,255,255,.72)",
  fontFamily: F.sans,
  fontSize: 12,
  cursor: "pointer",
};
