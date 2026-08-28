import React from "react";
import { motion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const CARDS = [
  {
    tag: "01",
    title: "Stato campagna",
    desc: "Segui in che fase si trova la campagna: in preparazione, in distribuzione o conclusa.",
  },
  {
    tag: "02",
    title: "Tracking GPS",
    desc: "Vedi il percorso registrato dagli operatori e l'avanzamento zona per zona.",
  },
  {
    tag: "03",
    title: "Foto e prove",
    desc: "Consulta le fotografie geolocalizzate raccolte durante la distribuzione.",
  },
  {
    tag: "04",
    title: "Report finale",
    desc: "Scarica il report con mappa di copertura, zone servite e dati della distribuzione.",
  },
];

export default function DashboardClienteSection({ onConfigure }) {
  return (
    <section
      id="dashboard-cliente"
      className="section"
      aria-labelledby="dashboard-cliente-title"
      style={{ background: "#0B1020", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ maxWidth: 620, marginBottom: 48 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 14 }}>
            Dashboard Cliente
          </div>
          <h2 id="dashboard-cliente-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: 44, lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
            Dopo il preventivo controlli tutto da un'unica dashboard.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "#AEB9C9", margin: "18px 0 0" }}>
            La campagna non finisce con la conferma: puoi seguirne stato, distribuzione, prove e report.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
          {CARDS.map((card, idx) => (
            <motion.article
              key={card.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.18, delay: idx * 0.05 }}
              whileHover={{ y: -4, borderColor: "rgba(232, 87, 26, 0.4)" }}
              style={{
                background: "#122036",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 18,
                padding: "26px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 900, letterSpacing: ".08em", color: C_ORANGE }}>{card.tag}</span>
              <h3 style={{ fontFamily: F.serif, fontSize: 21, color: "#F8FAFC", margin: 0, letterSpacing: "-0.02em" }}>{card.title}</h3>
              <p style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 1.55, color: "#AEB9C9", margin: 0 }}>{card.desc}</p>
            </motion.article>
          ))}
        </div>

        <div style={{ marginTop: 36 }}>
          <button
            onClick={() => onConfigure?.()}
            className="vb"
            style={{ padding: "13px 28px", borderRadius: 8, border: "none", background: C_ORANGE, color: "#fff", fontFamily: F.sans, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(232,87,26,0.28)" }}
          >
            Configura la tua campagna →
          </button>
        </div>
      </div>
    </section>
  );
}
