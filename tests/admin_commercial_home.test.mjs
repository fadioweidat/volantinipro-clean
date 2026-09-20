import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import TR from 'react-test-renderer';
import { createServer } from 'vite';
import { sanitizeMetadata } from '../src/lib/analytics/eventSchema.js';
import {
  buildCommercialSnapshot,
  buildConsultationWhatsAppMessage,
  customerAccessForCampaign,
  isQuickQuoteCampaign,
  quoteLeadState,
} from '../src/lib/admin/adminCommercialModel.js';

const dashboard = readFileSync(new URL('../src/pages/admin/AdminDashboard.jsx', import.meta.url), 'utf8');
// I lead "Preventivi rapidi" e il blocco Traffico sono stati spostati dalla
// Home a una pagina dedicata /admin/commercial: le asserzioni sui draft
// WhatsApp/email e sulle note "non configurato" ora leggono CommercialCenter.jsx.
const commercialCenter = readFileSync(new URL('../src/pages/admin/CommercialCenter.jsx', import.meta.url), 'utf8');
const consultant = readFileSync(new URL('../src/pages/public/ConsultantPage.jsx', import.meta.url), 'utf8');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flat = (j) => (Array.isArray(j) ? j.map(flat).join(' ') : j == null ? '' : typeof j === 'string' ? j : flat(j.children));

// Render reale di CommercialCenter con admin-api e supabaseClient sostituiti da stub in memoria:
// nessun accesso alla rete ne' a Supabase (nemmeno con un .env presente). fetch e' inoltre
// intercettato e il test fallisce se viene chiamato.
async function renderCommercialCenter({ traffic, consult }) {
  const stubApi = 'export async function getRealCampaigns(){return {allRows:[],availability:{campaigns:true}}}\n'
    + 'export async function getSiteTraffic(){return globalThis.__vpTraffic}\n'
    + 'export async function getConsultationRequests(){return globalThis.__vpConsult}\n';
  const stubClient = 'export const supabase = null; export const ensureSupabaseSessionBridge = async () => {};\n';
  const vite = await createServer({
    server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent',
    plugins: [{
      name: 'stub-admin-api', enforce: 'pre',
      resolveId(source) {
        if (/lib\/services\/admin-api\.js$/.test(source)) return '\0stub-admin-api';
        if (/(^|\/)supabaseClient\.js$/.test(source)) return '\0stub-supabase-client';
        return null;
      },
      load(id) {
        if (id === '\0stub-admin-api') return stubApi;
        if (id === '\0stub-supabase-client') return stubClient;
        return null;
      },
    }],
  });
  const previousFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (...args) => { fetchCalls.push(String(args[0])); throw new Error('rete non consentita nel test'); };
  try {
    globalThis.__vpTraffic = traffic;
    globalThis.__vpConsult = consult;
    const { CommercialCenter } = await vite.ssrLoadModule('/src/pages/admin/CommercialCenter.jsx');
    let renderer;
    await TR.act(async () => { renderer = TR.create(React.createElement(CommercialCenter, { onNav() {} })); });
    const result = { text: flat(renderer.toJSON()), hrefs: renderer.root.findAll((n) => n.type === 'a').map((n) => n.props.href) };
    assert.deepEqual(fetchCalls, [], 'nessuna chiamata di rete');
    return result;
  } finally {
    globalThis.fetch = previousFetch;
    delete globalThis.__vpTraffic;
    delete globalThis.__vpConsult;
    await vite.close();
  }
}

const quote = (overrides = {}) => ({
  id: 'quote-1', quality: 'real', source: 'campaigns', leadSource: 'quote_requests',
  client: 'Mario Rossi', zone: 'Seveso', qty: 10000, rawStatus: 'pending_review',
  createdAt: '2026-08-13T09:00:00.000Z', phone: '+393331112222', email: 'mario@example.invalid',
  createdBy: 'customer-1', ops: { sessionCount: 0, completedSessions: 0, approvedPhotos: 0 },
  ...overrides,
});

