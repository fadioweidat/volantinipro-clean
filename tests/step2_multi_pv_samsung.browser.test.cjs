// E2E Step 2 multi punto vendita su viewport Samsung (360x800, 412x915).
//
// Uso:
//   npm run build
//   node tests/step2_multi_pv_samsung.browser.test.cjs            -> geocoder/stradario da cache locale (deterministico)
//   LIVE=1 node tests/step2_multi_pv_samsung.browser.test.cjs     -> tutto reale (integrazione)
//
// - Avvia `vite preview` su http://localhost:5173 (unica origine locale autorizzata
//   dal token Mapbox) se STEP2_E2E_URL non e' impostato.
// - Modalita' deterministica: le risposte REALI di Mapbox, Nominatim e stradario del
//   Comune vengono registrate la prima volta in una cache locale fuori dal repository
//   (i risultati Mapbox non vanno salvati nel codice) e poi riprodotte identiche.
//   analysis-istat e Supabase restano reali (sola lettura, utente anonimo).
// - Nessun ordine, pagamento o salvataggio: il test si ferma allo Step 2.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fady/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const LIVE = process.env.LIVE === '1';
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.STEP2_E2E_OUT || path.join(os.tmpdir(), 'volantinipro-step2-e2e');
const CACHE_FILE = process.env.STEP2_E2E_CACHE || path.join(OUT, 'geocoding-cache.json');
const DRAFT_KEY = 'volantinipro_configurator_draft_v1';
const SAMSUNG_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
// Errori del ciclo di vita Leaflet 1.9.4 quando cambiando PV la mappa viene rimontata
// (Step2Map.jsx identico alla produzione b89e78f; 'clearRect'/'save' riprodotti anche con
// il codice di produzione): ridisegno canvas in coda e fine animazione zoom (setTimeout
// 250 ms) eseguiti dopo map.remove(). Non bloccano la UI e lo stato dei PV resta intatto
// (verificato sotto); vengono conteggiati e riportati. Ogni altro errore JS fa fallire il test.
const KNOWN_CANVAS_ERROR = /Cannot read properties of undefined \(reading '(clearRect|save|_leaflet_pos)'\)/;
const GEO_RE = /api\.mapbox\.com\/geocoding|nominatim\.openstreetmap\.org\/(search|reverse)|dati\.comune\.milano\.it\/api/;

fs.mkdirSync(OUT, { recursive: true });
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
let cacheDirty = false;
const cacheKey = url => url.replace(/([?&])access_token=[^&]+/, '$1access_token=*');
let currentPage = null;
let currentMonitor = null;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function startServerIfNeeded() {
  if (process.env.STEP2_E2E_URL) return { url: process.env.STEP2_E2E_URL, close: async () => {} };
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'Eseguire prima npm run build');
  const vite = await import('file:///' + path.join(ROOT, 'node_modules/vite/dist/node/index.js').split(path.sep).join('/'));
  const server = await vite.preview({ root: ROOT, logLevel: 'error', preview: { port: 5173, strictPort: true, host: 'localhost' } });
  return { url: 'http://localhost:5173', close: () => new Promise(r => server.httpServer.close(r)) };
}

function monitor(page, ctx) {
  const m = { pageErrors: [], knownCanvas: 0, consoleErrors: [], http: [], failed: [], geo: [], misses: [], analysis: [] };
  currentMonitor = m;
  const t0 = Date.now();
  page.on('request', r => { if (/analysis-istat/.test(r.url())) { const q = new URL(r.url()).searchParams; m.analysis.push({ t: Date.now() - t0, req: `${q.get('lat')},${q.get('lng')} r=${q.get('radius')} ${q.get('selectionScope')}` }); } });
  page.on('response', async r => { if (!/analysis-istat/.test(r.url())) return; let fam = null; try { const j = await r.json(); fam = j && j.values ? (j.values.famiglie_stimate ?? j.values.households) : 'no-values'; } catch { fam = 'unparsed'; } const q = new URL(r.url()).searchParams; m.analysis.push({ t: Date.now() - t0, resp: `r=${q.get('radius')} ${r.status()} fam=${fam}` }); });
  page.on('pageerror', e => { if (KNOWN_CANVAS_ERROR.test(e.message)) m.knownCanvas++; else m.pageErrors.push(`${e.message} @ ${String(e.stack || '').split(/\n/).slice(1, 5).map(x => x.trim().replace(/https?:\/\/[^/]+\//, '')).join(' <- ')}`); });
  page.on('console', msg => { if (msg.type() === 'error') m.consoleErrors.push(msg.text().slice(0, 240)); });
  page.on('response', r => {
    const u = r.url();
    if (r.status() >= 400 && /supabase\.co|mapbox\.com|nominatim|dati\.comune\.milano|localhost:5173/.test(u)) m.http.push(`${r.status()} ${cacheKey(u).slice(0, 160)}`);
    if (GEO_RE.test(u)) m.geo.push(r.status());
  });
  page.on('requestfailed', r => { const u = r.url(); if (!ctx.intentionalAbort(u) && !/\/tiles?\/|basemaps|fonts\.|\.png|google|vercel|analytics/.test(u)) m.failed.push(`${r.failure()?.errorText} ${cacheKey(u).slice(0, 140)}`); });
  return m;
}

