import React from "react";

const CARDS = [
  {
    title: "Dati territoriali ISTAT",
    desc: "Famiglie, popolazione e densita abitativa vengono letti dalle fonti territoriali disponibili.",
    icon: "ISTAT",
  },
  {
    title: "Analisi Territoriale",
    desc: "Prima della campagna analizziamo zona, raggio, comuni coinvolti, copertura e fabbisogno volantini.",
    icon: "GIS",
  },
  {
    title: "Tracking GPS",
    desc: "Il lavoro sul campo puo essere verificato con percorsi operativi e tracciamento GPS.",
    icon: "GPS",
  },
  {
    title: "Report e Prove",
    desc: "Report finali, evidenze fotografiche e riepiloghi rendono la distribuzione controllabile.",
    icon: "PDF",
  },
];

export default function WhyDifferentSection() {
  return (
    <section className="why-different-section" aria-labelledby="why-different-title">
      <style>{`
        .why-diff-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 80px 24px;
        }
        .why-diff-header {
          text-align: left;
          margin-bottom: 48px;
        }
        .why-diff-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
        }
        .why-diff-card {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.055) 0%, rgba(255, 255, 255, 0.018) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 26px;
          min-height: 230px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
        }
        .why-diff-card:hover {
          transform: translateY(-4px);
          border-color: rgba(232, 87, 26, 0.4);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.075) 0%, rgba(255, 255, 255, 0.02) 100%);
          box-shadow: 0 15px 30px rgba(232, 87, 26, 0.08), 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        .why-diff-icon-badge {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(232, 87, 26, 0.12);
          border: 1px solid rgba(232, 87, 26, 0.22);
          font-family: 'DM Sans', sans-serif;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .08em;
          color: #E8571A;
        }
        .why-diff-card-title {
          font-family: 'DM Serif Display', Georgia, serif;
          font-size: 22px;
          line-height: 1.08;
          color: #ffffff;
          margin: 0 0 10px;
          letter-spacing: -0.3px;
        }
        .why-diff-card-text {
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.64);
          margin: 0;
        }
        @media (max-width: 980px) {
          .why-diff-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .why-diff-grid {
            grid-template-columns: 1fr;
          }
          .why-diff-container {
            padding: 56px 20px;
          }
        }
      `}</style>

      <div className="why-diff-container">
        <div className="why-diff-header">
          <div className="vp-section-kicker">La differenza</div>
          <h2 id="why-different-title" className="vp-section-title">
            Perche VolantiniPro e diverso
          </h2>
          <p className="vp-section-copy">
            Analizziamo il territorio prima della campagna, poi costruiamo copertura, quantita e report operativo.
          </p>
        </div>

        <div className="why-diff-grid">
          {CARDS.map((card) => (
            <article key={card.title} className="why-diff-card">
              <div className="why-diff-icon-badge">{card.icon}</div>
              <div>
                <h3 className="why-diff-card-title">{card.title}</h3>
                <p className="why-diff-card-text">{card.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
