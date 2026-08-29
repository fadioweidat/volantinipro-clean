import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { buildGraphicRequestPayload, NOTES_MAX_LEN } from "../src/lib/email/graphicRequestPayload.js";
import {
  sanitizeGraphicRequestSpec,
  buildGraphicRequestEmail,
  buildClientConfirmationEmail,
  GRAPHIC_REQUEST_SUBJECT,
  NOTES_MAX_LEN as SERVER_NOTES_MAX,
} from "../supabase/functions/_shared/graphicRequestEmail.ts";
import { GRAPHIC_REQUEST_ENABLED, HAS_SUPPORT_WHATSAPP, SUPPORT_WHATSAPP } from "../src/lib/contactConfig.js";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const step1Src = read("src/pages/public/configurator/Step1.jsx");
const apiClientSrc = read("src/api/sendGraphicRequest.js");
const fnSrc = read("supabase/functions/send-graphic-request/index.ts");
const svcSrc = read("supabase/functions/_shared/sendTransactionalEmail.ts");
const emailBuilderSrc = read("supabase/functions/_shared/graphicRequestEmail.ts");
const envExample = read(".env.example");

// ---------------------------------------------------------------------------
// 1. Payload frontend — whitelist, cap note, nessun destinatario
// ---------------------------------------------------------------------------

test("buildGraphicRequestPayload: whitelist campi, nessun `to`/`recipient`/chiave arbitraria", () => {
  const p = buildGraphicRequestPayload({
    format: "a5", quantity: "10000", orientation: "verticale", paperType: "patinata_opaca",
    grammage: "130 g/m²", sides: "fronte_retro", color: "colori", folding: "nessuna",
    notes: "  serve un logo  ",
    to: "attacker@evil.com", recipient: "x@y.z", cc: "z@z.z", from: "a@a.a", anything: 1,
  });
  assert.deepEqual(Object.keys(p).sort(), ["color", "fold", "format", "grammage", "notes", "orientation", "paperType", "quantity", "sides"]);
  assert.equal(p.to, undefined);
  assert.equal(p.recipient, undefined);
  assert.equal(p.cc, undefined);
  assert.equal(p.format, "a5");
  assert.equal(p.quantity, 10000);
  assert.equal(p.grammage, "130 g/m²"); // stringa grezza — il server la normalizza
  assert.equal(p.notes, "serve un logo");
});

test("buildGraphicRequestPayload: note troncate a NOTES_MAX_LEN; quantity non valida scartata; email cliente validata", () => {
  const long = "x".repeat(NOTES_MAX_LEN + 500);
  const p = buildGraphicRequestPayload({ notes: long, quantity: "abc", clientEmail: "Mario@Example.com" });
  assert.equal(p.notes.length, NOTES_MAX_LEN);
  assert.equal(p.quantity, undefined);
  assert.equal(p.clientEmail, "mario@example.com");
  assert.equal(buildGraphicRequestPayload({ clientEmail: "not-an-email" }).clientEmail, undefined);
});

// ---------------------------------------------------------------------------
// 2. Sanitizzazione server-side + contenuto email
// ---------------------------------------------------------------------------

test("sanitizeGraphicRequestSpec (server): whitelist, cap note, normalizza grammatura, ignora `to`", () => {
  const s = sanitizeGraphicRequestSpec({
    format: "a5", quantity: 12345.7, grammage: "130 g/m²", sides: "fronte_retro",
    notes: "y".repeat(SERVER_NOTES_MAX + 1000), clientEmail: "  A@B.IT ",
    to: "evil@evil.com", recipient: "z@z.z",
  });
  assert.equal(s.format, "A5");
  assert.equal(s.quantity, 12346);
  assert.equal(s.grammage, "130");
  assert.equal(s.notes.length, SERVER_NOTES_MAX);
  assert.equal(s.clientEmail, "a@b.it");
  assert.equal(s.to, undefined);
  assert.equal(s.recipient, undefined);
});

