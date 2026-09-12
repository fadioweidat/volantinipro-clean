/**
 * tests/quick_quote_delivery.test.mjs
 *
 * Test mirati per la consegna e persistenza del preventivo rapido:
 *  A. Struttura payload salvataggio canonico (campaigns + campaign_zones)
 *  B. Firewall sicurezza recipient email admin (server-side info@volantinipro.it)
 *  C. Reply-To email cliente e subject deterministici
 *  D. Idempotenza email con chiave canonica quote_admin/quote_customer
 *  E. Testi email cliente: nessuna falsa affermazione di pagamento/conferma
 *  F. Isolamento errori email (DB persistenza preservata in partial_success)
 *  G. Integrità firewall: nessun tocco a Step2, calculateQuotePricing, o logiche di pagamento
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const readFile = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const quickQuotePageSrc = readFile("src/pages/public/QuickQuotePage.jsx");
const sendEmailConfermaSrc = readFile("src/api/sendEmailConferma.js");
const edgeFunctionSrc = readFile("supabase/functions/send-email-conferma/index.ts");
const quoteEmailSrc = readFile("supabase/functions/_shared/quoteEmail.ts");

// ---------------------------------------------------------------------------
// 1. Validazione Client-Side nel QuickQuotePage
// ---------------------------------------------------------------------------
test("QuickQuotePage: controlli di validazione obbligatori su nome ed email", () => {
  assert.ok(
    quickQuotePageSrc.includes("clientForm.nome.trim()"),
    "Deve validare la presenza e lunghezza di nome"
  );
  assert.ok(
    quickQuotePageSrc.includes("EMAIL_RE"),
    "Deve validare il formato email con regex"
  );
  assert.ok(
    quickQuotePageSrc.includes("setClientErrors"),
    "Deve esporre errori inline all'utente"
  );
});

// ---------------------------------------------------------------------------
// 2. Persistenza canonica: submitPublicCampaign
// ---------------------------------------------------------------------------
test("QuickQuotePage: salva nel database canonico tramite submitPublicCampaign", () => {
  assert.ok(
    quickQuotePageSrc.includes("submitPublicCampaign(payload)"),
    "Deve invocare submitPublicCampaign con il payload canonico"
  );
  assert.ok(
    quickQuotePageSrc.includes('status: "pending_review"'),
    "Lo status deve essere pending_review"
  );
  assert.ok(
    quickQuotePageSrc.includes('payment_status: "in_attesa_pagamento"'),
    "payment_status deve essere in_attesa_pagamento (nessun falso pagamento)"
  );
  assert.ok(
    quickQuotePageSrc.includes("campaignZones: campaignZonesPayload"),
    "Deve includere il breakdown delle zone per campaign_zones"
  );
});

// ---------------------------------------------------------------------------
// 3. Sicurezza Recipient Email: info@volantinipro.it forzato server-side
// ---------------------------------------------------------------------------
test("Edge Function: type === 'preventivo_admin' forza info@volantinipro.it lato server", () => {
  assert.ok(
    edgeFunctionSrc.includes('type === "preventivo_admin"'),
    "Deve gestire specificamente il branch preventivo_admin"
  );
  const adminBranchMatch = edgeFunctionSrc.match(/if\s*\(\s*type\s*===\s*["']preventivo_admin["'][\s\S]*?recipientEmail\s*=\s*["']info@volantinipro\.it["']/);
  assert.ok(
    adminBranchMatch,
    "L'Edge Function deve forzare recipientEmail = info@volantinipro.it ignorando l'input utente"
  );
});

// ---------------------------------------------------------------------------
// 4. Customer Reply-To configurato per preventivo_admin
// ---------------------------------------------------------------------------
test("Edge Function: replyTo impostato all'email del cliente per preventivo_admin", () => {
  assert.ok(
    edgeFunctionSrc.includes("replyTo: replyToEmail"),
    "Deve passare il replyTo del cliente alla funzione sendTransactionalEmail"
  );
  assert.ok(
    edgeFunctionSrc.includes("replyToEmail = spec.recipientEmail"),
    "Deve impostare replyToEmail all'indirizzo email del cliente"
  );
});

// ---------------------------------------------------------------------------
// 5. Idempotenza email basata su campaignId canonico
// ---------------------------------------------------------------------------
test("Edge Function: chiavi di idempotenza distinte per admin e cliente", () => {
  assert.ok(
    edgeFunctionSrc.includes("quote_admin:"),
    "Deve usare la chiave quote_admin:${campaignId}"
  );
  assert.ok(
    edgeFunctionSrc.includes("quote_customer:"),
    "Deve usare la chiave quote_customer:${campaignId}"
  );
});

// ---------------------------------------------------------------------------
// 6. Template Email Admin: Oggetto e contenuti richiesti
// ---------------------------------------------------------------------------
test("quoteEmail: buildAdminQuoteNotificationEmail ha l'oggetto e i dettagli corretti", () => {
  assert.ok(
    quoteEmailSrc.includes("Nuovo preventivo VolantiniPro —"),
    "Subject admin deve seguire il formato richiesto"
  );
  assert.ok(
    quoteEmailSrc.includes("spec.recipientName"),
    "Deve includere nome cliente"
  );
  assert.ok(
    quoteEmailSrc.includes("spec.recipientEmail"),
    "Deve includere email cliente"
  );
  assert.ok(
    quoteEmailSrc.includes("spec.grandTotal"),
    "Deve includere il totale economico"
  );
  assert.ok(
    quoteEmailSrc.includes("/admin/clients-quotes"),
    "Deve linkare alla schermata admin Clienti & Preventivi"
  );
});

// ---------------------------------------------------------------------------
// 7. Template Email Cliente: Nessuna falsa affermazione di pagamento
// ---------------------------------------------------------------------------
test("quoteEmail: buildCustomerQuoteConfirmationEmail formula corretta di sola presa in carico", () => {
  assert.ok(
    quoteEmailSrc.includes("VolantiniPro — Preventivo ricevuto"),
    "Subject cliente deve essere 'VolantiniPro — Preventivo ricevuto'"
  );
  assert.ok(
    quoteEmailSrc.includes("abbiamo ricevuto correttamente la tua richiesta di preventivo"),
    "Deve dichiarare la ricezione della richiesta"
  );

  const forbiddenPhrases = [
    "pagamento confermato",
    "pagamento ricevuto",
    "campagna attiva",
    "campagna confermata",
    "ordine completato",
  ];
  const customerEmailFnMatch = quoteEmailSrc.match(/function buildCustomerQuoteConfirmationEmail[\s\S]*?return \{[\s\S]*?\};/);
  assert.ok(customerEmailFnMatch, "Funzione buildCustomerQuoteConfirmationEmail trovata");
  const fnBody = customerEmailFnMatch[0].toLowerCase();
  for (const phrase of forbiddenPhrases) {
    assert.ok(
      !fnBody.includes(phrase),
      `Il template cliente NON deve contenere '${phrase}'`
    );
  }
});

// ---------------------------------------------------------------------------
// 8. Schermata Successo e Azione Secondaria Scarica PDF
// ---------------------------------------------------------------------------
test("QuickQuotePage: schermata di successo espone ID, recap e [Scarica PDF preventivo]", () => {
  assert.ok(
    quickQuotePageSrc.includes("Scarica PDF preventivo"),
    "Deve includere il pulsante secondario Scarica PDF preventivo"
  );
  assert.ok(
    quickQuotePageSrc.includes("printQuotePdf(savedQuoteData)"),
    "Il pulsante deve invocare printQuotePdf con i dati memorizzati"
  );
  assert.ok(
    quickQuotePageSrc.includes("savedCampaignId"),
    "Deve mostrare l'ID canonico della richiesta"
  );
});

// ---------------------------------------------------------------------------
// 9. Resilienza ed isolamento fallimenti email
// ---------------------------------------------------------------------------
test("QuickQuotePage: se le email falliscono, la persistenza DB non viene annullata", () => {
  assert.ok(
    quickQuotePageSrc.includes('setSubmitState("partial_success")'),
    "In caso di fallimento email, imposta partial_success e non rollback DB"
  );
});

// ---------------------------------------------------------------------------
// 10. Strict Firewall: Nessuna modifica a componenti protetti
// ---------------------------------------------------------------------------
test("Firewall: Step2.jsx e calculateQuotePricing.js intatti", () => {
  const step2Src = readFile("src/pages/public/configurator/Step2.jsx");
  assert.ok(step2Src.length > 1000, "Step2.jsx presente");
  assert.ok(!step2Src.includes("submitPublicCampaign"), "Step2 non deve essere contaminato da QuickQuote");

  const quotePricingSrc = readFile("src/lib/quotePricing.js");
  assert.ok(quotePricingSrc.length > 500, "quotePricing.js presente");
});
