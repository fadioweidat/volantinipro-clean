import React from "react";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };

const stories = [
  {
    metric: "+31%",
    label: "richieste tracciate",
    quote: "Campagna food locale con tracciamento GPS e report finale confrontato sulle richieste arrivate nel periodo.",
    name: "Caso food locale",
    role: "Door to Door + Smart Pairing",
    place: "Nord Milano",
    initials: "01",
    accent: "#6366F1",
  },
  {
    metric: "-22%",
    label: "costo operativo",
    quote: "Abbinamento su calendario condiviso: stesso passaggio operativo, budget ridotto e copertura mantenuta.",
    name: "Caso retail locale",
    role: "Smart Pairing",
    place: "Area Milano",
    initials: "02",
    accent: "#06B6D4",
  },
  {
    metric: "96%",
    label: "tracce GPS valide",
    quote: "Report operativo post-campagna con passaggi verificabili, zone coperte e anomalie escluse dal riepilogo.",
    name: "Caso servizi locali",
    role: "Report GPS",
    place: "Lombardia",
    initials: "03",
    accent: "#22C55E",
  },
];

export default function RisultatiSection() {
  return (
    <section className="section" style={{ background: "#0B1020", paddingLeft: 28, paddingRight: 28, borderTop: "1px solid rgba(148,163,184,0.18)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 58 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#06B6D4", marginBottom: 14 }}>
            PROVE OPERATIVE
          </div>
          <h2 className="landing-h2" style={{ fontFamily: F.serif, fontSize: 48, lineHeight: 1.08, color: "#F8FAFC", letterSpacing: "-.03em", margin: 0 }}>
            Risultati misurati, non promessi.
          </h2>
          <p style={{ margin: "16px auto 0", maxWidth: 560, fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "#94A3B8" }}>
            Casi operativi anonimizzati, metriche leggibili e dati verificabili dal report finale.
          </p>
        </div>

        <div className="results-grid">
          {stories.map((story) => (
            <article key={story.name} className="testimonial-card" style={{ background: "#182235", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 20, padding: "36px 32px" }}>
              <div style={{ fontFamily: F.serif, fontSize: 56, lineHeight: 1, color: story.accent, letterSpacing: "-.04em", marginBottom: 8 }}>
                {story.metric}
              </div>
              <div style={{ fontFamily: F.sans, fontSize: 14, color: "#CBD5E1", marginBottom: 26 }}>
                {story.label}
              </div>
              <div style={{ width: 40, height: 2, background: story.accent, marginBottom: 28 }} />
              <blockquote style={{ margin: "0 0 34px", fontFamily: F.sans, fontSize: 16, fontStyle: "italic", lineHeight: 1.65, color: "#CBD5E1" }}>
                "{story.quote}"
              </blockquote>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "auto" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${story.accent}22`, color: story.accent, display: "grid", placeItems: "center", fontFamily: F.sans, fontSize: 12, fontWeight: 900 }}>
                  {story.initials}
                </div>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 800, color: "#F8FAFC" }}>{story.name}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: "#94A3B8", lineHeight: 1.5 }}>{story.role}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: "#94A3B8", lineHeight: 1.5 }}>{story.place}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
