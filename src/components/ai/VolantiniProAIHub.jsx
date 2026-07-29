import React from "react";
import { motion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C = { navy: "#0B1020", navyCard: "#122036", white: "#F8FAFC", muted: "#94A3B8", orange: "#E8571A", border: "rgba(255,255,255,.08)" };

const MATURITY = Object.freeze({
  available: { icon: "✅", label: "Disponibile", color: "#8CE3BD", background: "rgba(46,204,138,.1)" },
  development: { icon: "🟡", label: "In sviluppo", color: "#F0CA7E", background: "rgba(224,165,57,.1)" },
  roadmap: { icon: "🔵", label: "Roadmap", color: "#9BC4F5", background: "rgba(73,139,222,.11)" },
});

const GROUPS = Object.freeze([
  {
    maturity: "available",
    title: "Utilizzabile oggi",
    description: "Funzioni operative o deterministiche gia presenti nel prodotto.",
    features: [
      "Analisi territoriale ISTAT",
      "Dashboard Cliente AI deterministica",
      "Dashboard Admin AI deterministica",
      "Assistente Campagna AI guidato",
      "Copilota Operativo AI guidato",
      "Report finale AI deterministico",
      "Centro Decisionale deterministico",
      "Centro Notifiche UI consultivo",
    ],
  },
  {
    maturity: "development",
    title: "Non ancora disponibile",
    description: "Funzioni in lavorazione, non incluse nell'esperienza corrente.",
    features: [
      "Centro Notifiche persistente",
      "Notifiche push, email o SMS",
      "Assistenti conversazionali con LLM",
      "Automazioni operative supervisionate",
    ],
  },
  {
    maturity: "roadmap",
    title: "Evoluzioni future",
    description: "Direzioni di prodotto senza promessa di disponibilita o risultato.",
    features: [
      "Routing intelligente avanzato",
      "Modelli predittivi",
      "Scoring operativo",
      "Ottimizzazione automatica",
      "Azioni autonome",
    ],
  },
]);

function MaturityBadge({ maturity }) {
  const item = MATURITY[maturity];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 5, background: item.background, color: item.color, fontFamily: F.sans, fontSize: 11, fontWeight: 800 }}><span aria-hidden="true">{item.icon}</span>{item.label}</span>;
}

export default function VolantiniProAIHub({ onConfigure }) {
  return (
    <section id="volantinipro-ai-hub" aria-labelledby="ai-hub-title" style={{ background: C.navy, padding: "80px 28px", borderTop: `1px solid ${C.border}`, color: C.white }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ maxWidth: 760, marginBottom: 42 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.orange, textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 14 }}>Maturita delle funzioni</div>
          <h2 id="ai-hub-title" style={{ fontFamily: F.serif, fontSize: 46, color: C.white, letterSpacing: "-1.5px", marginBottom: 14, lineHeight: 1.08 }}>AI verificabile, stato dichiarato.</h2>
          <p style={{ fontFamily: F.sans, fontSize: 17, color: C.muted, maxWidth: 680, margin: "0 0 20px", lineHeight: 1.65 }}>Le funzioni disponibili usano dati autorizzati e regole deterministiche. Assistenti guidati, notifiche consultive e strumenti futuri sono indicati senza sovrastimarne la maturita.</p>
          <div aria-label="Legenda maturita" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.keys(MATURITY).map((maturity) => <MaturityBadge key={maturity} maturity={maturity} />)}
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 16, alignItems: "start" }}>
          {GROUPS.map((group, index) => (
            <motion.article key={group.maturity} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: .22, delay: index * .06 }} style={{ padding: "26px 24px 28px", borderRadius: 14, background: C.navyCard, boxShadow: `inset 0 0 0 1px ${C.border}` }}>
              <MaturityBadge maturity={group.maturity} />
              <h3 style={{ fontFamily: F.serif, fontSize: 23, color: C.white, margin: "18px 0 8px" }}>{group.title}</h3>
              <p style={{ minHeight: 44, fontFamily: F.sans, fontSize: 13, color: C.muted, margin: "0 0 18px", lineHeight: 1.55 }}>{group.description}</p>
              <ul style={{ display: "grid", gap: 10, margin: 0, padding: 0, listStyle: "none" }}>
                {group.features.map((feature) => <li key={feature} style={{ paddingLeft: 13, borderLeft: `2px solid ${MATURITY[group.maturity].color}`, fontFamily: F.sans, fontSize: 13, color: "rgba(248,250,252,.78)", lineHeight: 1.4 }}>{feature}</li>)}
              </ul>
            </motion.article>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap", marginTop: 30, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
          <p style={{ maxWidth: 650, margin: 0, fontFamily: F.sans, fontSize: 12, color: C.muted, lineHeight: 1.55 }}>Il Centro Notifiche disponibile e solo consultivo: non salva stato letto, non invia push, email o SMS e non applica azioni.</p>
          <button onClick={() => onConfigure?.()} style={{ padding: "13px 26px", borderRadius: 8, background: C.orange, border: "none", color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Configura una campagna</button>
        </div>
      </div>
    </section>
  );
}
