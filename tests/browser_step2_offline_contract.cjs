const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const projectUrl = 'http://localhost:5173/';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

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
  Bergamo: { code: '016024', lat: 45.6983, lng: 9.6773, households: 52500, population: 120580, area: 40.2, recommended: 57750 },
};

function territoryFromUrl(url) {
  const parsed = new URL(url);
  const municipality = decodeURIComponent(parsed.searchParams.get('municipality') || '');
  return /bergamo/i.test(municipality) ? territories.Bergamo : territories.Varedo;
}

function analysisFixture(url, service) {
  const territory = territoryFromUrl(url);
  const name = territory === territories.Bergamo ? 'Bergamo' : 'Varedo';
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
  const item = decoded.includes('bergamo') ? { name: 'Bergamo', ...territories.Bergamo } : { name: 'Varedo', ...territories.Varedo };
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

const businessElements = [
  { type: 'node', id: 201, lat: 45.699, lon: 9.678, tags: { shop: 'convenience', name: 'Bottega Bergamo', 'addr:street': 'Via Roma', 'addr:housenumber': '1', 'addr:city': 'Bergamo' } },
  { type: 'node', id: 202, lat: 45.697, lon: 9.675, tags: { amenity: 'pharmacy', name: 'Farmacia Centrale', 'addr:street': 'Via XX Settembre', 'addr:city': 'Bergamo' } },
  { type: 'node', id: 203, lat: 45.701, lon: 9.68, tags: { office: 'company', name: 'Bergamo Servizi', 'addr:city': 'Bergamo' } },
  { type: 'node', id: 204, lat: 45.696, lon: 9.681, tags: { amenity: 'restaurant', name: 'Ristorante Città Alta', 'addr:city': 'Bergamo' } },
];

async function installOfflineRoutes(page, ledger) {
  await page.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/functions/v1/analysis-istat')) {
      ledger.analysisIstat += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisFixture(url, 'd2d')) });
    }
    if (url.includes('/functions/v1/analysis-poi-search')) {
      ledger.analysisPoi += 1;
      const service = new URL(url).searchParams.get('service') || 'h2h';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysisFixture(url, service)) });
    }
    if (/overpass/i.test(url)) {
      ledger.overpass += 1;
      const body = request.postData() || '';
      const elements = /office|pharmacy|tobacco|company|restaurant/i.test(decodeURIComponent(body)) && ledger.activeService === 'b2b' ? businessElements : h2hElements;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 0.6, elements }) });
    }
    if (url.includes('/rest/v1/rpc/get_transport_stops_in_radius')) {
      ledger.transport += 1;
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
    if (url.includes('fonts.') || url.includes('/tiles/') || url.includes('mapbox')) return route.abort();
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

async function readCoveragePercents(page) {
  return page.evaluate(() => {
    const matches = [];
    const re = /(\d{1,3}(?:[.,]\d)?)\s*%\s*del fabbisogno operativo/g;
    let m;
    while ((m = re.exec(document.body.innerText)) !== null) matches.push(m[1].replace(',', '.'));
    return matches;
  });
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
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { window.__VOLANTINIPRO_DEBUG_STEP2__ = true; });
  const consoleErrors = [];
  function trackPage(p) {
    p.on('pageerror', error => pageErrors.push(error.stack || error.message));
    p.on('console', msg => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // "Failed to load resource" is the browser's own log for requests this harness
      // intentionally aborts (fonts/tiles/mapbox, see installOfflineRoutes) — expected noise, not an app bug.
      if (/Failed to load resource/i.test(text)) return;
      consoleErrors.push(text);
    });
  }
  const page = await context.newPage();
  const pageErrors = [];
  trackPage(page);
  await installOfflineRoutes(page, ledger);

  try {
    await gotoStep2(page);
    await selectMunicipality(page, 'Varedo');
    await chooseKeep(page);
    const d2d = await waitForTruth(page, 'd2d', 'Varedo');
    assert(d2d.truthModel.quantity.recommendedRequirement === 6794, `D2D recommended inatteso: ${d2d.truthModel.quantity.recommendedRequirement}`, 'fixture');
    assert(d2d.truthModel.coverage.operationalPct != null, 'D2D coverage non disponibile');
    assert(d2d.truthModel.rawData?.territorialAnalysis?.values?.famiglie_stimate === 6176, 'Raw data D2D non persistiti', 'fixture');

    const zoneDetailsTrigger = page.locator('.vp-step2-zone-details__trigger').first();
    if (await zoneDetailsTrigger.count() && (await zoneDetailsTrigger.getAttribute('aria-expanded')) !== 'true') {
      await zoneDetailsTrigger.click();
    }
    const zoneToggle = page.locator('.vp-step2-zone-table button[aria-expanded]').first();
    await zoneToggle.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    let zoneDetailChecked = false;
    if (await zoneToggle.count()) {
      assert((await zoneToggle.getAttribute('aria-expanded')) === 'false', 'Riga zona già espansa inaspettatamente');
      await zoneToggle.click();
      assert((await zoneToggle.getAttribute('aria-expanded')) === 'true', 'Espansione riga zona D2D non riuscita');
      const detailId = await zoneToggle.getAttribute('aria-controls');
      const detailRow = page.locator(`#${detailId}`);
      await detailRow.waitFor({ state: 'visible', timeout: 5000 });
      assert(await detailRow.count() > 0, 'Riga dettaglio zona D2D non renderizzata');
      zoneDetailChecked = true;
    }
    assert(zoneDetailChecked, 'Nessuna riga zona D2D disponibile per verificare il dettaglio espandibile', 'infrastructure');

    const coveragePercents = await readCoveragePercents(page);
    if (coveragePercents.length > 1) {
      const distinct = new Set(coveragePercents.map(Number));
      assert(distinct.size === 1, `Percentuali di copertura non uniformi nella UI D2D: ${coveragePercents.join(', ')}`);
    }

    results.push({ scenario: 'D2D Varedo', status: 'PASS', canonical: { territory: d2d.truthModel.territory.label, quantity: d2d.truthModel.quantity, coverage: d2d.truthModel.coverage }, uiChecks: { zoneDetailChecked, coveragePercents } });

    const beforeStep3 = structuredClone(d2d.truthModel);
    const continueButton = page.locator('button.btn').last();
    assert(await continueButton.isEnabled(), `CTA Step 3 disabilitata: ${await continueButton.innerText()}`);
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
    results.push({ scenario: 'Step 3 → Step 2 e persistenza', status: 'PASS', canonicalStable: true });

    ledger.activeService = 'h2h';
    const h2hPage = await context.newPage();
    trackPage(h2hPage);
    await installOfflineRoutes(h2hPage, ledger);
    await gotoStep2(h2hPage, 'h2h');
    await selectOperationalPois(h2hPage, 'h2h');
    const h2h = await waitForTruth(h2hPage, 'h2h', 'Varedo');
    assert(h2h.truthModel.h2h.available === true, 'H2H non disponibile con POI selezionato');
    assert(h2h.truthModel.territory.pois.length > 0, 'POI H2H non persistiti');
    assert(h2h.truthModel.quantity.recommendedRequirement != null, 'Quantità H2H non normalizzata');
    assert(h2h.truthModel.rawData.transport != null, 'Stato TPL H2H non persistito', 'fixture');

    const clusterLabels = await h2hPage.evaluate(() => [...document.querySelectorAll('[role="img"][aria-label]')]
      .filter(el => /punt[oi] raggruppat/i.test(el.getAttribute('aria-label') || ''))
      .map(el => el.getAttribute('aria-label')));
    clusterLabels.forEach(label => assert(/^\d+ punt[oi] raggruppat[oi]$/i.test(label), `Etichetta cluster non accessibile: ${label}`));

    const h2hFilterGroup = h2hPage.getByRole('group', { name: 'Filtri categoria POI' });
    let h2hFilterChecked = false;
    if (await h2hFilterGroup.count()) {
      const scuoleFilter = h2hFilterGroup.getByRole('button', { name: /^Scuole/i });
      assert((await scuoleFilter.count()) === 0, 'Filtro categoria H2H "Scuole" mostrato senza POI corrispondenti (target campagna limitato a Stazioni)');
      const stazioniFilter = h2hFilterGroup.getByRole('button', { name: /^Stazioni e fermate/i });
      assert(await stazioniFilter.count() > 0, 'Filtro categoria H2H "Stazioni e fermate" mancante nonostante Stazione Varedo in elenco');
      assert(/\(\d+\)/.test(await stazioniFilter.innerText()), 'Filtro categoria H2H "Stazioni e fermate" senza conteggio');
      await stazioniFilter.click();
      await h2hPage.getByText('Stazione Varedo', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
      const tuttiFilter = h2hFilterGroup.getByRole('button', { name: /^Tutti/i });
      await tuttiFilter.click();
      await h2hPage.getByText('Stazione Varedo', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
      h2hFilterChecked = true;
    }
    assert(h2hFilterChecked, 'Filtro categoria H2H non disponibile per la verifica', 'infrastructure');

    const poiRow = h2hPage.locator('div[role="button"]').filter({ hasText: 'Stazione Varedo' }).first();
    let focusChecked = false;
    if (await poiRow.count()) {
      assert((await poiRow.getAttribute('aria-pressed')) === 'false', 'Riga POI H2H già focalizzata inaspettatamente');
      await poiRow.click();
      assert((await poiRow.getAttribute('aria-pressed')) === 'true', 'Click su riga POI H2H non ha attivato il focus mappa');
      focusChecked = true;
    }
    assert(focusChecked, 'Nessuna riga POI H2H disponibile per verificare il click-to-center', 'infrastructure');

    results.push({ scenario: 'H2H offline', status: 'PASS', canonical: { points: h2h.truthModel.territory.pois.length, quantity: h2h.truthModel.quantity, mobility: h2h.truthModel.availability.mobility }, uiChecks: { clusterLabels, h2hFilterChecked, focusChecked } });

    ledger.activeService = 'b2b';
    const businessPage = await context.newPage();
    trackPage(businessPage);
    await installOfflineRoutes(businessPage, ledger);
    await gotoStep2(businessPage, 'b2b');
    await selectOperationalPois(businessPage, 'b2b');
    const business = await waitForTruth(businessPage, 'b2b', 'Bergamo');
    const materialPlan = business.truthModel.business.materialPlan;
    assert(business.truthModel.territory.activities.length >= 1, 'Attività Business non persistite');
    assert(materialPlan?.materialsRequired === materialPlan.rows.reduce((sum, row) => sum + row.copies, 0), 'Formula materiali Business non canonica');
    assert(business.truthModel.business.competitorCount === null, 'Competitor sintetico presente');
    assert(business.truthModel.territory.nils.length === 0, 'NIL presenti nel Business');

    const businessFilterGroup = businessPage.getByRole('group', { name: 'Filtri attività Business' });
    let businessFilterChecked = false;
    if (await businessFilterGroup.count()) {
      const healthButton = businessFilterGroup.getByRole('button', { name: /^Sanitario/i });
      assert((await healthButton.count()) === 0, 'Filtro Business "Sanitario" mostrato senza attività corrispondenti (categorie vuote non nascoste, target campagna limitato a Retail)');
      const shopsButton = businessFilterGroup.getByRole('button', { name: /^Negozi/i });
      assert(await shopsButton.count() > 0, 'Filtro Business "Negozi" mancante nonostante Bottega Bergamo in elenco');
      assert(/\(\d+\)/.test(await shopsButton.innerText()), 'Filtro Business "Negozi" senza conteggio categoria');
      await shopsButton.click();
      await businessPage.getByText('Bottega Bergamo', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
      await businessFilterGroup.getByRole('button', { name: /^Tutte$/i }).click();
      await businessPage.getByText('Bottega Bergamo', { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
      businessFilterChecked = true;
    }
    assert(businessFilterChecked, 'Gruppo filtri Business non disponibile per la verifica', 'infrastructure');

    const businessRow = businessPage.locator('div[role="button"]').filter({ hasText: 'Bottega Bergamo' }).first();
    assert(await businessRow.count() > 0, 'Riga attività Business non trovata per verifica selezione');
    const businessSelectedButton = businessRow.getByRole('button', { name: /Selezionata/i });
    assert(await businessSelectedButton.count() > 0, 'Attività Business selezionata via "Seleziona automaticamente" non è visivamente distinta');
    assert((await businessSelectedButton.getAttribute('aria-pressed')) === 'true', 'Bottone selezione attività Business non riflette lo stato selezionato');

    results.push({ scenario: 'Business Bergamo', status: 'PASS', canonical: { territory: business.truthModel.territory.label, activities: business.truthModel.territory.activities.length, materialsRequired: materialPlan.materialsRequired, competitorCount: business.truthModel.business.competitorCount }, uiChecks: { businessFilterChecked } });

    assert(ledger.analysisIstat > 0, 'Fixture analysis-istat non utilizzata', 'infrastructure');
    assert(ledger.analysisPoi >= 2, 'Fixture analysis-poi-search non utilizzata per H2H e Business', 'infrastructure');
    assert(ledger.overpass >= 2, 'Fixture Overpass non utilizzata', 'infrastructure');
    assert(pageErrors.length === 0, `Errori pagina: ${pageErrors.join(' | ')}`);
    assert(consoleErrors.length === 0, `Errori console: ${consoleErrors.join(' | ')}`);
    assert(ledger.unhandled.length === 0, `Richieste fixture non gestite: ${ledger.unhandled.map(u => `${u.method} ${u.url}`).join(' | ')}`, 'infrastructure');
    console.log(JSON.stringify({ status: 'PASS', results, ledger, pageErrors, consoleErrors }, null, 2));
  } catch (error) {
    const state = await page.evaluate(() => window.__VOLANTINIPRO_STEP2_STATE__ ? structuredClone(window.__VOLANTINIPRO_STEP2_STATE__) : null).catch(() => null);
    const classification = error.classification || (/locator\.|waitFor|Timeout/i.test(error.message) ? 'infrastructure' : 'application');
    console.error(JSON.stringify({ status: 'FAIL', classification, message: error.message, results, ledger, pageErrors, consoleErrors, state }, null, 2));
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

main();
