const fs = require('fs');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const projectUrl = 'http://localhost:5173/';
const outDir = 'D:/cloaude volantini/volantinipro/artifacts/final-verification-2026-07-17/remaining-scenarios';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(outDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fmtIt(n) {
  return Number(n || 0).toLocaleString('it-IT');
}

function polygon(cx, cy, dx = 0, dy = 0, scale = 1) {
  return {
    type: 'Polygon',
    coordinates: [[
      [cx + dx - 0.01 * scale, cy + dy - 0.006 * scale],
      [cx + dx + 0.01 * scale, cy + dy - 0.006 * scale],
      [cx + dx + 0.01 * scale, cy + dy + 0.006 * scale],
      [cx + dx - 0.01 * scale, cy + dy + 0.006 * scale],
      [cx + dx - 0.01 * scale, cy + dy - 0.006 * scale],
    ]],
  };
}

const milanoNils = [
  ['1', 'Duomo', 88200, 97020, 12, 0, 0],
  ['2', 'Brera', 81100, 89210, 11, 0.01, 0.006],
  ['3', 'Porta Venezia', 76600, 84260, 10, 0.025, 0.002],
  ['4', 'Isola', 72100, 79310, 10, 0.025, 0.02],
  ['5', 'Navigli', 69900, 76890, 9, -0.015, -0.018],
  ['6', 'Citta Studi', 72200, 79420, 10, 0.04, 0.005],
  ['7', 'Bicocca', 68300, 75130, 9, 0.04, 0.04],
  ['8', 'Lorenteggio', 70400, 77440, 9, -0.04, -0.02],
  ['9', 'Niguarda', 73499, 80849, 10, 0.015, 0.045],
  ['10', 'Gallaratese', 82000, 90194, 10, -0.055, 0.03],
].map(([code, name, households, flyers, pct, dx, dy]) => ({
  id: `nil_${code}`,
  nil_code: code,
  nil_name: name,
  name,
  territory_level: 'nil',
  comune_name: 'Milano',
  municipality_code: '015146',
  households,
  families: households,
  population: Math.round(households * 1.82),
  area_km2: 12 + Number(code),
  pct_copertura: pct,
  recommended_flyers: flyers,
  volantini_nel_raggio: flyers,
  density_per_km2: 7549,
  geometry_geojson: polygon(9.19, 45.464, dx, dy),
}));

const milanoAnalysis = {
  success: true,
  analysis_level: 'nil',
  values: {
    analysis_level: 'nil',
    population: 1354196,
    households: 744299,
    famiglie_stimate: 744299,
    area_km2: 181.7,
    density: 7549,
    coverage_pct: 100,
    recommended_flyers: 818723,
    reach_score: 82,
    roi_score: 74,
    confidence_score: 86,
    family_index: 79,
  },
  comuni_breakdown: [{
    municipality_code: '015146',
    comune_name: 'Milano',
    population: 1354196,
    households: 744299,
    area_km2: 181.7,
    pct_copertura: 100,
    recommended_flyers: 818723,
    density_per_km2: 7549,
    geometry_geojson: polygon(9.19, 45.464, 0, 0, 8),
  }],
  nil_breakdown: milanoNils,
  territorial_breakdown: milanoNils,
  metadata: {
    analysis_level: 'nil',
    nil_available: true,
    municipality: 'Milano',
    omi: {
      available: true,
      zones: [
        { codice_zona: 'B12', description: 'Centro storico' },
        { codice_zona: 'C18', description: 'Semicentrale nord' },
      ],
      values: [
        { typology: 'Abitazioni civili', min_value: 5200, max_value: 7600, reference_period: '2025/2' },
      ],
    },
  },
  sources: ['ISTAT', 'Dati geografici', 'Agenzia Entrate - OMI'],
};

const milanoPartialAnalysis = {
  ...milanoAnalysis,
  metadata: { ...milanoAnalysis.metadata, omi: { available: false, zones: [], values: [] } },
  sources: ['ISTAT', 'Dati geografici'],
};

const breraRadiusAnalysis = {
  ...milanoAnalysis,
  values: {
    ...milanoAnalysis.values,
    households: 115039,
    famiglie_stimate: 115039,
    population: 209371,
    recommended_flyers: 126582,
    coverage_pct: 100,
  },
  comuni_breakdown: [{
    municipality_code: '015146',
    comune_name: 'Milano',
    population: 209371,
    households: 115039,
    area_km2: 28.3,
    pct_copertura: 100,
    recommended_flyers: 126582,
    density_per_km2: 7549,
    geometry_geojson: polygon(9.192, 45.471, 0, 0, 2),
  }],
  nil_breakdown: milanoNils.slice(0, 3).map((row, index) => ({
    ...row,
    households: [42000, 39039, 34000][index],
    families: [42000, 39039, 34000][index],
    population: Math.round([42000, 39039, 34000][index] * 1.82),
    recommended_flyers: [46200, 42943, 37439][index],
    volantini_nel_raggio: [46200, 42943, 37439][index],
  })),
  territorial_breakdown: milanoNils.slice(0, 3),
};

const multiRows = [
  {
    id: 'cormano',
    name: 'Cormano',
    comune_name: 'Cormano',
    municipality_code: '015086',
    population: 21800,
    pop: 21800,
    households: 8500,
    families: 8500,
    area_km2: 6.8,
    area: 6.8,
    pct_copertura: 100,
    coverage: 100,
    recommended_flyers: 11000,
    volantini_nel_raggio: 11000,
    density_per_km2: 3200,
    geometry_geojson: polygon(9.163, 45.551, 0, 0, 1.4),
  },
  {
    id: 'paderno',
    name: 'Paderno Dugnano',
    comune_name: 'Paderno Dugnano',
    municipality_code: '015166',
    population: 37800,
    pop: 37800,
    households: 15200,
    families: 15200,
    area_km2: 10.8,
    area: 10.8,
    pct_copertura: 100,
    coverage: 100,
    recommended_flyers: 18000,
    volantini_nel_raggio: 18000,
    density_per_km2: 3500,
    geometry_geojson: polygon(9.163, 45.568, 0, 0, 1.4),
  },
];

const multiAnalysis = {
  success: true,
  analysis_level: 'comune',
  values: {
    analysis_level: 'comune',
    population: 59600,
    households: 23700,
    famiglie_stimate: 23700,
    area_km2: 17.6,
    density: 3386,
    coverage_pct: 100,
    recommended_flyers: 29000,
    reach_score: 78,
    roi_score: 72,
    confidence_score: 82,
    family_index: 74,
  },
  zones: multiRows,
  comuni_breakdown: multiRows.map(row => ({
    municipality_code: row.municipality_code,
    comune_name: row.comune_name,
    population: row.population,
    households: row.households,
    area_km2: row.area_km2,
    pct_copertura: 100,
    recommended_flyers: row.recommended_flyers,
    density_per_km2: row.density_per_km2,
    geometry_geojson: row.geometry_geojson,
  })),
  territorial_breakdown: multiRows,
  sources: ['ISTAT', 'Dati geografici'],
};

const varedoNoNilAnalysis = {
  success: true,
  analysis_level: 'comune',
  values: {
    population: 13914,
    households: 6176,
    area_km2: 4.8,
    density: 2898,
    coverage_pct: 100,
    recommended_flyers: 6794,
    reach_score: 80,
    roi_score: 75,
    confidence_score: 85,
  },
  zones: [{
    id: 'varedo',
    name: 'Varedo',
    comune_name: 'Varedo',
    municipality_code: '108045',
    population: 13914,
    pop: 13914,
    households: 6176,
    families: 6176,
    area_km2: 4.8,
    area: 4.8,
    coverage: 100,
    recommended_flyers: 6794,
    volantini_nel_raggio: 6794,
    density_per_km2: 2898,
    geometry_geojson: polygon(9.16, 45.575, 0, 0, 1.5),
  }],
  comuni_breakdown: [{
    municipality_code: '108045',
    comune_name: 'Varedo',
    population: 13914,
    households: 6176,
    area_km2: 4.8,
    pct_copertura: 100,
    recommended_flyers: 6794,
    density_per_km2: 2898,
    geometry_geojson: polygon(9.16, 45.575, 0, 0, 1.5),
  }],
  territorial_breakdown: [],
  sources: ['ISTAT', 'Dati geografici'],
};

const demographicRows = [{
  geography_ref: '015146',
  reference_year: 2025,
  population_total: 1354196,
  households_total: 690000,
  avg_household_size: 1.96,
  share_age_0_14: 0.12,
  share_age_15_34: 0.22,
  share_age_35_64: 0.42,
  share_age_65_plus: 0.24,
}];

function geocodeFeature({ id, name, label, lng, lat, type = 'place', city = null, fullName = null }) {
  const context = city ? [{ id: `place.${city.toLowerCase()}`, text: city }, { id: 'region.lombardia', text: 'Lombardia', short_code: 'IT-25' }] : [];
  return {
    id,
    place_type: [type],
    text: label || name,
    place_name: fullName || `${name}, Lombardia, Italia`,
    center: [lng, lat],
    context,
    properties: {},
  };
}

function geocodePayload(url) {
  const decoded = decodeURIComponent(url).toLowerCase();
  const features = [];
  if (decoded.includes('via torino')) {
    features.push(geocodeFeature({
      id: 'address.via-torino-1',
      name: 'Via Torino 1, Milano, Lombardia, Italia',
      label: 'Via Torino',
      lng: 9.1867,
      lat: 45.4624,
      type: 'address',
      city: 'Milano',
      fullName: 'Via Torino 1, Milano, Lombardia, Italia',
    }));
  }
  if (decoded.includes('via brera')) {
    features.push(geocodeFeature({
      id: 'address.via-brera',
      name: 'Via Brera, Milano, Lombardia, Italia',
      label: 'Via Brera',
      lng: 9.192,
      lat: 45.471,
      type: 'address',
      city: 'Milano',
      fullName: 'Via Brera, Milano, Lombardia, Italia',
    }));
  }
  if (decoded.includes('milano')) {
    features.push(geocodeFeature({ id: 'place.milano', name: 'Milano', lng: 9.19, lat: 45.4642, type: 'place' }));
  }
  if (decoded.includes('cormano')) {
    features.push(geocodeFeature({ id: 'place.cormano', name: 'Cormano', lng: 9.163, lat: 45.551, type: 'place' }));
  }
  if (decoded.includes('paderno')) {
    features.push(geocodeFeature({ id: 'place.paderno', name: 'Paderno Dugnano', lng: 9.163, lat: 45.568, type: 'place' }));
  }
  if (decoded.includes('varedo')) {
    features.push(geocodeFeature({ id: 'place.varedo', name: 'Varedo', lng: 9.16, lat: 45.575, type: 'place' }));
  }
  return { features };
}

function nominatimPayload(url) {
  const decoded = decodeURIComponent(url).toLowerCase();
  if (decoded.includes('format=geojson')) {
    let center = [9.19, 45.464];
    let name = 'Milano';
    if (decoded.includes('cormano')) { center = [9.163, 45.551]; name = 'Cormano'; }
    if (decoded.includes('paderno')) { center = [9.163, 45.568]; name = 'Paderno Dugnano'; }
    if (decoded.includes('varedo')) { center = [9.16, 45.575]; name = 'Varedo'; }
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { display_name: `${name}, Lombardia, Italia`, addresstype: 'town' }, geometry: polygon(center[0], center[1], 0, 0, name === 'Milano' ? 8 : 1.5) }],
    };
  }
  if (decoded.includes('via torino')) {
    return [{
      place_id: 1001,
      display_name: 'Via Torino 1, Milano, Lombardia, Italia',
      lat: '45.4624',
      lon: '9.1867',
      addresstype: 'road',
      address: { road: 'Via Torino', house_number: '1', city: 'Milano', postcode: '20123', county: 'Milano' },
    }];
  }
  if (decoded.includes('via brera')) {
    return [{
      place_id: 1006,
      display_name: 'Via Brera, Milano, Lombardia, Italia',
      lat: '45.471',
      lon: '9.192',
      addresstype: 'road',
      address: { road: 'Via Brera', city: 'Milano', postcode: '20121', county: 'Milano' },
    }];
  }
  if (decoded.includes('milano')) return [{ place_id: 1002, display_name: 'Milano, Lombardia, Italia', lat: '45.4642', lon: '9.19', addresstype: 'city', address: { city: 'Milano' } }];
  if (decoded.includes('cormano')) return [{ place_id: 1003, display_name: 'Cormano, Lombardia, Italia', lat: '45.551', lon: '9.163', addresstype: 'town', address: { town: 'Cormano' } }];
  if (decoded.includes('paderno')) return [{ place_id: 1004, display_name: 'Paderno Dugnano, Lombardia, Italia', lat: '45.568', lon: '9.163', addresstype: 'town', address: { town: 'Paderno Dugnano' } }];
  if (decoded.includes('varedo')) return [{ place_id: 1005, display_name: 'Varedo, Lombardia, Italia', lat: '45.575', lon: '9.16', addresstype: 'town', address: { town: 'Varedo' } }];
  return [];
}