async function installRoutes(page, opts = {}) {
  const ctx = { delayNextGeocoderMs: 0, geocoderDown: Boolean(opts.geocoderDown), registryDown: Boolean(opts.registryDown) };
  const isAddressGeocode = u => (/api\.mapbox\.com\/geocoding/.test(u) && !/\/Milano\.json/.test(u)) || (/nominatim\.openstreetmap\.org\/search/.test(u) && /q=(via|viale|piazza|corso|largo)/i.test(u));
  ctx.intentionalAbort = u => (ctx.geocoderDown && isAddressGeocode(u)) || (ctx.registryDown && /dati\.comune\.milano\.it/.test(u));
  await page.route(GEO_RE, async route => {
    const u = route.request().url();
    if (ctx.intentionalAbort(u)) return route.abort('connectionfailed');
    if (ctx.delayNextGeocoderMs && /api\.mapbox\.com\/geocoding/.test(u)) { const d = ctx.delayNextGeocoderMs; ctx.delayNextGeocoderMs = 0; await new Promise(r => setTimeout(r, d)); }
    if (LIVE) return route.continue();
    const key = cacheKey(u);
    const hit = cache[key];
    if (hit) return route.fulfill({ status: hit.status, headers: { 'content-type': hit.contentType, 'access-control-allow-origin': '*' }, body: hit.body });
    const resp = await route.fetch();
    const body = await resp.text();
    cache[key] = { status: resp.status(), contentType: resp.headers()['content-type'] || 'application/json', body };
    cacheDirty = true; ctx.recorded = (ctx.recorded || 0) + 1;
    return route.fulfill({ response: resp, body });
  });
  return ctx;
}

const readDraft = page => page.evaluate(key => {
  const raw = JSON.parse(localStorage.getItem(key) || '{}');
  const d = raw.data || raw.draft || raw;
  return {
    activeZoneId: d.activeZoneId || null,
    zones: (d.campaignZones || []).map(z => ({
      id: z.id, mode: z.searchMode || null, radiusKm: z.radiusKm ?? null, nilManualMode: Boolean(z.nilManualMode),
      sp: z.selectedSearchPoint ? { label: z.selectedSearchPoint.label, lat: Number(z.selectedSearchPoint.lat), lng: Number(z.selectedSearchPoint.lng), type: z.selectedSearchPoint.type, verification: z.selectedSearchPoint.verification || null, needsMapConfirmation: Boolean(z.selectedSearchPoint.needsMapConfirmation), nil: z.selectedSearchPoint.nil ? String(z.selectedSearchPoint.nil.name || z.selectedSearchPoint.nil.nome || z.selectedSearchPoint.nil.label || JSON.stringify(z.selectedSearchPoint.nil)) : null } : null,
      families: z.kpiSnapshot?.families ?? null, qty: z.assigned_flyers ?? null, ready: Boolean(z.readyForQuote),
    })),
  };
}, DRAFT_KEY);
const activeZone = d => d.zones.find(z => z.id === d.activeZoneId) || null;
const searchInput = page => page.locator('input[placeholder*="Cerca"]:visible').first();
const pvButton = (page, n) => page.getByRole('button', { name: new RegExp(`Punto vendita ${n}(?!\\d)`) }).first();

async function waitFor(fn, { timeout = 30000, step = 400, label = 'condizione' } = {}) {
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < timeout) { last = await fn(); if (last && last.ok) return last; await new Promise(r => setTimeout(r, step)); }
  throw new Error(`Timeout in attesa di: ${label} -> ${JSON.stringify(last && last.value !== undefined ? last.value : last).slice(0, 600)}`);
}

