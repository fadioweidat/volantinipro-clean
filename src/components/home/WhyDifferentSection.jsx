import React from "react";

const CARDS = [
  {
    title: "Dati territoriali ISTAT",
    desc: "Famiglie, popolazione e densità abitativa vengono letti dalle fonti territoriali disponibili.",
    icon: "ISTAT",
    bullets: ["Famiglie raggiungibili", "Comuni coinvolti", "Densità abitativa"],
  },
  {
    title: "Analisi Territoriale",
    desc: "Prima della campagna analizziamo zona, raggio, comuni coinvolti, copertura e fabbisogno volantini.",
    icon: "GIS",
    bullets: ["Raggio d'azione", "Copertura stimata", "Zone coperte"],
  },
  {
    title: "Tracking GPS",
    desc: "Il lavoro sul campo può essere verificato con percorsi operativi e tracciamento GPS.",
    icon: "GPS",
    bullets: ["Percorsi operativi", "Verifica distribuzione", "Controllo avanzamento"],
  },
  {
    title: "Report e Prove",
    desc: "Report finali, evidenze fotografiche e riepiloghi rendono la distribuzione controllabile.",
    icon: "PDF",
    bullets: ["Prove fotografiche", "Riepilogo campagna", "Report condivisibile"],
  },
];

export default function WhyDifferentSection() {
  return (
    <section style={{ background: "#0B1020", paddingTop: 80, paddingBottom: 80, paddingLeft: "5vw", paddingRight: "5vw", boxSizing: "border-box" }} aria-labelledby="why-different-title">
      <style>{`
        .why-diff-container {
          max-width: 1400px;
          margin: 0 auto;
        }
        .why-diff-header {
          margin-bottom: 56px;
        }
        .why-diff-kicker {
          font-family: 'DM Sans', Inter, system-ui, sans-serif;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .15em;
          text-transform: uppercase;
          color: #06B6D4;
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
          color: #94A3B8;
          max-width: 540px;
          margin: 0;
        }
        .why-diff-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 24px;
        }
        .why-diff-card {
          background: rgba(24, 34, 53, 0.5);
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 24px;
          padding: 32px 28px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          min-height: 220px;
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.4s ease, border-color 0.4s ease;
        }
        .why-diff-card:hover {
          transform: translateY(-4px);
          background: rgba(34, 48, 74, 0.7);
          border-color: rgba(99, 102, 241, 0.4);
        }
        .why-diff-card:nth-child(1) { grid-column: span 7; }
        .why-diff-card:nth-child(2) { grid-column: span 5; }
        .why-diff-card:nth-child(3) { grid-column: span 5; }
        .why-diff-card:nth-child(4) { grid-column: span 7; }

        .why-diff-icon-badge {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.25);
          font-family: 'DM Sans', Inter, system-ui, sans-serif;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .08em;
          color: #818CF8;
          margin-bottom: -4px;
        }
        .why-diff-card-title {
          font-family: 'DM Serif Display', Georgia, serif;
          font-size: 28px;
          line-height: 1.1;
          color: #F8FAFC;
          margin: 0 0 12px;
          letter-spacing: -0.02em;
        }
        .why-diff-card-text {
          font-family: 'DM Sans', Inter, system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.6;
          color: #94A3B8;
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
          {CARDS.map((card) => (
            <article key={card.title} className="why-diff-card">
              <div className="why-diff-icon-badge">{card.icon}</div>
              <div style={{ marginTop: "auto" }}>
                <h3 className="why-diff-card-title">{card.title}</h3>
                <p className="why-diff-card-text">{card.desc}</p>
                {card.bullets && (
                  <ul style={{ paddingLeft: 20, marginTop: 16, marginBottom: 0, color: "#94A3B8", fontFamily: "'DM Sans', Inter, sans-serif", fontSize: 14, lineHeight: 1.6 }}>
                    {card.bullets.map(b => <li key={b}>{b}</li>)}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
