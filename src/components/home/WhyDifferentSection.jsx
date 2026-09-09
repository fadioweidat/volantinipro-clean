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
    title: "Studio di fattibilità",
    desc: "Prima di investire, analizziamo la sostenibilità economica della campagna in base alla tua attività, al budget e agli obiettivi.",
    icon: "AI + ANALISI",
    bullets: [
      "Break-even e ROI",
      "Clienti necessari per rientrare",
      "Scenari prudente, realistico e crescita",
      "Rischi e raccomandazioni",
    ],
    smallNote: "Analisi basata sui dati forniti e sulle ipotesi dichiarate.",
    cta: "Scopri l'analisi",
    href: "/analisi-campagna",
    isFeasibility: true,
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
          max-width: 680px;
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
        .why-diff-card--feasibility {
          border-color: rgba(232, 87, 26, 0.22);
          background: linear-gradient(180deg, #152540 0%, #122036 100%);
        }
        .why-diff-card--feasibility:hover {
          border-color: rgba(232, 87, 26, 0.55);
        }
        .why-diff-card:nth-child(1) { grid-column: span 4; }
        .why-diff-card:nth-child(2) { grid-column: span 4; }
        .why-diff-card:nth-child(3) { grid-column: span 4; }
        .why-diff-card:nth-child(4) { grid-column: span 6; }
        .why-diff-card:nth-child(5) { grid-column: span 6; }

        .why-diff-icon-badge {
          min-width: 42px;
          width: auto;
          height: 42px;
          padding: 0 10px;
          box-sizing: border-box;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(232, 87, 26, 0.12);
          border: 1px solid rgba(232, 87, 26, 0.25);
          font-family: 'DM Sans', Inter, system-ui, sans-serif;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .08em;
          color: #E8571A;
          align-self: flex-start;
          white-space: nowrap;
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
        .why-diff-cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 14px;
          color: #E8571A;
          font-family: 'DM Sans', Inter, system-ui, sans-serif;
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
          transition: color 0.15s ease, transform 0.15s ease;
          align-self: flex-start;
        }
        .why-diff-cta:hover {
          color: #FF773D;
          transform: translateX(2px);
        }

        @media (max-width: 980px) {
          .why-diff-card:nth-child(1),
          .why-diff-card:nth-child(2),
          .why-diff-card:nth-child(3),
          .why-diff-card:nth-child(4),
          .why-diff-card:nth-child(5) {
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
            Prima analizziamo dove distribuire e se l'investimento può avere senso. Poi pianifichiamo la copertura, monitoriamo il lavoro e documentiamo il risultato.
          </p>
        </div>

        <div className="why-diff-grid">
          {CARDS.map((card, idx) => (
            <motion.article
              key={card.title}
              className={`why-diff-card${card.isFeasibility ? " why-diff-card--feasibility" : ""}`}
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
                {card.smallNote && (
                  <p style={{ marginTop: 12, marginBottom: 0, color: "rgba(174, 185, 201, 0.65)", fontFamily: "'DM Sans', Inter, sans-serif", fontSize: 12, lineHeight: 1.4 }}>
                    {card.smallNote}
                  </p>
                )}
                {card.cta && card.href && (
                  <a href={card.href} className="why-diff-cta" aria-label={`${card.cta} - ${card.title}`}>
                    <span>{card.cta}</span>
                    <span aria-hidden="true">→</span>
                  </a>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
