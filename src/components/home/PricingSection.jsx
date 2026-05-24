import React from "react";
import Button from "../ui/Button.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const CO = "#E8571A";
const CB = "#E8571A";
const CG = "#E8571A";

const plans = [
  {
    name: "Starter",
    badge: null,
    priceLabel: "Su preventivo",
    priceNote: "Calcolato su zona e quantita",
    color: CB,
    features: [
      "Configuratore 4 step completo",
      "Analisi zona con mappa",
      "Dati ISTAT famiglie e popolazione",
      "Preventivo PDF scaricabile",
      "1 servizio a scelta (D2D / H2H / B2B)",
    ],
    cta: "Configura campagna",
    ctaVariant: "outline",
  },
  {
    name: "Pro",
    badge: "Piu scelto",
    priceLabel: "Su preventivo",
    priceNote: "Con Smart Pairing incluso",
    color: CO,
    features: [
      "Tutto di Starter",
      "Smart Pairing automatico",
      "Sconto abbinamento fino al 20%",
      "Calendario operativo avanzato",
      "Report GPS post-campagna",
      "Supporto prioritario",
    ],
    cta: "Configura campagna Pro",
    ctaVariant: "primary",
  },
  {
    name: "Business",
    badge: null,
    priceLabel: "Personalizzato",
    priceNote: "Per volumi e aree estese",
    color: CG,
    features: [
      "Tutto di Pro",
      "Campagne multi-zona illimitate",
      "Account manager dedicato",
      "Integrazione API dati territoriali",
      "Report personalizzati",
      "SLA operativo garantito",
    ],
    cta: "Parla con un consulente",
    ctaVariant: "outline",
  },
];

function CheckIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="7" cy="7" r="6.5" fill={`${color}20`} />
      <path d="M4.5 7l2 2 3-3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PricingSection({ onConfigure, onConsultant }) {
  return (
    <section className="section" style={{ background: "#FAF9F7", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 58 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: CO, marginBottom: 16 }}>
            Prezzi
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(36px, 3vw, 54px)", lineHeight: 1.08, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0 }}>
            Scegli il piano giusto
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "rgba(26,26,26,.52)", marginTop: 16, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            Il costo finale dipende da zona, quantita e servizio. Nessun canone mensile, paghi solo le campagne che attivi.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {plans.map((plan) => {
            const isPrimary = plan.ctaVariant === "primary";
            return (
              <div
                key={plan.name}
                style={{
                  borderRadius: 20,
                  background: isPrimary ? "#1A1A1A" : "#fff",
                  border: isPrimary ? `2px solid ${CO}` : "1px solid rgba(26,26,26,.1)",
                  padding: "34px 30px",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  boxShadow: isPrimary ? `0 24px 64px ${CO}22` : "0 4px 24px rgba(0,0,0,.06)",
                }}
              >
                {plan.badge && (
                  <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", padding: "4px 14px", borderRadius: 20, background: CO, fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: "#fff", whiteSpace: "nowrap", letterSpacing: ".04em" }}>
                    {plan.badge}
                  </div>
                )}

                <div style={{ marginBottom: 6 }}>
                  <div style={{ width: 28, height: 4, borderRadius: 2, background: plan.color, marginBottom: 18 }} />
                  <div style={{ fontFamily: F.serif, fontSize: 26, color: isPrimary ? "#f8fafc" : "#1A1A1A", letterSpacing: "-0.02em", marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 20, fontWeight: 900, color: plan.color, letterSpacing: "-0.02em" }}>{plan.priceLabel}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: isPrimary ? "rgba(248,250,252,.4)" : "rgba(26,26,26,.4)", marginTop: 4 }}>{plan.priceNote}</div>
                </div>

                <div style={{ width: "100%", height: 1, background: isPrimary ? "rgba(255,255,255,.08)" : "rgba(26,26,26,.08)", margin: "22px 0" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, marginBottom: 28 }}>
                  {plan.features.map((feat) => (
                    <div key={feat} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <CheckIcon color={plan.color} />
                      <span style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.5, color: isPrimary ? "rgba(248,250,252,.7)" : "rgba(26,26,26,.65)" }}>{feat}</span>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={plan.name === "Business" ? onConsultant : onConfigure}
                  variant={isPrimary ? "primary" : "secondary"}
                  style={{
                    width: "100%",
                    minHeight: 46,
                    padding: "0 13px",
                    borderRadius: 11,
                    fontFamily: F.sans,
                    fontSize: 14,
                    fontWeight: 900,
                    boxShadow: isPrimary ? `0 10px 28px ${CO}38` : "none",
                  }}
                >
                  {plan.cta}
                </Button>
              </div>
            );
          })}
        </div>

        <p style={{ textAlign: "center", fontFamily: F.sans, fontSize: 13, color: "rgba(26,26,26,.38)", marginTop: 36 }}>
          Tutti i prezzi sono IVA esclusa. Nessun abbonamento mensile obbligatorio.
        </p>
      </div>
    </section>
  );
}
