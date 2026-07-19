const { browserLaunchOptions, loadPlaywright } = require('./helpers/loadPlaywright.cjs');
const { chromium } = loadPlaywright();

const projectUrl = process.env.STEP2_OFFLINE_BASE_URL || 'http://localhost:5173/';

function assert(condition, message, classification = 'application') {
  if (!condition) {
    const error = new Error(message);
    error.classification = classification;
    throw error;
  }
}

function polygon(lng, lat, scale = 1) {
  return {
    type: 'Polygon',
    coordinates: [[
      [lng - 0.012 * scale, lat - 0.008 * scale],
      [lng + 0.012 * scale, lat - 0.008 * scale],
      [lng + 0.012 * scale, lat + 0.008 * scale],
      [lng - 0.012 * scale, lat + 0.008 * scale],
      [lng - 0.012 * scale, lat - 0.008 * scale],
    ]],
  };
}

const territories = {
  Varedo: { code: '108045', lat: 45.575, lng: 9.16, households: 6176, population: 13914, area: 4.8, recommended: 6794 },
  Milano: { code: '015146', lat: 45.4642, lng: 9.1896, households: 604000, population: 1370000, area: 181.8, recommended: 664400 },
  Bergamo: { code: '016024', lat: 45.6983, lng: 9.6773, households: 52500, population: 120580, area: 40.2, recommended: 57750 },
};

function territoryFromUrl(url) {
  const parsed = new URL(url);
  const municipality = decodeURIComponent(parsed.searchParams.get('municipality') || '');
  if (/bergamo/i.test(municipality)) return territories.Bergamo;
  if (/milano/i.test(municipality)) return territories.Milano;
  return territories.Varedo;
}

function analysisFixture(url, service) {
  const territory = territoryFromUrl(url);
  const name = territory === territories.Bergamo ? 'Bergamo' : territory === territories.Milano ? 'Milano' : 'Varedo';
  const row = {
    municipality_code: territory.code,
    comune_name: name,
    territory_level: 'comune',
    population: territory.population,
    households: territory.households,
    households_total: territory.households,
    area_km2: territory.area,
    pct_copertura: 100,
    recommended_flyers: territory.recommended,
    volantini_nel_raggio: territory.recommended,
    density_per_km2: Math.round(territory.population / territory.area),
    geometry_geojson: polygon(territory.lng, territory.lat, name === 'Bergamo' ? 1.8 : 1),
    poi_count: service === 'h2h' ? 4 : 0,
    detected_activities: service === 'b2b' ? 4 : 0,
    businesses: service === 'b2b' ? 4 : 0,
    competitor_count: null,
    target_activities_count: service === 'b2b' ? 4 : 0,
    cluster_count: service === 'b2b' ? 2 : 0,
    commercial_density: service === 'b2b' ? 64 : 0,
    commercial_density_index: service === 'b2b' ? 68 : 0,
  };
  return {
    success: true,
    analysis_level: 'comune',
    values: {
      analysis_level: 'comune',
      famiglie_stimate: territory.households,
      households: territory.households,
      popolazione_stimata: territory.population,
      population: territory.population,
      area_km2: territory.area,
      volantini_consigliati: territory.recommended,
      recommended_flyers: territory.recommended,
      copertura_stimata: 100,
      coverage_pct: 100,
      reach_score: 80,
      roi_score: 74,
      confidence_score: 86,
      family_index: 76,
      poi_count: service === 'h2h' ? 4 : 0,
      detected_activities: service === 'b2b' ? 4 : 0,
      businesses: service === 'b2b' ? 4 : 0,
      competitor_count: null,
      target_activities_count: service === 'b2b' ? 4 : 0,
      cluster_count: service === 'b2b' ? 2 : 0,
      commercial_density: service === 'b2b' ? 64 : 0,
      commercial_density_index: service === 'b2b' ? 68 : 0,
    },
    comuni_breakdown: [row],
    nil_breakdown: [],
    territorial_breakdown: [row],
    metadata: { analysis_level: 'comune', municipality: name, nil_available: false, isEstimated: false },
    sources: ['ISTAT', 'PostGIS'],
  };
}

function mapboxFixture(url) {
  const decoded = decodeURIComponent(url).toLowerCase();
  const item = decoded.includes('bergamo')
    ? { name: 'Bergamo', id: 'place.bergamo', ...territories.Bergamo }
    : decoded.includes('milano')
      ? { name: 'Milano', id: 'place.milano', ...territories.Milano }
      : { name: 'Varedo', id: 'place.varedo', ...territories.Varedo };
  return {
    type: 'FeatureCollection',
    features: [{
      id: item.id,
      type: 'Feature',
      place_type: ['place'],
      text: item.name,
      place_name: `${item.name}, Lombardia, Italia`,
      center: [item.lng, item.lat],
      properties: { short_code: 'it-lom' },
      context: [{ id: `place.${item.code}`, text: item.name }, { id: 'region.lombardia', text: 'Lombardia', short_code: 'IT-25' }],
    }],
  };
}

