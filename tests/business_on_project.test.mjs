import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  BUSINESS_CONFIRMATION,
  BUSINESS_MACRO_TARGETS,
  BUSINESS_RESPONSE_TIME,
  ON_PROJECT_LABEL,
  buildOnProjectPayload,
  businessMissingAnswers,
  isOnProjectCampaign,
  onProjectAmount,
} from "../src/lib/business/businessOnProject.js";
import { normalizeCampaign } from "../src/lib/services/admin-api.js";
import { normalizeCustomerCampaign } from "../src/lib/customerCampaigns.js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const complete = { businessZone: "Varedo", distributionTargets: ["retail"], businessMaterialQuantity: 500, campaignPeriodPreset: "asap", hasFlyers: "no" };

test("le 5 risposte bastano e ognuna e' obbligatoria", () => {
  assert.deepEqual(businessMissingAnswers(complete), []);
  assert.equal(businessMissingAnswers({}).length, 5);
  assert.equal(businessMissingAnswers({ ...complete, businessDefinitionMode: "activities" }).length, 1);
  assert.deepEqual(businessMissingAnswers({ ...complete, businessDefinitionMode: "activities", businessTargetCount: 30 }), []);
  assert.equal(businessMissingAnswers({ ...complete, campaignPeriodPreset: "custom" }).length, 1);
  assert.deepEqual(businessMissingAnswers({ ...complete, campaignPeriodPreset: "custom", startDate: "2026-11-09" }), []);
});

test("8 categorie grandi, nessuna perde i valori dettagliati", () => {
  assert.equal(BUSINESS_MACRO_TARGETS.length, 8);
  assert.ok(BUSINESS_MACRO_TARGETS.every((macro) => macro.values.length > 0));
});

test("il payload Su progetto non contiene prezzi e conserva le risposte", () => {
  const payload = buildOnProjectPayload(
    { service_type: "b2b", total_amount: 350, campaignZones: [{ municipality: "Varedo", quantity: 0 }], metadata: { grand_total: 350, pricing: { total: 350 }, quote_summary: { total: 350 }, zona: "Varedo" } },
    { ...complete, businessNotes: "Citofonare" },
  );
  assert.equal(payload.total_amount, null);
  assert.equal(payload.service_type, "business");
  assert.equal(payload.metadata.pricing_mode, "on_project");
  assert.equal(payload.metadata.grand_total, null);
  assert.equal("pricing" in payload.metadata, false);
  assert.equal("quote_summary" in payload.metadata, false);
  assert.equal(payload.campaignZones[0].quantity, 500);
  assert.equal(payload.metadata.business_request.businessZone, "Varedo");
  assert.equal(payload.metadata.business_request.businessNotes, "Citofonare");
  assert.doesNotMatch(JSON.stringify(payload), /350/);
});

test("con il numero di attivita' non si inventa una quantita' di volantini", () => {
  const payload = buildOnProjectPayload({ campaignZones: [{ municipality: "Varedo", quantity: 0 }], metadata: {} }, { businessDefinitionMode: "activities", businessTargetCount: 30, qty: 0 });
  assert.equal(payload.flyer_quantity, 0);
  assert.deepEqual(payload.campaignZones, []);
  assert.equal(payload.metadata.business_request.businessTargetCount, 30);
});

test("admin: Su progetto, totale vuoto anche se il database contiene 0", () => {
  for (const total_amount of [null, 0]) {
    const row = normalizeCampaign({ id: "1", service_type: "business", status: "pending_review", total_amount, metadata: { pricing_mode: "on_project" } }, "campaigns");
    assert.equal(row.total, null);
    assert.equal(row.onProject, true);
    assert.equal(onProjectAmount(row, () => "€0"), ON_PROJECT_LABEL);
  }
  const sum = [{ total: null }, { total: 100 }].reduce((acc, r) => acc + (r.total || 0), 0);
  assert.equal(sum, 100);
});

test("cliente: nessun importo e nessun pagamento in attesa", () => {
  const campaign = normalizeCustomerCampaign({ id: "1", service_type: "business", status: "pending_review", total_amount: 0, metadata: { pricing_mode: "on_project", payment_status: "in_attesa_pagamento" } });
  assert.equal(campaign.totale_euro, null);
  assert.equal(campaign.su_progetto, true);
  assert.equal(campaign.stato_pagamento, null);
  assert.equal(onProjectAmount(campaign, () => "€0,00"), ON_PROJECT_LABEL);
});

test("le altre campagne non cambiano", () => {
  assert.equal(isOnProjectCampaign({ metadata: {} }), false);
  assert.equal(isOnProjectCampaign({}), false);
  assert.equal(normalizeCampaign({ id: "1", service_type: "d2d", total_amount: 120, metadata: {} }, "campaigns").total, 120);
});

test("un solo testo per i tempi di risposta", () => {
  assert.ok(BUSINESS_CONFIRMATION.includes(BUSINESS_RESPONSE_TIME));
  for (const file of ["src/components/home/FAQSection.jsx", "src/components/home/EnterpriseSection.jsx", "src/pages/public/ConsultantPage.jsx", "src/pages/public/QuickQuotePage.jsx", "src/pages/public/configurator/step4/Step4CampaignActionsPanel.jsx"]) {
    assert.ok(read(file).includes("BUSINESS_RESPONSE_TIME"), file);
    assert.doesNotMatch(read(file), /entro 2 ore/);
  }
});

test("homepage Smart Pairing: 40% reale, nessuna percentuale d'esempio", () => {
  const source = read("src/components/home/SmartPairingSection.jsx");
  assert.ok(source.includes("Risparmio fino al 40% sulla distribuzione"));
  assert.doesNotMatch(source, /72%/);
});

test("la Edge Function salva null per Su progetto e riconosce b2b", () => {
  const source = read("supabase/functions/submit-campaign-request/index.ts");
  assert.ok(source.includes('body.metadata?.pricing_mode === "on_project"'));
  assert.ok(source.includes('"b2b", "business"'));
});