test("buildGraphicRequestEmail: oggetto fisso, HTML escapato, campi presenti", () => {
  assert.equal(GRAPHIC_REQUEST_SUBJECT, "Richiesta servizio grafico - VolantiniPro");
  const { subject, html, text } = buildGraphicRequestEmail(sanitizeGraphicRequestSpec({
    format: "a5", quantity: 10000, grammage: "170", sides: "fronte_retro", color: "colori",
    paperType: "patinata_opaca", orientation: "verticale", folding: "nessuna",
    notes: "<script>alert(1)</script> logo blu",
  }));
  assert.equal(subject, GRAPHIC_REQUEST_SUBJECT);
  assert.match(html, /Formato/);
  assert.match(html, /A5/);
  assert.match(html, /170 g\/m²/);
  assert.match(html, /Fronte\/retro differenti/);
  assert.doesNotMatch(html, /<script>alert/); // escapato
  assert.match(html, /&lt;script&gt;/);
  assert.match(text, /Richiesta servizio grafico/);
});

test("buildClientConfirmationEmail: conferma semplice, nessun prezzo grafica", () => {
  const { subject, html } = buildClientConfirmationEmail({});
  assert.match(subject, /Richiesta servizio grafico ricevuta/);
  assert.match(html, /non è incluso nel prezzo di stampa/);
  assert.doesNotMatch(html, /€\s?\d/);
});

// ---------------------------------------------------------------------------
// 3. Servizio email centrale — fail closed, no key nei log, validazione `to`
// ---------------------------------------------------------------------------

