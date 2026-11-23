// Fase 2 (2026-11-23), gruppi C1 e C2: con piu' punti vendita (PV) e cambi
// rapidi, le scritture ritardate non devono finire sul PV diventato attivo nel
// frattempo. Origine: fix/step2-pv2-address-regression-20261108 (bc8db4e,
// c780201, e26bae3); bug presente in integration fino a 2dbf7ab.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const step2 = fs.readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("C1: allocazione/quantita' e KPI/readiness salvati solo sul PV per cui sono calcolati", () => {
  const guards = step2.match(/const ownerZoneId = data\.activeZoneId;\n\s*setData\(prev => \{\n\s*if \(prev\.activeZoneId !== ownerZoneId\) return prev;/g) || [];
  assert.equal(guards.length, 2, "le due scritture (allocazione e KPI/readiness) hanno il controllo del PV proprietario");
  assert.equal((step2.match(/zones\.findIndex\(z => z\.id === ownerZoneId\)/g) || []).length, 2);
  assert.doesNotMatch(step2, /const zoneIndex = zones\.findIndex\(z => z\.id === prev\.activeZoneId\);/);
});

test("C2: caricamento ritardato del PV non riattiva un PV diverso", () => {
  assert.match(step2, /setData\(prev => prev\.activeZoneId === activeZone\.id \? \(\{\n\s*\.\.\.activatePointOfSale\(prev, activeZone\.id/);
});

test("C2: lo stato locale (citta'/NIL/raggio) non viene trapiantato su un altro PV", () => {
  assert.match(step2, /const zoneOwnerId = data\.activeZoneId;\n\s*setData\(prev => \{[\s\S]{0,300}if \(!prev\.campaignZones \|\| prev\.activeZoneId !== zoneOwnerId\) return prev;\n\s*const zoneIndex = prev\.campaignZones\.findIndex\(z => z\.id === zoneOwnerId\);/);
});

test("C2: il salvataggio dell'indirizzo di copertura vale solo per il PV corrente", () => {
  assert.match(step2, /if \(prev\.activeZoneId !== data\.activeZoneId\) return prev;\n\s*const nextTop = merge\(prev\.coverage\?\.address\);/);
  assert.match(step2, /\}, \[setData, data\.activeZoneId\]\);/);
});
