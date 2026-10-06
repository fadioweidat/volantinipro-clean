import React from "react";
import { C, F } from "../../../../lib/constants.js";
import { formatNumber } from "../../../../lib/utils/format.js";
import { formatQuoteCurrency } from "../../../../lib/quotePricing.js";

// FASE 2 — riepilogo PUNTI VENDITA. Solo presentazione: quantita', famiglie e
// prezzi arrivano gia' calcolati (summarizeCampaignZones /
// buildPointOfSalePricing / calculateQuotePricing di Step4). Le famiglie totali
// sono una somma di PV: se i territori si sovrappongono NON sono deduplicate.
export function Step4MultiZoneSummary({ summary, posPricing = null, campaignTotal = null, campaignQuantity = null }) {
  if (!summary?.isMultiZone) return null;
  const zoneById = new Map(summary.zones.map(z => [z.id, z]));
  const priceById = new Map((posPricing?.rows || []).map(r => [r.id, r.distributionPrice]));
  return <div data-testid="step4-multizone-summary" style={{
    margin: "0 0 14px",
    padding: "12px 14px",
    borderRadius: 10,
    background: "rgba(255,255,255,.025)",
    border: "1px solid rgba(255,255,255,.08)",
    fontFamily: F.sans
  }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,.45)", marginBottom: 8 }}>
        {summary.zoneCount} punti vendita nel preventivo
      </div>
      {summary.zones.map(z => <div key={z.id} data-testid="step4-pos-row" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 10px", padding: "7px 0", borderTop: "1px solid rgba(255,255,255,.05)", fontSize: 12, color: C.white }}>
          <span style={{ minWidth: 0, flex: "1 1 220px" }}>
            <span style={{ fontWeight: 800 }}>{z.name}</span>
            <span style={{ display: "block", fontWeight: 500, color: "rgba(255,255,255,.55)", fontSize: 11 }}>
              {[z.location, z.modeLabel].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span style={{ whiteSpace: "nowrap", textAlign: "right" }}>
            {formatNumber(z.quantity, "—")} pz · {formatNumber(z.families, "—")} famiglie
            {priceById.has(z.id) && <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,.7)" }}>Distribuzione {formatQuoteCurrency(priceById.get(z.id))}</span>}
          </span>
        </div>)}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 10px", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.12)", fontSize: 12, fontWeight: 800, color: C.white }}>
        <span>TOTALE CAMPAGNA</span>
        <span style={{ textAlign: "right" }}>
          {formatNumber(campaignQuantity ?? summary.totalQuantity, "—")} pz · {formatNumber(summary.totalFamilies, "—")} famiglie{summary.hasOverlap ? " (non deduplicate)" : ""}
          {campaignTotal != null && <span style={{ display: "block" }}>Totale {formatQuoteCurrency(campaignTotal)}</span>}
        </span>
      </div>
      {summary.hasOverlap && <div role="status" data-testid="step4-multizone-overlap-warning" style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(251,191,36,.45)", background: "rgba(251,191,36,.08)", color: "#FDE68A", fontSize: 11.5, lineHeight: 1.45 }}>
          <strong>Territori sovrapposti:</strong> {summary.overlaps.map(o => `${zoneById.get(o.zoneAId)?.name || "Punto vendita"} / ${zoneById.get(o.zoneBId)?.name || "Punto vendita"}`).join("; ")}.
          Famiglie e copertura sono la somma dei singoli punti vendita e non sono deduplicate: nell'area comune il conteggio può essere doppio. La quantità e il prezzo corrispondono ai volantini richiesti per ciascun punto vendita.
        </div>}
    </div>;
}
