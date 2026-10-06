// FASE 2 — MULTI PUNTO VENDITA. Ogni campaignZone e' un punto vendita (PV):
// nessun modello locations[] parallelo. Questi test coprono identita' PV,
// creazione da qualsiasi modalita', rinomina, eliminazione, etichette
// Step3/Step4, prezzo per PV, payload e il contratto single-PV invariato.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildMultiZoneCampaignZonesPayload,
  buildMultiZoneDistributionZones,
  buildMultiZoneMetadata,
  buildPointOfSalePricing,
  buildZoneKpiSnapshot,
  getCampaignZoneLabel,
  getPointOfSaleLocation,
  getPointOfSaleModeLabel,
  getPointOfSaleName,
  resolveDeletePointOfSale,
  sanitizeStoreName,
  STORE_NAME_MAX_LENGTH,
  summarizeCampaignZones,
} from "../src/lib/step2/campaignZonesModel.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";

const read = rel => readFileSync(new URL(rel, import.meta.url), "utf8");
const step2 = read("../src/pages/public/configurator/Step2.jsx");
const panel = read("../src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx");
const step3 = read("../src/pages/public/configurator/Step3.jsx");
const step4 = read("../src/pages/public/configurator/Step4.jsx");
const summaryUi = read("../src/pages/public/configurator/step4/Step4MultiZoneSummary.jsx");

const MILANO = { name: "Milano", label: "Milano", lat: 45.4642, lng: 9.19 };
const MONZA = { name: "Monza", label: "Monza (MB)", lat: 45.5845, lng: 9.2744 };
const CORMANO = { name: "Cormano", label: "Cormano (MI)", lat: 45.54, lng: 9.17 };
const RHO = { name: "Rho", label: "Rho (MI)", lat: 45.531, lng: 9.04 };
const row = (name, assignedFlyers, extra = {}) => ({ id: `r_${name}`, name, assignedFlyers, requiredFlyers: assignedFlyers, ...extra });

function zone(id, overrides) {
  const base = {
    id,
    store_name: "",
    readyForQuote: true,
    coverageDecision: "keepCurrent",
    selectedSearchPoint: null,
    ...overrides,
  };
  const q = base.assigned_flyers;
  base.finalFlyers = q;
  base.kpiSnapshot = buildZoneKpiSnapshot({
    serviceKpis: { families: overrides.families ?? Math.round(q * 0.9), population: Math.round(q * 2) },
    requiredFlyers: q,
    finalFlyers: q,
    areaMode: overrides.searchMode === "address" ? "radius" : overrides.nilManualMode ? "custom_zone" : "full_municipality",
    analysisLevel: overrides.city?.name === "Milano" ? "nil" : "comune",
    radiusCenter: overrides.searchMode === "address" ? (overrides.selectedSearchPoint || overrides.city) : null,
    radiusKm: overrides.searchMode === "address" ? overrides.radiusKm : null,
  });
  return base;
}

// Scenario primario di accettazione (sezione 11 del ticket).
const PV1 = zone("pv1", { store_name: "Negozio Duomo", searchMode: "municipality", nilManualMode: true, city: MILANO, cityName: "Milano", selectedComuni: [MILANO], assigned_flyers: 11698, allocation: [row("BRUZZANO", 7524, { nil_code: "14" }), row("COMASINA", 4174, { nil_code: "15" })] });
const PV2 = zone("pv2", { searchMode: "address", city: MILANO, cityName: "Milano", radiusKm: 1, radius: 1, selectedSearchPoint: { label: "Via Torino 10, Milano, Lombardia, Italia", lat: 45.4605, lng: 9.1855, type: "address" }, selectedComuni: [MILANO], assigned_flyers: 10000, allocation: [row("DUOMO", 6000, { nil_code: "1" }), row("GUASTALLA", 4000, { nil_code: "4" })] });
const PV3 = zone("pv3", { store_name: "Filiale Monza", searchMode: "municipality", city: MONZA, cityName: "Monza (MB)", selectedComuni: [MONZA], assigned_flyers: 20000, allocation: [row("Monza", 20000)] });
const PV4 = zone("pv4", { searchMode: "address", city: CORMANO, cityName: "Cormano (MI)", radiusKm: 2, radius: 2, selectedComuni: [CORMANO], assigned_flyers: 8000, allocation: [row("Cormano", 7000), row("Cusano Milanino", 1000)] });
const PV5 = zone("pv5", { searchMode: "municipality", city: RHO, cityName: "Rho (MI)", selectedComuni: [RHO], assigned_flyers: 25000, allocation: [row("Rho", 25000)] });
const MIXED = [PV1, PV2, PV3, PV4, PV5];

