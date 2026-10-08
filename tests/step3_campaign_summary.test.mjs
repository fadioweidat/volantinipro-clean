// FASE 3A — STEP 3 RIEPILOGO CAMPAGNA MULTI-PV.
// Il riepilogo legge SOLO campaignZones[]: identico qualunque sia il PV attivo
// e cieco agli snapshot legacy (zonesAllocation/addressLabel/coordinates/
// truthModel) che dopo un'eliminazione possono riferirsi al PV eliminato.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildMultiZoneDistributionZones,
  buildPointOfSalePricing,
  buildZoneKpiSnapshot,
  deleteAndActivatePointOfSale,
  summarizeCampaignZones,
} from "../src/lib/step2/campaignZonesModel.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";
import { QUOTE_PRICES } from "../src/lib/appConstants.js";
import { buildCampaignStep3Summary, formatCampaignStep3Headline, selectCampaignStep3Summary } from "../src/lib/step3/campaignStep3Summary.js";

const read = rel => readFileSync(new URL(rel, import.meta.url), "utf8");
const step3 = read("../src/pages/public/configurator/Step3.jsx");
const summaryPanel = read("../src/pages/public/configurator/step3/Step3SmartPairingSummaryPanel.jsx");
const helperSource = read("../src/lib/step3/campaignStep3Summary.js");

const MILANO = { name: "Milano", label: "Milano", lat: 45.4642, lng: 9.19 };
const MONZA = { name: "Monza", label: "Monza (MB)", lat: 45.5845, lng: 9.2744 };
const CORMANO = { name: "Cormano", label: "Cormano (MI)", lat: 45.54, lng: 9.17 };
const RHO = { name: "Rho", label: "Rho (MI)", lat: 45.531, lng: 9.04 };
const row = (name, assignedFlyers, extra = {}) => ({ id: `r_${name}`, name, assignedFlyers, requiredFlyers: assignedFlyers, ...extra });

function zone(id, overrides) {
  const base = { id, store_name: "", readyForQuote: true, coverageDecision: "keepCurrent", selectedSearchPoint: null, ...overrides };
  const q = base.assigned_flyers;
  base.finalFlyers = q;
  base.kpiSnapshot = buildZoneKpiSnapshot({
    serviceKpis: { families: Math.round(q * 0.9), population: Math.round(q * 2) },
    requiredFlyers: q,
    finalFlyers: q,
    areaMode: overrides.searchMode === "address" ? "radius" : overrides.nilManualMode ? "custom_zone" : "full_municipality",
    analysisLevel: overrides.city?.name === "Milano" ? "nil" : "comune",
    radiusCenter: overrides.searchMode === "address" ? (overrides.selectedSearchPoint || overrides.city) : null,
    radiusKm: overrides.searchMode === "address" ? overrides.radiusKm : null,
  });
  return base;
}

const TORINO_POINT = { label: "Via Torino, 20123 Milano città metropolitana di Milano, Italia", lat: 45.461388, lng: 9.185273, type: "address" };
const PV1 = zone("pv1", { store_name: "Negozio Isola", searchMode: "municipality", nilManualMode: true, city: MILANO, cityName: "Milano", selectedComuni: [MILANO], assigned_flyers: 5959, allocation: [row("ISOLA", 5959, { nil_code: "9" })] });
const PV2 = zone("pv2", { store_name: "Negozio Centro", searchMode: "address", city: MILANO, cityName: "Milano", radiusKm: 1, radius: 1, selectedSearchPoint: TORINO_POINT, selectedComuni: [MILANO], assigned_flyers: 14060, allocation: [row("DUOMO", 8000, { nil_code: "1" }), row("TICINESE", 6060, { nil_code: "5" })] });
const PV3 = zone("pv3", { store_name: "Monza", searchMode: "municipality", city: MONZA, cityName: "Monza (MB)", selectedComuni: [MONZA], assigned_flyers: 10000, allocation: [row("Monza", 10000)] });
const PV4 = zone("pv4", { searchMode: "address", city: CORMANO, cityName: "Cormano (MI)", radiusKm: 2, radius: 2, selectedComuni: [CORMANO], assigned_flyers: 9371, allocation: [row("Cormano", 8000), row("Cusano Milanino", 1371)] });
const PV5 = zone("pv5", { searchMode: "municipality", city: RHO, cityName: "Rho (MI)", selectedComuni: [RHO], assigned_flyers: 25000, allocation: [row("Rho", 25000)] });
const FIVE = [PV1, PV2, PV3, PV4, PV5];

// Step4: baseCost multi-PV D2D (stessa pipeline usata in Step4.jsx).
const step4BaseCost = zones => {
  const s = summarizeCampaignZones(zones);
  return calculateQuotePricing({ quantity: s.totalQuantity, pricePerThousand: QUOTE_PRICES.d2d, distributionZones: buildMultiZoneDistributionZones(s) }).baseCost;
};

