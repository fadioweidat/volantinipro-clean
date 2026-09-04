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
        .dashboard-grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0,50%) minmax(0,50%); gap: 36px; align-items: center; }
        .dash-card-item { background: #122036; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; transition: border-color 0.2s; }
        .dash-card-item:hover { border-color: rgba(232, 87, 26, 0.35); }
        .dash-pdf-card { background: #131E33; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; transition: border-color 0.2s; }
        .dash-pdf-card:hover { border-color: rgba(232,87,26,0.4); }
        .dash-photo-box { flex: 1; border-radius: 8px; background: #131E33; border: 1px solid rgba(255,255,255,0.08); padding: 8px 9px; display: flex; flex-direction: column; gap: 3px; }
        @media (max-width: 900px) {
          .dashboard-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
      `}</style>
      <div className="dashboard-grid">
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 10 }}>
            Dashboard Cliente
          </div>
          <h2 id="dashboard-cliente-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: "clamp(28px, 3.2vw, 40px)", lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
            Dopo il preventivo controlli tutto da un'unica dashboard.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 14.5, lineHeight: 1.6, color: "#AEB9C9", margin: "12px 0 20px" }}>
            La campagna non finisce con la conferma: segui stato, distribuzione, prove e storico dal proprio account in totale autonomia.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {CARDS.map((card, idx) => (
              <motion.article
                key={card.title}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.18, delay: reduceMotion ? 0 : idx * 0.05 }}
                whileHover={reduceMotion ? undefined : { y: -2, borderColor: "rgba(232, 87, 26, 0.4)" }}
                className="dash-card-item"
              >
                <span style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 900, letterSpacing: ".08em", color: C_ORANGE }}>{card.tag}</span>
                <h3 style={{ fontFamily: F.serif, fontSize: 16, color: "#F8FAFC", margin: 0, letterSpacing: "-0.02em" }}>{card.title}</h3>
                <p style={{ fontFamily: F.sans, fontSize: 12, lineHeight: 1.45, color: "#AEB9C9", margin: 0 }}>{card.desc}</p>
              </motion.article>
            ))}
          </div>

          <div style={{ marginTop: 22 }}>
            <button
              onClick={() => onConfigure?.()}
              className="vb"
              style={{ padding: "11px 24px", borderRadius: 8, border: "none", background: C_ORANGE, color: "#fff", fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(232,87,26,0.28)" }}
            >
              Configura la tua campagna →
            </button>
          </div>
        </div>

        {/* Mockup Dashboard Cliente / Area Riservata */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          style={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "16px 18px", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}
        >
          {/* Header Account Cliente */}
          <div style={{ paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <div style={{ fontFamily: F.sans, fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", color: "#8E9AA8", textTransform: "uppercase" }}>
                Area Clienti › Campagna #VP-2026-8941
              </div>
              <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", color: "#4ADE80", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span>✓</span> Conclusa
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 800, color: "#F8FAFC" }}>
                Door to Door · Milano Nord
              </div>
              <div style={{ fontFamily: F.sans, fontSize: 10.5, color: "#94A3B8" }}>
                10.000 volantini · 12–15 Ottobre
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Mappa di copertura & settori serviti */}
            <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#080E1B", border: "1px solid rgba(255,255,255,0.06)" }}>
              <svg viewBox="0 0 360 120" width="100%" aria-hidden="true" style={{ display: "block", width: "100%", height: "auto" }}>
                <defs>
                  <pattern id="dashGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.75" />
                  </pattern>
                </defs>
                <rect width="360" height="120" fill="url(#dashGrid)" />

                {/* Reticolo strade urbane */}
                <g stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" fill="none">
                  <path d="M 10 30 L 350 30 M 10 65 L 350 65 M 10 95 L 350 95" />
                  <path d="M 60 5 L 60 115 M 130 5 L 130 115 M 210 5 L 210 115 M 290 5 L 290 115" />
                  <path d="M 40 110 L 160 15 M 140 115 L 310 10" stroke="rgba(255,255,255,0.035)" strokeWidth="0.7" />
                </g>

                {/* Poligoni copertura per settore */}
                <polygon points="20,105 45,22 170,12 310,32 340,105 80,115" fill="rgba(232,87,26,0.12)" stroke="rgba(232,87,26,0.45)" strokeWidth="1.4" />
                <polygon points="55,90 85,38 180,30 230,52 210,95 95,102" fill="rgba(34,197,94,0.14)" stroke="rgba(34,197,94,0.5)" strokeWidth="1.2" strokeDasharray="3 3" />
                <polygon points="185,45 285,40 315,92 225,95" fill="rgba(56,189,248,0.1)" stroke="rgba(56,189,248,0.4)" strokeWidth="1.1" />

                {/* Punti di controllo verificati */}
                {[[70,55],[115,75],[160,45],[205,70],[260,60],[300,75]].map(([cx,cy], i) => (
                  <circle key={i} cx={cx} cy={cy} r="3" fill="#22C55E" stroke="#080E1B" strokeWidth="1" />
                ))}

                {/* Label settori */}
                <text x="80" y="70" fill="#F8FAFC" fontSize="7" fontFamily={F.sans} fontWeight="800">AFFORI (98%)</text>
                <text x="165" y="80" fill="#F8FAFC" fontSize="7" fontFamily={F.sans} fontWeight="800">BOVISA (94%)</text>
                <text x="245" y="55" fill="#F8FAFC" fontSize="7" fontFamily={F.sans} fontWeight="800">DERGANO (95%)</text>
                <text x="28" y="42" fill="rgba(255,255,255,0.45)" fontSize="6" fontFamily={F.sans} fontWeight="700">CORMANO (92%)</text>
              </svg>

              <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(11,16,32,0.88)", backdropFilter: "blur(4px)", padding: "2px 7px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", fontFamily: F.sans, fontSize: 8.5, color: "#4ADE80", fontWeight: 700 }}>
                Copertura: 95.4% · 8.420 famiglie raggiunte
              </div>
              <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(11,16,32,0.88)", backdropFilter: "blur(4px)", padding: "2px 7px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", fontFamily: F.sans, fontSize: 8, color: "#8E9AA8" }}>
                4 settori · Verifica ISTAT & GIS
              </div>
            </div>

            {/* Documento Report PDF Scaricabile */}
            <div className="dash-pdf-card">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(232,87,26,0.12)", border: "1px solid rgba(232,87,26,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                  📄
                </div>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 800, color: "#F8FAFC" }}>Report_Campagna.pdf</div>
                  <div style={{ fontFamily: F.sans, fontSize: 9.5, color: "#8E9AA8", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>24 pagine</span>
                    <span>•</span>
                    <span>Mappe & Tracce GPS</span>
                    <span>•</span>
                    <span>3.8 MB</span>
                  </div>
                </div>
              </div>
              <span style={{ padding: "5px 10px", borderRadius: 6, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#F8FAFC", fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                Scarica PDF ↓
              </span>
            </div>

            {/* Foto geolocalizzate raccolte */}
            <div style={{ background: "#131E33", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                <div style={{ fontFamily: F.sans, fontSize: 9.5, fontWeight: 800, color: "#8E9AA8", textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Foto geolocalizzate (48 caricate)
                </div>
                <span style={{ fontFamily: F.sans, fontSize: 9, color: "#4ADE80", fontWeight: 700 }}>✓ Verificate GPS</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {[
                  { via: "Via P. Rossi 12", time: "09:44", zone: "Affori" },
                  { via: "P.zza Dergano 4", time: "11:15", zone: "Dergano" },
                  { via: "Via Astesani 28", time: "14:30", zone: "Bovisa" },
                ].map((item, i) => (
                  <div key={i} className="dash-photo-box">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 9.5 }}>📍</span>
                      <span style={{ fontFamily: F.sans, fontSize: 8, color: "#8E9AA8", fontVariantNumeric: "tabular-nums" }}>{item.time}</span>
                    </div>
                    <div style={{ fontFamily: F.sans, fontSize: 8.5, fontWeight: 800, color: "#F8FAFC", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.via}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 7.5, color: "#6B7A90" }}>{item.zone} · Civico verificato</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Metriche riassuntive account */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {[
                ["Volantini", "10.000"],
                ["Famiglie", "8.420"],
                ["Copertura", "95.4%"],
                ["Anomalie", "0"],
              ].map(([k, v]) => (
                <div key={k} style={{ background: "#10192A", borderRadius: 7, padding: "6px 8px", textAlign: "center", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontFamily: F.sans, fontSize: 7.5, fontWeight: 700, color: "#8E9AA8", textTransform: "uppercase" }}>{k}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: "#F8FAFC", marginTop: 1 }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 3, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontFamily: F.sans, fontSize: 9, color: "#546274" }}>Anteprima dimostrativa — dati d'esempio account cliente</span>
              <span style={{ fontFamily: F.sans, fontSize: 9, color: "#546274" }}>ID #VP-2026-8941</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