async function makePage(browser, scenario, evidence) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
  await context.addInitScript(() => {
    window.__VOLANTINIPRO_DEBUG_STEP2__ = true;
    window.__VOLANTINIPRO_DEMO_LOGIN__ = true;
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const consoleInfos = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' && !/Failed to load resource: net::ERR_FAILED|Failed to load resource: the server responded/i.test(text)) {
      consoleErrors.push(text);
    }
    if (/\[QUOTE_PDF_|\[STEP3_NAV_|\[PDF_/.test(text)) consoleInfos.push(text);
  });
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(projectUrl)) return route.continue();
    if (url.includes('mapbox.com/geocoding') || url.includes('api.mapbox.com/search')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(geocodePayload(url)) });
    }
    if (url.includes('nominatim.openstreetmap.org')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nominatimPayload(url)) });
    }
    if (url.includes('analysis-istat')) {
      if (scenario === 'loading') await new Promise(resolve => setTimeout(resolve, 900));
      if (scenario === 'failure') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'CONTROLLED_SOURCE_FAILURE' }) });
      if (scenario === 'multi') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(multiAnalysis) });
      if (scenario === 'varedo-empty') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(varedoNoNilAnalysis) });
      if (scenario === 'partial') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(milanoPartialAnalysis) });
      if (scenario === 'brera') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(breraRadiusAnalysis) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(milanoAnalysis) });
    }
    if (url.includes('demographic_indicators')) {
      if (scenario === 'partial') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'CONTROLLED_DEMOGRAPHIC_FAILURE' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(demographicRows) });
    }
    if (url.includes('/rest/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' });
    }
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('tiles') || url.includes('mapbox')) return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  evidence.console = { pageErrors, consoleErrors, consoleInfos };
  return { page, context, pageErrors, consoleErrors, consoleInfos };
}

