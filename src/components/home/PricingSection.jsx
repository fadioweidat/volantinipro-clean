import React from "react";
import { motion } from "framer-motion";
import Button from "../ui/Button.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const plans = [
  {
    name: "Starter",
    badge: null,
    priceLabel: "Su preventivo",
    priceNote: "Calcolato su zona e quantità",
    color: "#E8571A",
    features: [
      "Configuratore 4 step completo",
      "Analisi zona con mappa",
      "Dati ISTAT famiglie e popolazione",
      "Preventivo PDF scaricabile",
      "1 servizio a scelta (D2D / H2H / B2B)",
    ],
    cta: "Configura la tua campagna",
    ctaVariant: "outline",
  },
  {
    name: "Pro",
    badge: "Più scelto",
    priceLabel: "Su preventivo",
    priceNote: "Con report e opzioni avanzate",
    color: "#E8571A",
    features: [
      "Tutto di Starter",
      "Smart Pairing se disponibile",
      "Richiesta disponibilità quando non ci sono abbinamenti",
      "Calendario operativo avanzato",
      "Report GPS post-campagna",
      "Supporto prioritario",
    ],
    cta: "Configura la tua campagna",
    ctaVariant: "primary",
  },
  {
    name: "Business",
    badge: null,
    priceLabel: "Personalizzato",
    priceNote: "Per volumi e aree estese",
    color: "#E8571A",
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

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="7" cy="7" r="6.5" fill="rgba(232, 87, 26, 0.15)" />
      <path d="M4.5 7l2 2 3-3" stroke={C_ORANGE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PricingSection({ onConfigure, onConsultant }) {
  return (
    <section id="piani-piattaforma" className="section" style={{ background: "#111827", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 58 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 16 }}>
            Quanto costa la piattaforma
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(36px, 3vw, 54px)", lineHeight: 1.08, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
            Scegli il piano giusto
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "#94A3B8", marginTop: 16, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            Abbonamento VolantiniPro e opzioni operative: nessun canone mensile obbligatorio, paghi solo le campagne che attivi.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
          {plans.map((plan, idx) => {
            const isPrimary = plan.ctaVariant === "primary";
            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.18, delay: idx * 0.05 }}
                whileHover={{ y: -4, borderColor: "rgba(232, 87, 26, 0.4)" }}
                style={{
                  borderRadius: 20,
                  background: isPrimary ? "#18263D" : "#122036",
                  border: isPrimary ? `2px solid rgba(232, 87, 26, 0.6)` : "1px solid rgba(255, 255, 255, 0.08)",
                  padding: "32px 28px",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  boxShadow: isPrimary ? "0 24px 64px rgba(232, 87, 26, 0.2)" : "0 16px 32px rgba(0,0,0,0.25)",
                }}
              >
                {plan.badge && (
                  <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", padding: "4px 14px", borderRadius: 20, background: C_ORANGE, fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: "#fff", whiteSpace: "nowrap", letterSpacing: ".04em", boxShadow: "0 4px 12px rgba(232,87,26,0.4)" }}>
                    {plan.badge}
                  </div>
                )}

                <div style={{ marginBottom: 6 }}>
                  <div style={{ width: 28, height: 4, borderRadius: 2, background: C_ORANGE, marginBottom: 18 }} />
                  <div style={{ fontFamily: F.serif, fontSize: 26, color: "#F8FAFC", letterSpacing: "-0.02em", marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 20, fontWeight: 900, color: C_ORANGE, letterSpacing: "-0.02em" }}>{plan.priceLabel}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{plan.priceNote}</div>
                </div>

                <div style={{ width: "100%", height: 1, background: "rgba(255, 255, 255, 0.08)", margin: "22px 0" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, marginBottom: 28 }}>
                  {plan.features.map((feat) => (
                    <div key={feat} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <CheckIcon />
                      <span style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.5, color: "#CBD5E1" }}>{feat}</span>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={plan.name === "Business" ? onConsultant : onConfigure}
                  variant={isPrimary ? "primary" : "secondary"}
                  style={{
                    width: "100%",
                    minHeight: 48,
                    padding: "0 20px",
                    borderRadius: 12,
                    fontFamily: F.sans,
                    fontSize: 14,
                    fontWeight: 800,
                    boxShadow: isPrimary ? "0 8px 24px rgba(232,87,26,0.35)" : "none",
                  }}
                >
                  {plan.cta}
                </Button>
              </motion.div>
            );
          })}
        </div>

        <p style={{ textAlign: "center", fontFamily: F.sans, fontSize: 13, color: "#94A3B8", marginTop: 36 }}>
          Prezzo personalizzato in base a zona, quantità e servizio. Nessun abbonamento mensile obbligatorio.
        </p>
      </div>
    </section>
  );
}
