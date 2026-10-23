// Customer dashboard (campaign page, list, configuration panel): readable labels
// instead of technical codes, Italian number/money format, paid vs to-pay total,
// statistics before distribution, Smart Pairing without discount.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DISTRIBUTION_STATS_PENDING, NO_SMART_PAIRING_DISCOUNT, areaModeLabel, campaignStatusLabel, extraServiceLabel, formatEuroIT, formatIntIT,
  campaignAreaTitle, campaignDatesLabel, formatDateIT, formatPlaceName,
  formatLabel, graphicStatusLabel, isCampaignPaid, isDistributionStarted, printSpecsLabel, serviceLabel, smartPairingLabel, variantLabel, zonesCountLabel,
} from "../src/lib/customerDisplay.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("Italian format: thousands always grouped, two decimals, € in front", () => {
  assert.equal(formatIntIT(3353), "3.353");
  assert.equal(formatIntIT(38660), "38.660");
  assert.equal(formatIntIT(1234567), "1.234.567");
  assert.equal(formatIntIT(999), "999");
  assert.equal(formatEuroIT(1524.44), "€1.524,44");
  assert.equal(formatEuroIT(60), "€60,00");
  assert.equal(formatEuroIT(-60), "-€60,00");
  assert.equal(formatEuroIT(1234567.8), "€1.234.567,80");
  for (const bad of [null, undefined, "", "abc"]) { assert.equal(formatIntIT(bad), null); assert.equal(formatEuroIT(bad), null); }
});

test("technical codes become readable labels; unknown values are shown, never invented", () => {
  assert.equal(serviceLabel("d2d"), "Door to Door");
  assert.equal(serviceLabel("h2h"), "Hand to Hand");
  assert.equal(serviceLabel("b2b"), "Distribuzione Business");
  assert.equal(serviceLabel("Door to Door"), "Door to Door");
  assert.equal(areaModeLabel("radius"), "Raggio");
  assert.equal(areaModeLabel("nil"), "Quartieri (NIL)");
  assert.equal(extraServiceLabel("tracking_gps"), "Tracking GPS");
  assert.equal(extraServiceLabel("photo_proof"), "Foto Proof Base");
  assert.equal(printSpecsLabel({ format: "a5", sides: "fronte_retro", color: "cmyk" }), "A5 · Fronte e retro · A colori");
  assert.equal(printSpecsLabel({ format: "a4", sides: "fronte", color: "bn" }), "A4 · Solo fronte · Bianco e nero");
  assert.equal(graphicStatusLabel("READY"), "File pronto");
  assert.equal(graphicStatusLabel("NEEDS_DESIGN"), "Grafica da realizzare");
  assert.equal(variantLabel("single"), "Campagna singola");
  assert.equal(formatLabel("a5"), "A5");
  assert.equal(campaignStatusLabel("annullata"), "Annullata");
  assert.equal(zonesCountLabel(1), "1 zona");
  assert.equal(zonesCountLabel(3), "3 zone");
  assert.equal(serviceLabel("servizio_nuovo"), "servizio_nuovo");
  assert.equal(serviceLabel(null), null);
});

test("paid only when the payment is recorded; statistics only once distribution started; Smart Pairing wording", () => {
  assert.equal(isCampaignPaid({ stato_pagamento: "in_attesa" }), false);
  assert.equal(isCampaignPaid({ stato_pagamento: "in_attesa_pagamento" }), false);
  assert.equal(isCampaignPaid({ stato_pagamento: "pagato" }), true);
  assert.equal(isCampaignPaid({ settlement: { settlement_status: "settled_by_verified_receipt" } }), true);
  assert.equal(isCampaignPaid({ settlement: { settlement_status: "awaiting_payment" } }), false);
  assert.equal(isDistributionStarted({ stato: "confermata" }), false);
  assert.equal(isDistributionStarted({ stato: "in_preparazione" }), false);
  assert.equal(isDistributionStarted({ stato: "in_distribuzione" }), true);
  assert.equal(isDistributionStarted({ stato: "completata" }), true);
  assert.equal(DISTRIBUTION_STATS_PENDING, "Disponibile durante la distribuzione");
  assert.equal(smartPairingLabel(0), NO_SMART_PAIRING_DISCOUNT);
  assert.equal(smartPairingLabel(null), NO_SMART_PAIRING_DISCOUNT);
  assert.equal(smartPairingLabel(20), "20%");
  assert.equal(NO_SMART_PAIRING_DISCOUNT, "Nessuno sconto Smart Pairing per questa campagna");
});

