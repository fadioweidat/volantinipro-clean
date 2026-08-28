// BUG A — Step4 "↑ Aumenta quantità (Consigliato)" non faceva nulla di utile:
// il suo onClick era `() => onHome("step1")` (torna allo Step 1), non
// aumentava la quantita' ne' ricalcolava prezzo/copertura/KPI.
//
// Fix: l'onClick porta la quantita' al fabbisogno reale (requiredQty),
// scrivendo sui campi che Step1 e resolveQuoteQuantity leggono davvero
// (data.qty + data.flyerQuantity). Tutta la pipeline a valle (pricing,
// coverageForSummary, KPI) e' gia' derivata da flyerQty ⇒ si ricalcola.
//
// Convenzione test Step4 (vedi tests/step4_extras_control_pro.test.mjs):
// logica pura via i moduli reali + contratto sul sorgente per il wiring.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveQuoteQuantity, calculateQuotePricing } from "../src/lib/quotePricing.js";
import { QUOTE_PRICES } from "../src/lib/appConstants.js";

const STEP4_SRC = readFileSync(new URL("../src/pages/public/configurator/Step4.jsx", import.meta.url), "utf8");
const MAGIC_SRC = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");

// --- comportamento: aumentando la quantita' al fabbisogno, tutto ricalcola ---

test("scenario Seveso (10.000, mancano 1.261): il target del bottone e' il fabbisogno 11.261", () => {
  const flyerQty = 10000;
  const missingQty = 1261;
  const requiredQty = flyerQty + missingQty; // 11261 — come lo calcola Step4 (rawRemainingQty)
  // Stessa espressione dell'onClick corretto:
  const target = Math.max(Number(flyerQty) || 0, Math.round(Number(requiredQty) || 0));
  assert.equal(target, 11261);
  assert.ok(target > flyerQty, "il target aumenta la quantita'");
});

test("dopo il click resolveQuoteQuantity restituisce la nuova quantita' (qty + flyerQuantity sincronizzati)", () => {
  const target = 11261;
  // onClick scrive entrambi i campi; resolveQuoteQuantity legge flyerQuantity ?? qty
  assert.equal(resolveQuoteQuantity({ qty: target, flyerQuantity: target }), 11261);
  assert.equal(resolveQuoteQuantity({ qty: 10000, flyerQuantity: target }), 11261, "flyerQuantity ha la precedenza");
});

test("prezzo ricalcolato: total con 11.261 > total con 10.000 (stesso servizio/parametri)", () => {
  const pricePerThousand = QUOTE_PRICES.d2d || 18.5;
  const base = { pricePerThousand, smartPairingDiscountPct: 0, urgency: "normal", planDiscountPct: 0, extras: [] };
  const before = calculateQuotePricing({ quantity: 10000, ...base });
  const after = calculateQuotePricing({ quantity: 11261, ...base });
  assert.ok(after.total > before.total, `atteso total maggiore: ${after.total} > ${before.total}`);
});

test("copertura ricalcolata: flyerQty>=requiredQty ⇒ coverageForSummary = 100%", () => {
  const requiredQty = 11261;
  const flyerQtyAfter = 11261;
  const coverageForSummary = requiredQty > 0 ? Math.min(100, Math.round((flyerQtyAfter / requiredQty) * 100)) : null;
  assert.equal(coverageForSummary, 100);
  // e quantityIsSufficient (rawRemainingQty >= 0) diventa true ⇒ card "Copertura completa"
  const rawRemainingQty = flyerQtyAfter - requiredQty;
  assert.ok(rawRemainingQty >= 0);
});

// --- contratto sorgente: il bottone e' cablato correttamente ---

function increaseButtonBlock(src) {
  const anchor = src.indexOf("↑ Aumenta quantità (Consigliato)");
  assert.ok(anchor >= 0, "bottone 'Aumenta quantità' non trovato in Step4.jsx");
  // dal <button ... che precede l'etichetta fino alla </button>
  const start = src.lastIndexOf("<button", anchor);
  const end = src.indexOf("</button>", anchor);
  return src.slice(start, end);
}
const BTN = increaseButtonBlock(STEP4_SRC);

