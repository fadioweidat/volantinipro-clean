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
import React from "react";
import TR from "react-test-renderer";

import {
  buildSmartPairingBypassState,
  normalizeSmartPairingAvailability,
  fetchSmartPairingAvailability,
  getSelectedSmartPairingDates,
} from "../src/lib/smartPairingAvailability.js";
import { Step3SmartPairingMainPanel } from "../src/pages/public/configurator/step3/Step3SmartPairingMainPanel.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Dal refactor 1c153b1 il pannello Smart Pairing (banner error, retry, skip, zero-match, legenda)
// e' un componente estratto: si renderizza davvero invece di cercare stringhe in Step3.jsx.
const flat = (j) => (Array.isArray(j) ? j.map(flat).join(" ") : j == null ? "" : typeof j === "string" ? j : flat(j.children));
const PANEL_BASE = {
  setAvailabilityStatus() {}, setAvailabilityRetryCount() {}, realSmartPairingSlots: [], availableDates: new Set(),
  isMobile: false, handleSkipPairing() {}, month: 8, setMonth() {}, year: 2099, setYear() {}, selDays: [], setSelDays() {},
  isSelectableCalendarDate: () => true, form: {}, setForm() {}, setFormError() {}, pairs: {}, toggle() {}, dateMode: "multi",
  setShowRequest() {}, setFormSent() {},
};
function renderPanel(props) {
  let renderer;
  TR.act(() => { renderer = TR.create(React.createElement(Step3SmartPairingMainPanel, { ...PANEL_BASE, ...props })); });
  return { renderer, text: flat(renderer.toJSON()) };
}

const root = path.resolve(import.meta.dirname, "..");
const step3Source = fs.readFileSync(
  path.join(root, "src/pages/public/configurator/Step3.jsx"),
  "utf8"
);
// Blocco <Step3SmartPairingMainPanel ... /> montato da Step3.jsx (CRLF-safe).
// Chiusura con la stessa indentazione dell'apertura (ignora eventuali elementi JSX annidati nelle prop).
const step3PanelCall = step3Source.match(/^([ \t]*)<Step3SmartPairingMainPanel\b[\s\S]*?^\1\/>/m)?.[0] || "";

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
test("TEST D - RETRY: il pannello espone il retry (loading + contatore) e Step3 lo cabla come dipendenza del fetch", () => {
  const calls = [];
  const { renderer } = renderPanel({
    availabilityStatus: "error",
    setAvailabilityStatus: (s) => calls.push(["status", s]),
    setAvailabilityRetryCount: (fn) => calls.push(["retry", fn(4)]),
  });
  const retry = renderer.root.findByProps({ id: "step3-retry-availability" });
  TR.act(() => { retry.props.onClick(); });
  assert.deepEqual(calls, [["status", "loading"], ["retry", 5]]);
  // Step3 possiede lo stato, lo usa come dipendenza dell'effect e lo passa al pannello.
  assert.match(step3Source, /const \[availabilityRetryCount, setAvailabilityRetryCount\] = useState\(0\)/);
  assert.match(step3Source, /availabilityRetryCount\]\);/);
  assert.ok(step3PanelCall.length > 0, "blocco <Step3SmartPairingMainPanel> trovato in Step3");
  assert.match(step3PanelCall, /setAvailabilityRetryCount=\{setAvailabilityRetryCount\}/);
  assert.match(step3PanelCall, /availabilityStatus=\{availabilityStatus\}/);
  assert.match(step3PanelCall, /setAvailabilityStatus=\{setAvailabilityStatus\}/);
});

// TEST E - CONTINUA SENZA
test("TEST E - CONTINUA SENZA: in stato error usa smartPairingStatus=skipped_unverified", () => {
  let skipped = 0;
  const { renderer } = renderPanel({ availabilityStatus: "error", handleSkipPairing: () => { skipped += 1; } });
  const skip = renderer.root.findByProps({ id: "step3-skip-unverified" });
  TR.act(() => { skip.props.onClick(); });
  assert.equal(skipped, 1);
  assert.equal(buildSmartPairingBypassState({}, "error").smartPairingStatus, "skipped_unverified");
  assert.equal(buildSmartPairingBypassState({}, "success").smartPairingStatus, "none");
  assert.match(step3PanelCall, /handleSkipPairing=\{handleSkipPairing\}/);
  assert.match(step3Source, /function handleSkipPairing\(\)[\s\S]{0,900}buildSmartPairingBypassState\(d, availabilityStatus\)/);
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
  const LEGEND = "Verde: Smart Pairing stessa zona confermato";
  // Date generiche (availableDates) senza slot backend: nessuna legenda di match.
  const noSlots = renderPanel({ availabilityStatus: "ready", availableDates: new Set(["2099-09-12"]) });
  assert.ok(!noSlots.text.includes(LEGEND));
  // Con uno slot reale restituito dal backend la legenda compare (controllo positivo).
  const slot = { date: "2099-09-12", type: "same", placesAvailable: 2, discountPercent: 40 };
  const withSlot = renderPanel({ availabilityStatus: "ready", realSmartPairingSlots: [slot], availableDates: new Set(["2099-09-12"]), pairs: { "2099-09-12": slot } });
  assert.ok(withSlot.text.includes(LEGEND));
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
  const { text } = renderPanel({ availabilityStatus: "error" });
  assert.match(text, /Impossibile verificare la disponibilità Smart Pairing\./);
  assert.match(text, /Non possiamo confermare se ci siano o meno slot disponibili/);
  assert.match(text, /Riprova verifica/);
  assert.match(text, /Continua senza Smart Pairing/);
});

test("INVARIANTE WAITLIST: banner error NON propone Attivami (ma lo zero-match si)", () => {
  assert.ok(!renderPanel({ availabilityStatus: "error" }).text.includes("Attivami"), "Il banner error NON deve proporre Attivami (waitlist)");
  // Controllo positivo: la CTA esiste nel caso zero-match, quindi l'assenza sopra non e' vacua.
  const zero = renderPanel({ availabilityStatus: "ready" }).text;
  assert.match(zero, /Nessuna campagna compatibile al momento\./);
  assert.match(zero, /Attivami/);
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
