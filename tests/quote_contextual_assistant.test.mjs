import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildQuoteAssistantBaseContext,
  buildQuoteAssistantStep2Context,
  buildQuoteAssistantStep4Context,
  quickQuestionsForPage,
} from "../src/ai/context/buildQuoteAssistantContext.js";

test("quick questions cambiano per Step e rispettano il ticket", () => {
  assert.deepEqual(quickQuestionsForPage("step1"), ["Come funziona?", "Quanti volantini mi consigli?", "Posso modificare dopo?"]);
  assert.deepEqual(quickQuestionsForPage("step2"), ["Cosa significa questa copertura?", "Comune o Raggio?", "Copro tutta la zona?"]);
  assert.deepEqual(quickQuestionsForPage("step3"), ["Quale servizio scegliere?", "Cosa cambia tra i servizi?"]);
  assert.deepEqual(quickQuestionsForPage("step4"), ["Spiegami il totale", "La stampa è inclusa?", "Cos'è il GPS?", "Posso scaricare il PDF?"]);
});

test("Step1 espone solo località, quantità, tipo richiesta e stato", () => {
  const context = buildQuoteAssistantBaseContext("step1", {
    type: "d2d", qty: 5000, cityName: "Monza",
    contactRequestData: { nome: "Mario", email: "mario@example.com", telefono: "+39 333 1234567" },
    access_token: "secret",
  });
  assert.equal(context.step, 1);
  assert.equal(context.request.quantity, 5000);
  assert.equal(context.location.municipality, "Monza");
  assert.equal(context.service.title, "Door to Door");
  assert.doesNotMatch(JSON.stringify(context), /Mario|example\.com|1234567|secret/);
});

test("Step2 usa senza ricalcoli i KPI reali dello snapshot", () => {
  const snapshot = {
    state: "complete",
    service: { key: "d2d", title: "Door to Door" },
    territory: { label: "Varedo", mode: "radius", modeLabel: "Raggio", radiusKm: 3, selectedNames: ["Varedo"] },
    quantity: { inserted: 10000, current: 10000, recommended: 22000, shortage: 12000, surplus: 0 },
    metrics: { residentialCoveragePct: 45, families: 22000 },
    calculation: { status: "ready" }, missing: [], limitations: [],
  };
  const context = buildQuoteAssistantStep2Context(snapshot, { type: "d2d", qty: 10000 });
  assert.equal(context.kpis.residentialCoveragePct, 45);
  assert.equal(context.quantity.current, 10000);
  assert.equal(context.territory.radiusKm, 3);
  assert.equal(context.location.municipality, "Varedo");
});

test("Step3 include servizio corrente e alternative ufficiali, senza cambiare stato", () => {
  const data = { type: "h2h", qty: 10000, cityName: "Milano" };
  const before = structuredClone(data);
  const context = buildQuoteAssistantBaseContext("step3", data);
  assert.equal(context.service.title, "Hand to Hand");
  assert.equal(context.availableServices.length, 3);
  assert.deepEqual(data, before);
});

test("Step4 usa il grandTotal e le componenti ricevute dallo Step, senza PII", () => {
  const context = buildQuoteAssistantStep4Context({
    type: "d2d", qty: 10000, cityName: "Monza", contactRequestData: { email: "private@example.com" },
  }, {
    distributionBase: 185, distributionAndExtrasTotal: 245, printingSelected: true, printingAmount: 90,
    graphicsRequired: true, graphicsSelected: true, graphicsAmount: 79,
    extras: [{ id: "tracking_gps", label: "Tracking GPS", description: "Monitoraggio operativo della distribuzione.", amount: 60 }],
    grandTotal: 414, pdfAvailable: true,
  });
  assert.equal(context.pricing.grandTotal, 414);
  assert.equal(context.pricing.distributionAndExtrasTotal, 245);
  assert.equal(context.pricing.printing.amount, 90);
  assert.equal(context.pricing.graphics.amount, 79);
  assert.equal(context.premiumServices[0].id, "tracking_gps");
  assert.doesNotMatch(JSON.stringify(context), /private@example\.com/);
});

test("UI mostra fallback e contatti, senza API di mutazione del preventivo", () => {
  const panel = fs.readFileSync("src/components/ai/quote/QuoteAssistantPanel.jsx", "utf8");
  assert.match(panel, /Assistente momentaneamente non disponibile\./);
  assert.match(panel, /\+39 351 767 3737/);
  assert.match(panel, /info@volantinipro\.it/);
  assert.match(panel, /HUMAN_REQUEST/);
  assert.doesNotMatch(panel, /setData|setStep|onNext|onBack/);
});

test("backend abilita Step1-4, rifiuta PII e verifica i numeri generati", () => {
  const source = fs.readFileSync("supabase/functions/ai-core/index.ts", "utf8");
  const config = fs.readFileSync("supabase/config.toml", "utf8");
  assert.match(source, /QUOTE_CONTEXT_TYPES = new Set\(\["step1", "step2", "step3", "step4"\]\)/);
  assert.match(source, /SENSITIVE_CONTEXT_REJECTED/);
  assert.match(source, /OPENAI_UNGROUNDED_NUMBER/);
  assert.match(source, /deterministicQuoteResponse/);
  assert.match(config, /\[functions\.ai-core\][\s\S]*verify_jwt = false/);
});