test("_shared/sendTransactionalEmail: fail-closed su RESEND_API_KEY mancante, valida `to`, non logga la key", () => {
  assert.match(svcSrc, /Deno\.env\.get\("RESEND_API_KEY"\)/);
  assert.match(svcSrc, /if \(!apiKey \|\| !from\) \{[\s\S]*EMAIL_NOT_CONFIGURED/);
  assert.match(svcSrc, /EMAIL_RE\.test\(to\)/);
  assert.match(svcSrc, /INVALID_RECIPIENT/);
  assert.match(svcSrc, /reply_to/);
  // nessun log del segreto
  assert.doesNotMatch(svcSrc, /console\.log\([^)]*apiKey/i);
  assert.doesNotMatch(svcSrc, /console\.\w+\([^)]*RESEND_API_KEY/);
  // SDK ufficiale, server-side
  assert.match(svcSrc, /import \{ Resend \} from "npm:resend@/);
});

// ---------------------------------------------------------------------------
// 4. Endpoint pubblico — destinatario fisso, rate limit, validazione
// ---------------------------------------------------------------------------

test("send-graphic-request: destinatario INTERNO deciso server-side, mai dal body", () => {
  assert.match(fnSrc, /function internalRecipient\(\)/);
  assert.match(fnSrc, /Deno\.env\.get\("GRAPHIC_REQUEST_TO"\)/);
  assert.match(fnSrc, /"info@volantinipro\.it"/);
  assert.match(fnSrc, /const to = internalRecipient\(\); \/\/ FISSO server-side/);
  // il `to` NON viene mai preso da raw/body
  assert.doesNotMatch(fnSrc, /to:\s*raw\./);
  assert.doesNotMatch(fnSrc, /to:\s*(spec\.to|body\.to|raw\.to)/);
});

test("send-graphic-request: rate limiting + CORS OPTIONS + validazione input", () => {
  assert.match(fnSrc, /const rateBuckets = new Map/);
  assert.match(fnSrc, /function consumeRateLimit/);
  assert.match(fnSrc, /code: "RATE_LIMITED"[\s\S]*429/);
  assert.match(fnSrc, /GRAPHIC_REQUEST_RATE_MAX/);
  assert.match(fnSrc, /if \(req\.method === "OPTIONS"\)/);
  assert.match(fnSrc, /if \(req\.method !== "POST"\)[\s\S]*405/);
  assert.match(fnSrc, /const spec = sanitizeGraphicRequestSpec\(raw\)/);
  assert.match(fnSrc, /looksLikeSpam/);
  assert.match(fnSrc, /INVALID_JSON/);
  // fail closed propagato
  assert.match(fnSrc, /result\.code === "EMAIL_NOT_CONFIGURED" \? 503/);
  // niente log di note/segreti; la key non viene MAI letta qui (solo in _shared)
  assert.doesNotMatch(fnSrc, /console\.log\([^)]*spec/);
  assert.doesNotMatch(fnSrc, /Deno\.env\.get\(["']RESEND_API_KEY["']\)/);
  assert.doesNotMatch(fnSrc, /console\.\w+\([^)]*RESEND/);
});

// ---------------------------------------------------------------------------
// 5. Client frontend — nessun destinatario, endpoint corretto, anon key
// ---------------------------------------------------------------------------

test("src/api/sendGraphicRequest.js: POST all'Edge Function, nessun `to`, anon key", () => {
  assert.match(apiClientSrc, /\/functions\/v1\/send-graphic-request/);
  assert.match(apiClientSrc, /buildGraphicRequestPayload\(spec\)/);
  assert.match(apiClientSrc, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(apiClientSrc, /RESEND/);
  assert.doesNotMatch(apiClientSrc, /\bto:\s*/);
});

// ---------------------------------------------------------------------------
// 6. Step1 — invio solo su click esplicito, fallback mailto, WhatsApp intatto
// ---------------------------------------------------------------------------

test("Step1: submitGraphicRequest solo su click, non al cambio card; conferma + fallback", () => {
  assert.match(step1Src, /const submitGraphicRequest = async \(\) => \{/);
  assert.match(step1Src, /onClick=\{submitGraphicRequest\}/);
  // `sendGraphicRequest(` viene invocato SOLO dentro submitGraphicRequest (non in setArtwork)
  const invocations = [...step1Src.matchAll(/\bsendGraphicRequest\(/g)];
  assert.equal(invocations.length, 1);
  const setArtworkBody = step1Src.slice(step1Src.indexOf("const setArtwork = status =>"), step1Src.indexOf("const submitGraphicRequest"));
  assert.doesNotMatch(setArtworkBody, /sendGraphicRequest/);
  assert.match(step1Src, /✓ Richiesta inviata a VolantiniPro/);
  // mailto sempre disponibile come fallback
  assert.match(step1Src, /buildGraphicMailtoUrl\(\{ format: printing\.format/);
  assert.match(step1Src, /GRAPHIC_REQUEST_ENABLED \? "Apri email" : "Invia un'email"/);
  // WhatsApp invariato: solo dietro HAS_SUPPORT_WHATSAPP
  assert.match(step1Src, /HAS_SUPPORT_WHATSAPP && <a href=\{buildGraphicWhatsAppUrl/);
});

// ---------------------------------------------------------------------------
// 7. Sicurezza — nessun secret nel frontend
// ---------------------------------------------------------------------------

test("nessuna RESEND_API_KEY / VITE_RESEND nel frontend; flag è solo booleano", () => {
  // GRAPHIC_REQUEST_ENABLED è un booleano, default false senza env
  assert.equal(typeof GRAPHIC_REQUEST_ENABLED, "boolean");
  assert.equal(GRAPHIC_REQUEST_ENABLED, false);
  // WhatsApp non toccato
  assert.equal(SUPPORT_WHATSAPP, null);
  assert.equal(HAS_SUPPORT_WHATSAPP, false);
  // scan cartella src/: nessun accesso a RESEND_API_KEY, nessun VITE_RESEND
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const fp = path.join(dir, d.name);
    return d.isDirectory() ? walk(fp) : [fp];
  });
  const offenders = walk(path.join(root, "src"))
    .filter((f) => /\.(js|jsx|ts|tsx)$/.test(f))
    .filter((f) => {
      const c = fs.readFileSync(f, "utf8");
      return /VITE_RESEND/.test(c) || /re_[A-Za-z0-9]{16,}/.test(c) ||
        /import\.meta\.env\.[A-Za-z_]*RESEND/.test(c) || /Deno\.env|process\.env\.RESEND_API_KEY/.test(c);
    });
  assert.deepEqual(offenders, []);
  // .env.example: la key è server-side, non VITE_
  assert.match(envExample, /^RESEND_API_KEY=/m);
  assert.doesNotMatch(envExample, /VITE_RESEND/);
});
