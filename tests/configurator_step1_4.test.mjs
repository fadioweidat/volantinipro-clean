import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CONFIGURATOR_DRAFT_KEY, configuratorHistoryState, readConfiguratorDraft, readConfiguratorHistoryState, writeConfiguratorDraft } from "../src/lib/configuratorState.js";
import { applyConfiguratorServiceChange } from "../src/lib/configuratorServiceTransition.js";
import { apiToZones } from "../src/lib/step2/zoneGeoHelpers.js";
import { resolveTerritorialBreakdown } from "../supabase/functions/analysis-istat/territorialResolver.ts";
import { calendarDateKey, isSelectableCalendarDate, normalizeSmartPairingAvailability } from "../src/lib/smartPairingAvailability.js";
import { calculateQuotePricing, formatQuoteCurrency, resolveQuoteQuantity } from "../src/lib/quotePricing.js";
import { generateQuotePdfBytes, mapQuoteDataToPdfModel, validatePdfBytes } from "../src/lib/pdf/generateQuotePdf.js";
import { resolveAppRoute } from "../src/app/routeResolution.js";
import { formatNumber } from "../src/lib/utils/format.js";

const root = path.resolve(import.meta.dirname, "..");

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("Step 1 persiste integralmente default, modifiche, reload e history back/forward", () => {
  const storage = memoryStorage();
  const state = { type: "d2d", qty: 100000, flyerFormat: "a4", urgency: "urgent", subscription: "monthly3", campaignsPerMonth: 3, printing: { enabled: true, sides: "fronte_retro" } };
  assert.equal(writeConfiguratorDraft(storage, state), true);
  assert.equal(storage.getItem(CONFIGURATOR_DRAFT_KEY).includes("100000"), true);
  assert.deepEqual(readConfiguratorDraft(storage), state);
  const history = configuratorHistoryState(state);
  assert.deepEqual(readConfiguratorHistoryState(history), state);
  storage.setItem(CONFIGURATOR_DRAFT_KEY, "{broken");
  assert.equal(readConfiguratorDraft(storage), null);
});

test("route configuratore risolve Step 1-4", () => {
  for (const step of [1, 2, 3, 4]) assert.equal(resolveAppRoute("/configuratore", { step: String(step) }), `step${step}`);
});

test("cambio D2D/H2H/Business conserva Step 1 e azzera esclusivamente territorio e calendario incompatibili", () => {
  const before = { type: "d2d", qty: 50000, flyerFormat: "a5", urgency: "urgent", printing: { enabled: true }, selectedComuni: ["Milano"], selectedDates: ["2099-08-10"], serviceKpis: { families: 10 } };
  const after = applyConfiguratorServiceChange(before, "h2h");
  assert.equal(after.type, "h2h");
  assert.equal(after.qty, 50000);
  assert.equal(after.urgency, "urgent");
  assert.deepEqual(after.printing, { enabled: true });
  assert.deepEqual(after.selectedComuni, []);
  assert.deepEqual(after.selectedDates, []);
  assert.equal(after.serviceKpis, null);
});

test("Step 2 non fabbrica zone se il backend non restituisce breakdown", () => {
  assert.deepEqual(apiToZones({ values: { famiglie_stimate: 1000 }, comuni_breakdown: [] }, { name: "Milano" }), []);
});

test("NIL dedup usa nil_code e preserva 88 zone, mai il solo municipality_code Milano", () => {
  const nils = Array.from({ length: 88 }, (_, index) => ({ nil_code: String(index + 1), municipality_code: "015146", nil_name: `NIL ${index + 1}` }));
  const result = resolveTerritorialBreakdown({ rawSelectionScope: "municipality", requestedAnalysisLevel: "nil", specificMunicipality: "Milano", nilRows: [...nils, nils[0]], comuni: [] });
  assert.equal(result.territorialRows.length, 88);
  assert.equal(result.territorialRows[0].nil_name, "NIL 1");
});

