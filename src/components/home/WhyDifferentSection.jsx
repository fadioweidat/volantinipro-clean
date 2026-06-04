import React from "react";

const CARDS = [
  {
    title: "Dati ISTAT Reali",
    desc: "Famiglie, popolazione, densità abitativa e dati territoriali reali.",
    icon: "📊"
  },
  {
    title: "Analisi Territoriale",
    desc: "Comune, raggio, copertura stimata e volantini consigliati.",
    icon: "🗺️"
  },
  {
    title: "Tracking GPS",
    desc: "Monitoraggio operatori, percorsi e prove fotografiche.",
    icon: "📍"
  },
  {
    title: "Report e Prove",
    desc: "Report finali, evidenze fotografiche e risultati verificabili.",
    icon: "📄"
  }
];

export default function WhyDifferentSection() {
  return (
    <section className="why-different-section" aria-labelledby="why-different-title" style={{ background: "#111827", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Scoped Styles for Redesigned 2x2 Grid Section */}
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
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        .why-diff-card {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.015) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 32px;
          display: flex;
          gap: 20px;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
        }
        .why-diff-card:hover {
          transform: translateY(-4px);
          border-color: rgba(232, 87, 26, 0.4);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%);
          box-shadow: 0 15px 30px rgba(232, 87, 26, 0.08), 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        .why-diff-icon-badge {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(232, 87, 26, 0.12);
          border: 1px solid rgba(232, 87, 26, 0.22);
          font-size: 22px;
          flex-shrink: 0;
          color: #E8571A;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .why-diff-card-content {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .why-diff-card-title {
          font-family: 'DM Serif Display', Georgia, serif;
          font-size: 21px;
          color: #ffffff;
          margin: 0 0 8px 0;
          letter-spacing: -0.3px;
        }
        .why-diff-card-text {
          font-family: 'DM Sans', sans-serif;
          font-size: 14.5px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.64);
          margin: 0;
        }
        @media (max-width: 768px) {
          .why-diff-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .why-diff-card {
            padding: 24px;
            flex-direction: column;
            gap: 16px;
          }
          .why-diff-container {
            padding: 56px 20px;
          }
        }
      `}</style>

      <div className="why-diff-container">
        {/* Heading */}
        <div className="why-diff-header">
          <div className="vp-section-kicker">La differenza</div>
          <h2 id="why-different-title" className="vp-section-title" style={{ color: "#ffffff", marginBottom: 12 }}>
            Perché VolantiniPro è diverso
          </h2>
          <p className="vp-section-copy" style={{ color: "rgba(255, 255, 255, 0.58)", margin: 0 }}>
            Non è solo distribuzione. È pianificazione territoriale misurabile.
          </p>
        </div>

        {/* 2x2 Grid of Premium Cards */}
        <div className="why-diff-grid">
          {CARDS.map((card) => (
            <article key={card.title} className="why-diff-card">
              <div className="why-diff-icon-badge">
                {card.icon}
              </div>
              <div className="why-diff-card-content">
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
