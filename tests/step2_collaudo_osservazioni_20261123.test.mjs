// Osservazioni del collaudo Fase 2 (2026-11-23), gia' presenti prima della Fase 2.
// 1. Punto manuale su PV nuovo: la mappa mostrava l'Italia intera.
// 2. Punto manuale: il comune era sempre "Milano".
// 3. Reset zona: il pannello Copertura mostrava ancora la zona precedente.
// 4. Barra del punto manuale sopra i pulsanti dello zoom.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { reverseGeocodeComune } from "../src/lib/step2/reverseComune.js";

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const step2 = read("src/pages/public/configurator/Step2.jsx");
const mapPanel = read("src/pages/public/configurator/step2/Step2MapPanel.jsx");
const map = read("src/components/Step2Map.jsx");

const res = body => ({ ok: true, json: async () => body });

test("1: senza comune, in modalita punto manuale la mappa inquadra Milano", () => {
  assert.match(mapPanel, /const MANUAL_PIN_FALLBACK_VIEW = \{ lat: 45\.4642, lng: 9\.19, zoom: 12 \};/);
  assert.match(mapPanel, /fallbackView=\{manualPinMode && !mapCityForStep2 \? MANUAL_PIN_FALLBACK_VIEW : null\}/);
  assert.match(map, /fallbackView = null,/);
  assert.match(map, /if \(!map \|\| !leafletLoaded \|\| city \|\| !fallbackView\) return;/);
});

test("2: reverse comune da Mapbox, poi Nominatim, altrimenti null", async () => {
  const calls = [];
  const viaMapbox = await reverseGeocodeComune({ lat: 45.53, lng: 9.2, mapboxToken: "t", fetchImpl: async url => { calls.push(url); return res({ features: [{ text: "Bresso" }] }); } });
  assert.deepEqual(viaMapbox, { name: "Bresso", source: "mapbox" });
  assert.match(calls[0], /mapbox\.places\/9\.2,45\.53\.json\?.*types=place&country=IT/);

  const viaNominatim = await reverseGeocodeComune({ lat: 45.53, lng: 9.2, mapboxToken: "t", fetchImpl: async url => url.includes("mapbox") ? res({ features: [] }) : res({ address: { town: "Cormano" } }) });
  assert.deepEqual(viaNominatim, { name: "Cormano", source: "nominatim" });

  const none = await reverseGeocodeComune({ lat: 45.53, lng: 9.2, fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(none, null);
  assert.equal(await reverseGeocodeComune({ lat: "x", lng: 9 }), null);
});

test("2: il punto manuale usa il comune delle coordinate, mai per un altro PV", () => {
  const handler = step2.slice(step2.indexOf("async function handleManualMapClick(coords)"), step2.indexOf("async function selectAddressPointInMilano("));
  assert.match(handler, /const reverse = await reverseGeocodeComune\(\{ lat, lng, mapboxToken: import\.meta\.env\.VITE_MAPBOX_TOKEN \}\);/);
  assert.ok(handler.indexOf("if (activeZoneIdRef.current !== ownerZoneId) return;") < handler.indexOf("setSelectedSearchPoint(point);"));
  assert.match(handler, /const parentComune = reverseName\n\s*\? \(isMilanoName\(reverseName\) \? "Milano" : reverseName\)\n\s*: \(isMilanoName\(currentCityName\) \? "Milano" : currentCityName \|\| "Milano"\);/);
  assert.match(handler, /if \(city && !reverseName\) return;/);
  assert.match(handler, /setCity\(pointCity\);\n\s*setSelectedComuni\(\[pointCity\]\);/);
});

test("3: Reset zona azzera l'indirizzo di copertura del PV e quello generale", () => {
  const reset = step2.slice(step2.indexOf("const resetActiveZone = () => {"), step2.indexOf("const handleDuplicateZone ="));
  assert.match(reset, /coverage: \{ \.\.\.\(zone\.coverage \|\| \{\}\), address: null \}/);
  assert.match(reset, /coverage: \{ \.\.\.\(prev\.coverage \|\| \{\}\), address: null \}/);
});

test("4: la barra del punto manuale non copre lo zoom", () => {
  const banner = mapPanel.slice(mapPanel.indexOf("{manualPinMode && <div style={{"), mapPanel.indexOf("Annulla"));
  assert.match(banner, /left: 52,/);
});
