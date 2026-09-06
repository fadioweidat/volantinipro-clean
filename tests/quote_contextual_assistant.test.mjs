import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildQuoteAssistantBaseContext,
  buildQuoteAssistantStep2Context,
  buildQuoteAssistantStep4Context,
  generateClientStep2Answer,
  generateStep2QuickQuestions,
  quickQuestionsForPage,
} from "../src/ai/context/buildQuoteAssistantContext.js";

test("quick questions statiche di base per Step 1, 3, 4", () => {
  assert.deepEqual(quickQuestionsForPage("step1"), ["Come funziona?", "Quanti volantini mi consigli?", "Posso modificare dopo?"]);
  assert.deepEqual(quickQuestionsForPage("step3"), ["Quale servizio scegliere?", "Cosa cambia tra i servizi?"]);
  assert.deepEqual(quickQuestionsForPage("step4"), ["Spiegami il totale", "La stampa è inclusa?", "Cos'è il GPS?", "Posso scaricare il PDF?"]);
});

test("CASO A — Comune standard (Cormano, 10.000 volantini, 45% copertura, 22.000 famiglie)", () => {
  const snapshot = {
    state: "complete",
    service: { key: "d2d", title: "Door to Door" },
    territory: { label: "Cormano", mode: "comune", modeLabel: "Comune", selectedNames: ["Cormano"] },
    quantity: { inserted: 10000, current: 10000, recommended: 22000, shortage: 12000, surplus: 0 },
    metrics: { residentialCoveragePct: 45, families: 22000, recommendedQuantity: 22000 },
    calculation: { status: "ready" }, missing: [], limitations: [],
  };
  const context = buildQuoteAssistantStep2Context(snapshot, { cityName: "Cormano", qty: 10000 });
  assert.equal(context.comune, "Cormano");
  assert.equal(context.quantitaInserita, 10000);
  assert.equal(context.famiglie, 22000);
  assert.equal(context.coveragePct, 45);
  assert.equal(context.recommendedQuantity, 22000);
  assert.equal(context.quantityMissing, 12000);

  // Dynamic quick questions
  const questions = generateStep2QuickQuestions(context);
  assert.ok(questions.length >= 4 && questions.length <= 6);
  assert.ok(questions.some((q) => q.includes("Cormano")));

  // Grounded Answers
  const a1 = generateClientStep2Answer("Quanto copro con questa quantità?", context);
  assert.match(a1, /10\.000/);
  assert.match(a1, /Cormano/);
  assert.match(a1, /45%/);

  const a2 = generateClientStep2Answer("Quanti volantini servono per copertura completa?", context);
  assert.match(a2, /22\.000/);
  assert.match(a2, /12\.000/);

  const a3 = generateClientStep2Answer("Perché la copertura è 45%?", context);
  assert.match(a3, /45%/);
  assert.match(a3, /10\.000/);
  assert.match(a3, /22\.000/);

  const a4 = generateClientStep2Answer("Quante famiglie ci sono?", context);
  assert.match(a4, /22\.000/);

  const a5 = generateClientStep2Answer("Qual è la quantità consigliata?", context);
  assert.match(a5, /22\.000/);

  const a6 = generateClientStep2Answer("Cosa cambia tra Comune / Raggio / NIL?", context);
  assert.match(a6, /Comune/);
  assert.match(a6, /Raggio/);
  assert.match(a6, /NIL/);

  const a10 = generateClientStep2Answer("Cosa significa Auto / Priorità / Manuale?", context);
  assert.match(a10, /Auto/);
  assert.match(a10, /Priorit/);
  assert.match(a10, /Manuale/);

  const a11 = generateClientStep2Answer("Cosa succede se aggiungo un altro comune?", context);
  assert.match(a11, /altro comune/);
  assert.match(a11, /copertura/);
});

