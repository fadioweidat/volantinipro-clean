import React from "react";
import { motion, useReducedMotion } from "framer-motion";

const CARDS = [
  {
    title: "Dati territoriali ISTAT",
    desc: "Famiglie, popolazione e densità abitativa lette dalle fonti territoriali disponibili.",
    icon: "ISTAT",
    bullets: ["Famiglie e popolazione", "Copertura stimata"],
  },
  {
    title: "Analisi territoriale",
    desc: "Prima della campagna analizziamo zona, raggio e comuni coinvolti.",
    icon: "GIS",
    bullets: ["Zone e comuni", "Fabbisogno volantini"],
  },
  {
    title: "Tracking GPS",
    desc: "Il lavoro sul campo viene registrato con il percorso GPS degli operatori.",
    icon: "GPS",
    bullets: ["Percorso operativo", "Avanzamento live"],
  },
  {
    title: "Report e prove",
    desc: "Le evidenze raccolte rendono la distribuzione controllabile a fine campagna.",
    icon: "PDF",
    bullets: ["Foto geolocalizzate", "Mappa di copertura"],
  },
];

export default function WhyDifferentSection() {
  const reduceMotion = useReducedMotion();
  return (
    <section id="chi-siamo" className="section-tight" style={{ background: "#0B1020", paddingTop: 48, paddingBottom: 48, paddingLeft: "5vw", paddingRight: "5vw", boxSizing: "border-box" }} aria-labelledby="why-different-title">
      <style>{`
        .why-diff-container {
          max-width: 1400px;
          margin: 0 auto;
        }
        .why-diff-header {
          margin-bottom: 32px;
        }
        .why-diff-kicker {
          font-family: 'DM Sans', Inter, system-ui, sans-serif;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .15em;
          text-transform: uppercase;
          color: #E8571A;
          margin-bottom: 18px;
        }
        .why-diff-title {
          font-family: 'DM Serif Display', Georgia, serif;
          font-size: clamp(38px, 4.5vw, 60px);
          line-height: 1.05;
          color: #F8FAFC;
          letter-spacing: -0.03em;
          margin: 0 0 24px 0;
        }
        .why-diff-copy {
          font-family: 'DM Sans', Inter, system-ui, sans-serif;
          font-size: 17px;
          line-height: 1.65;
          color: #AEB9C9;
          max-width: 540px;
          margin: 0;
        }
        .why-diff-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 24px;
        }
        .why-diff-card {
          background: #122036;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          padding: 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-height: 168px;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease;
        }
        .why-diff-card:hover {
          transform: translateY(-4px);
          border-color: rgba(232, 87, 26, 0.4);
        }
        .why-diff-card:nth-child(1) { grid-column: span 7; }
        .why-diff-card:nth-child(2) { grid-column: span 5; }
        .why-diff-card:nth-child(3) { grid-column: span 5; }
        .why-diff-card:nth-child(4) { grid-column: span 7; }

        .why-diff-icon-badge {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(232, 87, 26, 0.12);
          border: 1px solid rgba(232, 87, 26, 0.25);
          font-family: 'DM Sans', Inter, system-ui, sans-serif;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .08em;
          color: #E8571A;
        }
        .why-diff-card-title {
          font-family: 'DM Serif Display', Georgia, serif;
          font-size: 22px;
          line-height: 1.1;
          color: #F8FAFC;
          margin: 0 0 8px;
          letter-spacing: -0.02em;
        }
        .why-diff-card-text {
          font-family: 'DM Sans', Inter, system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.6;
          color: #AEB9C9;
          margin: 0;
        }

        @media (max-width: 980px) {
          .why-diff-card:nth-child(1),
          .why-diff-card:nth-child(2),
          .why-diff-card:nth-child(3),
          .why-diff-card:nth-child(4) {
            grid-column: span 12;
          }
          .why-diff-grid {
            gap: 16px;
          }
        }
      `}</style>

      <div className="why-diff-container">
        <div className="why-diff-header">
          <div className="why-diff-kicker">La differenza</div>
          <h2 id="why-different-title" className="why-diff-title">
            Perché VolantiniPro è diverso
          </h2>
          <p className="why-diff-copy">
            Analizziamo il territorio prima della campagna, poi costruiamo copertura, quantità e report operativo.
          </p>
        </div>

        <div className="why-diff-grid">
          {CARDS.map((card, idx) => (
            <motion.article
              key={card.title}
              className="why-diff-card"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.18, delay: reduceMotion ? 0 : idx * 0.05 }}
              whileHover={reduceMotion ? undefined : { y: -4, borderColor: "rgba(232, 87, 26, 0.4)" }}
            >
              <div className="why-diff-icon-badge">{card.icon}</div>
              <div style={{ marginTop: "auto" }}>
                <h3 className="why-diff-card-title">{card.title}</h3>
                <p className="why-diff-card-text">{card.desc}</p>
                {card.bullets && (
                  <ul style={{ paddingLeft: 20, marginTop: 16, marginBottom: 0, color: "#AEB9C9", fontFamily: "'DM Sans', Inter, sans-serif", fontSize: 14, lineHeight: 1.6 }}>
                    {card.bullets.map(b => <li key={b}>{b}</li>)}
                  </ul>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
