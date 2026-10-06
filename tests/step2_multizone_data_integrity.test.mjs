// FASE 1 — STEP 2 MULTI-ZONE DATA INTEGRITY.
// Bug riprodotto a runtime in produzione (c41b442): Zona 1 Monza raggio 3 km
// (10.000 pz) + Zona 2 Rho raggio 2 km (14.559 pz) -> Step4 "Rho, 14.559 pz,
// €593,24": la Zona 1 era scartata da quantita', prezzo e payload.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildMultiZoneCampaignZonesPayload,
  buildMultiZoneDistributionZones,
  buildMultiZoneMetadata,
  buildZoneKpiSnapshot,
  detectCampaignZoneOverlaps,
  flattenMultiZoneAllocation,
  getCampaignZoneIssues,
  resolveNewZoneStartingQuantity,
  summarizeCampaignZones,
} from "../src/lib/step2/campaignZonesModel.js";
import { calculateQuotePricing } from "../src/lib/quotePricing.js";
import { resolveConfiguratorDistributionZones } from "../src/lib/pricing/resolveConfiguratorDistributionZones.js";

const step2 = readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8");
const step4 = readFileSync(new URL("../src/pages/public/configurator/Step4.jsx", import.meta.url), "utf8");

const MONZA = { name: "Monza", label: "Monza (MB)", lat: 45.5845, lng: 9.2744 };
const RHO = { name: "Rho", label: "Rho (MI)", lat: 45.5310, lng: 9.0400 };
const MILANO = { name: "Milano", label: "Milano (MI)", lat: 45.4642, lng: 9.1900 };
const CORMANO = { name: "Cormano", label: "Cormano (MI)", lat: 45.5400, lng: 9.1700 };

function radiusZone(id, city, radiusKm, quantity, rows, extra = {}) {
  return {
    id,
    searchMode: "address",
    city,
    cityName: city.label,
    selectedComuni: [city],
    radius: radiusKm,
    radiusKm,
    selectedSearchPoint: null,
    assigned_flyers: quantity,
    finalFlyers: quantity,
    coverageDecision: "useRecommended",
    allocation: rows,
    readyForQuote: true,
    kpiSnapshot: buildZoneKpiSnapshot({
      serviceKpis: { families: extra.families ?? 1000, population: extra.population ?? 2300, recommendedFlyers: quantity },
      requiredFlyers: extra.requiredFlyers ?? quantity,
      finalFlyers: quantity,
      areaMode: "radius",
      analysisLevel: extra.analysisLevel ?? "comune",
      radiusCenter: extra.center ?? city,
      radiusKm,
    }),
    ...extra.zone,
  };
}

function comuneZone(id, city, quantity, rows, extra = {}) {
  return {
    id,
    searchMode: "municipality",
    city,
    cityName: city.label,
    selectedComuni: [city],
    radius: null,
    radiusKm: null,
    assigned_flyers: quantity,
    finalFlyers: quantity,
    coverageDecision: "keepCurrent",
    allocation: rows,
    readyForQuote: true,
    nilManualMode: Boolean(extra.nilManualMode),
    kpiSnapshot: buildZoneKpiSnapshot({
      serviceKpis: { families: extra.families ?? 5000, population: extra.population ?? 11000, recommendedFlyers: quantity },
      requiredFlyers: extra.requiredFlyers ?? quantity,
      finalFlyers: quantity,
      areaMode: extra.nilManualMode ? "custom_zone" : "full_municipality",
      analysisLevel: extra.analysisLevel ?? "comune",
    }),
  };
}

const row = (name, assignedFlyers, requiredFlyers = assignedFlyers, more = {}) => ({ id: `r_${name}`, name, assignedFlyers, requiredFlyers, ...more });

const zoneMonza = radiusZone("zone_monza", MONZA, 3, 10000, [row("Monza", 10000, 47779), row("Vedano al Lambro", 0, 2000)], { families: 43000, requiredFlyers: 54054 });
const zoneRho = radiusZone("zone_rho", RHO, 2, 14559, [row("Rho", 13880), row("Pregnana Milanese", 153), row("Pero", 526)], { families: 13235, requiredFlyers: 14559 });