test("CASO B — Raggio (raggio 3 km, 15.000 volantini)", () => {
  const snapshot = {
    state: "complete",
    service: { key: "d2d", title: "Door to Door" },
    territory: { label: "Milano", mode: "radius", modeLabel: "Raggio", radiusKm: 3, selectedNames: ["Milano"] },
    quantity: { inserted: 15000, current: 15000, recommended: 30000, shortage: 15000 },
    metrics: { residentialCoveragePct: 50, families: 30000 },
  };
  const context = buildQuoteAssistantStep2Context(snapshot, { areaMode: "radius", radius: 3, qty: 15000, cityName: "Milano" });
  assert.equal(context.coverageMode, "radius");
  assert.equal(context.radiusKm, 3);
  assert.equal(context.quantitaInserita, 15000);

  const questions = generateStep2QuickQuestions(context);
  assert.ok(questions.some((q) => q.includes("3 km") || q.includes("raggio")));

  const a = generateClientStep2Answer("Cosa cambia tra Comune e Raggio?", context);
  assert.match(a, /3 km/);
  assert.match(a, /Raggio/);
});

test("CASO C — NIL (Milano con NIL selezionato: Bruzzano)", () => {
  const snapshot = {
    state: "complete",
    service: { key: "d2d", title: "Door to Door" },
    territory: { label: "Milano", mode: "nil", modeLabel: "NIL", selectedNames: ["Bruzzano"] },
    quantity: { inserted: 5000, current: 5000, recommended: 6000, shortage: 1000 },
    metrics: { residentialCoveragePct: 83, families: 6000 },
  };
  const context = buildQuoteAssistantStep2Context(snapshot, { areaMode: "nil", cityName: "Milano" }, { selectedNils: ["Bruzzano"] });
  assert.equal(context.coverageMode, "nil");
  assert.deepEqual(context.selectedNils, ["Bruzzano"]);

  const questions = generateStep2QuickQuestions(context);
  assert.ok(questions.some((q) => q.includes("Bruzzano") || q.includes("NIL")));

  const aNil = generateClientStep2Answer("Cos'è un NIL?", context);
  assert.match(aNil, /Nuclei di Identità Locale/);
  assert.match(aNil, /Bruzzano/);
});

test("CASO D — Frazione (Palazzolo -> Paderno Dugnano (MI))", () => {
  const snapshot = {
    state: "complete",
    service: { key: "d2d", title: "Door to Door" },
    territory: { label: "Paderno Dugnano", mode: "comune", selectedNames: ["Paderno Dugnano"] },
    quantity: { inserted: 8000, current: 8000, recommended: 20000, shortage: 12000 },
    metrics: { residentialCoveragePct: 40, families: 20000 },
  };
  const context = buildQuoteAssistantStep2Context(snapshot, {
    cityName: "Paderno Dugnano",
    provincia: "MI",
    localita: "Palazzolo",
    frazione: "Palazzolo",
    qty: 8000,
  });

  assert.equal(context.comune, "Paderno Dugnano");
  assert.equal(context.frazione, "Palazzolo");
  assert.equal(context.provincia, "MI");

  const questions = generateStep2QuickQuestions(context);
  assert.ok(questions.some((q) => q.includes("Palazzolo")));

  const aFrazione = generateClientStep2Answer("Come viene gestita la frazione Palazzolo?", context);
  assert.match(aFrazione, /Palazzolo/);
  assert.match(aFrazione, /Paderno Dugnano/);

  const aComune = generateClientStep2Answer("Qual è il comune amministrativo della località selezionata?", context);
  assert.match(aComune, /Palazzolo/);
  assert.match(aComune, /Paderno Dugnano/);
  assert.match(aComune, /MI/);
});

