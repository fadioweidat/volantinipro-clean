import React from "react";
import { motion } from "framer-motion";
import Button from "../ui/Button.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const features = [
  { label: "Famiglie ISTAT", desc: "Nuclei familiari disponibili nell'area dalla lettura territoriale." },
  { label: "Comuni nel raggio", desc: "Elenco dei comuni coinvolti dalla zona configurata e dal raggio scelto." },
  { label: "Copertura stimata", desc: "Percentuale di copertura prevista rispetto alla quantità inserita." },
  { label: "Volantini consigliati", desc: "Fabbisogno operativo calcolato prima del preventivo." },
];

const outputs = [
  "Famiglie ISTAT",
  "Comuni nel raggio",
  "Copertura stimata",
  "Volantini consigliati",
];

export default function FeatureZonaMappa({ onConfigure }) {
  return (
    <section className="section" style={{ background: "#0B1020", paddingTop: 100, paddingBottom: 100, paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 64, alignItems: "center" }}>
        <motion.div initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.22 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 16 }}>
            Analisi territoriale precisa
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(36px, 3vw, 54px)", lineHeight: 1.05, color: "#F8FAFC", letterSpacing: "-0.03em", margin: "0 0 20px" }}>
            Analisi zona<br />e mappa interattiva
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "#94A3B8", margin: "0 0 36px", maxWidth: 460 }}>
            Prima della campagna analizziamo territorio, raggio, copertura e fabbisogno operativo.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {features.map((f, i) => (
              <div key={f.label} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(232, 87, 26, 0.12)", border: "1px solid rgba(232, 87, 26, 0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: C_ORANGE, flexShrink: 0, marginTop: 2 }}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 800, color: "#F8FAFC", marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.6, color: "#94A3B8" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 36 }}>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15 }} style={{ display: "inline-block" }}>
              <Button variant="secondary" onClick={onConfigure} style={{ minHeight: 48, padding: "0 24px", borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(255, 255, 255, 0.04)", color: "#F8FAFC", fontFamily: F.sans, fontSize: 14, fontWeight: 700 }}>
                Configura la tua campagna
              </Button>
            </motion.div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.22 }} className="vc" style={{ borderRadius: 20, overflow: "hidden", background: "#122036", border: "1px solid rgba(255, 255, 255, 0.08)", boxShadow: "0 16px 32px rgba(0,0,0,0.25)" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ padding: "5px 12px", borderRadius: 8, background: "rgba(232, 87, 26, 0.15)", border: "1px solid rgba(232, 87, 26, 0.35)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C_ORANGE }}>D2D</span>
            <span style={{ marginLeft: "auto", fontFamily: F.sans, fontSize: 11, color: "#94A3B8" }}>Output generati dal configuratore</span>
          </div>
          <div style={{ padding: 24, display: "grid", gap: 12 }}>
            {outputs.map((label) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: "#F8FAFC" }}>{label}</span>
                <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C_ORANGE, textTransform: "uppercase", letterSpacing: ".06em" }}>Calcolato in Step 2</span>
              </div>
            ))}
          </div>
          <div style={{ margin: "0 24px 24px", padding: "14px 18px", borderRadius: 12, background: "rgba(232, 87, 26, 0.08)", border: "1px solid rgba(232, 87, 26, 0.2)", fontFamily: F.sans, fontSize: 12, lineHeight: 1.6, color: "rgba(248, 250, 252, 0.85)" }}>
            I valori numerici compaiono solo dopo l'analisi reale della zona selezionata.
          </div>
        </motion.div>
      </div>
    </section>
  );
}
