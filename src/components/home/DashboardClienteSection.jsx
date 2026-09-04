import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const CARDS = [
  { tag: "01", title: "Stato campagna", desc: "In preparazione, in distribuzione o conclusa." },
  { tag: "02", title: "Tracking GPS", desc: "Percorso registrato e avanzamento zona per zona." },
  { tag: "03", title: "Foto e prove", desc: "Fotografie geolocalizzate raccolte sul campo." },
  { tag: "04", title: "Report finale", desc: "Mappa di copertura, zone servite e dati completi." },
];

// Unisce in una sola sezione ciò che prima era diviso tra Dashboard,
// "Cosa ricevi" e "Risultati": i 4 callout + un mockup visivo compatto
// (anteprima report PDF, foto geolocalizzate, mappa di copertura).
export default function DashboardClienteSection({ onConfigure }) {
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="dashboard-cliente"
      className="section-tight dashboard-cliente-section"
      aria-labelledby="dashboard-cliente-title"
      style={{ background: "#0B1020", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <style>{`
        .dashboard-grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0,52%) minmax(0,48%); gap: 40px; align-items: center; }
        @media (max-width: 900px) { .dashboard-grid { grid-template-columns: 1fr !important; gap: 26px !important; } }
      `}</style>
      <div className="dashboard-grid">
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 12 }}>
            Dashboard Cliente
          </div>
          <h2 id="dashboard-cliente-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: "clamp(28px, 3.4vw, 40px)", lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
            Dopo il preventivo controlli tutto da un'unica dashboard.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 14.5, lineHeight: 1.6, color: "#AEB9C9", margin: "14px 0 24px" }}>
            La campagna non finisce con la conferma: segui stato, distribuzione, prove e storico dal proprio account.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
            {CARDS.map((card, idx) => (
              <motion.article
                key={card.title}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.18, delay: reduceMotion ? 0 : idx * 0.05 }}
                whileHover={reduceMotion ? undefined : { y: -3, borderColor: "rgba(232, 87, 26, 0.4)" }}
                style={{ background: "#122036", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 14, padding: "18px 18px", display: "flex", flexDirection: "column", gap: 6 }}
              >
                <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 900, letterSpacing: ".08em", color: C_ORANGE }}>{card.tag}</span>
                <h3 style={{ fontFamily: F.serif, fontSize: 17, color: "#F8FAFC", margin: 0, letterSpacing: "-0.02em" }}>{card.title}</h3>
                <p style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.5, color: "#AEB9C9", margin: 0 }}>{card.desc}</p>
              </motion.article>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <button
              onClick={() => onConfigure?.()}
              className="vb"
              style={{ padding: "12px 26px", borderRadius: 8, border: "none", background: C_ORANGE, color: "#fff", fontFamily: F.sans, fontSize: 13.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(232,87,26,0.28)" }}
            >
              Configura la tua campagna →
            </button>
          </div>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 20, boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: "#F8FAFC" }}>Campagna · Milano Nord</span>
            <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 20, background: "rgba(46,204,138,.12)", border: "1px solid rgba(46,204,138,.3)", color: "#7FE3B4" }}>Conclusa</span>
          </div>

          {/* mappa di copertura (mockup) */}
          <svg viewBox="0 0 340 110" width="100%" aria-hidden="true" style={{ display: "block", width: "100%", height: "auto", borderRadius: 12, background: "linear-gradient(160deg,#0d1a30 0%,#0a1424 100%)" }}>
            <polygon points="20,95 45,25 170,15 300,35 290,100 80,105" fill="rgba(232,87,26,0.1)" stroke="rgba(232,87,26,0.4)" strokeWidth="1.5" />
            <polygon points="60,80 90,45 180,40 220,60 200,90 100,95" fill="rgba(127,227,180,0.08)" stroke="rgba(127,227,180,0.35)" strokeWidth="1.2" strokeDasharray="3 3" />
          </svg>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 14 }}>
            {/* anteprima report PDF */}
            <div style={{ background: "#122036", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: "#F8FAFC" }}>Report_Campagna.pdf</span>
              <span style={{ fontFamily: F.sans, fontSize: 9.5, color: "#8892A0" }}>Mappa · foto · dati</span>
            </div>
            {/* foto geolocalizzate */}
            <div style={{ background: "#122036", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 12px" }}>
              <div style={{ fontFamily: F.sans, fontSize: 9.5, fontWeight: 800, color: "#8892A0", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Foto geolocalizzate</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ flex: 1, aspectRatio: "1/1", borderRadius: 6, background: "#182235", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>📍</div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, fontFamily: F.sans, fontSize: 10, color: "#5B6472" }}>Anteprima dimostrativa — dati d'esempio</div>
        </motion.div>
      </div>
    </section>
  );
}
