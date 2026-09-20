// Contract tests per src/lib/utils/format.js (Italian number / unit formatting).
//
// Due gruppi:
//  1. "CONTRATTO ATTUALE": comportamento gia' corretto e usato dai chiamanti
//     (Step2, Step4, InteractiveRadiusSlider).
//  2. "CONTRATTO ATTESO (typography)": formatAreaKm2 deve produrre "km²" e
//     formatPaperWeight "g/m²" (U+00B2), come formatAreaIT e come gli helper
//     del PDF (generateQuotePdf.js usa "²"). Questi test descrivono il
//     comportamento VOLUTO e falliscono finche' format.js omette il "²".
//     NON vanno adattati all'output attuale ("km" / "g/m").
//
// Nota: "npm test" usa un elenco esplicito di file (package.json) e non include
// questo file; "npm run test:all" lo include (walk ricorsivo di tests/).

import test from "node:test";
import assert from "node:assert/strict";
import * as f from "../src/lib/utils/format.js";

const SQ = "\u00b2"; // ² (SUPERSCRIPT TWO)

// ── formatNumber / formatNumero ──────────────────────────────────────────────
test("formatNumber: valori vuoti o non numerici -> fallback (default '0')", () => {
  for (const v of [0, null, undefined, "", NaN, "abc"]) assert.equal(f.formatNumber(v), "0");
  assert.equal(f.formatNumber(null, "-"), "-");
  assert.equal(f.formatNumber(undefined, "—"), "—");
  // 0 e' un numero valido, non un fallback
  assert.equal(f.formatNumber(0, "—"), "0");
});

test("formatNumber: formato italiano (punto migliaia, virgola decimale), senza spazi", () => {
  assert.equal(f.formatNumber(1234567), "1.234.567");
  assert.equal(f.formatNumber(12.34), "12,34");
  assert.equal(f.formatNumber(130), "130");
  assert.equal(f.formatNumber("130"), "130");
  assert.doesNotMatch(f.formatNumber(1234567), /[\s\u00a0\u202f]/);
});

test("formatNumero e' un alias di formatNumber", () => {
  assert.equal(f.formatNumero, f.formatNumber);
});

// ── formatIntegerIT / formatDecimalIT / formatPercentIT ──────────────────────
test("formatIntegerIT: arrotonda, raggruppa sempre, fallback su non numerici", () => {
  assert.equal(f.formatIntegerIT(1234567), "1.234.567");
  assert.equal(f.formatIntegerIT(1234.5), "1.235");
  assert.equal(f.formatIntegerIT(12.34), "12");
  assert.equal(f.formatIntegerIT("abc"), "Dato non disponibile");
  assert.equal(f.formatIntegerIT(NaN, "n/d"), "n/d");
});

test("formatDecimalIT: decimali fissi, raggruppa sempre", () => {
  assert.equal(f.formatDecimalIT(1), "1,0");
  assert.equal(f.formatDecimalIT(12.34), "12,3");
  assert.equal(f.formatDecimalIT(1234.5), "1.234,5");
  assert.equal(f.formatDecimalIT(12.34, 2), "12,34");
  assert.equal(f.formatDecimalIT("abc"), "Dato non disponibile");
});

test("formatPercentIT: numero + '%', fallback su non numerici", () => {
  assert.equal(f.formatPercentIT(12.34), "12%");
  assert.equal(f.formatPercentIT(12.34, 1), "12,3%");
  assert.equal(f.formatPercentIT(NaN), "Dato non disponibile");
});

// ── formatAreaIT (gia' corretto: fa da riferimento tipografico) ──────────────
test("formatAreaIT: una cifra decimale + ' km²'; zero/negativi/non numerici -> fallback", () => {
  assert.equal(f.formatAreaIT(1234.5), `1.234,5 km${SQ}`);
  assert.equal(f.formatAreaIT(0.5), `0,5 km${SQ}`);
  for (const v of [0, -5, NaN, null]) assert.equal(f.formatAreaIT(v), "Dato non disponibile");
  assert.equal(f.formatAreaIT(0, "n/d"), "n/d");
});

