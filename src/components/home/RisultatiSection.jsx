import React from "react";
import { motion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const items = [
  {
    initials: "01",
    title: "Copertura territoriale",
    desc: "Le zone effettivamente servite e le famiglie stimate raggiunte, rappresentate sulla mappa.",
  },
  {
    initials: "02",
    title: "Percorso GPS",
    desc: "Il tracciato registrato dagli operatori durante la distribuzione, zona per zona.",
  },
  {
    initials: "03",
    title: "Fotografie e report",
    desc: "Le prove fotografiche raccolte sul campo e il report finale con i dati della campagna.",
  },
];

export default function RisultatiSection() {
  return (
    <section className="section" style={{ background: "#0B1020", paddingLeft: 28, paddingRight: 28, borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 50 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 14 }}>
            DATI VERIFICABILI
          </div>
          <h2 className="landing-h2" style={{ fontFamily: F.serif, fontSize: 46, lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-.03em", margin: 0 }}>
            Ogni campagna produce dati verificabili.
          </h2>
          <p style={{ margin: "16px auto 0", maxWidth: 600, fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "#AEB9C9" }}>
            Copertura territoriale, percorso GPS, fotografie e report permettono di valutare il lavoro eseguito.
          </p>
        </div>

        <div className="results-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
          {items.map((item, idx) => (
            <motion.article
              key={item.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.18, delay: idx * 0.05 }}
              whileHover={{ y: -4, borderColor: "rgba(232, 87, 26, 0.4)" }}
              className="testimonial-card"
              style={{ background: "#122036", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 20, padding: "32px 28px", display: "flex", flexDirection: "column" }}
            >
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(232, 87, 26, 0.12)", border: "1px solid rgba(232, 87, 26, 0.25)", color: C_ORANGE, display: "grid", placeItems: "center", fontFamily: F.sans, fontSize: 12, fontWeight: 900, marginBottom: 20 }}>
                {item.initials}
              </div>
              <h3 style={{ fontFamily: F.serif, fontSize: 22, color: "#F8FAFC", letterSpacing: "-0.02em", margin: "0 0 10px" }}>{item.title}</h3>
              <p style={{ margin: 0, fontFamily: F.sans, fontSize: 15, lineHeight: 1.6, color: "#C3CDDB" }}>{item.desc}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
