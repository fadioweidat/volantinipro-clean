const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const projectUrl = 'http://localhost:5173/';
const outDir = 'D:/cloaude volantini/volantinipro/artifacts/ux-step2-closeout-2026-07-17';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
function assert(condition, message) { if (!condition) throw new Error(message); }

const boundary = {
  type: 'Polygon',
  coordinates: [[[9.145,45.565],[9.171,45.565],[9.174,45.585],[9.151,45.588],[9.145,45.565]]],
};
const analysis = {
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
    id: 'varedo', name: 'Varedo', comune_name: 'Varedo', municipality_code: '108045',
    population: 13914, pop: 13914, households: 6176, families: 6176, area_km2: 4.8, area: 4.8,
    coverage: 100, recommended_flyers: 6794, volantini_nel_raggio: 6794,
    geometry_geojson: boundary,
  }],
  comuni_breakdown: [{
    municipality_code: '108045', comune_name: 'Varedo', population: 13914, households: 6176,
    area_km2: 4.8, pct_copertura: 100, recommended_flyers: 6794, volantini_nel_raggio: 6794,
    density_per_km2: 2898, geometry_geojson: boundary,
  }],
  territorial_breakdown: [{ municipality_code: '108045', comune_name: 'Varedo', population: 13914, households: 6176, area_km2: 4.8, geometry_geojson: boundary }],
  sources: ['ISTAT','Dati geografici'],
};

