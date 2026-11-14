import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchesRequestedCivic, requestedCivicNumber } from '../src/lib/step2/addressIntent.js';

const repoFile = path => new URL(`../${path}`, import.meta.url);

test('Milano civic searches accept only the requested street and number', () => {
  const exact = { street: 'Corso Buenos Aires', houseNumber: '10', placeType: 'address' };
  assert.equal(requestedCivicNumber('Corso Buenos Aires 10, Milano'), '10');
  assert.equal(requestedCivicNumber('Corso Buenos Aires 10 Milano 20124'), '10');
  assert.equal(matchesRequestedCivic('Corso Buenos Aires 10 Milano 20124', exact), true);
  assert.equal(requestedCivicNumber('Viale Certosa 330 Milano'), '330');
  assert.equal(requestedCivicNumber('Milano 20124'), null);
  assert.equal(matchesRequestedCivic('Corso Buenos Aires 10, Milano', exact), true);
  assert.equal(matchesRequestedCivic('Corso Buenos Aires 10, Milano', { ...exact, houseNumber: '11' }), false);
  assert.equal(matchesRequestedCivic('Corso Buenos Aires 10, Milano', { ...exact, street: 'Galleria Buenos Aires' }), false);
  assert.equal(matchesRequestedCivic('Viale Certosa 200, Milano', { street: 'Viale Certosa', houseNumber: '200', placeType: 'address' }), true);
  assert.equal(matchesRequestedCivic('Viale Certosa 330, Milano', { street: 'Viale Certosa', houseNumber: '200', placeType: 'address' }), false);
});

test('a NIL or municipality is never an exact civic, even with plausible coordinates', () => {
  assert.equal(matchesRequestedCivic('Viale Certosa 330, Milano', { name: 'Villapizzone', placeType: 'neighborhood', lat: 45.5, lng: 9.15 }), false);
  assert.equal(matchesRequestedCivic('Corso Buenos Aires 10, Milano', { name: 'Municipio 3', placeType: 'district', lat: 45.48, lng: 9.22 }), false);
  assert.equal(matchesRequestedCivic('Corso Buenos Aires 10, Milano', { street: 'Corso Buenos Aires', placeType: 'road' }), false);
});

test('address autocomplete never calls public Nominatim while typing', async () => {
  const source = await readFile(repoFile('src/pages/public/configurator/Step2.jsx'), 'utf8');
  const searchEffect = source.split('if (!search || search.length < 2) {')[1].split('// Fetch municipality boundary from OSM Nominatim')[0];
  assert.ok(searchEffect, 'address search effect is present');
  assert.doesNotMatch(searchEffect, /fetch\(`https:\/\/nominatim\.openstreetmap\.org\/search/);
  assert.match(source, /searchNominatimOnSubmit = useCallback/);
  const panel = await readFile(repoFile('src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx'), 'utf8');
  assert.match(panel, /searchNominatimOnSubmit\?\.\(search\)/);
});

test('Mapbox resolves a normal Italian address without requiring the user to type Italia', async () => {
  const source = await readFile(repoFile('src/pages/public/configurator/Step2.jsx'), 'utf8');
  assert.match(source, /const mapboxQuery = searchIntent\.intent === "address"/);
  assert.match(source, /\$\{search\.trim\(\)\.replace\(\/,\\s\*\$\/, ""\)\}, Italia/);
  assert.match(source, /encodeURIComponent\(mapboxQuery\)/);
  assert.doesNotMatch(source, /setSearch\(mapboxQuery\)/);
});

test('Milano radius label reflects the real geocoded origin', async () => {
  const source = await readFile(repoFile('src/pages/public/configurator/step2/MilanoCoverageModeChooser.jsx'), 'utf8');
  assert.match(source, /centerLabel \|\|/);
  assert.match(source, /nessun numero civico verificato/);
  assert.doesNotMatch(source, /address\?\.label \|\| "Centro del Comune di Milano"/);
});

test('switching points of sale restores the selected exact address in the editable field', async () => {
  const source = await readFile(repoFile('src/pages/public/configurator/Step2.jsx'), 'utf8');
  assert.match(source, /if \(isZoneSwitch\) \{\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*setSearch\(activeZone\.selectedSearchPoint\?\.label \|\| activeZone\.cityName/);
  assert.match(source, /setGeocodeSuggestions\(\[\]\);\s*setDropOpen\(false\);/);
});
