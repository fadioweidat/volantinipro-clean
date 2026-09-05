import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSmartPairingRequest } from '../src/lib/services/admin-api.js';

test('Smart Pairing: normalizeSmartPairingRequest with standard DB row', () => {
  const dbRow = {
    id: '11111111-2222-3333-4444-555555555555',
    created_at: '2026-09-05T14:30:00Z',
    cliente_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    nome: 'Mario Rossi',
    email: 'fenice.sp@gmail.com',
    whatsapp: '+393271234567',
    comune: 'Milano Bovisa',
    servizio: 'd2d',
    date_preferite: 'Dal 10 al 15 Settembre',
    note: 'Quantità: 10.000 volantini | Preventivo: QUOTE-9988',
    gestita: false,
    gestita_at: null,
  };

  const campaigns = [
    {
      id: 'c1',
      client: 'Campagna Bovisa Superstore',
      zone: 'Milano Bovisa',
      comuni: ['Milano Bovisa', 'Dergano'],
      date: '2026-09-12',
      service: 'd2d',
    },
  ];

  const normalized = normalizeSmartPairingRequest(dbRow, campaigns);

  assert.equal(normalized.id, '11111111-2222-3333-4444-555555555555');
  assert.equal(normalized.nome, 'Mario Rossi');
  assert.equal(normalized.email, 'fenice.sp@gmail.com');
  assert.equal(normalized.phone, '+393271234567');
  assert.equal(normalized.comune, 'Milano Bovisa');
  assert.equal(normalized.service, 'd2d');
  assert.equal(normalized.datePreferite, 'Dal 10 al 15 Settembre');
  assert.equal(normalized.status, 'open');
  assert.equal(normalized.quantity, 10000);
  assert.equal(normalized.quoteId, 'QUOTE-9988');
  assert.equal(normalized.matchingCampaigns.length, 1);
  assert.equal(normalized.matchingCampaigns[0].title, 'Campagna Bovisa Superstore');
});

test('Smart Pairing: normalizeSmartPairingRequest with legacy aliases and fallback fields', () => {
  const legacyRow = {
    id: '22222222-3333-4444-5555-666666666666',
    created_at: '2026-09-04T10:00:00Z',
    email: 'fenice.sp@gmail.com',
    telefono: '3339876543',
    zone: 'Monza Centro',
    preferred_period: 'Prima settimana di Ottobre',
    status: 'reviewing',
    note: null,
    gestita: false,
  };

  const normalized = normalizeSmartPairingRequest(legacyRow, []);

  assert.equal(normalized.nome, 'fenice.sp');
  assert.equal(normalized.phone, '3339876543');
  assert.equal(normalized.comune, 'Monza Centro');
  assert.equal(normalized.datePreferite, 'Prima settimana di Ottobre');
  assert.equal(normalized.status, 'reviewing');
  assert.equal(normalized.gestita, false);
});

test('Smart Pairing: normalizeSmartPairingRequest handles gestita boolean correctly', () => {
  const managedRow = {
    id: '33333333-4444-5555-6666-777777777777',
    nome: 'Giuseppe Verdi',
    email: 'verdi@example.com',
    comune: 'Bergamo',
    servizio: 'h2h',
    gestita: true,
    gestita_at: '2026-09-05T12:00:00Z',
  };

  const normalized = normalizeSmartPairingRequest(managedRow, []);
  assert.equal(normalized.status, 'closed');
  assert.equal(normalized.service, 'h2h');
  assert.equal(normalized.gestita, true);
});

test('Smart Pairing: Enterprise service recognition', () => {
  const enterpriseRow = {
    id: '44444444-5555-6666-7777-888888888888',
    nome: 'Azienda Spa',
    email: 'corporate@azienda.it',
    comune: 'Multi-città',
    servizio: 'Enterprise',
    note: 'Numero sedi: 12',
    gestita: false,
  };

  const normalized = normalizeSmartPairingRequest(enterpriseRow, []);
  assert.equal(normalized.service, 'enterprise');
  assert.equal(normalized.nome, 'Azienda Spa');
  assert.equal(normalized.status, 'open');
});