// Il PV attivo e' "assestato" quando la bozza salvata e la UI mostrano le stesse
// famiglie, senza ricalcolo in corso, per 3 letture consecutive (evita di leggere
// uno snapshot del raggio precedente durante il ricalcolo).
async function settledZone(page, predicate, label, timeout = 150000) {
  let prev = null, same = 0;
  return (await waitFor(async () => {
    const z = activeZone(await readDraft(page));
    const busy = await page.getByText(/Ricalcolo copertura|Calcolo in corso/).filter({ visible: true }).count();
    const ui = await page.evaluate(() => { const m = document.body.innerText.match(/Famiglie stimate\s*([\d.]+)/); return m ? Number(m[1].replace(/\./g, '')) : null; });
    // analysis-istat puo' rispondere 200 senza dati (lentezza del database): la UI
    // mostra "Dato non disponibile" + "Riprova" (mai uno zero). Si usa il percorso
    // previsto per l'utente e l'episodio viene conteggiato nel report.
    const retry = page.getByRole('button', { name: /^Riprova$/ }).filter({ visible: true }).first();
    if (!busy && await retry.count() && await page.getByText(/I dati territoriali non sono disponibili/).filter({ visible: true }).count()) {
      if (currentMonitor) currentMonitor.analysisRetries = (currentMonitor.analysisRetries || 0) + 1;
      assert.ok(!currentMonitor || currentMonitor.analysisRetries <= 12, 'analysis-istat non disponibile dopo ripetuti tentativi');
      assert.notEqual(ui, 0, 'mai zero famiglie mostrato come dato');
      await retry.click({ timeout: 5000 }).catch(() => retry.dispatchEvent('click').catch(() => {})); same = 0; prev = null;
      return { ok: false, value: { retry: true } };
    }
    const okNow = Boolean(z && predicate(z) && Number(z.families) > 0 && !busy && ui === Number(z.families));
    const sig = okNow ? JSON.stringify([z.families, z.radiusKm, z.sp && z.sp.lat]) : null;
    same = okNow && sig === prev ? same + 1 : okNow ? 1 : 0; prev = sig;
    return { ok: same >= 3, value: okNow ? z : { draft: z, ui, busy } };
  }, { timeout, step: 700, label })).value;
}

async function typeAddress(page, text) {
  const inp = searchInput(page);
  await inp.scrollIntoViewIfNeeded();
  await inp.click();
  await inp.fill('');
  await inp.fill(text);
}

// Seleziona il suggerimento dell'indirizzo: civico verificato (stradario) oppure
// candidato del provider (posizione indicativa). Restituisce il tipo scelto.
async function pickAddress(page, text, streetRe) {
  await typeAddress(page, text);
  const verified = page.locator('div', { hasText: /civico verificato · stradario Comune di Milano/ }).filter({ hasText: streetRe }).last();
  const candidate = page.getByTestId('step2-provider-candidate').filter({ hasText: streetRe }).first();
  const kind = await waitFor(async () => {
    if (await candidate.count() && await candidate.isVisible()) return { ok: true, value: 'candidate' };
    if (await verified.count() && await verified.isVisible()) return { ok: true, value: 'verified' };
    return { ok: false, value: await page.evaluate(() => document.body.innerText.slice(0, 300)) };
  }, { timeout: 20000, label: `suggerimento per ${text}` });
  if (kind.value === 'candidate') {
    assert.match(await candidate.innerText(), /Posizione indicativa da (Mapbox|OpenStreetMap), civico non verificato dal Comune/);
    await candidate.locator('[role="button"]').first().click();
  } else {
    await verified.click();
  }
  return kind.value;
}

async function chooseRadius(page, km) {
  const around = page.getByRole('button', { name: /Distribuisci intorno a un punto/ }).first();
  await waitFor(async () => ({ ok: (await around.count()) > 0 && await around.isVisible() }), { timeout: 30000, label: 'scelta modalità dopo l\'indirizzo' });
  if ((await around.getAttribute('aria-pressed')) !== 'true') await around.click();
  const label = km < 1 ? `${km * 1000} m` : `${km} km`;
  await waitFor(async () => ({ ok: (await page.getByRole('button', { name: label, exact: true }).count()) > 0 }), { label: `preset ${label}` });
  const btn = page.getByRole('button', { name: label, exact: true }).first();
  await waitFor(async () => ({ ok: await btn.isEnabled() }), { label: `preset ${label} abilitato` });
  await btn.click();
  return settledZone(page, z => Number(z.radiusKm) === km && (z.mode === 'radius' || z.mode === 'address'), `KPI raggio ${label}`);
}

