import React from "react";
import Button from "../ui/Button.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const CO = "#E8571A";

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
    <section className="section" style={{ background: "#050a14", paddingTop: 120, paddingBottom: 120, paddingLeft: 28, paddingRight: 28, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 80, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: CO, marginBottom: 18 }}>
            Analisi territoriale precisa
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(36px, 3vw, 54px)", lineHeight: 1.05, color: "#f8fafc", letterSpacing: "-0.03em", margin: "0 0 22px" }}>
            Analisi zona<br />e mappa interattiva
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 17, lineHeight: 1.65, color: "rgba(255,255,255,.65)", margin: "0 0 42px", maxWidth: 460 }}>
            Prima della campagna analizziamo territorio, raggio, copertura e fabbisogno operativo.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {features.map((f, i) => (
              <div key={f.label} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <span style={{ width: 28, height: 28, borderRadius: 10, background: "rgba(232, 87, 26, 0.08)", border: "1px solid rgba(232, 87, 26, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: CO, flexShrink: 0, marginTop: 2 }}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 800, color: "#f8fafc", marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,.55)" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <Button variant="primary" className="vb" onClick={onConfigure} style={{ marginTop: 42, minHeight: 48, padding: "0 32px", borderRadius: 12, fontFamily: F.sans, fontSize: 14, fontWeight: 900, boxShadow: "0 12px 32px rgba(232, 87, 26, 0.2)" }}>
            Configura la tua zona
          </Button>
        </div>

        <div className="vc" style={{ borderRadius: 24, overflow: "hidden", background: "rgba(10, 22, 37, 0.4)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255, 255, 255, 0.05)", boxShadow: "0 32px 64px rgba(0,0,0,.25)" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,.05)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ padding: "5px 12px", borderRadius: 8, background: "rgba(232, 87, 26, 0.12)", border: "1px solid rgba(232, 87, 26, 0.2)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: CO }}>D2D</span>
            <span style={{ marginLeft: "auto", fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.45)" }}>Output generati dal configuratore</span>
          </div>
          <div style={{ padding: 24, display: "grid", gap: 12 }}>
            {outputs.map((label) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 20px", borderRadius: 14, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.04)" }}>
                <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: "#f8fafc" }}>{label}</span>
                <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: CO, textTransform: "uppercase", letterSpacing: ".06em" }}>Calcolato in Step 2</span>
              </div>
            ))}
          </div>
          <div style={{ margin: "0 24px 24px", padding: "16px 20px", borderRadius: 14, background: "rgba(232, 87, 26, 0.06)", border: "1px solid rgba(232, 87, 26, 0.15)", fontFamily: F.sans, fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,.7)" }}>
            I valori numerici compaiono solo dopo l'analisi reale della zona selezionata.
          </div>
        </div>
      </div>
    </section>
  );
}
