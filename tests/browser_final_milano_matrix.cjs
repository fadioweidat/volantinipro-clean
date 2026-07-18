const fs = require('fs');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const projectUrl = 'http://localhost:5173/';
const outDir = 'D:/cloaude volantini/volantinipro/artifacts/final-verification-2026-07-17';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(outDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function shiftedSquare(cx, cy, dx) {
  return {
    type: 'Polygon',
    coordinates: [[
      [cx + dx - 0.01, cy - 0.006],
      [cx + dx + 0.01, cy - 0.006],
      [cx + dx + 0.01, cy + 0.006],
      [cx + dx - 0.01, cy + 0.006],
      [cx + dx - 0.01, cy - 0.006],
    ]],
  };
}

const nils = [
  ['1', 'Duomo', 88200, 97020, 12],
  ['2', 'Brera', 81100, 89210, 11],
  ['3', 'Porta Venezia', 76600, 84260, 10],
  ['4', 'Isola', 72100, 79310, 10],
  ['5', 'Navigli', 69900, 76890, 9],
  ['6', 'Citta Studi', 72200, 79420, 10],
  ['7', 'Bicocca', 68300, 75130, 9],
  ['8', 'Lorenteggio', 70400, 77440, 9],
  ['9', 'Niguarda', 73499, 80849, 10],
  ['10', 'Gallaratese', 82000, 90194, 10],
].map(([code, name, households, flyers, pct], index) => ({
  nil_code: code,
  nil_name: name,
  territory_level: 'nil',
  comune_name: 'Milano',
  municipality_code: '015146',
  households,
  families: households,
  population: Math.round(households * 1.82),
  area_km2: 14 + index,
  pct_copertura: pct,
  recommended_flyers: flyers,
  volantini_nel_raggio: flyers,
  density_per_km2: 7549,
  geometry_geojson: shiftedSquare(9.19, 45.46, (index - 5) * 0.012),
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
  }],
  nil_breakdown: nils,
  territorial_breakdown: nils,
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
        { typology: 'Uffici', min_value: 4100, max_value: 6800, reference_period: '2025/2' },
      ],
    },
  },
  sources: ['ISTAT', 'Dati geografici', 'Agenzia Entrate - OMI'],
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

