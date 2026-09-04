// TICKET — EMAIL PREVENTIVO REALE END-TO-END: "Invia preventivo via email".
// Stesso stile degli altri test email di questo repo (tests/graphic_request_
// email.test.mjs): funzioni pure importate direttamente, file Deno con
// import "npm:"/URL (index.ts, sendTransactionalEmail.ts) letti come
// sorgente e verificati con regex — non possono essere importati sotto
// node:test.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  QUOTE_EMAIL_SUBJECT,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DIGITS,
  buildQuoteEmail,
  sanitizeQuoteEmailSpec,
} from "../supabase/functions/_shared/quoteEmail.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// ── sanitizeQuoteEmailSpec ───────────────────────────────────────────────
test("sanitizeQuoteEmailSpec: email valida + grandTotal reale vengono accettati as-is (nessun ricalcolo)", () => {
  const spec = sanitizeQuoteEmailSpec({
    recipientEmail: "Cliente@Example.com",
    recipientName: "Mario Rossi",
    preventivo: { location: "Milano", quantity: 5000, service: "Door to Door", grandTotal: 1234.56, quoteId: "abc-123" },
  }, "https://www.volantinipro.it");
  assert.equal(spec.recipientEmail, "cliente@example.com");
  assert.equal(spec.grandTotal, 1234.56);
  assert.equal(spec.location, "Milano");
  assert.equal(spec.quantity, 5000);
  assert.equal(spec.quoteId, "abc-123");
});

test("sanitizeQuoteEmailSpec: email invalida -> null (email rifiutata a monte, nessun invio)", () => {
  assert.equal(sanitizeQuoteEmailSpec({ recipientEmail: "non-una-email", preventivo: { grandTotal: 100 } }, "https://x.it"), null);
  assert.equal(sanitizeQuoteEmailSpec({ recipientEmail: "", preventivo: { grandTotal: 100 } }, "https://x.it"), null);
});

test("sanitizeQuoteEmailSpec: grandTotal mancante o negativo -> null", () => {
  assert.equal(sanitizeQuoteEmailSpec({ recipientEmail: "a@b.it", preventivo: {} }, "https://x.it"), null);
  assert.equal(sanitizeQuoteEmailSpec({ recipientEmail: "a@b.it", preventivo: { grandTotal: -5 } }, "https://x.it"), null);
});

test("sanitizeQuoteEmailSpec: stampa/grafica presenti solo se il client li ha valorizzati", () => {
  const withPrinting = sanitizeQuoteEmailSpec({ recipientEmail: "a@b.it", preventivo: { grandTotal: 500, printingLabel: "Stampa indicativa", printingAmount: 80 } }, "https://x.it");
  assert.equal(withPrinting.printingLabel, "Stampa indicativa");
  assert.equal(withPrinting.printingAmount, 80);
  const withoutPrinting = sanitizeQuoteEmailSpec({ recipientEmail: "a@b.it", preventivo: { grandTotal: 500 } }, "https://x.it");
  assert.equal(withoutPrinting.printingLabel, undefined);
});

test("sanitizeQuoteEmailSpec: extra presenti/assenti, whitelist ignora campi non previsti (to/secret/token)", () => {
  const withExtras = sanitizeQuoteEmailSpec({
    recipientEmail: "a@b.it",
    to: "attacker@evil.com",
    secret: "sk-should-be-ignored",
    preventivo: { grandTotal: 500, extras: [{ label: "Analisi AI", amount: 30 }, { label: "Priorità", amount: 15 }] },
  }, "https://x.it");
  assert.equal(withExtras.extras.length, 2);
  assert.equal(withExtras.extras[0].label, "Analisi AI");
  assert.ok(!("to" in withExtras));
  assert.ok(!("secret" in withExtras));
  const withoutExtras = sanitizeQuoteEmailSpec({ recipientEmail: "a@b.it", preventivo: { grandTotal: 500 } }, "https://x.it");
  assert.deepEqual(withoutExtras.extras, []);
});

