const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright');

const baseUrl = process.env.STEP2_ONLINE_BASE_URL || 'http://127.0.0.1:5173';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outputDir = path.resolve(__dirname, '../artifacts/step2-online-cf-2026-07-19');
fs.mkdirSync(outputDir, { recursive: true });

function sanitizeUrl(raw) {
  try {
    const url = new URL(raw);
    for (const key of ['access_token', 'apikey', 'key', 'token']) if (url.searchParams.has(key)) url.searchParams.set(key, '[REDACTED]');
    return url.toString();
  } catch { return raw; }
}

function classify(error, evidence) {
  const text = `${error?.message || ''} ${JSON.stringify(evidence.failedRequests || [])}`;
  if (/BLOCKED:/i.test(text)) return 'servizio esterno';
  if (/401|403|unauthor|jwt|api.?key/i.test(text)) return 'credenziali/API key';
  if (/cors/i.test(text)) return 'CORS';
  if (/429|rate.?limit/i.test(text)) return 'rate limit';
  if (/timeout|timed out|504/i.test(text)) return 'timeout';
  if (/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ENOTFOUND|ECONN/i.test(text)) return 'configurazione ambiente';
  return 'applicazione';
}

function recordPage(page, scenario) {
  const evidence = { scenario, startedAt: new Date().toISOString(), requests: [], failedRequests: [], console: [], pageErrors: [], screenshots: [], payloads: {}, checkpoints: [] };
  const starts = new WeakMap();
  page.on('request', request => starts.set(request, Date.now()));
  page.on('response', async response => {
    const request = response.request();
    const rawUrl = request.url();
    if (!/supabase|mapbox|nominatim|overpass|analysis-|demographic|transport|gtfs/i.test(rawUrl)) return;
    const entry = { method: request.method(), url: sanitizeUrl(rawUrl), status: response.status(), durationMs: starts.has(request) ? Date.now() - starts.get(request) : null, resourceType: request.resourceType() };
    try {
      const contentType = response.headers()['content-type'] || '';
      if (/json|geojson/i.test(contentType)) {
        const body = await response.text();
        entry.data = JSON.parse(body.slice(0, 150000));
        if (body.length > 150000) entry.truncated = true;
      }
    } catch (error) { entry.bodyReadError = error.message; }
    evidence.requests.push(entry);
  });
  page.on('requestfailed', request => evidence.failedRequests.push({ method: request.method(), url: sanitizeUrl(request.url()), error: request.failure()?.errorText || 'unknown' }));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) evidence.console.push({ type: message.type(), text: message.text() }); });
  page.on('pageerror', error => evidence.pageErrors.push(error.stack || error.message));
  return evidence;
}

