import assert from "node:assert/strict";
import test from "node:test";

import {
  filterValidGpsPoints,
  calculateFilteredDistanceKm,
  summarizeGpsQuality,
  EXCLUSION_REASONS,
} from "../src/lib/gps/pointQuality.js";

// Dati reali diagnosticati sul Monitor Admin (campagna 59a27968-...,
// sessione 4d861934-...): un fix iniziale (Beirut, accuracy in
// miglioramento) seguito da punti a Milano dopo un salto di ~7 minuti.
// Questa e' la sequenza esatta che produceva "2591,81 km / 9 punti".
const BEIRUT_TO_MILAN_SESSION = [
  { lat: 33.6365125, lng: 35.4761017, accuracy: 82.5, recorded_at: "2026-08-01T15:17:14.782Z" },
  { lat: 33.6365125, lng: 35.4761017, accuracy: 82.5, recorded_at: "2026-08-01T15:17:14.782Z" },
  { lat: 33.6365125, lng: 35.4761017, accuracy: 82.5, recorded_at: "2026-08-01T15:17:14.782Z" },
  { lat: 33.6365152, lng: 35.4761042, accuracy: 45.6, recorded_at: "2026-08-01T15:27:38.413Z" },
  { lat: 33.6366013, lng: 35.4761901, accuracy: 3.126, recorded_at: "2026-08-01T15:27:54.030Z" },
  { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-08-01T15:34:43.635Z" },
  { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-08-01T15:34:43.812Z" },
  { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-08-01T15:35:55.495Z" },
  { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-08-01T15:35:55.628Z" },
];

test("filterValidGpsPoints", async (t) => {
  await t.test("isola il salto impossibile (2591 km in 7 minuti) senza rompere il resto della traccia", () => {
    const { valid, excluded } = filterValidGpsPoints(BEIRUT_TO_MILAN_SESSION);
    // Il cluster Milano non deve mai finire nella traccia valida quando
    // segue un salto geografico incompatibile col tempo trascorso: solo il
    // PRIMO punto del cluster Milano viene rifiutato come impossible_jump
    // (confrontato con l'ultimo punto valido, Beirut); i successivi punti
    // Milano sono poi coerenti TRA LORO e tornano validi — comportamento
    // corretto: la sessione ha davvero due segmenti, il filtro isola il
    // salto, non cancella dati legittimi a valle.
    const jumpExclusions = excluded.filter((item) => item.reason === EXCLUSION_REASONS.IMPOSSIBLE_JUMP);
    assert.ok(jumpExclusions.length >= 1, "deve rilevare almeno un salto impossibile");
    assert.ok(valid.length >= 2, "deve restare una traccia valida utilizzabile");
  });

  await t.test("esclude coordinate 0,0", () => {
    const points = [
      { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:00Z" },
      { lat: 0, lng: 0, accuracy: 10, recorded_at: "2026-01-01T10:00:10Z" },
    ];
    const { valid, excluded } = filterValidGpsPoints(points);
    assert.equal(valid.length, 1);
    assert.equal(excluded[0].reason, EXCLUSION_REASONS.ZERO_COORDINATES);
  });

  await t.test("esclude coordinate non valide (fuori range o non numeriche)", () => {
    const points = [
      { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:00Z" },
      { lat: 999, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:10Z" },
      { lat: "not-a-number", lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:20Z" },
    ];
    const { valid, excluded } = filterValidGpsPoints(points);
    assert.equal(valid.length, 1);
    assert.equal(excluded.length, 2);
    assert.ok(excluded.every((item) => item.reason === EXCLUSION_REASONS.INVALID_COORDINATES));
  });

  await t.test("esclude accuracy oltre soglia", () => {
    const points = [
      { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:00Z" },
      { lat: 45.4643, lng: 9.1901, accuracy: 500, recorded_at: "2026-01-01T10:00:10Z" },
    ];
    const { valid, excluded } = filterValidGpsPoints(points);
    assert.equal(valid.length, 1);
    assert.equal(excluded[0].reason, EXCLUSION_REASONS.LOW_ACCURACY);
  });

  await t.test("un punto arrivato fuori sequenza (coda offline) viene riordinato, non escluso", () => {
    // I punti offline vengono inviati in ritardo con il loro recordedAt
    // originale: possono arrivare al DB fuori ordine rispetto ad altri gia'
    // scritti. Non e' un'anomalia: il riordino cronologico (richiesto da
    // FASE 1/2) lo risolve, non deve produrre un'esclusione.
    const points = [
      { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:05:00Z" },
      { lat: 45.46425, lng: 9.1905, accuracy: 10, recorded_at: "2026-01-01T10:00:00Z" },
    ];
    const { valid, excluded } = filterValidGpsPoints(points);
    assert.equal(valid.length, 2);
    assert.equal(excluded.length, 0);
    assert.equal(valid[0].recorded_at, "2026-01-01T10:00:00Z");
  });

  await t.test("esclude punto duplicato (stessa posizione, stesso istante)", () => {
    const points = [
      { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:00.000Z" },
      { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:00.100Z" },
    ];
    const { valid, excluded } = filterValidGpsPoints(points);
    assert.equal(valid.length, 1);
    assert.equal(excluded[0].reason, EXCLUSION_REASONS.DUPLICATE_POINT);
  });

  await t.test("una traccia pulita e coerente resta interamente valida", () => {
    const points = [
      { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:00Z" },
      { lat: 45.46425, lng: 9.1905, accuracy: 12, recorded_at: "2026-01-01T10:00:20Z" },
      { lat: 45.4645, lng: 9.191, accuracy: 8, recorded_at: "2026-01-01T10:00:40Z" },
    ];
    const { valid, excluded } = filterValidGpsPoints(points);
    assert.equal(valid.length, 3);
    assert.equal(excluded.length, 0);
  });

  await t.test("ordina per recorded_at indipendentemente dall'ordine di input", () => {
    const points = [
      { lat: 45.4645, lng: 9.191, accuracy: 8, recorded_at: "2026-01-01T10:00:40Z" },
      { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:00Z" },
      { lat: 45.46425, lng: 9.1905, accuracy: 12, recorded_at: "2026-01-01T10:00:20Z" },
    ];
    const { valid } = filterValidGpsPoints(points);
    assert.deepEqual(valid.map((p) => p.recorded_at), ["2026-01-01T10:00:00Z", "2026-01-01T10:00:20Z", "2026-01-01T10:00:40Z"]);
  });
});

test("calculateFilteredDistanceKm", async (t) => {
  await t.test("la distanza corretta della sessione Beirut->Milano e' drasticamente inferiore a quella grezza (2591 km)", () => {
    const filteredKm = calculateFilteredDistanceKm(BEIRUT_TO_MILAN_SESSION);
    assert.ok(filteredKm < 10, `attesa distanza corretta piccola (traccia reale entro pochi metri), ottenuto ${filteredKm} km`);
  });

  await t.test("nessun punto anomalo -> stessa distanza del calcolo semplice", () => {
    const points = [
      { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:00Z" },
      { lat: 45.4652, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:30Z" },
    ];
    const km = calculateFilteredDistanceKm(points);
    assert.ok(km > 0.1 && km < 0.2, `attesa ~0.111 km, ottenuto ${km}`);
  });
});

test("summarizeGpsQuality", async (t) => {
  await t.test("riporta punti totali/validi/esclusi e un giudizio qualita' coerente", () => {
    const quality = summarizeGpsQuality(BEIRUT_TO_MILAN_SESSION);
    assert.equal(quality.total, BEIRUT_TO_MILAN_SESSION.length);
    assert.ok(quality.excludedCount >= 1);
    assert.equal(quality.validCount + quality.excludedCount, quality.total);
    assert.ok(["buona", "accettabile", "scarsa"].includes(quality.quality));
  });

  await t.test("nessun punto -> qualita' n/d, nessuna eccezione", () => {
    const quality = summarizeGpsQuality([]);
    assert.equal(quality.total, 0);
    assert.equal(quality.quality, "n/d");
  });

  await t.test("tutti i punti validi -> qualita' buona", () => {
    const points = [
      { lat: 45.4642, lng: 9.19, accuracy: 10, recorded_at: "2026-01-01T10:00:00Z" },
      { lat: 45.46425, lng: 9.1905, accuracy: 12, recorded_at: "2026-01-01T10:00:20Z" },
    ];
    assert.equal(summarizeGpsQuality(points).quality, "buona");
  });
});
