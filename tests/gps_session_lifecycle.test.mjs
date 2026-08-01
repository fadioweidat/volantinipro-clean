import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifySessionLifecycle } from "../src/lib/services/gps-api.js";

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

test("classifySessionLifecycle", async (t) => {
  await t.test("sessione completata non e' mai un problema di offline attuale, anche se il ping e' vecchio", () => {
    const session = { status: "completed" };
    assert.equal(classifySessionLifecycle(session, isoMinutesAgo(1)), "history");
    assert.equal(classifySessionLifecycle(session, isoMinutesAgo(60 * 24 * 40)), "history");
  });

  await t.test("sessione annullata e' storico", () => {
    assert.equal(classifySessionLifecycle({ status: "cancelled" }, isoMinutesAgo(1)), "history");
  });

  await t.test("sessione attiva con ping recente -> live", () => {
    assert.equal(classifySessionLifecycle({ status: "started" }, isoMinutesAgo(1)), "live");
  });

  await t.test("sessione attiva con ping 3 minuti fa -> warning", () => {
    assert.equal(classifySessionLifecycle({ status: "started" }, isoMinutesAgo(3)), "warning");
  });

  await t.test("sessione 'started' con ping poche ore fa -> offline_recent (problema attuale)", () => {
    assert.equal(classifySessionLifecycle({ status: "paused" }, isoMinutesAgo(60)), "offline_recent");
  });

  await t.test("sessione 'started' abbandonata da settimane -> storico, non offline attuale", () => {
    // Caso reale diagnosticato: sessioni 'started' del 2026-05-26 mai chiuse,
    // mostrate a torto come "driver offline" nel Monitor GPS Live odierno.
    assert.equal(classifySessionLifecycle({ status: "started" }, isoMinutesAgo(60 * 24 * 60)), "history");
  });

  await t.test("nessun ping mai registrato -> storico (non un'emergenza 'offline adesso' senza alcun dato)", () => {
    assert.equal(classifySessionLifecycle({ status: "started" }, null), "history");
  });
});

// Contratto sorgente: verifica che AdminLiveDashboard deduplichi per
// operatore prima di contare/mostrare i driver "offline recente", cosi' un
// singolo operatore con piu' sessioni abbandonate non gonfia il banner.
test("AdminLiveDashboard: dedup per operatore nel banner offline", async (t) => {
  const source = readFileSync("src/pages/admin/AdminLiveDashboard.jsx", "utf8");

  await t.test("filtra esplicitamente le sessioni storiche prima di contare i driver correnti", () => {
    assert.match(source, /lifecycle !== 'history'/);
  });

  await t.test("deduplica per driver_id prima del banner/lista", () => {
    assert.match(source, /dedupeByOperator/);
    assert.match(source, /item\.session\.driver_id \|\| item\.driverName/);
  });

  await t.test("il banner offline usa il conteggio deduplicato, non il totale grezzo delle sessioni", () => {
    assert.match(source, /offlineRecentCount > 0 && <Notice/);
  });
});
