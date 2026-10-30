import React, { useEffect, useRef } from "react";
import { C, F } from "../lib/constants.js";
import { SERVICE_DRAFT_LABELS } from "../lib/configuratorState.js";

/** Bozza di un altro servizio: il cliente sceglie, nessuna sovrascrittura silenziosa. */
export function ServiceDraftDialog({ choice, onContinue, onStartNew }) {
  const continueRef = useRef(null);
  useEffect(() => { continueRef.current?.focus(); }, []);
  const from = SERVICE_DRAFT_LABELS[choice.from];
  // Stesso servizio o nessun servizio indicato: si parla di un preventivo nuovo.
  const to = choice.to && choice.to !== choice.from ? SERVICE_DRAFT_LABELS[choice.to] : null;
  const current = from ? `un preventivo ${from}` : "un preventivo";
  const button = { minHeight: 44, padding: "10px 18px", borderRadius: 10, fontFamily: F.sans, fontSize: 14, fontWeight: 800, cursor: "pointer" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(5,10,20,.72)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="service-draft-title" style={{ width: "100%", maxWidth: 460, boxSizing: "border-box", padding: 24, borderRadius: 16, background: "#121B2A", border: "1px solid rgba(255,255,255,.12)" }}>
        <p id="service-draft-title" style={{ fontFamily: F.sans, fontSize: 17, fontWeight: 700, lineHeight: 1.45, color: C.white, margin: "0 0 18px" }}>
          Hai {current} in corso: vuoi continuarlo o {to ? `iniziare ${to}` : "iniziarne uno nuovo"}?
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button ref={continueRef} type="button" onClick={onContinue} style={{ ...button, flex: "1 1 180px", border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: C.white }}>
            {from ? `Continua ${from}` : "Continua"}
          </button>
          <button type="button" onClick={onStartNew} style={{ ...button, flex: "1 1 180px", border: "none", background: "#C2410C", color: "#fff" }}>
            {to ? `Inizia ${to}` : "Inizia nuovo"}
          </button>
        </div>
      </div>
    </div>
  );
}
