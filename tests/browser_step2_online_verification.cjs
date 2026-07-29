const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const baseUrl = process.env.STEP2_ONLINE_BASE_URL || 'http://127.0.0.1:5173';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outputDir = path.resolve(__dirname, '../artifacts/step2-online-2026-07-19');
fs.mkdirSync(outputDir, { recursive: true });

function sanitizeUrl(raw) {
  try {
    const url = new URL(raw);
    for (const key of ['access_token', 'apikey', 'key', 'token']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch { return raw; }
}

function classify(error, evidence) {
  const text = `${error?.message || ''} ${JSON.stringify(evidence.failedRequests || [])}`;
  if (/NIL reali insufficienti/i.test(text)) return 'applicazione';
  if (/401|403|unauthor|jwt|api.?key/i.test(text)) return 'credenziali/API key';
  if (/cors/i.test(text)) return 'CORS';
  if (/429|rate.?limit/i.test(text)) return 'rate limit';
  if (/timeout|timed out/i.test(text)) return 'timeout';
  if (/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ENOTFOUND|ECONN/i.test(text)) return 'configurazione ambiente';
  return 'da classificare';
}

function recordPage(page, scenario) {
  const evidence = { scenario, startedAt: new Date().toISOString(), requests: [], failedRequests: [], console: [], pageErrors: [], screenshots: [], payloads: {} };
  const starts = new WeakMap();
  page.on('request', request => starts.set(request, Date.now()));
  page.on('response', async response => {
    const request = response.request();
    const rawUrl = request.url();
    const relevant = /supabase|mapbox|nominatim|overpass|analysis-|demographic|transport|gtfs/i.test(rawUrl);
    if (!relevant) return;
    const entry = {
      method: request.method(), url: sanitizeUrl(rawUrl), status: response.status(),
      durationMs: starts.has(request) ? Date.now() - starts.get(request) : null,
      resourceType: request.resourceType(),
    };
    try {
      const contentType = response.headers()['content-type'] || '';
      if (/json/i.test(contentType)) {
        const body = await response.text();
        entry.data = JSON.parse(body.slice(0, 100000));
        if (body.length > 100000) entry.truncated = true;
      }
    } catch (error) { entry.bodyReadError = error.message; }
    evidence.requests.push(entry);
  });
  page.on('requestfailed', request => evidence.failedRequests.push({ method: request.method(), url: sanitizeUrl(request.url()), error: request.failure()?.errorText || 'unknown' }));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) evidence.console.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', error => evidence.pageErrors.push(error.stack || error.message));
  return evidence;
}

async function screenshot(page, evidence, name) {
  const file = path.join(outputDir, `${evidence.scenario}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  evidence.screenshots.push(file);
}

async function configureStep1(page, service = 'd2d') {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const cookie = page.getByRole('button', { name: /^Accetta$/i });
  if (await cookie.count()) await cookie.click();
  await page.getByText('Calcola la tua copertura', { exact: true }).click();
  const serviceLabel = service === 'h2h' ? 'Hand to Hand' : service === 'b2b' ? 'Distribuzione Business' : 'Door to Door';
  await page.getByText(serviceLabel, { exact: true }).first().click();
  await page.locator('#section-settore button').filter({ hasText: 'Retail' }).click();
  if (service !== 'b2b') {
    await page.getByText('Prima possibile').first().click();
    await page.getByText(/Sì, voglio anche stampa/i).first().click();
  }
  const format = page.getByText(/^A5$/i).first();
  if (await format.count()) await format.click();
  const plan = page.getByText(/^Singola$/i).first();
  if (await plan.count()) await plan.click();
  const next = page.getByRole('button', { name: /Continua allo Step 2/i });
  await next.waitFor({ state: 'visible' });
  if (!(await next.isEnabled())) throw new Error(`Step 1 incompleto: ${await page.getByRole('status').last().innerText().catch(() => 'stato non disponibile')}`);
  await next.click();
  await page.waitForURL(/\/zona/, { timeout: 30000 });
}

async function selectMunicipality(page, name) {
  const input = page.locator('input[placeholder="Cerca comune"]').first();
  await input.fill(name);
  const localizedName = name === 'Milano' ? '(?:Milano|Milan)' : name;
  const suggestion = page.getByText(new RegExp(`^${localizedName}(?:,|$)`, 'i')).first();
  await suggestion.waitFor({ state: 'visible', timeout: 20000 });
  await suggestion.click();
}

async function waitForTerritory(page, service, territory, timeout = 60000) {
  await page.waitForFunction(({ service, territory }) => {
    const state = window.__VOLANTINIPRO_STEP2_STATE__;
    const truth = state?.truthModel;
    const expectedTerritory = territory.toLowerCase() === 'milano' ? 'milan' : territory.toLowerCase();
    return truth?.service?.key === service
      && String(truth?.territory?.label || '').toLowerCase().includes(expectedTerritory)
      && state?.step2ZonesReady === true
      && state?.isCoverageCalculationComplete === true;
  }, { service, territory }, { timeout });
  return page.evaluate(() => structuredClone(window.__VOLANTINIPRO_STEP2_STATE__));
}

async function scenarioA(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { window.__VOLANTINIPRO_DEBUG_STEP2__ = true; });
  const page = await context.newPage();
  const evidence = recordPage(page, 'A-d2d-varedo');
  try {
    await configureStep1(page, 'd2d');
    await selectMunicipality(page, 'Varedo');
    const state = await waitForTerritory(page, 'd2d', 'Varedo');
    evidence.payloads.initial = state;
    evidence.checks = {
      calculation: state.truthModel.calculation,
      boundary: state.truthModel.territory.zones.some(zone => Boolean(zone.geometry || zone.geometry_geojson)),
      families: state.truthModel.d2d?.kpis?.families ?? null,
      baseRequirement: state.truthModel.quantity.baseRequirement,
      recommendedRequirement: state.truthModel.quantity.recommendedRequirement,
      coverage: state.truthModel.coverage.operationalPct,
    };
    await screenshot(page, evidence, 'step2');
    if (state.truthModel.calculation.status !== 'ready') throw new Error(`Dati territoriali reali non disponibili: ${state.truthModel.calculation.unavailableReason}`);
    if (!evidence.checks.boundary || !(evidence.checks.families > 0) || !(evidence.checks.recommendedRequirement > 0) || evidence.checks.coverage == null) {
      throw new Error(`Contratto territoriale incompleto: ${JSON.stringify(evidence.checks)}`);
    }
    await page.getByRole('button', { name: /Apri Analisi Avanzata/i }).click();
    await page.getByText(/Analisi territoriale avanzata/i).first().waitFor({ state: 'visible', timeout: 15000 });
    await screenshot(page, evidence, 'territorial-report');
    await page.getByRole('button', { name: /Torna alla configurazione|Vista Cliente/i }).first().click();
    const before = await page.evaluate(() => structuredClone(window.__VOLANTINIPRO_STEP2_STATE__.truthModel));
    evidence.payloads.step2ToStep3 = before;
    const continueButton = page.locator('button.btn').last();
    if (!(await continueButton.isEnabled())) throw new Error(`CTA Step 3 disabilitata: ${await continueButton.innerText()}`);
    await continueButton.click();
    await page.waitForURL(/\/calendario/, { timeout: 20000 });
    evidence.payloads.step3Url = page.url();
    await screenshot(page, evidence, 'step3');
    await page.getByRole('button', { name: /Zona e mappa|Indietro/i }).first().click();
    await page.waitForURL(/\/zona/, { timeout: 20000 });
    const returned = await waitForTerritory(page, 'd2d', 'Varedo');
    evidence.payloads.returned = returned;
    evidence.persistence = {
      territory: returned.truthModel.territory.label === before.territory.label,
      currentQuantity: returned.truthModel.quantity.current === before.quantity.current,
      recommendedRequirement: returned.truthModel.quantity.recommendedRequirement === before.quantity.recommendedRequirement,
      coverage: returned.truthModel.coverage.operationalPct === before.coverage.operationalPct,
      userSelections: JSON.stringify(returned.truthModel.userSelections) === JSON.stringify(before.userSelections),
    };
    await screenshot(page, evidence, 'returned-step2');
    if (!Object.values(evidence.persistence).every(Boolean)) throw new Error(`Persistenza non rispettata: ${JSON.stringify(evidence.persistence)}`);
    evidence.status = 'PASS';
  } catch (error) {
    evidence.status = 'FAIL';
    evidence.error = { message: error.message, classification: classify(error, evidence) };
  } finally {
    evidence.finishedAt = new Date().toISOString();
    await context.close();
  }
  return evidence;
}

async function scenarioB(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { window.__VOLANTINIPRO_DEBUG_STEP2__ = true; });
  const page = await context.newPage();
  const evidence = recordPage(page, 'B-d2d-milano-nil');
  try {
    await configureStep1(page, 'd2d');
    await selectMunicipality(page, 'Milano');
    let state = await waitForTerritory(page, 'd2d', 'Milano', 90000);
    evidence.payloads.initial = state;
    const selectedMunicipalityName = state.truthModel.userSelections.selectedMunicipalities[0]?.name || null;
    const milanoAnalysisRequest = [...evidence.requests].reverse().find(entry => /analysis-istat/i.test(entry.url) && /municipality=Milano(?:&|$)/i.test(entry.url));
    const territorialResponse = state.truthModel.rawData.territorialAnalysis;
    evidence.checks = {
      uiTerritory: state.truthModel.territory.label,
      selectedMunicipalityName,
      analysisMunicipalityMilano: Boolean(milanoAnalysisRequest),
      analysisLevel: territorialResponse?.metadata?.analysis_level || territorialResponse?.analysis_level || null,
      nilResponseCount: Array.isArray(territorialResponse?.nil_breakdown) ? territorialResponse.nil_breakdown.length : 0,
      nilAvailable: state.availableNils.length,
      apiNilCount: state.apiNilCount,
      nilWithGeometry: state.apiNilWithGeometryCount,
    };
    if (!String(evidence.checks.uiTerritory).startsWith('Milano ·') || selectedMunicipalityName !== 'Milano' || !evidence.checks.analysisMunicipalityMilano) {
      throw new Error(`Canonicalizzazione Milano non applicata end-to-end: ${JSON.stringify(evidence.checks)}`);
    }
    if (!(state.availableNils.length >= 3) || !(state.apiNilWithGeometryCount >= 3)) throw new Error(`NIL reali insufficienti: ${JSON.stringify(evidence.checks)}`);
    await screenshot(page, evidence, 'nil-loaded');

    const keepCurrent = page.getByRole('button', { name: /Mantieni .* volantini/i }).first();
    if (await keepCurrent.count()) await keepCurrent.click();
    await page.waitForFunction(() => window.__VOLANTINIPRO_STEP2_STATE__?.canContinueCalendar === true, null, { timeout: 30000 });
    state = await page.evaluate(() => structuredClone(window.__VOLANTINIPRO_STEP2_STATE__));
    evidence.payloads.beforeStep3 = state;
    await screenshot(page, evidence, 'milano-before-step3');
    const continueButton = page.locator('button.btn').last();
    if (!(await continueButton.isEnabled())) throw new Error(`CTA Step 3 disabilitata: ${await continueButton.innerText()}`);
    await continueButton.click();
    await page.waitForURL(/\/calendario/, { timeout: 20000 });
    evidence.payloads.step3Url = page.url();
    await screenshot(page, evidence, 'step3');
    await page.getByRole('button', { name: /Zona e mappa|Indietro/i }).first().click();
    await page.waitForURL(/\/zona/, { timeout: 20000 });
    const returned = await waitForTerritory(page, 'd2d', 'Milano', 90000);
    evidence.payloads.returned = returned;
    evidence.persistence = {
      uiTerritory: returned.truthModel.territory.label === state.truthModel.territory.label && returned.truthModel.territory.label.startsWith('Milano ·'),
      selectedMunicipalityName: returned.truthModel.userSelections.selectedMunicipalities[0]?.name === 'Milano',
      quantity: returned.truthModel.quantity.current === state.truthModel.quantity.current,
      nilAvailability: returned.apiNilCount === state.apiNilCount && returned.apiNilCount > 0,
    };
    await screenshot(page, evidence, 'returned-step2');
    if (!Object.values(evidence.persistence).every(Boolean)) throw new Error(`Persistenza Milano/NIL non rispettata: ${JSON.stringify(evidence.persistence)}`);
    evidence.status = 'PASS';
  } catch (error) {
    evidence.status = 'FAIL';
    evidence.error = { message: error.message, classification: classify(error, evidence) };
  } finally {
    evidence.finishedAt = new Date().toISOString();
    await context.close();
  }
  return evidence;
}

async function main() {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const report = { environment: { baseUrl, browser: 'Google Chrome headless', mode: 'online-real-services', generatedAt: new Date().toISOString() }, scenarios: [] };
  try {
    report.scenarios.push(await scenarioA(browser));
    if (report.scenarios.at(-1).status === 'PASS') report.scenarios.push(await scenarioB(browser));
  } finally {
    await browser.close();
  }
  const reportPath = path.join(outputDir, 'online-verification.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, scenarios: report.scenarios.map(item => ({ scenario: item.scenario, status: item.status, error: item.error, checks: item.checks, persistence: item.persistence, network: { requests: item.requests.length, failed: item.failedRequests.length }, console: item.console.length, pageErrors: item.pageErrors.length })) }, null, 2));
  if (report.scenarios.some(item => item.status !== 'PASS')) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exit(1); });
