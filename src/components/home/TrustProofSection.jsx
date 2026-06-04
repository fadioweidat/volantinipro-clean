import React from "react";

const STEPS = [
  {
    num: "01",
    title: "Analizza",
    desc: "Analisi territorio, famiglie, densità e copertura.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        <line x1="11" y1="8" x2="11" y2="14"></line>
        <line x1="8" y1="11" x2="14" y2="11"></line>
      </svg>
    )
  },
  {
    num: "02",
    title: "Pianifica",
    desc: "Definizione raggio, quantità e strategia.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
    )
  },
  {
    num: "03",
    title: "Prenota",
    desc: "Configurazione campagna e richiesta preventivo.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
      </svg>
    )
  },
  {
    num: "04",
    title: "Distribuisci",
    desc: "Esecuzione operativa con GPS e monitoraggio.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="2" ry="2"></rect>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
        <circle cx="5.5" cy="18.5" r="2.5"></circle>
        <circle cx="18.5" cy="18.5" r="2.5"></circle>
      </svg>
    )
  },
  {
    num: "05",
    title: "Verifica",
    desc: "Report finali, prove fotografiche e risultati.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
    )
  }
];

export default function TrustProofSection() {
  return (
    <section className="section" style={{ background: "#0d1420", paddingLeft: 28, paddingRight: 28, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      {/* Scoped CSS Styles for Step Timeline */}
      <style>{`
        .timeline-container {
          position: relative;
          margin-top: 48px;
        }
        .timeline-line {
          position: absolute;
          top: 28px; /* Center horizontally with the 56px height badge */
          left: 10%;
          right: 10%;
          height: 2px;
          background: linear-gradient(90deg, rgba(232,87,26,0.05), rgba(232,87,26,0.6) 20%, rgba(232,87,26,0.6) 80%, rgba(232,87,26,0.05));
          z-index: 1;
        }
        .timeline-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 20px;
          position: relative;
          z-index: 2;
        }
        .timeline-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          transition: all 0.3s ease;
        }
        .timeline-badge-container {
          margin-bottom: 20px;
          position: relative;
        }
        .timeline-step-badge {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #111a2e;
          border: 2px solid rgba(232, 87, 26, 0.3);
          color: #E8571A;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 0 15px rgba(0,0,0,0.3);
        }
        .timeline-step:hover .timeline-step-badge {
          border-color: #E8571A;
          background: rgba(232, 87, 26, 0.15);
          box-shadow: 0 0 20px rgba(232, 87, 26, 0.4);
          transform: scale(1.1);
          color: #ffffff;
        }
        .timeline-card-body {
          background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.012) 100%);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 16px;
          padding: 24px 20px;
          width: 100%;
          min-height: 172px;
          display: flex;
          flex-direction: column;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
        }
        .timeline-step:hover .timeline-card-body {
          border-color: rgba(232, 87, 26, 0.3);
          background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
          box-shadow: 0 12px 28px rgba(0,0,0,0.25);
        }
        .timeline-step-num {
          display: block;
          font-family: 'DM Sans', sans-serif;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #E8571A;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .timeline-step-title {
          font-family: 'DM Serif Display', Georgia, serif;
          font-size: 20px;
          color: #ffffff;
          margin: 0 0 10px 0;
          letter-spacing: -0.3px;
        }
        .timeline-step-text {
          font-family: 'DM Sans', sans-serif;
          font-size: 13.5px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.65);
          margin: 0;
        }

        @media (max-width: 1024px) {
          .timeline-line {
            top: 20px;
            bottom: 20px;
            left: 28px;
            width: 2px;
            height: auto;
            right: auto;
            background: linear-gradient(180deg, rgba(232,87,26,0.05), rgba(232,87,26,0.6) 20%, rgba(232,87,26,0.6) 80%, rgba(232,87,26,0.05));
          }
          .timeline-grid {
            grid-template-columns: 1fr;
            gap: 24px;
          }
          .timeline-step {
            flex-direction: row;
            align-items: flex-start;
            text-align: left;
            gap: 20px;
            width: 100%;
          }
          .timeline-badge-container {
            margin-bottom: 0;
            flex-shrink: 0;
          }
          .timeline-card-body {
            min-height: auto;
          }
        }
      `}</style>

      <div className="vp-container vp-reveal">
        {/* Header */}
        <div style={{ marginBottom: 34 }}>
          <div className="vp-section-kicker">Affidabilità operativa</div>
          <h2 className="vp-section-title" style={{ color: "#f8fafc" }}>
            Tutto quello che serve per decidere, attivare e controllare la campagna.
          </h2>
          <p className="vp-section-copy" style={{ color: "rgba(226,232,240,.66)" }}>
            Nessun logo inventato e nessuna promessa vaga: la fiducia passa da dati leggibili,
            preventivo chiaro e prove operative verificabili.
          </p>
        </div>

        {/* Timeline Layout */}
        <div className="timeline-container">
          <div className="timeline-line" />
          <div className="timeline-grid">
            {STEPS.map((step, index) => (
              <div key={step.title} className="timeline-step">
                <div className="timeline-badge-container">
                  <div className="timeline-step-badge">
                    {step.icon}
                  </div>
                </div>
                <div className="timeline-card-body">
                  <span className="timeline-step-num">Step {step.num}</span>
                  <h3 className="timeline-step-title">{step.title}</h3>
                  <p className="timeline-step-text">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