// ---------------------------------------------------------------- A
test("A. single zone: summary is NOT multi-zone, Step4 stays on the production contract", () => {
  for (const zones of [[zoneRho], [comuneZone("z", MILANO, 7524, [row("BRUZZANO", 7524, 7524, { nil_code: "14" })], { nilManualMode: true, analysisLevel: "nil" })], [{ ...comuneZone("z", MONZA, 50000, [row("Monza", 40000), row("Lissone", 10000)]), selectedComuni: [MONZA, { name: "Lissone" }] }]]) {
    const s = summarizeCampaignZones(zones);
    assert.equal(s.isMultiZone, false);
    assert.equal(s.zoneCount, 1);
  }
  assert.equal(summarizeCampaignZones([]).isMultiZone, false);
  assert.equal(summarizeCampaignZones(undefined).isMultiZone, false);
  // Ogni override Step4 e' dietro isMultiZoneQuote: con una zona i valori
  // restano le espressioni di produzione.
  assert.match(step4, /const isMultiZoneQuote = !isQuick && svcType === "d2d" && multiZoneSummary\.isMultiZone;/);
  assert.match(step4, /const flyerQty = isMultiZoneQuote \? multiZoneSummary\.totalQuantity : \(data\.coverageDecision === "increase" \|\| data\.coverageDecision === "useRecommended"\) && data\.fullCoverageFlyers != null && rawFlyerQty != null \? Math\.max\(rawFlyerQty, Number\(data\.fullCoverageFlyers\)\) : rawFlyerQty;/);
  assert.match(step4, /isMultiZoneQuote \? buildMultiZoneDistributionZones\(multiZoneSummary\) : resolveConfiguratorDistributionZones\(data, flyerQty\)\.zones/);
  assert.match(step4, /const zoneAllocs = isMultiZoneQuote \? flattenMultiZoneAllocation\(multiZoneSummary\) : data\.zonesAllocation \|\| \[\];/);
  assert.match(step4, /const campaignZonesPayload = isMultiZoneQuote \? buildMultiZoneCampaignZonesPayload\(multiZoneSummary\) : zoneAllocs\.length > 0/);
});

test("A. single zone: Step2 gate equals the production gate (other zones list is empty)", () => {
  assert.match(step2, /const canContinueCalendar = activeZoneQuoteReady && step2ZonesReady && !blockingCampaignZone && !multiZoneServiceUnsupported;/);
  assert.match(step2, /const multiZoneServiceUnsupported = otherCampaignZones\.length > 0 && svcType !== "d2d";/);
  assert.match(step2, /const blockingCampaignZoneIndex = \(data\.campaignZones \|\| \[\]\)\.findIndex\(z => z\.id !== data\.activeZoneId && z\.readyForQuote !== true\);/);
  // activeZoneSelfReady === step2ZonesReady when the only zone is the active one.
  assert.match(step2, /const activeZoneSelfReady = \(data\.campaignZones \|\| \[\]\)\.some\(z => z\.id === data\.activeZoneId && isCampaignZoneReadyForGate\(z\)\);/);
  assert.match(step2, /const step2ZonesReady = \(data\.campaignZones \|\| \[\]\)\.length > 0 && \(data\.campaignZones \|\| \[\]\)\.every\(isCampaignZoneReadyForGate\);/);
});

test("A. single zone pricing: identical to the production resolver", () => {
  const data = { selectedComuni: [RHO], zonesAllocation: zoneRho.allocation, cityName: RHO.label };
  const prod = calculateQuotePricing({ quantity: 14559, pricePerThousand: 40, distributionZones: resolveConfiguratorDistributionZones(data, 14559).zones });
  const viaModel = calculateQuotePricing({ quantity: 14559, pricePerThousand: 40, distributionZones: buildMultiZoneDistributionZones(summarizeCampaignZones([zoneRho])) });
  assert.equal(viaModel.total, prod.total);
});

// ---------------------------------------------------------------- B
test("B. two radius zones: different centers/radii, both in summary, payload and quantity", () => {
  const s = summarizeCampaignZones([zoneMonza, zoneRho]);
  assert.equal(s.isMultiZone, true);
  assert.equal(s.allZonesReady, true);
  assert.equal(s.totalQuantity, 24559);
  assert.deepEqual(s.zones.map(z => [z.radiusKm, z.center.lat, z.center.lng]), [[3, MONZA.lat, MONZA.lng], [2, RHO.lat, RHO.lng]]);
  assert.equal(s.hasOverlap, false, "Monza 3 km e Rho 2 km distano ~19 km");
  assert.equal(s.capacityStatus, "disjoint_sum");
  assert.equal(s.totalFamilies, 43000 + 13235);

  const payload = buildMultiZoneCampaignZonesPayload(s);
  assert.equal(payload.length, 5);
  assert.deepEqual(payload.map(p => p.campaign_zone_id), ["zone_monza", "zone_monza", "zone_rho", "zone_rho", "zone_rho"]);
  assert.deepEqual(payload.map(p => p.priority), [1, 2, 3, 4, 5]);
  assert.ok(payload.every(p => p.territory_type === "radius"));
  assert.deepEqual(payload.filter(p => p.campaign_zone_id === "zone_monza").map(p => p.radius_m), [3000, 3000]);
  assert.deepEqual(payload.filter(p => p.campaign_zone_id === "zone_rho").map(p => p.radius_m), [2000, 2000, 2000]);
  assert.equal(payload.reduce((a, p) => a + p.quantity, 0), 24559);
});

