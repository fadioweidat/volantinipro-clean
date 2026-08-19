import assert from 'node:assert/strict';
import test from 'node:test';

import { aiField, unavailableField, isValidAiField, AI_FIELD_TYPES, AI_CONFIDENCE_LEVELS } from '../src/ai/context/fieldTypes.js';
import { buildAdminAiContext } from '../src/ai/context/buildAdminAiContext.js';
import { buildCustomerCampaignAiContext } from '../src/ai/context/buildCustomerCampaignAiContext.js';
import { buildConfiguratorAiContext } from '../src/ai/context/buildConfiguratorAiContext.js';

test('fieldTypes: un campo con value null è sempre UNAVAILABLE, mai un altro type', () => {
  const field = aiField(null, { type: AI_FIELD_TYPES.REAL, source: 'x' });
  assert.equal(field.type, AI_FIELD_TYPES.UNAVAILABLE);
  assert.equal(field.value, null);
  assert.equal(isValidAiField(field), true);
});

test('fieldTypes: unavailableField produce sempre confidence "low" e value null', () => {
  const field = unavailableField('nessuna_fonte');
  assert.equal(field.value, null);
  assert.equal(field.type, AI_FIELD_TYPES.UNAVAILABLE);
  assert.equal(field.confidence, AI_CONFIDENCE_LEVELS.LOW);
  assert.equal(isValidAiField(field), true);
});

test('fieldTypes: un campo malformato (type non valido) non è valido', () => {
  assert.equal(isValidAiField({ value: 1, type: 'INVENTATO', source: 'x', updatedAt: null, confidence: 'high' }), false);
  assert.equal(isValidAiField(null), false);
  assert.equal(isValidAiField({}), false);
});

test('buildAdminAiContext: nessun contesto Admin senza identità admin verificata', () => {
  assert.equal(buildAdminAiContext(null, { campaigns: [] }), null);
  assert.equal(buildAdminAiContext({ user: { id: 'u1' }, role: 'cliente' }, { campaigns: [] }), null);
  assert.equal(buildAdminAiContext({ user: { id: 'u1' }, role: 'fornitore' }, { campaigns: [] }), null);
  assert.equal(buildAdminAiContext({ user: {}, role: 'admin' }, { campaigns: [] }), null, 'senza user.id, anche con role admin, resta null');
});

test('buildAdminAiContext: con identità admin verificata produce conteggi campagna reali', () => {
  const campaigns = [
    { id: 'c1', client: 'Acme', service: 'd2d', zone: 'Milano', qty: 1000, status: 'active', date: '2026-01-01', endDate: '2020-01-01', total: 500, source: 'campaigns', quality: 'real', createdBy: '' },
    { id: 'c2', client: 'test', service: 'd2d', zone: 'test', qty: 10, status: 'active', date: '2026-01-01', endDate: null, total: null, source: 'campaigns', quality: 'test', createdBy: '' },
  ];
  const context = buildAdminAiContext({ user: { id: 'admin-1', email: 'a@x.it' }, role: 'admin' }, {
    campaigns, availability: { campaigns: true, photos: true }, operators: [], operatorsSummary: { liveCount: 2, warningCount: 1 },
  });
  assert.ok(context, 'contesto costruito per identità admin valida');
  assert.equal(context.scope, 'admin_operations');
  assert.equal(context.identity.subjectId, 'admin-1');
  assert.equal(context.campaigns.total.type, AI_FIELD_TYPES.REAL);
  assert.equal(context.campaigns.total.value, 1, 'la campagna "test" è esclusa dal conteggio reale');
  assert.equal(context.operators.live.value, 2);
  assert.equal(context.operators.warning.value, 1);
});

test('buildAdminAiContext: dati campagne non disponibili -> campi UNAVAILABLE, mai un conteggio inventato', () => {
  const context = buildAdminAiContext({ user: { id: 'admin-1' }, role: 'admin' }, { campaigns: [], availability: { campaigns: false } });
  assert.equal(context.campaigns.total.type, AI_FIELD_TYPES.UNAVAILABLE);
  assert.equal(context.campaigns.total.value, null);
  assert.equal(context.dataAvailability.campaigns, false);
});

const customerScope = { customerId: 'cust-1', subjectId: 'user-1' };
const customerSnapshot = {
  authUser: { id: 'user-1', email: 'cliente@example.it' },
  customer: { id: 'cust-1', email: 'cliente@example.it', nome: 'Mario' },
  campaigns: [
    { id: 'camp-1', cliente_id: 'cust-1', stato: 'in_distribuzione', servizio: 'd2d', quantita: 5000, zona: 'Cormano', totale_euro: 300, created_at: '2026-01-01' },
    { id: 'camp-2', cliente_id: 'other-customer', stato: 'confermata', servizio: 'h2h', quantita: 1000, zona: 'Bresso', totale_euro: 90, created_at: '2026-01-02' },
  ],
  loading: false, error: null,
};

test('buildCustomerCampaignAiContext: rifiuta senza scope/subject validi', () => {
  assert.equal(buildCustomerCampaignAiContext({}, customerSnapshot), null);
  assert.equal(buildCustomerCampaignAiContext({ customerId: 'cust-1' }, customerSnapshot), null);
});

