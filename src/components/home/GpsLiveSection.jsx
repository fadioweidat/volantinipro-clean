import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const POINTS = [
  "Percorso GPS registrato durante la consegna",
  "Avanzamento zona per zona in tempo reale",
  "Prove fotografiche geolocalizzate",
  "Storico della distribuzione consultabile",
];

// Anteprima demo statica (nessun dato reale, nessuna chiamata di rete):
// mostra la forma dell'UI GPS reale — mappa/zona, percorso, marker
// operatore, stato, avanzamento, foto, timeline — non un grafico a linea.
const DEMO = {
  zone: "Zona Nord · Milano",
  status: "In distribuzione",
  lastUpdate: "Aggiornato 4 min fa",
  progress: 68,
  zonesServed: "5 / 8 zone",
  photos: 12,
  timeline: [
    { t: "09:12", label: "Percorso avviato" },
    { t: "10:40", label: "Zona 3 completata" },
    { t: "11:05", label: "3 foto caricate" },
  ],
};

export default function GpsLiveSection({ onConfigure }) {
  const reduceMotion = useReducedMotion();
  const pathVariants = {
    hidden: { pathLength: 0, opacity: reduceMotion ? 1 : 0 },
    show: { pathLength: 1, opacity: 1, transition: { duration: reduceMotion ? 0 : 1.1, ease: "easeInOut" } },
  };

  return (
    <section
      id="gps-live"
      className="section-tight gps-live-section"
      aria-labelledby="gps-live-title"
      style={{ background: "#111827", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <style>{`
        .gps-live-grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0,38%) minmax(0,62%); gap: 48px; align-items: center; }
        @media (max-width: 900px) { .gps-live-grid { grid-template-columns: 1fr !important; gap: 28px !important; } }
      `}</style>
      <div className="gps-live-grid">
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 12 }}>
            GPS live
          </div>
          <h2 id="gps-live-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: "clamp(30px, 3.4vw, 42px)", lineHeight: 1.08, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
            Segui la distribuzione mentre avviene.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 15, lineHeight: 1.6, color: "#AEB9C9", margin: "14px 0 20px" }}>
            Gli operatori registrano il percorso GPS durante la consegna. Tu vedi avanzamento, zone servite e prove raccolte sul campo.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 22px", display: "grid", gap: 10 }}>
            {POINTS.map((p) => (
              <li key={p} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.45, color: "#D2DAE6" }}>
                <span style={{ flexShrink: 0, marginTop: 1, width: 17, height: 17, borderRadius: "50%", background: "rgba(232,87,26,0.15)", border: "1px solid rgba(232,87,26,0.4)", color: C_ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900 }}>✓</span>
                {p}
              </li>
            ))}
          </ul>
          <button
            onClick={() => onConfigure?.()}
            className="vb"
            style={{ padding: "12px 26px", borderRadius: 8, border: "none", background: C_ORANGE, color: "#fff", fontFamily: F.sans, fontSize: 13.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(232,87,26,0.28)" }}
          >
            Configura la tua campagna →
          </button>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          style={{ background: "#0B1020", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 20, boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: F.sans, fontSize: 12.5, fontWeight: 800, color: "#F8FAFC" }}>{DEMO.zone}</div>
              <div style={{ fontFamily: F.sans, fontSize: 10.5, color: "#8892A0", marginTop: 2 }}>{DEMO.lastUpdate}</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 20, background: "rgba(46,204,138,.12)", border: "1px solid rgba(46,204,138,.35)", fontFamily: F.sans, fontSize: 10.5, fontWeight: 800, color: "#7FE3B4" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2ECC8A" }} /> {DEMO.status}
            </span>
          </div>

          {/* mappa/zona demo: poligono campagna + percorso + marker operatore */}
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "linear-gradient(160deg,#0d1a30 0%,#0a1424 100%)" }}>
            <svg viewBox="0 0 340 190" width="100%" aria-hidden="true" style={{ display: "block", width: "100%", height: "auto" }}>
              <defs>
                <pattern id="gpsGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="340" height="190" fill="url(#gpsGrid)" />
              {/* area campagna */}
              <polygon points="30,150 55,55 190,30 300,60 280,160 90,175" fill="rgba(232,87,26,0.08)" stroke="rgba(232,87,26,0.35)" strokeWidth="1.5" />
              {/* percorso GPS registrato */}
              <motion.path
                d="M45 140 L90 118 L120 128 L150 82 L200 92 L245 50 L292 66"
                fill="none" stroke={C_ORANGE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                variants={pathVariants} initial="hidden" whileInView="show" viewport={{ once: true }}
              />
              {[[45,140],[120,128],[200,92],[292,66]].map(([cx,cy], i) => (
                <circle key={i} cx={cx} cy={cy} r="4.5" fill="#0B1020" stroke={C_ORANGE} strokeWidth="2.2" />
              ))}
              {/* marker operatore corrente */}
              <motion.g
                initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.9 }}
              >
                <circle cx="292" cy="66" r="9" fill="rgba(232,87,26,0.22)" />
                <circle cx="292" cy="66" r="5" fill={C_ORANGE} stroke="#0B1020" strokeWidth="1.5" />
              </motion.g>
            </svg>
          </div>

          {/* stato / avanzamento */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".05em" }}>Avanzamento</span>
              <span style={{ fontFamily: F.sans, fontSize: 12.5, fontWeight: 900, color: "#F8FAFC" }}>{DEMO.progress}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <motion.div
                initial={reduceMotion ? false : { width: 0 }}
                whileInView={{ width: `${DEMO.progress}%` }}
                viewport={{ once: true }}
                transition={{ duration: reduceMotion ? 0 : 0.7, ease: "easeOut" }}
                style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${C_ORANGE}, #FBA36B)` }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
            {[["Zone servite", DEMO.zonesServed], ["Foto ricevute", `${DEMO.photos}`], ["Percorso", "registrato"]].map(([k, v]) => (
              <div key={k} style={{ background: "#122036", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 10px" }}>
                <div style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#8892A0", marginBottom: 3 }}>{k}</div>
                <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: "#E7ECF3" }}>{v}</div>
              </div>
            ))}
          </div>

          {/* foto ricevute / prove */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ flex: 1, aspectRatio: "1/1", borderRadius: 8, background: "#182235", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: "#5B6472" }}>
                📍
              </div>
            ))}
          </div>

          {/* mini timeline */}
          <div style={{ marginTop: 14, display: "grid", gap: 7 }}>
            {DEMO.timeline.map((e) => (
              <div key={e.t} style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: F.sans, fontSize: 11.5, color: "#B7C0CC" }}>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "#6B7686", flexShrink: 0, width: 38 }}>{e.t}</span>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: C_ORANGE, flexShrink: 0 }} />
                {e.label}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, fontFamily: F.sans, fontSize: 10, color: "#5B6472" }}>Anteprima dimostrativa — dati d'esempio</div>
        </motion.div>
      </div>
    </section>
  );
}
