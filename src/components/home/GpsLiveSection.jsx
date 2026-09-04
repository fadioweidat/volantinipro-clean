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

// Anteprima demo realistica del tracking operativo SaaS
const DEMO = {
  zone: "Zona 03 · Milano Bovisa - Dergano",
  sub: "Squadra Alpha · 2 operatori attivi",
  status: "In distribuzione",
  lastUpdate: "Aggiornato 4 min fa",
  progress: 68,
  flyersDelivered: "5.440 / 8.000 volantini",
  zonesServed: "5 / 8 zone",
  photos: 12,
  distance: "8.4 km",
  photoList: [
    { street: "Via Bovisasca 14", time: "09:42", note: "Civico 14 · Cassette interne" },
    { street: "P.zza Bausan 8", time: "10:15", note: "Civico 8 · Androne scala A" },
    { street: "Via Imbonati 32", time: "10:48", note: "Civico 32 · Blocco residenziale" },
    { street: "Via Dergano 19", time: "11:22", note: "Civico 19 · Complesso bifamiliare" },
  ],
  timeline: [
    { t: "09:12", label: "Percorso avviato · Squadra Alpha" },
    { t: "10:40", label: "Settore Bovisa completato (2.400 pz)" },
    { t: "11:05", label: "12 foto ricevute · Checkpoint OK" },
    { t: "11:38", label: "Avanzamento 68% · In transito Dergano" },
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
      style={{ background: "#0D1527", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <style>{`
        .gps-live-grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0,38%) minmax(0,62%); gap: 36px; align-items: center; }
        .gps-live-card-body { display: flex; flex-direction: column; gap: 10px; }
        .gps-stat-box { background: #131E33; border: 1px solid rgba(255,255,255,0.07); border-radius: 9px; padding: 8px 10px; transition: border-color 0.2s; }
        .gps-stat-box:hover { border-color: rgba(232,87,26,0.3); }
        .gps-photo-thumb { flex: 1; border-radius: 7px; background: #131E33; border: 1px solid rgba(255,255,255,0.08); padding: 7px; display: flex; flex-direction: column; gap: 3px; position: relative; overflow: hidden; }
        .gps-photo-thumb::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: rgba(232,87,26,0.6); }
        @media (max-width: 900px) {
          .gps-live-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
      `}</style>
      <div className="gps-live-grid">
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 10 }}>
            GPS live
          </div>
          <h2 id="gps-live-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: "clamp(28px, 3.2vw, 40px)", lineHeight: 1.08, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
            Segui la distribuzione mentre avviene.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 14.5, lineHeight: 1.6, color: "#AEB9C9", margin: "12px 0 18px" }}>
            Gli operatori registrano il percorso GPS durante la consegna. Tu vedi avanzamento, zone servite e prove raccolte sul campo in tempo reale.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "grid", gap: 9 }}>
            {POINTS.map((p) => (
              <li key={p} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontFamily: F.sans, fontSize: 13, lineHeight: 1.45, color: "#D2DAE6" }}>
                <span style={{ flexShrink: 0, marginTop: 1, width: 17, height: 17, borderRadius: "50%", background: "rgba(232,87,26,0.15)", border: "1px solid rgba(232,87,26,0.4)", color: C_ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 900 }}>✓</span>
                {p}
              </li>
            ))}
          </ul>
          <button
            onClick={() => onConfigure?.()}
            className="vb"
            style={{ padding: "11px 24px", borderRadius: 8, border: "none", background: C_ORANGE, color: "#fff", fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(232,87,26,0.28)" }}
          >
            Configura la tua campagna →
          </button>
        </div>

        {/* Mockup Dashboard GPS Live */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          style={{ background: "#0B1020", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "16px 18px", boxShadow: "0 20px 50px rgba(0,0,0,0.45)" }}
        >
          {/* Header Mockup */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: C_ORANGE }} />
                <span style={{ fontFamily: F.sans, fontSize: 12.5, fontWeight: 800, color: "#F8FAFC", letterSpacing: "-0.01em" }}>{DEMO.zone}</span>
              </div>
              <div style={{ fontFamily: F.sans, fontSize: 10, color: "#8E9AA8", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                <span>{DEMO.lastUpdate}</span>
                <span>•</span>
                <span>{DEMO.sub}</span>
              </div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "#4ADE80" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
              {DEMO.status}
            </span>
          </div>

          <div className="gps-live-card-body">
            {/* Mappa tecnica operativa: canvas vettoriale realistico */}
            <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#080E1B", border: "1px solid rgba(255,255,255,0.06)" }}>
              <svg viewBox="0 0 380 170" width="100%" aria-hidden="true" style={{ display: "block", width: "100%", height: "auto" }}>
                <defs>
                  <pattern id="gpsTechnicalGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="0.75" />
                  </pattern>
                  <linearGradient id="polyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(232,87,26,0.14)" />
                    <stop offset="100%" stopColor="rgba(232,87,26,0.03)" />
                  </linearGradient>
                </defs>
                {/* Griglia tecnica */}
                <rect width="380" height="170" fill="url(#gpsTechnicalGrid)" />

                {/* Blocchi urbani / Rete stradale realistica Bovisa - Dergano */}
                <g stroke="rgba(255,255,255,0.06)" strokeWidth="0.9" fill="none">
                  <path d="M 10 38 L 370 38 M 10 85 L 370 85 M 10 132 L 370 132" />
                  <path d="M 70 10 L 70 160 M 150 10 L 150 160 M 230 10 L 230 160 M 310 10 L 310 160" />
                  {/* Diagonali di collegamento */}
                  <path d="M 30 150 L 180 30 M 140 160 L 330 20" stroke="rgba(255,255,255,0.04)" strokeWidth="0.8" />
                </g>
                <g fill="rgba(255,255,255,0.02)">
                  <rect x="20" y="44" width="42" height="32" rx="3" />
                  <rect x="80" y="44" width="60" height="32" rx="3" />
                  <rect x="160" y="44" width="60" height="32" rx="3" />
                  <rect x="240" y="44" width="60" height="32" rx="3" />
                  <rect x="320" y="44" width="45" height="32" rx="3" />
                  <rect x="20" y="92" width="42" height="32" rx="3" />
                  <rect x="80" y="92" width="60" height="32" rx="3" />
                  <rect x="160" y="92" width="60" height="32" rx="3" />
                  <rect x="240" y="92" width="60" height="32" rx="3" />
                  <rect x="320" y="92" width="45" height="32" rx="3" />
                </g>

                {/* Etichette toponomastica reale */}
                <text x="75" y="32" fill="rgba(255,255,255,0.28)" fontSize="6.5" fontFamily={F.sans} fontWeight="700">VIA BOVISASCA</text>
                <text x="155" y="32" fill="rgba(255,255,255,0.28)" fontSize="6.5" fontFamily={F.sans} fontWeight="700">VIA IMBONATI</text>
                <text x="245" y="32" fill="rgba(255,255,255,0.28)" fontSize="6.5" fontFamily={F.sans} fontWeight="700">P.ZZA BAUSAN</text>
                <text x="315" y="80" fill="rgba(255,255,255,0.22)" fontSize="6" fontFamily={F.sans} fontWeight="600">V.LE BODIO</text>
                <text x="90" y="145" fill="rgba(255,255,255,0.22)" fontSize="6" fontFamily={F.sans} fontWeight="600">VIA DERGANO</text>

                {/* Area di campagna (poligono assegnato) */}
                <polygon
                  points="25,138 50,40 195,26 325,44 355,138 105,156"
                  fill="url(#polyGrad)"
                  stroke="rgba(232,87,26,0.45)"
                  strokeWidth="1.4"
                  strokeDasharray="4 2"
                />

                {/* Percorso GPS registrato */}
                <motion.path
                  d="M 45 140 L 90 118 L 120 128 L 150 82 L 200 92 L 245 50 L 292 66"
                  fill="none"
                  stroke={C_ORANGE}
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  variants={pathVariants}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                />

                {/* Waypoints GPS intermedi */}
                {[[45,140, "WP1"], [120,128, "WP2"], [200,92, "WP3"], [245,50, "WP4"]].map(([cx, cy, label], i) => (
                  <g key={i}>
                    <circle cx={cx} cy={cy} r="4" fill="#0B1020" stroke={C_ORANGE} strokeWidth="1.8" />
                    <text x={cx + 5} y={cy + 3} fill="rgba(255,255,255,0.5)" fontSize="5.5" fontFamily={F.sans} fontWeight="700">{label}</text>
                  </g>
                ))}

                {/* Marker operatore live con anello radar pulsante */}
                <motion.g
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.8 }}
                >
                  <circle cx="292" cy="66" r="13" fill="rgba(232,87,26,0.18)" />
                  <circle cx="292" cy="66" r="7.5" fill="rgba(232,87,26,0.35)" />
                  <circle cx="292" cy="66" r="4.5" fill={C_ORANGE} stroke="#FFFFFF" strokeWidth="1.5" />
                  {/* Tooltip operatore */}
                  <rect x="244" y="45" width="94" height="14" rx="3" fill="rgba(11,16,32,0.92)" stroke="rgba(232,87,26,0.4)" strokeWidth="0.8" />
                  <text x="250" y="54.5" fill="#FFFFFF" fontSize="6.2" fontFamily={F.sans} fontWeight="800">OP-01 • SQUADRA ALPHA (LIVE)</text>
                </motion.g>
              </svg>

              {/* HUD overlay angoli */}
              <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(11,16,32,0.88)", backdropFilter: "blur(4px)", padding: "2px 7px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", fontFamily: F.sans, fontSize: 8.5, color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>
                Zona Assegnata: Bovisa-Dergano · 1.4 km²
              </div>
              <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(11,16,32,0.88)", backdropFilter: "blur(4px)", padding: "2px 7px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", fontFamily: F.sans, fontSize: 8, color: "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>
                45.5032° N, 9.1724° E · Precisione ±2.5m
              </div>
            </div>

            {/* Barra avanzamento & metriche di avanzamento */}
            <div style={{ background: "#10192A", borderRadius: 9, padding: "9px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "#8E9AA8", textTransform: "uppercase", letterSpacing: ".06em" }}>Avanzamento</span>
                  <span style={{ fontFamily: F.sans, fontSize: 10, color: "#6B7A90" }}>({DEMO.flyersDelivered})</span>
                </div>
                <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 900, color: C_ORANGE, fontVariantNumeric: "tabular-nums" }}>{DEMO.progress}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <motion.div
                  initial={reduceMotion ? false : { width: 0 }}
                  whileInView={{ width: `${DEMO.progress}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: reduceMotion ? 0 : 0.7, ease: "easeOut" }}
                  style={{ height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${C_ORANGE}, #FF8C5A)` }}
                />
              </div>
            </div>

            {/* KPI Cards secondarie allineate */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
              <div className="gps-stat-box">
                <div style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#8E9AA8", marginBottom: 2 }}>Zone servite</div>
                <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: "#F8FAFC" }}>{DEMO.zonesServed}</div>
              </div>
              <div className="gps-stat-box">
                <div style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#8E9AA8", marginBottom: 2 }}>Foto ricevute</div>
                <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: "#4ADE80" }}>{DEMO.photos} prove</div>
              </div>
              <div className="gps-stat-box">
                <div style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#8E9AA8", marginBottom: 2 }}>Percorso</div>
                <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: "#F8FAFC" }}>{DEMO.distance}</div>
              </div>
            </div>

            {/* Thumbnails prove fotografiche geolocalizzate */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 800, color: "#8E9AA8", textTransform: "uppercase", letterSpacing: ".06em" }}>Prove fotografiche sul campo</span>
                <span style={{ fontFamily: F.sans, fontSize: 9, color: "#4ADE80", fontWeight: 700 }}>✓ Coordinate verificate</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {DEMO.photoList.map((item, idx) => (
                  <div key={idx} className="gps-photo-thumb">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 9 }}>📍</span>
                      <span style={{ fontFamily: F.sans, fontSize: 8, color: "#8E9AA8", fontVariantNumeric: "tabular-nums" }}>{item.time}</span>
                    </div>
                    <div style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, color: "#F8FAFC", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.street}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 7.5, color: "#6B7A90", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.note}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini timeline operativa (log eventi) */}
            <div style={{ background: "#10192A", borderRadius: 9, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.06)", display: "grid", gap: 5 }}>
              <div style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, color: "#8E9AA8", textTransform: "uppercase", letterSpacing: ".05em" }}>Timeline attività</div>
              {DEMO.timeline.map((e, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: F.sans, fontSize: 10.5, color: "#CBD5E1" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "#6B7A90", fontSize: 9.5, fontWeight: 700, flexShrink: 0, width: 32 }}>{e.t}</span>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: idx === DEMO.timeline.length - 1 ? "#22C55E" : C_ORANGE, flexShrink: 0 }} />
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.label}</span>
                </div>
              ))}
            </div>

            {/* Footer label */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 3, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontFamily: F.sans, fontSize: 9, color: "#546274" }}>Anteprima dimostrativa — dati d'esempio</span>
              <span style={{ fontFamily: F.sans, fontSize: 9, color: "#546274" }}>VolantiniPro Dispatch v2.6</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
