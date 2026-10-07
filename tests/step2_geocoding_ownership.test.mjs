import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';

test('late geocoding from PV2 is discarded after switching to PV1, without transferring coordinates or address', { timeout: 90000 }, async () => {
  const root = process.env.OWNERSHIP_TEST_ROOT || fileURLToPath(new URL('..', import.meta.url));
  const executablePath = process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const city = { name: 'Milano', label: 'Milano', lat: 45.4642, lng: 9.1896 };
  const point = { label: 'Via Torino, Milano', lat: 45.4609464, lng: 9.184435, type: 'address' };
  const nil = { id: 'pv_isola', city, cityName: 'Milano', selected: ['nil_1_11'], nilManualMode: true, searchMode: 'municipality', selectedSearchPoint: null, coverage: { address: null }, addressFullCoverageConfirmed: true, readyForQuote: true, assigned_flyers: 5959, finalFlyers: 5959, coverageDecision: 'useRecommended', zonesAllocation: [{ id: 'nil_1_11', name: 'ISOLA', assignedFlyers: 5959 }] };
  const radius = { id: 'pv_torino', city, cityName: 'Milano', selected: ['nil_0_1'], nilManualMode: false, searchMode: 'address', selectedSearchPoint: point, coverage: { address: point }, radiusKm: 1, radius: 1, readyForQuote: true, radiusSelectionConfirmed: true, assigned_flyers: 14060, finalFlyers: 14060, coverageDecision: 'useRecommended' };
  const seed = { type: 'd2d', activeService: 'd2d', selectedService: 'd2d', campaignZones: [nil, radius], activeZoneId: radius.id, city, cityName: 'Milano', searchMode: 'address', selectedSearchPoint: point, coverage: { address: point }, radius: 1, radiusKm: 1, qty: 14060, flyerQuantity: 14060, nilManualMode: false, zones: ['nil_0_1'], campaignBaseQuantity: 10000 };
  const server = await preview({ root, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000 });
    await page.evaluateOnNewDocument(seed => localStorage.setItem('volantinipro_configurator_draft_v1', JSON.stringify({ version: 1, data: seed })), seed);
    const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
    let delayedRequest, analysisReads = 0;
    const polygon = (x, y) => ({ type: 'Polygon', coordinates: [[[x-.001,y-.001],[x+.001,y-.001],[x+.001,y+.001],[x-.001,y+.001],[x-.001,y-.001]]] });
    const rows = [{ nil_code: '1', nil_name: 'DUOMO', territory_level: 'nil', households_total: 12782, population_total: 26000, area_km2: 1, volantini_nel_raggio: 14060, pct_copertura: 100, geometry_geojson: polygon(point.lng, point.lat) }, { nil_code: '11', nil_name: 'ISOLA', territory_level: 'nil', households_total: 5417, population_total: 11000, area_km2: 1, volantini_nel_raggio: 5959, pct_copertura: 100, geometry_geojson: polygon(9.1896,45.4879) }];
    const respond = (request, body) => request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }).catch(() => {});
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url(), parsed = new URL(url);
      if (url.startsWith(origin) && request.method() === 'GET' && !parsed.pathname.startsWith('/api/')) return request.continue().catch(() => {});
      if (parsed.hostname.includes('nominatim') && parsed.searchParams.get('q')?.includes('STALE')) { delayedRequest = request; return; }
      if (url.includes('analysis-istat')) { analysisReads++; return respond(request, { values: { analysis_level: 'nil', famiglie_stimate: 18199, popolazione_stimata: 37000, volantini_consigliati: 20019, area_km2: 2 }, metadata: { analysis_level: 'nil', municipality: 'Milano' }, nil_breakdown: rows, comuni_breakdown: rows, sources: ['LOCAL_FIXTURE'] }); }
      return respond(request, parsed.hostname.includes('nominatim') || url.includes('/rest/v1/') ? [] : {});
    });
    await page.goto(origin + '/configuratore?step=2', { waitUntil: 'domcontentloaded' });
    const selector = 'input[placeholder="Cerca un indirizzo o un altro comune"]';
    await page.waitForSelector(selector); await page.type(selector, 'Via Torino STALE, Milano');
    const deadline = Date.now() + 15000;
    while (!delayedRequest && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(delayedRequest, 'Geocoding must actually be in flight before switching');
    assert.ok(analysisReads > 0, 'Local build must be configured for intercepted fixture analysis');
    await page.click('[data-testid="pos-chip"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('volantinipro_configurator_draft_v1')).data.activeZoneId === 'pv_isola');
    await new Promise(resolve => setTimeout(resolve, 700));
    await respond(delayedRequest, [{ place_id: 'stale-torino', display_name: 'Via Torino STALE, Milano, Italia', lat: String(point.lat), lon: String(point.lng), type: 'road', class: 'highway', addresstype: 'road', address: { road: 'Via Torino STALE', city: 'Milano', country: 'Italia' } }]);
    await new Promise(resolve => setTimeout(resolve, 250)); await page.focus(selector);
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('volantinipro_configurator_draft_v1')).data);
    assert.equal(state.selectedSearchPoint, null); assert.equal(state.coverage.address, null);
    assert.equal(state.nilManualMode, true); assert.equal(state.campaignZones[0].finalFlyers, 5959);
    assert.equal((await page.$eval('body', node => node.innerText)).includes('Via Torino STALE'), false, 'Stale address suggestions must not belong to PV1');
  } finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
});