async function main() {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => { window.__VOLANTINIPRO_DEBUG_STEP2__ = true; });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' && !/Failed to load resource: net::ERR_FAILED/i.test(text)) consoleErrors.push(text);
  });

  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(projectUrl)) return route.continue();
    if (url.includes('mapbox.com/geocoding') || url.includes('api.mapbox.com/search')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        features: [{
          id: 'place.milano',
          place_type: ['place'],
          text: 'Milano',
          place_name: 'Milano, Lombardia, Italia',
          center: [9.1900, 45.4642],
          properties: { short_code: 'it-mi' },
          context: [],
        }],
      }) });
    }
    if (url.includes('analysis-istat')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(milanoAnalysis) });
    if (url.includes('demographic_indicators')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(demographicRows) });
    if (url.includes('/rest/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' });
    if (url.includes('nominatim.openstreetmap.org')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) });
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('tiles') || url.includes('mapbox')) return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const cookieAccept = page.getByRole('button', { name: /^Accetta$/i });
  if (await cookieAccept.count()) await cookieAccept.click();

  await page.getByText('Calcola la tua copertura', { exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByText('Door to Door', { exact: true }).first().click();
  await page.getByText('Retail').first().click();
  await page.getByText('Prima possibile').first().click();
  await page.getByRole('button', { name: /Continua allo Step 2/i }).click();
  await page.waitForTimeout(600);

  const search = page.locator('input[placeholder="Cerca comune"]');
  await search.fill('Milano');
  await page.waitForTimeout(350);
  await page.getByText('Milano', { exact: true }).first().click();
  await page.waitForTimeout(1800);

  const state = await page.evaluate(() => window.__VOLANTINIPRO_STEP2_STATE__);
  assert(state?.truthModel, 'Debug truth model non disponibile');
  const truth = state.truthModel;
  assert(/Milano/i.test(truth.territory.label), 'Scenario primario non e Milano');
  assert(truth.service.key === 'd2d', 'Servizio primario non e Door to Door');
  assert(truth.quantity.current === 10000, 'Quantita corrente iniziale non e 10.000');
  assert(truth.quantity.recommendedRequirement > truth.quantity.current, 'Milano dovrebbe richiedere quantita consigliata superiore');
  assert(truth.coverage.operationalPct > 0 && truth.coverage.operationalPct < 100, 'Copertura corrente Milano non parziale');
  assert(truth.zones.available >= 10, 'NIL disponibili Milano insufficienti nella fixture');
  assert(truth.zones.involved > 0, 'Nessuna zona coinvolta');
  assert(truth.zones.firstPriority?.name, 'Prima priorita assente');

  await page.screenshot({ path: `${outDir}/01-client-milano-1440.png`, fullPage: true });

  await page.getByRole('button', { name: /Apri Analisi Avanzata/i }).click();
  await page.waitForTimeout(300);
  const reportText = await page.locator('body').innerText();
  assert(/Report Territoriale/i.test(reportText), 'Report avanzato non aperto');
  assert(/1,2% del fabbisogno operativo|1,2%/i.test(reportText), 'Copertura Milano 10.000 non formattata correttamente');

  const sections = [
    ['overview', /Panoramica/i],
    ['coverage', /Copertura e quantit/i],
    ['zones', /Zone e priorit/i],
    ['demographics', /Demografia e target/i],
    ['buildings', /Edifici e territorio/i],
    ['omi', /Economia e immobili/i],
    ['score', /Score e raccomandazioni/i],
    ['sources', /Fonti e metodologia/i],
  ];
  for (const [name, matcher] of sections) {
    await page.getByRole('button', { name: matcher }).click();
    await page.waitForTimeout(120);
    const body = await page.locator('body').innerText();
    assert(matcher.test(body), `Sezione ${name} non aperta correttamente`);
    await page.screenshot({ path: `${outDir}/section-${name}.png`, fullPage: true });
  }

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Esporta PDF/i }).click();
  const pdfPage = await popupPromise;
  await pdfPage.waitForLoadState('domcontentloaded');
  const pdfText = await pdfPage.locator('body').innerText();
  assert(/Report Territoriale Avanzato/i.test(pdfText), 'PDF non generato');
  assert(/Economia e OMI/i.test(pdfText), 'PDF senza OMI');
  await pdfPage.screenshot({ path: `${outDir}/pdf-preview.png`, fullPage: true });
  await pdfPage.close();

  for (const width of [1440, 1366, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.waitForTimeout(150);
    const dims = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      active: document.activeElement?.tagName || null,
    }));
    assert(dims.scrollWidth <= dims.clientWidth + 1, `Overflow orizzontale a ${width}px`);
    await page.screenshot({ path: `${outDir}/viewport-${width}.png`, fullPage: true });
  }

  await page.getByRole('button', { name: /Vista Cliente/i }).click();
  await page.waitForTimeout(150);
  const beforeRecommended = await page.evaluate(() => window.__VOLANTINIPRO_STEP2_STATE__?.truthModel);
  const increaseButton = page.getByRole('button', { name: /Aumenta a|Adatta a/i }).first();
  if (await increaseButton.count()) {
    await increaseButton.click();
    await page.waitForTimeout(200);
    const afterRecommended = await page.evaluate(() => window.__VOLANTINIPRO_STEP2_STATE__?.truthModel);
    assert(afterRecommended.quantity.current === afterRecommended.quantity.recommendedRequirement, 'Scenario consigliato non usa la quantita consigliata');
    assert(beforeRecommended.quantity.inserted === afterRecommended.quantity.inserted, 'Quantita originaria persa nello scenario consigliato');
  }

  await page.getByText('Hand to Hand', { exact: true }).first().click();
  await page.waitForTimeout(180);
  assert(/Punti di interesse|POI/i.test(await page.locator('body').innerText()), 'Stato H2H parziale non visibile');
  await page.getByText('Business', { exact: true }).first().click();
  await page.waitForTimeout(180);
  assert(/Attivit|Aziende|Business/i.test(await page.locator('body').innerText()), 'Stato Business parziale non visibile');

  assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`);
  assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(' | ')}`);

  const result = {
    scenario: 'Milano complete municipality, Door to Door, 10.000 flyers',
    coverage: truth.coverage,
    quantity: truth.quantity,
    zones: truth.zones,
    screenshots: outDir,
    consoleErrors,
    pageErrors,
    status: 'PASS',
  };
  fs.writeFileSync(`${outDir}/browser-final-milano-summary.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await browser.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