// ── buildQuoteEmail ───────────────────────────────────────────────────────
test("buildQuoteEmail: subject esatto richiesto dal ticket, grandTotal reale nel corpo", () => {
  const spec = sanitizeQuoteEmailSpec({ recipientEmail: "a@b.it", preventivo: { grandTotal: 999.9, location: "Torino" } }, "https://www.volantinipro.it");
  const { subject, html, text } = buildQuoteEmail(spec);
  assert.equal(subject, "Il tuo preventivo VolantiniPro");
  assert.match(html, /999,90/);
  assert.match(text, /999,90/);
  assert.match(html, /Torino/);
});

test("buildQuoteEmail: contatti VolantiniPro esatti (WhatsApp + email) presenti nel corpo", () => {
  const spec = sanitizeQuoteEmailSpec({ recipientEmail: "a@b.it", preventivo: { grandTotal: 100 } }, "https://www.volantinipro.it");
  const { html } = buildQuoteEmail(spec);
  assert.equal(SUPPORT_WHATSAPP_DIGITS, "393517673737");
  assert.equal(SUPPORT_EMAIL, "info@volantinipro.it");
  assert.match(html, /wa\.me\/393517673737/);
  assert.match(html, /mailto:info@volantinipro\.it/);
  assert.match(html, /\+39 351 767 3737/);
});

