// FASE 3A — STEP 3 RIEPILOGO CAMPAGNA MULTI-PV.
//
// Modulo PURO (nessun React, nessuna rete, nessuna mutazione): legge SOLO
// campaignZones[] (fonte canonica dei punti vendita) e produce il riepilogo
// campagna mostrato da Step3. Non legge mai i mirror top-level del PV attivo
// (data.qty, data.cityName, data.city, data.selectedSearchPoint) ne' gli
// snapshot legacy di transizione (zonesAllocation, addressLabel, coordinates,
// truthModel), che dopo un'eliminazione possono ancora riferirsi al PV
// eliminato. Nessuna dipendenza da activeZoneId: il risultato e' identico
// qualunque sia l'ultimo PV attivo in Step2.
//
// Prezzi: nessuna seconda formula. Il subtotale distribuzione e' calcolato
// esattamente come il baseCost multi-PV di Step4 (summarizeCampaignZones ->
// buildMultiZoneDistributionZones -> calculateQuotePricing) e il prezzo per
// PV arriva da buildPointOfSalePricing, lo stesso usato dal riepilogo Step4.
import { buildMultiZoneDistributionZones, buildPointOfSalePricing, summarizeCampaignZones } from "../step2/campaignZonesModel.js";
import { calculateQuotePricing } from "../quotePricing.js";
import { QUOTE_PRICES } from "../appConstants.js";
import { formatIntegerIT } from "../utils/format.js";

/** Territorio leggibile della riga PV: "Milano · ISOLA", "Via Torino, 20123 Milano · Raggio 1 km", "Monza (MB) · Comune". */
function territoryLabelFor(zone) {
  const location = zone.location || "";
  // NIL e CAP hanno gia' la modalita' nell'etichetta di posizione.
  if (zone.modeLabel === "NIL / quartieri" || zone.modeLabel === "CAP") return location || zone.modeLabel;
  return location ? `${location} · ${zone.modeLabel}` : zone.modeLabel;
}

/**
 * Riepilogo campagna per Step3.
 * options.serviceType: tipo servizio campagna (data.type). Come in Step4, il
 * prezzo multi-PV a griglia territoriale esiste solo per Door to Door; per
 * gli altri servizi distributionSubtotal resta null (Step4 blocca il
 * multi-PV non D2D) e la UI non mostra un prezzo.
 */
export function buildCampaignStep3Summary(campaignZones, { serviceType = "d2d" } = {}) {
  const summary = summarizeCampaignZones(campaignZones);
  const priced = serviceType === "d2d" && summary.zoneCount > 0;
  const posPricing = priced ? buildPointOfSalePricing(summary) : null;
  const priceById = new Map((posPricing?.rows || []).map(r => [r.id, r.distributionPrice]));
  const distributionSubtotal = priced
    ? calculateQuotePricing({
        quantity: summary.totalQuantity,
        pricePerThousand: QUOTE_PRICES[serviceType] || 18.5,
        distributionZones: buildMultiZoneDistributionZones(summary),
      }).baseCost
    : null;
  return {
    pointOfSaleCount: summary.zoneCount,
    isMultiPointOfSale: summary.isMultiZone,
    totalQuantity: summary.totalQuantity,
    distributionSubtotal,
    overlapPresent: summary.hasOverlap,
    capacityDeduplicated: summary.capacityDeduplicated,
    rows: summary.zones.map(z => ({
      id: z.id,
      storeName: z.name,
      territoryLabel: territoryLabelFor(z),
      quantity: z.quantity,
      distributionPrice: priced ? priceById.get(z.id) ?? null : null,
    })),
  };
}

/**
 * Selettore usato da Step3: dal draft completo legge SOLO campaignZones e il
 * tipo di servizio campagna. Volutamente cieco a ogni mirror del PV attivo.
 */
export function selectCampaignStep3Summary(data) {
  return buildCampaignStep3Summary(data?.campaignZones, { serviceType: data?.type || "d2d" });
}

/** Etichetta compatta header: "5 PV · 64.390 volantini". */
export function formatCampaignStep3Headline(summary) {
  return `${summary?.pointOfSaleCount || 0} PV · ${formatIntegerIT(summary?.totalQuantity || 0)} volantini`;
}
