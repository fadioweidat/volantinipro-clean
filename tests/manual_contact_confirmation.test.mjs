// Modalità pagamento "manual_contact": dopo la conferma della campagna il
// cliente vede la ricevuta + i CTA di contatto (WhatsApp prioritario, Email,
// Dashboard). Nessuna coordinata bancaria, nessuno stato pagamento tecnico,
// stato pagamento reale invariato. Il vecchio flusso bonifico resta nel
// codice, gated.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  PAYMENT_MODE,
  IS_MANUAL_CONTACT,
  CAMPAIGN_CONTACT_EMAIL_SUBJECT,
  buildCampaignContactWhatsAppText,
  buildCampaignContactEmailBody,
  buildCampaignContactWhatsAppUrl,
  buildCampaignContactMailtoUrl,
} from "../src/lib/paymentMode.js";
import { HAS_SUPPORT_WHATSAPP } from "../src/lib/contactConfig.js";

const ROUTED_SRC = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");

// ── config centralizzata ─────────────────────────────────────────────────
test("PAYMENT_MODE default = manual_contact", () => {
  if (!process.env.VITE_PAYMENT_MODE) {
    assert.equal(PAYMENT_MODE, "manual_contact");
    assert.equal(IS_MANUAL_CONTACT, true);
  } else {
    assert.equal(typeof PAYMENT_MODE, "string");
  }
});

// ── testo WhatsApp precompilato ──────────────────────────────────────────
test("WhatsApp text: frase esatta del ticket + ID campagna quando disponibile", () => {
  const base =
    "Buongiorno, ho appena confermato una campagna VolantiniPro. Vorrei ricevere le informazioni per completare la conferma e il pagamento.";
  assert.equal(buildCampaignContactWhatsAppText(null), base);
  assert.equal(buildCampaignContactWhatsAppText(""), base);
  assert.equal(buildCampaignContactWhatsAppText("AB123"), `${base}\n\nID campagna: AB123`);
});

// ── corpo email precompilato ─────────────────────────────────────────────
test("Email body: righe esatte del ticket + ID campagna quando disponibile", () => {
  const noId = buildCampaignContactEmailBody(null);
  assert.equal(
    noId,
    ["Buongiorno,", "ho appena confermato una campagna VolantiniPro.", "Vorrei ricevere le informazioni per completare la conferma e il pagamento."].join("\n"),
  );
  const withId = buildCampaignContactEmailBody("XYZ-9");
  assert.ok(withId.endsWith("\n\nID campagna: XYZ-9"));
});

test("Email subject = quello richiesto dal ticket", () => {
  assert.equal(CAMPAIGN_CONTACT_EMAIL_SUBJECT, "Campagna VolantiniPro - richiesta informazioni");
});

// ── URL ─────────────────────────────────────────────────────────────────
test("mailto URL: email ufficiale + subject/body encodati e ricostruibili", () => {
  const url = buildCampaignContactMailtoUrl("C-1");
  assert.ok(url.startsWith("mailto:info@volantinipro.it?"));
  const qs = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  assert.equal(qs.get("subject"), "Campagna VolantiniPro - richiesta informazioni");
  assert.equal(qs.get("body"), buildCampaignContactEmailBody("C-1"));
});

test("WhatsApp URL: null se il numero non è configurato, altrimenti wa.me con testo encodato", () => {
  const url = buildCampaignContactWhatsAppUrl("C-1");
  if (!HAS_SUPPORT_WHATSAPP) {
    assert.equal(url, null, "senza VITE_SUPPORT_WHATSAPP il CTA non deve inventare un numero");
  } else {
    assert.ok(url.startsWith("https://wa.me/"));
    assert.ok(url.includes(encodeURIComponent("ID campagna: C-1")));
  }
});

// ── contratto sorgente: pagina conferma in volantinipro-final.jsx ────────
test("pagina conferma: ricevuta + contatto ASAP + 3 CTA presenti", () => {
  assert.match(ROUTED_SRC, /IS_MANUAL_CONTACT/);
  assert.match(ROUTED_SRC, /Abbiamo ricevuto correttamente la tua richiesta\./);
  assert.match(ROUTED_SRC, /Ti contatteremo al più presto/);
  assert.match(ROUTED_SRC, /Contattaci su WhatsApp/);
  assert.match(ROUTED_SRC, /Contattaci via Email/);
  assert.match(ROUTED_SRC, /Vai alla Dashboard/);
  assert.match(ROUTED_SRC, /ID campagna: /);
});

test("pagina conferma manual_contact: niente stati falsi, niente pagamento completato", () => {
  const start = ROUTED_SRC.indexOf("if (IS_MANUAL_CONTACT) {");
  // Il blocco manual_contact termina dove ricomincia il vecchio ramo bonifico
  // (stringa unica del blocco legacy).
  const end = ROUTED_SRC.indexOf("Completa il pagamento per avviare la distribuzione.", start);
  assert.ok(start > 0 && end > start, "blocco manual_contact non individuato");
  const block = ROUTED_SRC.slice(start, end);
  for (const forbidden of ["pagamento completato", "campagna pagata", "distribuzione avviata", "IBAN", "causale", "Istruzioni bonifico"]) {
    assert.ok(!block.includes(forbidden), `il blocco manual_contact non deve contenere "${forbidden}"`);
  }
  // Nessuna scrittura sullo stato pagamento nel nuovo ramo.
  assert.ok(!/\.update\(|\.upsert\(|stato_pagamento\s*=/.test(block), "il ramo manual_contact non deve mutare lo stato pagamento");
});

test("vecchio flusso bonifico preservato (gated, non rimosso)", () => {
  assert.match(ROUTED_SRC, /BANK_TRANSFER_UNAVAILABLE_MESSAGE/);
  assert.match(ROUTED_SRC, /getBankTransferDetails\(\)/);
  assert.match(ROUTED_SRC, /paymentStatus === "pagato"/);
  assert.match(ROUTED_SRC, /Istruzioni bonifico/);
  assert.match(ROUTED_SRC, /Copia IBAN/);
});
