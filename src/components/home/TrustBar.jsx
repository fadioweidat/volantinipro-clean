import React from "react";

const F = {
  serif: "'DM Serif Display', serif",
  sans: "'DM Sans', sans-serif",
};

export default function TrustBar({ metrics, clientLogos = [], showLogosLabel = true }) {
  return (
    <section
      style={{
        background: "#FAF9F7",
        borderTop: "0.5px solid rgba(0,0,0,.10)",
        borderBottom: "0.5px solid rgba(0,0,0,.10)",
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
                  color: "#1A1A1A",
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
                  color: "rgba(0,0,0,.50)",
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
              borderTop: "0.5px solid rgba(0,0,0,.10)",
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
                  color: "rgba(0,0,0,.42)",
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