test("CASO E — Dato non disponibile (territorialDataUnavailable=true)", () => {
  const snapshot = {
    state: "unavailable",
    service: { key: "d2d", title: "Door to Door" },
    territory: { label: "Zona Remota", mode: "comune" },
    quantity: { current: 5000 },
    metrics: {},
  };
  const context = buildQuoteAssistantStep2Context(snapshot, { cityName: "Zona Remota", qty: 5000 }, { territorialDataUnavailable: true });
  assert.equal(context.territorialDataUnavailable, true);
  assert.equal(context.quoteState, "non_disponibile");

  const questions = generateStep2QuickQuestions(context);
  assert.ok(questions.some((q) => q.includes("Dato non disponibile")));

  const aUnav = generateClientStep2Answer("Perché vedo \"Dato non disponibile\"?", context);
  assert.match(aUnav, /Dato non disponibile/);
  assert.match(aUnav, /ISTAT|poligoni|caricamento|fallback/i);

  const aCov = generateClientStep2Answer("Quanto copro con questa quantità?", context);
  assert.match(aCov, /non è attualmente disponibile/);

  const aFam = generateClientStep2Answer("Quante famiglie ci sono?", context);
  assert.match(aFam, /non è attualmente disponibile/);
});

test("CASO F — CTA Step 3 disabilitata con motivo", () => {
  const snapshot = {
    state: "partial",
    service: { key: "d2d", title: "Door to Door" },
    territory: { label: "Monza", mode: "comune" },
    quantity: { current: 5000 },
  };
  const context = buildQuoteAssistantStep2Context(snapshot, { cityName: "Monza" }, {
    ctaStep3Enabled: false,
    reasonCtaDisabled: "Seleziona almeno un quartiere per continuare",
  });
  assert.equal(context.ctaStep3Enabled, false);
  assert.equal(context.reasonCtaDisabled, "Seleziona almeno un quartiere per continuare");

  const questions = generateStep2QuickQuestions(context);
  assert.ok(questions.some((q) => q.includes("non posso continuare allo Step 3")));

  const aCta = generateClientStep2Answer("Perché non posso continuare allo Step 3?", context);
  assert.match(aCta, /Seleziona almeno un quartiere per continuare/);
});

test("Report Territoriale Avanzato spiega densità e ottimizzazione", () => {
  const context = buildQuoteAssistantStep2Context({}, { cityName: "Monza" });
  const a = generateClientStep2Answer("Cosa mostra il Report Territoriale Avanzato?", context);
  assert.match(a, /Report Territoriale Avanzato/);
  assert.match(a, /famiglie|densità/);
});

test("Step1 espone solo località, quantità, tipo richiesta e stato, senza segreti o PII", () => {
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

test("UI mostra card di riassunto contesto, fallback e contatti, senza mutazioni preventivo", () => {
  const panel = fs.readFileSync("src/components/ai/quote/QuoteAssistantPanel.jsx", "utf8");
  assert.match(panel, /Dati che sto leggendo/);
  assert.match(panel, /quote-ai__context-card/);
  assert.match(panel, /Assistente momentaneamente non disponibile\./);
  assert.match(panel, /\+39 351 767 3737/);
  assert.match(panel, /info@volantinipro\.it/);
  assert.match(panel, /HUMAN_REQUEST/);
  assert.doesNotMatch(panel, /setData|setStep|onNext|onBack/);
});

test("backend ai-core supporta i campi Step2, rifiuta segreti e risponde in modo grounded", () => {
  const source = fs.readFileSync("supabase/functions/ai-core/index.ts", "utf8");
  const config = fs.readFileSync("supabase/config.toml", "utf8");
  assert.match(source, /QUOTE_CONTEXT_TYPES = new Set\(\["step1", "step2", "step3", "step4"\]\)/);
  assert.match(source, /SENSITIVE_CONTEXT_REJECTED/);
  assert.match(source, /OPENAI_UNGROUNDED_NUMBER/);
  assert.match(source, /deterministicQuoteResponse/);
  assert.match(source, /contextType === "step1" && \/come funziona\//);
  assert.match(source, /contextType === "step2"/);
  assert.match(source, /QUOTE_EXTRA_KEYS[\s\S]*quantitaInserita[\s\S]*coveragePct/);
  assert.match(config, /\[functions\.ai-core\][\s\S]*verify_jwt = false/);
});

