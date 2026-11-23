// Fase 2 (2026-11-23), gruppo A3: confronto civico piu' tollerante ma sicuro.
// Origine: civicAddressMatch.js di fix/step2-pv2-address-regression-20261108,
// riscritto dentro addressIntent.js.
import test from "node:test";
import assert from "node:assert/strict";
import { matchesRequestedCivic, normalizeItalianStreetNumber, streetNamesMatch } from "../src/lib/step2/addressIntent.js";

const result = (street, houseNumber) => ({ street, houseNumber, placeType: "address" });

test("A3: via abbreviata accettata (Via Oroboni = Via Antonio Oroboni)", () => {
  assert.equal(matchesRequestedCivic("Via Oroboni 10, Milano", result("Via Antonio Oroboni", "10")), true);
  assert.equal(streetNamesMatch("Via Oroboni", "Via Antonio Oroboni"), true);
});

test("A3: tipo di via diverso resta diverso (Via Certosa != Viale Certosa)", () => {
  assert.equal(matchesRequestedCivic("Via Certosa 10, Milano", result("Viale Certosa", "10")), false);
  assert.equal(streetNamesMatch("Via", "Via Antonio Oroboni"), false);
});

test("A3: barra con lettera = lettera (12/A = 12A), barra numerica no (24/6 != 246)", () => {
  assert.equal(normalizeItalianStreetNumber("12/A"), "12A");
  assert.equal(normalizeItalianStreetNumber("12 a"), "12A");
  assert.equal(normalizeItalianStreetNumber("010"), "10");
  assert.equal(matchesRequestedCivic("Via Padova 12/A, Milano", result("Via Padova", "12A")), true);
  assert.equal(matchesRequestedCivic("Via Padova 24/6, Milano", result("Via Padova", "246")), false);
});

test("A3: numero diverso o risultato quartiere non confermano il civico", () => {
  assert.equal(matchesRequestedCivic("Via Oroboni 10, Milano", result("Via Antonio Oroboni", "12")), false);
  assert.equal(matchesRequestedCivic("Via Oroboni 10, Milano", { street: "Via Antonio Oroboni", houseNumber: "10", placeType: "neighborhood" }), false);
});

import fs from "node:fs";
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("G: Mapbox riceve 'Italia' per gli indirizzi senza cambiare il campo del visitatore", () => {
  const step2 = read("src/pages/public/configurator/Step2.jsx");
  assert.match(step2, /const mapboxQuery = searchIntent\.intent === "address" && !\/\\bitalia\\b\/i\.test\(search\)/);
  assert.match(step2, /mapbox\.places\/\$\{encodeURIComponent\(mapboxQuery\)\}\.json/);
  assert.doesNotMatch(step2, /setSearch\(mapboxQuery\)/);
});

test("A8: con un civico richiesto niente 'Milano comune completo' e niente Municipi/NIL al posto dell'indirizzo", () => {
  const panel = read("src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx");
  assert.match(panel, /const civicRequest = Boolean\(requestedCivicNumber\(search\)\);/);
  assert.match(panel, /\{!civicRequest && <button onClick=\{\(\) => \{\n\s*resolveMilanoCity\(\)/);
  assert.match(panel, /if \(isHiddenForCivic\(c\)\) return null;\n\s*if \(isOperationalPointResult\) \{/);
  assert.match(panel, /isNilLikePlaceType\(c\?\.placeType\) \|\| \(!looksLikeAddressResult\(c\)/);
  assert.match(panel, /orderedSuggestions\.every\(isHiddenForCivic\)/);
});
