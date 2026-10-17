import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const F = { serif: "'DM Sans', Inter, system-ui, sans-serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

// Board di pianificazione DIMOSTRATIVA — nessuna chiamata API, nessun dato
// reale: solo presentazione frontend dell'idea di Smart Pairing (allineamento
// campagne compatibili sulla stessa finestra/zona). La logica business reale
// (smart_pairing_waitlist / smart-pairing-availability) non viene toccata.
// Il mese mostrato e' sempre il mese successivo a oggi (finestra consigliata
// sempre nel futuro); stati e valori restano un esempio, etichettato come tale.
const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"];
// stato esempio per giorno del mese: 'full' pieno, 'limited' capacità limitata,
// 'recommended' finestra consigliata, 'open' disponibile.
const DAY_STATE = {
  1: "open", 2: "open", 3: "limited", 4: "limited", 5: "full", 6: "open", 7: "open",
  8: "recommended", 9: "recommended", 10: "recommended", 11: "open", 12: "limited", 13: "open", 14: "open",
  15: "open", 16: "limited", 17: "full", 18: "full", 19: "open", 20: "open", 21: "open",
  22: "limited", 23: "open", 24: "open", 25: "open", 26: "limited", 27: "open", 28: "open",
  29: "open", 30: "open", 31: "open",
};
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Example month board: the month after `today`, Monday-first grid. Pure, testable. */
export function buildSmartPairingExampleMonth(today = new Date()) {
  const year = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
  const month = (today.getMonth() + 1) % 12;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7; // lunedi' = 0
  const recommended = Object.keys(DAY_STATE).map(Number).filter((d) => DAY_STATE[d] === "recommended" && d <= daysInMonth);
  const monthName = MONTHS[month];
  return {
    label: `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`,
    startOffset,
    days: Array.from({ length: daysInMonth }, (_, i) => i + 1),
    windowLabel: recommended.length ? `${recommended[0]}–${recommended[recommended.length - 1]} ${monthName}` : null,
  };
}

const STATE_COLOR = {
  open: { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", dot: null },
  limited: { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.3)", dot: "#FBBF24" },
  full: { bg: "rgba(148,163,184,0.05)", border: "rgba(148,163,184,0.12)", dot: "#5B6472" },
  recommended: { bg: "rgba(232,87,26,0.14)", border: "rgba(232,87,26,0.55)", dot: C_ORANGE },
};
// #C2410C: white text reaches 5.2:1 (brand #E8571A gives 3.6:1, below WCAG AA for small text).
const EXAMPLE_BADGE = { display: "inline-block", padding: "3px 10px", borderRadius: 999, background: "#C2410C", color: "#fff", fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" };

export default function SmartPairingSection({ onConfigure }) {
  const reduceMotion = useReducedMotion();
  const example = buildSmartPairingExampleMonth();
  const cells = [...Array(example.startOffset).fill(null), ...example.days];

  return (
    <section
      id="smart-pairing"
      className="section-tight"
      aria-labelledby="smart-pairing-title"
      style={{ background: "#0B1020", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <style>{`
        .sp-grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0,42%) minmax(0,58%); gap: 48px; align-items: center; }
        @media (max-width: 900px) { .sp-grid { grid-template-columns: 1fr !important; gap: 26px !important; } }
        .sp-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
      `}</style>
      <div className="sp-grid">
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 12px", borderRadius: 100, background: "rgba(232,87,26,0.12)", border: "1px solid rgba(232,87,26,0.3)", marginBottom: 14 }}>
            <span style={{ fontSize: 12 }}>✨</span>
            <span style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 800, color: C_ORANGE, textTransform: "uppercase", letterSpacing: ".08em" }}>Smart Pairing</span>
          </div>
          <h2 id="smart-pairing-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: "clamp(28px, 3.2vw, 40px)", lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-0.02em", margin: "0 0 14px" }}>
            Pianifica la distribuzione nel momento giusto.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 15, lineHeight: 1.6, color: "#94A3B8", margin: "0 0 24px", maxWidth: 460 }}>
            Quando esistono campagne compatibili nella tua zona o in zone vicine nello stesso periodo, ti proponiamo la finestra migliore per condividere i costi operativi.
          </p>

          <div style={{ display: "grid", gap: 10 }} aria-label="Esempio di pianificazione">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={EXAMPLE_BADGE}>Esempio</span>
              <span style={{ fontFamily: F.sans, fontSize: 13, color: "#CBD5E1" }}>Valori illustrativi, non disponibilità reale</span>
            </div>
            <div style={{ padding: "14px 16px", borderRadius: 12, background: "#122036", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "#8892A0", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Migliore finestra</div>
              <div style={{ fontFamily: F.serif, fontSize: 20, color: "#F8FAFC" }}>{example.windowLabel}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ padding: "14px 16px", borderRadius: 12, background: "#122036", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "#8892A0", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Capacità disponibile</div>
                <div style={{ fontFamily: F.sans, fontSize: 17, fontWeight: 900, color: "#7FE3B4" }}>72%</div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 12, background: "#122036", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "#8892A0", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>Copertura consigliata</div>
                <div style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 800, color: "#F8FAFC" }}>Zona Nord-Ovest</div>
              </div>
            </div>
          </div>

          <button
            onClick={() => onConfigure?.()}
            className="vb"
            style={{ marginTop: 22, padding: "12px 26px", borderRadius: 8, border: "none", background: C_ORANGE, color: "#fff", fontFamily: F.sans, fontSize: 13.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(232,87,26,0.28)" }}
          >
            Verifica disponibilità →
          </button>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3 }}
          style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 22, boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: "#F8FAFC" }}>{example.label}</span>
            <span style={EXAMPLE_BADGE}>Esempio</span>
          </div>

          <div className="sp-cal" style={{ marginBottom: 8 }}>
            {WEEKDAYS.map((d, i) => (
              <div key={`${d}${i}`} style={{ textAlign: "center", fontFamily: F.sans, fontSize: 10, fontWeight: 800, color: "#94A3B8", padding: "4px 0" }}>{d}</div>
            ))}
          </div>
          <div className="sp-cal">
            {cells.map((day, idx) => {
              if (day == null) return <div key={`empty-${idx}`} />;
              const state = STATE_COLOR[DAY_STATE[day] || "open"];
              return (
                <motion.div
                  key={day}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.15, delay: reduceMotion ? 0 : idx * 0.008 }}
                  style={{
                    aspectRatio: "1/1", borderRadius: 8, background: state.bg, border: `1px solid ${state.border}`,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                    fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, color: "#D2DAE6", position: "relative",
                  }}
                >
                  {day}
                  {state.dot && <span style={{ width: 4, height: 4, borderRadius: "50%", background: state.dot }} />}
                </motion.div>
              );
            })}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 16 }}>
            {[["Consigliato", C_ORANGE], ["Capacità limitata", "#FBBF24"], ["Completo", "#5B6472"]].map(([label, color]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: F.sans, fontSize: 11, color: "#94A3B8" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                {label}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
