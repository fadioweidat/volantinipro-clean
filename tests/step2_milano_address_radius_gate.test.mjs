/**
 * tests/step2_milano_address_radius_gate.test.mjs
 *
 * BUG — "Milano address → Raggio" Step2→Step3 gate never clears (P1,
 * confirmed live via a local dev server against real production data,
 * VITE_SUPABASE_ANON_KEY is the public/publishable client key).
 *
 * Root cause: selectAddressPointInMilano() (the handler that runs when a
 * user picks a Milano address from the autocomplete while area mode is
 * "radius") resets radiusSelectionConfirmed to false while clearing the
 * OLD selection's state, then sets the NEW selectedSearchPoint two lines
 * later — but never re-confirms radiusSelectionConfirmed for the new,
 * valid point. Every other code path that sets a point (switchToRadiusMode,
 * updateActiveRadius, handleManualMapClick) re-derives/re-confirms this
 * flag; only the address-autocomplete path didn't.
 *
 * Because hasConfirmedCoverageMode and isRadiusGeometryValid both gate on
 * radiusSelectionConfirmed when areaMode === "radius", the Step2→3 CTA
 * stayed stuck on "Seleziona una modalità di copertura" forever for this
 * one path — Comune and CAP tabs are unaffected (their
 * hasConfirmedCoverageMode never reads radiusSelectionConfirmed), and NIL
 * mode is unaffected (areaMode isn't "radius" there).
 *
 * Static/deterministic source-contract test (same convention as
 * tests/step2_territory_controls_wiring.test.mjs) — no React/JSX render,
 * no jsdom. Asserts the fix is present and colocated correctly relative to
 * the point-setting call it must follow.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const STEP2_SRC = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');

test('selectAddressPointInMilano: re-confirms radiusSelectionConfirmed after setting the new selectedSearchPoint', () => {
  const fnStart = STEP2_SRC.indexOf('async function selectAddressPointInMilano(');
  assert.ok(fnStart > -1, 'selectAddressPointInMilano deve esistere in Step2.jsx');
  const fnEnd = STEP2_SRC.indexOf('\n  async function selectMilanoAsNil(', fnStart);
  assert.ok(fnEnd > fnStart, 'delimitatore di fine funzione non trovato');
  const fnBody = STEP2_SRC.slice(fnStart, fnEnd);

  const resetIdx = fnBody.indexOf('setRadiusSelectionConfirmed(false)');
  const setPointIdx = fnBody.indexOf('setSelectedSearchPoint(sp)');
  const reconfirmIdx = fnBody.indexOf('setRadiusSelectionConfirmed(Number(radius || 3) > 0)');

  assert.ok(resetIdx > -1, 'il reset iniziale (per la selezione precedente) deve restare');
  assert.ok(setPointIdx > -1, 'il setter del nuovo punto deve restare');
  assert.ok(reconfirmIdx > -1, 'radiusSelectionConfirmed deve essere ri-confermato per il nuovo punto (fix mancante)');
  assert.ok(resetIdx < setPointIdx, 'il reset deve avvenire prima del nuovo setSelectedSearchPoint (invariato)');
  assert.ok(setPointIdx < reconfirmIdx, 'la riconferma deve avvenire DOPO aver impostato il nuovo punto valido, non prima');
});

test('la riconferma non tocca famiglie/popolazione/CAP: nessuna chiamata a setter di dati territoriali nello stesso blocco', () => {
  const fnStart = STEP2_SRC.indexOf('async function selectAddressPointInMilano(');
  const fnEnd = STEP2_SRC.indexOf('\n  async function selectMilanoAsNil(', fnStart);
  const fnBody = STEP2_SRC.slice(fnStart, fnEnd);
  const reconfirmIdx = fnBody.indexOf('setRadiusSelectionConfirmed(Number(radius || 3) > 0)');
  const around = fnBody.slice(reconfirmIdx, reconfirmIdx + 400);
  assert.doesNotMatch(around, /setFamilies|setPopulation|setCapEstimate|setRequiredFlyers/, 'la riconferma del gate non deve introdurre alcun calcolo di famiglie/popolazione/CAP parallelo');
});

test('gate selector: hasConfirmedCoverageMode e isRadiusGeometryValid dipendono entrambi da radiusSelectionConfirmed solo per areaMode "radius" (Comune/CAP/NIL non toccati)', () => {
  assert.match(
    STEP2_SRC,
    /const hasConfirmedCoverageMode = areaMode === "radius" \? radiusSelectionConfirmed :/,
    'hasConfirmedCoverageMode deve restare invariato per Comune/CAP/NIL (branch non-radius)'
  );
  assert.match(
    STEP2_SRC,
    /const isRadiusGeometryValid = areaMode !== "radius" \|\| Boolean\(radiusSelectionConfirmed/,
    'isRadiusGeometryValid deve restare invariato per Comune/CAP/NIL (short-circuit non-radius)'
  );
});