// ── formatRadiusLabel (valori esatti in virgola mobile) ──────────────────────
test("formatRadiusLabel: sotto 1 km in metri, altrimenti in km", () => {
  assert.equal(f.formatRadiusLabel(0.25), "250 m");
  assert.equal(f.formatRadiusLabel(0.5), "500 m");
  assert.equal(f.formatRadiusLabel(1), "1 km");
  assert.equal(f.formatRadiusLabel(5), "5 km");
});

// ── Casi vuoti/non validi di formatAreaKm2 e formatPaperWeight ───────────────
test("formatAreaKm2: input vuoti o non numerici -> null (il chiamante omette la riga)", () => {
  for (const v of [null, undefined, "", "abc", NaN]) assert.equal(f.formatAreaKm2(v), null);
});

test("formatPaperWeight: input vuoto o assente -> stringa vuota", () => {
  for (const v of [null, undefined, "", 0]) assert.equal(f.formatPaperWeight(v), "");
});

// ══ CONTRATTO ATTESO (typography) — fallisce finche' format.js omette il '²' ══

test("[CONTRATTO ATTESO] formatAreaKm2: unita' 'km²' (U+00B2), stessa tipografia di formatAreaIT", () => {
  assert.equal(f.formatAreaKm2(1), `1,0 km${SQ}`);
  assert.equal(f.formatAreaKm2(0.5), `0,5 km${SQ}`);
  assert.equal(f.formatAreaKm2(12.34), `12,3 km${SQ}`);
  assert.equal(f.formatAreaKm2(130), `130,0 km${SQ}`);
  assert.equal(f.formatAreaKm2("130"), `130,0 km${SQ}`);
  assert.equal(f.formatAreaKm2(1234567), `1.234.567,0 km${SQ}`);
});

test("[CONTRATTO ATTESO] formatAreaKm2 e formatAreaIT usano la stessa unita'", () => {
  const a = f.formatAreaKm2(12.34);
  assert.ok(a && a.endsWith(`km${SQ}`), `atteso suffisso 'km${SQ}', ottenuto ${JSON.stringify(a)}`);
  assert.equal(a, f.formatAreaIT(12.34));
});

test("[CONTRATTO ATTESO] formatPaperWeight: numero + 'g/m²' (U+00B2) per numeri e stringhe numeriche", () => {
  assert.equal(f.formatPaperWeight(130), `130 g/m${SQ}`);
  assert.equal(f.formatPaperWeight("130"), `130 g/m${SQ}`);
  assert.equal(f.formatPaperWeight("130-"), `130 g/m${SQ}`);
});

test("[CONTRATTO ATTESO] formatPaperWeight: normalizza 'g/m2' e 'g/m²' in ingresso a un'unica 'g/m²'", () => {
  assert.equal(f.formatPaperWeight("130 g/m2"), `130 g/m${SQ}`);
  assert.equal(f.formatPaperWeight(`130 g/m${SQ}`), `130 g/m${SQ}`);
  assert.equal(f.formatPaperWeight(`90g/m${SQ}`), `90 g/m${SQ}`);
});

test("[CONTRATTO ATTESO] formatPaperWeight: nessun '²' orfano, nessuna unita' doppia, idempotente", () => {
  const out = f.formatPaperWeight(`130 g/m${SQ}`);
  assert.doesNotMatch(out, /\d\s*²\s*g/, `'²' orfano fra numero e unita': ${JSON.stringify(out)}`);
  assert.equal((out.match(/g\/m/g) || []).length, 1, `unita' duplicata: ${JSON.stringify(out)}`);
  assert.equal(f.formatPaperWeight(f.formatPaperWeight("130 g/m2")), `130 g/m${SQ}`);
});
