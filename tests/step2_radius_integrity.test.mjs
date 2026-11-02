// Step 2, modalità Raggio: Via Antonio Oroboni, Milano. Righe con la forma reale
// di analysis-istat (NIL prima, comuni esterni dopo).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { apiToZones } = await import('../src/lib/step2/zoneGeoHelpers.js');
const { resolveZoneAutoSelection } = await import('../src/lib/step2/zoneSelection.js');
const { useServiceAnalysis } = await import('../src/hooks/useServiceAnalysis.js');
const { canonicalZoneId } = await import('../src/lib/step2/zoneGeoHelpers.js');
const { fetchWithAttemptTimeout, resolveAnalysisStatus } = await import('../src/lib/step2/analysisStatus.js');
const { defaultLayersForService } = await import('../src/lib/services/service-config.js');
const { assignTerritoryColors, territoryColor } = await import('../src/lib/map/territoryColors.js');
const { boundsOverlap, CONTEXT_COMUNE_STYLE, CONTEXT_COMUNI_ASSET, CONTEXT_NIL_ASSET, CONTEXT_NIL_STYLE, isDrawnByGeographicLayer, MILANO_BOUNDARY_STYLE, uniqueOutline, prepareContextComuni, prepareContextNil, selectContextTerritories } = await import('../src/lib/map/radiusContextComuni.js');
const { clipTerritoryToRadius } = await import('../src/lib/map/clipTerritoryToRadius.js');
const { buildCampaignMapOverlays } = await import('../src/lib/step2/campaignMapOverlays.js');

const nil = (code, name, households) => ({ territory_level: 'nil', nil_code: code, nil_name: name, comune_name: name, municipality_code: '015146', pct_copertura: 100, households_in_radius: households, households_total: households, volantini_nel_raggio: households, geometry_geojson: null });
const comune = (code, name, households) => ({ territory_level: 'mixed', nil_code: null, nil_name: null, comune_name: name, municipality_code: code, pct_copertura: 50, households_in_radius: households, households_total: households * 2, volantini_nel_raggio: households, geometry_geojson: null });
const analysis = (rows) => ({ values: { famiglie_stimate: rows.reduce((sum, row) => sum + row.households_in_radius, 0), volantini_consigliati: 1, area_km2: 1 }, comuni_breakdown: rows, nil_breakdown: rows.filter((row) => row.nil_code), metadata: { analysis_level: 'mixed' } });

const CORMANO = comune('015086', 'Cormano', 761);
const NOVATE = comune('015157', 'Novate Milanese', 219);
const BRESSO = comune('015032', 'Bresso', 3055);
const RADIUS_1 = analysis([nil('77', 'BRUZZANO', 5885), nil('78', 'COMASINA', 3162), CORMANO, NOVATE]);
const RADIUS_2 = analysis([nil('77', 'BRUZZANO', 6840), nil('78', 'COMASINA', 3795), nil('79', 'AFFORI', 5442), CORMANO, NOVATE, BRESSO]);
const RADIUS_3 = analysis([nil('77', 'BRUZZANO', 6840), nil('78', 'COMASINA', 3795), nil('79', 'AFFORI', 8480), nil('80', 'BOVISASCA', 6462), BRESSO, CORMANO, NOVATE]);

test('a comune keeps the same id when other territories enter the radius', () => {
  const idOf = (data) => apiToZones(data, null).find((zone) => zone.name === 'Cormano').id;
  assert.equal(idOf(RADIUS_1), idOf(RADIUS_2));
  assert.equal(idOf(RADIUS_2), idOf(RADIUS_3));
});

test('a NIL keeps the same id when the order of the rows changes', () => {
  const reversed = analysis([...RADIUS_1.comuni_breakdown].reverse());
  const idOf = (data) => apiToZones(data, null).find((zone) => zone.name === 'COMASINA').id;
  assert.equal(idOf(RADIUS_1), idOf(reversed));
});

test('changing radius keeps every territory selected: the totals follow the analysis', () => {
  let selected = [];
  let previous = [];
  for (const data of [RADIUS_1, RADIUS_2, RADIUS_3, RADIUS_1, RADIUS_3]) {
    const zones = apiToZones(data, null);
    const availableIds = zones.map((zone) => zone.id);
    selected = resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds, prevAvailableIds: previous, currentSelected: selected });
    previous = availableIds;
    const families = zones.filter((zone) => selected.includes(zone.id)).reduce((sum, zone) => sum + zone.families, 0);
    assert.equal(families, data.values.famiglie_stimate);
  }
});

