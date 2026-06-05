import React from "react";
import Button from "../ui/Button.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const CO = "#E8571A";

const features = [
  { label: "Date sempre selezionabili", desc: "Il cliente puo scegliere il periodo desiderato anche senza Smart Pairing." },
  { label: "Opportunita opzionale", desc: "Smart Pairing appare solo quando esistono campagne compatibili nella stessa zona o in zone vicine." },
  { label: "Risparmio quando disponibile", desc: "Se c'e un abbinamento reale, il sistema lo segnala come vantaggio operativo." },
  { label: "Richiesta disponibilita", desc: "Se non ci sono opportunita, puoi lasciare una richiesta e continuare la campagna." },
];

const statuses = [
  { label: "Data scelta dal cliente", value: "Sempre possibile", active: true },
  { label: "Smart Pairing", value: "Solo se compatibile", active: false },
  { label: "Richiesta disponibilita", value: "Opzionale", active: false },
];

export default function FeatureSmartPairing({ onConfigure }) {
  return (
    <section className="section" style={{ background: "#1A1A1A", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box" }}>
      <div className="smart-pairing-layout" style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>
        <div>
          <h2 style={{ fontFamily: F.serif, fontSize: 36, lineHeight: 1.08, color: "#fff", letterSpacing: 0, margin: "0 0 12px" }}>
            Smart Pairing quando c'e una campagna compatibile
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "rgba(255,255,255,.7)", margin: "0 0 28px", maxWidth: 520 }}>
            Non e il metodo standard di prenotazione: e una possibilita extra di risparmio quando VolantiniPro ha gia attivita operative compatibili nell'area.
          </p>
          <div style={{ borderRadius: 20, overflow: "hidden", background: "#0a1625", border: "1px solid rgba(148,163,184,.18)", boxShadow: "0 30px 80px rgba(0,0,0,.18)" }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,.72)" }}>Pianificazione campagna</span>
              <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 850, color: CO, textTransform: "uppercase", letterSpacing: ".08em" }}>Smart Pairing opzionale</span>
            </div>
            <div style={{ padding: 18, display: "grid", gap: 10 }}>
              {statuses.map((status) => (
                <div key={status.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "13px 14px", borderRadius: 12, background: status.active ? "rgba(232,87,26,.10)" : "rgba(255,255,255,.045)", border: `1px solid ${status.active ? "rgba(232,87,26,.28)" : "rgba(255,255,255,.075)"}` }}>
                  <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 850, color: "#f8fafc" }}>{status.label}</span>
                  <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 850, color: status.active ? CO : "rgba(255,255,255,.5)" }}>{status.value}</span>
                </div>
              ))}
            </div>
            <div style={{ margin: "0 18px 18px", padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.07)", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.62)", lineHeight: 1.6 }}>
              Se non esistono abbinamenti, il flusso non si blocca: puoi continuare senza Smart Pairing o richiedere un avviso.
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: CO, marginBottom: 18 }}>
            Funzione opzionale di risparmio
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(36px, 3vw, 54px)", lineHeight: 1.08, color: "#fff", letterSpacing: 0, margin: "0 0 22px" }}>
            Scegli la data.<br />Se c'e pairing, lo vedi.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 17, lineHeight: 1.7, color: "rgba(255,255,255,.62)", margin: "0 0 38px", maxWidth: 460 }}>
            Il calendario resta un flusso di pianificazione. Smart Pairing compare solo come opportunita aggiuntiva, basata su campagne reali compatibili.
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
            Configura la tua campagna
          </Button>
        </div>
      </div>
    </section>
  );
}
