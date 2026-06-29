import React from "react";
import { motion } from "framer-motion";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C = { navy: "#0B1020", navyCard: "#122036", white: "#F8FAFC", muted: "#94A3B8", orange: "#E8571A", border: "rgba(255, 255, 255, 0.08)" };

const EDUCATION_CARDS = [
  {
    icon: "📍",
    title: "Copertura",
    subtitle: "Spiega quante famiglie puoi raggiungere.",
    what: "È la percentuale dell'area selezionata che copriremo con i tuoi volantini.",
    why: "Evita di stampare troppo o troppo poco rispetto alle case esistenti.",
    benefit: "Ti garantisce di raggiungere il maggior numero di potenziali clienti senza sprechi di carta."
  },
  {
    icon: "🏠",
    title: "Famiglie",
    subtitle: "Stima delle abitazioni interessate.",
    what: "Il numero stimato di nuclei familiari residenti nella zona scelta.",
    why: "Traduce una superficie geografica in persone reali che leggeranno la tua offerta.",
    benefit: "Ti permette di misurare esattamente il ritorno potenziale sull'investimento."
  },
  {
    icon: "🗺️",
    title: "Zone",
    subtitle: "Le aree realmente coperte.",
    what: "La suddivisione del territorio in quartieri operativi organizzati.",
    why: "Consente ai distributori di procedere via per via con ordine e precisione.",
    benefit: "Sai sempre con esattezza in quali quartieri è arrivato il tuo messaggio promozionale."
  },
  {
    icon: "📡",
    title: "GPS",
    subtitle: "Verifica del lavoro svolto.",
    what: "Registrazione satellitare del percorso effettuato dalle squadre di consegna.",
    why: "Elimina qualsiasi dubbio sulla reale avvenuta distribuzione dei volantini.",
    benefit: "Hai la prova concreta e trasparente che il lavoro per cui hai pagato è stato eseguito a regola d'arte."
  },
  {
    icon: "📄",
    title: "Report",
    subtitle: "Documento finale con risultati e prove.",
    what: "Un riepilogo in PDF con mappe, orari di completamento e scatti fotografici.",
    why: "Documenta in modo ufficiale l'esito della campagna promozionale.",
    benefit: "Puoi archiviare e analizzare i risultati per pianificare al meglio le tue vendite future."
  },
  {
    icon: "🤖",
    title: "AI",
    subtitle: "Ottimizza automaticamente la distribuzione.",
    what: "Il nostro assistente intelligente che analizza date, quantità e territorio.",
    why: "Elabora in secondi calcoli complessi che richiederebbero ore di studio.",
    benefit: "Ti consiglia la soluzione più efficace per far fruttare al massimo il tuo budget."
  }
];

export default function CustomerEducationSection() {
  return (
    <section className="section" style={{ background: C.navy, padding: "80px 28px", borderTop: `1px solid ${C.border}`, color: C.white }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(232, 87, 26, 0.12)", border: "1px solid rgba(232, 87, 26, 0.3)", color: C.orange, fontFamily: F.sans, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 16 }}>
            <span>💡</span> TRASPARENZA & BENEFICI CONCRETI
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: 44, color: C.white, letterSpacing: "-1.2px", marginBottom: 14 }}>
            Come leggere i risultati della tua campagna
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 17, color: C.muted, maxWidth: 660, margin: "0 auto", lineHeight: 1.6 }}>
            Nessun termine complicato. Ogni dato che ti mostriamo è pensato per rispondere a tre semplici domande: <strong style={{ color: C.white }}>Che cos'è? Perché è importante? Come mi aiuta?</strong>
          </p>
        </div>

        {/* Grid Card */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
          {EDUCATION_CARDS.map((card, idx) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, delay: idx * 0.05 }}
              whileHover={{ y: -4, borderColor: "rgba(232, 87, 26, 0.4)" }}
              style={{
                background: C.navyCard,
                border: `1px solid ${C.border}`,
                borderRadius: 20,
                padding: "30px",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 16px 32px rgba(0,0,0,0.2)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 32, lineHeight: 1 }}>{card.icon}</span>
                <div>
                  <h3 style={{ fontFamily: F.serif, fontSize: 24, color: C.white, margin: 0 }}>{card.title}</h3>
                  <div style={{ fontFamily: F.sans, fontSize: 13, color: C.orange, fontWeight: 700 }}>{card.subtitle}</div>
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0 16px" }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: F.sans, fontSize: 14, color: "#CBD5E1", lineHeight: 1.5 }}>
                <div>
                  <strong style={{ color: C.white }}>🔹 Che cos'è: </strong> {card.what}
                </div>
                <div>
                  <strong style={{ color: C.white }}>⭐ Perché è importante: </strong> {card.why}
                </div>
                <div style={{ background: "rgba(232, 87, 26, 0.08)", padding: "12px", borderRadius: 10, borderLeft: `3px solid ${C.orange}`, color: "#F8FAFC", marginTop: 4 }}>
                  <strong>🎯 Il tuo vantaggio: </strong> {card.benefit}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
