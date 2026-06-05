import React from "react";
import Button from "../ui/Button.jsx";

const F = {
  serif: "'DM Serif Display', Georgia, serif",
  sans: "'DM Sans', Inter, system-ui, sans-serif",
};

const C = {
  orange: "#E8571A",
  white: "#ffffff",
  dark: "#1A1A1A",
  card: "#242424",
};

function MailboxIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M6 26V13.5A7.5 7.5 0 0 1 13.5 6h5A7.5 7.5 0 0 1 26 13.5V26" stroke={C.orange} strokeWidth="2" strokeLinecap="round" />
      <path d="M6 14h20M16 6v20M20 11h4" stroke={C.orange} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 26h12" stroke={C.orange} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM4 26c.8-5 3.7-8 8-8s7.2 3 8 8" stroke={C.orange} strokeWidth="2" strokeLinecap="round" />
      <path d="M22 14a4 4 0 1 0 0-8M21 18c3.4.4 5.7 3 6.3 7" stroke={C.orange} strokeWidth="2" strokeLinecap="round" opacity=".65" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M10 11V8.5A2.5 2.5 0 0 1 12.5 6h7A2.5 2.5 0 0 1 22 8.5V11" stroke={C.orange} strokeWidth="2" strokeLinecap="round" />
      <path d="M6 12h20v14H6V12Z" stroke={C.orange} strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 17h20M14 17v2h4v-2" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const services = [
  {
    title: "Door to Door",
    subtitle: "Residenziale",
    price: "Prezzo personalizzato",
    unit: "Calcolato sulla tua zona",
    bullets: ["Cassette, condomini, ville", "GPS punto-per-punto", "Report foto e mappe"],
    icon: <MailboxIcon />,
  },
  {
    title: "Hand to Hand",
    subtitle: "Mano a mano",
    price: "Prezzo personalizzato",
    unit: "Calcolato sulla tua zona",
    bullets: ["Alto passaggio pedonale", "Fasce orarie ottimali", "POI strategici inclusi"],
    icon: <UsersIcon />,
  },
  {
    title: "Business Distribution",
    subtitle: "B2B",
    price: "Prezzo personalizzato",
    unit: "Calcolato sulla tua zona",
    bullets: ["Uffici e negozi mirati", "Categorie merceologiche", "Competitor mappati"],
    icon: <BriefcaseIcon />,
  },
];

export default function ServicesSection({ onConfigure }) {
  return (
    <section className="section" style={{ background: C.dark, paddingLeft: 28, paddingRight: 28 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 58 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase", color: C.orange, marginBottom: 12 }}>
            Quanto costa distribuire
          </div>
          <h2 className="landing-h2" style={{ fontFamily: F.serif, fontSize: 48, color: C.white, letterSpacing: "-1.5px", marginBottom: 12, lineHeight: 1.08 }}>
            Servizi chiari, prezzo calcolato sulla tua zona.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, color: "rgba(255,255,255,.52)", maxWidth: 560, margin: "0 auto", lineHeight: 1.65 }}>
            Il costo della distribuzione cambia in base ad area, quantità e servizio scelto.
          </p>
        </div>

        <div className="services-grid">
          {services.map((service) => (
            <article key={service.title} className="servizio-card">
              <div style={{ marginBottom: 26 }}>{service.icon}</div>
              <h3 style={{ fontFamily: F.serif, fontSize: 24, color: C.white, lineHeight: 1.08, letterSpacing: "-.3px", margin: 0 }}>
                {service.title}
              </h3>
              <p style={{ margin: "6px 0 24px", fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.6)" }}>{service.subtitle}</p>
              <div style={{ height: 1, background: "rgba(255,255,255,.08)", marginBottom: 24 }} />
              <div style={{ fontFamily: F.serif, fontSize: 27, color: C.orange, lineHeight: 1.08, letterSpacing: "-.4px", marginBottom: 8 }}>
                {service.price}
              </div>
              <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.45)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 26 }}>
                {service.unit}
              </div>
              <div style={{ display: "grid", gap: 12, marginBottom: 30 }}>
                {service.bullets.map((bullet) => (
                  <div key={bullet} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.76)" }}>
                    <span style={{ color: C.orange, fontWeight: 900 }}>✓</span>
                    {bullet}
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                onClick={onConfigure}
                style={{ marginTop: "auto", color: C.white, fontSize: 14, fontWeight: 800, justifyContent: "flex-start" }}
              >
                Scopri come →
              </Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
