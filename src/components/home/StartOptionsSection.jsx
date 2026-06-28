import React, { useState } from "react";
import Button from "../ui/Button.jsx";

const C = {
  navy: "#0B1020",
  navyDeep: "#08111f",
  primary: "#6366F1",
  cyan: "#06B6D4",
  success: "#22C55E",
  white: "#F8FAFC",
  muted: "rgba(203, 213, 225, 0.75)",
  border: "rgba(148, 163, 184, 0.15)",
};

const F = {
  sans: "'DM Sans', Inter, system-ui, sans-serif",
  serif: "'DM Serif Display', Georgia, serif",
};

function MiniMapPreview() {
  return (
    <div style={{ position: "relative", height: 180, borderRadius: 12, overflow: "hidden", background: "#08111f", border: `1px solid ${C.border}`, marginBottom: 20 }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
      <svg width="100%" height="100%" viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
        <polygon points="120,40 160,30 220,50 240,90 200,140 140,120 100,80" fill="rgba(99,102,241,0.12)" stroke="rgba(99,102,241,0.45)" strokeWidth="1.5" />
        <polygon points="220,50 280,40 320,80 300,130 240,150 200,140 240,90" fill="rgba(6,182,212,0.10)" stroke="rgba(6,182,212,0.4)" strokeWidth="1.5" />
        <circle cx="210" cy="90" r="70" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 4" />
        <circle cx="210" cy="90" r="4" fill="#22c55e" />
        <circle cx="160" cy="80" r="2" fill="#fff" opacity="0.5" />
        <circle cx="180" cy="110" r="2" fill="#fff" opacity="0.5" />
        <circle cx="250" cy="70" r="2" fill="#fff" opacity="0.5" />
        <circle cx="270" cy="100" r="2" fill="#fff" opacity="0.5" />
      </svg>
      <div style={{ position: "absolute", bottom: 10, left: 10, display: "flex", gap: 8 }}>
        <div style={{ background: "rgba(10,21,39,0.85)", backdropFilter: "blur(4px)", padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 10, color: "#f8fafc", fontWeight: 700 }}>
          <span style={{ color: C.primary, marginRight: 4 }}>●</span> 12.4k Famiglie
        </div>
        <div style={{ background: "rgba(10,21,39,0.85)", backdropFilter: "blur(4px)", padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 10, color: "#f8fafc", fontWeight: 700 }}>
          <span style={{ color: C.cyan, marginRight: 4 }}>●</span> 84% Copertura
        </div>
      </div>
    </div>
  );
}

export default function StartOptionsSection({ onStart }) {
  const [u, h] = useState({ city: "Milano", qty: "10000", service: "Door to Door" });
  const baseEstimate = Math.max(180, Math.round((Number(u.qty) || 0) * (u.service === "Door to Door" ? 0.13 : u.service === "Hand to Hand" ? 0.18 : 0.22)));
  const estimateRange = { min: Math.max(180, Math.round(baseEstimate * 0.86)), max: Math.round(baseEstimate * 1.18) };

  return (
    <section className="section" style={{ background: C.navyDeep, paddingLeft: 28, paddingRight: 28, borderTop: `1px solid ${C.border}`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: "20%", width: 600, height: 600, background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 0, right: "10%", width: 500, height: 500, background: "radial-gradient(circle, rgba(6,182,212,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, letterSpacing: "0.15em", textTransform: "uppercase", color: C.cyan, marginBottom: 12 }}>
            Piattaforma Operativa
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(36px, 4vw, 48px)", color: C.white, letterSpacing: "-1.5px", marginBottom: 16, lineHeight: 1.1 }}>
            Scegli il tuo punto di partenza.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 17, color: C.muted, maxWidth: 660, lineHeight: 1.65 }}>
            Configurazione completa con analisi GIS, stima rapida per la tua zona o supporto strategico diretto.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "stretch" }}>
          {/* Main campaign card */}
          <div className="vc" style={{ gridColumn: "1 / -1" }}>
            <div style={{ borderRadius: 20, padding: "36px 32px", background: "linear-gradient(145deg, rgba(16,28,50,0.8), rgba(10,20,38,0.9))", border: `1px solid ${C.border}`, boxShadow: "0 24px 50px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", height: "100%", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.primary}, transparent)` }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                <div>
                  <h3 style={{ fontFamily: F.serif, fontSize: 32, color: C.white, letterSpacing: "-0.5px", marginBottom: 12 }}>Configura campagna</h3>
                  <p style={{ fontFamily: F.sans, fontSize: 15, color: C.muted, lineHeight: 1.6, maxWidth: 400 }}>
                    Percorso completo in 4 step con analisi territoriale GIS, Smart Pairing e AI Optimizer per massimizzare la copertura.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1, 2, 3, 4].map(step => (
                    <div key={step} style={{ width: 8, height: 8, borderRadius: "50%", background: step === 1 ? C.primary : "rgba(255,255,255,0.1)" }} />
                  ))}
                </div>
              </div>

              <MiniMapPreview />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
                {["Dati ISTAT integrati", "AI Optimizer", "Smart Pairing zone", "Report operativo"].map(feature => (
                  <div key={feature} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: F.sans, fontSize: 13, color: "rgba(248,250,252,0.85)" }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: C.primary }}>✓</div>
                    {feature}
                  </div>
                ))}
              </div>

              <Button variant="primary" onClick={() => onStart("step1")} className="vb" style={{ marginTop: "auto", width: "100%", minHeight: 52, padding: "0 16px", borderRadius: 12, fontFamily: F.sans, fontSize: 16, fontWeight: 800, boxShadow: "0 12px 28px rgba(99,102,241,0.25)" }}>
                Configura la tua campagna
              </Button>
            </div>
          </div>

          {/* Right stack */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24, gridColumn: "span 1" }}>
            {/* Quick estimate card */}
            <div className="vc" style={{ borderRadius: 16, padding: "28px 24px", background: "linear-gradient(145deg, rgba(16,28,50,0.6), rgba(10,20,38,0.8))", border: `1px solid ${C.border}`, boxShadow: "0 12px 30px rgba(0,0,0,0.3)", flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.cyan}, transparent)` }} />
              <h3 style={{ fontFamily: F.serif, fontSize: 24, color: C.white, letterSpacing: "-0.5px", marginBottom: 8 }}>Stima rapida</h3>
              <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 20 }}>
                Range indicativo per comune, servizio e quantità.
              </p>

              <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
                <input value={u.city} onChange={e => h({...u, city: e.target.value})} placeholder="Comune" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)", color: C.white, fontFamily: F.sans, fontSize: 13, boxSizing: "border-box" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <select value={u.service} onChange={e => h({...u, service: e.target.value})} style={{ width: "100%", padding: "12px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)", color: C.white, fontFamily: F.sans, fontSize: 13, boxSizing: "border-box", appearance: "none" }}>
                    <option>Door to Door</option>
                    <option>Hand to Hand</option>
                    <option>Business</option>
                  </select>
                  <input value={u.qty} onChange={e => h({...u, qty: e.target.value.replace(/\D/g,"")})} placeholder="Q.tà" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.2)", color: C.white, fontFamily: F.sans, fontSize: 13, boxSizing: "border-box" }} />
                </div>
              </div>

              <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.22)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
                <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,0.54)" }}>Stima zona</span>
                <strong style={{ fontFamily: F.serif, fontSize: 28, lineHeight: 1, fontWeight: 900, color: C.primary, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>€{estimateRange.min.toLocaleString("it-IT")} - €{estimateRange.max.toLocaleString("it-IT")}</strong>
              </div>

              <Button variant="secondary" onClick={() => onStart("quick")} className="vb" style={{ marginTop: "auto", width: "100%", minHeight: 48, padding: "0 14px", borderRadius: 10, fontFamily: F.sans, fontSize: 14, fontWeight: 700 }}>
                Preventivo rapido
              </Button>
            </div>

            {/* Consultant card */}
            <div className="vc" style={{ borderRadius: 16, padding: "28px 24px", background: "linear-gradient(145deg, rgba(16,28,50,0.6), rgba(10,20,38,0.8))", border: `1px solid ${C.border}`, boxShadow: "0 12px 30px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.success}, transparent)` }} />
              <h3 style={{ fontFamily: F.serif, fontSize: 24, color: C.white, letterSpacing: "-0.5px", marginBottom: 8 }}>Consulenza strategica</h3>
              <p style={{ fontFamily: F.sans, fontSize: 13, color: C.muted, marginBottom: 20 }}>
                Per campagne complesse o multi-zona. Un esperto configura il GIS con te.
              </p>

              <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
                {["Supporto multi-zona", "Grandi volumi", "Brief operativo gratuito"].map(feature => (
                  <div key={feature} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: F.sans, fontSize: 13, color: "rgba(248,250,252,0.85)" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.success }} />
                    {feature}
                  </div>
                ))}
              </div>

              <Button variant="ghost" onClick={() => onStart("consultant")} className="vb" style={{ marginTop: "auto", width: "100%", minHeight: 48, padding: "0 14px", borderRadius: 10, color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 700 }}>
                Parla con un consulente
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
