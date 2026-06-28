import React from "react";
import Button from "../ui/Button.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_PRIMARY = "#6366F1";
const C_CYAN = "#06B6D4";

const features = [
  { label: "Date sempre selezionabili", desc: "Il cliente può scegliere il periodo desiderato anche senza Smart Pairing." },
  { label: "Opportunità opzionale", desc: "Smart Pairing appare solo quando esistono campagne compatibili nella stessa zona o in zone vicine." },
  { label: "Risparmio quando disponibile", desc: "Se c'è un abbinamento reale, il sistema lo segnala come vantaggio operativo." },
  { label: "Richiesta disponibilità", desc: "Se non ci sono opportunità, puoi lasciare una richiesta e continuare la campagna." },
];

const statuses = [
  { label: "Data scelta dal cliente", value: "Sempre possibile", active: true },
  { label: "Smart Pairing", value: "Solo se compatibile", active: false },
  { label: "Richiesta disponibilità", value: "Opzionale", active: false },
];

export default function FeatureSmartPairing({ onConfigure }) {
  return (
    <section className="section" style={{ background: "#111827", paddingTop: 120, paddingBottom: 120, paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(148,163,184,0.18)" }}>
      <div className="smart-pairing-layout" style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 80, alignItems: "center" }}>
        <div>
          <h2 style={{ fontFamily: F.serif, fontSize: 36, lineHeight: 1.05, color: "#F8FAFC", letterSpacing: "-0.02em", margin: "0 0 16px" }}>
            Smart Pairing quando c'è una campagna compatibile
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "#94A3B8", margin: "0 0 32px", maxWidth: 520 }}>
            Non è il metodo standard di prenotazione: è una possibilità extra di risparmio quando VolantiniPro ha già attività operative compatibili nell'area.
          </p>
          <div className="vc" style={{ borderRadius: 24, overflow: "hidden", background: "rgba(24,34,53,0.5)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(148,163,184,0.18)", boxShadow: "0 32px 64px rgba(0,0,0,.25)" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(148,163,184,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 900, color: "#CBD5E1" }}>Pianificazione campagna</span>
              <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 850, color: C_CYAN, textTransform: "uppercase", letterSpacing: ".08em" }}>Smart Pairing opzionale</span>
            </div>
            <div style={{ padding: 24, display: "grid", gap: 12 }}>
              {statuses.map((status) => (
                <div key={status.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "16px 20px", borderRadius: 14, background: status.active ? "rgba(99,102,241,0.10)" : "rgba(255,255,255,0.03)", border: `1px solid ${status.active ? "rgba(99,102,241,0.25)" : "rgba(148,163,184,0.10)"}` }}>
                  <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: "#F8FAFC" }}>{status.label}</span>
                  <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: status.active ? C_PRIMARY : "#94A3B8" }}>{status.value}</span>
                </div>
              ))}
            </div>
            <div style={{ margin: "0 24px 24px", padding: "16px 20px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.10)", fontFamily: F.sans, fontSize: 12, color: "#CBD5E1", lineHeight: 1.6 }}>
              Se non esistono abbinamenti, il flusso non si blocca: puoi continuare senza Smart Pairing o richiedere un avviso.
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_CYAN, marginBottom: 18 }}>
            Funzione opzionale di risparmio
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(36px, 3vw, 54px)", lineHeight: 1.05, color: "#F8FAFC", letterSpacing: "-0.03em", margin: "0 0 22px" }}>
            Scegli la data.<br />Se c'è pairing, lo vedi.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 17, lineHeight: 1.65, color: "#94A3B8", margin: "0 0 42px", maxWidth: 460 }}>
            Il calendario resta un flusso di pianificazione. Smart Pairing compare solo come opportunità aggiuntiva, basata su campagne reali compatibili.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {features.map((f, i) => (
              <div key={f.label} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <span style={{ width: 28, height: 28, borderRadius: 10, background: "rgba(99,102,241,0.10)", border: "1px solid rgba(99,102,241,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: C_PRIMARY, flexShrink: 0, marginTop: 2 }}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 800, color: "#F8FAFC", marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.6, color: "#94A3B8" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <Button variant="primary" className="vb" onClick={onConfigure} style={{ marginTop: 42, minHeight: 48, padding: "0 32px", borderRadius: 12, fontFamily: F.sans, fontSize: 14, fontWeight: 900, boxShadow: "0 12px 32px rgba(99,102,241,0.25)" }}>
            Configura la tua campagna
          </Button>
        </div>
      </div>
    </section>
  );
}
