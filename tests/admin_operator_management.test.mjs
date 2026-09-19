import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/pages/admin/GpsMonitor.jsx', import.meta.url), 'utf8');

test('Admin OP management: canonical card mostra zona corrente e consente revoca assignment', () => {
  assert.match(src, /import \{ listCampaignAssignments, getCampaignManualOperationalMetrics, revokeOperatorAssignment \}/);
  assert.match(src, /async function handleRevokeOperator\(op\)/);
  assert.match(src, /await revokeOperatorAssignment\(assignmentId\)/);
  assert.match(src, /status: 'revoked'/);
  assert.match(src, /Zona: <strong/);
  assert.match(src, /Revoca OP/);
  assert.match(src, /onRevokeOperator=\{handleRevokeOperator\}/);
});

test('Admin OP management: revoca non elimina storico GPS e resta confermata manualmente', () => {
  assert.match(src, /Lo storico GPS resta conservato/);
  assert.match(src, /window\.confirm/);
  assert.doesNotMatch(src, /delete.*delivery_sessions/i);
});
