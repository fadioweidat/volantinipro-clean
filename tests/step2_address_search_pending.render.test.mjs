// Ricerca civica in corso (2026-11-09): la Preview mostrava "Civico non
// verificato" per Via Antonio Oroboni 10 mentre Mapbox e lo stradario del Comune
// erano ancora in volo (lista vuota o della digitazione precedente), e un Invio in
// quella finestra chiudeva il menu senza selezionare nulla.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Step2TerritoryControlsPanel } from "../src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx";

const noop = () => {};
const OROBONI_VERIFIED = {
  id: "comune-milano:1635:10", name: "Via Antonio Oroboni 10, Milano", label: "Via Antonio Oroboni 10",
  fullName: "Via Antonio Oroboni 10, Milano, Lombardia, Italia", street: "Via Antonio Oroboni", houseNumber: "10",
  city: "Milano", comune: "Milano", parentComune: "Milano", lat: 45.528897, lng: 9.172024,
  placeType: "address", precision: "address", source: "comune_milano", verification: "official_registry",
};
const render = props => renderToStaticMarkup(React.createElement(Step2TerritoryControlsPanel, new Proxy({
  search: "Via Antonio Oroboni 10, Milano", searchMode: "municipality", dropOpen: true, activeAreaTab: "comune",
  geocodeSuggestions: [], capSuggestions: [], campaignZones: [], selectedComuni: [], selectedCaps: [], zonesInRadius: [],
  data: { campaignZones: [] }, hiddenBoundaries: {}, activeZoneId: "pv1", radiusKm: 1,
  pill: () => ({}), getCampaignZoneLabel: () => "Punto vendita 1", col: "#E8571A", svcType: "d2d",
  ...props,
}, { get: (t, k) => (k in t ? t[k] : (typeof k === "string" && /^(set|on|select|switch|handle|start|resolve|update|reset|append|remove|rename|delete)/.test(k) ? noop : undefined)) })));

test("verifica in corso: stato di caricamento, mai 'civico non verificato' prima della risposta", () => {
  const html = render({ geocodePending: true });
  assert.match(html, /Verifica dell&#x27;indirizzo in corso/);
  assert.doesNotMatch(html, /[Cc]ivico non verificato/);
});

test("verifica in corso: i risultati di una digitazione precedente non sono mostrati", () => {
  const stale = { ...OROBONI_VERIFIED, id: "old", name: "Via Antonio Oroboni 1, Milano", houseNumber: "1" };
  const html = render({ geocodePending: true, geocodeSuggestions: [stale] });
  assert.doesNotMatch(html, /Oroboni 1,/);
  assert.match(html, /Verifica dell&#x27;indirizzo in corso/);
});

test("risposta arrivata: Oroboni 10 verificato selezionabile, nessun avviso", () => {
  const html = render({ geocodePending: false, geocodeSuggestions: [OROBONI_VERIFIED] });
  assert.match(html, /civico verificato · stradario Comune di Milano/);
  assert.doesNotMatch(html, /Numero civico non verificato|Verifica dell&#x27;indirizzo in corso/);
});

test("risposta arrivata senza civico: l'avviso resta (comportamento invariato)", () => {
  const html = render({ geocodePending: false, geocodeSuggestions: [] });
  assert.match(html, /Civico non verificato/);
});

test("Invio durante la verifica: rimandato alla risposta per lo stesso testo e lo stesso PV", () => {
  const panel = fs.readFileSync(new URL("../src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx", import.meta.url), "utf8");
  const step2 = fs.readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8");
  assert.match(panel, /if \(geocodePending\) \{\s+pendingEnterSearchRef\.current = \{ search, zoneId: activeZoneId \|\| null \};\s+setDropOpen\(true\);\s+return;/);
  assert.match(panel, /requested\.search !== search \|\| requested\.zoneId !== \(activeZoneId \|\| null\)/);
  assert.match(step2, /setGeocodeResolvedFor\(\{ search, zoneId: requestZoneId \}\)/);
  // Testo riscritto identico dopo averlo cancellato: la lista e' vuota, la verifica riparte.
  assert.match(step2, /useEffect\(\(\) => \{\r?\n(?:\s*\/\/.*\r?\n)*\s*setGeocodeResolvedFor\(null\);\r?\n\s*if \(!search \|\| search\.length < 2\) \{/);
  assert.match(step2, /geocodePending=\{searchMode !== "cap" && String\(search \|\| ""\)\.length >= 2 && !\(geocodeResolvedFor && geocodeResolvedFor\.search === search && geocodeResolvedFor\.zoneId === \(data\.activeZoneId \|\| null\)\)\}/);
});
