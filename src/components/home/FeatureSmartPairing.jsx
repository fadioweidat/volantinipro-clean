import React from "react";
import { motion } from "framer-motion";
import Button from "../ui/Button.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

const features = [
  { label: "Risparmio fino al 40%", desc: "L'AI raggruppa campagne compatibili nella stessa zona per ottimizzare i costi di uscita." },
  { label: "Abbinamento intelligente AI", desc: "Confronta automaticamente zona, periodo, quantità e disponibilità delle squadre operative." },
  { label: "Opportunità garantita o avviso", desc: "Se gli slot sono disponibili prenoti subito con sconto, altrimenti attivi la notifica prioritaria." },
  { label: "Stesso report certificato", desc: "La qualità della distribuzione rimane identica, con tracking GPS completo e report dedicato." },
];

const statuses = [
  { label: "Smart Pairing Stessa Zona", value: "Risparmio -40%", active: true, color: "#22C55E" },
  { label: "Smart Pairing Zona Vicina", value: "Risparmio -20%", active: true, color: "#38BDF8" },
  { label: "Nessuna compatibilità immediata", value: "Notifica AI attiva", active: false, color: "#FBBF24" },
];

export default function FeatureSmartPairing({ onConfigure }) {
  return (
    <section id="smart-pairing" className="section" style={{ background: "#111827", paddingTop: 100, paddingBottom: 100, paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
      <div className="smart-pairing-layout" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 64, alignItems: "center" }}>
        <motion.div initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.22 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 100, background: "rgba(232, 87, 26, 0.12)", border: "1px solid rgba(232, 87, 26, 0.3)", marginBottom: 16 }}>
            <span style={{ fontSize: 13 }}>✨</span>
            <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C_ORANGE, textTransform: "uppercase", letterSpacing: ".08em" }}>Smart Pairing AI</span>
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: 40, lineHeight: 1.08, color: "#F8FAFC", letterSpacing: "-0.02em", margin: "0 0 16px" }}>
            Riduci il costo della distribuzione fino al 40%.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "#94A3B8", margin: "0 0 32px", maxWidth: 520 }}>
            L'intelligenza artificiale raggruppa automaticamente campagne compatibili nella stessa zona o in zone limitrofe. Quando troviamo abbinamenti, condividiamo i costi logistici per offrirti un risparmio immediato.
          </p>
          <div className="vc" style={{ borderRadius: 20, overflow: "hidden", background: "#122036", border: "1px solid rgba(255, 255, 255, 0.08)", boxShadow: "0 16px 32px rgba(0,0,0,0.25)" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 900, color: "#CBD5E1" }}>Motore AI Ottimizzazione</span>
              <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 850, color: "#22C55E", textTransform: "uppercase", letterSpacing: ".08em" }}>● Attivo h24</span>
            </div>
            <div style={{ padding: 24, display: "grid", gap: 12 }}>
              {statuses.map((status) => (
                <div key={status.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "14px 18px", borderRadius: 12, background: status.active ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${status.active ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"}` }}>
                  <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: "#F8FAFC" }}>{status.label}</span>
                  <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: status.color, padding: "4px 10px", borderRadius: 8, background: `${status.color}15` }}>{status.value}</span>
                </div>
              ))}
            </div>
            <div style={{ margin: "0 24px 24px", padding: "14px 18px", borderRadius: 12, background: "rgba(232, 87, 26, 0.08)", border: "1px solid rgba(232, 87, 26, 0.2)", fontFamily: F.sans, fontSize: 12, color: "rgba(248, 250, 252, 0.85)", lineHeight: 1.6 }}>
              💡 <b>Nessun vincolo:</b> Se non ci sono slot disponibili nelle tue date, puoi proseguire al prezzo standard o chiedere la notifica prioritaria.
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.22 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".15em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 16 }}>
            Tecnologia Premium VolantiniPro
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(36px, 3vw, 52px)", lineHeight: 1.05, color: "#F8FAFC", letterSpacing: "-0.03em", margin: "0 0 20px" }}>
            Efficienza logistica.<br />Vantaggio economico.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "#94A3B8", margin: "0 0 36px", maxWidth: 460 }}>
            Il risparmio derivato dallo Smart Pairing si basa esclusivamente su campagne reali abbinate dall'algoritmo di routing geografico.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {features.map((f, i) => (
              <div key={f.label} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(232, 87, 26, 0.12)", border: "1px solid rgba(232, 87, 26, 0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: C_ORANGE, flexShrink: 0, marginTop: 2 }}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 800, color: "#F8FAFC", marginBottom: 4 }}>{f.label}</div>
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
      </div>
    </section>
  );
}
