import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "../ui/Button.jsx";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const C_ORANGE = "#E8571A";

// Homepage: SOLO le 6 FAQ principali (ridotte da 12). Il set completo resta
// disponibile via "Vedi tutte le FAQ" (contatto diretto, nessuna nuova route).
const faqs = [
  {
    q: "Come funziona il configuratore?",
    a: "Scegli servizio, zona, date operative e ricevi un preventivo completo con costi e analisi territoriale. In ogni passaggio vedi solo le informazioni utili per decidere senza perdere tempo.",
  },
  {
    q: "Cos'è Smart Pairing?",
    a: "Smart Pairing è un'opportunità opzionale: quando esistono campagne compatibili nella stessa zona o in zone vicine, il sistema può proporti un abbinamento con vantaggio economico. Puoi sempre continuare scegliendo la tua data anche senza Smart Pairing.",
  },
  {
    q: "Come controllo la distribuzione?",
    a: "Dopo la conferma segui la campagna dalla Dashboard Cliente: stato di avanzamento, percorso GPS degli operatori, zone servite e prove fotografiche raccolte sul campo.",
  },
  {
    q: "Come funziona il Tracking GPS?",
    a: "Gli operatori ricevono il programma sul telefono, avviano la consegna e il percorso viene registrato via GPS. Nella dashboard vedi avanzamento, zone coperte e storico della distribuzione.",
  },
  {
    q: "Quali prove ricevo?",
    a: "Report fotografico con foto geolocalizzate, mappa delle zone effettivamente servite, percorso GPS e storico della distribuzione, raccolti in un unico report finale.",
  },
  {
    q: "Il preventivo è vincolante?",
    a: "No, il preventivo serve a darti una stima chiara prima di confermare la campagna. La conferma operativa avviene solo dopo la revisione del team e la disponibilità delle date.",
  },
];

function ToggleIcon({ open }) {
  return (
    <motion.span
      aria-hidden="true"
      animate={{ rotate: open ? 180 : 0 }}
      transition={{ duration: 0.18 }}
      style={{
        width: 28,
        height: 28,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: open ? "rgba(232, 87, 26, 0.15)" : "rgba(255, 255, 255, 0.05)",
        border: `1px solid ${open ? "rgba(232, 87, 26, 0.4)" : "rgba(255, 255, 255, 0.1)"}`,
        color: open ? C_ORANGE : "#F8FAFC",
        fontFamily: F.sans,
        fontSize: 20,
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {open ? "−" : "+"}
    </motion.span>
  );
}

export default function FAQSection({ onContact }) {
  const [open, setOpen] = useState(0);

  return (
    <section className="section-tight" style={{ background: "#111827", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
      <div className="faq-layout" style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="faq-sticky">
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: C_ORANGE, marginBottom: 16 }}>
            DOMANDE FREQUENTI
          </div>
          <h2 className="landing-h2" style={{ fontFamily: F.serif, fontSize: "clamp(30px, 3.6vw, 40px)", lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
            Le domande più frequenti.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 14.5, lineHeight: 1.6, color: "#94A3B8", margin: "16px 0 22px", maxWidth: 360 }}>
            Non trovi la risposta che cerchi?<br />Scrivici, rispondiamo entro 2 ore.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15 }} style={{ display: "inline-block" }}>
              <Button variant="secondary" onClick={onContact} style={{ minHeight: 46, padding: "0 22px", fontSize: 13.5, fontWeight: 700, borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(255, 255, 255, 0.04)" }}>
                Contattaci →
              </Button>
            </motion.div>
            <Button variant="ghost" onClick={onContact} style={{ minHeight: 46, padding: "0 10px", fontSize: 13.5, fontWeight: 700, color: "#94A3B8" }}>
              Vedi tutte le FAQ →
            </Button>
          </div>
        </div>

        <div>
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div key={faq.q} className="faq-row" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
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
                  <span style={{ fontFamily: F.sans, fontSize: 17, fontWeight: 700, color: "#F8FAFC", lineHeight: 1.35 }}>
                    {faq.q}
                  </span>
                  <ToggleIcon open={isOpen} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: "easeInOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <p style={{ margin: "0 18px 24px", fontFamily: F.sans, fontSize: 15, lineHeight: 1.6, color: "#CBD5E1" }}>
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
