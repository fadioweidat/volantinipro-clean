import assert from 'node:assert/strict';
import {
  canonicalizeItalianMunicipalityName,
  normalizeNominatimGeocodeResult,
} from '../src/lib/geocoding/canonicalizeItalianMunicipalityName.js';
import { buildServiceAnalysisRequest } from '../src/lib/step2/buildServiceAnalysisRequest.js';

const milanResult = {
  place_id: 75934458,
  osm_type: 'relation',
  osm_id: 44915,
  lat: '45.4641943',
  lon: '9.1896346',
  addresstype: 'city',
  name: 'Milan',
  display_name: 'Milan, Rodano, Milan, Lombardy, Italy',
  address: {
    city: 'Milan',
    municipality: 'Rodano',
    county: 'Milan',
    state: 'Lombardy',
    country: 'Italy',
    country_code: 'it',
  },
};

assert.equal(canonicalizeItalianMunicipalityName('Milan', milanResult), 'Milano', 'Milan italiano deve diventare Milano');
assert.equal(canonicalizeItalianMunicipalityName('Milano', { address: { city: 'Milano', country_code: 'it' } }), 'Milano', 'Milano deve restare Milano');
assert.equal(canonicalizeItalianMunicipalityName('Milan', { address: { city: 'Milan', country_code: 'us' } }), 'Milan', 'Milan fuori Italia non deve essere trasformato');

const normalizedMilano = normalizeNominatimGeocodeResult(milanResult);
assert.equal(normalizedMilano.name, 'Milano', 'Il nome salvato deve essere canonico');
assert.equal(normalizedMilano.label, 'Milano', 'La UI deve ricevere Milano');
assert.equal(normalizedMilano.city, 'Milano', 'Il campo city deve usare lo stesso valore canonico');
assert.equal(normalizedMilano.lat, 45.4641943, 'La canonicalizzazione non deve alterare la latitudine');
assert.equal(normalizedMilano.lng, 9.1896346, 'La canonicalizzazione non deve alterare la longitudine');

process.env.VITE_ANALYSIS_ISTAT_URL = 'https://example.test/functions/v1/analysis-istat';
const municipalityRequest = buildServiceAnalysisRequest({
  lat: normalizedMilano.lat,
  lng: normalizedMilano.lng,
  radius: 3,
  service: 'd2d',
  municipality: normalizedMilano.name,
  quantity: 10000,
  analysisLevel: 'comune',
  selectionScope: 'municipality',
});
assert.equal(new URL(municipalityRequest.url).searchParams.get('municipality'), 'Milano', 'analysis-istat deve ricevere municipality=Milano');

const nilRequest = buildServiceAnalysisRequest({
  lat: normalizedMilano.lat,
  lng: normalizedMilano.lng,
  radius: 3,
  service: 'd2d',
  municipality: normalizedMilano.name,
  quantity: 25000,
  analysisLevel: 'nil',
  selectionScope: 'municipality',
});
assert.equal(new URL(nilRequest.url).searchParams.get('municipality'), 'Milano', 'La richiesta NIL deve usare Milano');
assert.equal(new URL(nilRequest.url).searchParams.get('analysisLevel'), 'nil', 'La richiesta NIL deve mantenere il livello territoriale');

const step2Payload = {
  territory: { label: `${normalizedMilano.name} · comune completo`, territories: [normalizedMilano] },
  userSelections: { selectedMunicipalities: [{ name: normalizedMilano.name, lat: normalizedMilano.lat, lng: normalizedMilano.lng }] },
};
const returnedPayload = JSON.parse(JSON.stringify(step2Payload));
assert.equal(step2Payload.territory.label, 'Milano · comune completo', 'La UI/payload deve mostrare Milano');
assert.equal(step2Payload.userSelections.selectedMunicipalities[0].name, 'Milano', 'Il payload Step 2 deve contenere Milano');
assert.equal(returnedPayload.userSelections.selectedMunicipalities[0].name, 'Milano', 'Il round-trip Step 3 → Step 2 deve conservare Milano');

const varedoResult = normalizeNominatimGeocodeResult({
  place_id: 75107511,
  lat: '45.5973268',
  lon: '9.1565874',
  addresstype: 'town',
  display_name: 'Varedo, Monza and Brianza, Lombardy, Italy',
  address: { town: 'Varedo', county: 'Monza and Brianza', state: 'Lombardy', country_code: 'it' },
});
assert.equal(varedoResult.name, 'Varedo', 'Varedo non deve cambiare');
assert.equal(varedoResult.label, 'Varedo', 'La UI di Varedo non deve cambiare');
assert.equal(varedoResult.lat, 45.5973268, 'I calcoli territoriali non ricevono coordinate modificate');

console.log('nominatim_municipality_canonicalization.test.mjs: ok');

