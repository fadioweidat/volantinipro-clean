import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import Button from "../ui/Button.jsx";

const F = {
  serif: "'DM Serif Display', Georgia, serif",
  sans: "'DM Sans', Inter, system-ui, sans-serif",
};

const C = {
  primary: "#E8571A",
  cyan: "#E8571A",
  success: "#E8571A",
  white: "#F8FAFC",
};

function MailboxIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M6 26V13.5A7.5 7.5 0 0 1 13.5 6h5A7.5 7.5 0 0 1 26 13.5V26" stroke={C.primary} strokeWidth="2" strokeLinecap="round" />
      <path d="M6 14h20M16 6v20M20 11h4" stroke={C.primary} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 26h12" stroke={C.primary} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM4 26c.8-5 3.7-8 8-8s7.2 3 8 8" stroke={C.cyan} strokeWidth="2" strokeLinecap="round" />
      <path d="M22 14a4 4 0 1 0 0-8M21 18c3.4.4 5.7 3 6.3 7" stroke={C.cyan} strokeWidth="2" strokeLinecap="round" opacity=".65" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M10 11V8.5A2.5 2.5 0 0 1 12.5 6h7A2.5 2.5 0 0 1 22 8.5V11" stroke={C.success} strokeWidth="2" strokeLinecap="round" />
      <path d="M6 12h20v14H6V12Z" stroke={C.success} strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 17h20M14 17v2h4v-2" stroke={C.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Esportato per il Service JSON-LD in SeoMeta.jsx: stessa fonte del testo
// realmente visibile, mai una copia duplicata.
export const services = [
  {
    title: "Door to Door",
    subtitle: "Distribuzione residenziale",
    bullets: ["Cassette, condomini, ville", "GPS punto-per-punto", "Report foto e mappe"],
    icon: <MailboxIcon />,
    accent: C.primary,
    pageKey: "service-door-to-door",
  },
  {
    title: "Hand to Hand",
    subtitle: "Distribuzione a mano",
    bullets: ["Alto passaggio pedonale", "Fasce orarie ottimali", "POI strategici inclusi"],
    icon: <UsersIcon />,
    accent: C.cyan,
    pageKey: "service-hand-to-hand",
  },
  {
    title: "Business Distribution",
    subtitle: "Distribuzione B2B",
    bullets: ["Uffici e negozi mirati", "Categorie merceologiche", "Competitor mappati"],
    icon: <BriefcaseIcon />,
    accent: C.success,
    pageKey: "service-business",
  },
];

export default function ServicesSection({ onConfigure, onServiceLink }) {
  const reduceMotion = useReducedMotion();
  return (
    <section className="section-tight" style={{ background: "#0B1020", paddingLeft: 28, paddingRight: 28, borderTop: "1px solid rgba(148,163,184,0.18)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C.primary, marginBottom: 10 }}>
            Quanto costa distribuire
          </div>
          <h2 className="landing-h2" style={{ fontFamily: F.serif, fontSize: "clamp(30px, 3.8vw, 42px)", color: C.white, letterSpacing: "-0.03em", marginBottom: 12, lineHeight: 1.05 }}>
            Servizi chiari, prezzo calcolato sulla tua zona.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 15, color: "#AEB9C9", maxWidth: 560, margin: "0 auto", lineHeight: 1.55 }}>
            Il costo della distribuzione cambia in base ad area, quantità e servizio scelto.
          </p>
        </div>

        <div className="services-grid" style={{ gap: 20 }}>
          {services.map((service, idx) => (
            <motion.article
              key={service.title}
              className="servizio-card vc"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.18, delay: reduceMotion ? 0 : idx * 0.05 }}
              whileHover={reduceMotion ? undefined : { y: -3, borderColor: "rgba(232, 87, 26, 0.4)" }}
              style={{ borderRadius: 16, padding: "24px 22px", border: "1px solid rgba(255, 255, 255, 0.08)", background: "#122036", boxShadow: "0 12px 28px rgba(0,0,0,0.22)", display: "flex", flexDirection: "column" }}
            >
              <div style={{ marginBottom: 14 }}>{service.icon}</div>
              <h3 style={{ fontFamily: F.serif, fontSize: 22, color: C.white, lineHeight: 1.08, letterSpacing: "-0.02em", margin: 0 }}>
                {service.title}
              </h3>
              <p style={{ margin: "4px 0 16px", fontFamily: F.sans, fontSize: 13.5, color: "#AEB9C9" }}>{service.subtitle}</p>
              <div style={{ height: 1, background: "rgba(255, 255, 255, 0.08)", marginBottom: 18 }} />
              <div style={{ display: "grid", gap: 10, marginBottom: 22 }}>
                {service.bullets.map((bullet) => (
                  <div key={bullet} style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: F.sans, fontSize: 13.5, color: "#CBD5E1", fontWeight: 500 }}>
                    <span style={{ color: service.accent, fontWeight: 900, fontSize: 11 }}>✓</span>
                    {bullet}
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                onClick={() => onServiceLink?.(service.pageKey)}
                style={{ marginTop: "auto", color: C.white, fontSize: 13.5, fontWeight: 800, justifyContent: "flex-start", padding: 0 }}
              >
                Scopri come →
              </Button>
            </motion.article>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 32 }}>
          <button
            onClick={onConfigure}
            className="vb"
            style={{ padding: "12px 28px", borderRadius: 8, border: "none", background: C.primary, color: "#fff", fontFamily: F.sans, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(232,87,26,0.28)" }}
          >
            Calcola il tuo preventivo →
          </button>
          <p style={{ fontFamily: F.sans, fontSize: 12.5, color: "#AEB9C9", margin: "12px 0 0" }}>
            Prezzo calcolato su zona, quantità e servizio. Nessun abbonamento mensile obbligatorio.
          </p>
        </div>
      </div>
    </section>
  );
}