test('quick quote usa la campagna materializzata e non richiede un secondo archivio lead', () => {
  assert.equal(isQuickQuoteCampaign(quote()), true);
  assert.equal(isQuickQuoteCampaign(quote({ leadSource: 'configurator' })), false);
});

test('lead status deriva solo da stati o timestamp espliciti', () => {
  assert.equal(quoteLeadState(quote()).key, 'new');
  assert.equal(quoteLeadState(quote({ rawStatus: 'viewed' })).key, 'viewed');
  assert.equal(quoteLeadState(quote({ rawStatus: 'pending_review', contactedAt: '2026-08-13T10:00:00Z' })).key, 'contacted');
  assert.equal(quoteLeadState(quote({ rawStatus: 'active' })).key, 'converted');
  assert.equal(quoteLeadState(quote({ rawStatus: 'mystery' })).key, 'unavailable');
});

test('commercial snapshot conta zero reale e separa nuovi, da contattare, convertiti e chiusi', () => {
  const snapshot = buildCommercialSnapshot({
    today: '2026-08-13',
    campaigns: [
      quote(),
      quote({ id: 'quote-2', rawStatus: 'active', createdAt: '2026-08-12T09:00:00Z' }),
      quote({ id: 'quote-3', rawStatus: 'closed', createdAt: '2026-08-11T09:00:00Z' }),
      quote({ id: 'test', quality: 'test' }),
    ],
  });
  assert.deepEqual(snapshot.metrics, { newToday: 1, toContact: 1, converted: 1, closed: 1 });
  assert.equal(snapshot.quotes.length, 3);
});

test('accessi cliente seguono ownership, sessioni concluse e foto approvate reali', () => {
  const unavailable = customerAccessForCampaign(quote({ createdBy: '', ops: {} }));
  assert.equal(unavailable.customerArea.available, false);
  assert.equal(unavailable.tracking.available, false);
  assert.equal(unavailable.report.available, false);
  assert.equal(unavailable.photos.count, 0);

  const available = customerAccessForCampaign(quote({ ops: { sessionCount: 2, completedSessions: 1, approvedPhotos: 3 } }));
  assert.equal(available.customerArea.available, true);
  assert.equal(available.tracking.available, true);
  assert.equal(available.report.available, true);
  assert.equal(available.photos.count, 3);
});

test('WhatsApp consulenza usa nome e zona forniti senza dichiarare invio', () => {
  const message = buildConsultationWhatsAppMessage({ name: 'Mario', zone: 'Seveso' });
  assert.match(message, /Buongiorno Mario/);
  assert.match(message, /Seveso/);
  assert.doesNotMatch(message, /inviat[ao]/i);
});

test('CommercialCenter (runtime): consulenze e traffico non disponibili -> stati espliciti, nessun dato inventato, nessun draft', async () => {
  const { text, hrefs } = await renderCommercialCenter({ traffic: { available: false, rows: [] }, consult: { available: false, rows: [] } });
  assert.match(text, /Tabella non disponibile/);
  assert.match(text, /La tabella consultation_requests non è raggiungibile/);
  assert.match(text, /Analytics non configurata/);
  assert.match(text, /Dati non disponibili/);
  assert.match(text, /Nessun evento registrato ancora/);
  assert.doesNotMatch(text, /Fonte: consultation_requests|Fonte: site_events/);
  assert.equal(hrefs.filter((h) => /^(mailto:|https:\/\/wa\.me\/)/.test(h)).length, 0);
});

