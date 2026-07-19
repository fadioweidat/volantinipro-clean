import React from "react";
import { motion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C = { navy: "#0B1020", navyCard: "#122036", white: "#F8FAFC", muted: "#94A3B8", orange: "#E8571A", border: "rgba(255, 255, 255, 0.08)" };

export default function VolantiniProAIHub({ onConfigure }) {
  const cards = [
    { icon: "📊", title: "Analisi ISTAT", subtitle: "Copertura territoriale" },
    { icon: "🗺️", title: "Routing intelligente", subtitle: "Percorsi ottimizzati" },
    { icon: "🛡️", title: "Verifica Anti-Ghost", subtitle: "Tracking GPS live" },
    { icon: "📄", title: "Report automatizzati", subtitle: "Dati e foto finali" }
  ];

  return (
    <section id="volantinipro-ai-hub" style={{ background: C.navy, padding: "80px 28px", borderTop: `1px solid ${C.border}`, color: C.white }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(232, 87, 26, 0.12)", border: `1px solid ${C.orange}44`, marginBottom: 16 }}>
            <span style={{ fontSize: 14 }}>🤖</span>
            <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.orange, textTransform: "uppercase", letterSpacing: ".12em" }}>
              Ecosistema Integrato
            </span>
          </div>
          
          <h2 style={{ fontFamily: F.serif, fontSize: 46, color: C.white, letterSpacing: "-1.5px", marginBottom: 14, lineHeight: 1.1 }}>
            VolantiniPro AI
          </h2>
          
          <p style={{ fontFamily: F.sans, fontSize: 18, color: C.muted, maxWidth: 680, margin: "0 auto 24px", lineHeight: 1.6 }}>
            Un unico assistente intelligente che ti accompagna prima, durante e dopo ogni campagna. Il tuo consulente dalla pianificazione al report finale.
          </p>

          <div style={{ display: "inline-block", padding: "8px 16px", background: "rgba(255, 255, 255, 0.04)", borderRadius: 8, border: "1px dashed rgba(255, 255, 255, 0.15)", maxWidth: 720 }}>
            <p style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255, 255, 255, 0.6)", margin: 0, lineHeight: 1.5 }}>
              <strong style={{ color: C.orange }}>Nota trasparenza:</strong> La nostra AI è uno strumento di supporto orientativo generato da regole interne. Le decisioni finali e il preventivo definitivo vengono calcolati nel configuratore.
            </p>
          </div>
        </div>

        {/* 4 Static Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginBottom: 48 }}>
          {cards.map((card, idx) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4, borderColor: "rgba(232, 87, 26, 0.4)" }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, delay: idx * 0.1 }}
              style={{ background: C.navyCard, padding: "32px 24px", borderRadius: 16, border: `1px solid ${C.border}`, textAlign: "center", cursor: "pointer" }}
            >
              <div style={{ fontSize: 36, marginBottom: 16 }}>{card.icon}</div>
              <h3 style={{ fontFamily: F.serif, fontSize: 22, color: C.white, marginBottom: 8 }}>{card.title}</h3>
              <p style={{ fontFamily: F.sans, fontSize: 14, color: C.muted, margin: 0 }}>{card.subtitle}</p>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center" }}>
          <button
            onClick={() => onConfigure && onConfigure()}
            style={{ padding: "14px 34px", borderRadius: 8, background: "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)", border: "none", color: C.white, fontFamily: F.sans, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 16px rgba(232, 87, 26, 0.28)" }}
          >
            Esplora la dashboard AI
          </button>
        </div>

      </div>
    </section>
  );
}
