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
    <section className="section" style={{ background: "#0d1420", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: CO, marginBottom: 18 }}>
            Analisi territoriale precisa
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(36px, 3vw, 54px)", lineHeight: 1.08, color: "#f8fafc", letterSpacing: "-0.03em", margin: "0 0 22px" }}>
            Analisi zona<br />e mappa interattiva
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 17, lineHeight: 1.7, color: "rgba(226,232,240,.62)", margin: "0 0 38px", maxWidth: 460 }}>
            Prima della campagna analizziamo territorio, raggio, copertura e fabbisogno operativo.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {features.map((f, i) => (
              <div key={f.label} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: `${CO}18`, border: `1px solid ${CO}36`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: CO, flexShrink: 0, marginTop: 2 }}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 800, color: "#f8fafc", marginBottom: 3 }}>{f.label}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.55, color: "rgba(226,232,240,.52)" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <Button variant="primary" onClick={onConfigure} style={{ marginTop: 38, minHeight: 48, padding: "0 28px", borderRadius: 11, fontFamily: F.sans, fontSize: 14, fontWeight: 900, boxShadow: `0 12px 32px ${CO}40` }}>
            Configura la tua zona
          </Button>
        </div>

        <div style={{ borderRadius: 20, overflow: "hidden", background: "#0a1625", border: "1px solid rgba(148,163,184,.18)", boxShadow: "0 30px 80px rgba(0,0,0,.45)" }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ padding: "5px 12px", borderRadius: 7, background: `${CO}22`, border: `1px solid ${CO}`, fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: CO }}>D2D</span>
            <span style={{ marginLeft: "auto", fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.38)" }}>Output generati dal configuratore</span>
          </div>
          <div style={{ padding: 22, display: "grid", gap: 12 }}>
            {outputs.map((label) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.075)" }}>
                <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 850, color: "#f8fafc" }}>{label}</span>
                <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: CO, textTransform: "uppercase", letterSpacing: ".06em" }}>Calcolato in Step 2</span>
              </div>
            ))}
          </div>
          <div style={{ margin: "0 22px 22px", padding: "14px 16px", borderRadius: 12, background: "rgba(232,87,26,.08)", border: "1px solid rgba(232,87,26,.22)", fontFamily: F.sans, fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,.68)" }}>
            I valori numerici compaiono solo dopo l'analisi reale della zona selezionata.
          </div>
        </div>
      </div>
    </section>
  );
}
