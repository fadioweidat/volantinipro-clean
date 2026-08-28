import React from "react";
import { motion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

export default function FinalCtaSection({ onConfigure }) {
  return (
    <section
      id="cta-finale"
      className="section-tight"
      aria-labelledby="cta-finale-title"
      style={{ background: "#0B1020", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.22 }}
        style={{
          maxWidth: 900,
          margin: "0 auto",
          textAlign: "center",
          background: "linear-gradient(145deg, #16233b, #101a2e)",
          border: "1px solid rgba(232,87,26,0.28)",
          borderRadius: 24,
          padding: "48px 32px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        }}
      >
        <h2 id="cta-finale-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: 40, lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
          Configura la tua campagna
        </h2>
        <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.6, color: "#C3CDDB", margin: "16px auto 28px", maxWidth: 520 }}>
          Calcola copertura, quantità e prezzo prima di confermare.
        </p>
        <button
          onClick={() => onConfigure?.()}
          className="vb"
          style={{ padding: "15px 36px", borderRadius: 10, border: "none", background: C_ORANGE, color: "#fff", fontFamily: F.sans, fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 28px rgba(232,87,26,0.4)" }}
        >
          Configura la tua campagna →
        </button>
      </motion.div>
    </section>
  );
}
