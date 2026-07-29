import React from "react";
import { motion } from "framer-motion";

const F = {
  serif: "'DM Serif Display', serif",
  sans: "'DM Sans', Inter, system-ui, sans-serif",
};

const trustItems = [
  "Report GPS verificabili",
  "Analisi ISTAT demografica",
  "Cartografia GIS professionale",
  "Preventivi e PDF certificati",
  "Monitoraggio operativo sul campo"
];

export default function TrustBar() {
  return (
    <section
      aria-label="Garanzie e tecnologie di monitoraggio"
      style={{
        background: "#080F1E",
        borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        padding: "24px 28px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: "24px 40px",
          }}
        >
          {trustItems.map((item, idx) => (
            <motion.div
              key={item}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, delay: idx * 0.05 }}
              whileHover={{ scale: 1.03 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: F.sans,
                fontSize: 14,
                fontWeight: 700,
                color: "rgba(248, 250, 252, 0.88)",
                letterSpacing: "0.01em",
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(232, 87, 26, 0.15)",
                  border: "1px solid rgba(232, 87, 26, 0.4)",
                  color: "#E8571A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                ✓
              </span>
              <span>{item}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
