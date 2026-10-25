// 2026-10-25 (approved, app only): Monitor GPS draws radius zones (no polygon, no municipality in
// the name) as a circle and computes inside/outside on it; open Traccar (Piano B) sessions without
// recent points read "Fermo o senza segnale" instead of offline, explained in the Piano B panel.
// Collaudo 25/10: zone "Zona collaudo" 45.5289042, 9.1675836, radius 500 m showed "Zona non disponibile".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveLiveZoneStatus, estimateDistanceToZoneBoundaryMeters, radiusZoneFromRow } from "../src/lib/geofence/geofenceEngine.js";
import { openTraccarSessionIds, traccarAwareLifecycle, TRACCAR_IDLE_LABEL, TRACCAR_IDLE_LIFECYCLE } from "../src/lib/gps/traccarIdle.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const collaudo = { id: "z1", zone_name: "Zona collaudo", center_lat: "45.5289042", center_lng: "9.1675836", radius_m: 500 };

test("radius zone: built only from a saved center and radius", () => {
  assert.deepEqual(radiusZoneFromRow(collaudo), { kind: "circle", id: "z1", zoneName: "Zona collaudo", centerLat: 45.5289042, centerLng: 9.1675836, radiusKm: 0.5 });
  assert.equal(radiusZoneFromRow({ ...collaudo, radius_m: null }), null);
  assert.equal(radiusZoneFromRow({ ...collaudo, radius_m: 0 }), null);
  assert.equal(radiusZoneFromRow({ ...collaudo, center_lat: null }), null);
});

test("radius zone: inside / near border / outside on the collaudo circle", () => {
  const zones = [radiusZoneFromRow(collaudo)];
  assert.equal(deriveLiveZoneStatus(zones, 45.5289042, 9.1675836), "inside");
  assert.equal(deriveLiveZoneStatus(zones, 45.5289042 + 0.0045, 9.1675836), "near_border"); // ~500 m north
  assert.equal(deriveLiveZoneStatus(zones, 45.5289042 + 0.0135, 9.1675836), "outside"); // ~1.5 km north
  assert.equal(Math.round(estimateDistanceToZoneBoundaryMeters(zones, 45.5289042 + 0.0135, 9.1675836) / 100), 10);
  assert.equal(deriveLiveZoneStatus([], 45.5, 9.1), "zone_unavailable");
});

test("Monitor: circle only when the boundary search failed, drawn and used for inside/outside", () => {
  const hook = read("src/hooks/useZoneBoundaries.js");
  assert.match(hook, /\.select\('id, zone_name, center_lat, center_lng, radius_m, polygon_geojson, priority'\)/);
  assert.match(hook, /if \(!geometry\) \{ markUnresolved\(zone\.id\); return; \}/);
  assert.match(hook, /\.filter\(\(zone\) => !resolvedBoundaries\[zone\.id\] && unresolvedZoneIds\.has\(zone\.id\)\)/);
  const page = read("src/pages/admin/AdminLiveDashboard.jsx");
  assert.match(page, /\.\.\.Object\.values\(resolvedBoundaries\)\.filter\(Boolean\)\.map\(\(geometry\) => \(\{ kind: 'polygon', geometry \}\)\),\n      \.\.\.radiusZones,/);
  assert.match(page, /<Circle key=\{zone\.id\} center=\{\[zone\.centerLat, zone\.centerLng\]\} radius=\{zone\.radiusKm \* 1000\}/);
  assert.match(page, /zones=\{mapZones\} circles=\{radiusZones\}/);
});

test("Traccar: open Piano B sessions only, and only warning/offline become 'Fermo o senza segnale'", () => {
  const now = Date.parse("2026-10-25T16:45:00Z");
  const ids = openTraccarSessionIds([
    { id: "open", status: "started", enabled: true, enabled_until: "2026-10-25T17:33:00Z" },
    { id: "expired", status: "started", enabled: true, enabled_until: "2026-10-25T16:00:00Z" },
    { id: "disabled", status: "started", enabled: false, enabled_until: "2026-10-25T17:33:00Z" },
    { id: "closed", status: "completed", enabled: true, enabled_until: "2026-10-25T17:33:00Z" },
  ], now);
  assert.deepEqual([...ids], ["open"]);
  assert.equal(traccarAwareLifecycle("offline_recent", "open", ids), TRACCAR_IDLE_LIFECYCLE);
  assert.equal(traccarAwareLifecycle("warning", "open", ids), TRACCAR_IDLE_LIFECYCLE);
  assert.equal(traccarAwareLifecycle("live", "open", ids), "live");
  assert.equal(traccarAwareLifecycle("history", "open", ids), "history");
  assert.equal(traccarAwareLifecycle("offline_recent", "app-driver", ids), "offline_recent");
  assert.equal(TRACCAR_IDLE_LABEL, "Fermo o senza segnale");
});

test("Monitor + Piano B panel: label, not counted as offline, explanation", () => {
  const page = read("src/pages/admin/AdminLiveDashboard.jsx");
  assert.match(page, /\[TRACCAR_IDLE_LIFECYCLE\]: TRACCAR_IDLE_LABEL,/);
  assert.match(page, /traccarAdminControl\('list'\)\n          \.then\(\(result\) => \{ if \(!cancelled\) setTraccarIds\(openTraccarSessionIds\(result\.sessions\)\); \}\)\n          \.catch\(\(\) => \{\}\);/);
  assert.match(page, /const offlineRecentCount = currentRows\.filter\(\(item\) => item\.lifecycle === 'offline_recent'\)\.length;/);
  assert.match(page, /selectedItem\.lifecycle === TRACCAR_IDLE_LIFECYCLE \? TRACCAR_IDLE_LABEL : 'Offline'/);
  const panel = read("src/pages/admin/TraccarBackupPanel.jsx");
  assert.match(panel, /Pausa da fermo: quando l’operatore resta fermo Traccar Client va in pausa \(nel registro dell’app «StationaryEnter»\)/);
  assert.match(panel, /Nel Monitor GPS la sessione appare «\{TRACCAR_IDLE_LABEL\}»: non è un guasto\./);
});
