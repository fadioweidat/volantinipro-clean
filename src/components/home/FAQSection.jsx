import React, { useState } from "react";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const CO = "#E8571A";

const faqs = [
  {
    q: "Come funziona il configuratore in 4 step?",
    a: "Scegli il servizio (Door to Door, Hand to Hand o Business Distribution), definisci la zona tramite mappa interattiva, seleziona le date operative dal calendario e ricevi un preventivo completo con riepilogo, costi e analisi territoriale.",
  },
  {
    q: "Cos'e lo Smart Pairing?",
    a: "Smart Pairing e un sistema che abbina la tua campagna a un'altra gia attiva nella stessa zona e nello stesso periodo. Questo riduce i costi operativi di distribuzione e ti permette di ottenere uno sconto automatico fino al 20%.",
  },
  {
    q: "I dati sulle famiglie e la popolazione sono aggiornati?",
    a: "Si. Utilizziamo dati ISTAT ufficiali integrati con fonti GIS e analisi territoriali interne. I dati vengono aggiornati periodicamente e riflettono la distribuzione reale delle famiglie per comune e sezione di censimento.",
  },
  {
    q: "Posso distribuire in piu comuni contemporaneamente?",
    a: "Assolutamente. Puoi impostare un raggio di distribuzione attorno a un comune e il sistema identifica automaticamente tutti i comuni nel raggio, mostrando famiglie stimate e percentuale di copertura per ognuno.",
  },
  {
    q: "Il preventivo e vincolante?",
    a: "No. Il preventivo generato dalla piattaforma e indicativo e non comporta alcun obbligo. Serve a darti una stima chiara prima di procedere. Puoi richiedere conferma operativa contattando il team o tramite il form dedicato.",
  },
  {
    q: "Sono previsti costi mensili o abbonamenti?",
    a: "No. VolantiniPro non prevede abbonamenti mensili obbligatori. Paghi solo per le campagne che configuri e attivi, senza vincoli di continuita o costi fissi.",
  },
  {
    q: "Cosa include il report post-campagna?",
    a: "Il report include: zona coperta con mappa, famiglie raggiunte stimate, date operative effettive, tracking GPS se previsto dal servizio, e un riepilogo dei comuni coinvolti. E scaricabile in formato PDF.",
  },
  {
    q: "Posso usare la piattaforma senza creare un account?",
    a: "Si. Il configuratore e accessibile senza registrazione. Puoi completare i 4 step e ricevere un preventivo completo. L'account e necessario solo per salvare campagne, accedere ai report e gestire lo storico.",
  },
];

function ChevronIcon({ open }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ transition: "transform .28s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
      <path d="M4.5 6.75L9 11.25L13.5 6.75" stroke={open ? CO : "rgba(255,255,255,.38)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FAQSection() {
  const [open, setOpen] = useState(null);

  return (
    <section style={{ background: "#0d1420", padding: "96px 28px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 58 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: CO, marginBottom: 16 }}>
            FAQ
          </div>
          <h2 style={{ fontFamily: F.serif, fontSize: "clamp(34px, 3vw, 52px)", lineHeight: 1.08, color: "#f8fafc", letterSpacing: "-0.03em", margin: 0 }}>
            Domande frequenti
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.65, color: "rgba(226,232,240,.5)", marginTop: 16, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
            Tutto quello che devi sapere sulla piattaforma, i servizi e il processo di configurazione.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                style={{
                  borderRadius: 14,
                  background: isOpen ? "rgba(232,87,26,.06)" : "rgba(255,255,255,.04)",
                  border: isOpen ? `1px solid ${CO}40` : "1px solid rgba(255,255,255,.07)",
                  overflow: "hidden",
                  transition: "border-color .22s, background .22s",
                }}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "18px 22px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 700, color: isOpen ? "#f8fafc" : "rgba(248,250,252,.78)", lineHeight: 1.4 }}>
                    {faq.q}
                  </span>
                  <ChevronIcon open={isOpen} />
                </button>
                {isOpen && (
                  <div style={{ padding: "0 22px 20px", fontFamily: F.sans, fontSize: 14, lineHeight: 1.72, color: "rgba(226,232,240,.6)" }}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
