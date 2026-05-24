import React from "react";
import Button from "../ui/Button.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const CO = "#E8571A";
const CG = "#E8571A";
const CB = "#E8571A";

const features = [
  { label: "Calendario operativo", desc: "Date disponibili in tempo reale basate sulla capacita operativa dell'area." },
  { label: "Smart Pairing automatico", desc: "Abbinamenti attivi nella stessa zona: risparmia sui costi, massimizza l'impatto." },
  { label: "Slot ottimizzati", desc: "Il sistema suggerisce le finestre con maggior efficienza di copertura." },
  { label: "Calcolo costo finale", desc: "Ogni slot include il prezzo aggiornato con sconti Smart Pairing se applicabili." },
];

const calendarDays = [
  { d: "L", day: 16, state: "past" },
  { d: "M", day: 17, state: "past" },
  { d: "M", day: 18, state: "available" },
  { d: "G", day: 19, state: "pairing" },
  { d: "V", day: 20, state: "pairing" },
  { d: "S", day: 21, state: "busy" },
  { d: "D", day: 22, state: "off" },
];

const stateStyle = {
  past:      { bg: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.22)", border: "1px solid transparent" },
  available: { bg: `${CO}22`, color: CO, border: `1px solid ${CO}55` },
  pairing:   { bg: `${CG}18`, color: CG, border: `1px solid ${CG}44` },
  busy:      { bg: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.08)", line: true },
  off:       { bg: "transparent", color: "rgba(255,255,255,.12)", border: "1px solid transparent" },
};

export default function FeatureSmartPairing({ onConfigure }) {
  return (
    <section className="section" style={{ background: "#1A1A1A", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box" }}>
      <div className="smart-pairing-layout" style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>
        {/* Left: mockup */}
        <div>
          <h2 style={{ fontFamily: F.serif, fontSize: 36, lineHeight: 1.08, color: "#fff", letterSpacing: 0, margin: "0 0 12px" }}>
            Risparmia fino al 40% distribuendo insieme
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "rgba(255,255,255,.7)", margin: "0 0 28px", maxWidth: 520 }}>
            Quando un'altra campagna è già attiva nella tua zona, paghi solo la quota condivisa.
          </p>
        <div style={{ borderRadius: 20, overflow: "hidden", background: "#0a1625", border: "1px solid rgba(148,163,184,.18)", boxShadow: "0 30px 80px rgba(0,0,0,.18)" }}>
          {/* header */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.7)" }}>Maggio 2025</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ c: CO, l: "Disponibile" }, { c: CG, l: "Smart Pairing" }].map(b => (
                <span key={b.l} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.45)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: b.c, display: "inline-block" }} />{b.l}
                </span>
              ))}
            </div>
          </div>
          {/* calendar grid */}
          <div style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
            {calendarDays.map(({ d, day, state }) => {
              const s = stateStyle[state];
              return (
                <div key={day} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.28)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{d}</div>
                  <div style={{ height: 38, borderRadius: 8, background: s.bg, border: s.border, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 13, fontWeight: 900, color: s.color, position: "relative" }}>
                    {s.line && <span style={{ position: "absolute", width: "60%", height: 1, background: "rgba(255,255,255,.18)" }} />}
                    {day}
                  </div>
                </div>
              );
            })}
          </div>
          {/* smart pairing callout */}
          <div style={{ margin: "0 18px 18px", padding: "14px 16px", borderRadius: 12, background: `${CG}10`, border: `1px solid ${CG}30` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, background: CG, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: CG }}>Smart Pairing attivo — Gio 19 e Ven 20</span>
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.44)", lineHeight: 1.5 }}>
              Campagna D2D attiva in zona Bresso: condividi il passaggio operativo e risparmia fino al 20%.
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.28)", textDecoration: "line-through" }}>EUR 740</span>
              <span style={{ fontFamily: F.sans, fontSize: 16, fontWeight: 900, color: CG, letterSpacing: "-0.02em" }}>EUR 592</span>
              <span style={{ padding: "2px 7px", borderRadius: 5, background: `${CG}22`, fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: CG }}>-20%</span>
            </div>
          </div>
          {/* totale */}
          <div style={{ margin: "0 18px 18px", padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.38)" }}>Totale stimato</span>
            <span style={{ fontFamily: F.serif, fontSize: 20, color: "#f8fafc", letterSpacing: "-0.03em" }}>EUR 592</span>
          </div>
        </div>
        </div>

        {/* Right: text */}
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: CO, marginBottom: 18 }}>
            Calendario condiviso, costo diviso
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(36px, 3vw, 54px)", lineHeight: 1.08, color: "#fff", letterSpacing: 0, margin: "0 0 22px" }}>
            Smart Pairing:<br />risparmia distribuendo insieme
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 17, lineHeight: 1.7, color: "rgba(255,255,255,.62)", margin: "0 0 38px", maxWidth: 440 }}>
            Scegli le date dal calendario operativo e, se c'e un'altra campagna attiva nella tua zona, il sistema ti propone un abbinamento con sconto automatico.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {features.map((f, i) => (
              <div key={f.label} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: `${CO}14`, border: `1px solid ${CO}30`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: CO, flexShrink: 0, marginTop: 2 }}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 3 }}>{f.label}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,.52)" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <Button variant="primary" onClick={onConfigure} style={{ marginTop: 38, minHeight: 48, padding: "0 28px", borderRadius: 11, fontFamily: F.sans, fontSize: 14, fontWeight: 900, boxShadow: `0 12px 32px ${CO}40` }}>
            Configura la tua campagna →
          </Button>
        </div>
      </div>
    </section>
  );
}
