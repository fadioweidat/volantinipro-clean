import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSectorServiceType, parseSectorsGeoJSON } from '../src/lib/services/sectors-api.js';
import { activityButtons } from '../src/lib/activityButtons.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Step1Icon } from '../src/components/Step1Icon.jsx';

test('normalizeSectorServiceType normalizes all service variations correctly', () => {
  assert.equal(normalizeSectorServiceType('d2d'), 'd2d');
  assert.equal(normalizeSectorServiceType('door_to_door'), 'd2d');
  assert.equal(normalizeSectorServiceType('door-to-door'), 'd2d');
  assert.equal(normalizeSectorServiceType('residential'), 'd2d');

  assert.equal(normalizeSectorServiceType('h2h'), 'h2h');
  assert.equal(normalizeSectorServiceType('hand_to_hand'), 'h2h');
  assert.equal(normalizeSectorServiceType('hand-to-hand'), 'h2h');
  assert.equal(normalizeSectorServiceType('promoter'), 'h2h');

  assert.equal(normalizeSectorServiceType('b2b'), 'b2b');
  assert.equal(normalizeSectorServiceType('business_to_business'), 'b2b');
  assert.equal(normalizeSectorServiceType('business-to-business'), 'b2b');
  assert.equal(normalizeSectorServiceType('business-distribution'), 'b2b');

  // Fallback default
  assert.equal(normalizeSectorServiceType(null), 'd2d');
  assert.equal(normalizeSectorServiceType(undefined), 'd2d');
});

test('parseSectorsGeoJSON handles valid GeoJSON FeatureCollection', () => {
  const sampleGeoJSON = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[9.17, 45.51], [9.18, 45.51], [9.18, 45.52], [9.17, 45.52], [9.17, 45.51]]],
        },
        properties: {
          id: 'sector-1',
          municipality_code: '015146',
          sector_number: 1,
          sector_name: 'Bruzzano Nord',
          service_type: 'd2d',
        },
      },
    ],
  };

  const parsed = parseSectorsGeoJSON(sampleGeoJSON);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'sector-1');
  assert.equal(parsed[0].numero, 1);
  assert.equal(parsed[0].name, 'Bruzzano Nord');
  assert.equal(parsed[0].municipalityCode, '015146');
  assert.equal(parsed[0].serviceType, 'd2d');
  assert.deepEqual(parsed[0].geometry, sampleGeoJSON.features[0].geometry);
});

test('parseSectorsGeoJSON handles empty or malformed inputs without crashing', () => {
  assert.deepEqual(parseSectorsGeoJSON(null), []);
  assert.deepEqual(parseSectorsGeoJSON(undefined), []);
  assert.deepEqual(parseSectorsGeoJSON({}), []);
  assert.deepEqual(parseSectorsGeoJSON({ type: 'FeatureCollection', features: [] }), []);
  assert.deepEqual(parseSectorsGeoJSON({ features: [{ properties: { id: 1 } }] }), []); // no geometry
});

test('Step 1 activity icons: all 13 sectors render valid SVG icons', () => {
  assert.equal(activityButtons.length, 13, 'Must have exactly 13 business activity sectors');

  const expectedSectors = [
    { value: 'ristorazione', icon: 'utensils', label: 'Ristorazione' },
    { value: 'retail', icon: 'bag', label: 'Retail' },
    { value: 'sanitario', icon: 'medical', label: 'Sanitario' },
    { value: 'automotive', icon: 'car', label: 'Automotive' },
    { value: 'servizi', icon: 'building', label: 'Servizi professionali' },
    { value: 'scuole', icon: 'graduation', label: 'Scuole' },
    { value: 'immobiliare', icon: 'home', label: 'Immobiliare' },
    { value: 'beauty', icon: 'droplet', label: 'Beauty' },
    { value: 'fitness', icon: 'dumbbell', label: 'Fitness' },
    { value: 'eventi', icon: 'star', label: 'Eventi' },
    { value: 'farmacie', icon: 'pharmacy', label: 'Farmacie' },
    { value: 'alimentari', icon: 'cart', label: 'Alimentari' },
    { value: 'altro', icon: 'sparkles', label: 'Altro' },
  ];

  for (const expected of expectedSectors) {
    const found = activityButtons.find((b) => b.value === expected.value);
    assert.ok(found, `Sector ${expected.value} must be defined in activityButtons`);
    assert.equal(found.icon, expected.icon, `Sector ${expected.value} icon must be ${expected.icon}`);

    // Render icon to static markup
    const html = renderToStaticMarkup(React.createElement(Step1Icon, { name: found.icon, size: 24 }));
    assert.ok(html.startsWith('<svg'), `Step1Icon(${found.icon}) must render a valid <svg> element. Got: ${html}`);
    assert.ok(html.includes('viewBox='), `Step1Icon(${found.icon}) must have viewBox`);
  }
});

test('Step1Icon renders warning and alert aliases correctly', () => {
  const warningHtml = renderToStaticMarkup(React.createElement(Step1Icon, { name: 'warning', size: 20 }));
  const alertHtml = renderToStaticMarkup(React.createElement(Step1Icon, { name: 'alert', size: 20 }));

  assert.ok(warningHtml.startsWith('<svg'), 'warning icon must render <svg>');
  assert.ok(alertHtml.startsWith('<svg'), 'alert icon must render <svg>');
  assert.equal(warningHtml, alertHtml, 'warning and alert should render identical SVG');
});

import fs from 'node:fs';
import path from 'node:path';
import { fetchSectors } from '../src/lib/services/sectors-api.js';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const txt = fs.readFileSync(envPath, 'utf8');
    for (const l of txt.split('\n')) {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}
loadEnv();

test('fetchSectors returns empty collection when coordinates are null or missing', async () => {
  const res = await fetchSectors({ serviceType: 'd2d', centerLat: null, centerLng: null });
  assert.deepEqual(res, { type: 'FeatureCollection', features: [] });
});

test('fetchSectors resolves primary RPC successfully for Milano Bruzzano', async () => {
  const t0 = performance.now();
  const res = await fetchSectors({
    serviceType: 'door_to_door', // test normalization of alias
    centerLat: 45.5186,
    centerLng: 9.1762,
    radiusKm: 5,
  });
  const elapsed = Math.round(performance.now() - t0);

  assert.ok(res, 'Must return a response object');
  assert.equal(res.type, 'FeatureCollection', 'Must be a GeoJSON FeatureCollection');
  assert.ok(Array.isArray(res.features), 'features must be an array');
  assert.ok(res.features.length > 0, 'Bruzzano 5km d2d must return sectors');

  const parsed = parseSectorsGeoJSON(res);
  assert.ok(parsed.length > 0, 'Parsed sectors must be non-empty');
  assert.ok(parsed[0].id, 'First sector must have an id');
  assert.ok(parsed[0].geometry, 'First sector must have geometry');
  assert.equal(parsed[0].serviceType, 'd2d', 'Normalized service_type must be d2d');
});

