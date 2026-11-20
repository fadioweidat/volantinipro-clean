// Prova GPS 2 telefoni (2026-11-20): con una sola zona, appena il caposquadra
// la avviava la zona era "In corso" per tutti e il secondo telefono del gruppo
// vedeva solo "In corso su un altro dispositivo", senza pulsante. Il server
// (gps_start_session_v3) permette invece una seconda sessione sulla stessa
// zona da un altro dispositivo del gruppo. Inoltre la pagina non passava a
// DriverZoneProgram quale zona sta tracciando QUESTO telefono: anche il
// telefono attivo non vedeva "Termina".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DriverZoneProgram } from "../src/components/driver/DriverZoneProgram.jsx";
import { computeZoneWorkflow } from "../src/lib/driver/zoneWorkflow.js";

const zone = { id: "ac209316-ac1b-40fd-8e79-01c3a6f39700", zone_name: "BRUZZANO", status: "In corso", quantity: 100 };

function render(props) {
  const wf = computeZoneWorkflow([zone], props.sessionZoneId ?? null, Boolean(props.deviceTrackingActive));
  return renderToStaticMarkup(React.createElement(DriverZoneProgram, {
    zones: [zone], stateOf: wf.stateOf, onStart: () => {}, onComplete: () => {}, onOpenMap: () => {},
    currentDeviceZoneId: props.sessionZoneId ?? null,
    deviceTrackingActive: Boolean(props.deviceTrackingActive),
    canJoinInProgress: Boolean(props.canJoinInProgress),
  }));
}

test("il telefono che traccia la zona vede Termina, non 'altro dispositivo'", () => {
  const html = render({ sessionZoneId: zone.id, deviceTrackingActive: true });
  assert.match(html, /Termina BRUZZANO/);
  assert.doesNotMatch(html, /In corso su un altro dispositivo/);
  assert.doesNotMatch(html, /Inizia anche tu/);
});

test("secondo telefono del gruppo senza sessione: 'Inizia anche tu' sulla zona gia' In corso", () => {
  const html = render({ canJoinInProgress: true });
  assert.match(html, /Inizia anche tu/);
  assert.doesNotMatch(html, /In corso su un altro dispositivo/);
  assert.doesNotMatch(html, /Termina BRUZZANO/);
});

test("unione non permessa (es. stessa assegnazione attiva altrove): resta il messaggio, nessun pulsante", () => {
  const html = render({ canJoinInProgress: false });
  assert.match(html, /In corso su un altro dispositivo/);
  assert.doesNotMatch(html, /Inizia anche tu/);
});

test("pagina Driver: passa zona e stato del dispositivo; unione solo senza sessione propria, non revocata, non attiva altrove", () => {
  const page = fs.readFileSync(new URL("../src/pages/driver/DriverAssignmentPage.jsx", import.meta.url), "utf8");
  assert.match(page, /currentDeviceZoneId=\{tracking\.session\?\.campaign_zone_id \|\| null\}/);
  assert.match(page, /deviceTrackingActive=\{Boolean\(tracking\.isActive \|\| tracking\.isPaused\)\}/);
  assert.match(page, /const canJoinZoneInProgress = !tracking\.isActive && !tracking\.isPaused && !activeSessionElsewhere && !isRevoked;/);
  assert.match(page, /canJoinInProgress=\{canJoinZoneInProgress\}/);
  // startZone invariato: un telefono con sessione propria non ne apre una seconda.
  assert.match(page, /Questo telefono sta già lavorando su/);
});