test("buildQuoteEmail: input malevolo (XSS) viene HTML-escapato", () => {
  const spec = sanitizeQuoteEmailSpec({
    recipientEmail: "a@b.it",
    recipientName: "<script>alert(1)</script>",
    preventivo: { grandTotal: 100 },
  }, "https://www.volantinipro.it");
  const { html } = buildQuoteEmail(spec);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("buildQuoteEmail: link al configuratore usa SITE_URL passato, nessun link/storage inventato", () => {
  const spec = sanitizeQuoteEmailSpec({ recipientEmail: "a@b.it", preventivo: { grandTotal: 100 } }, "https://www.volantinipro.it");
  const { html } = buildQuoteEmail(spec);
  assert.match(html, /href="https:\/\/www\.volantinipro\.it"/);
  assert.doesNotMatch(html, /supabase\.co\/storage/);
});

// ── send-email-conferma/index.ts (sorgente — Deno-only, non importabile) ──
test("send-email-conferma: CORS/OPTIONS/solo POST, rate limit e idempotenza presenti", () => {
  const src = read("supabase/functions/send-email-conferma/index.ts");
  assert.match(src, /req\.method === "OPTIONS"/);
  assert.match(src, /req\.method !== "POST"/);
  assert.match(src, /RATE_LIMITED/);
  assert.match(src, /rateBuckets/);
  assert.match(src, /alreadySentRecently/);
  assert.match(src, /deduped:\s*true/);
});

test("send-email-conferma: RESEND_API_KEY letta SOLO tramite _shared, mai qui direttamente", () => {
  const src = read("supabase/functions/send-email-conferma/index.ts");
  assert.doesNotMatch(src, /Deno\.env\.get\(["']RESEND_API_KEY["']\)/);
  assert.match(src, /from "\.\.\/_shared\/sendTransactionalEmail\.ts"/);
});

test("send-email-conferma: EMAIL_NOT_CONFIGURED propaga 503, nessun invio senza configurazione", () => {
  const src = read("supabase/functions/send-email-conferma/index.ts");
  assert.match(src, /EMAIL_NOT_CONFIGURED.*503/s);
});

test("send-email-conferma: type preventivo non ricalcola prezzi (nessun import del motore di pricing)", () => {
  const src = read("supabase/functions/send-email-conferma/index.ts");
  const quoteEmailSrc = read("supabase/functions/_shared/quoteEmail.ts");
  assert.doesNotMatch(src, /quotePricing|printPricing|graphicPricing|territorialCampaignCalculator/);
  assert.doesNotMatch(quoteEmailSrc, /quotePricing|printPricing|graphicPricing|territorialCampaignCalculator/);
  assert.match(quoteEmailSrc, /NESSUN calcolo di prezzo/);
});

test("send-email-conferma: nessun log di email/PII (solo type/esito/status)", () => {
  const src = read("supabase/functions/send-email-conferma/index.ts");
  assert.doesNotMatch(src, /console\.\w+\([^)]*(cliente|recipientEmail|campagna)\b/);
});

test("send-email-conferma: contenuto conferma/pagamento_ricevuto invariato (stesso IBAN/intestatario)", () => {
  const src = read("supabase/functions/send-email-conferma/index.ts");
  assert.match(src, /IT60 X0542 8111 0100 0001 2345 6/);
  assert.match(src, /VolantiniPro Srl/);
  assert.match(src, /pagamento_ricevuto/);
});

// ── Frontend: src/api/sendEmailConferma.js ─────────────────────────────────
test("sendQuoteByEmail: non lancia mai, ritorna sempre {ok, code?}", () => {
  const src = read("src/api/sendEmailConferma.js");
  assert.match(src, /export async function sendQuoteByEmail/);
  assert.match(src, /type:\s*"preventivo"/);
  assert.doesNotMatch(src, /RESEND/);
});

// ── Frontend: Step4SendQuoteEmail.jsx ──────────────────────────────────────
test("Step4SendQuoteEmail: disabilita il pulsante durante l'invio (niente doppio invio da doppio click)", () => {
  const src = read("src/pages/public/configurator/step4/Step4SendQuoteEmail.jsx");
  assert.match(src, /disabled=\{status === "sending"\}/);
  assert.match(src, /if \(status === "sending"\) return;/);
});

test("Step4SendQuoteEmail: se l'email manca chiede solo l'email (nessun altro campo obbligatorio)", () => {
  const src = read("src/pages/public/configurator/step4/Step4SendQuoteEmail.jsx");
  assert.match(src, /setStatus\("asking"\)/);
  assert.match(src, /type="email"/);
  assert.doesNotMatch(src, /type="tel"|type="text"/);
});

test("Step4SendQuoteEmail: non blocca il download PDF, e il fallback riusa i contatti ufficiali (non hardcoded)", () => {
  const src = read("src/pages/public/configurator/step4/Step4SendQuoteEmail.jsx");
  assert.match(src, /Non siamo riusciti a inviare l'email\. Puoi comunque scaricare il PDF oppure contattarci\./);
  assert.match(src, /handleDownloadPdf/);
  assert.match(src, /buildInfoWhatsAppUrl/);
  assert.match(src, /buildInfoMailtoUrl/);
  assert.doesNotMatch(src, /wa\.me\/\d/);
  assert.doesNotMatch(src, /mailto:[a-z]/i);
});

test("Step4SendQuoteEmail: nessun secret/token/service-role nel payload costruito lato client", () => {
  const src = read("src/pages/public/configurator/step4/Step4SendQuoteEmail.jsx");
  assert.doesNotMatch(src, /service.?role/i);
  assert.doesNotMatch(src, /RESEND/);
  assert.doesNotMatch(src, /access_token|auth\.token/i);
});

test("Step4SendQuoteEmail: grandTotal viene passato as-is da quotePdfData, nessun ricalcolo", () => {
  const src = read("src/pages/public/configurator/step4/Step4SendQuoteEmail.jsx");
  assert.match(src, /grandTotal:\s*pricing\.grandTotal/);
  assert.doesNotMatch(src, /grandTotal\s*[*+/-]/);
});

// ── Wiring: bottone reale in Step4CampaignActionsPanel ─────────────────────
test("Step4CampaignActionsPanel: il bottone 'Invia preventivo via email' è reale (Step4SendQuoteEmail), non più un finto setTimeout", () => {
  const src = read("src/pages/public/configurator/step4/Step4CampaignActionsPanel.jsx");
  assert.equal((src.match(/<Step4SendQuoteEmail\b/g) || []).length, 2);
  assert.doesNotMatch(src, /setEmailSent\(true\);\s*setTimeout/);
});

test("Step4.jsx: passa quotePdfData reale al pannello azioni (stessa fonte del PDF)", () => {
  const src = read("src/pages/public/configurator/Step4.jsx");
  assert.match(src, /quotePdfData=\{quotePdfData\}/);
});
