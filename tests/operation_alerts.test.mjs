import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveOperationAlerts } from '../src/lib/operations/deriveOperationAlerts.js';

const NOW = new Date('2026-08-12T12:00:00.000Z');
const minutesAgo = minutes => new Date(NOW.getTime() - minutes * 60000).toISOString();
const base = overrides => ({ id: 'assignment-a', status: 'active', starts_at: minutesAgo(120), ends_at: new Date(NOW.getTime() + 3600000).toISOString(), zones: [{ name: 'Cormano', status: 'Da iniziare' }], sessions: [], ...overrides });
const types = assignment => deriveOperationAlerts(base(assignment), { now: NOW }).map(alert => alert.type);

test('sent 5 minuti fa non genera alert', () => assert.deepEqual(types({ programSentAt: minutesAgo(5) }), []));
test('sent 20 minuti fa non aperto genera SENT_NOT_OPENED', () => assert.deepEqual(types({ programSentAt: minutesAgo(20) }), ['SENT_NOT_OPENED']));
test('opened 20 minuti fa non confermato genera OPENED_NOT_CONFIRMED', () => assert.deepEqual(types({ programSentAt: minutesAgo(30), programOpenedAt: minutesAgo(20) }), ['OPENED_NOT_CONFIRMED']));
test('confirmed 40 minuti fa non iniziato genera CONFIRMED_NOT_STARTED', () => assert.deepEqual(types({ programConfirmedAt: minutesAgo(40) }), ['CONFIRMED_NOT_STARTED']));
test('confirmed non genera alert prima di starts_at', () => assert.deepEqual(types({ programConfirmedAt: minutesAgo(40), starts_at: new Date(NOW.getTime() + 3600000).toISOString() }), []));
test('started con GPS 3 minuti fa non genera alert', () => assert.deepEqual(types({ sessions: [{ status: 'started', started_at: minutesAgo(20) }], activeSessionLastPing: minutesAgo(3) }), []));
test('started con GPS 15 minuti fa genera GPS_STALE', () => assert.deepEqual(types({ sessions: [{ status: 'started', started_at: minutesAgo(20) }], activeSessionLastPing: minutesAgo(15) }), ['GPS_STALE']));
test('started senza GPS attende 10 minuti dallo start', () => assert.deepEqual(types({ sessions: [{ status: 'started', started_at: minutesAgo(11) }] }), ['GPS_STALE']));
test('paused non genera GPS_STALE', () => assert.deepEqual(types({ sessions: [{ status: 'paused', started_at: minutesAgo(20) }], activeSessionLastPing: minutesAgo(15) }), []));
test('zona Bloccata genera ZONE_BLOCKED', () => assert.deepEqual(types({ zones: [{ name: 'Cormano', status: 'Bloccata' }] }), ['ZONE_BLOCKED']));
test('assignment scaduta incompleta genera ASSIGNMENT_OVERDUE', () => assert.deepEqual(types({ ends_at: minutesAgo(1) }), ['ASSIGNMENT_OVERDUE']));
test('assignment completata non genera overdue', () => assert.deepEqual(types({ ends_at: minutesAgo(1), zones: [{ name: 'Cormano', status: 'Completata' }] }), []));