test('a real manual subset is still preserved across a radius change', () => {
  const ids = apiToZones(RADIUS_1, null).map((zone) => zone.id);
  const manual = [ids[0]];
  const next = apiToZones(RADIUS_2, null).map((zone) => zone.id);
  assert.deepEqual(resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds: next, prevAvailableIds: ids, currentSelected: manual }), manual);
});

test('leaving Tutto Milano for a radius keeps the external comuni in the totals', () => {
  const allNil = Array.from({ length: 88 }, (_, index) => `nil_${index}`);
  const inRadius = [...allNil.slice(0, 27), ...Array.from({ length: 10 }, (_, index) => `api_${index}`)];
  const next = resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds: inRadius, prevAvailableIds: allNil, currentSelected: allNil });
  assert.deepEqual(next, inRadius);
  const manual = allNil.slice(0, 3);
  assert.deepEqual(resolveZoneAutoSelection({ hasUsefulApiZones: true, availableIds: inRadius, prevAvailableIds: allNil, currentSelected: manual }), manual);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function mockAnalysisFetch() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = (url, options = {}) => {
    const gate = deferred();
    const call = { radius: new URL(url).searchParams.get('radius'), signal: options.signal, reply: (status, body) => gate.resolve({ ok: status < 400, status, json: async () => body }) };
    options.signal?.addEventListener('abort', () => gate.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    calls.push(call);
    return gate.promise;
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function renderAnalysis(initialRadius) {
  const seen = { current: null };
  const Harness = ({ radius }) => {
    seen.current = useServiceAnalysis(45.5289, 9.1666, radius, 'd2d', 'Milano');
    return null;
  };
  let root;
  act(() => { root = create(React.createElement(Harness, { radius: initialRadius })); });
  return { seen, setRadius: (radius) => act(() => { root.update(React.createElement(Harness, { radius })); }), unmount: () => act(() => root.unmount()) };
}

const flush = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const passDebounce = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 470)); });

test('returning to a radius after another one failed shows its data again', async () => {
  const net = mockAnalysisFetch();
  const view = renderAnalysis(1);
  try {
    await passDebounce();
    net.calls[0].reply(200, RADIUS_1);
    await flush();
    view.setRadius(2);
    await passDebounce();
    net.calls[1].reply(404, { error: 'NOT_FOUND' });
    await flush();
    assert.equal(view.seen.current.data, null);
    view.setRadius(1);
    await passDebounce();
    net.calls[2].reply(200, RADIUS_1);
    await flush();
    assert.equal(view.seen.current.error, null);
    assert.equal(view.seen.current.data?.values?.famiglie_stimate, RADIUS_1.values.famiglie_stimate);
  } finally { view.unmount(); net.restore(); }
});

test('a cancelled request is sent again instead of keeping the previous radius', async () => {
  const net = mockAnalysisFetch();
  const view = renderAnalysis(1);
  try {
    await passDebounce();
    net.calls[0].reply(200, RADIUS_1);
    await flush();
    view.setRadius(3);
    await passDebounce();
    assert.equal(net.calls.length, 2);
    view.setRadius(2);
    assert.equal(net.calls[1].signal.aborted, true);
    view.setRadius(3);
    await passDebounce();
    assert.equal(net.calls.length, 3, 'the aborted radius needs a new request');
    net.calls[2].reply(200, RADIUS_3);
    await flush();
    assert.equal(view.seen.current.data?.values?.famiglie_stimate, RADIUS_3.values.famiglie_stimate);
    assert.equal(view.seen.current.dataKey, view.seen.current.fetchKey);
  } finally { view.unmount(); net.restore(); }
});

test('an old response can never replace the latest radius', async () => {
  const net = mockAnalysisFetch();
  const view = renderAnalysis(1);
  try {
    await passDebounce();
    view.setRadius(3);
    await passDebounce();
    net.calls[0].reply(200, RADIUS_1);
    await flush();
    net.calls[1].reply(200, RADIUS_3);
    await flush();
    assert.equal(view.seen.current.data?.values?.famiglie_stimate, RADIUS_3.values.famiglie_stimate);
  } finally { view.unmount(); net.restore(); }
});