// Copertura parziale: l'utente sceglie "Adatta a N" (gate di produzione invariato).
// Il PV e' completo quando la bozza lo segna readyForQuote con quantita' > 0.
async function confirmQuantity(page) {
  const adapt = page.getByRole('button', { name: /^Adatta a / }).filter({ visible: true }).first();
  if (await adapt.count()) await adapt.click();
  return (await waitFor(async () => { const z = activeZone(await readDraft(page)); return { ok: Boolean(z && z.ready && Number(z.qty) > 0), value: z }; }, { timeout: 30000, label: 'PV pronto per il preventivo' })).value;
}

async function addPv(page) {
  const before = (await readDraft(page)).zones.length;
  const add = page.getByRole('button', { name: /Aggiungi punto vendita/ }).first();
  await add.scrollIntoViewIfNeeded(); await add.click();
  const d = await waitFor(async () => { const x = await readDraft(page); return { ok: x.zones.length === before + 1, value: x }; }, { label: 'nuovo PV' });
  const z = activeZone(d.value);
  assert.equal(z.sp, null, 'il nuovo PV non eredita il punto');
  assert.equal(await searchInput(page).inputValue(), '', 'il nuovo PV parte con la ricerca vuota');
  return z.id;
}

async function switchPv(page, n, expectId) {
  const b = pvButton(page, n); await b.scrollIntoViewIfNeeded(); await b.click();
  await waitFor(async () => { const d = await readDraft(page); return { ok: d.activeZoneId === expectId, value: d.activeZoneId }; }, { label: `PV${n} attivo` });
}

