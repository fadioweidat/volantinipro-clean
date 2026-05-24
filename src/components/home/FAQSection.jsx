import React, { useState } from "react";
import Button from "../ui/Button.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const CO = "#E8571A";

const faqs = [
  {
    q: "Come funziona il configuratore in 4 step?",
    a: "Scegli servizio, zona, date operative e ricevi un preventivo completo con costi e analisi territoriale. In ogni passaggio vedi solo le informazioni utili per decidere senza perdere tempo. Scopri di piu nel configuratore →",
  },
  {
    q: "Cos'e lo Smart Pairing?",
    a: "Smart Pairing abbina la tua campagna a un'altra gia attiva nella stessa zona e nello stesso periodo. In questo modo condividi parte dei costi operativi e puoi risparmiare fino al 40%. Scopri di piu nel configuratore →",
  },
  {
    q: "I dati sulle famiglie e la popolazione sono aggiornati?",
    a: "Usiamo dati ISTAT, fonti GIS e analisi territoriali interne per stimare famiglie, popolazione e copertura. Le stime vengono aggiornate periodicamente e servono a costruire campagne piu precise. Scopri di piu nel configuratore →",
  },
  {
    q: "Posso distribuire in piu comuni contemporaneamente?",
    a: "Si, puoi impostare un raggio di distribuzione e valutare automaticamente i comuni vicini. La piattaforma mostra famiglie stimate, copertura e volumi consigliati per ogni area. Scopri di piu nel configuratore →",
  },
  {
    q: "Il preventivo e vincolante?",
    a: "No, il preventivo serve a darti una stima chiara prima di confermare la campagna. La conferma operativa avviene solo dopo la revisione del team e la disponibilita delle date. Scopri di piu nel configuratore →",
  },
  {
    q: "Sono previsti costi mensili o abbonamenti?",
    a: "No, non ci sono abbonamenti obbligatori o costi fissi mensili. Paghi solo le campagne che decidi di attivare, con budget e servizio scelti da te. Scopri di piu nel configuratore →",
  },
  {
    q: "Cosa include il report post-campagna?",
    a: "Il report include mappa della zona coperta, famiglie raggiunte stimate, date operative e tracking GPS quando previsto dal servizio. Puoi usarlo per condividere risultati chiari con soci, team o direzione. Scopri di piu nel configuratore →",
  },
  {
    q: "Posso usare la piattaforma senza creare un account?",
    a: "Si, puoi configurare una campagna e ottenere una stima senza registrarti. L'account serve solo per salvare campagne, gestire lo storico e accedere ai report post-campagna. Scopri di piu nel configuratore →",
  },
];

function ToggleIcon({ open }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 26,
        height: 26,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        color: CO,
        fontFamily: F.sans,
        fontSize: 24,
        lineHeight: 1,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform .3s ease",
        flexShrink: 0,
      }}
    >
      {open ? "−" : "+"}
    </span>
  );
}

export default function FAQSection({ onContact }) {
  const [open, setOpen] = useState(0);

  return (
    <section className="section" style={{ background: "#FAF9F7", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box" }}>
      <div className="faq-layout" style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="faq-sticky">
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: CO, marginBottom: 16 }}>
            DOMANDE FREQUENTI
          </div>
          <h2 className="landing-h2" style={{ fontFamily: F.serif, fontSize: 48, lineHeight: 1.08, color: "#1A1A1A", letterSpacing: "-0.03em", margin: 0 }}>
            Tutto quello che devi<br />sapere su VolantiniPro.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "rgba(0,0,0,.6)", margin: "22px 0 28px", maxWidth: 360 }}>
            Non trovi la risposta che cerchi?<br />Scrivici, rispondiamo entro 2 ore.
          </p>
          <Button variant="primary" onClick={onContact} style={{ minHeight: 48, padding: "0 24px", fontSize: 15 }}>
            Contattaci →
          </Button>
        </div>

        <div>
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div key={faq.q} className="faq-row">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 18,
                    padding: "24px 18px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    minHeight: 76,
                  }}
                >
                  <span style={{ fontFamily: F.sans, fontSize: 17, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.35 }}>
                    {faq.q}
                  </span>
                  <ToggleIcon open={isOpen} />
                </button>
                <div
                  style={{
                    maxHeight: isOpen ? 180 : 0,
                    opacity: isOpen ? 1 : 0,
                    overflow: "hidden",
                    transition: "max-height .3s ease, opacity .3s ease",
                  }}
                >
                  <p style={{ margin: "0 18px 24px", fontFamily: F.sans, fontSize: 15, lineHeight: 1.6, color: "rgba(0,0,0,.7)" }}>
                    {faq.a}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
