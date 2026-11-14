import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchesRequestedCivic, requestedCivicNumber } from '../src/lib/step2/addressIntent.js';

const repoFile = path => new URL(`../${path}`, import.meta.url);

test('Milano civic searches accept only the requested street and number', () => {
  const exact = { street: 'Corso Buenos Aires', houseNumber: '10', placeType: 'address' };
  assert.equal(requestedCivicNumber('Corso Buenos Aires 10, Milano'), '10');
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

test('Milano radius label reflects the real geocoded origin', async () => {
  const source = await readFile(repoFile('src/pages/public/configurator/step2/MilanoCoverageModeChooser.jsx'), 'utf8');
  assert.match(source, /centerLabel \|\|/);
  assert.match(source, /nessun numero civico verificato/);
  assert.doesNotMatch(source, /address\?\.label \|\| "Centro del Comune di Milano"/);
});
