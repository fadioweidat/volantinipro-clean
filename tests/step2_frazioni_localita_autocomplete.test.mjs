import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLocationResult,
  rankLocationResults,
  extractItalianProvinceCode,
  classifyLocationType,
} from "../src/lib/geo/normalizeLocationResult.js";
import { getMunicipalityDedupKey, normalizeMunicipalityName } from "../src/lib/step2/addressIntent.js";

test("extractItalianProvinceCode resolves standard codes and full names", () => {
  assert.equal(extractItalianProvinceCode("Milano", "IT-MI"), "MI");
  assert.equal(extractItalianProvinceCode("Città metropolitana di Milano", null, "Milano"), "MI");
  assert.equal(extractItalianProvinceCode("Firenze", "IT-FI"), "FI");
  assert.equal(extractItalianProvinceCode("Catania", "IT-CT"), "CT");
  assert.equal(extractItalianProvinceCode("Verona", "IT-VR"), "VR");
  assert.equal(extractItalianProvinceCode("Monza e Brianza", "IT-MB"), "MB");
  assert.equal(extractItalianProvinceCode("Roma", "IT-RM"), "RM");
});

test("classifyLocationType correctly identifies frazioni, quartieri, and comuni", () => {
  assert.equal(classifyLocationType("hamlet", true), "frazione");
  assert.equal(classifyLocationType("village", true), "frazione");
  assert.equal(classifyLocationType("suburb", true), "quartiere");
  assert.equal(classifyLocationType("quarter", true), "quartiere");
  assert.equal(classifyLocationType("locality", true), "localita");
  assert.equal(classifyLocationType("city", false), "comune");
  assert.equal(classifyLocationType("municipality", false), "comune");
});

test("Nominatim normalization: Palazzolo Milanese -> Paderno Dugnano (MI)", () => {
  const rawNominatim = {
    place_id: 12345,
    osm_id: 67890,
    lat: "45.5721",
    lon: "9.1624",
    display_name: "Palazzolo Milanese, Paderno Dugnano, Milano, Lombardia, 20037, Italia",
    addresstype: "suburb",
    address: {
      suburb: "Palazzolo Milanese",
      city: "Paderno Dugnano",
      county: "Milano",
      "ISO3166-2-lvl6": "IT-MI",
      state: "Lombardia",
      postcode: "20037",
      country: "Italia",
    },
  };

  const normalized = normalizeLocationResult(rawNominatim, "nominatim");

  assert.equal(normalized.comune, "Paderno Dugnano");
  assert.equal(normalized.provincia, "MI");
  assert.equal(normalized.localita, "Palazzolo Milanese");
  assert.equal(normalized.cap, "20037");
  assert.equal(normalized.displayName, "Palazzolo Milanese — Paderno Dugnano (MI)");
  assert.equal(normalized.type, "quartiere");
  assert.equal(normalized.source, "nominatim");
  assert.equal(normalized.lat, 45.5721);
  assert.equal(normalized.lng, 9.1624);
  // Official municipality preserved
  assert.notEqual(normalized.comune, "Palazzolo Milanese");
  assert.equal(normalizeMunicipalityName(normalized.comune), "paderno dugnano");
});

test("Mapbox normalization: Palazzolo -> Paderno Dugnano (MI)", () => {
  const rawMapbox = {
    id: "locality.1111",
    text: "Palazzolo Milanese",
    place_name: "Palazzolo Milanese, Paderno Dugnano, Milano, Italia",
    place_type: ["locality"],
    center: [9.1624, 45.5721],
    context: [
      { id: "place.2222", text: "Paderno Dugnano" },
      { id: "region.3333", short_code: "IT-MI", text: "Lombardia" },
      { id: "postcode.4444", text: "20037" },
    ],
  };

  const normalized = normalizeLocationResult(rawMapbox, "mapbox");

  assert.equal(normalized.comune, "Paderno Dugnano");
  assert.equal(normalized.provincia, "MI");
  assert.equal(normalized.localita, "Palazzolo Milanese");
  assert.equal(normalized.cap, "20037");
  assert.equal(normalized.displayName, "Palazzolo Milanese — Paderno Dugnano (MI)");
  assert.equal(normalized.type, "localita");
  assert.equal(normalized.source, "mapbox");
  assert.equal(normalized.lat, 45.5721);
  assert.equal(normalized.lng, 9.1624);
});

