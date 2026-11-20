// Monitor GPS /admin/live (2026-11-20, prova 2 telefoni):
// 1) caposquadra mostrato "Operatore 8b01fd" -> nome reale dall'assegnazione;
// 2) copertura zona "Dato non disponibile" anche con sessioni calcolate ->
//    "almeno X%" dalle sessioni GPS (annullate escluse).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveOperatorDisplayName, sessionCoverageByZone } from "../src/lib/gps/operatorDisplayName.js";
import { displayDriverName } from "../src/lib/services/gps-api.js";
import { ZoneProgressPanel } from "../src/components/zone-progress/ZoneProgressPanel.jsx";

const capo = { id: "8b01fd60-3902-45c6-8b24-e4057bb8bce6", operator_id: null, group_access_link_id: null, participant_label: null, metadata: { supplier_name: "postini pubblicitari" } };
const op4 = { id: "287e6c96-0000-0000-0000-000000000000", operator_id: null, group_access_link_id: "26f5e12e", participant_label: "OP 4", metadata: {} };

test("caposquadra (assegnazione personale senza operatore): referente del gruppo · Caposquadra", () => {
  assert.equal(resolveOperatorDisplayName({ assignment: capo, group: { lead_name: "Fadi oweidat" } }), "Fadi oweidat · Caposquadra");
  // senza referente: fornitore, mai un nome inventato
  assert.equal(resolveOperatorDisplayName({ assignment: capo, group: null }), "postini pubblicitari · Caposquadra");
  assert.equal(resolveOperatorDisplayName({ assignment: { ...capo, metadata: {} }, group: null }), "Nome non disponibile · 8b01fd · Caposquadra");
});

test("partecipante dal link di gruppo: etichetta OP n; operatore con profilo: nome del profilo", () => {
  assert.equal(resolveOperatorDisplayName({ assignment: op4, group: { lead_name: "Fadi oweidat" } }), "OP 4");
  assert.equal(resolveOperatorDisplayName({ assignment: { id: "x", operator_id: "u1" }, profileName: "Mario Rossi" }), "Mario Rossi");
  assert.equal(resolveOperatorDisplayName({ fallbackId: "abcdef123" }), "Nome non disponibile · abcdef");
});

test("displayDriverName: driver_name esplicito vince, poi il nome risolto, poi Operatore <id>", () => {
  assert.equal(displayDriverName({ driver_id: "8b01fd60x", operator_display_name: "Fadi oweidat · Caposquadra" }), "Fadi oweidat · Caposquadra");
  assert.equal(displayDriverName({ driver_name: "Luca", operator_display_name: "OP 4" }), "Luca");
  assert.equal(displayDriverName({ driver_id: "8b01fd60x" }), "Operatore 8b01fd");
});

test("copertura dalle sessioni: massimo delle sessioni pronte, annullate escluse", () => {
  const map = sessionCoverageByZone([
    { campaign_zone_id: "z1", coverage_percent: "0.25", calculation_status: "ready", session_status: "started" },
    { campaign_zone_id: "z1", coverage_percent: "8.84", calculation_status: "ready", session_status: "cancelled" },
    { campaign_zone_id: "z1", coverage_percent: "3.1", calculation_status: "ready", session_status: "completed" },
    { campaign_zone_id: "z2", coverage_percent: "50", calculation_status: "zone_geometry_missing", session_status: "started" },
  ]);
  assert.deepEqual(map.get("z1"), { percent: 3.1, sessions: 2 });
  assert.equal(map.has("z2"), false);
});

test("pannello zone: senza valore della zona mostra '≥ X%' dalle sessioni; con valore usa quello", () => {
  const zone = { campaign_zone_id: "z1", zone_name: "BRUZZANO", effective_percent: null, updated_at: null };
  const withFallback = renderToStaticMarkup(React.createElement(ZoneProgressPanel, { zones: [zone], isAdmin: true, sessionCoverageByZone: new Map([["z1", { percent: 0.25, sessions: 1 }]]) }));
  assert.match(withFallback, /≥ 0,25%/);
  assert.match(withFallback, /Dalle sessioni GPS \(1\): almeno 0,25%/);
  const without = renderToStaticMarkup(React.createElement(ZoneProgressPanel, { zones: [zone], isAdmin: true }));
  assert.match(without, /Dato non disponibile/);
  const real = renderToStaticMarkup(React.createElement(ZoneProgressPanel, { zones: [{ ...zone, effective_percent: 40 }], isAdmin: true, sessionCoverageByZone: new Map([["z1", { percent: 0.25, sessions: 1 }]]) }));
  assert.match(real, /40%/);
  assert.doesNotMatch(real, /Dalle sessioni GPS/);
});

test("dashboard live: arricchisce le sessioni con i nomi e passa la copertura sessioni al pannello", () => {
  const page = fs.readFileSync(new URL("../src/pages/admin/AdminLiveDashboard.jsx", import.meta.url), "utf8");
  assert.match(page, /const drivers = await enrichSessionsWithOperatorNames\(supabase, summaries\);/);
  assert.match(page, /fetchZoneSessionCoverage\(supabase, selectedCampaignId\)/);
  assert.match(page, /sessionCoverageByZone=\{zoneSessionCoverage\}/);
});