test("calendario usa ISO, blocca passato/esaurito e accetta date verdi o pairing", () => {
  assert.equal(calendarDateKey(2099, 0, 5), "2099-01-05");
  const normalized = normalizeSmartPairingAvailability({ source: "campaign_capacity", availableDates: [{ date: "2099-01-05", placesAvailable: 4 }, { date: "2099-01-06", placesAvailable: 0 }], smartPairingSlots: [{ date: "2099-01-07", type: "same", discountPercent: 40, placesAvailable: 2 }] });
  assert.deepEqual(normalized.availableDates.map(row => row.date), ["2099-01-05"]);
  assert.equal(isSelectableCalendarDate("2099-01-05", new Set(["2099-01-05"]), null), true);
  assert.equal(isSelectableCalendarDate("2000-01-01", new Set(["2000-01-01"]), null), false);
  assert.equal(isSelectableCalendarDate("2099-01-07", new Set(), { placesAvailable: 0 }), false);
  assert.equal(isSelectableCalendarDate("2099-01-07", new Set(), normalized.smartPairingSlots[0]), true);
});

test("Smart Pairing server limita offset, posti, sconti e non espone identità", () => {
  const source = fs.readFileSync(path.join(root, "supabase/functions/smart-pairing-availability/index.ts"), "utf8");
  assert.match(source, /\[5, 6, 7, 12, 13, 14\]/);
  assert.match(source, /DAILY_CAPACITY = 4/);
  assert.match(source, /sameZone \? 40 : 20/);
  assert.doesNotMatch(source, /select\([^)]*user_id/);
  assert.doesNotMatch(source, /client_email|client_phone|client_name/);
});

test("prezzo distingue null, zero e positivo; urgenza +20%/+35% (P1 pricing engine) e sconti non si duplicano", () => {
  assert.equal(resolveQuoteQuantity({ flyerQuantity: null, qty: undefined }), null);
  assert.equal(resolveQuoteQuantity({ flyerQuantity: 0, qty: 10000 }), 0);
  assert.equal(formatNumber(null, "—"), "—");
  assert.equal(formatNumber(0, "—"), "0");
  const missing = calculateQuotePricing({ quantity: null, pricePerThousand: 18.5 });
  assert.equal(missing.total, null);
  assert.equal(formatQuoteCurrency(missing.total), "—");
  const zero = calculateQuotePricing({ quantity: 0, pricePerThousand: 18.5 });
  assert.equal(zero.total, 0);
  // P1 PRICING ENGINE: urgenza "urgent" e' +20% (era +30%), "express" e'
  // +35% (prima non applicava alcun sovrapprezzo nel totale finale).
  const quote = calculateQuotePricing({ quantity: 10000, pricePerThousand: 20, smartPairingDiscountPct: 40, urgency: "urgent", planDiscountPct: 10, extras: [{ price: 25 }] });
  assert.equal(quote.baseCost, 200);
  assert.equal(quote.smartPairingDiscount, 80);
  assert.equal(quote.urgencySurcharge, 40);
  assert.equal(quote.planDiscountAmount, 16);
  assert.equal(quote.total, 169);
  const expressQuote = calculateQuotePricing({ quantity: 10000, pricePerThousand: 20, urgency: "express" });
  assert.equal(expressQuote.urgencySurcharge, 70); // 200 * 0.35
  const step1 = fs.readFileSync(path.join(root, "src/pages/public/configurator/Step1.jsx"), "utf8");
  assert.match(step1, /Maggiorazione \+20%/);
  assert.doesNotMatch(step1, /Maggiorazione \+30%/);
});