test("Disambiguation across multiple Italian provinces for 'Palazzolo'", () => {
  const rawList = [
    {
      display_name: "Palazzolo Milanese, Paderno Dugnano, Milano, Lombardia, Italia",
      lat: "45.5721",
      lon: "9.1624",
      addresstype: "suburb",
      address: { suburb: "Palazzolo Milanese", city: "Paderno Dugnano", county: "Milano", "ISO3166-2-lvl6": "IT-MI" },
    },
    {
      display_name: "Palazzolo, Figline e Incisa Valdarno, Firenze, Toscana, Italia",
      lat: "43.6450",
      lon: "11.4560",
      addresstype: "hamlet",
      address: { hamlet: "Palazzolo", town: "Figline e Incisa Valdarno", county: "Firenze", "ISO3166-2-lvl6": "IT-FI" },
    },
    {
      display_name: "Palazzolo, Belpasso, Catania, Sicilia, Italia",
      lat: "37.5890",
      lon: "14.9870",
      addresstype: "hamlet",
      address: { hamlet: "Palazzolo", town: "Belpasso", county: "Catania", "ISO3166-2-lvl6": "IT-CT" },
    },
    {
      display_name: "Palazzolo, Sona, Verona, Veneto, Italia",
      lat: "45.4320",
      lon: "10.8210",
      addresstype: "hamlet",
      address: { hamlet: "Palazzolo", municipality: "Sona", county: "Verona", "ISO3166-2-lvl6": "IT-VR" },
    },
    {
      display_name: "Palazzolo sull'Oglio, Brescia, Lombardia, Italia",
      lat: "45.5980",
      lon: "9.8840",
      addresstype: "city",
      address: { city: "Palazzolo sull'Oglio", county: "Brescia", "ISO3166-2-lvl6": "IT-BS" },
    },
  ];

  const normalizedList = rawList.map((r) => normalizeLocationResult(r, "nominatim"));

  assert.equal(normalizedList[0].displayName, "Palazzolo Milanese — Paderno Dugnano (MI)");
  assert.equal(normalizedList[0].comune, "Paderno Dugnano");
  assert.equal(normalizedList[0].provincia, "MI");

  assert.equal(normalizedList[1].displayName, "Palazzolo — Figline e Incisa Valdarno (FI)");
  assert.equal(normalizedList[1].comune, "Figline e Incisa Valdarno");
  assert.equal(normalizedList[1].provincia, "FI");

  assert.equal(normalizedList[2].displayName, "Palazzolo — Belpasso (CT)");
  assert.equal(normalizedList[2].comune, "Belpasso");
  assert.equal(normalizedList[2].provincia, "CT");

  assert.equal(normalizedList[3].displayName, "Palazzolo — Sona (VR)");
  assert.equal(normalizedList[3].comune, "Sona");
  assert.equal(normalizedList[3].provincia, "VR");

  assert.equal(normalizedList[4].displayName, "Palazzolo sull'Oglio (BS)");
  assert.equal(normalizedList[4].comune, "Palazzolo sull'Oglio");
  assert.equal(normalizedList[4].provincia, "BS");
  assert.equal(normalizedList[4].type, "comune");
});

test("Ranking algorithm orders by exact match, locality+comune query, and prefix", () => {
  const items = [
    {
      displayName: "Palazzolo sull'Oglio (BS)",
      comune: "Palazzolo sull'Oglio",
      localita: null,
      provincia: "BS",
      type: "comune",
    },
    {
      displayName: "Palazzolo Milanese — Paderno Dugnano (MI)",
      comune: "Paderno Dugnano",
      localita: "Palazzolo Milanese",
      provincia: "MI",
      type: "frazione",
    },
    {
      displayName: "Palazzolo — Figline e Incisa Valdarno (FI)",
      comune: "Figline e Incisa Valdarno",
      localita: "Palazzolo",
      provincia: "FI",
      type: "frazione",
    },
  ];

  // Query: "Palazzolo" -> exact locality match gets high score
  const rankedGeneral = rankLocationResults(items, "Palazzolo");
  assert.equal(rankedGeneral[0].localita, "Palazzolo");

  // Query: "Palazzolo Paderno" -> multi-token matches locality and comune
  const rankedPaderno = rankLocationResults(items, "Palazzolo Paderno");
  assert.equal(rankedPaderno[0].comune, "Paderno Dugnano");
  assert.equal(rankedPaderno[0].provincia, "MI");

  // Query: "Palazzolo MI" -> multi-token matches locality and province
  const rankedMi = rankLocationResults(items, "Palazzolo MI");
  assert.equal(rankedMi[0].provincia, "MI");

  // Query: "Palazzolo FI" -> multi-token matches locality and province
  const rankedFi = rankLocationResults(items, "Palazzolo FI");
  assert.equal(rankedFi[0].provincia, "FI");
});

