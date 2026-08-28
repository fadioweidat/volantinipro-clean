import React from "react";
import { motion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const ITEMS = [
  { title: "GPS live", desc: "Percorso degli operatori tracciato durante la distribuzione." },
  { title: "Foto geolocalizzate", desc: "Scatti raccolti sul campo con posizione associata." },
  { title: "Report fotografico", desc: "Le fotografie organizzate nel documento finale." },
  { title: "Mappa di copertura", desc: "Le zone effettivamente servite rappresentate sulla mappa." },
  { title: "Storico distribuzione", desc: "Il registro delle attività svolte, consultabile nel tempo." },
];

export default function CosaRiceviSection({ onConfigure }) {
  return (
    <section
      id="cosa-ricevi"
      className="section"
      aria-labelledby="cosa-ricevi-title"
      style={{ background: "#0B1020", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ maxWidth: 620, marginBottom: 44 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 14 }}>
            Output della campagna
          </div>
          <h2 id="cosa-ricevi-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: 44, lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
            Cosa ricevi con una campagna VolantiniPro
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
          {ITEMS.map((item, idx) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.18, delay: idx * 0.04 }}
              style={{ background: "#122036", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "22px 20px" }}
            >
              <div style={{ width: 26, height: 3, borderRadius: 2, background: C_ORANGE, marginBottom: 14 }} />
              <h3 style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 800, color: "#F8FAFC", margin: "0 0 8px" }}>{item.title}</h3>
              <p style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.55, color: "#AEB9C9", margin: 0 }}>{item.desc}</p>
            </motion.div>
          ))}
        </div>

        <p style={{ fontFamily: F.sans, fontSize: 13, color: "#AEB9C9", margin: "28px 0 0" }}>
          Gli output disponibili dipendono dal servizio e dalle opzioni scelte in fase di configurazione.
        </p>
      </div>
    </section>
  );
}
