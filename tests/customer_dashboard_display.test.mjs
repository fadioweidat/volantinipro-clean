// Customer dashboard (campaign page, list, configuration panel): readable labels
// instead of technical codes, Italian number/money format, paid vs to-pay total,
// statistics before distribution, Smart Pairing without discount.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DISTRIBUTION_STATS_PENDING, NO_SMART_PAIRING_DISCOUNT, areaModeLabel, campaignStatusLabel, extraServiceLabel, formatEuroIT, formatIntIT,
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
  const page = src.slice(src.indexOf("export function DashboardPage("), src.indexOf('const steps = [["confermata", "Confermata"]'));
  assert.match(page, /\}\}>Campagna \{serviceLabel\(campagna\.servizio\) \|\| ""\} · \{campagna\.zona\}<\/h1>/);
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