async function runViewport(browser, baseUrl, viewport) {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: SAMSUNG_UA });
  const page = await context.newPage();
  currentPage = page;
  page.on('dialog', dlg => dlg.accept());
  const ctx = await installRoutes(page);
  const m = monitor(page, ctx);
  const results = { viewport: tag, pv: {} };

  await page.goto(`${baseUrl}/configuratore?qty=10000&printed=true&format=A5&urgency=normal&step=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('radio', { name: /Door to Door/ }).first().click();
  await page.getByRole('button', { name: /^Retail$/ }).first().click();
  await page.getByRole('button', { name: /Continua allo Step 2/ }).first().click();
  await searchInput(page).waitFor({ timeout: 20000 });

  // PV1: civico ufficiale, NIL Bruzzano, raggi 1/2/3 km.
  const pv1Kind = await pickAddress(page, 'Via Antonio Oroboni 10, Milano', /Oroboni 10/);
  assert.equal(pv1Kind, 'verified', 'Via Antonio Oroboni 10 e\' nello stradario ufficiale');
  await page.getByTestId('milano-address-context').waitFor({ timeout: 20000 });
  await waitFor(async () => { const z = activeZone(await readDraft(page)); const txt = await page.getByTestId('milano-address-context').innerText(); return { ok: /bruzzano/i.test(`${z && z.sp && z.sp.nil} ${txt}`), value: { nil: z && z.sp && z.sp.nil, txt } }; }, { label: 'NIL Bruzzano per Oroboni 10' });
  const r1 = await chooseRadius(page, 1); const r2 = await chooseRadius(page, 2); const r3 = await chooseRadius(page, 3);
  assert.ok(r1.families < r2.families && r2.families < r3.families, `famiglie crescenti con il raggio: ${r1.families} < ${r2.families} < ${r3.families}`);
  assert.equal(r3.sp.verification, 'official_registry');
  const pv1 = await confirmQuantity(page); results.pv[1] = { address: r3.sp.label, state: 'OFFICIAL_VERIFIED', families: { 1: r1.families, 2: r2.families, 3: r3.families } };
  log(tag, 'PV1', JSON.stringify(results.pv[1]));

  // PV2: Viale Certosa 333 (non nel dataset del Comune) -> candidato del provider.
  const pv2Id = await addPv(page);
  assert.equal(await page.getByText(/Oroboni/).filter({ visible: true }).count() <= 2, true, 'nessun suggerimento di PV1 nel PV2');
  const pv2Kind = await pickAddress(page, 'Viale Certosa 333, Milano', /Viale Certosa,? 333/);
  if (LIVE || pv2Kind !== 'candidate') log(tag, 'PV2 kind', pv2Kind);
  assert.equal(pv2Kind, 'candidate', 'Viale Certosa 333: candidato Mapbox selezionabile');
  await page.getByTestId('milano-point-needs-check').waitFor({ timeout: 20000 });
  assert.match(await page.getByTestId('milano-point-needs-check').innerText(), /Posizione indicativa/);
  let pv2 = await chooseRadius(page, 2);
  assert.equal(pv2.sp.verification, 'provider_civic'); assert.equal(pv2.sp.needsMapConfirmation, true);
  assert.notEqual(pv2.sp.lat, pv1.sp.lat);
  results.pv[2] = { address: pv2.sp.label, state: 'PROVIDER_CANDIDATE', families: pv2.families };

  // PV2: correzione del punto sulla mappa -> MANUAL_CONFIRMED, indirizzo conservato.
  await page.getByTestId('milano-correct-point').click();
  const map = page.locator('.leaflet-container').first();
  await map.waitFor(); await page.waitForTimeout(1200);
  const box = await map.boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.62);
  pv2 = await settledZone(page, z => z.sp && z.sp.type === 'manual_point', 'punto manuale PV2');
  assert.match(pv2.sp.label, /Viale Certosa,? 333/, 'il punto manuale conserva l\'indirizzo cercato');
  assert.equal(pv2.sp.verification, 'manual');
  pv2 = await confirmQuantity(page);
  results.pv[2].manual = { lat: pv2.sp.lat, lng: pv2.sp.lng, families: pv2.families, qty: pv2.qty, state: 'MANUAL_CONFIRMED' };

  // PV1 -> PV2 -> PV1: ogni PV ritrova i propri dati.
  await switchPv(page, 1, pv1.id);
  let back = await settledZone(page, z => z.id === pv1.id, 'PV1 ripristinato');
  assert.equal(back.sp.label, pv1.sp.label); assert.equal(back.radiusKm, 3); assert.equal(back.families, pv1.families, 'famiglie PV1 identiche dopo il ritorno');
  await switchPv(page, 2, pv2Id);
  back = await settledZone(page, z => z.id === pv2Id, 'PV2 ripristinato');
  assert.equal(back.sp.type, 'manual_point'); assert.equal(back.sp.lat, pv2.sp.lat);

  // PV3..PV10: civici reali (verificati o candidati), raggi 1/2/3 km, un PV su NIL.
  const plan = [
    ['Viale Certosa 330, Milano', /Viale Certosa,? 330/, 1],
    ['Viale Certosa 316, Milano', /Viale Certosa,? 316/, 2],
    ['Piazza del Duomo 21, Milano', /Duomo,? 21/, 'nil'],
    ['Corso Buenos Aires 1, Milano', /Buenos Aires,? 1\b/, 3],
    ['Via Torino 1, Milano', /Torino,? 1\b/, 1],
    ['Corso Venezia 1, Milano', /Venezia,? 1\b/, 2],
    ['Via Dante 1, Milano', /Dante,? 1\b/, 3],
    ['Viale Monza 1, Milano', /Monza,? 1\b/, 1],
  ];
  const ids = { 1: pv1.id, 2: pv2Id };
  for (let i = 0; i < plan.length; i++) {
    const n = i + 3; const [text, re, cov] = plan[i];
    ids[n] = await addPv(page);
    const kind = await pickAddress(page, text, re);
    let z;
    if (cov === 'nil') {
      await page.getByRole('button', { name: /Scegli uno o più quartieri/ }).first().click();
      const nilInput = page.locator('input[placeholder^="Cerca quartiere di Milano"]').filter({ visible: true }).first();
      await nilInput.waitFor({ timeout: 20000 }); await nilInput.click(); await nilInput.fill('Bruzzano');
      const nilAdd = page.getByRole('option', { name: /BRUZZANO/i }).first().locator('button[data-nil-toggle="add"]');
      await nilAdd.waitFor({ timeout: 90000 }); await nilAdd.click();
      z = await settledZone(page, x => x.nilManualMode, 'NIL Bruzzano');
    } else {
      z = await chooseRadius(page, cov);
    }
    z = await confirmQuantity(page);
    if (text.startsWith('Viale Certosa 316')) assert.equal(kind, 'verified', 'Viale Certosa 316 e\' nello stradario');
    if (text.startsWith('Viale Certosa 330')) assert.equal(z.sp.verification, 'provider_civic', '330 non e\' mai un civico verificato');
    results.pv[n] = { address: z.sp && z.sp.label, state: kind === 'verified' ? 'OFFICIAL_VERIFIED' : 'PROVIDER_CANDIDATE', coverage: cov, families: z.families };
    log(tag, `PV${n}`, JSON.stringify(results.pv[n]));
  }
  let snap = await readDraft(page);
  assert.equal(snap.zones.length, 10, '10 punti vendita');
  for (const z of snap.zones) assert.ok(z.ready && Number(z.qty) > 0 && Number(z.families) > 0, `PV ${z.id} pronto: ${JSON.stringify(z)}`);
  const byId = Object.fromEntries(snap.zones.map(z => [z.id, z]));

  // Cambio rapido tra PV senza attese: nessun PV prende dati di un altro.
  for (const n of [1, 5, 2, 9, 3, 10, 4, 1, 7, 2]) await pvButton(page, n).click();
  await switchPv(page, 6, ids[6]);
  await page.waitForTimeout(6000);
  snap = await readDraft(page);
  for (const z of snap.zones) {
    assert.deepEqual(z.sp, byId[z.id].sp, `punto invariato dopo cambio rapido (${z.id})`);
    assert.equal(z.radiusKm, byId[z.id].radiusKm, `raggio invariato (${z.id})`);
    assert.ok(Number(z.families) > 0, `nessun falso zero (${z.id}: ${z.families})`);
    assert.equal(z.families, byId[z.id].families, `famiglie invariate (${z.id})`);
    assert.equal(z.qty, byId[z.id].qty, `quantita' invariata (${z.id})`);
  }

  // Risposta tardiva del geocoder: ricerca avviata in PV10, utente passa a PV9.
  await switchPv(page, 10, ids[10]);
  ctx.delayNextGeocoderMs = 5000;
  await typeAddress(page, 'Viale Certosa 280, Milano');
  await switchPv(page, 9, ids[9]);
  await page.waitForTimeout(8000);
  snap = await readDraft(page);
  assert.deepEqual(snap.zones.find(z => z.id === ids[9]).sp, byId[ids[9]].sp, 'PV9 non riceve la risposta tardiva');
  assert.deepEqual(snap.zones.find(z => z.id === ids[10]).sp, byId[ids[10]].sp, 'PV10 non cambia senza selezione');
  assert.equal(await page.getByText(/Viale Certosa,? 280/).filter({ visible: true }).count(), 0, 'nessun suggerimento di PV10 in PV9');

  // Eliminazione di un PV: gli altri restano intatti.
  await switchPv(page, 4, ids[4]);
  await page.getByRole('button', { name: /Elimina punto vendita/ }).first().click();
  const afterDel = (await waitFor(async () => { const x = await readDraft(page); return { ok: x.zones.length === 9, value: x }; }, { label: 'PV eliminato' })).value;
  assert.ok(!afterDel.zones.some(z => z.id === ids[4]));
  for (const z of afterDel.zones) assert.deepEqual(z.sp, byId[z.id].sp, `PV ${z.id} intatto dopo l'eliminazione`);

  // Ripristino della bozza (ricarica pagina).
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const restored = await readDraft(page);
  assert.equal(restored.zones.length, 9);
  for (const z of restored.zones) assert.deepEqual(z.sp, byId[z.id].sp, `PV ${z.id} ripristinato`);

  await page.screenshot({ path: path.join(OUT, `step2-multi-pv-${tag}.png`) });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'nessuno scorrimento orizzontale');
  await context.close();
  return { ...results, monitor: m, recorded: ctx.recorded || 0 };
}