test('CommercialCenter (runtime): consulenze reali da consultation_requests con draft WhatsApp/email; traffico da site_events anonimo', async () => {
  const now = new Date().toISOString();
  const { text, hrefs } = await renderCommercialCenter({
    traffic: { available: true, rows: [{ event_name: 'page_view', created_at: now, anonymous_session_id: 'anon-1' }] },
    consult: { available: true, rows: [{ id: 1, nome: 'Mario', comune: 'Seveso', servizio: 'd2d', quantita: 1000, telefono: '+39 333 1112222', email: 'mario@example.invalid', timing: 'asap', status: 'new', created_at: now }] },
  });
  assert.match(text, /1 richieste/);
  assert.match(text, /Fonte: consultation_requests/);
  assert.match(text, /Mario/);
  assert.match(text, /Seveso/);
  assert.match(text, /Event store privacy-safe \(site_events\)/);
  assert.match(text, /Fonte: site_events/);
  assert.match(text, /aggregati da eventi anonimi/);
  assert.match(text, /Visitatori oggi/);
  assert.ok(hrefs.some((h) => h.startsWith('https://wa.me/+393331112222?text=')), 'draft WhatsApp');
  assert.ok(hrefs.some((h) => h.startsWith('mailto:mario@example.invalid?')), 'draft email');
  assert.doesNotMatch(text, /Segna contattato/);
});

test('sorgenti: CommercialCenter usa getConsultationRequests/getSiteTraffic reali; nessuna tabella analytics legacy ne "Segna contattato"; ConsultantPage senza chiamate dirette', () => {
  assert.match(commercialCenter, /getConsultationRequests\(\{ limit: 20 \}\)/);
  assert.match(commercialCenter, /getSiteTraffic\(\)/);
  assert.match(commercialCenter, /computeSiteTrafficSummary\(traffic\.rows\)/);
  assert.match(commercialCenter, /mailto:/);
  assert.match(commercialCenter, /wa\.me/);
  assert.doesNotMatch(commercialCenter, /analytics_events|Segna contattato/);
  assert.doesNotMatch(dashboard, /analytics_events|page_view|session_start|Segna contattato/);
  assert.doesNotMatch(consultant, /supabase\.from|functions\.invoke|fetch\(/);
  assert.match(consultant, /sendConsultationRequest\(/);
});

test('analytics non riceve PII: sanitizeMetadata scarta chiavi/valori PII; trackConsultationRequested invia solo un payload anonimo', async () => {
  assert.deepEqual(sanitizeMetadata({ email: 'a@b.it', telefono: '3331112222', latitude: 45.1, municipality: 'Seveso', service: 'a@b.it' }), { municipality: 'Seveso' });

  const prev = {
    window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch,
    url: process.env.VITE_SUPABASE_URL, key: process.env.VITE_SUPABASE_ANON_KEY,
  };
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const requests = [];
  process.env.VITE_SUPABASE_URL = 'https://example.invalid';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon';
  globalThis.window = { localStorage: store(), sessionStorage: store(), location: { origin: 'https://vp.test', pathname: '/consulente', search: '', hostname: 'vp.test' } };
  globalThis.document = { referrer: '' };
  globalThis.fetch = async (url, options) => { requests.push({ url: String(url), body: JSON.parse(options.body) }); return { ok: true }; };
  try {
    const { trackConsultationRequested } = await import('../src/lib/analytics/siteEvents.js');
    trackConsultationRequested();
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /^https:\/\/vp\.test\/api\/track$/, 'solo il tracker anonimo, mai un host reale');
    const payload = requests[0].body;
    assert.equal(payload.event_name, 'consultation_requested');
    assert.deepEqual(payload.metadata, {});
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /"(email|telefono|phone|nome|name|latitude|longitude|lat|lng|ip)"/i);
    assert.doesNotMatch(serialized, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  } finally {
    for (const [key, value] of Object.entries({ window: prev.window, document: prev.document, fetch: prev.fetch })) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    if (prev.url === undefined) delete process.env.VITE_SUPABASE_URL; else process.env.VITE_SUPABASE_URL = prev.url;
    if (prev.key === undefined) delete process.env.VITE_SUPABASE_ANON_KEY; else process.env.VITE_SUPABASE_ANON_KEY = prev.key;
  }
});