function nominatimFixture(url) {
  const decoded = decodeURIComponent(url).toLowerCase();
  const item = decoded.includes('bergamo')
    ? { name: 'Bergamo', ...territories.Bergamo }
    : decoded.includes('milano')
      ? { name: 'Milano', ...territories.Milano }
      : { name: 'Varedo', ...territories.Varedo };
  if (url.includes('format=geojson')) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: polygon(item.lng, item.lat, item.name === 'Bergamo' ? 1.8 : 1), properties: { display_name: `${item.name}, Lombardia, Italia`, addresstype: 'town' } }] };
  }
  return [{ place_id: Number(item.code), display_name: `${item.name}, Lombardia, Italia`, lat: String(item.lat), lon: String(item.lng), addresstype: 'town', type: 'administrative', class: 'boundary', address: { town: item.name, state: 'Lombardia' } }];
}

const h2hElements = [
  { type: 'node', id: 101, lat: 45.576, lon: 9.161, tags: { railway: 'station', name: 'Stazione Varedo', 'addr:city': 'Varedo' } },
  { type: 'node', id: 102, lat: 45.574, lon: 9.158, tags: { amenity: 'school', name: 'Istituto Varedo', 'addr:street': 'Via Italia', 'addr:city': 'Varedo' } },
  { type: 'node', id: 103, lat: 45.577, lon: 9.164, tags: { leisure: 'fitness_centre', name: 'Palestra Varedo', 'addr:city': 'Varedo' } },
];

const milanoElements = [
  { type: 'node', id: 151, lat: 45.465, lon: 9.19, tags: { railway: 'station', name: 'Stazione Milano Centro', 'addr:city': 'Milano' } },
  { type: 'node', id: 152, lat: 45.463, lon: 9.187, tags: { amenity: 'school', name: 'Istituto Milano', 'addr:city': 'Milano' } },
  { type: 'node', id: 153, lat: 45.467, lon: 9.192, tags: { leisure: 'fitness_centre', name: 'Palestra Milano', 'addr:city': 'Milano' } },
];

const bergamoH2hElements = [
  { type: 'node', id: 161, lat: 45.699, lon: 9.678, tags: { railway: 'station', name: 'Stazione Bergamo', 'addr:city': 'Bergamo' } },
  { type: 'node', id: 162, lat: 45.697, lon: 9.675, tags: { amenity: 'school', name: 'Istituto Bergamo', 'addr:city': 'Bergamo' } },
  { type: 'node', id: 163, lat: 45.701, lon: 9.68, tags: { leisure: 'fitness_centre', name: 'Palestra Bergamo', 'addr:city': 'Bergamo' } },
];

const businessElements = [
  { type: 'node', id: 201, lat: 45.699, lon: 9.678, tags: { shop: 'convenience', name: 'Bottega Bergamo', 'addr:street': 'Via Roma', 'addr:housenumber': '1', 'addr:city': 'Bergamo' } },
  { type: 'node', id: 202, lat: 45.697, lon: 9.675, tags: { amenity: 'pharmacy', name: 'Farmacia Centrale', 'addr:street': 'Via XX Settembre', 'addr:city': 'Bergamo' } },
  { type: 'node', id: 203, lat: 45.701, lon: 9.68, tags: { office: 'company', name: 'Bergamo Servizi', 'addr:city': 'Bergamo' } },
  { type: 'node', id: 204, lat: 45.696, lon: 9.681, tags: { amenity: 'restaurant', name: 'Ristorante Città Alta', 'addr:city': 'Bergamo' } },
];