test("B. pricing includes all non-overlapping zones (sum of per-zone prices)", () => {
  const s = summarizeCampaignZones([zoneMonza, zoneRho]);
  const multi = calculateQuotePricing({ quantity: s.totalQuantity, pricePerThousand: 40, distributionZones: buildMultiZoneDistributionZones(s) });
  const monzaOnly = calculateQuotePricing({ quantity: 10000, pricePerThousand: 40, distributionZones: buildMultiZoneDistributionZones(summarizeCampaignZones([zoneMonza])) });
  const rhoOnly = calculateQuotePricing({ quantity: 14559, pricePerThousand: 40, distributionZones: buildMultiZoneDistributionZones(summarizeCampaignZones([zoneRho])) });
  assert.ok(monzaOnly.baseCost > 0 && rhoOnly.baseCost > 0);
  assert.equal(multi.baseCost, Math.round((monzaOnly.baseCost + rhoOnly.baseCost) * 100) / 100);
  assert.ok(multi.total > rhoOnly.total, "il prezzo non puo' piu' essere quello della sola zona attiva");
});

test("B. switching zones: Step2 never writes the previous zone's local state into the new active zone", () => {
  assert.match(step2, /const \[localZoneId, setLocalZoneId\] = useState\(data\.activeZoneId \|\| null\);/);
  // sync effect, allocation effect and snapshot effect are all guarded
  const guards = step2.match(/if \(localZoneId !== data\.activeZoneId\) return;/g) || [];
  assert.equal(guards.length, 2);
  assert.match(step2, /if \(!data\.activeZoneId \|\| localZoneId !== data\.activeZoneId\) return;/);
  assert.match(step2, /setLocalZoneId\(data\.activeZoneId\);\r?\n      \}/);
  // on a real switch the search point is the zone's own, never the previous zone's
  assert.match(step2, /setSelectedSearchPoint\(isZoneSwitch \? activeZone\.selectedSearchPoint \|\| null : activeZone\.selectedSearchPoint \|\| data\.selectedSearchPoint \|\| null\);/);
});

// ---------------------------------------------------------------- C
test("C. Milano NIL zone + Milano radius zone: NIL mode persisted per zone and restored on switch", () => {
  assert.match(step2, /Boolean\(currentZone\.nilManualMode\) !== nilManualMode \|\| Boolean\(currentZone\.addressFullCoverageConfirmed\) !== addressFullCoverageConfirmed/);
  assert.match(step2, /activeMapLayers: activeMapLayers,\r?\n        nilManualMode,\r?\n        addressFullCoverageConfirmed\r?\n/);
  assert.match(step2, /setNilManualMode\(Boolean\(activeZone\.nilManualMode\)\);\r?\n        setAddressFullCoverageConfirmed\(Boolean\(activeZone\.addressFullCoverageConfirmed\)\);/);

  const nilZone = comuneZone("zone_nil", MILANO, 7524, [row("BRUZZANO", 7524, 7524, { nil_code: "14" })], { nilManualMode: true, analysisLevel: "nil", families: 6840 });
  const farRadius = radiusZone("zone_r", MILANO, 1, 9000, [row("DUOMO", 9000, 9000, { nil_code: "1" })], { analysisLevel: "nil", center: { lat: 45.4642, lng: 9.19 } });
  const s = summarizeCampaignZones([nilZone, farRadius]);
  const payload = buildMultiZoneCampaignZonesPayload(s);
  assert.equal(payload[0].territory_type, "nil");
  assert.equal(payload[0].municipality, "BRUZZANO");
  assert.equal(payload[0].campaign_zone_mode, "municipality");
  assert.equal(payload[1].territory_type, "radius");
  assert.equal(s.hasOverlap, false, "BRUZZANO e DUOMO sono NIL diverse");
});