test("A. one PV: count, quantity, row; single-PV flag off", () => {
  const s = buildCampaignStep3Summary([PV3]);
  assert.equal(s.pointOfSaleCount, 1);
  assert.equal(s.isMultiPointOfSale, false);
  assert.equal(s.totalQuantity, 10000);
  assert.equal(s.rows.length, 1);
  assert.deepEqual({ id: s.rows[0].id, storeName: s.rows[0].storeName, quantity: s.rows[0].quantity }, { id: "pv3", storeName: "Monza", quantity: 10000 });
  assert.equal(s.rows[0].territoryLabel, "Monza (MB) · Comune");
});

test("B. two PV: total = sum, 2 rows in campaignZones order, labels from the PV itself", () => {
  const s = buildCampaignStep3Summary([PV1, PV2]);
  assert.equal(s.isMultiPointOfSale, true);
  assert.equal(s.totalQuantity, 5959 + 14060);
  assert.deepEqual(s.rows.map(r => r.id), ["pv1", "pv2"]);
  assert.equal(s.rows[0].territoryLabel, "Milano · ISOLA");
  assert.match(s.rows[1].territoryLabel, /^Via Torino, 20123 Milano .* · Raggio 1 km$/);
  assert.equal(formatCampaignStep3Headline(s), "2 PV · 20.019 volantini");
  // ordine stabile: invertire l'input inverte le righe, nessun riordino interno
  assert.deepEqual(buildCampaignStep3Summary([PV2, PV1]).rows.map(r => r.id), ["pv2", "pv1"]);
});

test("C. five PV: total = sum of all 5, 5 rows, distribution = Step4 baseCost, rows = Step4 PV prices", () => {
  const s = buildCampaignStep3Summary(FIVE);
  assert.equal(s.pointOfSaleCount, 5);
  assert.equal(s.rows.length, 5);
  assert.equal(s.totalQuantity, FIVE.reduce((a, z) => a + z.finalFlyers, 0));
  assert.equal(s.distributionSubtotal, step4BaseCost(FIVE));
  assert.ok(s.distributionSubtotal > 0);
  const pos = buildPointOfSalePricing(summarizeCampaignZones(FIVE));
  assert.deepEqual(s.rows.map(r => r.distributionPrice), pos.rows.map(r => r.distributionPrice));
  assert.equal(formatCampaignStep3Headline(s), `5 PV · ${s.totalQuantity.toLocaleString("it-IT")} volantini`);
});

test("C2. non-D2D: no Step3 price (Step4 has no multi-PV price for h2h/b2b)", () => {
  const s = buildCampaignStep3Summary(FIVE, { serviceType: "h2h" });
  assert.equal(s.distributionSubtotal, null);
  assert.ok(s.rows.every(r => r.distributionPrice === null));
  assert.equal(s.totalQuantity, buildCampaignStep3Summary(FIVE).totalQuantity);
});

test("D. active-PV independence: same campaignZones, different active PV and mirrors -> identical summary", () => {
  const base = { type: "d2d", campaignZones: FIVE };
  const asPv1 = { ...base, activeZoneId: "pv1", qty: 5959, cityName: "Milano", city: MILANO, selectedSearchPoint: null, searchMode: "municipality" };
  const asPv2 = { ...base, activeZoneId: "pv2", qty: 14060, cityName: "Milano", city: MILANO, selectedSearchPoint: TORINO_POINT, radiusKm: 1, searchMode: "address" };
  const asPv5 = { ...base, activeZoneId: "pv5", qty: 25000, cityName: "Rho (MI)", city: RHO, selectedSearchPoint: null, searchMode: "municipality" };
  const garbage = { ...base, activeZoneId: "zz", qty: 1, cityName: "Nowhere", city: { lat: 0, lng: 0 }, selectedSearchPoint: { label: "X", lat: 1, lng: 1 } };
  const ref = selectCampaignStep3Summary(asPv1);
  for (const d of [asPv2, asPv5, garbage]) assert.deepEqual(selectCampaignStep3Summary(d), ref);
});

test("E. deleted-PV stale mirror: campaignZones has survivor only, legacy snapshots still hold PV2 -> survivor only", () => {
  const prev = {
    type: "d2d",
    campaignZones: [PV1, PV2],
    activeZoneId: "pv2",
    qty: 14060,
    cityName: "Milano",
    selectedSearchPoint: TORINO_POINT,
    coverage: { address: TORINO_POINT },
    radiusKm: 1,
    // snapshot legacy scritto da Step2 "Continua" con PV2 attivo
    zonesAllocation: PV2.allocation.map(r => ({ ...r, lat: TORINO_POINT.lat, lng: TORINO_POINT.lng, address_label: TORINO_POINT.label })),
    addressLabel: TORINO_POINT.label,
    coordinates: { lat: TORINO_POINT.lat, lng: TORINO_POINT.lng },
    truthModel: { territory: { label: `Raggio 1 km da ${TORINO_POINT.label}` } },
  };
  const afterDelete = deleteAndActivatePointOfSale(prev, "pv2");
  assert.equal(afterDelete.campaignZones.length, 1);
  // gli snapshot legacy restano (debito noto), ma Step3 non li legge
  assert.equal(afterDelete.addressLabel, TORINO_POINT.label);
  const s = selectCampaignStep3Summary(afterDelete);
  assert.equal(s.pointOfSaleCount, 1);
  assert.equal(s.isMultiPointOfSale, false);
  assert.equal(s.totalQuantity, 5959);
  assert.deepEqual(s.rows.map(r => r.id), ["pv1"]);
  const text = JSON.stringify(s);
  for (const leak of ["Via Torino", "45.461388", "9.185273", "Raggio 1 km", "DUOMO", "TICINESE", "14060", "14.060"]) {
    assert.ok(!text.includes(leak), `deleted PV leaked into Step3 summary: ${leak}`);
  }
});

