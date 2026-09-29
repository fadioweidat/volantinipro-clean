import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const campaignId = '20000000-0000-0000-0000-000000000001';
const assignmentId = '30000000-0000-0000-0000-000000000001';
const sessionId = '40000000-0000-0000-0000-000000000001';
const today = new Date();
const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8).toISOString();
const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18).toISOString();
const jwtPayload = Buffer.from(JSON.stringify({ email: 'fenice.sp@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const accessToken = `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${jwtPayload}.fixture`;

const campaign = {
  id: campaignId, title: 'Campagna runtime', client_name: 'Cliente runtime', city_name: 'Milano',
  quantity: 1000, status: 'active', service_type: 'd2d', created_at: dayStart,
  metadata: { payment_status: 'pagato' },
};
const assignment = {
  id: assignmentId, campaign_id: campaignId, group_id: 'group-1', operator_id: 'operator-1', status: 'active',
  starts_at: dayStart, ends_at: dayEnd, access_token: 'fixture', revoked_at: null, created_at: dayStart,
  operator_profiles: { user_id: 'operator-1', display_name: 'Operatore runtime' },
  operational_groups: { name: 'Gruppo runtime' }, campaigns: { title: 'Campagna runtime' }, operator_assignment_zones: [],
};
const session = {
  id: sessionId, assignment_id: assignmentId, campaign_id: campaignId, group_id: 'group-1', driver_id: 'operator-1',
  status: 'started', started_at: dayStart, created_at: dayStart, updated_at: dayStart,
};

const executablePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(candidate => candidate && existsSync(candidate));
assert.ok(executablePath, 'Chrome/Edge non disponibile per il test browser');

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((sessionValue) => {
    localStorage.setItem('vp_supabase_session', JSON.stringify(sessionValue));
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, delay >= 30_000 ? 250 : delay, ...args);
  }, { accessToken, refreshToken: 'fixture', expiresAt: String(Date.now() + 3600_000) });

  let telemetryCalls = 0;
  let activeTelemetry = 0;
  let maxActiveTelemetry = 0;
  const requestedTables = [];
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (!request.url().includes('supabase.co')) return request.continue();
    if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: cors() });
    const path = new URL(request.url()).pathname;
    const resource = path.split('/').at(-1);
    requestedTables.push(resource);
    if (path.endsWith('/auth/v1/user')) return respond(request, { id: 'admin-1', email: 'fenice.sp@gmail.com' });
    if (resource === 'jwt_is_admin') return respond(request, true);
    if (resource === 'admin_list_operators') return respond(request, [{ id: 'operator-1', display_name: 'Operatore runtime', phone: '+3900000000', status: 'active' }]);
    if (resource === 'admin_daily_report_telemetry') {
      telemetryCalls += 1;
      activeTelemetry += 1;
      maxActiveTelemetry = Math.max(maxActiveTelemetry, activeTelemetry);
      await new Promise(resolve => setTimeout(resolve, 350));
      activeTelemetry -= 1;
      if (telemetryCalls >= 2) return request.respond({ status: 500, contentType: 'application/json', headers: cors(), body: JSON.stringify({ message: 'temporary telemetry failure' }) });
      return respond(request, [{ session_id: sessionId, gps_count: 2, first_gps_at: dayStart, last_gps_at: new Date().toISOString(), photo_count: 1 }]);
    }
    const rows = resource === 'campaigns' ? [campaign]
      : resource === 'campagne' || resource === 'quote_requests' ? []
        : resource === 'delivery_sessions' ? [session]
          : resource === 'operational_groups' ? [{ id: 'group-1', campaign_id: campaignId, name: 'Gruppo runtime', created_at: dayStart }]
            : resource === 'operator_assignments' ? [assignment]
              : [];
    return respond(request, rows);
  });

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const navigationStartedAt = Date.now();
  await page.goto('http://127.0.0.1:5173/admin', { waitUntil: 'networkidle2', timeout: 30_000 });
  try {
    await page.waitForFunction(() => document.body.innerText.includes('1 gruppi programmati'), { timeout: 20_000 });
  } catch (error) {
    throw new Error(`Dashboard non pronta (${page.url()}): ${await page.evaluate(() => document.body.innerText.slice(0, 1500))}; errors=${pageErrors.join(' | ')}`, { cause: error });
  }
  const initialRenderMs = Date.now() - navigationStartedAt;
  await page.waitForFunction(() => document.body.innerText.includes('Aggiornamento parziale'), { timeout: 20_000 });
  const degradedRefreshVisibleMs = Date.now() - navigationStartedAt;
  const desktop = await page.evaluate(() => ({
    text: document.body.innerText,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
  assert.match(desktop.text, /1 gruppi programmati/);
  assert.match(desktop.text, /Gruppo runtime/);
  assert.match(desktop.text, /Ultimi dati validi mantenuti/);
  assert.equal(desktop.overflow, false);
  assert.equal(maxActiveTelemetry, 1, 'il polling operativo deve essere sequenziale');
  assert.equal(requestedTables.includes('gps_tracking_points'), false, 'la Home non deve scaricare tracce GPS complete');

  await page.setViewport({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth, text: document.body.innerText }));
  assert.equal(mobile.overflow, false);
  assert.match(mobile.text, /1 gruppi programmati/);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({
    runtime: 'PASS', desktop: '1440x900', mobile: '390x844', telemetryCalls, initialRenderMs, degradedRefreshVisibleMs,
    maxConcurrentTelemetry: maxActiveTelemetry, falseZeroPrevented: true, fullGpsReads: 0,
  }));
} finally {
  await browser.close();
}

function cors() {
  return { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
}

function respond(request, body) {
  return request.respond({ status: 200, contentType: 'application/json', headers: cors(), body: JSON.stringify(body) });
}