async function gotoStep2(page) {
  await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const cookieAccept = page.getByRole('button', { name: /^Accetta$/i });
  if (await cookieAccept.count()) await cookieAccept.click();
  await page.getByText('Calcola la tua copertura', { exact: true }).click();
  await page.waitForTimeout(250);
  await page.getByText('Door to Door', { exact: true }).first().click();
  await page.getByText('Retail').first().click();
  await page.getByText('Prima possibile').first().click();
  await page.getByRole('button', { name: /Continua allo Step 2/i }).click();
  await page.waitForTimeout(700);
}

async function searchAndClick(page, query, visibleText) {
  const search = page.locator('input[placeholder*="Cerca"], input[placeholder*="Aggiungi"]').first();
  await search.fill(query);
  await page.waitForTimeout(650);
  await page.getByText(visibleText, { exact: false }).first().click();
  await page.waitForTimeout(1400);
}

async function chooseKeepIfNeeded(page) {
  const keep = page.getByRole('button', { name: /Mantieni/i }).first();
  if (await keep.count()) {
    await keep.click();
    await page.waitForTimeout(250);
  }
}

async function setManualQuantity(page, quantity) {
  await page.locator('button[aria-label="Modifica manualmente la quantita"]').first().click();
  await page.waitForTimeout(250);
  const input = page.locator('input[aria-label*="manuale"]').first();
  if ((await input.count()) === 0) {
    await page.screenshot({ path: `${outDir}/debug-manual-input-missing.png`, fullPage: true });
    const debug = await page.evaluate(() => ({
      inputs: Array.from(document.querySelectorAll('input')).map(i => ({ type: i.type, aria: i.getAttribute('aria-label'), placeholder: i.getAttribute('placeholder'), value: i.value })),
      pressed: Array.from(document.querySelectorAll('button[aria-pressed="true"]')).map(b => b.textContent),
      buttons: Array.from(document.querySelectorAll('button')).map(b => ({ aria: b.getAttribute('aria-label'), text: b.textContent })).filter(b => /manual|Mantieni|Aumenta|Adatta/i.test(`${b.aria || ''} ${b.text || ''}`)),
    }));
    throw new Error(`Manual input missing after click: ${JSON.stringify(debug)}`);
  }
  await input.fill(String(quantity));
  await page.waitForTimeout(600);
}

async function getState(page) {
  const state = await page.evaluate(() => window.__VOLANTINIPRO_STEP2_STATE__);
  assert(state?.truthModel, 'Step 2 debug truth model not available');
  return state;
}

async function waitForStep2Zones(page, minZones = 1) {
  await page.waitForFunction((expected) => {
    const truth = window.__VOLANTINIPRO_STEP2_STATE__?.truthModel;
    return truth && Number(truth.zones?.available || 0) >= expected && Number(truth.quantity?.recommendedRequirement || 0) > 0;
  }, minZones, { timeout: 10000 });
  return getState(page);
}

function zoneAllocationSum(truth) {
  return (truth?.zones?.rows || []).reduce((sum, row) => sum + Number(row.assignedFlyers || 0), 0);
}