test("F. overlap: metadata reflected as note state only; quantities and prices unchanged, never deduplicated", () => {
  const pvA = zone("a", { searchMode: "address", city: MILANO, cityName: "Milano", radiusKm: 3, radius: 3, selectedSearchPoint: { label: "Corso Buenos Aires 10, Milano", lat: 45.47627, lng: 9.2071 }, assigned_flyers: 10000, allocation: [row("BUENOS AIRES", 10000)] });
  const pvB = zone("b", { searchMode: "address", city: MILANO, cityName: "Milano", radiusKm: 3, radius: 3, selectedSearchPoint: { label: "Piazza del Duomo, Milano", lat: 45.46468, lng: 9.19041 }, assigned_flyers: 10000, allocation: [row("DUOMO", 10000)] });
  const s = buildCampaignStep3Summary([pvA, pvB]);
  assert.equal(s.overlapPresent, true);
  assert.equal(s.capacityDeduplicated, false);
  assert.equal(s.totalQuantity, 20000);
  assert.equal(s.distributionSubtotal, step4BaseCost([pvA, pvB]));
  assert.equal(buildCampaignStep3Summary(FIVE).overlapPresent, summarizeCampaignZones(FIVE).hasOverlap);
});

test("G. helper is pure: no mutation, no React/network, no activeZoneId / legacy-snapshot reads", () => {
  const zones = structuredClone(FIVE);
  const before = JSON.stringify(zones);
  buildCampaignStep3Summary(zones);
  assert.equal(JSON.stringify(zones), before);
  const code = helperSource.split(/\r?\n/).filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  assert.doesNotMatch(code, /from "react"|fetch\(|supabase|activeZoneId|data\.qty|data\?\.qty|cityName|selectedSearchPoint|zonesAllocation|addressLabel|coordinates|truthModel/);
  assert.match(code, /data\?\.campaignZones/);
  // nessuna seconda formula prezzi: solo helper canonici
  assert.match(code, /buildPointOfSalePricing\(summary\)/);
  assert.match(code, /calculateQuotePricing\(\{/);
  assert.doesNotMatch(code, /\* 0\.\d|\/ 1000/);
});

test("H. Step3 wiring: multi-PV display reads the campaign summary; single-PV path and Smart Pairing request unchanged", () => {
  assert.match(step3, /const campaignSummary = useMemo\(\(\) => selectCampaignStep3Summary\(data\), \[data\.campaignZones, data\.type\]\);/);
  assert.match(step3, /const isMultiPvCampaign = campaignSummary\.isMultiPointOfSale && !activeZone;/);
  assert.match(step3, /\{isMultiPvCampaign && <Step3CampaignSummary summary=\{campaignSummary\} isMobile=\{isMobile\} \/>\}/);
  assert.match(step3, /campaignSummary=\{isMultiPvCampaign \? campaignSummary : null\}/);
  // Il riepilogo campagna non legge mirror del PV attivo
  const comp = step3.slice(step3.indexOf("function Step3CampaignSummary("));
  assert.doesNotMatch(comp, /data\.|activeQty|compactZoneLabel|setData/);
  assert.match(comp, /Alcuni punti vendita condividono parte del territorio\. La quantità indicata resta quella prevista per ciascun punto vendita\./);
  // Pannello: con campaignSummary quantita'/PV dal riepilogo, senza: invariato
  assert.match(summaryPanel, /campaignSummary \? formatIntegerIT\(campaignSummary\.totalQuantity\) : activeQty\.toLocaleString\("it-IT"\)/);
  assert.match(summaryPanel, /campaignSummary \? formatIntegerIT\(campaignSummary\.pointOfSaleCount\) : compactZoneLabel/);
  // Smart Pairing: nessuna promessa campagna-wide in multi-PV, semantica invariata
  assert.match(summaryPanel, /campaignSummary \? \(realSmartPairingSlots\.length > 0 \? "Disponibile · da verificare" : "Da verificare"\)/);
  assert.match(step3, /multiPvMatch \? "Verifica disponibilità per la campagna"/);
  assert.match(step3, /zone: data\.cityName \|\| /);
});