async function main() {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => { window.__VOLANTINIPRO_DEBUG_STEP2__ = true; });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => { pageErrors.push(error.stack || error.message); console.error('[PAGEERROR]', error.stack || error.message); });
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(projectUrl)) return route.continue();
    if (url.includes('mapbox.com/geocoding') || url.includes('api.mapbox.com/search')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: [{ id: 'place.varedo', place_type: ['place'], text: 'Varedo', place_name: 'Varedo, Monza e Brianza, Italia', center: [9.16,45.575], properties: { short_code: 'it-mb' }, context: [] }] }) });
    }
    if (url.includes('analysis-istat')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(analysis) });
    if (url.includes('nominatim.openstreetmap.org')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: boundary, properties: { display_name: 'Varedo, Monza e Brianza, Lombardia, Italia', addresstype: 'town' } }] }) });
    if (url.includes('/rest/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' });
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('tiles') || url.includes('mapbox')) return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const cookieAccept = page.getByRole('button', { name: /^Accetta$/i });
  if (await cookieAccept.count()) await cookieAccept.click();
  const allText = await page.locator('body').innerText();
  if (!/Configura|Door to Door|Volantini/i.test(allText)) throw new Error('Pagina iniziale inattesa');
  await page.getByText('Calcola la tua copertura', { exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByText('Door to Door', { exact: true }).first().click();
  await page.getByText('Retail').first().click();
  await page.getByText('Prima possibile').first().click();
  await page.getByRole('button', { name: /Continua allo Step 2/i }).click();
  await page.waitForTimeout(700);
  console.log('[STEP2 DEBUG]', page.url(), (await page.locator('body').innerText()).slice(0, 1200));
  const search = page.locator('input[placeholder="Cerca comune"]');
  await search.fill('Varedo');
  await page.waitForTimeout(400);
  await page.getByText('Varedo', { exact: true }).first().click();
  await page.waitForTimeout(1400);
  await page.getByRole('button', { name: /Mantieni 10\.000/i }).click();
  await page.waitForTimeout(150);
  assert(await page.getByRole('button', { name: /Mantieni 10\.000/i }).getAttribute('aria-pressed') === 'true', 'Mantieni non selezionato');
  const clientPanelText = await page.getByText(/Risultato della configurazione/i).first().locator('..').locator('..').innerText();
  assert(/Famiglie\/cassette stimate nel territorio/i.test(clientPanelText), 'Terminologia famiglie/cassette non coerente nel pannello cliente');
  assert(/del fabbisogno operativo/i.test(clientPanelText), 'Denominatore operativo assente nel pannello cliente');
  assert(!/fabbisogno del raggio/i.test(clientPanelText), 'Wording raggio usato fuori contesto nel pannello cliente');
  await page.screenshot({ path: `${outDir}/01-vista-cliente-mantieni-desktop.png`, fullPage: true });
  await page.locator('.leaflet-container').screenshot({ path: `${outDir}/05-mappa-padding-corretto.png` });
  await page.locator('.vp-step2-scenario-grid').screenshot({ path: `${outDir}/04-scenari-quantita.png` });
  await page.getByText(/Risultato della configurazione/i).first().locator('..').locator('..').screenshot({ path: `${outDir}/03-pannello-laterale-etichette.png` });
  await page.getByRole('button', { name: /Apri Analisi Avanzata/i }).click();
  await page.waitForTimeout(250);
  let advancedText = await page.locator('body').innerText();
  assert(/Report Territoriale/i.test(advancedText), 'Report territoriale non aperto');
  assert(/10\.000 pz\./.test(advancedText), 'Scenario corrente 10.000 non mostrato');
  assert(!/tempo reale/i.test(advancedText), 'Fonte dichiarata impropriamente real-time');
  await page.getByRole('button', { name: /Copertura e quantità/i }).click();
  advancedText = await page.locator('body').innerText();
  assert(/Durata non calcolabile: numero operatori non disponibile/i.test(advancedText), 'Durata non disponibile non dichiarata');
  assert(!/3 giorni operativi/i.test(advancedText), 'Durata calendario inventata senza operatori');
  assert(/fabbisogno operativo/i.test(advancedText), 'Denominatore copertura assente');
  assert(/del fabbisogno operativo/i.test(advancedText), 'Valore copertura operativo non mostrato con denominatore nel report');
  await page.screenshot({ path: `${outDir}/06-report-copertura-semantica.png`, fullPage: true });
  const coverageAccordion = page.getByRole('button', { name: /Come viene calcolato/i });
  await coverageAccordion.focus();
  await page.keyboard.press('Enter');
  assert(await coverageAccordion.getAttribute('aria-expanded') === 'true', 'Formula non apribile da tastiera');
  await page.getByRole('button', { name: /Zone e priorità/i }).click();
  const zoneText = await page.locator('body').innerText();
  assert(/Assegnati/i.test(zoneText) && /Fabbisogno zona/i.test(zoneText), 'Allocazione per zona incompleta');
  await page.getByRole('button', { name: /Demografia e target/i }).click();
  const demoText = await page.locator('body').innerText();
  assert(/famiglie residenti e fabbisogno operativo differiscono/i.test(demoText), 'Spiegazione famiglie residenti vs fabbisogno operativo assente');
  await page.getByRole('button', { name: /Edifici e territorio/i }).click();
  const buildingsText = await page.locator('body').innerText();
  assert(/Dato non disponibile/i.test(buildingsText) && /N\/D/i.test(buildingsText), 'Badge/stato edifici non disponibile assente');
  await page.screenshot({ path: `${outDir}/08-edifici-non-disponibile.png`, fullPage: true });
  await page.getByRole('button', { name: /Economia e immobili/i }).click();
  const omiText = await page.locator('body').innerText();
  assert(!/Area con elevato valore immobiliare/i.test(omiText), 'Classificazione OMI non supportata ancora presente');
  assert(/zone OMI|Numero zone OMI non restituito/i.test(omiText), 'Contesto geografico OMI assente');
  await page.screenshot({ path: `${outDir}/08b-omi-contesto.png`, fullPage: true });
  await page.getByRole('button', { name: /Score e raccomandazioni/i }).click();
  const scoreText = await page.locator('body').innerText();
  assert(!/famiglie\/POI raggiungibili/i.test(scoreText), 'Score D2D cita ancora POI non disponibili');
  await page.getByRole('button', { name: /Fonti e metodologia/i }).click();
  const sourceText = await page.locator('body').innerText();
  assert(/Confidenza per sezione/i.test(sourceText), 'Confidenza per sezione assente');
  assert(/fonti e modelli disponibili/i.test(sourceText), 'Conteggio fonti/modelli non rinominato');
  assert(/Non è un feed real-time/i.test(sourceText), 'Limite GTFS non dichiarato');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Esporta PDF/i }).click();
  const pdfPage = await popupPromise;
  await pdfPage.waitForLoadState('domcontentloaded');
  const pdfText = await pdfPage.locator('body').innerText();
  assert(/Report Territoriale Avanzato/i.test(pdfText), 'PDF report non generato');
  assert(/del fabbisogno operativo|Copertura scenario corrente/i.test(pdfText), 'PDF non conserva la copertura con denominatore');
  assert(/Economia e OMI/i.test(pdfText), 'PDF non contiene contesto OMI');
  assert(/Fabbisogno operativo consigliato/i.test(pdfText), 'PDF non conserva la semantica quantità');
  assert(/Zone prioritarie/i.test(pdfText), 'PDF non contiene le zone');
  await pdfPage.close();
  await page.screenshot({ path: `${outDir}/09-fonti-confidenza.png`, fullPage: true });
  const accordionCount = 1;

  for (const width of [1440, 1366, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
    await page.waitForTimeout(100);
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    assert(dimensions.scrollWidth <= dimensions.clientWidth + 1, `Overflow orizzontale a ${width}px: ${JSON.stringify(dimensions)}`);
    if ([1440, 1366, 768, 390].includes(width)) await page.screenshot({ path: `${outDir}/${width === 1440 ? '12-desktop-1440' : width === 1366 ? '12b-desktop-1366' : width === 768 ? '13-tablet-768' : '14-mobile-390'}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /Vista Cliente/i }).click();
  assert(await page.getByRole('button', { name: /Mantieni 10\.000/i }).getAttribute('aria-pressed') === 'true', 'Mantieni perso al ritorno');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(120);
  const clientMobileDimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assert(clientMobileDimensions.scrollWidth <= clientMobileDimensions.clientWidth + 1, `Overflow Vista Cliente mobile: ${JSON.stringify(clientMobileDimensions)}`);
  await page.screenshot({ path: `${outDir}/15-vista-cliente-mobile-390.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const zoneDetails = page.locator('button[aria-controls="vp-step2-zone-details-panel"]');
  await zoneDetails.click();
  assert(await zoneDetails.getAttribute('aria-expanded') === 'true', 'Dettaglio zone non aperto');
  await page.locator('.vp-step2-zone-details').screenshot({ path: `${outDir}/16-dettaglio-zone-tabella.png` });
  await zoneDetails.click();
  await page.getByRole('button', { name: /Adatta a 6\.794/i }).click();
  assert(await page.getByRole('button', { name: /Adatta a 6\.794/i }).getAttribute('aria-pressed') === 'true', 'Adatta non selezionato');
  await page.screenshot({ path: `${outDir}/02-vista-cliente-adatta-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: /Apri Analisi Avanzata/i }).click();
  advancedText = await page.locator('body').innerText();
  assert(/6\.794 pz\./.test(advancedText), 'Report non usa lo scenario consigliato 6.794');
  await page.getByRole('button', { name: /Copertura e quantità/i }).click();
  advancedText = await page.locator('body').innerText();
  assert(/6794 ÷ 4000 = 1,7 giorni-operatore/.test(advancedText), 'Giorni-operatore consigliati assenti');
  assert(/Durata non calcolabile: numero operatori non disponibile/i.test(advancedText), 'Durata calendario inventata nello scenario consigliato');
  await page.screenshot({ path: `${outDir}/07-report-adatta-semantica.png`, fullPage: true });
  await page.getByRole('button', { name: /Vista Cliente/i }).click();
  assert(await page.getByRole('button', { name: /Adatta a 6\.794/i }).getAttribute('aria-pressed') === 'true', 'Adatta perso al secondo ritorno');

  const continueButton = page.locator('button.btn').last();
  console.log('debug state', await page.evaluate(() => window.__VOLANTINIPRO_STEP2_STATE__));
  console.log('CTA finale', await continueButton.innerText(), 'disabled=', await continueButton.isDisabled());
  assert(await continueButton.isEnabled(), `CTA Step 3 non disponibile: ${await continueButton.innerText()}`);
  await continueButton.click();
  await page.waitForTimeout(200);
  const backToMap = page.getByRole('button', { name: /Zona e mappa|Indietro/i }).first();
  assert(await backToMap.count(), 'Ritorno Step 3 → Step 2 non trovato');
  await backToMap.click();
  await page.waitForTimeout(200);
  const returnText = await page.locator('body').innerText();
  assert(/QUANTITÀ INSERITA\s*10\.000/i.test(returnText), 'Quantità originaria persa dopo Step 3');
  assert(await page.getByRole('button', { name: /Adatta a 6\.794/i }).getAttribute('aria-pressed') === 'true', 'Decisione persa dopo Step 3');
  await page.getByText('Hand to Hand', { exact: true }).first().click();
  await page.waitForTimeout(120);
  const h2hClientText = await page.locator('body').innerText();
  assert(/Punti di interesse|POI rilevanti/i.test(h2hClientText), 'KPI Hand to Hand non specifico del servizio');
  await page.getByText('Business', { exact: true }).first().click();
  await page.waitForTimeout(120);
  const businessClientText = await page.locator('body').innerText();
  assert(/Aziende raggiungibili|Attività/i.test(businessClientText), 'KPI Business non specifico del servizio');
  await page.getByText('Door to Door', { exact: true }).first().click();
  assert(pageErrors.length === 0, `Errori pagina: ${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ accordionCount, pageErrors, persistence: true, pdf: true, sourceConfidence: true, serviceSwitch: ['d2d','h2h','business'], responsive: [1440,1366,1024,768,390] }));
  await browser.close();
}

main().catch(error => { console.error(error); process.exit(1); });
