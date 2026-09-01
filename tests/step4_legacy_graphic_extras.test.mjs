// Chiusura STAMPA/GRAFICA — gli extra grafica LEGACY (graphic_design, design)
// non compaiono piu' nel selettore extra del NUOVO Step4, ma restano leggibili
// e prezzati per i preventivi STORICI che li contengono.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OPTIONAL_EXTRAS_ORDER,
  SELECTED_EXTRAS_ORDER,
  LEGACY_HIDDEN_EXTRA_IDS,
  buildExtraServicesRegistry,
  buildExtraServicesById,
  buildOptionalExtras,
  normalizeSelectedExtras,
} from "../src/lib/extraServicesRegistry.js";

const registry = buildExtraServicesRegistry({ flyerQty: 10000, durationDays: 1, campaignDurationKnown: true, printConfig: {} });
const byId = buildExtraServicesById(registry);

test("LEGACY_HIDDEN_EXTRA_IDS = graphic_design + design", () => {
  assert.deepEqual([...LEGACY_HIDDEN_EXTRA_IDS].sort(), ["design", "graphic_design"]);
});

test("selettore extra nuovo Step4: nessun graphic_design / design", () => {
  const optional = buildOptionalExtras(byId);
  const ids = optional.map((e) => e.id);
  assert.ok(!ids.includes("graphic_design"), "graphic_design non deve essere proposto");
  assert.ok(!ids.includes("design"), "design non deve essere proposto");
  // e l'ordine ufficiale non li elenca piu'
  assert.ok(!OPTIONAL_EXTRAS_ORDER.includes("graphic_design"));
  assert.ok(!OPTIONAL_EXTRAS_ORDER.includes("design"));
  // gli altri extra restano invariati
  assert.ok(ids.includes("control_pro") && ids.includes("tracking_gps") && ids.includes("qr_analytics"));
});

test("difesa in profondita': buildOptionalExtras filtra i legacy anche se rientrassero nell'ordine", () => {
  // non possiamo mutare la costante congelata a runtime; verifichiamo che il
  // filtro sia esplicito su LEGACY_HIDDEN_EXTRA_IDS
  const optional = buildOptionalExtras(byId);
  for (const legacy of LEGACY_HIDDEN_EXTRA_IDS) {
    assert.ok(!optional.some((e) => e.id === legacy || e.addId === legacy));
  }
});

test("registry: graphic_design e design ESISTONO ancora (compat storica)", () => {
  assert.ok(byId.graphic_design, "graphic_design deve restare nel registry");
  assert.ok(byId.design, "design deve restare nel registry");
  assert.equal(byId.graphic_design.price, 79);
  assert.equal(byId.design.price, 49);
  // restano anche nell'ordine delle voci gia' selezionate (rendering storico)
  assert.ok(SELECTED_EXTRAS_ORDER.includes("graphic_design"));
  assert.ok(SELECTED_EXTRAS_ORDER.includes("design"));
});

test("preventivo STORICO con graphic_design selezionato -> ancora letto e prezzato", () => {
  const historical = { extraServices: ["graphic_design"] };
  const rows = normalizeSelectedExtras(historical, byId);
  const g = rows.find((r) => r.id === "graphic_design");
  assert.ok(g, "un preventivo storico con graphic_design deve ancora comparire nel riepilogo");
  assert.equal(g.price, 79);
});

test("preventivo STORICO con id legacy 'grafica' / 'grafica_progetto' -> mappato", () => {
  // design.legacyIds include 'grafica' e 'preparazione_grafica'
  const histDesign = { printServices: ["grafica"] };
  const rowsD = normalizeSelectedExtras(histDesign, byId);
  assert.ok(rowsD.some((r) => r.id === "design" && r.price === 49));

  // graphic_design.legacyIds include 'grafica_progetto'
  const histGd = { extraServices: ["grafica_progetto"] };
  const rowsG = normalizeSelectedExtras(histGd, byId);
  assert.ok(rowsG.some((r) => r.id === "graphic_design" && r.price === 79));
});

test("nuovo preventivo (nessun extra grafica selezionato) -> nessuna riga graphic_design/design", () => {
  const fresh = { extraServices: ["tracking_gps"], printServices: [], printing: { selected: true, artwork: { required: true, selected: true, price: 79 } } };
  const rows = normalizeSelectedExtras(fresh, byId);
  assert.ok(!rows.some((r) => r.id === "graphic_design" || r.id === "design"),
    "la grafica del nuovo flusso passa da data.printing.artwork.*, non dagli extra legacy");
});
