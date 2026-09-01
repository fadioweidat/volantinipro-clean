// Analytics Visitatori — schema/validazione condivisa (privacy boundary).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANALYTICS_EVENT_NAMES, METADATA_ALLOWED_KEYS, isAllowedEventName,
  quantityBucket, sanitizeMetadata, validateAnalyticsEvent,
} from '../src/lib/analytics/eventSchema.js';

const V = '11111111-1111-4111-8111-111111111111';

test('allowlist: 11 eventi, i 5 storici inclusi', () => {
  assert.equal(ANALYTICS_EVENT_NAMES.length, 11);
  for (const n of ['page_view', 'session_started', 'quote_started', 'quote_completed', 'consultation_requested',
    'municipality_selected', 'quantity_selected', 'service_selected', 'extras_selected', 'quote_step_reached', 'quote_abandoned']) {
    assert.equal(isAllowedEventName(n), true);
  }
  assert.equal(isAllowedEventName('login'), false);
  assert.equal(isAllowedEventName('page_view; drop table'), false);
});

test('quantityBucket: fasce coerenti', () => {
  assert.equal(quantityBucket(3000), '<5k');
  assert.equal(quantityBucket(9999), '5-10k');
  assert.equal(quantityBucket(20000), '20-50k');
  assert.equal(quantityBucket(120000), '100k+');
  assert.equal(quantityBucket(0), null);
  assert.equal(quantityBucket('abc'), null);
});

test('sanitizeMetadata: SOLO chiavi allowlist, valori corti, extras array, step 1..6', () => {
  const out = sanitizeMetadata({
    municipality: '  Milano  ', province: 'MI', region: 'Lombardia',
    quantity_bucket: 15000, service: 'Door to Door',
    extras: ['grafica', 'consegna certificata', 'grafica'],
    step: 3,
    // chiavi NON in allowlist → scartate
    email: 'a@b.it', phone: '3331234567', ip: '1.2.3.4', foo: 'bar', session: 'x',
  });
  assert.deepEqual(Object.keys(out).sort(), ['extras', 'municipality', 'province', 'quantity_bucket', 'region', 'service', 'step'].sort());
  assert.equal(out.municipality, 'Milano');
  assert.equal(out.quantity_bucket, '10-20k');
  assert.equal(out.step, 3);
  assert.deepEqual(out.extras, ['grafica', 'consegna certificata', 'grafica']);
  assert.equal(out.email, undefined);
});

test('sanitizeMetadata: blocca valori che sembrano PII anche in chiavi ammesse', () => {
  const out = sanitizeMetadata({ municipality: 'mario@rossi.it', province: '1.2.3.4', service: 'chiama 3331234567' });
  assert.equal(out.municipality, undefined);
  assert.equal(out.province, undefined);
  assert.equal(out.service, undefined);
});

test('sanitizeMetadata: step fuori range / non intero → scartato', () => {
  assert.equal(sanitizeMetadata({ step: 9 }).step, undefined);
  assert.equal(sanitizeMetadata({ step: 2.5 }).step, undefined);
  assert.equal(sanitizeMetadata({ step: 4 }).step, 4);
});

test('validateAnalyticsEvent: evento valido → colonne piatte, metadata pulito, geo NULL senza allowGeo', () => {
  const r = validateAnalyticsEvent({
    event_name: 'municipality_selected',
    anonymous_session_id: V,
    session_id: V,
    path: '/preventivo?utm_source=google#x',
    referrer_host: 'google.com', referrer_type: 'organic',
    utm_source: 'GOOGLE', utm_medium: 'cpc',
    device_type: 'mobile', browser: 'Chrome', os: 'Android',
    geo: { country: 'IT', region: 'Lombardia', city: 'Milano' }, // ignorato: allowGeo=false
    metadata: { municipality: 'Milano', province: 'MI', email: 'x@y.it' },
  });
  assert.equal(r.ok, true);
  assert.equal(r.event.path, '/preventivo');
  assert.equal(r.event.utm_source, 'google');
  assert.equal(r.event.country, null);
  assert.equal(r.event.city, null);
  assert.equal(r.event.metadata.municipality, 'Milano');
  assert.equal(r.event.metadata.email, undefined);
});

test('validateAnalyticsEvent: geo accettata SOLO con allowGeo (percorso /api/track)', () => {
  const r = validateAnalyticsEvent({
    event_name: 'page_view', anonymous_session_id: V,
    geo: { country: 'it', region: 'Lombardia', city: 'Milano' },
  }, { allowGeo: true });
  assert.equal(r.ok, true);
  assert.equal(r.event.country, 'IT');
  assert.equal(r.event.region, 'Lombardia');
  assert.equal(r.event.city, 'Milano');
});

test('validateAnalyticsEvent: rifiuti', () => {
  assert.equal(validateAnalyticsEvent(null).ok, false);
  assert.equal(validateAnalyticsEvent({ event_name: 'nope', anonymous_session_id: V }).reason, 'event-name-not-allowed');
  assert.equal(validateAnalyticsEvent({ event_name: 'page_view', anonymous_session_id: 'not-a-uuid' }).reason, 'bad-anonymous-session-id');
  const huge = { event_name: 'page_view', anonymous_session_id: V, metadata: { municipality: 'x'.repeat(9000) } };
  assert.equal(validateAnalyticsEvent(huge).reason, 'payload-too-large');
});

test('METADATA_ALLOWED_KEYS = esattamente le 7 chiavi decise', () => {
  assert.deepEqual([...METADATA_ALLOWED_KEYS].sort(), ['extras', 'municipality', 'province', 'quantity_bucket', 'region', 'service', 'step'].sort());
});