test("UI, payload DB e PDF condividono lo stesso totale e il PDF è valido", () => {
  const pricing = calculateQuotePricing({ quantity: 10000, pricePerThousand: 18.5, urgency: "urgent", extras: [{ price: 45 }] });
  const quote = { quoteId: "P1-LOCAL", service: "Door to Door", campaign: { quantity: 10000, format: "A5" }, area: { mainArea: "Milano" }, outputs: { insertedFlyers: 10000, recommendedFlyers: 9000, coverageStatus: "sufficient" }, planning: { selectedDates: ["10 agosto 2099"] }, pricing: { lines: [{ label: "Distribuzione", quantity: 10000, unitPrice: 0.0185, total: pricing.baseCost }], subtotal: pricing.baseCost, extras: [{ label: "Extra", amount: 45 }], discounts: [], total: pricing.total }, sources: ["ISTAT"] };
  const model = mapQuoteDataToPdfModel(quote);
  assert.equal(model.pricing.total, pricing.total);
  const bytes = generateQuotePdfBytes(quote);
  assert.equal(validatePdfBytes(bytes), true);
  const step4 = fs.readFileSync(path.join(root, "src/pages/public/configurator/Step4.jsx"), "utf8");
  // total_amount (importo distribuzione pagabile via bonifico) resta il
  // totale distribuzione: stampa/grafica confermate e fatturate a parte.
  assert.match(step4, /total_amount: Number\(total\.toFixed\(2\)\)/);
  assert.match(step4, /pricing: quotePdfData\.pricing/);
  // P1 STAMPA SEPARATA DAL PREVENTIVO: "total" resta il totale distribuzione
  // (stampa esclusa) e il blocco pricing espone un campo "printing" separato.
  // Il "Prezzo finale" mostrato al cliente (hero Step 4 + PDF) usa invece
  // grandTotal = distribuzione + stampa indicativa + grafica.
  assert.match(step4, /const grandTotal = Number\(\(total \+ printingLinePrice \+ graphicLinePrice\)\.toFixed\(2\)\)/);
  assert.match(step4, /pricing: \{[\s\S]*?\btotal,[\s\S]*?\bgrandTotal,[\s\S]*?printing: printingExtra \? \{/);
  assert.match(step4, /metadata: \{[\s\S]{0,40}grand_total: grandTotal,/);
  assert.match(step4, /const distributionExtras = selectedExtras\.filter\(e => e\.id !== "printing"\)/);
  assert.match(step4, /extras: distributionExtras, distributionZones: distributionZonesForPricing/);
  assert.match(step4, /quantityIsSufficient == null \? null/);
  assert.match(step4, /coverageStatus: quantityIsSufficient == null \? "unavailable"/);

  // Il PDF (printQuotePdf.js) usa grandTotal per il totale, lo etichetta
  // "Totale complessivo" e NON contiene testo contraddittorio "non inclusa
  // nel totale".
  const pdf = fs.readFileSync(path.join(root, "src/lib/pdf/printQuotePdf.js"), "utf8");
  assert.match(pdf, /pricing\.grandTotal != null \? pricing\.grandTotal : pricing\.total/);
  assert.match(pdf, /Totale complessivo/);
  assert.doesNotMatch(pdf, /Totale stimato/);
  assert.doesNotMatch(pdf, /non inclusa nel totale/);
  // Header professionale + sezione dati cliente + servizi inclusi
  assert.match(pdf, /class="brand-contact"/);
  assert.match(pdf, /"Dati cliente"/);
  assert.match(pdf, /"Servizi inclusi nel preventivo"/);
  // Parte F: niente più sezione KPI "Indicatori servizio" nel PDF principale
  assert.doesNotMatch(pdf, /"Indicatori servizio"/);
});

test("salvataggio cliente dispone del solo INSERT profile per-owner e campaigns resta vincolata al JWT", () => {
  const profilePolicy = fs.readFileSync(path.join(root, "supabase/migrations_legacy_pre_rebaseline_20260821/20260805000008_profiles_own_insert.sql"), "utf8");
  const profileGrant = fs.readFileSync(path.join(root, "supabase/migrations_legacy_pre_rebaseline_20260821/20260805000009_profiles_authenticated_insert_grant.sql"), "utf8");
  const reconciledRls = fs.readFileSync(path.join(root, "supabase/migrations_legacy_pre_rebaseline_20260821/030_reconcile_gps_session_rpc.sql"), "utf8");
  const client = fs.readFileSync(path.join(root, "src/lib/supabaseClient.js"), "utf8");
  assert.match(profilePolicy, /with check \(auth\.uid\(\) = id\)/i);
  assert.match(profileGrant, /grant insert on table public\.profiles to authenticated/i);
  assert.match(reconciledRls, /campaigns_own_insert[\s\S]*auth\.uid\(\) = user_id/i);
  assert.match(client, /user_id: profile\.id/);
  assert.doesNotMatch(client, /SERVICE_ROLE_KEY|service_role/i);
});