test("il bottone NON e' piu' solo onHome('step1')", () => {
  assert.doesNotMatch(BTN, /onClick=\{\(\)\s*=>\s*onHome\("step1"\)\}/, "onClick regressato a onHome('step1')");
});

test("il bottone aggiorna la quantita' via setData su qty + flyerQuantity, mai un decremento", () => {
  assert.match(BTN, /onClick=\{/, "il bottone deve avere un onClick");
  assert.match(BTN, /setData\(/, "deve chiamare setData");
  assert.match(BTN, /qty:\s*target/, "deve scrivere data.qty");
  assert.match(BTN, /flyerQuantity:\s*target/, "deve scrivere data.flyerQuantity (letto da resolveQuoteQuantity)");
  assert.match(BTN, /Math\.max\(/, "il target non deve mai decrementare la quantita'");
  assert.match(BTN, /requiredQty/, "il target deriva dal fabbisogno reale (requiredQty), non hardcoded");
  assert.doesNotMatch(BTN, /11261|11\.261|Seveso/i, "nessun valore/comune hardcoded");
});

test("il bottone 'Mantieni copertura' resta presente (nessuna regressione)", () => {
  assert.match(STEP4_SRC, /✓ Mantieni copertura al \{kpis\.coverage \?\? avgCov\}%/);
});

test("resolveQuoteQuantity legge flyerQuantity ?? qty (i campi scritti dal bottone)", () => {
  const src = readFileSync(new URL("../src/lib/quotePricing.js", import.meta.url), "utf8");
  assert.match(src, /function resolveQuoteQuantity\(data\)\s*\{[\s\S]*?data\?\.flyerQuantity\s*\?\?\s*data\?\.qty/);
});

// --- BUG B (contratto auth) — AGGIORNATO dopo il fix "separazione Cliente/Admin" ---
// Contratto PRECEDENTE (vulnerabile): il callback instradava a /admin sulla
// SOLA base di verifySupabaseAdminRole(), ignorando l'intento del login.
// L'account usato storicamente per "testare il flusso cliente" ha
// profiles.role = 'admin', quindi il bug si mascherava da comportamento
// corretto. In produzione un cliente reale con role=admin (o un admin che
// apre il link cliente) finiva in Dashboard Admin.
//
// Contratto ATTUALE: il ruolo Admin resta verificato SOLO dal backend
// (jwt_is_admin, fail-closed) e AUTORIZZA; l'INTENTO del login (isAdminContext,
// da ?context=admin o dal context ricordato all'invio) INSTRADA. /admin scatta
// solo con entrambi. Vedi tests/auth_client_admin_separation.test.mjs.

test("callback: /admin richiede ruolo backend E intento Admin (non solo il ruolo)", () => {
  const s = MAGIC_SRC.indexOf('window.location.hash.includes("access_token")');
  assert.ok(s >= 0);
  const cb = MAGIC_SRC.slice(s, s + 6000);
  assert.match(cb, /const isAdmin = await verifySupabaseAdminRole\(restoredSession\)/);
  // l'intento e' catturato prima di pulire il context ricordato
  assert.match(cb, /const loginIntentIsAdmin = isAdminContext;/);
  // il redirect Admin richiede ruolo backend E intento Admin
  assert.match(cb, /if \(isAdmin && loginIntentIsAdmin\) \{\s*\n\s*onNav\("admin"\)/);
  // la vecchia condizione "solo ruolo" non esiste piu'
  assert.doesNotMatch(cb, /if \(isAdmin\) \{\s*\n\s*onNav\("admin"\)/);
  // intento Cliente / mancante -> dashboard (o ritorno a Step4)
  assert.match(cb, /onNav\(pendingReturnToStep4 \? "step4" : "dashboard"\)/, "non-admin/intento cliente -> dashboard");
});
