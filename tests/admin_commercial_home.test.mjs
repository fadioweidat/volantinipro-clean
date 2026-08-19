import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
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

test('dashboard apre solo draft WhatsApp/email e non inventa analytics o consulenze', () => {
  assert.match(commercialCenter, /Fonte non configurata: il form pubblico attuale non persiste richieste/);
  assert.match(commercialCenter, /Nessun provider analytics o event store privacy-safe è attivo/);
  assert.match(commercialCenter, /mailto:/);
  assert.match(commercialCenter, /wa\.me/);
  assert.doesNotMatch(commercialCenter, /analytics_events|page_view|session_start/);
  assert.doesNotMatch(commercialCenter, /Segna contattato/);
  assert.doesNotMatch(dashboard, /analytics_events|page_view|session_start/);
  assert.doesNotMatch(dashboard, /Segna contattato/);
  assert.doesNotMatch(consultant, /supabase\.from|functions\.invoke|fetch\(/);
});

test('analytics non riceve PII perché nessun emitter è stato introdotto', () => {
  const combined = `${dashboard}\n${commercialCenter}\n${readFileSync(new URL('../src/lib/admin/adminCommercialModel.js', import.meta.url), 'utf8')}`;
  assert.doesNotMatch(combined, /track\([^)]*(email|phone|telefono|latitude|longitude)/i);
  assert.doesNotMatch(combined, /analytics\.(capture|track|identify)/i);
});