// ---------------------------------------------------------------- D
test("D. outside Milan: Comune zone + Radius zone both survive", () => {
  const monzaComune = comuneZone("zone_monza_c", MONZA, 47779, [row("Monza", 47779)], { families: 43438 });
  const cormanoRadius = radiusZone("zone_cormano_r", CORMANO, 2, 8000, [row("Cormano", 7000), row("Cusano Milanino", 1000)], { families: 7200 });
  const s = summarizeCampaignZones([monzaComune, cormanoRadius]);
  assert.equal(s.totalQuantity, 55779);
  assert.equal(s.hasOverlap, false);
  const payload = buildMultiZoneCampaignZonesPayload(s);
  assert.deepEqual(payload.map(p => [p.campaign_zone_id, p.territory_type, p.radius_m]), [
    ["zone_monza_c", "comune", null],
    ["zone_cormano_r", "radius", 2000],
    ["zone_cormano_r", "radius", 2000],
  ]);
});

test("D. multi-comune inside ONE zone stays one zone (not split into campaignZones)", () => {
  const multiComune = { ...comuneZone("zone_mc", MONZA, 60000, [row("Monza", 47779), row("Lissone", 12221)]), selectedComuni: [MONZA, { name: "Lissone" }], selectedMunicipalities: [MONZA, { name: "Lissone" }] };
  const s = summarizeCampaignZones([multiComune]);
  assert.equal(s.isMultiZone, false);
  // FASE 2: etichetta punto vendita (nome di default + comuni del PV).
  assert.equal(s.zones[0].label, "Punto vendita 1 · Monza (MB), Lissone");
  assert.equal(s.zones[0].modeLabel, "Comuni");
});

