import React from "react";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const CO = "#E8571A";

const features = [
  { label: "Raggio di distribuzione", desc: "Imposta il raggio in km e visualizza subito i comuni coinvolti." },
  { label: "Famiglie e popolazione", desc: "Dati ISTAT ufficiali: famiglie stimate, popolazione, densità residenziale." },
  { label: "Copertura zona", desc: "Percentuale di copertura stimata per ogni comune nel raggio selezionato." },
  { label: "Volantini consigliati", desc: "Quantità ottimale calcolata automaticamente in base all'area e ai dati." },
];

export default function FeatureZonaMappa({ onConfigure }) {
  return (
    <section style={{ background: "#0d1420", padding: "96px 28px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>
        {/* Left: text */}
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: CO, marginBottom: 18 }}>
            Step 02 — Zona & Mappa
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(36px, 3vw, 54px)", lineHeight: 1.08, color: "#f8fafc", letterSpacing: "-0.03em", margin: "0 0 22px" }}>
            Analisi zona<br />e mappa interattiva
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 17, lineHeight: 1.7, color: "rgba(226,232,240,.62)", margin: "0 0 38px", maxWidth: 440 }}>
            Cerca il comune, imposta il raggio e ottieni subito un'analisi territoriale completa con dati ISTAT reali, copertura e output operativo.
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
          <button onClick={onConfigure} style={{ marginTop: 38, padding: "14px 28px", borderRadius: 11, border: "none", background: CO, color: "#fff", fontFamily: F.sans, fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: `0 12px 32px ${CO}40` }}>
            Configura la tua zona →
          </button>
        </div>
        {/* Right: mini map UI mock */}
        <div style={{ borderRadius: 20, overflow: "hidden", background: "#0a1625", border: "1px solid rgba(148,163,184,.18)", boxShadow: "0 30px 80px rgba(0,0,0,.45)" }}>
          {/* toolbar */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", gap: 10 }}>
            {[{l:"D2D",c:CO},{l:"H2H",c:"#60a5fa"},{l:"B2B",c:"#a78bfa"}].map(t => (
              <span key={t.l} style={{ padding: "5px 12px", borderRadius: 7, background: t.l==="D2D"?`${t.c}22`:"transparent", border: `1px solid ${t.l==="D2D"?t.c:"rgba(255,255,255,.1)"}`, fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: t.l==="D2D"?t.c:"rgba(255,255,255,.4)" }}>{t.l}</span>
            ))}
            <span style={{ marginLeft: "auto", fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.32)" }}>Raggio: 3 km</span>
          </div>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0 }}>
            {[{v:"25.720",l:"Famiglie",c:CO},{v:"87%",l:"Copertura",c:"#2ecc8a"},{v:"3",l:"Comuni",c:"#60a5fa"}].map((k,i) => (
              <div key={k.l} style={{ padding: "16px 18px", borderRight: i<2?"1px solid rgba(255,255,255,.06)":"none", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <div style={{ fontFamily: F.sans, fontSize: 22, fontWeight: 900, color: k.c, letterSpacing: "-0.03em" }}>{k.v}</div>
                <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.38)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>{k.l}</div>
              </div>
            ))}
          </div>
          {/* zone rows */}
          <div style={{ padding: "18px 18px 22px" }}>
            <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.34)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>Comuni nel raggio</div>
            {[{n:"Bresso",f:"11.200",c:"87%",col:CO},{n:"Cusano Milanino",f:"7.600",c:"78%",col:"#60a5fa"},{n:"Cinisello Balsamo",f:"6.920",c:"65%",col:"#2ecc8a"}].map(z => (
              <div key={z.n} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: z.col, boxShadow: `0 0 8px ${z.col}` }} />
                  <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: "#f8fafc" }}>{z.n}</span>
                  <span style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.34)" }}>{z.f} fam.</span>
                </div>
                <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 900, color: z.col }}>{z.c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
