/**
 * tests/supplier_autoclaim_single_path.test.mjs
 *
 * P2 — SupplierGuard.jsx and SupplierDashboard.jsx duplicated the exact
 * same auto-claim logic (same localStorage key
 * 'vp_pending_supplier_application', same user_metadata fallback fields,
 * same supplierApply() call) — a real risk of double execution/race if
 * both mounted near-simultaneously.
 *
 * Fix: centralized into a single helper, src/auth/supplierAutoClaim.js
 * (claimPendingSupplierApplication), called ONLY from SupplierGuard.
 * SupplierDashboard only mounts once the Guard has already resolved phase
 * === 'ok' (verified) or 'pending' (post-claim), so it never legitimately
 * needs to auto-claim anything itself — its reloadProfile() now does a
 * plain read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HELPER = readFileSync(new URL('../src/auth/supplierAutoClaim.js', import.meta.url), 'utf8');
const GUARD = readFileSync(new URL('../src/auth/guards/SupplierGuard.jsx', import.meta.url), 'utf8');
const DASHBOARD = readFileSync(new URL('../src/pages/supplier/SupplierDashboard.jsx', import.meta.url), 'utf8');

test('esiste un unico helper canonico per il claim di una candidatura pending', () => {
  assert.match(HELPER, /export async function claimPendingSupplierApplication\(user\)/);
  assert.match(HELPER, /vp_pending_supplier_application/);
  assert.match(HELPER, /supplierApply\(/);
});

test('helper: idempotente — nessuna chiamata se non c\'e\' nulla di pending', () => {
  const fnStart = HELPER.indexOf('export async function claimPendingSupplierApplication');
  const fn = HELPER.slice(fnStart);
  assert.match(fn, /if \(!company && !contact && !phone\) return null;/);
  const guardIdx = fn.indexOf('if (!company && !contact && !phone) return null;');
  const applyIdx = fn.indexOf('await supplierApply(');
  assert.ok(guardIdx > -1 && applyIdx > guardIdx, 'il guard "niente da reclamare" deve precedere la chiamata a supplierApply');
});

test('helper: rimuove la chiave localStorage dopo un claim riuscito (una seconda chiamata non trova nulla)', () => {
  assert.match(HELPER, /localStorage\.removeItem\('vp_pending_supplier_application'\)/);
});

test('SupplierGuard e\' l\'UNICO chiamante del helper di auto-claim', () => {
  assert.match(GUARD, /import \{ claimPendingSupplierApplication \} from '\.\.\/supplierAutoClaim\.js';/);
  assert.match(GUARD, /claimPendingSupplierApplication\(userMeta\)/);
});

test('SupplierDashboard NON duplica piu\' la logica di auto-claim', () => {
  assert.doesNotMatch(DASHBOARD, /vp_pending_supplier_application/, 'SupplierDashboard non deve leggere/scrivere piu\' questa chiave: unico owner e\' SupplierGuard');
  assert.doesNotMatch(DASHBOARD, /supplierApply/, 'SupplierDashboard non deve piu\' chiamare supplierApply direttamente da reloadProfile');
  assert.doesNotMatch(DASHBOARD, /SUPPLIER_DASHBOARD_AUTO_CLAIM_WARN/, 'il vecchio percorso di auto-claim duplicato deve essere rimosso, non solo silenziato');
});

test('reloadProfile di SupplierDashboard resta un semplice fetch (comportamento pending/suspended/rejected invariato)', () => {
  const fnStart = DASHBOARD.indexOf('const reloadProfile = useCallback(async () => {');
  const fnEnd = DASHBOARD.indexOf('}, []);', fnStart);
  const fn = DASHBOARD.slice(fnStart, fnEnd);
  assert.match(fn, /supabase\.from\('supplier_profiles'\)\.select\(SUPPLIER_SELF_VISIBLE_COLUMNS\)/);
  assert.match(fn, /setProfile\(\{ email: user\.email \|\| '', status: 'pending' \}\);/, 'stato di fallback "pending" per un utente autenticato senza riga ancora visibile deve restare');
});
