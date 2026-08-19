/**
 * smart_pairing_availability_states.test.mjs
 *
 * TEST OBBLIGATORI per la distinzione degli stati Smart Pairing Step 3.
 *
 * A - SUCCESS + 0 MATCH  -> "Nessun match"
 * B - SUCCESS + MATCH    -> slot e sconto reali
 * C - NETWORK/500/404    -> "Verifica non riuscita", NON "Nessun match"
 * D - retry              -> availabilityRetryCount usato come dep
 * E - continua senza     -> porta a Step 4 con smartPairingStatus=skipped_unverified in stato error
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildSmartPairingBypassState,
  normalizeSmartPairingAvailability,
  fetchSmartPairingAvailability,
  getSelectedSmartPairingDates,
} from "../src/lib/smartPairingAvailability.js";

const root = path.resolve(import.meta.dirname, "..");
const step3Source = fs.readFileSync(
  path.join(root, "src/pages/public/configurator/Step3.jsx"),
  "utf8"
);

// TEST A - SUCCESS + 0 MATCH
test("TEST A - SUCCESS ZERO MATCH: 200 con 0 slot - availableDates e smartPairingSlots vuoti", () => {
  const result = normalizeSmartPairingAvailability({ source: "campaign_capacity", availableDates: [], smartPairingSlots: [] });
  assert.deepEqual(result.availableDates, []);
  assert.deepEqual(result.smartPairingSlots, []);
  assert.equal(result.source, "campaign_capacity");
});

test("TEST A - SUCCESS ZERO MATCH: placesAvailable=0 filtrato come non-disponibile", () => {
  const result = normalizeSmartPairingAvailability({
    source: "campaign_capacity",
    availableDates: [{ date: "2099-01-10", placesAvailable: 0 }],
    smartPairingSlots: [{ date: "2099-01-11", type: "same", discountPercent: 40, placesAvailable: 0 }],
  });
  assert.deepEqual(result.availableDates, []);
  assert.deepEqual(result.smartPairingSlots, []);
});

// TEST B - SUCCESS + MATCH
test("TEST B - SUCCESS MATCH: 200 con slot - slot e sconto reali preservati", () => {
  const result = normalizeSmartPairingAvailability({
    source: "campaign_capacity",
    availableDates: [{ date: "2099-02-10", placesAvailable: 3 }],
    smartPairingSlots: [
      { date: "2099-02-10", type: "same", discountPercent: 40, placesAvailable: 2, source: "campaign_capacity" },
      { date: "2099-02-11", type: "nearby", discountPercent: 20, placesAvailable: 1, source: "campaign_capacity" },
    ],
  });
  assert.equal(result.availableDates.length, 1);
  assert.equal(result.smartPairingSlots.length, 2);
  assert.equal(result.smartPairingSlots[0].discountPercent, 40);
  assert.equal(result.smartPairingSlots[1].discountPercent, 20);
  assert.equal(result.source, "campaign_capacity");
});

// TEST C - NETWORK/500/404
test("TEST C - ERROR: fetch fallisce - fetchSmartPairingAvailability lancia eccezione", async () => {
  const mockClient = {
    functions: {
      invoke: async () => ({ data: null, error: { message: "FetchError: Failed to fetch" } }),
    },
  };
  await assert.rejects(
    () => fetchSmartPairingAvailability(mockClient, { service: "d2d", zone: "milano" }),
    /FetchError|SMART_PAIRING_AVAILABILITY_FAILED/
  );
});

test("TEST C - ERROR: 500 backend - lancia eccezione", async () => {
  const mockClient = {
    functions: {
      invoke: async () => ({ data: null, error: { message: "SMART_PAIRING_DATA_UNAVAILABLE" } }),
    },
  };
  await assert.rejects(
    () => fetchSmartPairingAvailability(mockClient, { service: "h2h", zone: "torino" }),
    /SMART_PAIRING_DATA_UNAVAILABLE|SMART_PAIRING_AVAILABILITY_FAILED/
  );
});

test("TEST C - ERROR: client non configurato - lancia eccezione SMART_PAIRING_BACKEND_NOT_CONFIGURED", async () => {
  await assert.rejects(
    () => fetchSmartPairingAvailability(null, { service: "d2d", zone: "roma" }),
    /SMART_PAIRING_BACKEND_NOT_CONFIGURED/
  );
});

// TEST D - RETRY
test("TEST D - RETRY: availabilityRetryCount e il retry button sono presenti in Step3", () => {
  assert.match(step3Source, /availabilityRetryCount/);
  assert.match(step3Source, /setAvailabilityRetryCount\(c\s*=>\s*c\s*\+\s*1\)/);
  assert.match(step3Source, /id="step3-retry-availability"/);
});

// TEST E - CONTINUA SENZA
test("TEST E - CONTINUA SENZA: in stato error usa smartPairingStatus=skipped_unverified", () => {
  assert.match(step3Source, /skipped_unverified/);
  assert.match(step3Source, /availabilityStatus === "error"/);
  assert.match(step3Source, /id="step3-skip-unverified"/);
});

test("BUG TEST A - zero match: bypass non richiede date e preserva lo state precedente", () => {
  const previous = {
    selectedDates: ["2099-03-10"],
    days: ["2099-03-10"],
    campaignPeriodStart: "2099-03-01",
    campaignPeriodEnd: "2099-03-31",
    smartPairingSelectedDates: [],
    campaignZones: [{ id: "cormano", selectedDates: ["2099-03-10"], smartPairingSelectedDates: ["2099-03-12"] }]
  };
  const next = buildSmartPairingBypassState(previous, "success");
  assert.deepEqual(next.selectedDates, previous.selectedDates);
  assert.deepEqual(next.days, previous.days);
  assert.equal(next.campaignPeriodStart, previous.campaignPeriodStart);
  assert.equal(next.campaignPeriodEnd, previous.campaignPeriodEnd);
  assert.deepEqual(next.campaignZones[0].selectedDates, previous.campaignZones[0].selectedDates);
  assert.deepEqual(next.campaignZones[0].smartPairingSelectedDates, []);
  assert.equal(next.smartPairingStatus, "none");
  assert.doesNotMatch(step3Source, /function handleSkipPairing\(\)[\s\S]{0,700}Seleziona almeno una data disponibile/);
});

test("BUG TEST B - zero slot: date generiche non diventano match Smart Pairing", () => {
  assert.deepEqual(getSelectedSmartPairingDates(["2099-04-10"], []), []);
  assert.match(step3Source, /realSmartPairingSlots\.length > 0 && <div/);
});

test("BUG TEST C - slot reale: solo una data restituita dal backend puo essere confermata", () => {
  const slots = [{ date: "2099-05-12", type: "same", placesAvailable: 2 }];
  assert.deepEqual(
    getSelectedSmartPairingDates(["2099-05-11", "2099-05-12"], slots),
    ["2099-05-12"]
  );
});

test("BUG TEST D - date Step 1, slot backend e selezione Smart Pairing hanno campi distinti", () => {
  assert.match(step3Source, /setSelDays\(data\.smartPairingSelectedDates \|\| \[\]\)/);
  assert.match(step3Source, /smartPairingSlots: realSmartPairingSlots/);
  assert.match(step3Source, /smartPairingSelectedDates: newDays/);
  assert.match(step3Source, /step1SelectedDates: prev\.step1SelectedDates \|\| prev\.selectedDates \|\| prev\.days \|\| \[\]/);
});

// INVARIANTI KPI
test("INVARIANTE KPI: in stato error - Non disponibile e Verifica non riuscita", () => {
  assert.match(step3Source, /Non disponibile/);
  assert.match(step3Source, /Verifica non riuscita/);
});

test("INVARIANTE KPI: slot operativi ternary: error=Non disponibile, match=Disponibile, no-match=Nessuno", () => {
  assert.match(step3Source, /isError \? "Non disponibile" : hasMatch \? "Disponibile" : "Nessuno"/);
});

test("INVARIANTE BANNER ERROR: messaggio esplicito di impossibilita di verifica", () => {
  assert.match(step3Source, /Impossibile verificare la disponibilit/);
});

test("INVARIANTE WAITLIST: banner error NON propone Attivami", () => {
  const errorBannerMatch = step3Source.match(/Impossibile verificare la disponibilit[\s\S]{0,800}Attivami/);
  assert.equal(errorBannerMatch, null, "Il banner error NON deve proporre Attivami (waitlist)");
});

// INVARIANTI SORGENTE
test("INVARIANTE SORGENTE: algoritmo matching invariato (offset 5-14, DAILY_CAPACITY=4, 40/20%)", () => {
  const edgeFn = fs.readFileSync(
    path.join(root, "supabase/functions/smart-pairing-availability/index.ts"),
    "utf8"
  );
  assert.match(edgeFn, /PAIRING_OFFSETS = new Set\(\[5, 6, 7, 12, 13, 14\]\)/);
  assert.match(edgeFn, /DAILY_CAPACITY = 4/);
  assert.match(edgeFn, /sameZone \? 40 : 20/);
  assert.match(edgeFn, /distanceKm[\s\S]*<= 5/);
});

test("INVARIANTE SORGENTE: Step3 non importa componenti/pagine Step2 o QuickQuote", () => {
  // L'import legittimo di step2/debugStep2 (utility condivisa) e step2/zoneGeoHelpers
  // e step2/territorial* NON sono violazioni. Controlliamo solo import di pagine Step2.
  const imports = step3Source.split("\n").filter(l => l.trim().startsWith("import "));
  const badStep2Import = imports.find(l => /Step2\.jsx/.test(l) || /pages.*Step2/.test(l));
  assert.equal(badStep2Import, undefined, `Step3 non deve importare pagine Step2: ${badStep2Import}`);
  assert.doesNotMatch(step3Source, /quick.quote|QuickQuote/i);
});
