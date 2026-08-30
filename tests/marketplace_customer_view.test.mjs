// Ticket "COMPLETA MARKETPLACE CLIENTE — CUSTOMER QUOTES VIEW + ERRORI AMICHEVOLI".
// Test di comportamento REALE (import diretto): mapper errori + view model stati.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  mapMarketplaceError,
  isKnownMarketplaceError,
  MARKETPLACE_ERROR_GENERIC,
} from '../src/lib/services/marketplaceErrors.js';
import {
  normalizeCustomerCampaign,
  isMarketplaceCampaignStatus,
  MARKETPLACE_CAMPAIGN_STATUSES,
  MARKETPLACE_STATUS_LABELS,
} from '../src/lib/customerCampaigns.js';

// ── mapMarketplaceError ───────────────────────────────────────────────
test('token diretto -> messaggio italiano', () => {
  assert.equal(mapMarketplaceError(new Error('OFFERTA_GIA_INVIATA')), 'Hai già inviato un preventivo per questa richiesta.');
  assert.equal(mapMarketplaceError(new Error('CAMPAGNA_GIA_ASSEGNATA')), 'La campagna è già stata assegnata.');
  assert.equal(mapMarketplaceError(new Error('FORNITORE_NON_VERIFICATO')), 'Il tuo profilo fornitore non è ancora verificato.');
  assert.equal(mapMarketplaceError(new Error('OPERATORE_NON_DEL_FORNITORE')), 'L’operatore selezionato non appartiene alla tua organizzazione.');
  assert.equal(mapMarketplaceError(new Error('CAMPAGNA_NON_DEL_FORNITORE')), 'Questa campagna non è assegnata alla tua organizzazione.');
});

test('corpo JSON PostgREST grezzo dentro message -> token estratto', () => {
  const raw = '{"code":"23505","details":null,"hint":null,"message":"OFFERTA_GIA_INVIATA"}';
  assert.equal(mapMarketplaceError(new Error(raw)), 'Hai già inviato un preventivo per questa richiesta.');
  assert.equal(mapMarketplaceError({ message: raw }), 'Hai già inviato un preventivo per questa richiesta.');
});

test('token dentro una frase -> estratto', () => {
  assert.equal(
    mapMarketplaceError(new Error('RPC customer_accept_supplier_quote fallita: CAMPAGNA_GIA_ASSEGNATA')),
    'La campagna è già stata assegnata.',
  );
});

test('oggetto stile supabase-js { code, message }', () => {
  assert.equal(mapMarketplaceError({ code: '42501', message: 'CAMPAGNA_NON_AUTORIZZATA' }), 'Non hai accesso a questa campagna.');
});

test('errore sconosciuto -> generico, mai SQLSTATE/JSON/stack', () => {
  const out = mapMarketplaceError(new Error('{"code":"23503","message":"insert or update on table violates foreign key constraint"}'));
  assert.equal(out, MARKETPLACE_ERROR_GENERIC);
  assert.doesNotMatch(out, /23503|23505|SQLSTATE|constraint|\{|\}/);
  assert.equal(mapMarketplaceError(null), MARKETPLACE_ERROR_GENERIC);
  assert.equal(mapMarketplaceError(undefined), MARKETPLACE_ERROR_GENERIC);
  assert.equal(mapMarketplaceError('boom'), MARKETPLACE_ERROR_GENERIC);
});

test('nessun output del mapper contiene mai dettagli tecnici', () => {
  const samples = ['OFFERTA_GIA_INVIATA', 'CAMPAGNA_GIA_ASSEGNATA', 'x', '{"code":"23505"}', ''];
  for (const s of samples) {
    const msg = mapMarketplaceError(new Error(s));
    assert.doesNotMatch(msg, /23505|23503|SQLSTATE|PostgREST|\bnull\b|\{|\}|stack/i);
  }
});

test('isKnownMarketplaceError distingue noti da generici', () => {
  assert.equal(isKnownMarketplaceError(new Error('OFFERTA_SCADUTA')), true);
  assert.equal(isKnownMarketplaceError(new Error('qualcosa di strano')), false);
});

// ── view model: rawStatus / marketplaceStatus / backward compat ───────
test('normalizeCustomerCampaign: legacy invariato', () => {
  const c = normalizeCustomerCampaign({ id: 'a', status: 'in_progress', metadata: {} });
  assert.equal(c.stato, 'in_distribuzione');     // mapping legacy preservato
  assert.equal(c.rawStatus, 'in_progress');      // stato DB reale esplicito
  assert.equal(c.marketplaceStatus, null);       // non e' una campagna marketplace
  assert.equal(c.status, 'in_progress');         // colonna DB grezza ancora presente
});

test('normalizeCustomerCampaign: campagna marketplace', () => {
  const c = normalizeCustomerCampaign({ id: 'b', status: 'receiving_quotes', metadata: {} });
  assert.equal(c.rawStatus, 'receiving_quotes');
  assert.equal(c.marketplaceStatus, 'receiving_quotes');
  assert.equal(c.stato, 'receiving_quotes');      // nessuna mappa legacy -> resta grezzo (non rotto)
});

test('MARKETPLACE_STATUS_LABELS copre tutti gli stati e sono italiane', () => {
  assert.deepEqual(MARKETPLACE_CAMPAIGN_STATUSES, ['requested', 'receiving_quotes', 'quote_selected', 'assigned']);
  assert.equal(MARKETPLACE_STATUS_LABELS.requested, 'Richiesta inviata');
  assert.equal(MARKETPLACE_STATUS_LABELS.receiving_quotes, 'Raccolta preventivi');
  assert.equal(MARKETPLACE_STATUS_LABELS.quote_selected, 'Preventivo selezionato');
  assert.equal(MARKETPLACE_STATUS_LABELS.assigned, 'Fornitore assegnato');
  for (const s of MARKETPLACE_CAMPAIGN_STATUSES) assert.equal(isMarketplaceCampaignStatus(s), true);
  assert.equal(isMarketplaceCampaignStatus('draft'), false);
  assert.equal(isMarketplaceCampaignStatus(null), false);
});