test('selections saved with the old positional ids still find their zone', () => {
  assert.equal(canonicalZoneId('api_7_015086'), 'api_015086');
  assert.equal(canonicalZoneId('nil_18_11'), 'nil_11');
  assert.equal(canonicalZoneId('api_015086'), 'api_015086');
  assert.equal(canonicalZoneId('nil_11'), 'nil_11');
  assert.equal(canonicalZoneId('cap_20100'), 'cap_20100');
});

test('each analysis state is distinct: loading is never reported as unavailable', () => {
  const base = { active: true, cancelled: false, retrying: false, inFlight: false, slow: false, error: null, hasData: false };
  assert.equal(resolveAnalysisStatus({ ...base, active: false }), 'idle');
  assert.equal(resolveAnalysisStatus({ ...base, active: false, cancelled: true }), 'cancelled');
  assert.equal(resolveAnalysisStatus({ ...base, inFlight: true }), 'loading');
  assert.equal(resolveAnalysisStatus({ ...base, inFlight: true, slow: true }), 'slow');
  assert.equal(resolveAnalysisStatus({ ...base, inFlight: true, retrying: true }), 'retrying');
  assert.equal(resolveAnalysisStatus({ ...base, hasData: true }), 'success');
  assert.equal(resolveAnalysisStatus({ ...base, error: 'HTTP_500' }), 'error');
  assert.equal(resolveAnalysisStatus({ ...base, error: 'ANALYSIS_BACKEND_NOT_CONFIGURED' }), 'unavailable');
});

test('a suspended request ends with a timeout, not with an endless wait', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  try {
    await assert.rejects(fetchWithAttemptTimeout('https://x.test', {}, new AbortController().signal, 20), { name: 'AnalysisTimeout' });
  } finally { globalThis.fetch = original; }
});

test('a cancelled attempt is reported as cancelled, not as a timeout', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const outer = new AbortController();
  try {
    const pending = fetchWithAttemptTimeout('https://x.test', {}, outer.signal, 1000);
    outer.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  } finally { globalThis.fetch = original; }
});

test('territory colors are distinct and do not change with the radius', () => {
  const small = ['nil_77', 'nil_78', 'api_015086'];
  const large = [...small, ...Array.from({ length: 104 }, (_, index) => `nil_x${index}`)];
  const smallColors = assignTerritoryColors(small);
  const largeColors = assignTerritoryColors(large);
  assert.equal(new Set(largeColors.values()).size, large.length);
  for (const id of small) assert.equal(smallColors.get(id), largeColors.get(id), id);
});

const square = (lng, lat, size) => ({ type: 'Polygon', coordinates: [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]] });
const distanceKm = ([lng, lat], center) => Math.hypot((lng - center.lng) * 111.32 * Math.cos(center.lat * Math.PI / 180), (lat - center.lat) * 110.95);

test('clipped territories stay inside the radius, whole territories outside it disappear', () => {
  const center = { lat: 45.5289, lng: 9.1666 };
  const clipped = clipTerritoryToRadius(square(9.1, 45.45, 0.2), center.lat, center.lng, 1);
  assert.equal(clipped.type, 'Polygon');
  for (const point of clipped.coordinates[0]) assert.ok(distanceKm(point, center) <= 1.01);
  assert.equal(clipTerritoryToRadius(square(9.5, 45.9, 0.01), center.lat, center.lng, 1), null);
});

test('a radius point of sale overlay carries its own circle', () => {
  const geometry = square(9.1, 45.45, 0.2);
  const zones = [
    { id: 'pv1', searchMode: 'address', radiusKm: 2, city: { lat: 45.52, lng: 9.16, name: 'Milano' }, selected: [] },
    { id: 'pv2', searchMode: 'municipality', city: { lat: 45.6, lng: 9.2, name: 'Monza' }, selected: [] },
  ];
  const [overlay] = buildCampaignMapOverlays(zones, 'pv1', [{ id: 'a', name: 'Bruzzano', geometry }]);
  assert.deepEqual(overlay.clip, { lat: 45.52, lng: 9.16, radiusKm: 2 });
});

