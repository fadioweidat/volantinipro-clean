import React from "react";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";
const GRAD = "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)";

import { Logo } from "../common/Logo.jsx";

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
      ["Prezzi", "prezzi"],
      ["Configura la tua campagna", "step1"],
      ["Smart Pairing", "smart-pairing"],
      ["Distribuzione volantini a Milano", "milano-landing"],
      ["API & integrazioni", "consultant"],
    ],
  },
  {
    title: "Azienda",
    links: [
      ["Chi siamo", "how"],
      ["Lavora con noi (in prep.)", "prep"],
      ["Blog (in prep.)", "prep"],
      ["Contatti", "consultant"],
      ["Press kit (in prep.)", "prep"],
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
    if (target === "how") {
      const el = document.getElementById("come-funziona");
      if (el) el.scrollIntoView({ behavior: "smooth" });
      else onHowItWorks?.();
    } else if (target === "prezzi") {
      const el = document.getElementById("prezzi");
      if (el) el.scrollIntoView({ behavior: "smooth" });
      else onNav?.("home");
    } else if (target === "smart-pairing") {
      const el = document.getElementById("smart-pairing");
      if (el) el.scrollIntoView({ behavior: "smooth" });
      else onHowItWorks?.();
    } else if (target !== "prep") {
      onNav?.(target);
    }
  };

  return (
    <footer style={{ background: "#0B1020", padding: "80px 28px 32px", color: "#F8FAFC", borderTop: "1px solid rgba(148,163,184,0.12)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="footer-grid">
          <div>
            <Logo dark={true} size={32} />
            <p style={{ marginTop: 24, fontSize: 15, lineHeight: 1.6, color: "#94A3B8", maxWidth: 300 }}>
              Distribuzione volantini intelligente per il B2B italiano.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              {["instagram", "linkedin", "youtube"].map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Canale in preparazione"
                  style={{ ...socialButtonStyle, cursor: "not-allowed", opacity: 0.45 }}
                >
                  <SocialIcon type={type} />
                </button>
              ))}
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <div style={columnTitleStyle}>{column.title}</div>
              <div style={{ display: "grid", gap: 12 }}>
                {column.links.map(([label, target]) =>
                  target === "prep" ? (
                    <span key={label} title="Sezione in preparazione" style={{ ...footerLinkStyle, cursor: "default", opacity: 0.45 }}>
                      {label}
                    </span>
                  ) : (
                    <button key={label} type="button" onClick={() => go(target)} style={footerLinkStyle}>
                      {label}
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="footer-bottom">
          <span>© 2026 VolantiniPro · P.IVA in aggiornamento · Made in Milano, Italia</span>
          <span style={{ ...languageStyle, cursor: "default" }}>Lingua: IT</span>
        </div>
      </div>
    </footer>
  );
}

const socialButtonStyle = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.15)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(248,250,252,0.65)",
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
  color: "#94A3B8",
  marginBottom: 18,
};

const footerLinkStyle = {
  padding: 0,
  border: 0,
  background: "transparent",
  textAlign: "left",
  fontFamily: F.sans,
  fontSize: 14,
  color: "rgba(248,250,252,0.75)",
  cursor: "pointer",
};

const languageStyle = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.15)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(248,250,252,0.65)",
  fontFamily: F.sans,
  fontSize: 12,
  cursor: "pointer",
};