async function openReportAndAssert(page, truth, screenshotName) {
  await page.getByRole('button', { name: /Apri Analisi Avanzata/i }).click();
  await page.waitForTimeout(300);
  const reportText = await page.locator('body').innerText();
  assert(/ANALISI TERRITORIALE AVANZATA/i.test(reportText), 'Advanced Report header not opened');
  assert(!/Scegli la zona di distribuzione/i.test(reportText), 'Step 2 client configuration title is visible in Advanced Report');
  assert(!/Cerca un comune o CAP/i.test(reportText), 'Step 2 search controls are visible in Advanced Report');
  assert(!/Reset zona|Aggiungi un'altra zona|Usa raggio dal centro/i.test(reportText), 'Step 2 zone controls are visible in Advanced Report');
  assert(/Servizio:/i.test(reportText), 'Selected service is not shown as report context');
  assert(/Come viene analizzato il servizio/i.test(reportText), 'Service-specific explanation missing');
  assert(/Analisi supportata da AI/i.test(reportText), 'AI explanation note missing');
  assert(reportText.includes(fmtIt(truth.quantity.current)), 'Report does not show active scenario quantity');
  if (truth.zones.firstPriority?.name) assert(reportText.includes(truth.zones.firstPriority.name), 'Report first priority differs/missing');
  await page.screenshot({ path: `${outDir}/${screenshotName}`, fullPage: true });
  return reportText;
}

async function backToClient(page) {
  await page.getByRole('button', { name: /Torna alla configurazione/i }).click();
  await page.waitForTimeout(250);
}

function assertNoConsole(pageErrors, consoleErrors) {
  assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`);
  assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);
}

async function runRadiusScenario(browser) {
  const evidence = { test: 5, name: 'Radius address scenario', status: 'FAIL' };
  const { page, context, pageErrors, consoleErrors } = await makePage(browser, 'radius', evidence);
  try {
    await gotoStep2(page);
    await searchAndClick(page, 'Via Torino 1 Milano', 'Via Torino');
    await page.getByRole('button', { name: /Usa raggio da/i }).first().click();
    await page.waitForTimeout(1500);
    await chooseKeepIfNeeded(page);
    const state = await getState(page);
    const truth = state.truthModel;
    assert(state.selectedSearchPoint?.type === 'address', 'Selected point is not an address');
    assert(Math.abs(Number(state.selectedSearchPoint.lat) - 45.4624) < 0.01, 'Radius center latitude does not match address');
    assert(Math.abs(Number(state.selectedSearchPoint.lng) - 9.1867) < 0.01, 'Radius center longitude does not match address');
    assert(/raggio/i.test(truth.territory.modeLabel || ''), 'Territory mode wording is not radius');
    assert(!/Comune/i.test(truth.territory.modeLabel || ''), 'Radius mode still says Comune');
    assert(truth.zones.available >= truth.zones.involved, 'Available/involved zone counts incoherent');
    assert(truth.zones.involved === truth.zones.full + truth.zones.partial, 'Full/partial counts do not equal involved');
    assert(zoneAllocationSum(truth) === truth.quantity.allocatedQuantity, 'Zone allocation is not conserved');
    await page.screenshot({ path: `${outDir}/05-radius-client.png`, fullPage: true });
    await openReportAndAssert(page, truth, '05-radius-report.png');
    await backToClient(page);
    const returned = await getState(page);
    assert(returned.selectedSearchPoint?.label === state.selectedSearchPoint.label, 'Address not preserved after report return');
    assert(returned.radiusKm === state.radiusKm, 'Radius not preserved after report return');
    assert(returned.truthModel.quantity.current === truth.quantity.current, 'Quantity not preserved after report return');
    assertNoConsole(pageErrors, consoleErrors);
    evidence.status = 'PASS';
    evidence.config = 'Via Torino 1 Milano, radius mode, Door to Door, 10.000 flyers';
    evidence.route = '/zona';
    evidence.expected = 'Address-centered radius with radius wording, coherent counts and report/client consistency';
    evidence.actual = {
      selectedSearchPoint: returned.selectedSearchPoint,
      radiusKm: returned.radiusKm,
      modeLabel: returned.truthModel.territory.modeLabel,
      quantity: returned.truthModel.quantity,
      coverage: returned.truthModel.coverage,
      zones: returned.truthModel.zones,
    };
    evidence.screenshots = [`${outDir}/05-radius-client.png`, `${outDir}/05-radius-report.png`];
  } finally {
    await context.close();
  }
  return evidence;
}

async function runMultiScenario(browser) {
  const evidence = { test: 6, name: 'Multi-zone / multi-municipality scenario', status: 'FAIL' };
  const { page, context, pageErrors, consoleErrors } = await makePage(browser, 'multi', evidence);
  try {
    await gotoStep2(page);
    await searchAndClick(page, 'Cormano', 'Cormano');
    await page.getByRole('button', { name: /Aggiungi un'altra zona|Aggiungi.*comune/i }).click();
    await page.waitForTimeout(250);
    await searchAndClick(page, 'Paderno Dugnano', 'Paderno Dugnano');
    await chooseKeepIfNeeded(page);
    const state = await getState(page);
    const truth = state.truthModel;
    const pageText = await page.locator('body').innerText();
    const selectedNames = [
      (state.selectedComuni || []).map(c => c.label || c.name).join(' | '),
      truth.territory?.label || '',
      (truth.zones.rows || []).map(row => row.name).join(' | '),
      pageText,
    ].join(' | ');
    await page.screenshot({ path: `${outDir}/06-multi-client-before-assert.png`, fullPage: true });
    assert(/Cormano/i.test(selectedNames) && /Paderno/i.test(selectedNames), `Both municipalities are not selected: ${selectedNames}`);
    assert(new Set((truth.zones.rows || []).map(r => r.name)).size === (truth.zones.rows || []).length, 'Zone rows are duplicated');
    assert(truth.zones.available >= 2, 'Available zone count too low for multi-municipality');
    assert(truth.zones.involved === truth.zones.full + truth.zones.partial, 'Full/partial counts do not equal involved');
    assert(zoneAllocationSum(truth) === truth.quantity.allocatedQuantity, 'Allocation is not conserved');
    await page.screenshot({ path: `${outDir}/06-multi-client.png`, fullPage: true });
    const reportText = await openReportAndAssert(page, truth, '06-multi-report.png');
    assert(/Cormano/i.test(reportText) && /Paderno/i.test(reportText), 'Report does not represent complete multi-zone scope');
    await backToClient(page);
    const returned = await getState(page);
    const returnedText = await page.locator('body').innerText();
    const returnedNames = [
      returned.truthModel.territory?.label || '',
      (returned.truthModel.zones.rows || []).map(row => row.name).join(' | '),
      returnedText,
    ].join(' | ');
    assert(/Cormano/i.test(returnedNames) && /Paderno/i.test(returnedNames), 'Multi selection not preserved after report return');
    assertNoConsole(pageErrors, consoleErrors);
    evidence.status = 'PASS';
    evidence.config = 'Cormano + Paderno Dugnano, municipality multi-selection, Door to Door';
    evidence.route = '/zona';
    evidence.expected = 'Both municipalities remain selected, deduped totals, conserved allocation and report/client persistence';
    evidence.actual = {
      selectedNames: returnedNames,
      quantity: returned.truthModel.quantity,
      coverage: returned.truthModel.coverage,
      zones: returned.truthModel.zones,
    };
    evidence.screenshots = [`${outDir}/06-multi-client.png`, `${outDir}/06-multi-report.png`];
  } finally {
    await context.close();
  }
  return evidence;
}

async function runManualQuantityScenario(browser) {
  const evidence = { test: 7, name: 'Manual quantity change scenario', status: 'FAIL' };
  const { page, context, pageErrors, consoleErrors } = await makePage(browser, 'manual', evidence);
  try {
    await gotoStep2(page);
    await searchAndClick(page, 'Milano', 'Milano');
    const initial = (await getState(page)).truthModel;
    const manualQty = 25000;
    assert(manualQty !== initial.quantity.current && manualQty !== initial.quantity.recommendedRequirement, 'Manual quantity fixture is not distinct');
    await setManualQuantity(page, manualQty);
    const state = await getState(page);
    const truth = state.truthModel;
    assert(truth.quantity.current === manualQty, 'Manual quantity is not the active scenario quantity');
    assert(truth.coverage.operationalPct !== initial.coverage.operationalPct, 'Coverage did not recalculate');
    assert(truth.quantity.missing !== initial.quantity.missing, 'Missing quantity did not recalculate');
    assert(zoneAllocationSum(truth) === truth.quantity.allocatedQuantity, 'Per-zone allocation did not recalculate coherently');
    assert(truth.zones.involved >= initial.zones.involved, 'Involved count did not recalculate coherently');
    await page.screenshot({ path: `${outDir}/07-manual-client.png`, fullPage: true });
    await openReportAndAssert(page, truth, '07-manual-report.png');
    await backToClient(page);
    let cta = page.locator('button.btn').last();
    assert(await cta.isEnabled(), `Step 2 CTA disabled: ${await cta.innerText()}`);
    await cta.click();
    await page.waitForTimeout(450);
    assert(/Smart Pairing|Continua senza Smart Pairing/i.test(await page.locator('body').innerText()), 'Step 3 not reached');
    await page.getByRole('button', { name: /Zona e mappa|Indietro/i }).first().click();
    await page.waitForTimeout(350);
    const returnedStep2 = await waitForStep2Zones(page, 1);
    assert(returnedStep2.truthModel.quantity.current === manualQty, 'Manual value not preserved Step 2 -> Step 3 -> Step 2');
    assert(returnedStep2.truthModel.zones.available > 0 && returnedStep2.truthModel.zones.involved > 0, 'Zone allocation not restored after Step 3 back navigation');
    await page.getByRole('button', { name: /Apri Analisi Avanzata/i }).click();
    await page.waitForTimeout(250);
    assert((await page.locator('body').innerText()).includes(fmtIt(manualQty)), 'Manual value not preserved in report');
    await backToClient(page);
    assert((await page.locator('body').innerText()).includes(fmtIt(manualQty)), 'Stale previous quantity remains after report return');
    assertNoConsole(pageErrors, consoleErrors);
    evidence.status = 'PASS';
    evidence.config = 'Milano complete municipality, manual quantity 25.000 flyers';
    evidence.route = '/zona -> /calendario -> /zona';
    evidence.expected = 'Manual quantity is active everywhere and survives Step 3/report navigation';
    evidence.actual = {
      initial: { quantity: initial.quantity, coverage: initial.coverage, zones: initial.zones },
      manual: { quantity: returnedStep2.truthModel.quantity, coverage: returnedStep2.truthModel.coverage, zones: returnedStep2.truthModel.zones },
    };
    evidence.screenshots = [`${outDir}/07-manual-client.png`, `${outDir}/07-manual-report.png`];
  } finally {
    await context.close();
  }
  return evidence;
}

async function runLoadingErrorEmptyScenario(browser) {
  const evidence = { test: 23, name: 'Loading / error / empty / partial states', status: 'FAIL', substates: [] };
  async function subcase(label, scenario, query, clickText, extra) {
    const ev = { label, scenario, status: 'FAIL' };
    const { page, context, pageErrors, consoleErrors } = await makePage(browser, scenario, ev);
    try {
      await gotoStep2(page);
      if (scenario === 'loading') {
        const search = page.locator('input[placeholder*="Cerca"], input[placeholder*="Aggiungi"]').first();
        await search.fill(query);
        await page.waitForTimeout(650);
        await page.getByText(clickText, { exact: false }).first().click();
        await page.waitForTimeout(150);
        const loadingText = await page.locator('body').innerText();
        assert(/Caricamento analisi territoriale|Caricamento/i.test(loadingText), 'Loading state not visible');
        await page.screenshot({ path: `${outDir}/23a-loading.png`, fullPage: true });
        await page.waitForTimeout(1500);
      } else {
        await searchAndClick(page, query, clickText);
      }
      await page.waitForTimeout(1200);
      if (extra) await extra(page);
      assertNoConsole(pageErrors, consoleErrors);
      ev.status = 'PASS';
      ev.console = { pageErrors, consoleErrors };
    } finally {
      await context.close();
    }
    evidence.substates.push(ev);
  }

  await subcase('territorial analysis loading', 'loading', 'Milano', 'Milano');
  await subcase('source request failure', 'failure', 'Milano', 'Milano', async page => {
    const body = await page.locator('body').innerText();
    assert(/Dati territoriali non disponibili|non disponibili|Cerca di nuovo|Usa Milano/i.test(body), 'Failure state lacks clear unavailable/retry action');
    await page.screenshot({ path: `${outDir}/23b-source-failure.png`, fullPage: true });
  });
  await subcase('no NIL or sectors available', 'varedo-empty', 'Varedo', 'Varedo', async page => {
    const state = await getState(page);
    assert((state.truthModel.zones.rows || []).length <= 1, 'No-NIL scenario invented sector rows');
    await page.screenshot({ path: `${outDir}/23c-no-nil.png`, fullPage: true });
  });
  await subcase('OMI and demographic unavailable + partial report', 'partial', 'Milano', 'Milano', async page => {
    await chooseKeepIfNeeded(page);
    await page.getByRole('button', { name: /Apri Analisi Avanzata/i }).click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: /Economia e immobili/i }).click();
    await page.waitForTimeout(100);
    const omiText = await page.locator('body').innerText();
    assert(/Dato non disponibile|non disponibile|Numero zone OMI non restituito/i.test(omiText), 'OMI unavailable state not explicit');
    await page.getByRole('button', { name: /Demografia e target/i }).click();
    await page.waitForTimeout(100);
    const demoText = await page.locator('body').innerText();
    assert(/Dato non disponibile|residenti|demographic/i.test(demoText), 'Demographic unavailable/partial state not explicit');
    await page.screenshot({ path: `${outDir}/23d-partial-report.png`, fullPage: true });
  });

  evidence.status = evidence.substates.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
  evidence.config = 'Controlled loading, source failure, Varedo no-NIL, Milano partial OMI/demographic data';
  evidence.route = '/zona and Advanced Report';
  evidence.expected = 'No crash, no invented fallback values, no infinite spinner, compact unavailable/partial states and no app console errors';
  evidence.actual = evidence.substates;
  evidence.screenshots = [`${outDir}/23a-loading.png`, `${outDir}/23b-source-failure.png`, `${outDir}/23c-no-nil.png`, `${outDir}/23d-partial-report.png`];
  return evidence;
}

async function runQuoteHandoffScenario(browser) {
  const evidence = { test: 50, name: 'Full quote handoff scenario', status: 'FAIL' };
  const { page, context, pageErrors, consoleErrors, consoleInfos } = await makePage(browser, 'quote', evidence);
  try {
    await gotoStep2(page);
    await searchAndClick(page, 'Milano', 'Milano');
    const manualQty = 25000;
    await setManualQuantity(page, manualQty);
    const step2 = await getState(page);
    const truth = step2.truthModel;
    await page.screenshot({ path: `${outDir}/50-step2-final-quantity.png`, fullPage: true });
    const cta = page.locator('button.btn').last();
    assert(await cta.isEnabled(), `Step 2 CTA disabled: ${await cta.innerText()}`);
    await cta.click();
    await page.waitForTimeout(500);
    assert(/Smart Pairing/i.test(await page.locator('body').innerText()), 'Step 3 not reached');
    await page.screenshot({ path: `${outDir}/50-step3.png`, fullPage: true });
    await page.getByRole('button', { name: /Continua senza Smart Pairing/i }).first().click();
    await page.waitForTimeout(700);
    const step4Text = await page.locator('body').innerText();
    if (!/Totale campagna|Scarica preventivo PDF|Riepilogo/i.test(step4Text)) {
      await page.screenshot({ path: `${outDir}/debug-quote-after-skip.png`, fullPage: true });
      throw new Error(`Step 4 not reached. Current URL/text: ${page.url()} :: ${step4Text.slice(0, 1200)} :: pageErrors=${pageErrors.join(' | ')} :: consoleErrors=${consoleErrors.join(' | ')}`);
    }
    assert(step4Text.includes(fmtIt(manualQty)), 'Step 4 does not preserve selected quantity');
    assert(/Door to Door/i.test(step4Text), 'Step 4 does not preserve service');
    assert(/Milano/i.test(step4Text), 'Step 4 does not preserve territory');
    assert(!step4Text.includes(fmtIt(truth.quantity.recommendedRequirement)) || step4Text.includes(fmtIt(manualQty)), 'Recommended quantity may have replaced selected quantity');
    await page.screenshot({ path: `${outDir}/50-step4.png`, fullPage: true });
    await page.getByRole('button', { name: /Modifica configurazione/i }).first().click();
    await page.waitForTimeout(400);
    assert(/Smart Pairing/i.test(await page.locator('body').innerText()), 'Step 4 back did not return to Step 3');
    await page.getByRole('button', { name: /Zona e mappa/i }).first().click();
    await page.waitForTimeout(400);
    const afterBackText = await page.locator('body').innerText();
    assert(/25\.000|25000/i.test(afterBackText) && /Milano/i.test(afterBackText), 'Back navigation reset the Step 2 configuration');
    const step2Back = await waitForStep2Zones(page, 1);
    assert(step2Back.truthModel.quantity.current === manualQty, 'Step 2 after backward navigation lost manual quantity');
    const ctaAgain = page.locator('button.btn').last();
    await ctaAgain.click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Continua senza Smart Pairing/i }).first().click();
    await page.waitForTimeout(700);
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Scarica preventivo PDF/i }).click();
    const pdfPage = await popupPromise;
    await pdfPage.waitForLoadState('domcontentloaded');
    const pdfText = await pdfPage.locator('body').innerText();
    assert(/Preventivo campagna/i.test(pdfText), 'Quote PDF/print view did not open');
    assert(pdfText.includes(fmtIt(manualQty)), 'Quote PDF does not contain selected quantity');
    assert(/Milano/i.test(pdfText), 'Quote PDF does not contain territory');
    assert(/Door to Door/i.test(pdfText), 'Quote PDF does not contain service');
    assert(await pdfPage.getByRole('button', { name: /Scarica preventivo PDF/i }).count(), 'Printable PDF download button missing');
    await pdfPage.screenshot({ path: `${outDir}/50-quote-pdf.png`, fullPage: true });
    await pdfPage.close();
    assertNoConsole(pageErrors, consoleErrors);
    evidence.status = 'PASS';
    evidence.config = 'Milano, Door to Door, manual final quantity 25.000, Step 2 -> Step 3 -> Step 4 -> printable quote PDF';
    evidence.route = '/zona -> /calendario -> /riepilogo';
    evidence.expected = 'Territory/service/current quantity preserved; price and PDF use selected quantity; no accidental recommended substitution';
    evidence.actual = {
      selectedQuantity: manualQty,
      recommendedQuantity: truth.quantity.recommendedRequirement,
      step4HasSelectedQuantity: true,
      quotePdfHasSelectedQuantity: true,
      consoleInfos,
    };
    evidence.screenshots = [`${outDir}/50-step2-final-quantity.png`, `${outDir}/50-step3.png`, `${outDir}/50-step4.png`, `${outDir}/50-quote-pdf.png`];
  } finally {
    await context.close();
  }
  return evidence;
}

async function runAdvancedReportHeaderSeparationScenario(browser) {
  const evidence = { test: 51, name: 'Advanced Report header separation', status: 'FAIL' };
  const { page, context, pageErrors, consoleErrors } = await makePage(browser, 'header', evidence);
  try {
    await gotoStep2(page);
    await searchAndClick(page, 'Milano', 'Milano');
    await chooseKeepIfNeeded(page);
    const initialState = await getState(page);
    const initialTruth = initialState.truthModel;

    async function assertReportForService(serviceName, serviceTextRegex, screenshotName) {
      await page.getByRole('button', { name: /Apri Analisi Avanzata/i }).click();
      await page.waitForTimeout(350);
      const body = await page.locator('body').innerText();
      assert(/ANALISI TERRITORIALE AVANZATA/i.test(body), `${serviceName}: report-specific eyebrow missing`);
      assert(/Milano/i.test(body), `${serviceName}: dynamic territory title missing`);
      assert(/Report professionale basato sui dati territoriali disponibili/i.test(body), `${serviceName}: report subtitle missing`);
      assert(!/Scegli la zona di distribuzione/i.test(body), `${serviceName}: Step 2 title visible inside report`);
      assert(!/Cerca un comune o CAP/i.test(body), `${serviceName}: Step 2 search visible inside report`);
      assert((await page.getByRole('button', { name: /^Door to Door$/i }).count()) === 0, `${serviceName}: Door to Door control visible in report`);
      assert((await page.getByRole('button', { name: /^Hand to Hand$/i }).count()) === 0, `${serviceName}: Hand to Hand control visible in report`);
      assert((await page.getByRole('button', { name: /^Business$/i }).count()) === 0, `${serviceName}: Business control visible in report`);
      assert(new RegExp(serviceName, 'i').test(body), `${serviceName}: selected service not visible as read-only context`);
      assert(serviceTextRegex.test(body), `${serviceName}: service-specific explanation missing or wrong`);
      assert(/L.AI organizza, confronta e interpreta i dati realmente disponibili/i.test(body), `${serviceName}: AI limitation note missing`);
      await page.screenshot({ path: `${outDir}/${screenshotName}`, fullPage: true });
    }

    await assertReportForService(
      'Door to Door',
      /L.analisi valuta famiglie, fabbisogno operativo, NIL, densit. territoriale/i,
      '51-d2d-report-header.png'
    );

    for (const viewport of [
      { name: 'desktop-1366', width: 1366, height: 900 },
      { name: 'desktop-1440', width: 1440, height: 1000 },
      { name: 'tablet', width: 820, height: 1180 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 3, `${viewport.name}: horizontal overflow ${overflow}px`);
      await page.screenshot({ path: `${outDir}/51-${viewport.name}.png`, fullPage: true });
    }

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Esporta PDF/i }).click();
    const pdfPage = await popupPromise;
    await pdfPage.waitForLoadState('domcontentloaded');
    const pdfText = await pdfPage.locator('body').innerText();
    assert(/ANALISI TERRITORIALE AVANZATA/i.test(pdfText), 'PDF does not use report title/header');
    assert(!/Scegli la zona di distribuzione/i.test(pdfText), 'PDF contains Step 2 title');
    await pdfPage.screenshot({ path: `${outDir}/51-territorial-report-pdf.png`, fullPage: true });
    await pdfPage.close();

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(200);
    await backToClient(page);
    const returned = await getState(page);
    assert(returned.truthModel.quantity.current === initialTruth.quantity.current, 'Return from report changed quantity');
    assert(returned.truthModel.territory.label === initialTruth.territory.label, 'Return from report changed territory');

    await page.getByRole('button', { name: /^Hand to Hand$/i }).click();
    await page.waitForTimeout(1200);
    await assertReportForService(
      'Hand to Hand',
      /L.analisi valuta punti di interesse, stazioni, fermate, scuole, universit./i,
      '51-h2h-report-header.png'
    );
    await backToClient(page);

    await page.getByRole('button', { name: /^Business$/i }).click();
    await page.waitForTimeout(1200);
    await assertReportForService(
      'Business',
      /L.analisi valuta attivit. commerciali, uffici, imprese, punti di consegna/i,
      '51-business-report-header.png'
    );
    await backToClient(page);

    assertNoConsole(pageErrors, consoleErrors);
    evidence.status = 'PASS';
    evidence.config = 'Milano complete municipality, D2D/H2H/Business report mode, responsive desktop/tablet/mobile, territorial PDF';
    evidence.route = '/zona -> Advanced Report';
    evidence.expected = 'Step 2 configuration controls hidden; report-specific header/chips/actions shown; selected service read-only; state/PDF preserved';
    evidence.actual = {
      initial: {
        territory: initialTruth.territory,
        quantity: initialTruth.quantity,
        coverage: initialTruth.coverage,
      },
      console: { pageErrors, consoleErrors },
    };
    evidence.screenshots = [
      `${outDir}/51-d2d-report-header.png`,
      `${outDir}/51-h2h-report-header.png`,
      `${outDir}/51-business-report-header.png`,
      `${outDir}/51-desktop-1366.png`,
      `${outDir}/51-desktop-1440.png`,
      `${outDir}/51-tablet.png`,
      `${outDir}/51-mobile.png`,
      `${outDir}/51-territorial-report-pdf.png`,
    ];
  } finally {
    await context.close();
  }
  return evidence;
}

async function runFinalVisualApprovalFixScenario(browser) {
  const evidence = { test: 52, name: 'Final visual approval consistency defects', status: 'FAIL' };

  async function assertReportAndPdf(page, screenshotStem, expectedOrigin) {
    const before = await getState(page);
    await page.getByRole('button', { name: /Apri Analisi Avanzata/i }).click();
    await page.waitForTimeout(350);
    const reportText = await page.locator('body').innerText();
    assert(reportText.includes(expectedOrigin), `${screenshotStem}: report origin label mismatch`);
    assert(/Famiglie\/cassette stimate nel raggio\s+115\.039/i.test(reportText), `${screenshotStem}: report radius families KPI mismatch`);
    assert(/7,9% del fabbisogno operativo/i.test(reportText), `${screenshotStem}: report coverage not precise`);
    assert(/Durata calendario non calcolabile/i.test(reportText), `${screenshotStem}: report duration status missing`);
    assert(/Numero operatori non disponibile/i.test(reportText), `${screenshotStem}: report operator limitation missing`);
    assert(!/690\.000 resident|690\.000\s+Famiglie\/cassette/i.test(reportText), `${screenshotStem}: municipality households mixed into radius KPI`);
    await page.screenshot({ path: `${outDir}/${screenshotStem}-report.png`, fullPage: true });

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Esporta PDF/i }).click();
    const pdfPage = await popupPromise;
    await pdfPage.waitForLoadState('domcontentloaded');
    const pdfText = await pdfPage.locator('body').innerText();
    assert(pdfText.includes(expectedOrigin), `${screenshotStem}: PDF origin label mismatch`);
    assert(/115\.039/i.test(pdfText), `${screenshotStem}: PDF radius families mismatch`);
    assert(/7,9% del fabbisogno operativo/i.test(pdfText), `${screenshotStem}: PDF coverage mismatch`);
    assert(!/Scegli la zona di distribuzione/i.test(pdfText), `${screenshotStem}: PDF contains Step 2 title`);
    await pdfPage.screenshot({ path: `${outDir}/${screenshotStem}-pdf.png`, fullPage: true });
    await pdfPage.close();

    await backToClient(page);
    const after = await getState(page);
    assert(after.truthModel.quantity.current === before.truthModel.quantity.current, `${screenshotStem}: quantity not preserved`);
    assert(after.truthModel.territory.label === before.truthModel.territory.label, `${screenshotStem}: territory not preserved`);
  }

  const { page, context, pageErrors, consoleErrors } = await makePage(browser, 'brera', evidence);
  try {
    await gotoStep2(page);
    await searchAndClick(page, 'Via Brera Milano', 'Via Brera');
    await page.waitForTimeout(600);
    const previewText = await page.locator('body').innerText();
    assert(/NIL selezionati:\s*0\s*·\s*Anteprima:\s*Brera/i.test(previewText), 'Via Brera preview NIL wording mismatch');
    await page.screenshot({ path: `${outDir}/52A-via-brera-preview-client.png`, fullPage: true });

    await page.getByRole('button', { name: /Usa raggio da Via Brera/i }).first().click();
    await page.waitForTimeout(1500);
    await chooseKeepIfNeeded(page);
    const radiusText = await page.locator('body').innerText();
    assert(/Raggio 3 km da Via Brera/i.test(radiusText), 'Via Brera radius origin label mismatch');
    assert(/Famiglie\/cassette stimate nel raggio\s+115\.039/i.test(radiusText), 'Client radius families value mismatch');
    assert(/7,9% del fabbisogno operativo/i.test(radiusText), 'Client coverage not precise');
    assert(/Durata calendario/i.test(radiusText) && /non calcolabile/i.test(radiusText) && /Numero operatori non disponibile/i.test(radiusText), 'Client duration status missing');
    assert(!/54 giorni/i.test(radiusText), 'Unsupported 54-day duration still visible');
    await page.screenshot({ path: `${outDir}/52B-via-brera-radius-client.png`, fullPage: true });
    await assertReportAndPdf(page, '52B-via-brera-radius', 'Raggio 3 km da Via Brera');
    await context.close();

    const centerEvidence = { test: '52C' };
    const { page: centerPage, context: centerContext, pageErrors: centerPageErrors, consoleErrors: centerConsoleErrors } = await makePage(browser, 'brera', centerEvidence);
    await gotoStep2(centerPage);
    await searchAndClick(centerPage, 'Milano', 'Milano');
    await centerPage.getByRole('button', { name: /Usa raggio dal centro di Milano/i }).first().click();
    await centerPage.waitForTimeout(1500);
    await chooseKeepIfNeeded(centerPage);
    const centerText = await centerPage.locator('body').innerText();
    assert(/Raggio 3 km dal centro di Milano/i.test(centerText), 'Milano centre radius origin label mismatch');
    assert(/7,9% del fabbisogno operativo/i.test(centerText), 'Milano centre coverage not precise');
    assert(!/54 giorni/i.test(centerText), 'Unsupported 54-day duration visible in Milano centre flow');
    await centerPage.screenshot({ path: `${outDir}/52C-milano-centre-radius-client.png`, fullPage: true });
    await assertReportAndPdf(centerPage, '52C-milano-centre-radius', 'Raggio 3 km dal centro di Milano');
    assertNoConsole(centerPageErrors, centerConsoleErrors);
    await centerContext.close();

    assertNoConsole(pageErrors, consoleErrors);
    evidence.status = 'PASS';
    evidence.config = 'Via Brera address preview, Via Brera radius 3 km, Milano centre radius 3 km';
    evidence.route = '/zona -> Advanced Report -> PDF';
    evidence.expected = 'Shared radius KPI, origin, duration and coverage labels across Client View, Advanced Report and PDF';
    evidence.actual = { console: { pageErrors, consoleErrors } };
    evidence.screenshots = [
      `${outDir}/52A-via-brera-preview-client.png`,
      `${outDir}/52B-via-brera-radius-client.png`,
      `${outDir}/52B-via-brera-radius-report.png`,
      `${outDir}/52B-via-brera-radius-pdf.png`,
      `${outDir}/52C-milano-centre-radius-client.png`,
      `${outDir}/52C-milano-centre-radius-report.png`,
      `${outDir}/52C-milano-centre-radius-pdf.png`,
    ];
  } finally {
    if (!context._closed) {
      try { await context.close(); } catch {}
    }
  }
  return evidence;
}

async function main() {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const results = [];
  try {
    for (const runner of [runFinalVisualApprovalFixScenario, runAdvancedReportHeaderSeparationScenario, runRadiusScenario, runMultiScenario, runManualQuantityScenario, runLoadingErrorEmptyScenario, runQuoteHandoffScenario]) {
      const result = await runner(browser);
      results.push(result);
      console.log(`[${result.status}] ${result.test} ${result.name}`);
    }
  } finally {
    await browser.close();
  }
  const summary = {
    status: results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL',
    generatedAt: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(`${outDir}/remaining-acceptance-summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== 'PASS') process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