test('the map gets territory boundaries from the analysis, not from Nominatim per comune', () => {
  const source = readFileSync(new URL('../src/pages/public/configurator/Step2.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /radiusComuneGeometr/);
  assert.match(source, /mapCoverageZones=\{mapCoverageZones\}/);
  assert.doesNotMatch(source, /comuneRows\.slice\(/);
});

test('the municipalities file is real, complete and light enough for the public map', () => {
  const raw = readFileSync(new URL('../public/data/territories/lombardia-comuni.json', import.meta.url));
  const comuni = prepareContextComuni(JSON.parse(raw));
  assert.equal(comuni.length, 1502);
  assert.ok(raw.length < 1024 * 1024);
  const cormano = comuni.find((row) => row.name === 'Cormano');
  assert.equal(cormano.id, 'api_015086');
  assert.ok(boundsOverlap(cormano.bounds, { west: 9.15, east: 9.2, south: 45.53, north: 45.55 }));
  assert.ok(!boundsOverlap(cormano.bounds, { west: 10, east: 10.1, south: 45, north: 45.1 }));
});

test('one fill opacity for every territory, and neutral lines for the others', () => {
  for (const style of [CONTEXT_COMUNE_STYLE, CONTEXT_NIL_STYLE]) {
    assert.ok(style.weight <= 0.8 && style.opacity <= 0.4);
  }
  assert.equal(MILANO_BOUNDARY_STYLE.fill, undefined);
  const map = readFileSync(new URL('../src/components/Step2Map.jsx', import.meta.url), 'utf8');
  assert.match(map, /const fillOpacity = TERRITORY_FILL_OPACITY;/);
  assert.match(map, /L\.geoJSON\(territory\.geometry, \{/);
  assert.match(map, /fillOpacity: drawnByGeographicLayer \? 0 : fillOpacity/);
  assert.match(map, /const showContextComuni = activeLayers\?\.comuni !== false;/);
  assert.match(map, /const showContextNil = activeLayers\?\.nil !== false;/);
  assert.equal(defaultLayersForService('d2d').nil, true);
});

test('a shared border is drawn once', () => {
  const left = { type: 'MultiPolygon', coordinates: [square(9.5, 45.9, 0.01).coordinates] };
  const right = { type: 'MultiPolygon', coordinates: [square(9.51, 45.9, 0.01).coordinates] };
  const seen = new Set();
  const segments = (geometry) => geometry.coordinates.reduce((sum, line) => sum + line.length - 1, 0);
  assert.equal(segments(uniqueOutline(left, seen)), 4);
  assert.equal(segments(uniqueOutline(right, seen)), 3);
  assert.equal(uniqueOutline(left, seen), null);
});

test('the operational layer steps aside only for territories really drawn by the geographic layer', () => {
  const on = { ready: true, showComuni: true, showNil: true };
  assert.equal(isDrawnByGeographicLayer('nil_83', on), true);
  assert.equal(isDrawnByGeographicLayer('api_015086', on), true);
  assert.equal(isDrawnByGeographicLayer('api_015146', on), false);
  assert.equal(isDrawnByGeographicLayer('nil_83', { ...on, ready: false }), false);
  assert.equal(isDrawnByGeographicLayer('nil_83', { ...on, showNil: false }), false);
  assert.equal(isDrawnByGeographicLayer('api_015086', { ...on, showComuni: false }), false);
});

const nilPayload = JSON.parse(readFileSync(new URL('../public/data/territories/milano-nil.json', import.meta.url)));

test('the NIL file holds the 88 official NIL with the ids used by the analysis', () => {
  const nil = prepareContextNil(nilPayload);
  assert.equal(nil.length, 88);
  assert.equal(new Set(nil.map((row) => row.id)).size, 88);
  assert.match(nilPayload.source, /DS964/);
  assert.ok(nil.every((row) => /^nil_\d+$/.test(row.id) && row.geometry.coordinates.length > 0));
  assert.ok(JSON.stringify(nilPayload).length < 100 * 1024);
});

test('every NIL has its own color, the same whatever the radius, and neighbours stay apart', () => {
  const nil = prepareContextNil(nilPayload);
  assert.equal(new Set(nil.map((row) => territoryColor(row.id))).size, 88);
  const inRadius = assignTerritoryColors(['nil_83', 'nil_82', 'api_015086']);
  const wider = assignTerritoryColors(nil.map((row) => row.id).concat('api_015086'));
  for (const id of ['nil_83', 'nil_82']) {
    assert.equal(inRadius.get(id), territoryColor(id));
    assert.equal(wider.get(id), territoryColor(id));
  }
  const points = (row) => new Set(row.geometry.coordinates.flat(2).map(([lng, lat]) => `${lng}|${lat}`));
  const sets = nil.map(points);
  for (let a = 0; a < nil.length; a += 1) {
    for (let b = a + 1; b < nil.length; b += 1) {
      if (![...sets[a]].some((point) => sets[b].has(point))) continue;
      const rgb = (id) => [1, 3, 5].map((start) => parseInt(territoryColor(id).slice(start, start + 2), 16));
      const [x, y] = [rgb(nil[a].id), rgb(nil[b].id)];
      assert.ok(Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) > 60, `${nil[a].name} / ${nil[b].name}`);
    }
  }
});

test('Comuni and NIL toggles are independent, and Milano is never filled over its NIL', () => {
  const comuni = [{ id: 'api_015146' }, { id: 'api_015086' }, { id: 'api_015032' }];
  const nil = [{ id: 'nil_83' }];
  const involvedColors = new Map([['api_015086', '#123456'], ['nil_83', '#654321']]);
  const rows = (options) => selectContextTerritories({ comuni, nil, involvedColors, ...options });
  const ids = (options) => rows(options).map((row) => row.id);
  assert.deepEqual(ids({ showComuni: true, showNil: true }), ['api_015146', 'api_015086', 'api_015032', 'nil_83']);
  assert.deepEqual(ids({ showComuni: false, showNil: true }), ['nil_83']);
  assert.deepEqual(ids({ showComuni: true, showNil: false }), ['api_015146', 'api_015086', 'api_015032']);
  assert.deepEqual(ids({ showComuni: false, showNil: false }), []);
  const all = rows({ showComuni: true, showNil: true });
  assert.equal(all[0].fillColor, undefined);
  assert.equal(all[0].pane, 'municipalityBoundaryPane');
  assert.equal(all[1].fillColor, '#123456');
  assert.equal(all[2].fillColor, undefined);
  assert.equal(all[3].fillColor, territoryColor('nil_83'));
  const away = selectContextTerritories({ comuni, nil, showComuni: true, showNil: true, involvedColors: new Map([['api_015086', '#123456']]) });
  assert.equal(away.at(-1).fillColor, undefined);
});

test('on a small map the view zooms out until the whole circle fits', () => {
  const map = readFileSync(new URL('../src/components/Step2Map.jsx', import.meta.url), 'utf8');
  assert.match(map, /Math\.min\(zoom, map\.getBoundsZoom\(circle,/);
  assert.match(map, /map\.setView\(\[city\.lat, city\.lng\], getRadiusViewZoom\(map, city, effectiveMapRadius\)/);
});

test('every file the map loads is deployed: .vercelignore does not exclude it', () => {
  const ignore = readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /^public\/data\/territories\/\*\r?$/m);
  for (const asset of [CONTEXT_COMUNI_ASSET, CONTEXT_NIL_ASSET]) {
    assert.ok(ignore.split(/\r?\n/).includes(`!public${asset}`), asset);
  }
});

test('NIL colors stay bright enough to read on the dark map', () => {
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (let code = 1; code <= 88; code += 1) assert.ok(luminance(territoryColor(`nil_${code}`)) > 85, `NIL ${code}`);
});

test('the part of Milano outside every NIL keeps the comune color, as a fill only', () => {
  const rest = { type: 'MultiPolygon', coordinates: [square(9.1, 45.45, 0.01).coordinates] };
  const rows = selectContextTerritories({ nil: [{ id: 'nil_83' }], rest, showComuni: false, showNil: true, involvedColors: new Map([['nil_83', '#654321']]) });
  assert.equal(rows.at(-1).outline, false);
  assert.equal(rows.at(-1).fillColor, territoryColor('api_015146'));
});

test('without the NIL file the comuni outlines still appear', () => {
  const comuni = [{ id: 'api_015146' }];
  assert.deepEqual(selectContextTerritories({ comuni, nil: undefined, showComuni: true, showNil: true }).map((row) => row.id), ['api_015146']);
});
