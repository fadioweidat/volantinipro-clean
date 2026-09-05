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

test('Smart Pairing: status persistence across all allowed statuses', () => {
  const statuses = ['open', 'reviewing', 'proposal_sent', 'accepted', 'rejected', 'closed'];
  for (const st of statuses) {
    const row = {
      id: `id-${st}`,
      nome: 'Test Utente',
      email: 'fenice.sp@gmail.com',
      comune: 'Milano',
      servizio: 'd2d',
      status: st,
      admin_notes: `Nota interna per stato ${st}`,
      gestita: ['accepted', 'rejected', 'closed'].includes(st),
    };
    const norm = normalizeSmartPairingRequest(row, []);
    assert.equal(norm.status, st);
    assert.equal(norm.adminNotes, `Nota interna per stato ${st}`);
    assert.equal(norm.gestita, ['accepted', 'rejected', 'closed'].includes(st));
  }
});

test('Smart Pairing: note enrichment parsing from Step 3 configurator', () => {
  const configuratorRow = {
    id: 'cfg-1',
    nome: 'Cliente Configurator',
    email: 'cliente@test.it',
    whatsapp: '+393331122334',
    comune: 'Milano Sempione',
    servizio: 'd2d',
    date_preferite: 'Flessibile entro 15gg',
    note: 'Quantità: 15.000 volantini | Preventivo: VP-2026-9081 | Note: Consegna preferibilmente mattina',
    status: 'open',
    gestita: false,
  };

  const norm = normalizeSmartPairingRequest(configuratorRow, []);
  assert.equal(norm.quantity, 15000);
  assert.equal(norm.quoteId, 'VP-2026-9081');
  assert.equal(norm.comune, 'Milano Sempione');
  assert.equal(norm.datePreferite, 'Flessibile entro 15gg');
  assert.equal(norm.note, 'Quantità: 15.000 volantini | Preventivo: VP-2026-9081 | Note: Consegna preferibilmente mattina');
});

test('Smart Pairing: deduplication trigger simulation logic', () => {
  // Simulate backend dedupe condition: same email, same comune, same service within 10 min window
  const existingRows = [
    {
      id: 'existing-1',
      email: 'fenice.sp@gmail.com',
      comune: 'Milano Bovisa',
      servizio: 'd2d',
      status: 'open',
      gestita: false,
      created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
    },
    {
      id: 'old-request',
      email: 'fenice.sp@gmail.com',
      comune: 'Milano Bovisa',
      servizio: 'd2d',
      status: 'closed',
      gestita: true,
      created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(), // 30 days ago (historical)
    }
  ];

  function simulateDedupeInsert(newReq, rows) {
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const match = rows.find(r => 
      r.email.toLowerCase() === newReq.email.toLowerCase() &&
      r.comune.toLowerCase() === newReq.comune.toLowerCase() &&
      (r.servizio || 'd2d').toLowerCase() === (newReq.servizio || 'd2d').toLowerCase() &&
      (r.gestita === false || (r.status || 'open') === 'open') &&
      new Date(r.created_at).getTime() >= tenMinAgo
    );
    if (match) {
      // Backend updates existing row, does not insert duplicate
      match.note = newReq.note || match.note;
      return { inserted: false, targetId: match.id };
    }
    const newId = 'new-' + Math.random();
    rows.push({ ...newReq, id: newId, created_at: new Date().toISOString() });
    return { inserted: true, targetId: newId };
  }

  // Rapid second submit of same data
  const req1 = {
    email: 'fenice.sp@gmail.com',
    comune: 'Milano Bovisa',
    servizio: 'd2d',
    status: 'open',
    gestita: false,
    note: 'Prima richiesta',
  };

  const res1 = simulateDedupeInsert(req1, existingRows);
  assert.equal(res1.inserted, false, 'Duplicate should be absorbed into existing pending request');
  assert.equal(res1.targetId, 'existing-1');
  assert.equal(existingRows.length, 2, 'Historical records must be preserved and no ghost duplicate created');
});