test('buildCustomerCampaignAiContext: nessuna campagna di un altro cliente entra nel contesto (no cross-client)', () => {
  const context = buildCustomerCampaignAiContext(customerScope, customerSnapshot);
  assert.ok(context);
  assert.equal(context.counts.total.value, 1, 'solo la campagna del cliente autenticato è contata');
  assert.equal(context.latestCampaign.zone.value, 'Cormano');
  assert.notEqual(context.latestCampaign.zone.value, 'Bresso');
});

test('buildCustomerCampaignAiContext: scope con customerId di un altro cliente produce contesto nullo (cliente A non vede B)', () => {
  const wrongScope = { customerId: 'cust-999', subjectId: 'user-1' };
  assert.equal(buildCustomerCampaignAiContext(wrongScope, customerSnapshot), null);
});

test('buildCustomerCampaignAiContext: il prezzo è letto dal record, mai ricalcolato (stesso valore del campo totale_euro)', () => {
  const context = buildCustomerCampaignAiContext(customerScope, customerSnapshot);
  assert.equal(context.latestCampaign.totalAmount.value, 300);
  assert.equal(context.latestCampaign.totalAmount.source, 'quotePricing_engine_record');
  assert.equal(context.latestCampaign.totalAmount.type, AI_FIELD_TYPES.REAL);
});

test('buildCustomerCampaignAiContext: GPS e foto restano sempre UNAVAILABLE nel contesto Cliente (nessun dato operatore sensibile)', () => {
  const context = buildCustomerCampaignAiContext(customerScope, customerSnapshot);
  assert.equal(context.currentCampaign.latestGps.type, AI_FIELD_TYPES.UNAVAILABLE);
  assert.equal(context.currentCampaign.approvedPhotos.type, AI_FIELD_TYPES.UNAVAILABLE);
});

test('Customer AI distingue campagna corrente per rilevanza operativa e ultimo record creato', () => {
  const snapshot = {
    ...customerSnapshot,
    campaigns: [
      { id: 'paderno', cliente_id: 'cust-1', titolo: 'Paderno Dugnano', stato: 'confermata', stato_pagamento: 'pagato', quantita: 10000, zona: 'Paderno Dugnano', data_inizio: '2026-08-13', created_at: '2026-08-13T10:04:30Z', metadata: { quote_summary: {} } },
      { id: 'seveso', cliente_id: 'cust-1', titolo: 'Seveso', stato: 'confermata', stato_pagamento: null, quantita: 11261, zona: 'Seveso', data_inizio: '2026-08-29', created_at: '2026-08-10T18:13:00Z', metadata: { quote_summary: {} } },
      { id: 'como', cliente_id: 'cust-1', titolo: 'Como', stato: 'confermata', stato_pagamento: null, quantita: 26793, zona: 'Como', data_inizio: '2026-08-29', created_at: '2026-08-10T08:00:00Z', metadata: { quote_summary: {} } },
      { id: 'driver-map', cliente_id: 'cust-1', titolo: 'Zona test mappa Driver', stato: 'in_distribuzione', zona: 'Milano', created_at: '2026-04-18T20:20:52Z' },
    ],
  };
  const context = buildCustomerCampaignAiContext(customerScope, snapshot);
  assert.equal(context.currentCampaign.zone.value, 'Seveso');
  assert.equal(context.currentCampaign.quantity.value, 11261);
  assert.equal(context.currentCampaign.startDate.value, '2026-08-29');
  assert.equal(context.currentCampaign.status.value, 'confermata');
  assert.equal(context.currentCampaign.paymentStatus.value, null, 'payment_status assente resta non disponibile, mai inventato');
  assert.equal(context.latestCampaign.zone.value, 'Paderno Dugnano');
});

test('buildConfiguratorAiContext: null se non riceve uno snapshot territoriale valido', () => {
  assert.equal(buildConfiguratorAiContext(null), null);
  assert.equal(buildConfiguratorAiContext(undefined), null);
});

test('buildConfiguratorAiContext: ri-avvolge lo snapshot esistente senza inventare valori mancanti', () => {
  const snapshot = {
    schemaVersion: 1, fingerprint: 'abc', state: 'complete',
    service: { key: 'd2d', title: 'Door to Door' },
    territory: { label: 'Cormano', mode: 'municipality', radiusKm: null, selectedNames: ['Cormano'] },
    quantity: { inserted: 5000, current: 5000, recommended: 4800, shortage: null, surplus: 200 },
    metrics: { families: 3000, population: 7000, residentialCoveragePct: 96, recommendedQuantity: 4800 },
    calculation: { status: 'ready', unavailableReason: null },
    missing: [], sources: [], fieldSources: { quantity: [{ name: 'Quantità campagna', status: 'complete' }] }, limitations: [],
  };
  const context = buildConfiguratorAiContext(snapshot);
  assert.equal(context.scope, 'configurator');
  assert.equal(context.quantity.current.value, 5000);
  assert.equal(context.quantity.current.type, AI_FIELD_TYPES.REAL);
  assert.equal(context.quantity.shortage.type, AI_FIELD_TYPES.UNAVAILABLE, 'shortage null resta UNAVAILABLE, mai stimato a zero');
  assert.equal(context.metrics.residentialCoveragePct.type, AI_FIELD_TYPES.DERIVED);
});