test("campaign page and list use the helpers (no raw codes, no toLocaleString money)", () => {
  const src = read("volantinipro-final.jsx");
  const start = src.indexOf("export function DashboardPage(");
  const page = src.slice(start, src.indexOf("export function PagamentoBonificoPage(", start));
  assert.doesNotMatch(page, /"7\.420"|VP-12052026-001/, "unreachable demo values removed");
  assert.match(page, /\}\}>Campagna \{serviceLabel\(campagna\.servizio\) \|\| ""\} · \{campaignAreaTitle\(campagna\)\}<\/h1>/);
  assert.match(page, /\[isCampaignPaid\(campagna\) \? "Totale pagato" : "Totale da pagare", total\]/);
  assert.match(page, /isDistributionStarted\(campagna\) \?/);
  assert.match(page, /\.map\(\(l\) => \[l, DISTRIBUTION_STATS_PENDING, null, C\.white\]\)/);
  assert.match(page, /\{NO_SMART_PAIRING_DISCOUNT\}/);
  assert.match(page, /formatEuroIT\(campagna\.totale_euro\)/);
  assert.match(page, /\["Totale speso", formatEuroIT\(totalSpent\)/);
  assert.doesNotMatch(page, /toLocaleString\("it-IT", \{\s*minimumFractionDigits: 2/);
  assert.doesNotMatch(page, /campagna\.quantita\.toLocaleString/);
  assert.doesNotMatch(page, /\["D2D", C\.orange\]/);
  const panels = read("src/components/customer/CampaignHubPanels.jsx");
  for (const re of [/value=\{serviceLabel\(campagna\?\.servizio\)\}/, /value=\{areaModeLabel\(quote\.area\?\.areaMode\)\}/, /value=\{variantLabel\(quote\.campaign\?\.variant\)\}/, /printSpecsLabel\(step4\)/, /graphicStatusLabel\(quote\.campaign\?\.graphicStatus\)/, /extraServiceLabel\(s\)/, /value=\{formatEuroIT\(campagna\?\.totale_euro\)\}/]) assert.match(panels, re);
  const summary = read("src/components/customer/CampaignSettlementSummary.jsx");
  assert.match(summary, /formatEuroIT/);
  assert.match(summary, /color: 'rgba\(255,255,255,\.85\)'/);
});

test("campaign list: place names like comuni, area title with names, dates in words", () => {
  assert.equal(formatPlaceName("COMASINA"), "Comasina");
  assert.equal(formatPlaceName("MAGGIORE - MUSOCCO - CERTOSA"), "Maggiore - Musocco - Certosa");
  assert.equal(formatPlaceName("PARCO DEI NAVIGLI"), "Parco dei Navigli");
  assert.equal(formatPlaceName("QT 8"), "QT 8");
  assert.equal(formatPlaceName("Cassina de' Pecchi"), "Cassina de' Pecchi", "mixed case kept");
  assert.equal(campaignAreaTitle({ comuni: ["Abbiategrasso", "Albairate", "Cisliano"], zona: "3 comuni completi" }), "Abbiategrasso + 2 comuni");
  assert.equal(campaignAreaTitle({ comuni: ["Abbiategrasso", "Albairate"], zona: "2 comuni completi" }), "Abbiategrasso + 1 comune");
  assert.equal(campaignAreaTitle({ comuni: ["COMASINA", "BRUZZANO"], metadata: { campaign_zones: [{ territory_type: "nil" }, { territory_type: "nil" }] } }), "Comasina + 1 quartiere");
  assert.equal(campaignAreaTitle({ comuni: [], zona: "BRUZZANO" }), "Bruzzano");
  assert.equal(formatDateIT("2026-11-12"), "12/11/2026");
  assert.equal(campaignDatesLabel("2026-11-12", "2026-11-15"), "Dal 12/11/2026 al 15/11/2026");
  assert.equal(campaignDatesLabel(null, null), "Date da definire");
});

test("campaign list card: no bare 'Dato non disponibile' (fields named or hidden)", () => {
  const src = read("volantinipro-final.jsx");
  const start = src.indexOf("export function DashboardPage(");
  const list = src.slice(start, src.indexOf("export function CampaignDashboardPage(", start));
  assert.match(list, /campaignDatesLabel\(campagna\.data_inizio, campagna\.data_fine\)\]\.filter\(Boolean\)\.join\(" · "\)/);
  assert.doesNotMatch(list, /customerValue\(campagna\.data_inizio\)|customerValue\(campagna\.data_fine\)/);
  assert.match(list, /: paymentState === CUSTOMER_PAYMENT_STATE\.PENDING \? "In attesa pagamento" : null;/);
  assert.match(list, /\{paymentLabel && <span/);
  assert.match(list, />Importo da definire</);
  assert.match(list, /\{campaignAreaTitle\(campagna\) \|\| "Zona da definire"\}/);
});
test("list KPI 'Avanzamento distribuzione': real final coverage of started campaigns, weighted by quantity", async () => {
  const { buildDistributionProgress } = await import("../src/lib/customerDashboardMetrics.js");
  const a = { id: "a", stato: "in_distribuzione", quantita: 3000 };
  const b = { id: "b", stato: "completata", quantita: 1000 };
  const c = { id: "c", stato: "confermata", quantita: 9000 };
  assert.deepEqual(buildDistributionProgress([c], {}), { status: "not_started", pct: null, note: null });
  assert.equal(buildDistributionProgress([a, c], {}).status, "loading");
  const one = buildDistributionProgress([a, c], { a: 42.5 });
  assert.equal(one.pct, 42.5);
  assert.equal(one.note, "Copertura verificata su 1 campagna in distribuzione o completata");
  assert.equal(buildDistributionProgress([a, b], { a: 40, b: 100 }).pct, 55, "(40*3000 + 100*1000) / 4000");
  const partial = buildDistributionProgress([a, b], { a: 40, b: null });
  assert.equal(partial.pct, 40);
  assert.match(partial.note, /1 campagna senza dato di copertura/);
  assert.equal(buildDistributionProgress([a], { a: null }).status, "unavailable");
  assert.equal(buildDistributionProgress([a], { a: 10 }, { error: "x" }).pct, null);
  const src = read("volantinipro-final.jsx");
  const list = src.slice(src.indexOf("export function DashboardPage("), src.indexOf("export function CampaignDashboardPage("));
  assert.match(list, /\["Avanzamento distribuzione", progressValue, C\.blue, progress\.note, progress\.status === "loading"\]/);
  assert.match(list, /getFinalCoverage\(id\)/);
  assert.doesNotMatch(list, /\["Volantini distribuiti"/);
  assert.match(list, /return <div className="vp-campaign-dashboard-shell" style=\{\{\s*minHeight: "100vh",\s*background: C\.navyMid\s*\}\}>/, "list top spacing 32/20 like the campaign page");
  assert.doesNotMatch(list, /padding: "105px 24px 80px"/);
});

test("campaign page: 'Avanzamento distribuzione' in Italian %, no duplicate coverage row, completed zones from zone progress", async () => {
  const { formatPercentIT, completedZonesSummary, completedZonesLabel } = await import("../src/lib/customerDisplay.js");
  assert.equal(formatPercentIT(42.57), "42,6%");
  assert.equal(formatPercentIT(42.6), "42,6%");
  assert.equal(formatPercentIT(100), "100%");
  assert.equal(formatPercentIT(0), "0%");
  for (const bad of [null, undefined, "", "abc"]) assert.equal(formatPercentIT(bad), null);
  // zone progress rows as normalised by zoneProgressClient (null = zone without data)
  assert.equal(completedZonesSummary([]), null);
  assert.equal(completedZonesSummary([{ effective_percent: null }, { effective_percent: null }]), null, "no data -> row hidden");
  assert.deepEqual(completedZonesSummary([{ effective_percent: 100 }, { effective_percent: 64.2 }, { effective_percent: null }]), { done: 1, total: 3, pct: 33 });
  assert.deepEqual(completedZonesSummary([{ effective_percent: 100 }, { effective_percent: 100 }]), { done: 2, total: 2, pct: 100 });
  assert.equal(completedZonesLabel({ metadata: { campaign_zones: [{ territory_type: "nil" }] } }), "Quartieri completati");
  assert.equal(completedZonesLabel({ comuni: ["Abbiategrasso"] }), "Comuni completati");

  const src = read("volantinipro-final.jsx");
  const page = src.slice(src.indexOf("export function CampaignDashboardPage("), src.indexOf("export function PagamentoBonificoPage("));
  assert.match(page, /\["Avanzamento distribuzione", progressPct == null \? customerValue\(null\) : formatPercentIT\(progressPct\), progressPct, C\.green\]/);
  assert.match(page, /\.\.\.\(zonesDone \? \[\[completedZonesLabel\(campagna\), `\$\{zonesDone\.done\}\/\$\{zonesDone\.total\}`, zonesDone\.pct, C\.blue\]\] : \[\]\)/);
  assert.match(page, /zoneProgressClient\.getCampaignZoneProgress\(zoneProgressCampaignId\)/);
  assert.match(page, /: \["Avanzamento distribuzione", completedZonesLabel\(campagna\), "Giorni rimanenti"\]\.map\(/);
  assert.doesNotMatch(page, /Copertura raggiunta|"Volantini distribuiti"|distributedPct/);
  // hooks run before the early returns
  assert.ok(page.indexOf("useState(null)") < page.indexOf("if (loading) {"));
});

test("homepage dashboard demo: photo address wording matches the real feature", () => {
  const home = read("src/components/home/DashboardClienteSection.jsx");
  assert.match(home, /\{item\.zone\} · Indirizzo rilevato dal GPS/);
  assert.doesNotMatch(home, /Civico verificato/);
});