async function installOfflineRoutes(page, ledger, { failPoi = false, failTransport = false, emptyPoi = false, staleRace = false } = {}) {
  const raceEnabled = () => typeof staleRace === 'object' ? staleRace.active === true : staleRace === true;
  await page.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/functions/v1/analysis-istat')) {
      ledger.analysisIstat += 1;
      if (raceEnabled() && /municipality=Milano/i.test(url)) await new Promise(resolve => setTimeout(resolve, 1400));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisFixture(url, 'd2d')) });
    }
    if (url.includes('/functions/v1/analysis-poi-search')) {
      ledger.analysisPoi += 1;
      const service = new URL(url).searchParams.get('service') || 'h2h';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisFixture(url, service)) });
    }
    if (/overpass/i.test(url)) {
      ledger.overpass += 1;
      if (failPoi) return route.fulfill({ status: 200, contentType: 'application/json', body: '{invalid-json' });
      if (emptyPoi) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 0.6, elements: [] }) });
      const body = request.postData() || '';
      const decodedBody = decodeURIComponent(body);
      const isMilanoRequest = /45\.46[3-7]/.test(decodedBody);
      if (raceEnabled() && isMilanoRequest) await new Promise(resolve => setTimeout(resolve, 1400));
      const elements = raceEnabled()
        ? isMilanoRequest ? milanoElements : bergamoH2hElements
        : /office|pharmacy|tobacco|company|restaurant/i.test(decodedBody) && ledger.activeService === 'b2b' ? businessElements : h2hElements;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 0.6, elements }) });
    }
    if (url.includes('/rest/v1/rpc/get_transport_stops_in_radius')) {
      ledger.transport += 1;
      if (failTransport) return route.fulfill({ status: 200, contentType: 'application/json', body: '{invalid-json' });
      const transportBody = request.postData() || '';
      const isMilanoTransport = /45\.46[3-7]/.test(transportBody);
      if (raceEnabled() && isMilanoTransport) await new Promise(resolve => setTimeout(resolve, 1400));
      if (raceEnabled() && !isMilanoTransport) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { source: 'gtfs_test', stop_id: 'B1', stop_name: 'Stazione Bergamo', stop_type: 'train', distance_m: 90, lat: 45.699, lng: 9.678, routes: [{ route_id: 'R2', route_short_name: 'R2', route_type_label: 'train' }] },
      ]) });
      if (raceEnabled()) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { source: 'gtfs_test', stop_id: 'M1', stop_name: 'Stazione Milano Centro', stop_type: 'train', distance_m: 80, lat: 45.465, lng: 9.19, routes: [{ route_id: 'M1', route_short_name: 'M1', route_type_label: 'metro' }] },
      ]) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { source: 'gtfs_test', stop_id: 'V1', stop_name: 'Stazione Varedo', stop_type: 'train', distance_m: 120, lat: 45.576, lng: 9.161, routes: [{ route_id: 'S9', route_short_name: 'S9', route_type_label: 'train' }] },
      ]) });
    }
    if (url.includes('api.mapbox.com/geocoding') || url.includes('mapbox.com/search')) {
      ledger.geocode += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mapboxFixture(url)) });
    }
    if (url.includes('nominatim.openstreetmap.org')) {
      ledger.nominatim += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nominatimFixture(url)) });
    }
    if (url.includes('demographic_indicators')) {
      ledger.demographics += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    if (url.includes('/rest/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' });
    if (url.startsWith(projectUrl)) return route.continue();
    if (url.includes('fonts.')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.includes('/tiles/') || url.includes('basemaps.cartocdn.com') || url.includes('mapbox')) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
    ledger.unhandled.push({ method: request.method(), url });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function gotoStep2(page, service = 'd2d') {
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
  const cookie = page.getByRole('button', { name: /^Accetta$/i });
  if (await cookie.count()) await cookie.click();
  await page.getByText('Calcola la tua copertura', { exact: true }).click();
  const serviceLabel = service === 'h2h' ? 'Hand to Hand' : service === 'b2b' ? 'Distribuzione Business' : 'Door to Door';
  await page.getByText(serviceLabel, { exact: true }).first().click();
  await page.locator('#section-settore button').filter({ hasText: 'Retail' }).click();
  if (service === 'h2h') {
    await page.getByText('Stazioni e fermate', { exact: true }).click();
    await page.getByText('Numero Promoter', { exact: true }).locator('..').locator('select').selectOption('1');
    await page.getByText('Fascia Oraria', { exact: true }).locator('..').locator('select').selectOption('09:00-13:00');
    await page.getByText('Durata Servizio', { exact: true }).locator('..').locator('select').selectOption('4');
    await page.locator('input[placeholder="es. Varedo oppure Varedo, Via Roma"]').first().fill('Varedo');
  } else if (service === 'b2b') {
    await page.getByLabel('Comune o zona di partenza Business').fill('Bergamo');
    await page.getByRole('radio', { name: /Informare/i }).click();
    await page.getByRole('radio', { name: /Consegna alla reception/i }).click();
    await page.getByRole('radio', { name: /Materiale.*presso VolantiniPro/i }).click();
  }
  if (service !== 'b2b') {
    await page.getByText('Prima possibile').first().click();
    const material = page.getByText(/Sì, voglio anche stampa/i).first();
    if (await material.count()) await material.click();
  }
  const format = page.getByText(/^A5$/i).first();
  if (await format.count()) await format.click();
  const plan = page.getByText(/^Singola$/i).first();
  if (await plan.count()) await plan.click();
  const next = page.getByRole('button', { name: /Continua allo Step 2/i });
  await next.waitFor({ state: 'visible' });
  assert(await next.isEnabled(), `Step 1 non completato: ${await page.getByRole('status', { name: 'Stato compilazione Step 1' }).innerText().catch(() => 'stato non disponibile')}`, 'infrastructure');
  await next.click();
  await page.waitForURL(/\/zona/);
}

async function selectMunicipality(page, name) {
  const search = page.locator('input[placeholder="Cerca comune"]').first();
  await search.fill(name);
  const suggestion = page.getByText(name, { exact: true }).last();
  await suggestion.waitFor({ state: 'visible', timeout: 10000 });
  await suggestion.click();
}

async function waitForTruth(page, service, territory, { ready = true } = {}) {
  await page.waitForFunction(({ service, territory, ready }) => {
    const state = window.__VOLANTINIPRO_STEP2_STATE__;
    const truth = state?.truthModel;
    if (!truth || truth.service?.key !== service) return false;
    if (territory && !String(truth.territory?.label || '').toLowerCase().includes(territory.toLowerCase())) return false;
    return ready ? truth.calculation?.status === 'ready' : true;
  }, { service, territory, ready }, { timeout: 15000 });
  return page.evaluate(() => structuredClone(window.__VOLANTINIPRO_STEP2_STATE__));
}

async function chooseKeep(page) {
  const keep = page.getByRole('button', { name: /Mantieni/i }).first();
  if (await keep.count()) await keep.click();
}

async function selectOperationalPois(page, service) {
  const name = service === 'b2b' ? /Seleziona automaticamente/i : /Seleziona tutti e assegna/i;
  const select = page.getByRole('button', { name }).first();
  await select.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(
    label => [...document.querySelectorAll('button')].some(button => button.textContent?.includes(label) && !button.disabled),
    service === 'b2b' ? 'Seleziona automaticamente' : 'Seleziona tutti e assegna',
    { timeout: 15000 },
  );
  await select.click();
}

async function main() {
  const results = [];
  const ledger = { activeService: 'd2d', analysisIstat: 0, analysisPoi: 0, overpass: 0, transport: 0, geocode: 0, nominatim: 0, demographics: 0, unhandled: [] };
  const browser = await chromium.launch(browserLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  const expectedBoundaryConsoleErrors = [];
  const leafletRequests = { local: [], cdn: [] };
  context.on('request', request => {
    const url = request.url();
    if (/(?:unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com).*leaflet/i.test(url)) leafletRequests.cdn.push(url);
    if (url.startsWith(projectUrl) && /leaflet/i.test(url)) leafletRequests.local.push(url);
  });
  context.on('page', observedPage => observedPage.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/CONTROLLED_STEP2_RENDER_FAILURE/.test(text)) expectedBoundaryConsoleErrors.push(text);
    else consoleErrors.push(text);
  }));
  await context.addInitScript(() => { window.__VOLANTINIPRO_DEBUG_STEP2__ = true; });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(`[d2d] ${error.stack || error.message}`));
  await installOfflineRoutes(page, ledger);

  try {
    await gotoStep2(page);
    await selectMunicipality(page, 'Varedo');
    await chooseKeep(page);
    const d2d = await waitForTruth(page, 'd2d', 'Varedo');
    assert(d2d.truthModel.quantity.recommendedRequirement === 6794, `D2D recommended inatteso: ${d2d.truthModel.quantity.recommendedRequirement}`, 'fixture');
    assert(d2d.truthModel.coverage.operationalPct != null, 'D2D coverage non disponibile');
    assert(d2d.truthModel.rawData?.territorialAnalysis?.values?.famiglie_stimate === 6176, 'Raw data D2D non persistiti', 'fixture');
    await page.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => window.__VOLANTINIPRO_STEP2_MAP_STATE__?.totalLeafletLayerCount > 1, null, { timeout: 10000 });
    const tileErrorSimulated = await page.evaluate(() => {
      const tile = document.querySelector('.leaflet-tile');
      if (!tile) return false;
      tile.dispatchEvent(new Event('error'));
      return true;
    });
    assert(tileErrorSimulated, 'Nessuna tile disponibile per simulare tileerror', 'infrastructure');
    assert(!(await page.getByRole('alert').filter({ hasText: /mappa non è temporaneamente disponibile/i }).isVisible().catch(() => false)), 'Una singola tile fallita ha prodotto errore globale mappa');
    assert((await page.evaluate(() => window.__VOLANTINIPRO_STEP2_MAP_STATE__?.totalLeafletLayerCount || 0)) > 1, 'Il tileerror ha rimosso i layer territoriali');
    results.push({ scenario: 'D2D Varedo', status: 'PASS', canonical: { territory: d2d.truthModel.territory.label, quantity: d2d.truthModel.quantity, coverage: d2d.truthModel.coverage } });
    results.push({ scenario: 'Leaflet locale e tileerror', status: 'PASS', mapVisible: true, territorialLayersPreserved: true, tileErrorNonBlocking: true });

    const beforeStep3 = structuredClone(d2d.truthModel);
    const continueButton = page.locator('button.btn').last();
    assert(await continueButton.isEnabled(), `CTA Step 3 disabilitata: ${await continueButton.innerText()}`);
    await page.waitForTimeout(800);
    await continueButton.click();
    await page.waitForURL(/\/calendario/);
    results.push({ scenario: 'Step 2 → Step 3', status: 'PASS', route: page.url() });
    const back = page.getByRole('button', { name: /Zona e mappa|Indietro/i }).first();
    await back.waitFor({ state: 'visible' });
    await back.click();
    await page.waitForURL(/\/zona/);
    const returned = await waitForTruth(page, 'd2d', 'Varedo');
    assert(returned.truthModel.quantity.current === beforeStep3.quantity.current, 'Quantità corrente cambiata al ritorno');
    assert(returned.truthModel.quantity.recommendedRequirement === beforeStep3.quantity.recommendedRequirement, 'Quantità consigliata cambiata al ritorno');
    assert(returned.truthModel.coverage.operationalPct === beforeStep3.coverage.operationalPct, 'Copertura cambiata al ritorno');
    assert(returned.truthModel.userSelections.coverageDecision === beforeStep3.userSelections.coverageDecision, 'Decisione di copertura cambiata al ritorno');
    await page.locator('.leaflet-container').waitFor({ state: 'visible', timeout: 10000 });
    assert(!pageErrors.some(message => /Map container is already initialized/i.test(message)), 'Leaflet duplicato dopo Step 3 → Step 2');
    results.push({ scenario: 'Step 3 → Step 2 e persistenza', status: 'PASS', canonicalStable: true });

    const boundaryStateBefore = {
      service: returned.truthModel.service.key,
      municipality: returned.truthModel.userSelections.selectedMunicipalities[0]?.name,
      radiusKm: returned.truthModel.userSelections.radiusKm,
      quantity: returned.truthModel.quantity.current,
      coverageDecision: returned.truthModel.userSelections.coverageDecision,
    };
    const pageIdentity = await page.evaluate(() => {
      window.__VOLANTINIPRO_P2D_PAGE_ID__ ||= Math.random().toString(36).slice(2);
      return window.__VOLANTINIPRO_P2D_PAGE_ID__;
    });
    await page.evaluate(() => {
      window.__VOLANTINIPRO_TEST_STEP2_THROW__ = true;
      window.dispatchEvent(new Event('volantinipro:test-step2-render'));
    });
    const boundaryFallback = page.locator('.vp-step2-error-fallback');
    await boundaryFallback.waitFor({ state: 'visible', timeout: 10000 });
    assert(await boundaryFallback.getAttribute('role') === 'alert', 'Fallback Step 2 privo di role=alert');
    assert(await boundaryFallback.getAttribute('aria-live') === 'assertive', 'Fallback Step 2 privo di aria-live=assertive');
    assert(await page.locator('#root').isVisible(), 'Shell applicazione non visibile dopo il crash Step 2');
    const fallbackText = await boundaryFallback.innerText();
    assert(!/CONTROLLED_|Error:|\.jsx|componentStack|\s+at\s+/i.test(fallbackText), 'Fallback Step 2 espone dettagli tecnici');
    assert(await boundaryFallback.locator('h2').evaluate(element => element === document.activeElement), 'Focus non spostato sul titolo del fallback');
    const firstErrorId = (await page.getByTestId('step2-error-id').innerText()).trim();
    assert(/^S2-[A-HJ-NP-Z2-9]{6}$/.test(firstErrorId), `ID errore Step 2 non sicuro: ${firstErrorId}`);

    await page.evaluate(() => { window.__VOLANTINIPRO_TEST_STEP2_THROW__ = false; });
    await page.getByRole('button', { name: 'Riprova', exact: true }).click();
    await boundaryFallback.waitFor({ state: 'detached', timeout: 10000 });
    const afterRetry = await waitForTruth(page, 'd2d', 'Varedo');
    const boundaryStateAfter = {
      service: afterRetry.truthModel.service.key,
      municipality: afterRetry.truthModel.userSelections.selectedMunicipalities[0]?.name,
      radiusKm: afterRetry.truthModel.userSelections.radiusKm,
      quantity: afterRetry.truthModel.quantity.current,
      coverageDecision: afterRetry.truthModel.userSelections.coverageDecision,
    };
    assert(
      JSON.stringify(boundaryStateAfter) === JSON.stringify(boundaryStateBefore),
      `Retry ErrorBoundary ha modificato lo stato parent Step 2: prima=${JSON.stringify(boundaryStateBefore)} dopo=${JSON.stringify(boundaryStateAfter)}`,
      'infrastructure',
    );

    await page.evaluate(() => {
      window.__VOLANTINIPRO_TEST_STEP2_THROW__ = true;
      window.dispatchEvent(new Event('volantinipro:test-step2-render'));
    });
    await boundaryFallback.waitFor({ state: 'visible', timeout: 10000 });
    const secondErrorId = (await page.getByTestId('step2-error-id').innerText()).trim();
    assert(secondErrorId !== firstErrorId, 'Due crash distinti hanno prodotto lo stesso error ID');
    await page.evaluate(() => { window.__VOLANTINIPRO_TEST_STEP2_THROW__ = false; });
    await page.getByRole('button', { name: 'Torna allo Step 1', exact: true }).click();
    await page.waitForURL(/\/configuratore/);
    assert(await page.evaluate(() => window.__VOLANTINIPRO_P2D_PAGE_ID__) === pageIdentity, 'Torna allo Step 1 ha ricaricato la pagina');
    const returnToStep2 = page.getByRole('button', { name: /Continua allo Step 2/i });
    await returnToStep2.waitFor({ state: 'visible', timeout: 10000 });
    assert(await returnToStep2.isEnabled(), 'Step 1 non conserva una configurazione valida dopo il fallback');
    await returnToStep2.click();
    await page.waitForURL(/\/zona/);
    await waitForTruth(page, 'd2d', 'Varedo');
    results.push({ scenario: 'ErrorBoundary Step 2', status: 'PASS', fallbackAccessible: true, retryPreservesState: true, backWithoutReload: true, returnToStep2: true, distinctErrorIds: true });

    const initErrorPage = await context.newPage();
    initErrorPage.on('pageerror', error => pageErrors.push(`[leaflet-init-error] ${error.stack || error.message}`));
    await initErrorPage.addInitScript(() => {
      window.ResizeObserver = class ControlledResizeObserverFailure {
        constructor() { throw new Error('CONTROLLED_LEAFLET_INIT_FAILURE'); }
      };
    });
    await installOfflineRoutes(initErrorPage, ledger);
    await gotoStep2(initErrorPage, 'd2d');
    await selectMunicipality(initErrorPage, 'Varedo');
    await chooseKeep(initErrorPage);
    const initErrorTruth = await waitForTruth(initErrorPage, 'd2d', 'Varedo');
    const mapAlert = initErrorPage.getByRole('alert').filter({ hasText: /La mappa non è temporaneamente disponibile/i });
    await mapAlert.waitFor({ state: 'visible', timeout: 10000 });
    assert(/I dati della zona restano disponibili/i.test(await mapAlert.innerText()), 'Errore mappa senza conferma disponibilità dati');
    assert(!/CONTROLLED_|Error:|at Step2Map/i.test(await mapAlert.innerText()), 'Stack o dettaglio tecnico visibile nello stato errore mappa');
    assert(initErrorTruth.truthModel.rawData?.territorialAnalysis?.values?.famiglie_stimate === 6176, 'Errore Leaflet ha cancellato dati territoriali validi');
    results.push({ scenario: 'Errore inizializzazione Leaflet', status: 'PASS', accessibleAlert: true, territorialDataPreserved: true, unhandledError: false });
    await initErrorPage.close();

    const keyboardPage = await context.newPage();
    keyboardPage.on('pageerror', error => pageErrors.push(`[keyboard] ${error.stack || error.message}`));
    await installOfflineRoutes(keyboardPage, ledger);
    await gotoStep2(keyboardPage, 'd2d');
    const keyboardSearch = keyboardPage.locator('input[placeholder="Cerca comune"]').first();
    await keyboardSearch.fill('Varedo');
    const keyboardSuggestion = keyboardPage.getByRole('button', { name: 'Varedo', exact: true }).last();
    await keyboardSuggestion.waitFor({ state: 'visible', timeout: 10000 });
    await keyboardSearch.press('Tab');
    await keyboardPage.keyboard.press('Tab');
    assert(await keyboardSuggestion.evaluate(element => element === document.activeElement), 'Tab non raggiunge il suggerimento comune');
    assert(await keyboardSuggestion.evaluate(element => getComputedStyle(element).outlineStyle !== 'none'), 'Focus del suggerimento non visibile');
    await keyboardPage.keyboard.press('Enter');
    const keyboardEnterState = await waitForTruth(keyboardPage, 'd2d', 'Varedo');
    assert(/\/zona\/?$/.test(new URL(keyboardPage.url()).pathname), 'Enter sul suggerimento ha causato un submit/navigazione inattesa');
    assert(keyboardEnterState.truthModel.userSelections.selectedMunicipalities[0]?.name === d2d.truthModel.userSelections.selectedMunicipalities[0]?.name, 'Enter e click producono comuni canonici diversi');

    await keyboardSearch.fill('Varedo');
    await keyboardSuggestion.waitFor({ state: 'visible', timeout: 10000 });
    await keyboardSuggestion.focus();
    await keyboardPage.keyboard.press('Space');
    const keyboardSpaceState = await waitForTruth(keyboardPage, 'd2d', 'Varedo');
    assert(keyboardSpaceState.truthModel.userSelections.selectedMunicipalities[0]?.name === 'Varedo', 'Space non seleziona lo stesso comune canonico');
    assert(/\/zona\/?$/.test(new URL(keyboardPage.url()).pathname), 'Space sul suggerimento ha causato un submit/navigazione inattesa');

    await keyboardSearch.fill('Bergamo');
    await keyboardPage.getByRole('button', { name: 'Bergamo', exact: true }).last().waitFor({ state: 'visible', timeout: 10000 });
    await keyboardSearch.press('Escape');
    assert(!(await keyboardPage.getByRole('button', { name: 'Bergamo', exact: true }).last().isVisible()), 'Escape non chiude la lista suggerimenti');
    results.push({ scenario: 'Geocoding accessibile', status: 'PASS', tab: true, enter: true, space: true, escape: true, canonicalStable: true });
    await keyboardPage.waitForTimeout(800);
    await keyboardPage.close();

    ledger.activeService = 'h2h';
    const h2hPage = await context.newPage();
    h2hPage.on('pageerror', error => pageErrors.push(`[h2h] ${error.stack || error.message}`));
    await installOfflineRoutes(h2hPage, ledger);
    await gotoStep2(h2hPage, 'h2h');
    await selectOperationalPois(h2hPage, 'h2h');
    const h2h = await waitForTruth(h2hPage, 'h2h', 'Varedo');
    assert(h2h.truthModel.h2h.available === true, 'H2H non disponibile con POI selezionato');
    assert(h2h.truthModel.territory.pois.length > 0, 'POI H2H non persistiti');
    assert(h2h.truthModel.quantity.recommendedRequirement != null, 'Quantità H2H non normalizzata');
    assert(h2h.truthModel.rawData.transport != null, 'Stato TPL H2H non persistito', 'fixture');
    results.push({ scenario: 'H2H offline', status: 'PASS', canonical: { points: h2h.truthModel.territory.pois.length, quantity: h2h.truthModel.quantity, mobility: h2h.truthModel.availability.mobility } });

    const racePage = await context.newPage();
    racePage.on('pageerror', error => pageErrors.push(`[race] ${error.stack || error.message}`));
    const raceControl = { active: false };
    await installOfflineRoutes(racePage, ledger, { staleRace: raceControl });
    await gotoStep2(racePage, 'h2h');
    await waitForTruth(racePage, 'h2h', 'Varedo');
    raceControl.active = true;
    const overpassBeforeRace = ledger.overpass;
    const transportBeforeRace = ledger.transport;

    const raceSearch = racePage.locator('input[placeholder="Cerca comune o CAP"]').first();
    await raceSearch.fill('Milano');
    const milanoSuggestion = racePage.getByRole('button', { name: 'Milano', exact: true }).last();
    await milanoSuggestion.waitFor({ state: 'visible', timeout: 10000 });
    await milanoSuggestion.click();
    for (let attempt = 0; attempt < 40 && (ledger.overpass === overpassBeforeRace || ledger.transport === transportBeforeRace); attempt += 1) {
      await racePage.waitForTimeout(50);
    }
    assert(ledger.overpass > overpassBeforeRace && ledger.transport > transportBeforeRace, 'Le richieste lente della prima zona non sono partite', 'infrastructure');

    await raceSearch.fill('Bergamo');
    const bergamoSuggestion = racePage.getByRole('button', { name: 'Bergamo', exact: true }).last();
    await bergamoSuggestion.waitFor({ state: 'visible', timeout: 10000 });
    await bergamoSuggestion.click();
    await racePage.waitForFunction(() => /Bergamo/i.test(window.__VOLANTINIPRO_STEP2_STATE__?.truthModel?.territory?.label || ''), null, { timeout: 10000 });
    try {
      await racePage.waitForFunction(() => {
        const truth = window.__VOLANTINIPRO_STEP2_STATE__?.truthModel;
        const poiText = JSON.stringify(truth?.rawData?.pois || []);
        const transportText = JSON.stringify(truth?.rawData?.transport || {});
        return /Bergamo/i.test(poiText) && /Bergamo/i.test(transportText);
      }, null, { timeout: 20000 });
    } catch (error) {
      const debugState = await racePage.evaluate(() => {
        const truth = window.__VOLANTINIPRO_STEP2_STATE__?.truthModel;
        return { territory: truth?.territory?.label, pois: truth?.rawData?.pois, transport: truth?.rawData?.transport };
      });
      throw new Error(`Race POI/TPL non stabilizzata: ${JSON.stringify(debugState)}`);
    }
    const raceState = await racePage.evaluate(() => structuredClone(window.__VOLANTINIPRO_STEP2_STATE__));
    const finalServiceData = JSON.stringify({ pois: raceState.truthModel.rawData.pois, transport: raceState.truthModel.rawData.transport });
    assert(!/Milano/i.test(finalServiceData), 'POI/TPL della prima zona sono stati applicati dopo Bergamo');
    assert(!(await racePage.getByTestId('poi-availability-warning').isVisible().catch(() => false)), 'Abort intenzionale ha mostrato warning POI');
    assert(!(await racePage.getByTestId('transport-availability-warning').isVisible().catch(() => false)), 'Abort intenzionale ha mostrato warning TPL');

    await selectOperationalPois(racePage, 'h2h');
    await waitForTruth(racePage, 'h2h', 'Bergamo');
    await racePage.waitForTimeout(800);
    const raceContinue = racePage.locator('button.btn').last();
    await raceContinue.click();
    await racePage.waitForURL(/\/calendario/);
    await racePage.getByRole('button', { name: /Zona e mappa|Indietro/i }).first().click();
    await racePage.waitForURL(/\/zona/);
    await waitForTruth(racePage, 'h2h', 'Bergamo');
    await racePage.waitForTimeout(800);
    results.push({ scenario: 'Richieste obsolete Milano/Bergamo', status: 'PASS', finalMunicipality: 'Bergamo', stalePoiTplApplied: false, warningsFromAbort: false, roundTrip: true });
    await racePage.close();

    const errorPage = await context.newPage();
    errorPage.on('pageerror', error => pageErrors.push(`[error] ${error.stack || error.message}`));
    await installOfflineRoutes(errorPage, ledger, { failPoi: true, failTransport: true });
    await gotoStep2(errorPage, 'h2h');
    const poiWarning = errorPage.getByTestId('poi-availability-warning');
    const transportWarning = errorPage.getByTestId('transport-availability-warning');
    await poiWarning.waitFor({ state: 'visible', timeout: 15000 });
    await transportWarning.waitFor({ state: 'visible', timeout: 15000 });
    assert(await poiWarning.getAttribute('role') === 'status', 'Warning POI privo di role=status');
    assert(await transportWarning.getAttribute('role') === 'status', 'Warning TPL privo di role=status');
    assert(!/OVERPASS|TRANSPORT_RPC/i.test(await poiWarning.innerText()), 'Warning POI espone codice tecnico');
    assert(!/OVERPASS|TRANSPORT_RPC/i.test(await transportWarning.innerText()), 'Warning TPL espone codice tecnico');
    const errorState = await waitForTruth(errorPage, 'h2h', 'Varedo', { ready: false });
    assert(errorState.truthModel.userSelections.selectedMunicipalities[0]?.name === 'Varedo', 'Gli errori servizi hanno modificato il comune canonico');
    assert(errorState.truthModel.rawData?.territorialAnalysis?.values?.famiglie_stimate === 6176, 'Gli errori servizi hanno nascosto dati territoriali validi');
    assert(!(await errorPage.getByText(/Nessun luogo compatibile trovato/i).isVisible().catch(() => false)), 'Empty state POI mostrato insieme allo stato di errore');
    results.push({ scenario: 'Errori POI/TPL visibili', status: 'PASS', nonBlocking: true, canonicalStable: true, territorialDataPreserved: true });
    await errorPage.close();

    const emptyPage = await context.newPage();
    emptyPage.on('pageerror', error => pageErrors.push(`[empty] ${error.stack || error.message}`));
    await installOfflineRoutes(emptyPage, ledger, { emptyPoi: true });
    await gotoStep2(emptyPage, 'h2h');
    const emptyState = emptyPage.getByText(/Nessun luogo compatibile trovato/i);
    await emptyState.waitFor({ state: 'visible', timeout: 15000 });
    assert(!(await emptyPage.getByTestId('poi-availability-warning').isVisible().catch(() => false)), 'Warning POI mostrato con risposta valida vuota');
    results.push({ scenario: 'POI empty state distinto', status: 'PASS' });
    await emptyPage.close();

    ledger.activeService = 'b2b';
    const businessPage = await context.newPage();
    businessPage.on('pageerror', error => pageErrors.push(`[business] ${error.stack || error.message}`));
    await installOfflineRoutes(businessPage, ledger);
    await gotoStep2(businessPage, 'b2b');
    await selectOperationalPois(businessPage, 'b2b');
    const business = await waitForTruth(businessPage, 'b2b', 'Bergamo');
    const materialPlan = business.truthModel.business.materialPlan;
    assert(business.truthModel.territory.activities.length >= 1, 'Attività Business non persistite');
    assert(materialPlan?.materialsRequired === materialPlan.rows.reduce((sum, row) => sum + row.copies, 0), 'Formula materiali Business non canonica');
    assert(business.truthModel.business.competitorCount === null, 'Competitor sintetico presente');
    assert(business.truthModel.territory.nils.length === 0, 'NIL presenti nel Business');
    results.push({ scenario: 'Business Bergamo', status: 'PASS', canonical: { territory: business.truthModel.territory.label, activities: business.truthModel.territory.activities.length, materialsRequired: materialPlan.materialsRequired, competitorCount: business.truthModel.business.competitorCount } });

    assert(ledger.analysisIstat > 0, 'Fixture analysis-istat non utilizzata', 'infrastructure');
    assert(ledger.analysisPoi >= 2, 'Fixture analysis-poi-search non utilizzata per H2H e Business', 'infrastructure');
    assert(ledger.overpass >= 2, 'Fixture Overpass non utilizzata', 'infrastructure');
    assert(leafletRequests.local.length > 0, 'Leaflet non è stato richiesto dal server locale del progetto', 'infrastructure');
    assert(leafletRequests.cdn.length === 0, `Richieste CDN Leaflet: ${leafletRequests.cdn.join(' | ')}`);
    assert(ledger.unhandled.length === 0, `Fixture request non gestite: ${JSON.stringify(ledger.unhandled)}`, 'infrastructure');
    assert(pageErrors.length === 0, `Errori pagina: ${pageErrors.join(' | ')}`);
    assert(consoleErrors.length === 0, `Errori console: ${consoleErrors.join(' | ')}`);
    assert(expectedBoundaryConsoleErrors.length > 0, 'Errore React controllato non osservato dal browser contract', 'infrastructure');
    console.log(JSON.stringify({ status: 'PASS', results, ledger, pageErrors, consoleErrors, expectedBoundaryConsoleErrors, leafletRequests }, null, 2));
  } catch (error) {
    const state = await page.evaluate(() => window.__VOLANTINIPRO_STEP2_STATE__ ? structuredClone(window.__VOLANTINIPRO_STEP2_STATE__) : null).catch(() => null);
    const classification = error.classification || (/locator\.|waitFor|Timeout/i.test(error.message) ? 'infrastructure' : 'application');
    console.error(JSON.stringify({ status: 'FAIL', classification, message: error.message, results, ledger, pageErrors, consoleErrors, expectedBoundaryConsoleErrors, leafletRequests, state }, null, 2));
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

main();
