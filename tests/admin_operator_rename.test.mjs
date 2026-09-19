import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/admin/GpsMonitor.jsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/services/admin-api.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260919223000_admin_rename_group_participant.sql', import.meta.url), 'utf8');

test('Admin OP rename: UI chiama RPC dedicata e aggiorna il nome senza cambiare identita', () => {
  assert.match(api, /export async function renameGroupParticipant\(assignmentId, displayName\)/);
  assert.match(api, /admin_rename_group_participant/);
  assert.match(page, /async function handleRenameOperator\(op\)/);
  assert.match(page, /window\.prompt\('Nuovo nome operatore/);
  assert.match(page, /await renameGroupParticipant\(assignmentId, trimmed\)/);
  assert.match(page, /Rinomina OP/);
  assert.match(page, /onRenameOperator=\{handleRenameOperator\}/);
});

test('Admin OP rename: DB aggiorna participant + assignment label ma non sessioni/GPS', () => {
  assert.match(migration, /update public\.driver_group_participants[\s\S]*set display_name = v_name/);
  assert.match(migration, /update public\.operator_assignments[\s\S]*set participant_label = v_name/);
  assert.match(migration, /'operator_label', v_name/);
  assert.doesNotMatch(migration, /update public\.delivery_sessions/i);
  assert.doesNotMatch(migration, /delete from public\.gps_tracking_points/i);
  assert.match(migration, /NOME_OPERATIVO_GIA_USATO/);
});
