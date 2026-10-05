import React from "react";
import { C, F } from "../../../../lib/constants.js";
import { formatNumber } from "../../../../lib/utils/format.js";

// FASE 1 MULTI-ZONE: elenco delle zone che compongono il preventivo, con
// quantita' e capacita' per zona. Le famiglie totali sono una somma di zona:
// se le zone si sovrappongono la somma NON e' deduplicata e lo diciamo.
export function Step4MultiZoneSummary({ summary }) {
  if (!summary?.isMultiZone) return null;
  const zoneById = new Map(summary.zones.map(z => [z.id, z]));
  return <div data-testid="step4-multizone-summary" style={{
    margin: "0 0 14px",
    padding: "12px 14px",
    borderRadius: 10,
    background: "rgba(255,255,255,.025)",
    border: "1px solid rgba(255,255,255,.08)",
    fontFamily: F.sans
  }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,.45)", marginBottom: 8 }}>
        {summary.zoneCount} zone nel preventivo
      </div>
      {summary.zones.map(z => <div key={z.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: "1px solid rgba(255,255,255,.05)", fontSize: 12, color: C.white }}>
          <span style={{ fontWeight: 700 }}>
            {z.label}
            <span style={{ fontWeight: 500, color: "rgba(255,255,255,.5)" }}>
              {z.searchMode === "address" && z.radiusKm ? ` · raggio ${formatNumber(z.radiusKm)} km` : z.searchMode === "cap" ? " · CAP" : z.source?.nilManualMode || z.source?.kpiSnapshot?.areaMode === "custom_zone" ? " · NIL / quartieri" : " · comune"}
            </span>
          </span>
          <span style={{ whiteSpace: "nowrap" }}>
            {formatNumber(z.quantity, "—")} pz · {formatNumber(z.families, "—")} famiglie
          </span>
        </div>)}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.12)", fontSize: 12, fontWeight: 800, color: C.white }}>
        <span>Totale</span>
        <span>{formatNumber(summary.totalQuantity, "—")} pz · {formatNumber(summary.totalFamilies, "—")} famiglie{summary.hasOverlap ? " (non deduplicate)" : ""}</span>
      </div>
      {summary.hasOverlap && <div role="status" data-testid="step4-multizone-overlap-warning" style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(251,191,36,.45)", background: "rgba(251,191,36,.08)", color: "#FDE68A", fontSize: 11.5, lineHeight: 1.45 }}>
          <strong>Zone sovrapposte:</strong> {summary.overlaps.map(o => `${zoneById.get(o.zoneAId)?.label || "Zona"} / ${zoneById.get(o.zoneBId)?.label || "Zona"}`).join("; ")}.
          Famiglie e copertura sono la somma delle singole zone e non sono deduplicate: nell'area comune il conteggio può essere doppio. La quantità e il prezzo corrispondono ai volantini richiesti per ciascuna zona.
        </div>}
    </div>;
}
