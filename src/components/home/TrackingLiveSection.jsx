import React from "react";
import { motion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const POINTS = [
  "Programma operativo sul telefono degli operatori",
  "Percorso GPS registrato durante la consegna",
  "Avanzamento zona per zona",
  "Prove fotografiche geolocalizzate",
  "Storico della distribuzione consultabile",
];

export default function TrackingLiveSection({ onConfigure }) {
  return (
    <section
      id="tracking-live"
      className="section"
      aria-labelledby="tracking-live-title"
      style={{ background: "#111827", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 48, alignItems: "center" }} className="tracking-live-grid">
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 14 }}>
            Tracking GPS e prove
          </div>
          <h2 id="tracking-live-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: 44, lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
            Segui la distribuzione mentre avviene
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "#AEB9C9", margin: "18px 0 26px" }}>
            Gli operatori ricevono il programma sul telefono, avviano la consegna e registrano il percorso GPS.
            Il cliente può verificare avanzamento, zone e prove della distribuzione.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "grid", gap: 12 }}>
            {POINTS.map((p) => (
              <li key={p} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: F.sans, fontSize: 14.5, lineHeight: 1.5, color: "#D2DAE6" }}>
                <span style={{ flexShrink: 0, marginTop: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(232,87,26,0.15)", border: "1px solid rgba(232,87,26,0.4)", color: C_ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 }}>✓</span>
                {p}
              </li>
            ))}
          </ul>
          <button
            onClick={() => onConfigure?.()}
            className="vb"
            style={{ padding: "13px 28px", borderRadius: 8, border: "none", background: C_ORANGE, color: "#fff", fontFamily: F.sans, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(232,87,26,0.28)" }}
          >
            Configura la tua campagna →
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.24 }}
          style={{ background: "#0B1020", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: "#F8FAFC" }}>Distribuzione in corso</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: "#8CE3BD" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2ECC8A" }} /> GPS attivo
            </span>
          </div>
          <svg viewBox="0 0 320 180" width="100%" aria-hidden="true" style={{ display: "block", width: "100%", height: "auto", borderRadius: 12, background: "#0d1a30" }}>
            <path d="M20 150 L70 120 L110 130 L150 80 L200 90 L250 45 L300 60" fill="none" stroke={C_ORANGE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 8" />
            {[[20,150],[110,130],[200,90],[300,60]].map(([cx,cy],i) => (
              <circle key={i} cx={cx} cy={cy} r="5" fill="#0B1020" stroke={C_ORANGE} strokeWidth="2.5" />
            ))}
          </svg>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 18 }}>
            {[["Zone servite", "in aggiornamento"], ["Percorso", "registrato"], ["Foto", "raccolte"]].map(([k, v]) => (
              <div key={k} style={{ background: "#122036", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#94A3B8", marginBottom: 4 }}>{k}</div>
                <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: "#E7ECF3" }}>{v}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .tracking-live-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
        }
      `}</style>
    </section>
  );
}
