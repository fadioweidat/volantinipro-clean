import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const KPI_DICTIONARY = {
  "Copertura": "Percentuale dell'area che può essere raggiunta con la quantità di volantini scelta.",
  "Famiglie": "Stima delle famiglie che possono ricevere il tuo volantino.",
  "Zone": "Numero delle aree incluse nella distribuzione.",
  "GPS": "Il percorso degli operatori viene registrato per documentare l'attività svolta.",
  "Report PDF": "Al termine della campagna riceverai un report con risultati, foto e dati della distribuzione.",
  "Report": "Al termine della campagna riceverai un report con risultati, foto e dati della distribuzione.",
  "Smart Pairing": "L'AI cerca campagne compatibili per ridurre costi e ottimizzare la distribuzione.",
  "Affidabilità": "Indica l'affidabilità della stima elaborata utilizzando dati territoriali aggiornati.",
  "Risparmio": "Ottimizzazione sui costi logistici resa possibile accorpando uscite compatibili.",
  "Monitoraggio": "Controllo stradale del lavoro svolto dalle squadre operative.",
  "AI": "Ottimizza automaticamente la pianificazione per raggiungere più persone al minor costo.",
  "Volantini": "Numero totale di copie stampate e distribuite al target selezionato."
};

export default function KpiTooltip({ term, text, tip, color, style = {} }) {
  const [open, setOpen] = useState(false);
  const explanation = tip || text || KPI_DICTIONARY[term] || "Dato calcolato per aiutarti a pianificare la tua campagna in modo chiaro.";
  const title = term || "Spiegazione";

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 6, verticalAlign: "middle", zIndex: open ? 9999 : 1, ...style }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(!open);
      }}
    >
      <button
        type="button"
        aria-label={`Spiegazione per ${title}`}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "rgba(232, 87, 26, 0.15)",
          border: "1px solid rgba(232, 87, 26, 0.4)",
          color: color || "#E8571A",
          fontSize: 10,
          fontWeight: 800,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
          lineHeight: 1
        }}
      >
        ⓘ
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              width: 240,
              background: "#0B1020",
              border: "1px solid #E8571A",
              borderRadius: 10,
              padding: "10px 12px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.8)",
              zIndex: 9999,
              pointerEvents: "none",
              textAlign: "left",
              whiteSpace: "normal"
            }}
          >
            {term && (
              <div style={{ fontSize: 10, fontWeight: 800, color: "#E8571A", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>
                {term}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#F8FAFC", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4, fontWeight: 400 }}>
              {explanation}
            </div>
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: "50%",
                transform: "translateX(-50%)",
                borderWidth: 5,
                borderStyle: "solid",
                borderColor: "#E8571A transparent transparent transparent"
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
