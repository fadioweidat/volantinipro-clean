// Modalità pagamento "manual_contact": dopo la conferma della campagna il
// cliente vede la ricevuta + i CTA di contatto espliciti per richiedere le
// istruzioni di pagamento (WhatsApp prioritario, Email alternativa, Dashboard).
// Nessuna coordinata bancaria automatica, nessuno stato pagamento tecnico mutato,
// stato pagamento reale invariato. Il vecchio flusso bonifico resta nel codice, gated.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  PAYMENT_MODE,
  IS_MANUAL_CONTACT,
  CAMPAIGN_CONTACT_EMAIL_SUBJECT,
  buildCampaignContactWhatsAppText,
  buildCampaignContactEmailSubject,
  buildCampaignContactEmailBody,
  buildCampaignContactWhatsAppUrl,
  buildCampaignContactMailtoUrl,
} from "../src/lib/paymentMode.js";
import { SUPPORT_EMAIL, HAS_SUPPORT_WHATSAPP } from "../src/lib/contactConfig.js";

const ROUTED_SRC = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");
const LEGACY_SRC = readFileSync(new URL("../src/pages/PagamentoBonifico.jsx", import.meta.url), "utf8");
const DASHBOARD_SRC = readFileSync(new URL("../src/pages/Dashboard.jsx", import.meta.url), "utf8");

// ── 1. config centralizzata ─────────────────────────────────────────────────
test("PAYMENT_MODE default = manual_contact", () => {
  if (!process.env.VITE_PAYMENT_MODE) {
    assert.equal(PAYMENT_MODE, "manual_contact");
    assert.equal(IS_MANUAL_CONTACT, true);
  } else {
    assert.equal(typeof PAYMENT_MODE, "string");
  }
});

// ── 2. testo WhatsApp precompilato (Ticket sez. 4) ─────────────────────────
test("WhatsApp text: frase esatta del ticket con e senza ID campagna", () => {
  const expectedWithId =
    "Buongiorno, ho confermato la mia campagna VolantiniPro.\nID campagna: CAMP-888\nVorrei ricevere le istruzioni per completare il pagamento tramite bonifico. Grazie.";
  const expectedWithoutId =
    "Buongiorno, ho confermato la mia campagna VolantiniPro.\nVorrei ricevere le istruzioni per completare il pagamento tramite bonifico. Grazie.";

  assert.equal(buildCampaignContactWhatsAppText("CAMP-888"), expectedWithId);
  assert.equal(buildCampaignContactWhatsAppText(null), expectedWithoutId);
  assert.equal(buildCampaignContactWhatsAppText(""), expectedWithoutId);
  assert.equal(buildCampaignContactWhatsAppText(undefined), expectedWithoutId);

  // Nessun undefined/null testuale
  assert.ok(!buildCampaignContactWhatsAppText("CAMP-888").includes("undefined"));
  assert.ok(!buildCampaignContactWhatsAppText("CAMP-888").includes("null"));
  assert.ok(!buildCampaignContactWhatsAppText(null).includes("undefined"));
  assert.ok(!buildCampaignContactWhatsAppText(null).includes("null"));
});

// ── 3. oggetto email precompilato (Ticket sez. 5) ──────────────────────────
test("Email subject: formato esatto del ticket con e senza ID campagna", () => {
  assert.equal(
    buildCampaignContactEmailSubject("CAMP-888"),
    "VolantiniPro — Richiesta istruzioni pagamento — CAMP-888",
  );
  assert.equal(
    buildCampaignContactEmailSubject(null),
    "VolantiniPro — Richiesta istruzioni pagamento",
  );
  assert.equal(
    buildCampaignContactEmailSubject(""),
    "VolantiniPro — Richiesta istruzioni pagamento",
  );
  assert.equal(
    CAMPAIGN_CONTACT_EMAIL_SUBJECT,
    "VolantiniPro — Richiesta istruzioni pagamento",
  );
});

// ── 4. corpo email precompilato (Ticket sez. 5) ────────────────────────────
test("Email body: righe esatte del ticket con e senza ID campagna", () => {
  const expectedWithId = [
    "Buongiorno,",
    "",
    "ho confermato la mia campagna VolantiniPro.",
    "",
    "ID campagna: CAMP-888",
    "",
    "Vorrei ricevere le istruzioni per completare il pagamento tramite bonifico.",
    "",
    "Grazie.",
  ].join("\n");

  const expectedWithoutId = [
    "Buongiorno,",
    "",
    "ho confermato la mia campagna VolantiniPro.",
    "",
    "Vorrei ricevere le istruzioni per completare il pagamento tramite bonifico.",
    "",
    "Grazie.",
  ].join("\n");

  assert.equal(buildCampaignContactEmailBody("CAMP-888"), expectedWithId);
  assert.equal(buildCampaignContactEmailBody(null), expectedWithoutId);
  assert.equal(buildCampaignContactEmailBody(""), expectedWithoutId);
  assert.equal(buildCampaignContactEmailBody(undefined), expectedWithoutId);

  // Nessun undefined/null testuale
  assert.ok(!buildCampaignContactEmailBody("CAMP-888").includes("undefined"));
  assert.ok(!buildCampaignContactEmailBody("CAMP-888").includes("null"));
});

// ── 5. URL WhatsApp ed Email (Ticket sez. 4, 5, 11) ─────────────────────────
test("mailto URL: email ufficiale configurata + subject e body encodati e sicuri", () => {
  const url = buildCampaignContactMailtoUrl("CAMP-888");
  assert.ok(url.startsWith(`mailto:${SUPPORT_EMAIL}?`));
  const qs = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  assert.equal(qs.get("subject"), "VolantiniPro — Richiesta istruzioni pagamento — CAMP-888");
  assert.equal(qs.get("body"), buildCampaignContactEmailBody("CAMP-888"));
  assert.ok(!url.includes("undefined"));
  assert.ok(!url.includes("null"));
});

