import React from "react";

const F = {
  serif: "'DM Serif Display', serif",
  sans: "'DM Sans', sans-serif",
};

export default function TrustBar({ metrics, clientLogos = [], showLogosLabel = true }) {
  return (
    <section
      style={{
        background: "#111827",
        borderTop: "1px solid rgba(148,163,184,0.18)",
        borderBottom: "1px solid rgba(148,163,184,0.18)",
        padding: "48px 32px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="trust-bar-metrics">
          {metrics.map((metric) => (
            <div key={metric.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontFamily: F.serif,
                  fontSize: 42,
                  lineHeight: 1,
                  color: "#F8FAFC",
                  fontVariantNumeric: "tabular-nums",
                  marginBottom: 10,
                }}
              >
                {metric.value}
              </div>
              <div
                style={{
                  fontFamily: F.sans,
                  fontSize: 13,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#94A3B8",
                }}
              >
                {metric.label}
              </div>
            </div>
          ))}
        </div>

        {clientLogos.length > 0 && (
          <div
            style={{
              marginTop: 32,
              paddingTop: 32,
              borderTop: "1px solid rgba(148,163,184,0.18)",
              textAlign: "center",
            }}
          >
            {showLogosLabel && (
              <div
                style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#94A3B8",
                  marginBottom: 22,
                }}
              >
                Aziende che hanno scelto VolantiniPro
              </div>
            )}
            <div className="trust-bar-logos">
              {clientLogos.map((logo) => (
                <img key={logo.name} src={logo.src} alt={logo.name} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
