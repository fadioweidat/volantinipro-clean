import React from "react";
import { motion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const CAPS = [
  {
    title: "Analisi territoriale",
    desc: "Famiglie, popolazione, comuni coinvolti e copertura stimata calcolati sui dati territoriali disponibili.",
  },
  {
    title: "Suggerimenti sulla copertura",
    desc: "Volantini consigliati e indicazioni sulle zone in base all'area impostata nel configuratore.",
  },
  {
    title: "Controllo operativo",
    desc: "Percorsi GPS, avanzamento delle zone e prove fotografiche raccolte durante la distribuzione.",
  },
];

export default function TecnologiaSection({ onConfigure }) {
  return (
    <section
      id="tecnologia"
      className="section"
      aria-labelledby="tecnologia-title"
      style={{ background: "#111827", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ maxWidth: 640, marginBottom: 44 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 14 }}>
            Tecnologia
          </div>
          <h2 id="tecnologia-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: 42, lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
            Tecnologia che supporta le decisioni
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "#AEB9C9", margin: "18px 0 0" }}>
            Analisi territoriale, suggerimenti sulla copertura e controllo operativo basati sui dati disponibili.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {CAPS.map((cap, idx) => (
            <motion.article
              key={cap.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.18, delay: idx * 0.05 }}
              style={{ background: "#122036", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "24px 22px" }}
            >
              <h3 style={{ fontFamily: F.serif, fontSize: 20, color: "#F8FAFC", margin: "0 0 10px", letterSpacing: "-0.02em" }}>{cap.title}</h3>
              <p style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 1.6, color: "#AEB9C9", margin: 0 }}>{cap.desc}</p>
            </motion.article>
          ))}
        </div>

        <div style={{ marginTop: 34 }}>
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
