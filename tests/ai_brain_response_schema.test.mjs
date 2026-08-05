import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAiResponse, validateAiResponse, buildFallbackResponse, sanitizeErrorForLog, AI_RESPONSE_STATUSES } from '../src/ai/schema/aiResponseSchema.js';
import { AI_FIELD_TYPES, AI_CONFIDENCE_LEVELS } from '../src/ai/context/fieldTypes.js';

test('buildAiResponse: produce sempre una forma valida per il contratto condiviso', () => {
  const response = buildAiResponse({
    status: AI_RESPONSE_STATUSES.AI,
    answer: '  Risposta reale.  ',
    intent: 'campaign_progress',
    evidence: [{ label: 'Stato', value: 'active', type: AI_FIELD_TYPES.REAL, source: 'x', confidence: AI_CONFIDENCE_LEVELS.HIGH }],
    limitations: ['GPS non disponibile'],
    suggestedQuestions: ['Altra domanda?'],
    actions: [{ id: 'open_campaign_tracking', label: 'Apri tracking' }],
  });
  assert.equal(validateAiResponse(response), true);
  assert.equal(response.answer, 'Risposta reale.', 'il testo viene trimmato');
  assert.equal(response.evidence[0].label, 'Stato');
});

test('buildAiResponse: status non riconosciuto ripiega su "error", answer vuota resta vuota (mai testo inventato)', () => {
  const response = buildAiResponse({ status: 'qualcosa_di_strano', answer: '' });
  assert.equal(response.status, AI_RESPONSE_STATUSES.ERROR);
  assert.equal(response.answer, '');
  assert.equal(validateAiResponse(response), false, 'answer vuota non è un output valido da mostrare all\'utente');
});

test('validateAiResponse: rifiuta evidence con campi tipo non valido', () => {
  const response = { status: AI_RESPONSE_STATUSES.AI, answer: 'ok', intent: 'x', evidence: [{ label: 'A', value: 1, type: 'INVENTATO', source: '', updatedAt: null, confidence: 'high' }], limitations: [], suggestedQuestions: [], actions: [] };
  assert.equal(validateAiResponse(response), false);
});

test('validateAiResponse: rifiuta un oggetto non conforme al contratto (nessuna eccezione, solo false)', () => {
  assert.equal(validateAiResponse(null), false);
  assert.equal(validateAiResponse(undefined), false);
  assert.equal(validateAiResponse('testo grezzo'), false);
  assert.equal(validateAiResponse({ status: AI_RESPONSE_STATUSES.AI }), false);
});

test('buildFallbackResponse: risposta sempre valida e mai vuota, anche con codice sconosciuto', () => {
  const response = buildFallbackResponse('codice_non_esistente', { intent: 'critical_campaigns' });
  assert.equal(validateAiResponse(response), true);
  assert.equal(response.status, AI_RESPONSE_STATUSES.FALLBACK);
  assert.equal(response.intent, 'critical_campaigns');
  assert.equal(response.evidence.length, 0);
});

test('buildFallbackResponse: output invalido del modello -> fallback controllato, mai testo grezzo esposto', () => {
  // Simula un output "del modello" completamente malformato: la UI non deve
  // MAI vederlo, deve vedere solo il fallback.
  const modelOutputInvalid = { alerts: 'non è un array', random: Symbol('x') };
  assert.equal(validateAiResponse(modelOutputInvalid), false);
  const fallback = buildFallbackResponse('invalid_output', { intent: 'daily_operations_summary' });
  assert.equal(validateAiResponse(fallback), true);
  assert.doesNotMatch(fallback.answer, /Symbol|alerts/);
});

test('sanitizeErrorForLog: rimuove JWT, Bearer token e chiavi OpenAI dal messaggio prima del log', () => {
  const fakeJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQ';
  const error = new Error(`Richiesta fallita con Authorization: Bearer ${fakeJwt} e chiave sk-abcdefghijklmnop`);
  const safe = sanitizeErrorForLog(error);
  assert.doesNotMatch(safe.message, /eyJ/);
  assert.doesNotMatch(safe.message, /sk-abcdefghijklmnop/);
  assert.match(safe.message, /\[REDACTED/);
});

test('sanitizeErrorForLog: gestisce errori senza message e stringhe semplici senza lanciare eccezioni', () => {
  assert.doesNotThrow(() => sanitizeErrorForLog({}));
  assert.doesNotThrow(() => sanitizeErrorForLog('errore semplice'));
  assert.doesNotThrow(() => sanitizeErrorForLog(undefined));
});