test("5 Real Italian frazioni across different municipalities", () => {
  const cases = [
    {
      raw: {
        display_name: "Passirana, Rho, Milano, Lombardia, Italia",
        lat: "45.5410",
        lon: "9.0520",
        addresstype: "hamlet",
        address: { hamlet: "Passirana", city: "Rho", county: "Milano", "ISO3166-2-lvl6": "IT-MI" },
      },
      expectedComune: "Rho",
      expectedLocalita: "Passirana",
      expectedProvincia: "MI",
    },
    {
      raw: {
        display_name: "Cassina Nuova, Bollate, Milano, Lombardia, Italia",
        lat: "45.5530",
        lon: "9.1310",
        addresstype: "hamlet",
        address: { hamlet: "Cassina Nuova", city: "Bollate", county: "Milano", "ISO3166-2-lvl6": "IT-MI" },
      },
      expectedComune: "Bollate",
      expectedLocalita: "Cassina Nuova",
      expectedProvincia: "MI",
    },
    {
      raw: {
        display_name: "Redecesio, Segrate, Milano, Lombardia, Italia",
        lat: "45.4870",
        lon: "9.2780",
        addresstype: "suburb",
        address: { suburb: "Redecesio", city: "Segrate", county: "Milano", "ISO3166-2-lvl6": "IT-MI" },
      },
      expectedComune: "Segrate",
      expectedLocalita: "Redecesio",
      expectedProvincia: "MI",
    },
    {
      raw: {
        display_name: "Mirasole, Opera, Milano, Lombardia, Italia",
        lat: "45.3920",
        lon: "9.2080",
        addresstype: "hamlet",
        address: { hamlet: "Mirasole", city: "Opera", county: "Milano", "ISO3166-2-lvl6": "IT-MI" },
      },
      expectedComune: "Opera",
      expectedLocalita: "Mirasole",
      expectedProvincia: "MI",
    },
    {
      raw: {
        display_name: "San Fruttuoso, Monza, Monza e Brianza, Lombardia, Italia",
        lat: "45.5780",
        lon: "9.2430",
        addresstype: "suburb",
        address: { suburb: "San Fruttuoso", city: "Monza", county: "Monza e Brianza", "ISO3166-2-lvl6": "IT-MB" },
      },
      expectedComune: "Monza",
      expectedLocalita: "San Fruttuoso",
      expectedProvincia: "MB",
    },
  ];

  for (const c of cases) {
    const res = normalizeLocationResult(c.raw, "nominatim");
    assert.equal(res.comune, c.expectedComune);
    assert.equal(res.localita, c.expectedLocalita);
    assert.equal(res.provincia, c.expectedProvincia);
    assert.equal(res.displayName, `${c.expectedLocalita} — ${c.expectedComune} (${c.expectedProvincia})`);
  }
});

test("Dedup key logic handles frazione vs official municipality without collisions", () => {
  const palazzolo = {
    displayName: "Palazzolo Milanese — Paderno Dugnano (MI)",
    comune: "Paderno Dugnano",
    localita: "Palazzolo Milanese",
    provincia: "MI",
  };

  const paderno = {
    displayName: "Paderno Dugnano (MI)",
    comune: "Paderno Dugnano",
    localita: null,
    provincia: "MI",
  };

  // Both point to the same official municipality dedup key
  const keyPalazzolo = getMunicipalityDedupKey(palazzolo);
  const keyPaderno = getMunicipalityDedupKey(paderno);

  assert.equal(keyPalazzolo, keyPaderno);
  assert.equal(keyPalazzolo, "paderno dugnano_mi");
});