// ---------------------------------------------------------------- E
test("E. three zones: every allocation row appears exactly once with its parent zone", () => {
  const zoneC = comuneZone("zone_c", CORMANO, 8000, [row("Cormano", 8000)]);
  const s = summarizeCampaignZones([zoneMonza, zoneRho, zoneC]);
  const payload = buildMultiZoneCampaignZonesPayload(s);
  assert.equal(payload.length, 2 + 3 + 1);
  const keys = payload.map(p => `${p.campaign_zone_id}|${p.municipality}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual([...new Set(payload.map(p => p.campaign_zone_index))], [0, 1, 2]);
  const flat = flattenMultiZoneAllocation(s);
  assert.equal(flat.length, 6);
  assert.equal(new Set(flat.map(r => r.id)).size, 6);
  assert.equal(s.totalQuantity, 10000 + 14559 + 8000);
  const meta = buildMultiZoneMetadata(s);
  assert.equal(meta.zone_count, 3);
  assert.equal(meta.capacity_deduplicated, false);
});

// ---------------------------------------------------------------- F
test("F. empty / incomplete / unconfirmed zone is flagged and blocks the quote", () => {
  const empty = { id: "zone_empty", searchMode: "municipality", city: null, selectedComuni: [], assigned_flyers: 10000 };
  const unconfirmed = { ...zoneRho, id: "zone_unconfirmed", readyForQuote: undefined };
  const s = summarizeCampaignZones([zoneMonza, empty, unconfirmed]);
  assert.equal(s.allZonesReady, false);
  assert.deepEqual(s.incompleteZones.map(z => z.id), ["zone_empty", "zone_unconfirmed"]);
  assert.ok(s.incompleteZones[0].issues.includes("territorio_mancante"));
  assert.deepEqual(s.incompleteZones[1].issues, ["configurazione_non_confermata"]);
  // Step4 refuses to confirm, Step2 refuses to continue
  assert.match(step4, /const multiZoneBlocked = multiZoneUnsupported \|\| isMultiZoneQuote && !multiZoneSummary\.allZonesReady;/);
  assert.match(step4, /&& !coverageBlocked && !multiZoneBlocked\);/);
  assert.match(step2, /Completa \$\{getCampaignZoneQuoteLabel\(blockingCampaignZone, blockingCampaignZoneIndex\)\} per continuare/);
  // readiness is persisted from the active zone's own gate only
  assert.match(step2, /const activeZoneReadyForQuote = Boolean\(activeZoneQuoteReady && activeZoneHasTerritory && !gisLoading && !apiLoading\);/);
  assert.match(step2, /readyForQuote: true\r?\n      \} : zone\) : prev\.campaignZones,/);
});

test("F. a newly added (still empty) zone never inherits the previous zone's NIL/comuni, allocation or KPI", () => {
  // auto-selection, allocation and snapshot effects skip a multi-zone zone without territory
  assert.match(step2, /if \(\(data\.campaignZones \|\| \[\]\)\.length > 1 && \(!city && searchMode !== "cap" \|\| \(localZoneId \|\| null\) !== \(data\.activeZoneId \|\| null\)\)\) return;/);
  assert.match(step2, /if \(!city && searchMode !== "cap" && data\.campaignZones\.length > 1\) return;/);
  assert.match(step2, /const activeZoneSnapshotForSave = activeZoneHasTerritory \? activeZoneKpiSnapshot : null;/);
  assert.match(step2, /const activeZoneReadyForQuote = Boolean\(activeZoneQuoteReady && activeZoneHasTerritory && !gisLoading && !apiLoading\);/);
});

test("F. a new zone starts from the campaign (Step1) quantity, never from another zone's final quantity", () => {
  // Zona 1 portata a 14.585 con "Aumenta": data.qty segue la zona attiva.
  assert.equal(resolveNewZoneStartingQuantity({ campaignBaseQuantity: 10000, qty: 14585, flyerQuantity: 14585 }), 10000);
  // draft precedenti a questa fase: comportamento legacy (data.qty)
  assert.equal(resolveNewZoneStartingQuantity({ qty: 12000 }), 12000);
  assert.equal(resolveNewZoneStartingQuantity({}), 10000);
  assert.match(step2, /const startQty = resolveNewZoneStartingQuantity\(data\);/);
  assert.match(step2, /campaignBaseQuantity: flyerQuantityFromStep1/);
  // a new zone is never quotable until validated while active
  const fresh = { id: "z_new", searchMode: "municipality", city: null, selectedComuni: [], assigned_flyers: 10000, finalFlyers: 10000 };
  assert.ok(getCampaignZoneIssues(fresh).includes("configurazione_non_confermata"));
});

test("F. non-D2D services with 2+ zones are blocked explicitly instead of dropping zones", () => {
  assert.match(step2, /"Più zone disponibili solo per Door to Door"/);
  assert.match(step4, /const multiZoneUnsupported = !isQuick && svcType !== "d2d" && multiZoneSummary\.isMultiZone;/);
});

// ---------------------------------------------------------------- G
test("G. overlapping radii are detected and capacity is never claimed deduplicated", () => {
  const monzaNear = radiusZone("zone_monza_2", { ...MONZA, lat: MONZA.lat + 0.02 }, 3, 9000, [row("Monza", 9000)], { families: 30000 });
  const overlaps = detectCampaignZoneOverlaps([zoneMonza, monzaNear]);
  assert.equal(overlaps.length, 1);
  assert.equal(overlaps[0].kind, "radius_geometry");
  assert.equal(overlaps[0].certainty, "certain");
  assert.ok(overlaps[0].distanceKm < 6);
  const s = summarizeCampaignZones([zoneMonza, monzaNear]);
  assert.equal(s.hasOverlap, true);
  assert.equal(s.capacityDeduplicated, false);
  assert.equal(s.capacityStatus, "overlap_not_deduplicated");
  // somma esplicita, mai spacciata per unione
  assert.equal(s.totalFamilies, 43000 + 30000);
  assert.equal(buildMultiZoneMetadata(s).capacity_status, "overlap_not_deduplicated");
});

test("G. two radii in the same comune but far apart are NOT an overlap (geometry wins over shared name)", () => {
  const a = radiusZone("a", MILANO, 1, 5000, [row("Milano", 5000)], { center: { lat: 45.50, lng: 9.15 } });
  const b = radiusZone("b", MILANO, 1, 5000, [row("Milano", 5000)], { center: { lat: 45.42, lng: 9.24 } });
  assert.equal(detectCampaignZoneOverlaps([a, b]).length, 0);
});

test("G. comune zone vs radius touching the same comune / shared NIL -> possible overlap", () => {
  const monzaComune = comuneZone("c", MONZA, 47779, [row("Monza", 47779)]);
  const o1 = detectCampaignZoneOverlaps([monzaComune, zoneMonza]);
  assert.equal(o1.length, 1);
  assert.equal(o1[0].certainty, "possible");
  assert.deepEqual(o1[0].sharedUnits, ["monza"]);
  const nilZone = comuneZone("n", MILANO, 7524, [row("BRUZZANO", 7524, 7524, { nil_code: "14" })], { nilManualMode: true, analysisLevel: "nil" });
  const radiusOverBruzzano = radiusZone("r", MILANO, 2, 12000, [row("BRUZZANO", 4000, 4000, { nil_code: "14" }), row("COMASINA", 8000, 8000, { nil_code: "15" })], { analysisLevel: "nil" });
  const o2 = detectCampaignZoneOverlaps([nilZone, radiusOverBruzzano]);
  assert.equal(o2.length, 1);
  assert.deepEqual(o2[0].sharedUnits, ["14"]);
  // warning visibile in Step2 e Step4
  assert.match(step2, /data-testid="step2-multizone-overlap-warning"/);
  assert.match(step4, /<Step4MultiZoneSummary summary=\{multiZoneSummary\} posPricing=\{multiZonePosPricing\}/);
});
