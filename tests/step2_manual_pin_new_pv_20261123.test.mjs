// Fase 2 (2026-11-23), gruppo B2: il punto scelto a mano sulla mappa deve
// funzionare anche su un punto vendita (PV) nuovo, senza comune ne' indirizzo
// salvato. Prima: raggio "non confermato" e KPI "Dato non disponibile".
// Origine: d715279 (fix/step2-pv2-address-regression-20261108).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const step2 = fs.readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const handler = step2.slice(step2.indexOf("async function handleManualMapClick(coords)"), step2.indexOf("async function selectAddressPointInMilano("));

test("B2: riferimento al PV attivo disponibile per le operazioni asincrone", () => {
  assert.match(step2, /const activeZoneIdRef = useRef\(data\.activeZoneId\);\n\s*activeZoneIdRef\.current = data\.activeZoneId;/);
});

test("B2: il punto manuale conferma il raggio e salva l'indirizzo sul PV", () => {
  assert.ok(handler.length > 0, "handler asincrono presente");
  assert.match(handler, /const ownerZoneId = activeZoneIdRef\.current;/);
  assert.match(handler, /setSelectedSearchPoint\(point\);/);
  assert.match(handler, /setRadiusSelectionConfirmed\(Number\(radius \|\| 3\) > 0\);/);
  assert.match(handler, /persistCoverageAddress\(\{ label: point\.label, lat: point\.lat, lng: point\.lng, municipality: point\.parentComune \}\);/);
});

test("B2: Milano impostata solo se il PV non e' cambiato durante l'attesa", () => {
  assert.match(handler, /const milano = await resolveMilanoCity\(\);\n\s*\/\/[^\n]*\n\s*if \(activeZoneIdRef\.current !== ownerZoneId \|\| !milano\) return;\n\s*setCity\(milano\);/);
});
