// TICKET — "FIX PAYMENT WHATSAPP DETAILS + ADMIN 500 ERROR + CONFIRM PAYMENT
// DOUBLE-CLICK", Problem C. Root cause confermato con evidenza runtime reale:
// il PATCH di conferma pagamento risponde in ~300ms, ma la UI aspettava il
// reload COMPLETO dell'overview Admin (8-9 query, osservate 3-7.5s ciascuna)
// prima di mostrare PAGATO — dando l'impressione di un click "perso".
// Fix: aggiornamento locale immediato dopo il 200 del PATCH, modal chiusa,
// reload completo SOLO in background per riconciliare. Nessuna modifica alla
// business logic del pagamento (importo, metodo, regole bonifico).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';

import { confirmCampaignPayment } from '../src/lib/supabaseClient.js';

function withMockedFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  const originalUrl = process.env.VITE_SUPABASE_URL;
  const originalKey = process.env.VITE_SUPABASE_ANON_KEY;
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
    process.env.VITE_SUPABASE_URL = originalUrl;
    process.env.VITE_SUPABASE_ANON_KEY = originalKey;
  });
}

function jsonResponse(body, status = 200) {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
  };
}

// ── §13 idempotency: una campagna già pagata non deve ricevere una seconda PATCH ──
test('confirmCampaignPayment: campagna già "pagato" -> nessuna seconda PATCH, ritorna lo stato esistente invariato', async () => {
  const calls = [];
  await withMockedFetch(async (url, init) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    if (String(url).includes('/rest/v1/campaigns?id=eq.')) {
      return jsonResponse([{ id: 'camp-idem-1', status: 'approved', metadata: { payment_status: 'pagato', payment_confirmed_at: '2026-01-01T00:00:00.000Z' } }]);
    }
    throw new Error(`UNEXPECTED_URL:${url}`);
  }, async () => {
    const result = await confirmCampaignPayment('camp-idem-1');
    assert.equal(result.metadata.payment_status, 'pagato');
    assert.equal(result.metadata.payment_confirmed_at, '2026-01-01T00:00:00.000Z', 'il timestamp originale non deve essere sovrascritto da una seconda chiamata');
  });
  const patchCalls = calls.filter((c) => c.method === 'PATCH');
  assert.equal(patchCalls.length, 0, 'nessuna PATCH deve partire per una campagna già pagata');
});

test('confirmCampaignPayment: campagna "da_pagare" -> esattamente una PATCH, diventa pagato', async () => {
  const calls = [];
  await withMockedFetch(async (url, init) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    if (String(url).includes('/rest/v1/campaigns?id=eq.') && (!init || init.method === 'GET' || !init.method)) {
      return jsonResponse([{ id: 'camp-new-2', status: 'pending_review', metadata: {} }]);
    }
    if (String(url).includes('/rest/v1/campaigns?id=eq.') && init?.method === 'PATCH') {
      const body = JSON.parse(init.body);
      assert.equal(body.metadata.payment_status, 'pagato');
      assert.equal(body.status, 'approved');
      return jsonResponse([{ id: 'camp-new-2', ...body }]);
    }
    throw new Error(`UNEXPECTED_URL:${url}`);
  }, async () => {
    const result = await confirmCampaignPayment('camp-new-2');
    assert.equal(result[0].metadata.payment_status, 'pagato');
  });
  const patchCalls = calls.filter((c) => c.method === 'PATCH');
  assert.equal(patchCalls.length, 1, 'esattamente una PATCH per la conferma pagamento');
});

// ── Contratto UI (ClientsQuotes.jsx): aggiornamento locale immediato + reload
// completo SOLO in background, mai un blocco della UI sul reload pesante ──
const CQ_SRC = fs.readFileSync(new URL('../src/pages/admin/ClientsQuotes.jsx', import.meta.url), 'utf8');

test('ClientsQuotes.jsx: aggiornamento locale della riga avviene DOPO il successo della PATCH, prima di load()', () => {
  const fnStart = CQ_SRC.indexOf('async function handleConfirmPayment()');
  const fnEnd = CQ_SRC.indexOf('\n  }', CQ_SRC.indexOf('setPaymentConfirmBusy(false);', fnStart));
  const fn = CQ_SRC.slice(fnStart, fnEnd);

  const patchIdx = fn.indexOf('await confirmCampaignPayment(confirmedId)');
  const localUpdateIdx = fn.indexOf("paymentStatus: 'pagato'");
  const modalCloseIdx = fn.indexOf('setPaymentConfirmRow(null)');
  const backgroundLoadIdx = fn.indexOf('load({ background: true })');

  assert.ok(patchIdx > -1 && localUpdateIdx > -1 && modalCloseIdx > -1 && backgroundLoadIdx > -1, 'handleConfirmPayment non trovata o struttura inattesa');
  assert.ok(patchIdx < localUpdateIdx, 'la PATCH deve completare (await) prima di qualunque aggiornamento locale');
  assert.ok(localUpdateIdx < modalCloseIdx, 'la riga locale si aggiorna prima di chiudere la modale');
  assert.ok(modalCloseIdx < backgroundLoadIdx, 'il reload completo parte dopo, e non deve essere atteso (await) qui');
  // Il reload di riconciliazione non blocca handleConfirmPayment: nessun `await` immediatamente prima.
  assert.doesNotMatch(fn.slice(backgroundLoadIdx - 10, backgroundLoadIdx), /await\s*$/);
});

test('ClientsQuotes.jsx: nessun optimistic update prima della risposta della PATCH (solo dopo await)', () => {
  const fnStart = CQ_SRC.indexOf('async function handleConfirmPayment()');
  const fnEnd = CQ_SRC.indexOf('\n  }', CQ_SRC.indexOf('setPaymentConfirmBusy(false);', fnStart));
  const fn = CQ_SRC.slice(fnStart, fnEnd);
  const tryIdx = fn.indexOf('try {');
  const patchIdx = fn.indexOf('await confirmCampaignPayment(confirmedId)');
  const before = fn.slice(tryIdx, patchIdx);
  assert.doesNotMatch(before, /paymentStatus:\s*'pagato'/, 'nessun campo pagato deve essere impostato prima che la PATCH sia confermata');
});

test('ClientsQuotes.jsx: guard invariato contro il doppio click (stesso pattern pre-esistente)', () => {
  assert.match(CQ_SRC, /if \(!paymentConfirmRow \|\| paymentConfirmBusy\) return;/);
  assert.match(CQ_SRC, /disabled=\{paymentConfirmBusy\}/);
  assert.match(CQ_SRC, /\{paymentConfirmBusy \? 'Conferma in corso…' : 'Conferma pagamento'\}/);
});
