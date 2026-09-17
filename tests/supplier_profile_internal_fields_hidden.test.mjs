/**
 * tests/supplier_profile_internal_fields_hidden.test.mjs
 *
 * P2 — SupplierDashboard's reloadProfile() used
 * supabase.from('supplier_profiles').select('*'), which (RLS still
 * own-row-only, so not cross-tenant) returned Admin-internal columns
 * (admin_notes, verified_by, suspended_by, verified_at, suspended_at) to
 * the supplier looking at their own profile.
 *
 * Fix: an explicit column list (SUPPLIER_SELF_VISIBLE_COLUMNS) excluding
 * those 5 internal columns, covering every field the dashboard UI actually
 * renders (company_name, contact_name, email, phone, vat_number, status,
 * coverage_areas, services) plus id/public_code/created_at/updated_at.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../src/pages/supplier/SupplierDashboard.jsx', import.meta.url), 'utf8');

test('nessuna query su supplier_profiles usa piu\' select(\'*\')', () => {
  assert.doesNotMatch(SRC, /from\('supplier_profiles'\)\.select\('\*'\)/);
});

test('SUPPLIER_SELF_VISIBLE_COLUMNS esclude i 5 campi interni Admin', () => {
  const constMatch = SRC.match(/const SUPPLIER_SELF_VISIBLE_COLUMNS = '([^']*)';/);
  assert.ok(constMatch, 'la costante deve esistere');
  const cols = constMatch[1];
  for (const internal of ['admin_notes', 'verified_by', 'suspended_by', 'verified_at', 'suspended_at']) {
    assert.doesNotMatch(cols, new RegExp(`\\b${internal}\\b`), `${internal} e' un campo interno Admin, non deve essere leggibile dal fornitore`);
  }
});

test('SUPPLIER_SELF_VISIBLE_COLUMNS copre tutti i campi realmente usati dalla UI del fornitore', () => {
  const constMatch = SRC.match(/const SUPPLIER_SELF_VISIBLE_COLUMNS = '([^']*)';/);
  const cols = constMatch[1];
  for (const used of ['company_name', 'contact_name', 'email', 'phone', 'vat_number', 'status', 'coverage_areas', 'services']) {
    assert.match(cols, new RegExp(`\\b${used}\\b`), `${used} e' usato dalla UI (profile.${used}) e deve restare leggibile`);
  }
});

test('reloadProfile usa la lista esplicita, non select(\'*\')', () => {
  const fnStart = SRC.indexOf('const reloadProfile = useCallback(async () => {');
  const fnEnd = SRC.indexOf('}, []);', fnStart);
  const fn = SRC.slice(fnStart, fnEnd);
  assert.match(fn, /\.select\(SUPPLIER_SELF_VISIBLE_COLUMNS\)/);
});