async function shot(page, evidence, name) {
  const file = path.join(outputDir, `${evidence.scenario}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  evidence.screenshots.push(file);
}

async function state(page) {
  return page.evaluate(() => structuredClone(window.__VOLANTINIPRO_STEP2_STATE__));
}

async function waitState(page, predicate, timeout = 90000, arg = null) {
  await page.waitForFunction(predicate, arg, { timeout });
  return state(page);
}

async function openConfigurator(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const cookie = page.getByRole('button', { name: /^Accetta$/i });
  if (await cookie.count()) await cookie.click();
  await page.getByText('Calcola la tua copertura', { exact: true }).click();
}

async function selectCommonStep1(page, service) {
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
}

async function configureStep1(page, service) {
  await openConfigurator(page);
  await selectCommonStep1(page, service);
  if (service === 'h2h') {
    await page.getByText('Stazioni e fermate', { exact: true }).click();
    const panel = page.locator('#section-h2h-config');
    const selects = panel.locator('select');
    await selects.nth(0).selectOption('2');
    await selects.nth(1).selectOption('09:00-13:00');
    await selects.nth(2).selectOption('4');
    await panel.locator('input[placeholder*="Varedo"]').first().fill('Piazza del Duomo, Milano');
  }
  if (service === 'b2b') {
    await page.locator('#business-starting-area').fill('Bergamo');
    await page.getByRole('radio', { name: /^Informare$/i }).click();
    await page.locator('#business-material-quantity').fill('5000');
    await page.getByRole('radio', { name: /^2 copie$/i }).click();
    await page.getByRole('radio', { name: /Consegna al banco/i }).click();
    await page.getByRole('radio', { name: /Materiale già presso VolantiniPro/i }).click();
  }
  const next = page.getByRole('button', { name: /Continua allo Step 2/i });
  await next.waitFor({ state: 'visible' });
  if (!(await next.isEnabled())) {
    const issues = await page.locator('[role="status"]').allInnerTexts().catch(() => []);
    throw new Error(`Step 1 incompleto (${service}): ${issues.join(' | ')}`);
  }
  await next.click();
  await page.waitForURL(/\/zona/, { timeout: 45000 });
}

async function searchAndClick(page, query, matcher) {
  const input = page.locator('input[placeholder="Cerca comune"], input[placeholder^="Aggiungi comune"], input[placeholder="Cerca comune o CAP"]').first();
  await input.fill(query);
  const searchShell = input.locator('xpath=../../..');
  const result = searchShell.getByText(matcher).first();
  await result.waitFor({ state: 'visible', timeout: 25000 });
  await result.click();
}

async function selectMunicipality(page, name) {
  await searchAndClick(page, name, new RegExp(`^${name}(?:,|$)`, 'i'));
}

async function addMunicipality(page, name) {
  await page.getByRole('button', { name: /Aggiungi un'altra zona \/ comune/i }).click();
  await searchAndClick(page, name, new RegExp(`^${name}(?:,|$)`, 'i'));
  await waitState(page, ([target]) => window.__VOLANTINIPRO_STEP2_STATE__?.truthModel?.userSelections?.selectedMunicipalities?.some(item => String(item.name || item.label).toLowerCase() === target), 90000, [name.toLowerCase()]);
}

async function setRadius(page, km) {
  const slider = page.getByRole('slider').first();
  const options = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const index = options.indexOf(km);
  const box = await slider.boundingBox();
  if (!box) throw new Error('Slider del raggio non misurabile');
  await slider.click({ position: { x: Math.max(2, Math.min(box.width - 2, box.width * index / (options.length - 1))), y: box.height / 2 } });
  return waitState(page, expected => {
    const s = window.__VOLANTINIPRO_STEP2_STATE__;
    return Number(s?.radiusKm) === expected && s?.step2ZonesReady === true && s?.isCoverageCalculationComplete === true;
  }, 120000, km);
}

async function chooseCoverageIfNeeded(page) {
  const keep = page.getByRole('button', { name: /Mantieni .* volantini/i }).first();
  if (await keep.count() && await keep.isVisible()) await keep.click();
  const maintainRadius = page.getByRole('button', { name: /^Mantieni (?:1|3|5) km$/i }).first();
  if (await maintainRadius.count() && await maintainRadius.isVisible()) await maintainRadius.click();
  await page.waitForTimeout(500);
}

async function roundTrip(page, evidence) {
  await chooseCoverageIfNeeded(page);
  await page.waitForFunction(() => window.__VOLANTINIPRO_STEP2_STATE__?.canContinueCalendar === true, null, { timeout: 45000 });
  const before = await state(page);
  evidence.payloads.step2ToStep3 = before.truthModel;
  const continueButton = page.locator('button.btn').last();
  if (!(await continueButton.isEnabled())) throw new Error(`CTA Step 3 disabilitata: ${await continueButton.innerText()}`);
  await continueButton.click();
  await page.waitForURL(/\/calendario/, { timeout: 30000 });
  await shot(page, evidence, 'step3');
  await page.getByRole('button', { name: /Zona e mappa|Indietro/i }).first().click();
  await page.waitForURL(/\/zona/, { timeout: 30000 });
  const returned = await waitState(page, () => {
    const s = window.__VOLANTINIPRO_STEP2_STATE__;
    return Boolean(s?.truthModel && s?.step2ZonesReady === true && s?.isCoverageCalculationComplete === true);
  }, 120000);
  evidence.payloads.returned = returned;
  return { before, returned };
}

function namesOf(s) {
  return (s.truthModel?.userSelections?.selectedMunicipalities || []).map(item => item.name || item.label);
}

async function scenarioC(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { window.__VOLANTINIPRO_DEBUG_STEP2__ = true; });
  const page = await context.newPage();
  const evidence = recordPage(page, 'C-address-radius-milano');
  try {
    await configureStep1(page, 'd2d');
    const input = page.locator('input[placeholder="Cerca comune"]').first();
    await input.fill('Piazza del Duomo 1, Milano');
    const addressMarker = page.getByText(/indirizzo\/punto · Milano/i).first();
    await addressMarker.waitFor({ state: 'visible', timeout: 30000 });
    await addressMarker.click();
    let s = await waitState(page, () => Boolean(window.__VOLANTINIPRO_STEP2_STATE__?.selectedSearchPoint?.lat), 60000);
    const addressPoint = s.selectedSearchPoint;
    const geocodeRequest = [...evidence.requests].reverse().find(item => /nominatim.*Piazza|mapbox.*Piazza/i.test(item.url) && item.status === 200);
    if (!geocodeRequest) throw new Error('BLOCKED: nessuna risposta geocoding utilizzabile per l’indirizzo reale');
    await shot(page, evidence, 'address-selected');
    await page.getByRole('button', { name: /Usa raggio da/i }).first().click();
    const radiusResults = {};
    for (const km of [1, 3, 5]) {
      s = await setRadius(page, km);
      radiusResults[km] = {
        coordinates: s.coordinates,
        selectedMunicipalities: namesOf(s),
        zonesInRadiusCount: s.zonesInRadiusCount,
        mapZones: s.step2MapZonesCount,
        intersectedNils: s.intersectedNils?.map(nil => nil.name || nil.nil_name) || [],
        quantity: s.truthModel.quantity,
        coverage: s.truthModel.coverage,
        boundaryCount: s.truthModel.territory.zones.filter(zone => Boolean(zone.geometry || zone.geometry_geojson)).length,
      };
      evidence.checkpoints.push({ radiusKm: km, state: radiusResults[km] });
      await shot(page, evidence, `radius-${km}km`);
    }
    const centerStable = Object.values(radiusResults).every(result => Math.abs(Number(result.coordinates?.lat) - Number(addressPoint.lat)) < 1e-7 && Math.abs(Number(result.coordinates?.lng) - Number(addressPoint.lng)) < 1e-7);
    if (!centerStable) throw new Error('Il centro del raggio non coincide con le coordinate dell’indirizzo');
    if (Object.values(radiusResults).some(result => !(result.quantity.recommendedRequirement > 0) || result.coverage.operationalPct == null || result.boundaryCount < 1)) throw new Error('Contratto territoriale raggio incompleto');
    const { before, returned } = await roundTrip(page, evidence);
    evidence.persistence = {
      point: JSON.stringify(returned.selectedSearchPoint) === JSON.stringify(before.selectedSearchPoint),
      radius: returned.radiusKm === before.radiusKm && returned.radiusKm === 5,
      decision: returned.truthModel.userSelections.coverageDecision === before.truthModel.userSelections.coverageDecision,
      quantity: returned.truthModel.quantity.current === before.truthModel.quantity.current,
    };
    evidence.checks = { geocoding: geocodeRequest.url, addressPoint, centerStable, radiusResults };
    await shot(page, evidence, 'returned-step2');
    if (!Object.values(evidence.persistence).every(Boolean)) throw new Error(`Persistenza scenario C non rispettata: ${JSON.stringify(evidence.persistence)}`);
    evidence.status = 'PASS';
  } catch (error) {
    evidence.payloads.failureState = await state(page).catch(() => null);
    evidence.status = /^BLOCKED:/i.test(error.message) ? 'BLOCKED' : 'FAIL';
    evidence.error = { message: error.message, classification: classify(error, evidence) };
    await shot(page, evidence, 'failure').catch(() => {});
  } finally { evidence.finishedAt = new Date().toISOString(); await context.close(); }
  return evidence;
}

async function scenarioD(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { window.__VOLANTINIPRO_DEBUG_STEP2__ = true; });
  const page = await context.newPage();
  const evidence = recordPage(page, 'D-multi-comune');
  try {
    await configureStep1(page, 'd2d');
    await selectMunicipality(page, 'Cormano');
    await waitState(page, () => window.__VOLANTINIPRO_STEP2_STATE__?.isCoverageCalculationComplete === true, 90000);
    await addMunicipality(page, 'Bresso');
    await addMunicipality(page, 'Monza');
    let s = await waitState(page, () => window.__VOLANTINIPRO_STEP2_STATE__?.truthModel?.userSelections?.selectedMunicipalities?.length === 3 && window.__VOLANTINIPRO_STEP2_STATE__?.isCoverageCalculationComplete === true, 120000);
    const initialOrder = namesOf(s);
    const uniqueInitial = new Set(initialOrder.map(name => name.toLowerCase())).size === initialOrder.length;
    const boundaryCount = s.truthModel.territory.zones.filter(zone => Boolean(zone.geometry || zone.geometry_geojson)).length;
    await shot(page, evidence, 'three-municipalities');
    await addMunicipality(page, 'Cormano');
    s = await state(page);
    const afterDuplicate = namesOf(s);
    const duplicatePrevented = afterDuplicate.length === 3 && new Set(afterDuplicate.map(name => name.toLowerCase())).size === 3;
    const removeButtons = page.getByTitle('Rimuovi comune dalla selezione (cambia i KPI)');
    let removed = false;
    for (let i = 0; i < await removeButtons.count(); i += 1) {
      const button = removeButtons.nth(i);
      if (/Bresso/i.test(await button.locator('..').innerText())) { await button.click(); removed = true; break; }
    }
    if (!removed) throw new Error('Controllo rimozione Bresso non disponibile in UI');
    s = await waitState(page, () => window.__VOLANTINIPRO_STEP2_STATE__?.truthModel?.userSelections?.selectedMunicipalities?.length === 2 && window.__VOLANTINIPRO_STEP2_STATE__?.isCoverageCalculationComplete === true, 120000);
    const afterRemoval = namesOf(s);
    evidence.checks = { initialOrder, uniqueInitial, boundaryCount, afterDuplicate, duplicatePrevented, afterRemoval };
    if (initialOrder.join('|') !== 'Cormano|Bresso|Monza' || !uniqueInitial || !duplicatePrevented || afterRemoval.join('|') !== 'Cormano|Monza' || boundaryCount < 3) throw new Error(`Contratto multi-comune non rispettato: ${JSON.stringify(evidence.checks)}`);
    await shot(page, evidence, 'after-removal');
    const { before, returned } = await roundTrip(page, evidence);
    evidence.persistence = {
      names: namesOf(returned).join('|') === namesOf(before).join('|') && namesOf(returned).join('|') === 'Cormano|Monza',
      quantity: returned.truthModel.quantity.current === before.truthModel.quantity.current,
      decision: returned.truthModel.userSelections.coverageDecision === before.truthModel.userSelections.coverageDecision,
      allocationOrder: returned.truthModel.allocation.rows.map(row => row.name).join('|') === before.truthModel.allocation.rows.map(row => row.name).join('|'),
    };
    await shot(page, evidence, 'returned-step2');
    if (!Object.values(evidence.persistence).every(Boolean)) throw new Error(`Persistenza scenario D non rispettata: ${JSON.stringify(evidence.persistence)}`);
    evidence.status = 'PASS';
  } catch (error) {
    evidence.payloads.failureState = await state(page).catch(() => null);
    evidence.status = /^BLOCKED:/i.test(error.message) ? 'BLOCKED' : 'FAIL';
    evidence.error = { message: error.message, classification: classify(error, evidence) };
    await shot(page, evidence, 'failure').catch(() => {});
  } finally { evidence.finishedAt = new Date().toISOString(); await context.close(); }
  return evidence;
}

async function scenarioE(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { window.__VOLANTINIPRO_DEBUG_STEP2__ = true; });
  const page = await context.newPage();
  const evidence = recordPage(page, 'E-hand-to-hand');
  try {
    await configureStep1(page, 'h2h');
    await page.waitForFunction(() => window.__VOLANTINIPRO_STEP2_STATE__?.truthModel?.service?.key === 'h2h', null, { timeout: 60000 });
    await page.waitForTimeout(35000);
    let s = await state(page);
    const availablePois = s.truthModel.rawData.pois.length;
    const transport = s.truthModel.rawData.transport;
    const selectedMunicipalityName = s.truthModel.userSelections.selectedMunicipalities[0]?.name || null;
    if (selectedMunicipalityName !== 'Milano' || s.selectedSearchPoint?.parentComune !== 'Milano') throw new Error(`Nome comunale H2H non canonico: ${JSON.stringify({ selectedMunicipalityName, parentComune: s.selectedSearchPoint?.parentComune })}`);
    if (availablePois < 5) throw new Error(`BLOCKED: soltanto ${availablePois} POI reali disponibili`);
    if (!s.truthModel.availability.mobility || !transport?.available) throw new Error('BLOCKED: dati TPL/mobilità non disponibili');
    await page.getByRole('button', { name: /Seleziona tutti e assegna/i }).click();
    s = await waitState(page, () => window.__VOLANTINIPRO_STEP2_STATE__?.truthModel?.h2h?.kpis?.selectedPointCount >= 5, 30000);
    const kpis = s.truthModel.h2h.kpis;
    evidence.checks = {
      radiusKm: s.radiusKm,
      point: s.selectedSearchPoint,
      selectedMunicipalityName,
      uiMilano: await page.getByText(/Zona\s*1.*Milano/i).count() > 0,
      availablePois,
      selectedPois: kpis.selectedPointCount,
      tplStops: transport.stops?.length || 0,
      transportSources: transport.sources || [],
      promoterCount: kpis.operatorCount,
      operationalCapacity: kpis.operatorSchedules?.reduce((sum, row) => sum + Number(row.serviceDurationHours || 0) * 500, 0) || null,
      requirement: s.truthModel.quantity.recommendedRequirement,
      d2dAvailable: s.truthModel.d2d.available,
      familiesKpi: kpis.families ?? null,
      mailboxesKpi: kpis.mailboxes ?? null,
    };
    if (!evidence.checks.uiMilano || availablePois !== 58 || evidence.checks.tplStops !== 906 || evidence.checks.promoterCount !== 2 || evidence.checks.operationalCapacity !== 4000 || evidence.checks.requirement !== 1600 || evidence.checks.d2dAvailable) throw new Error(`Contratto H2H non coerente: ${JSON.stringify(evidence.checks)}`);
    await shot(page, evidence, 'poi-selected');
    const { before, returned } = await roundTrip(page, evidence);
    evidence.persistence = {
      point: JSON.stringify(returned.selectedSearchPoint) === JSON.stringify(before.selectedSearchPoint),
      radius: returned.radiusKm === before.radiusKm && returned.radiusKm === 3,
      selectedPois: JSON.stringify(returned.truthModel.userSelections.selectedPoiIds) === JSON.stringify(before.truthModel.userSelections.selectedPoiIds) && returned.truthModel.userSelections.selectedPoiIds.length >= 5,
      promoters: returned.truthModel.h2h.kpis.operatorCount === before.truthModel.h2h.kpis.operatorCount,
      municipality: returned.selectedSearchPoint?.parentComune === 'Milano' && returned.truthModel.userSelections.selectedMunicipalities[0]?.name === 'Milano',
      quantity: returned.truthModel.quantity.current === before.truthModel.quantity.current,
      capacity: returned.truthModel.h2h.kpis.operatorSchedules.reduce((sum, row) => sum + Number(row.serviceDurationHours || 0) * 500, 0) === 4000,
      requirement: returned.truthModel.quantity.recommendedRequirement === before.truthModel.quantity.recommendedRequirement && returned.truthModel.quantity.recommendedRequirement === 1600,
    };
    await shot(page, evidence, 'returned-step2');
    if (!Object.values(evidence.persistence).every(Boolean)) throw new Error(`Persistenza scenario E non rispettata: ${JSON.stringify(evidence.persistence)}`);
    evidence.status = 'PASS';
  } catch (error) {
    evidence.payloads.failureState = await state(page).catch(() => null);
    evidence.status = /^BLOCKED:/i.test(error.message) ? 'BLOCKED' : 'FAIL';
    evidence.error = { message: error.message, classification: classify(error, evidence) };
    await shot(page, evidence, 'failure').catch(() => {});
  } finally { evidence.finishedAt = new Date().toISOString(); await context.close(); }
  return evidence;
}

async function scenarioF(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { window.__VOLANTINIPRO_DEBUG_STEP2__ = true; });
  const page = await context.newPage();
  const evidence = recordPage(page, 'F-business-bergamo');
  try {
    await configureStep1(page, 'b2b');
    let s = await waitState(page, () => {
      const x = window.__VOLANTINIPRO_STEP2_STATE__;
      return x?.truthModel?.service?.key === 'b2b' && x.truthModel?.rawData?.pois?.length > 0;
    }, 150000);
    const available = s.truthModel.rawData.pois;
    if (available.length < 2) throw new Error(`BLOCKED: soltanto ${available.length} attività reali disponibili`);
    const categories = [...new Set(available.map(poi => poi.category).filter(Boolean))];
    if (!categories.length) throw new Error('BLOCKED: attività reali senza categorie utilizzabili');
    await page.getByRole('button', { name: /Seleziona automaticamente/i }).click();
    s = await waitState(page, () => window.__VOLANTINIPRO_STEP2_STATE__?.truthModel?.business?.materialPlan?.selectedActivities >= 2, 30000);
    const copyInputs = page.locator('label').filter({ hasText: /^\s*Copie\s*$/ }).locator('input');
    if (await copyInputs.count() >= 2) {
      await copyInputs.nth(0).fill('3');
      await copyInputs.nth(1).fill('5');
    }
    s = await waitState(page, () => {
      const rows = window.__VOLANTINIPRO_STEP2_STATE__?.truthModel?.business?.materialPlan?.rows || [];
      return rows.length >= 2 && Number(rows[0].copies) === 3 && Number(rows[1].copies) === 5;
    }, 30000);
    const plan = s.truthModel.business.materialPlan;
    evidence.checks = {
      municipality: namesOf(s),
      availableActivities: available.length,
      categories,
      selectedActivities: plan.selectedActivities,
      firstCopies: plan.rows.slice(0, 2).map(row => row.copies),
      materialsRequired: plan.materialsRequired,
      materialsRemaining: plan.materialsRemaining,
      materialsMissing: plan.materialsMissing,
      competitorCount: s.truthModel.business.competitorCount,
      selectedNils: s.truthModel.territory.nils.length,
      rawNilCount: s.truthModel.rawData.territorialAnalysis?.nil_breakdown?.length || 0,
    };
    if (!namesOf(s).some(name => /Bergamo/i.test(name)) || !(plan.materialsRequired > 0) || (plan.materialsRemaining == null && plan.materialsMissing == null) || s.truthModel.business.competitorCount !== null || evidence.checks.selectedNils !== 0 || evidence.checks.rawNilCount !== 0) throw new Error(`Contratto Business non rispettato: ${JSON.stringify(evidence.checks)}`);
    await shot(page, evidence, 'activities-selected');
    const { before, returned } = await roundTrip(page, evidence);
    evidence.persistence = {
      municipality: namesOf(returned).join('|') === namesOf(before).join('|'),
      selectedActivities: JSON.stringify(returned.truthModel.userSelections.selectedPoiIds) === JSON.stringify(before.truthModel.userSelections.selectedPoiIds) && returned.truthModel.userSelections.selectedPoiIds.length >= 2,
      copies: JSON.stringify(returned.truthModel.business.materialPlan.rows.map(row => row.copies)) === JSON.stringify(before.truthModel.business.materialPlan.rows.map(row => row.copies)),
      materialPlan: returned.truthModel.business.materialPlan.materialsRequired === before.truthModel.business.materialPlan.materialsRequired,
      competitorNull: returned.truthModel.business.competitorCount === null,
    };
    await shot(page, evidence, 'returned-step2');
    if (!Object.values(evidence.persistence).every(Boolean)) throw new Error(`Persistenza scenario F non rispettata: ${JSON.stringify(evidence.persistence)}`);
    evidence.status = 'PASS';
  } catch (error) {
    evidence.payloads.failureState = await state(page).catch(() => null);
    evidence.status = /^BLOCKED:/i.test(error.message) ? 'BLOCKED' : 'FAIL';
    evidence.error = { message: error.message, classification: classify(error, evidence) };
    await shot(page, evidence, 'failure').catch(() => {});
  } finally { evidence.finishedAt = new Date().toISOString(); await context.close(); }
  return evidence;
}

async function main() {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const report = { environment: { baseUrl, browser: 'Google Chrome headless', mode: 'online-real-services-no-fixtures', generatedAt: new Date().toISOString() }, scenarios: [] };
  try {
    const allRuns = { C: scenarioC, D: scenarioD, E: scenarioE, F: scenarioF };
    const selected = String(process.env.STEP2_CF_SCENARIOS || 'C,D,E,F').split(',').map(item => item.trim().toUpperCase()).filter(Boolean);
    for (const key of selected) report.scenarios.push(await allRuns[key](browser));
  } finally { await browser.close(); }
  const reportPath = path.join(outputDir, 'online-verification-cf.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, scenarios: report.scenarios.map(item => ({ scenario: item.scenario, status: item.status, error: item.error, checks: item.checks, persistence: item.persistence, network: { requests: item.requests.length, failed: item.failedRequests.length }, console: item.console.length, pageErrors: item.pageErrors.length })) }, null, 2));
  if (report.scenarios.some(item => item.status === 'FAIL')) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exit(1); });
