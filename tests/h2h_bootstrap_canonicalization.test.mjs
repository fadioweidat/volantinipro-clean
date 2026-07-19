import assert from 'node:assert/strict';
import {
  canonicalizeItalianMunicipalityName,
  normalizeNominatimGeocodeResult,
  normalizeNominatimH2HBootstrapPoint,
} from '../src/lib/geocoding/canonicalizeItalianMunicipalityName.js';
import { buildStep2ToStep3Payload, buildStep2TruthModel } from '../src/lib/step2/buildStep2TruthModel.js';

const nominatimMilanPoint = {
  place_id: 75824009,
  lat: '45.4637225',
  lon: '9.189263',
  addresstype: 'road',
  display_name: 'Piazza del Duomo, Cinque Vie, Milan, Lombardy, Italy',
  address: {
    road: 'Piazza del Duomo',
    city: 'Milan',
    county: 'Milan',
    state: 'Lombardy',
    postcode: '20122',
    country: 'Italy',
    country_code: 'it',
  },
};

const rawBootstrapPoint = normalizeNominatimH2HBootstrapPoint(nominatimMilanPoint);
const bootstrapPoint = normalizeNominatimH2HBootstrapPoint({
  ...rawBootstrapPoint,
  label: 'Piazza del Duomo, Cinque Vie',
  city: 'Milan',
  parentComune: 'Milan',
  municipality: 'Milan',
  countryCode: null,
  source: 'step1_promoter_assignment',
}, { countryCode: 'it' });
assert.equal(bootstrapPoint.city, 'Milano', '1. Il bootstrap H2H italiano deve canonicalizzare Milan in Milano');
assert.equal(bootstrapPoint.parentComune, 'Milano', '2. selectedSearchPoint.parentComune deve ricevere Milano');

const selectedSearchPoint = {
  label: bootstrapPoint.name,
  lat: bootstrapPoint.lat,
  lng: bootstrapPoint.lng,
  parentComune: bootstrapPoint.parentComune,
  city: bootstrapPoint.city,
};
const selectedMunicipalities = [{ name: bootstrapPoint.municipality, lat: bootstrapPoint.lat, lng: bootstrapPoint.lng }];
assert.equal(selectedMunicipalities[0].name, 'Milano', '3. selectedMunicipalities[0].name deve essere Milano');

const uiMunicipalityLabel = `Zona 1 · ${selectedMunicipalities[0].name}`;
assert.match(uiMunicipalityLabel, /Milano/, '4. La UI deve ricevere Milano');

const realPoiSnapshot = Array.from({ length: 58 }, (_, index) => ({ id: `poi-${index + 1}` }));
const realTplSnapshot = Array.from({ length: 906 }, (_, index) => ({ id: `stop-${index + 1}` }));
const truthModel = buildStep2TruthModel({
  rawData: { pois: realPoiSnapshot, transport: { available: true, stops: realTplSnapshot } },
  userSelections: {
    areaMode: 'radius',
    searchMode: 'address',
    radiusKm: 3,
    selectedMunicipalities,
    selectedPoiIds: realPoiSnapshot.map(poi => poi.id),
  },
  territory: { label: `Raggio 3 km da ${selectedSearchPoint.label}`, areaMode: 'radius' },
  territories: selectedMunicipalities,
  service: { key: 'h2h', title: 'Hand to Hand' },
  serviceData: {
    available: true,
    kpis: {
      selectedPointCount: 58,
      tplStops: 906,
      operatorCount: 2,
      operationalCapacity: 4000,
    },
  },
  currentQuantity: 10000,
  baseRequirement: 1600,
  recommendedRequirement: 1600,
  allocation: realPoiSnapshot.slice(0, 5).map((poi, index) => ({ ...poi, name: `POI ${index + 1}`, priorityRank: index + 1, requiredQuantity: 320, assignedQuantity: 320 })),
  calculationStatus: 'ready',
});

const step3Payload = buildStep2ToStep3Payload(truthModel);
assert.equal(step3Payload.userSelections.selectedMunicipalities[0].name, 'Milano', '5. Il payload Step 2 -> Step 3 deve contenere Milano');
const returnedPayload = JSON.parse(JSON.stringify(step3Payload));
assert.equal(returnedPayload.userSelections.selectedMunicipalities[0].name, 'Milano', '6. Il round-trip Step 3 -> Step 2 deve conservare Milano');
assert.equal(returnedPayload.rawData.pois.length, 58, '7. I 58 POI devono restare disponibili');
assert.equal(returnedPayload.rawData.transport.stops.length, 906, '8. Le 906 fermate TPL devono restare disponibili');
assert.equal(returnedPayload.truthModel.h2h.kpis.operatorCount, 2, '9. I 2 promoter non devono cambiare');
assert.equal(returnedPayload.truthModel.h2h.kpis.operationalCapacity, 4000, '10. La capacità 4.000 non deve cambiare');
assert.equal(returnedPayload.truthModel.quantity.recommendedRequirement, 1600, '11. Il fabbisogno 1.600 non deve cambiare');

assert.equal(
  canonicalizeItalianMunicipalityName('Milan', { address: { city: 'Milan', country_code: 'us' } }),
  'Milan',
  '12. Milan fuori dall’Italia deve restare Milan',
);
assert.equal(
  normalizeNominatimH2HBootstrapPoint({ city: 'Milan', parentComune: 'Milan', lat: 42, lng: -83 }, { countryCode: 'us' }).parentComune,
  'Milan',
  'Il bootstrap H2H non deve trasformare Milan fuori dall’Italia',
);

const d2dMilano = normalizeNominatimGeocodeResult(nominatimMilanPoint);
assert.equal(d2dMilano.name, 'Milano', '13. Il flusso D2D Milano deve restare canonicalizzato');
const varedo = normalizeNominatimH2HBootstrapPoint({
  place_id: 75107511,
  lat: '45.5973268',
  lon: '9.1565874',
  addresstype: 'town',
  display_name: 'Varedo, Monza and Brianza, Lombardy, Italy',
  address: { town: 'Varedo', county: 'Monza and Brianza', state: 'Lombardy', country_code: 'it' },
});
assert.equal(varedo.parentComune, 'Varedo', '14. Varedo deve restare invariato');
assert.deepEqual(
  { lat: bootstrapPoint.lat, lng: bootstrapPoint.lng },
  { lat: 45.4637225, lng: 9.189263 },
  'La canonicalizzazione non deve alterare le coordinate',
);

console.log('h2h_bootstrap_canonicalization.test.mjs: ok');
