import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeMilanoMunicipi } from '../src/lib/geo/territories/municipioMilano.js';
import { buildMilanoAddressContext, resolveMilanoMunicipio } from '../src/lib/geo/territories/milanoAddressContext.js';
import { normalizeMilanoCivic, normalizeMilanoStreet, resolveMilanoCivicCap } from '../src/lib/geo/territories/milanoCivicCap.js';

const repoFile = relative => new URL(`../${relative}`, import.meta.url);

test('official fixtures resolve Municipi 1, 4 and 9 from the Phase B geometry', async () => {
  const geojson = JSON.parse(await readFile(repoFile('public/data/territories/milano-municipi-ds379.geojson'), 'utf8'));
  const territories = normalizeMilanoMunicipi(geojson);
  const fixtures = [
    { address: 'Via Monte Napoleone 1', lat: 45.467284, lng: 9.196236, municipio: 1 },
    { address: 'Via Mecenate 2', lat: 45.456867, lng: 9.242251, municipio: 4 },
    { address: 'Via Antonio Oroboni 5', lat: 45.528582, lng: 9.172692, municipio: 9 },
  ];
  for (const fixture of fixtures) assert.equal(resolveMilanoMunicipio(territories, fixture.lat, fixture.lng).number, fixture.municipio, fixture.address);
});

test('a boundary tie is deterministic and chooses the lowest Municipio number', () => {
  const square = { type: 'Polygon', coordinates: [[[9, 45], [10, 45], [10, 46], [9, 46], [9, 45]]] };
  assert.deepEqual(resolveMilanoMunicipio([{ number: 9, name: 'Municipio 9', geometry: square }, { number: 4, name: 'Municipio 4', geometry: square }], 45.5, 9.5), { number: 4, name: 'Municipio 4', boundaryTie: true });
});

test('street and civic normalization handles geocoder ordering and punctuation', () => {
  assert.equal(normalizeMilanoStreet('Via Antonio Oroboni'), 'ANTONIO OROBONI');
  assert.equal(normalizeMilanoStreet('OROBONI ANTONIO'), 'ANTONIO OROBONI');
  assert.equal(normalizeMilanoCivic('005/A'), '5A');
});

test('official civic index resolves sample CAPs and validates geocoder fallback', async () => {
  const document = JSON.parse(await readFile(repoFile('public/data/territories/milano-civic-cap-index.json'), 'utf8'));
  const fetchImpl = async () => ({ ok: true, json: async () => document });
  const fixtures = [
    ['Via Monte Napoleone', '1', '20121'],
    ['Via Mecenate', '2', '20138'],
    ['Via Antonio Oroboni', '5', '20161'],
  ];
  for (const [street, houseNumber, cap] of fixtures) {
    const result = await resolveMilanoCivicCap({ street, houseNumber, fetchImpl });
    assert.equal(result.cap, cap);
    assert.ok(['civic_exact', 'civic_normalized'].includes(result.source));
  }
  const normalized = await resolveMilanoCivicCap({ street: 'Via Napoleone Monte', houseNumber: '1', fetchImpl });
  assert.equal(normalized.cap, '20121');
  assert.equal(normalized.source, 'civic_normalized');
  const fallback = await resolveMilanoCivicCap({ street: 'Indirizzo assente', houseNumber: '1', postcode: '20142', fetchImpl });
  assert.equal(fallback.cap, '20142');
  assert.equal(fallback.source, 'geocoder');
});

test('presentation model preserves existing NIL and exact coordinates without KPI fields', () => {
  const context = buildMilanoAddressContext({
    addressPoint: { label: 'Via Antonio Oroboni 5, Milano', lat: 45.528582, lng: 9.172692 },
    coverageAddress: {}, nil: { code: '83', name: 'BRUZZANO' },
    municipio: { number: 9, name: 'Municipio 9' }, cap: { cap: '20161', source: 'civic_normalized', label: 'CAP rilevato dall’indirizzo' },
  });
  assert.equal(context.nil.name, 'BRUZZANO');
  assert.equal(context.municipio.number, 9);
  assert.equal(context.cap.code, '20161');
  assert.equal(context.lat, 45.528582);
  assert.equal(context.lng, 9.172692);
  for (const forbidden of ['quantity', 'coverage', 'price', 'families', 'recommendedFlyers']) assert.equal(forbidden in context, false);
});

test('a second address snapshot replaces every derived field and unavailable fields remain isolated', () => {
  const first = buildMilanoAddressContext({ addressPoint: { label: 'Oroboni 5', lat: 45.528582, lng: 9.172692 }, coverageAddress: {}, nil: { id: '83', name: 'BRUZZANO' }, municipio: { number: 9, name: 'Municipio 9' }, cap: { cap: '20161', source: 'civic_normalized' } });
  const second = buildMilanoAddressContext({ addressPoint: { label: 'Mecenate 2', lat: 45.456867, lng: 9.242251 }, coverageAddress: {}, nil: { id: '30', name: 'TALIEDO - MORSENCHIO - Q.RE FORLANINI' }, municipio: { number: 4, name: 'Municipio 4' }, cap: null });
  assert.notEqual(second.addressLabel, first.addressLabel);
  assert.notEqual(second.nil.name, first.nil.name);
  assert.notEqual(second.municipio.number, first.municipio.number);
  assert.equal(second.cap.available, false);
  assert.equal(second.cap.source, 'unavailable');
  assert.equal(second.nil.available, true);
  assert.equal(second.municipio.available, true);
});

test('integration remains presentation-only and does not touch Step2Map', async () => {
  const step2 = await readFile(repoFile('src/pages/public/configurator/Step2.jsx'), 'utf8');
  const guidance = await readFile(repoFile('src/pages/public/configurator/step2/MilanoGuidance.jsx'), 'utf8');
  const map = await readFile(repoFile('src/components/Step2Map.jsx'), 'utf8');
  assert.match(step2, /addressPoint=\{selectedSearchPoint\?\.type === "address"/);
  assert.match(guidance, /MilanoAddressContextCard/);
  assert.doesNotMatch(map, /MilanoAddressContext|milanoCivicCap/);
});
