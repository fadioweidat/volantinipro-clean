import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const STEPS = [
  { n: "01", title: "Configura", desc: "Servizio, comune, quantità e formato.", badge: "Servizio + quantità" },
  { n: "02", title: "Analizza il territorio", desc: "Copertura, famiglie, zone e mappa reale.", badge: "Analisi territoriale" },
  { n: "03", title: "Personalizza", desc: "Piano, servizi ed extra opzionali.", badge: "Piano + extra" },
  { n: "04", title: "Preventivo", desc: "Prezzo finale, PDF e avvio campagna.", badge: "Riepilogo + prezzo" },
];

// Timeline orizzontale su desktop (nodi connessi), verticale compatta su
// mobile. Stessi 4 step del configuratore reale — nessuno step aggiunto.
export default function HowItWorksSection({ onConfigure }) {
  const reduceMotion = useReducedMotion();

  return (
    <section id="come-funziona" className="section-tight howitworks-section" style={{ background: "#F4F1EB", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", scrollMarginTop: 80 }}>
      <style>{`
        .howitworks-track { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; position: relative; }
        .howitworks-track::before { content: ""; position: absolute; top: 21px; left: 8%; right: 8%; height: 2px; background: repeating-linear-gradient(90deg, rgba(11,16,32,.15) 0 8px, transparent 8px 14px); z-index: 0; }
        .howitworks-node { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 10px; padding: 0 12px; }
        @media (max-width: 860px) {
          .howitworks-track { display: flex; flex-direction: column; gap: 20px; }
          .howitworks-track::before { display: none; }
          .howitworks-node { flex-direction: row; align-items: flex-start; padding: 0; }
        }
      `}</style>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 8 }}>
            Dall'idea al volantino in mano
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(28px, 3.6vw, 40px)", color: "#0B1020", letterSpacing: "-1.4px", margin: "0 0 8px", lineHeight: 1.08 }}>
            Dall'idea alla campagna in 4 step misurabili.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 14.5, color: "#5B6472", maxWidth: 520, lineHeight: 1.55, margin: 0 }}>
            Un flusso unico per definire servizio, zona, date operative e preventivo finale.
          </p>
        </div>

        <div className="howitworks-track">
          {STEPS.map((step, idx) => (
            <motion.div
              key={step.n}
              className="howitworks-node"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.22, delay: reduceMotion ? 0 : idx * 0.08 }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: "50%", background: "#0B1020", color: C_ORANGE,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: F.sans, fontSize: 14, fontWeight: 900, flexShrink: 0,
                border: "3px solid #F4F1EB", boxShadow: "0 0 0 2px rgba(11,16,32,.12)",
              }}>
                {step.n}
              </div>
              <div>
                <h3 style={{ fontFamily: F.serif, fontSize: 18, color: "#0B1020", margin: "0 0 3px", letterSpacing: "-.3px" }}>{step.title}</h3>
                <p style={{ fontFamily: F.sans, fontSize: 12.5, color: "#5B6472", lineHeight: 1.45, margin: "0 0 8px" }}>{step.desc}</p>
                <div style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 6, background: "rgba(232,87,26,.1)", fontFamily: F.sans, fontSize: 9.5, fontWeight: 800, color: C_ORANGE, letterSpacing: ".04em", textTransform: "uppercase" }}>
                  {step.badge}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 28 }}>
          <button
            className="vb"
            onClick={() => onConfigure?.()}
            style={{ padding: "12px 28px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)", color: "#fff", fontFamily: F.sans, fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 16px rgba(232,87,26,0.28)" }}
          >
            Configura la tua campagna →
          </button>
        </div>
      </div>
    </section>
  );
}
