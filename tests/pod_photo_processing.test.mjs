import assert from "node:assert/strict";
import test from "node:test";

import {
  POD_MAX_INPUT_BYTES,
  POD_OUTCOME_OPTIONS,
  buildPodWatermarkLines,
  buildProofPhotoNote,
  parseProofPhotoNote,
  podOutcomeLabel,
  validatePodImageFile,
} from "../src/lib/pod/podPhotoProcessing.js";

test("podOutcomeLabel", async (t) => {
  await t.test("valori noti restituiscono l'etichetta italiana", () => {
    assert.equal(podOutcomeLabel("consegnato"), "Consegnato");
    assert.equal(podOutcomeLabel("assente"), "Destinatario assente");
    assert.equal(podOutcomeLabel("rifiutato"), "Rifiutato");
    assert.equal(podOutcomeLabel("altro"), "Altro");
  });

  await t.test("valore sconosciuto o assente -> fallback leggibile", () => {
    assert.equal(podOutcomeLabel(undefined), "Esito non specificato");
    assert.equal(podOutcomeLabel("qualcosa_di_strano"), "Esito non specificato");
  });

  await t.test("tutte le opzioni hanno value e label", () => {
    assert.equal(POD_OUTCOME_OPTIONS.length, 4);
    POD_OUTCOME_OPTIONS.forEach((option) => {
      assert.ok(option.value);
      assert.ok(option.label);
    });
  });
});

test("validatePodImageFile", async (t) => {
  await t.test("nessun file -> errore leggibile", () => {
    assert.throws(() => validatePodImageFile(null), /Nessun file/);
  });

  await t.test("file non immagine -> errore leggibile", () => {
    assert.throws(() => validatePodImageFile({ type: "application/pdf", size: 1000 }), /non e' un'immagine valida/);
  });

  await t.test("file vuoto -> errore leggibile", () => {
    assert.throws(() => validatePodImageFile({ type: "image/jpeg", size: 0 }), /vuoto/);
  });

  await t.test("file troppo grande -> errore leggibile", () => {
    assert.throws(
      () => validatePodImageFile({ type: "image/jpeg", size: POD_MAX_INPUT_BYTES + 1 }),
      /supera/,
    );
  });

  await t.test("file immagine valido -> nessun errore", () => {
    assert.doesNotThrow(() => validatePodImageFile({ type: "image/jpeg", size: 1024 }));
    assert.doesNotThrow(() => validatePodImageFile({ type: "image/webp", size: 1024 }));
  });
});

test("buildProofPhotoNote / parseProofPhotoNote", async (t) => {
  await t.test("round-trip preserva tutti i campi", () => {
    const raw = buildProofPhotoNote({
      client: "Mario Rossi",
      address: "Via Roma 1, Milano",
      ddt: "DDT-2026-042",
      colli: "3",
      outcome: "consegnato",
      note: "Consegnato al portiere",
      driverName: "Luca Bianchi",
    });
    const parsed = parseProofPhotoNote(raw);
    assert.equal(parsed.client, "Mario Rossi");
    assert.equal(parsed.address, "Via Roma 1, Milano");
    assert.equal(parsed.ddt, "DDT-2026-042");
    assert.equal(parsed.colli, 3);
    assert.equal(parsed.outcome, "consegnato");
    assert.equal(parsed.note, "Consegnato al portiere");
    assert.equal(parsed.driverName, "Luca Bianchi");
  });

  await t.test("campi vuoti diventano null, colli non numerico diventa null", () => {
    const raw = buildProofPhotoNote({ client: "", address: "  ", colli: "abc", outcome: "" });
    const parsed = parseProofPhotoNote(raw);
    assert.equal(parsed.client, null);
    assert.equal(parsed.address, null);
    assert.equal(parsed.colli, null);
    assert.equal(parsed.outcome, null);
  });

  await t.test("nota semplice pre-esistente (non JSON) -> fallback in note", () => {
    const parsed = parseProofPhotoNote("Consegnato senza problemi");
    assert.equal(parsed.note, "Consegnato senza problemi");
    assert.equal(parsed.client, null);
    assert.equal(parsed.outcome, null);
  });

  await t.test("nota vuota/assente -> tutti i campi null", () => {
    const parsed = parseProofPhotoNote(null);
    assert.deepEqual(parsed, { client: null, address: null, ddt: null, colli: null, outcome: null, note: null, driverName: null });
  });

  await t.test("JSON malformato -> fallback sicuro, nessun crash", () => {
    const parsed = parseProofPhotoNote("{not valid json");
    assert.equal(parsed.note, "{not valid json");
  });
});

test("buildPodWatermarkLines", async (t) => {
  await t.test("include tutte le righe quando i dati sono presenti", () => {
    const lines = buildPodWatermarkLines({
      takenAt: "2026-01-15T10:30:00.000Z",
      client: "Mario Rossi",
      address: "Via Roma 1",
      ddt: "DDT-1",
      colli: 2,
      outcome: "consegnato",
      driverName: "Luca Bianchi",
      lat: 45.4642,
      lng: 9.19,
    });
    assert.ok(lines.some((l) => l.includes("Mario Rossi")));
    assert.ok(lines.some((l) => l.includes("Via Roma 1")));
    assert.ok(lines.some((l) => l.includes("DDT-1")));
    assert.ok(lines.some((l) => l.includes("2 colli") === false && l.includes("Colli: 2")));
    assert.ok(lines.some((l) => l.includes("Consegnato")));
    assert.ok(lines.some((l) => l.includes("45.46420")));
    assert.ok(lines.some((l) => l.includes("Luca Bianchi")));
  });

  await t.test("campi assenti vengono omessi, nessuna riga vuota o 'undefined'", () => {
    const lines = buildPodWatermarkLines({ takenAt: "2026-01-15T10:30:00.000Z" });
    assert.equal(lines.length, 1);
    assert.ok(!lines.some((l) => l.includes("undefined") || l.includes("null")));
  });

  await t.test("coordinate mancanti -> nessuna riga GPS", () => {
    const lines = buildPodWatermarkLines({ client: "Mario Rossi" });
    assert.ok(!lines.some((l) => l.startsWith("GPS:")));
  });
});