test("A/T. one PV: not multi, no PV UI, Step4 + payload stay on the production single-zone path", () => {
  assert.equal(summarizeCampaignZones([PV5]).isMultiZone, false);
  assert.match(panel, /\{campaignZones\.length > 1 && <div role="group" aria-label="Punti vendita della campagna" data-testid="pos-switcher"/);
  assert.match(panel, /\{campaignZones\.length > 1 && \(\(\) => \{/);
  assert.match(step4, /const isMultiZoneQuote = !isQuick && svcType === "d2d" && multiZoneSummary\.isMultiZone;/);
  assert.match(step4, /const campaignZonesPayload = isMultiZoneQuote \? buildMultiZoneCampaignZonesPayload\(multiZoneSummary\) : zoneAllocs\.length > 0/);
  assert.match(step4, /const multiZonePosPricing = useMemo\(\(\) => isMultiZoneQuote \? buildPointOfSalePricing\(multiZoneSummary\) : null/);
});

test("B/C/D. '+ Aggiungi punto vendita' always creates a new campaignZone, from any tab", () => {
  // nuovo pulsante dedicato, senza condizioni sul tab attivo
  assert.match(panel, /<button type="button" data-testid="pos-add" onClick=\{handleAddZone\}/);
  assert.match(panel, /\+ Aggiungi punto vendita/);
  // piu' comuni DENTRO lo stesso PV restano possibili (solo tab Comune, non in NIL)
  assert.match(panel, /\{searchMode === "municipality" && !nilManualMode && <button type="button" onClick=\{\(\) => \{\r?\n\s+setPendingAddMunicipality\(true\);/);
  assert.match(panel, /\+ Aggiungi comune/);
  assert.doesNotMatch(panel, /\+ Aggiungi un'altra zona \/ comune\r?\n\s*<\/button>/, "il vecchio CTA ambiguo non e' piu' un pulsante");
  // handleAddZone non dipende da searchMode
  const add = step2.slice(step2.indexOf("const handleAddZone = () => {"), step2.indexOf("const updateZoneField"));
  assert.doesNotMatch(add, /searchMode ===/);
  assert.match(add, /store_name: "",/);
  assert.match(add, /const startQty = resolveNewZoneStartingQuantity\(data\);/);
});

test("E. rename: optional, trimmed, bounded, persisted on store_name only", () => {
  assert.equal(sanitizeStoreName("  Negozio    Duomo  "), "Negozio Duomo");
  assert.equal(sanitizeStoreName(""), "");
  assert.equal(sanitizeStoreName(null), "");
  assert.equal(sanitizeStoreName("x".repeat(200)).length, STORE_NAME_MAX_LENGTH);
  assert.equal(getPointOfSaleName({ store_name: "  " }, 2), "Punto vendita 3");
  assert.equal(getPointOfSaleName({ store_name: " Store 5 " }, 0), "Store 5");
  const fn = step2.slice(step2.indexOf("const renamePointOfSale = useCallback"), step2.indexOf("const deletePointOfSale = useCallback"));
  assert.match(fn, /z\.id === zoneId \? \{ \.\.\.z, store_name: next \} : z/);
  assert.doesNotMatch(fn, /qty|flyerQuantity|assigned_flyers/);
  assert.match(panel, /maxLength=\{STORE_NAME_MAX_LENGTH\}/);
});

test("F/S. switch keeps per-PV identity; sync never drops store_name", () => {
  // il sync effect fa spread della zona corrente: store_name non viene mai riscritto
  assert.match(step2, /updatedZones\[zoneIndex\] = \{\r?\n\s+\.\.\.currentZone,/);
  // le guardie anti-contaminazione di Fase 1 restano
  assert.match(step2, /if \(localZoneId !== data\.activeZoneId\) return;/);
  const s = summarizeCampaignZones(MIXED);
  assert.deepEqual(s.zones.map(z => z.id), ["pv1", "pv2", "pv3", "pv4", "pv5"]);
  assert.deepEqual(s.zones.map(z => z.name), ["Negozio Duomo", "Punto vendita 2", "Filiale Monza", "Punto vendita 4", "Punto vendita 5"]);
});

test("location + mode labels never invent an address", () => {
  assert.equal(getPointOfSaleLocation(PV1), "Milano · BRUZZANO, COMASINA");
  assert.equal(getPointOfSaleModeLabel(PV1), "NIL / quartieri");
  assert.equal(getPointOfSaleLocation(PV2), "Via Torino 10, Milano");
  assert.equal(getPointOfSaleModeLabel(PV2), "Raggio 1 km");
  assert.equal(getPointOfSaleLocation(PV3), "Monza (MB)");
  assert.equal(getPointOfSaleModeLabel(PV3), "Comune");
  assert.equal(getPointOfSaleLocation(PV4), "Cormano (MI)", "raggio dal centro comune: nessun indirizzo inventato");
  assert.equal(getPointOfSaleLocation({ searchMode: "municipality", city: null, selectedComuni: [] }), "");
  assert.equal(getCampaignZoneLabel({ searchMode: "municipality" }, 0), "Punto vendita 1");
});

test("G. delete inactive PV: active PV untouched", () => {
  const r = resolveDeletePointOfSale(MIXED, "pv2", "pv4");
  assert.equal(r.activeZoneId, "pv2");
  assert.deepEqual(r.campaignZones.map(z => z.id), ["pv1", "pv2", "pv3", "pv5"]);
  assert.equal(r.campaignZones[1], PV2, "stesso oggetto: nessuna modifica al PV attivo");
});

test("H. delete active PV: deterministic neighbour becomes active, no stale id", () => {
  assert.equal(resolveDeletePointOfSale(MIXED, "pv3", "pv3").activeZoneId, "pv2");
  assert.equal(resolveDeletePointOfSale(MIXED, "pv1", "pv1").activeZoneId, "pv2");
  const r = resolveDeletePointOfSale(MIXED, "pv5", "pv5");
  assert.equal(r.activeZoneId, "pv4");
  assert.ok(r.campaignZones.every(z => z.id !== "pv5"));
  // totali ricalcolati senza il PV eliminato
  assert.equal(summarizeCampaignZones(r.campaignZones).totalQuantity, 11698 + 10000 + 20000 + 8000);
});

test("I. the last PV cannot be deleted; unknown id is a no-op", () => {
  assert.equal(resolveDeletePointOfSale([PV1], "pv1", "pv1"), null);
  assert.equal(resolveDeletePointOfSale(MIXED, "pv1", "nope"), null);
  const fn = step2.slice(step2.indexOf("const deletePointOfSale = useCallback"), step2.indexOf("const selectCampaignZone = useCallback"));
  assert.match(fn, /zones\.length <= 1\) return;/);
  assert.match(fn, /window\.confirm\(/, "nessuna eliminazione silenziosa");
  assert.match(fn, /resolveDeletePointOfSale\(prev\.campaignZones, prev\.activeZoneId, zoneId\)/);
});

test("J/M/N/O. mixed 5 PV: all present, quantities, total qty and aggregated price", () => {
  const s = summarizeCampaignZones(MIXED);
  assert.equal(s.isMultiZone, true);
  assert.equal(s.zoneCount, 5);
  assert.equal(s.allZonesReady, true);
  assert.deepEqual(s.zones.map(z => z.quantity), [11698, 10000, 20000, 8000, 25000]);
  assert.equal(s.totalQuantity, 74698);
  const pos = buildPointOfSalePricing(s);
  assert.equal(pos.rows.length, 5);
  assert.ok(pos.rows.every(r => r.distributionPrice > 0));
  const campaign = calculateQuotePricing({ quantity: s.totalQuantity, pricePerThousand: 40, distributionZones: buildMultiZoneDistributionZones(s) });
  assert.equal(pos.distributionTotal, campaign.baseCost, "somma dei PV = baseCost campagna (stesso motore)");
  for (const z of s.zones) {
    const alone = calculateQuotePricing({ quantity: z.quantity, pricePerThousand: 40, distributionZones: buildMultiZoneDistributionZones(summarizeCampaignZones([z.source])) });
    assert.equal(pos.rows.find(r => r.id === z.id).distributionPrice, alone.baseCost, `${z.name}: prezzo PV = prezzo del PV da solo`);
  }
});

test("P. payload contains every PV with identity, location, territory and quantity", () => {
  const s = summarizeCampaignZones(MIXED);
  const payload = buildMultiZoneCampaignZonesPayload(s);
  assert.deepEqual([...new Set(payload.map(p => p.campaign_zone_id))], ["pv1", "pv2", "pv3", "pv4", "pv5"]);
  assert.equal(payload.reduce((a, p) => a + p.quantity, 0), 74698);
  const pv1 = payload.filter(p => p.campaign_zone_id === "pv1");
  assert.ok(pv1.every(p => p.store_name === "Negozio Duomo" && p.campaign_zone_name === "Negozio Duomo" && p.territory_type === "nil"));
  const pv2 = payload.filter(p => p.campaign_zone_id === "pv2");
  assert.ok(pv2.every(p => p.store_name === null && p.campaign_zone_name === "Punto vendita 2" && p.radius_m === 1000 && p.address_label === "Via Torino 10, Milano, Lombardia, Italia"));
  const meta = buildMultiZoneMetadata(s);
  assert.deepEqual(meta.zones.map(z => [z.id, z.name, z.store_name, z.location_label, z.mode_label]), [
    ["pv1", "Negozio Duomo", "Negozio Duomo", "Milano · BRUZZANO, COMASINA", "NIL / quartieri"],
    ["pv2", "Punto vendita 2", null, "Via Torino 10, Milano", "Raggio 1 km"],
    ["pv3", "Filiale Monza", "Filiale Monza", "Monza (MB)", "Comune"],
    ["pv4", "Punto vendita 4", null, "Cormano (MI)", "Raggio 2 km"],
    ["pv5", "Punto vendita 5", null, "Rho (MI)", "Comune"],
  ]);
});

test("Q. overlap contract unchanged: never deduplicated, warning wording per PV", () => {
  const twin = zone("pv2b", { searchMode: "address", city: MILANO, cityName: "Milano", radiusKm: 1, radius: 1, selectedSearchPoint: { label: "Via Torino 12, Milano", lat: 45.4607, lng: 9.1857 }, selectedComuni: [MILANO], assigned_flyers: 5000, allocation: [row("DUOMO", 5000, { nil_code: "1" })] });
  const s = summarizeCampaignZones([PV2, twin]);
  assert.equal(s.hasOverlap, true);
  assert.equal(s.capacityDeduplicated, false);
  assert.equal(s.capacityStatus, "overlap_not_deduplicated");
  assert.equal(buildMultiZoneMetadata(s).capacity_deduplicated, false);
  assert.match(summaryUi, /non sono deduplicate/);
  assert.equal(summarizeCampaignZones(MIXED).hasOverlap, false);
});

test("L. Step3 shows PV labels for display only; Smart Pairing request source unchanged", () => {
  assert.match(step3, /const displayZonesList = !activeZone && posZones\.length > 1 \? posZones\.map\(posLabelFor\) : allZonesList;/);
  assert.match(step3, /allZonesList=\{displayZonesList\}/);
  assert.match(step3, /const comunePrincipale = allZonesList\[0\] \|\| data\.cityName \|\| "Zona da confermare";/);
});

test("M. Step4 summary uses PV wording and canonical prices (no pricing logic in UI)", () => {
  assert.match(summaryUi, /punti vendita nel preventivo/);
  assert.match(summaryUi, /TOTALE CAMPAGNA/);
  const imports = summaryUi.split(/\r?\n/).filter(l => l.startsWith("import ")).join("\n");
  assert.doesNotMatch(imports, /calculateQuotePricing|calculateMultiZoneDistributionPrice|QUOTE_PRICES|distributionPricing/);
  assert.match(imports, /import \{ formatQuoteCurrency \} from/);
  assert.match(step4, /<Step4MultiZoneSummary summary=\{multiZoneSummary\} posPricing=\{multiZonePosPricing\} campaignTotal=\{total\} campaignQuantity=\{flyerQty\} \/>/);
});

test("R. PV switcher is touch-friendly and wraps (no horizontal overflow)", () => {
  const sw = panel.slice(panel.indexOf('data-testid="pos-switcher"'), panel.indexOf('data-testid="pos-active-editor"'));
  assert.match(sw, /flexWrap: "wrap"/);
  assert.match(sw, /minHeight: 36/);
  assert.match(sw, /maxWidth: "100%"/);
  assert.match(sw, /textOverflow: "ellipsis"/);
  assert.match(sw, /aria-pressed=\{isActive\}/);
  assert.match(sw, /\{ready \? "Pronto" : "Da completare"\}/);
});

test("S. remounting Step2 (back from Step3) restores the active PV's NIL / comune-completo mode", () => {
  assert.match(step2, /const mountActiveZone = \(data\.campaignZones \|\| \[\]\)\.find\(z => z\.id === data\.activeZoneId\) \|\| null;/);
  assert.match(step2, /useState\(\(\) => Boolean\(mountActiveZone\?\.nilManualMode\)\)/);
  assert.match(step2, /useState\(\(\) => Boolean\(mountActiveZone\?\.addressFullCoverageConfirmed\)\)/);
});

test("PV wording only appears with 2+ PV (summary panel, map sidebar)", () => {
  const summaryPanel = read("../src/pages/public/configurator/step2/Step2SummaryPanel.jsx");
  const map = read("../src/components/Step2Map.jsx");
  assert.match(summaryPanel, /\{activePointOfSaleName \? "Punto vendita attivo" : "Zona attiva"\}/);
  assert.match(step2, /activePointOfSaleName=\{campaignZones\.length > 1 && activeCampaignZone \?/);
  assert.match(map, /Punti vendita \(\{zones\.length\}\)/);
  assert.match(map, /const rad {6}= getPointOfSaleModeLabel\(z\);/);
  assert.match(map, /if \(!zones \|\| zones\.length <= 1\) return null;/);
});
