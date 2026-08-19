import React from "react";
import { C, F } from "../../../../lib/constants.js";

export function Step2BottomActions({
  step2ZonesReady,
  coverageDecisionReady,
  canContinueCalendar,
  handleNext,
  col,
  continueLabel,
  operationalSelectionReady,
  isMovementStep2,
  isBusinessStep2
}) {
  return (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: "auto"
          }}>

            {step2ZonesReady && !coverageDecisionReady && <div style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(251,191,36,.08)",
              border: "1px solid rgba(251,191,36,.22)",
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.7)",
              lineHeight: 1.5,
              textAlign: "center"
            }}>
                Scegli come gestire la copertura parziale.
              </div>}
            {step2ZonesReady && <div style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(34,197,94,.07)",
              border: "1px solid rgba(34,197,94,.18)",
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.65)",
              lineHeight: 1.5,
              textAlign: "center"
            }}>
                La quantità selezionata verrà utilizzata nel preventivo. Potrai ancora modificarla prima della conferma.
              </div>}
            <button className="btn" onClick={handleNext} disabled={!canContinueCalendar} style={{
              width: "100%",
              minHeight: 52,
              padding: "0 16px",
              borderRadius: 12,
              border: canContinueCalendar ? "1px solid rgba(255,255,255,0.18)" : "none",
              background: canContinueCalendar ? col : "rgba(255,255,255,.08)",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 14,
              fontWeight: 900,
              cursor: canContinueCalendar ? "pointer" : "not-allowed",
              boxShadow: canContinueCalendar ? `0 4px 16px ${col}66` : "none",
              textAlign: "center",
              transition: "all .2s ease"
            }}>
              {continueLabel}
            </button>
            {step2ZonesReady && !operationalSelectionReady && (isMovementStep2 || isBusinessStep2) && <div style={{
              padding: "9px 11px",
              borderRadius: 9,
              background: "rgba(245,158,11,.08)",
              border: "1px solid rgba(245,158,11,.22)",
              fontFamily: F.sans,
              fontSize: 10,
              color: "#FCD34D",
              lineHeight: 1.45,
              textAlign: "center"
            }}>
                {isBusinessStep2 ? "Seleziona almeno un’attività sulla mappa e assegnala a un addetto." : "Seleziona almeno un punto sulla mappa e assegnalo a un promoter."}
              </div>}
            {!step2ZonesReady && <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              color: "rgba(255,255,255,.35)",
              textAlign: "center",
              lineHeight: 1.5,
              padding: "0 4px"
            }}>
                Assicurati che tutte le zone abbiano un'area geografica e una quantità di volantini valida.
              </div>}
          </div>

  );
}
