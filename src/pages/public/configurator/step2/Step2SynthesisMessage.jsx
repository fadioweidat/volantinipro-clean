import React from "react";
import { C, F } from "../../../../lib/constants.js";

export function Step2SynthesisMessage({
  step2TruthModel,
  step2ViewModel,
  formatIntegerIT,
  isResidentialStep2,
  missingFlyers,
  step2CoverageFullLabel,
  step2RequirementContextLabel,
  isMovementStep2,
  pois,
  transportState
}) {
  return (
                <> {(() => {
                const insQty = step2TruthModel.quantity.current;
                const recQty = step2TruthModel.quantity.recommendedRequirement;
                const covPct = step2TruthModel.coverage.operationalPct || 0;
                const insFmt = formatIntegerIT(insQty);
                const areaLbl = step2ViewModel.primaryAreaLabel || "questa zona";
                let summaryMsg = "";
                if (isResidentialStep2) {
                  if (!step2ViewModel.hasUsableCoverageData) {
                    summaryMsg = `I dati territoriali necessari non sono disponibili per ${areaLbl}. Copertura, fabbisogno e quantità residua non vengono calcolati.`;
                  } else if (missingFlyers > 0) {
                    summaryMsg = `Con ${insFmt} volantini il sistema concentrera la distribuzione nelle zone con maggiore priorita e coprira ${step2CoverageFullLabel || "una quota non calcolabile del fabbisogno operativo"}. Denominatore: ${step2RequirementContextLabel}. Per una copertura completa del territorio sono stimati ${formatIntegerIT(recQty)} volantini.`;
                  } else if (insQty > recQty && recQty > 0) {
                    const surplus = insQty - recQty;
                    summaryMsg = `Con ${insFmt} volantini copri interamente ${areaLbl}. Restano ${formatIntegerIT(surplus)} volantini che puoi utilizzare per ampliare l'area.`;
                  } else {
                    summaryMsg = `Con ${insFmt} volantini copri interamente ${areaLbl}.`;
                  }
                } else if (isMovementStep2) {
                  summaryMsg = pois.length > 0 || transportState?.available ? `Lo scenario da ${insFmt} volantini considera i POI e i nodi TPL effettivamente restituiti in ${areaLbl}; non rappresenta un conteggio di passanti.` : `Lo scenario da ${insFmt} volantini è parziale: POI e trasporto non sono disponibili per ${areaLbl}.`;
                } else {
                  summaryMsg = pois.length > 0 ? `Lo scenario da ${insFmt} volantini usa le attività POI restituite per ${areaLbl}; non equivale a un censimento completo di imprese o uffici.` : `Lo scenario da ${insFmt} volantini è parziale: censimento imprese, uffici e aree produttive non disponibile.`;
                }
                return <div style={{
                  marginTop: 14,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(56,189,248,.08)",
                  border: "1px solid rgba(56,189,248,.22)",
                  fontFamily: F.sans,
                  fontSize: 11.5,
                  color: "rgba(255,255,255,.88)",
                  lineHeight: 1.45
                }}>
                      <div>{summaryMsg}</div>
                      {step2TruthModel.zones.firstPriority && <div style={{
                    marginTop: 7,
                    color: "rgba(255,255,255,.62)"
                  }}>
                          Prima priorità: <b style={{
                      color: C.white
                    }}>{step2TruthModel.zones.firstPriority.name}</b>. Criterio: ordine di allocazione corrente condiviso con il Report Avanzato.
                        </div>}
                    </div>;
              })()}
</>
  );
}