test("WhatsApp URL: null se non configurato, altrimenti wa.me con testo encodato esatto", () => {
  const url = buildCampaignContactWhatsAppUrl("CAMP-888");
  if (!HAS_SUPPORT_WHATSAPP) {
    assert.equal(url, null, "senza VITE_SUPPORT_WHATSAPP il CTA WhatsApp non deve inventare un numero");
  } else {
    assert.ok(url.startsWith("https://wa.me/"));
    assert.ok(url.includes(encodeURIComponent("ID campagna: CAMP-888")));
    assert.ok(!url.includes("undefined"));
    assert.ok(!url.includes("null"));
  }
});

// ── 6. contratto sorgente: Pagina Conferma (Ticket sez. 2, 3, 4, 5, 7, 10) ──
test("pagina conferma (volantinipro-final.jsx): copy esatto, 3 bottoni e ID campagna", () => {
  assert.match(ROUTED_SRC, /IS_MANUAL_CONTACT/);
  assert.match(ROUTED_SRC, /Campagna confermata/);
  assert.match(ROUTED_SRC, /Abbiamo ricevuto correttamente la tua richiesta\./);
  assert.match(ROUTED_SRC, /Per completare l'ordine, richiedi le istruzioni di pagamento tramite WhatsApp o Email\./);
  assert.match(ROUTED_SRC, /Pagamento non ancora completato/);
  assert.match(ROUTED_SRC, /Richiedi pagamento su WhatsApp/);
  assert.match(ROUTED_SRC, /Richiedi pagamento via Email/);
  assert.match(ROUTED_SRC, /Vai alla Dashboard/);
  assert.match(ROUTED_SRC, /ID campagna: \{contactId\}/);
  // Stili mobile-friendly (full-width)
  assert.match(ROUTED_SRC, /boxSizing:\s*['"]border-box['"]/);
});

test("pagina conferma (PagamentoBonifico.jsx): allineata con copy esatto e bottoni", () => {
  assert.match(LEGACY_SRC, /IS_MANUAL_CONTACT/);
  assert.match(LEGACY_SRC, /Campagna confermata/);
  assert.match(LEGACY_SRC, /Abbiamo ricevuto correttamente la tua richiesta\./);
  assert.match(LEGACY_SRC, /Per completare l'ordine, richiedi le istruzioni di pagamento tramite WhatsApp o Email\./);
  assert.match(LEGACY_SRC, /Pagamento non ancora completato/);
  assert.match(LEGACY_SRC, /Richiedi pagamento su WhatsApp/);
  assert.match(LEGACY_SRC, /Richiedi pagamento via Email/);
  assert.match(LEGACY_SRC, /Vai alla Dashboard/);
});

// ── 7. sicurezza stato pagamento e nessun auto-send (Ticket sez. 1, 8, 9) ───
test("pagina conferma: nessun auto-send, nessuna scrittura di stato pagamento, niente fake paid", () => {
  const start = ROUTED_SRC.indexOf("if (IS_MANUAL_CONTACT) {");
  const end = ROUTED_SRC.indexOf("Completa il pagamento per avviare la distribuzione.", start);
  assert.ok(start > 0 && end > start, "blocco manual_contact non individuato in volantinipro-final.jsx");
  const block = ROUTED_SRC.slice(start, end);

  for (const forbidden of [
    "pagamento completato",
    "campagna pagata",
    "distribuzione avviata",
    "IBAN",
    "causale",
    "Istruzioni bonifico",
    "pagamento ricevuto",
  ]) {
    assert.ok(!block.toLowerCase().includes(forbidden.toLowerCase()), `il blocco manual_contact non deve contenere "${forbidden}"`);
  }

  // Nessuna scrittura o mutazione DB sullo stato pagamento
  assert.ok(!/\.update\(|\.upsert\(|stato_pagamento\s*=/.test(block), "il ramo manual_contact non deve mutare lo stato pagamento");
});

// ── 8. copy Dashboard cliente (Ticket sez. 6) ──────────────────────────────
test("Dashboard cliente: stato display neutrale 'Pagamento da completare' quando non pagato", () => {
  // In volantinipro-final.jsx (CampaignDashboardPage)
  assert.match(
    ROUTED_SRC,
    /campagna\.stato_pagamento === ['"]pagato['"] \? ['"]Pagamento ricevuto['"] : ['"]Pagamento da completare['"]/,
  );
  // Non deve più contenere l'ingannevole "In attesa del tuo bonifico" se non sono state inviate istruzioni
  assert.doesNotMatch(ROUTED_SRC, /In attesa del tuo bonifico/);

  // In Dashboard.jsx
  assert.match(DASHBOARD_SRC, /Pagamento da completare/);
  assert.doesNotMatch(DASHBOARD_SRC, /In attesa bonifico/);
});

// ── 9. vecchio flusso bonifico preservato (gated, non rimosso) ──────────────
test("vecchio flusso bonifico preservato (gated, non rimosso)", () => {
  assert.match(ROUTED_SRC, /BANK_TRANSFER_UNAVAILABLE_MESSAGE/);
  assert.match(ROUTED_SRC, /getBankTransferDetails\(\)/);
  assert.match(ROUTED_SRC, /paymentStatus === "pagato"/);
  assert.match(ROUTED_SRC, /Istruzioni bonifico/);
  assert.match(ROUTED_SRC, /Copia IBAN/);
});