async function runProviderOutages(browser, baseUrl) {
  const out = {};
  for (const mode of ['geocoderDown', 'registryDown']) {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, userAgent: SAMSUNG_UA });
    const page = await context.newPage();
    currentPage = page;
    const ctx = await installRoutes(page, { [mode]: true });
    const m = monitor(page, ctx);
    await page.goto(`${baseUrl}/configuratore?qty=10000&printed=true&format=A5&urgency=normal&step=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('radio', { name: /Door to Door/ }).first().click();
    await page.getByRole('button', { name: /^Retail$/ }).first().click();
    await page.getByRole('button', { name: /Continua allo Step 2/ }).first().click();
    await searchInput(page).waitFor({ timeout: 20000 });
    if (mode === 'geocoderDown') {
      // Senza Mapbox/Nominatim lo stradario del Comune verifica comunque il civico.
      assert.equal(await pickAddress(page, 'Via Antonio Oroboni 10, Milano', /Oroboni 10/), 'verified');
      const z = await chooseRadius(page, 2);
      assert.equal(z.sp.verification, 'official_registry');
      // Per un civico non nel dataset non c'e' candidato: messaggio e scelta sulla mappa.
      await addPv(page);
      await typeAddress(page, 'Viale Certosa 333, Milano');
      await page.getByText(/numero civico non verificato nel dataset del Comune di Milano/).first().waitFor({ timeout: 20000 });
      assert.equal(await page.getByTestId('step2-provider-candidate').count(), 0);
      assert.ok(await page.getByRole('button', { name: /punto manuale sulla mappa/i }).count() > 0);
      out[mode] = { oroboni: z.families, certosa333: 'messaggio + scelta manuale' };
    } else {
      // Stradario irraggiungibile: valgono le regole dei geocoder, mai "verificato".
      await typeAddress(page, 'Via Antonio Oroboni 10, Milano');
      const row = page.locator('div[style*="cursor: pointer"]', { hasText: /Oroboni 10/ }).filter({ visible: true }).first();
      await row.waitFor({ timeout: 20000 });
      assert.doesNotMatch(await row.innerText(), /civico verificato/);
      await row.click();
      const z = await chooseRadius(page, 2);
      assert.notEqual(z.sp.verification, 'official_registry');
      out[mode] = { oroboni: z.families, verification: z.sp.verification };
    }
    out[mode].monitor = m;
    await context.close();
  }
  return out;
}

(async () => {
  const server = await startServerIfNeeded();
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' });
  const report = { live: LIVE, baseUrl: server.url, startedAt: new Date().toISOString(), viewports: [], outages: null };
  try {
    const only = process.env.STEP2_E2E_ONLY || '';
    for (const vp of only === 'outages' ? [] : [{ width: 360, height: 800 }, { width: 412, height: 915 }]) {
      const r = await runViewport(browser, server.url, vp);
      report.viewports.push(r);
      log(`${r.viewport}: errori JS ${r.monitor.pageErrors.length}, canvas noti ${r.monitor.knownCanvas}, HTTP>=400 ${r.monitor.http.length}, richieste fallite ${r.monitor.failed.length}, registrate ${r.recorded}`);
    }
    report.outages = only === 'viewports' ? { } : await runProviderOutages(browser, server.url);
    for (const r of [...report.viewports.map(v => v.monitor), ...Object.values(report.outages).map(o => o.monitor)]) {
      assert.deepEqual(r.pageErrors, [], `errori JS: ${r.pageErrors.join(' | ')}`);
      assert.deepEqual(r.http.filter(h => !/^4\d\d .*dati\.comune/.test(h)), [], `HTTP >= 400: ${r.http.join(' | ')}`);
    }
    report.result = 'PASS';
    console.log(`PASS Step 2 multi-PV Samsung (${LIVE ? 'LIVE' : 'cache deterministica'}): ${report.viewports.length ? '360x800 e 412x915, 10 PV, raggi 1/2/3 km, NIL Bruzzano, candidato provider, punto manuale, cambio rapido, risposta tardiva, eliminazione, ripristino' : ''}${Object.keys(report.outages).length ? '; geocoder e stradario non disponibili' : ''}`);
  } catch (e) {
    report.result = 'FAIL'; report.error = String(e && e.stack || e);
    if (currentPage && !currentPage.isClosed()) {
      try { await currentPage.screenshot({ path: path.join(OUT, 'failure.png') }); report.failureText = (await currentPage.evaluate(() => document.body.innerText)).slice(0, 4000); report.failureDraft = await readDraft(currentPage); report.failureAnalysis = currentMonitor && currentMonitor.analysis.slice(-12); } catch {}
    }
    throw e;
  } finally {
    fs.writeFileSync(path.join(OUT, `step2-multi-pv-report${LIVE ? '-live' : ''}.json`), JSON.stringify(report, null, 2));
    if (cacheDirty) fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    await browser.close(); await server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
