// Ticket "ADMIN FORNITORI — UI GESTIONE STATUS MARKETPLACE".
// Contratto sorgente: nessuna nuova RPC, list via policy RLS admin, mutazioni
// solo via adminSetSupplierStatus, niente window.prompt/raw error, routing +
// AdminGuard, voce "Fornitori" nella dashboard Admin esistente.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const PAGE = read('src/pages/admin/AdminSuppliers.jsx');
const ADMINAPI = read('src/lib/services/admin-api.js');
const SUPAPI = read('src/lib/services/supplier-api.js');
const MKTERR = read('src/lib/services/marketplaceErrors.js');
const ROUTES = read('src/app/routeResolution.js');
const APPROUTER = read('src/app/AppRouter.jsx');
const MODULES = read('src/pages/admin/admin-dashboard/AdminDashboardModulesPanel.jsx');
const MIG = read('supabase/migrations/20260830160000_supplier_marketplace.sql');

// ── A: nessuna nuova RPC — la lista usa la policy RLS admin gia' esistente ──
test('A — adminListSuppliers legge supplier_profiles sotto supplier_profiles_admin_all, nessuna nuova RPC', () => {
  // la policy admin esiste gia' nella migration (non modificata)
  assert.match(MIG, /create policy supplier_profiles_admin_all on public\.supplier_profiles\s*\n\s*for all to authenticated using \(public\.jwt_is_admin\(\)\)/);
  // wrapper: SELECT diretto (sotto RLS), non una nuova funzione SQL
  assert.match(ADMINAPI, /export async function adminListSuppliers\(\)/);
  assert.match(ADMINAPI, /\.from\('supplier_profiles'\)\s*\n\s*\.select\(ADMIN_SUPPLIER_COLUMNS\)/);
  assert.doesNotMatch(ADMINAPI, /rpc\(\s*['"]admin_list_suppliers|create or replace function/i);
  assert.doesNotMatch(MIG, /admin_list_suppliers/);
  // colonne esplicite: MAI documents / verified_by / suspended_by
  assert.match(ADMINAPI, /const ADMIN_SUPPLIER_COLUMNS\s*=/);
  assert.doesNotMatch(ADMINAPI.slice(ADMINAPI.indexOf('ADMIN_SUPPLIER_COLUMNS')), /documents|verified_by|suspended_by/);
});

// ── B: mutazioni SOLO via adminSetSupplierStatus (RPC), mai update diretto ──
test('B — status change solo via adminSetSupplierStatus; nessun update diretto su supplier_profiles', () => {
  assert.match(PAGE, /import \{ adminSetSupplierStatus \} from '\.\.\/\.\.\/lib\/services\/supplier-api\.js'/);
  assert.match(PAGE, /await adminSetSupplierStatus\(id, to\)/);
  assert.doesNotMatch(PAGE, /\.from\(['"]supplier_profiles['"]\)[\s\S]{0,80}\.(update|insert|delete|upsert)\(/);
  // il wrapper RPC esiste ed e' security-definer gated
  assert.match(SUPAPI, /export function adminSetSupplierStatus\(supplierId, status, notes = null\)/);
  assert.match(SUPAPI, /rpc\('admin_set_supplier_status'/);
});

// ── C: transizioni consentite (ticket §4) ──
test('C — transizioni: pending->verified/rejected, verified->suspended, suspended->verified', () => {
  const block = PAGE.slice(PAGE.indexOf('const TRANSITIONS'), PAGE.indexOf('const FILTERS'));
  assert.match(block, /pending:\s*\[[\s\S]*to: 'verified'[\s\S]*to: 'rejected'/);
  assert.match(block, /verified:\s*\[\{ to: 'suspended'/);
  assert.match(block, /suspended:\s*\[\{ to: 'verified'/);
  assert.match(block, /rejected:\s*\[\]/); // stato terminale
});

// ── D: label italiane + badge ──
test('D — label italiane pending/verified/suspended/rejected', () => {
  const m = PAGE.slice(PAGE.indexOf('const STATUS_LABEL'), PAGE.indexOf('const STATUS_BADGE_CLASS'));
  assert.match(m, /pending: 'In attesa'/);
  assert.match(m, /verified: 'Verificato'/);
  assert.match(m, /suspended: 'Sospeso'/);
  assert.match(m, /rejected: 'Rifiutato'/);
  assert.match(PAGE, /admin-home__lead-state/); // badge stato riusa lo stile esistente
});

// ── E: filtri Tutti/In attesa/Verificati/Sospesi/Rifiutati su stati DB reali ──
test('E — filtri sugli stati DB reali, nessuna duplicazione locale', () => {
  const f = PAGE.slice(PAGE.indexOf('const FILTERS'), PAGE.indexOf('function fmtDate'));
  assert.match(f, /\['all', 'Tutti'\]/);
  assert.match(f, /\['pending', 'In attesa'\]/);
  assert.match(f, /\['verified', 'Verificati'\]/);
  assert.match(f, /\['suspended', 'Sospesi'\]/);
  assert.match(f, /\['rejected', 'Rifiutati'\]/);
  assert.match(PAGE, /filter === 'all' \? state\.rows : state\.rows\.filter\(\(r\) => r\.status === filter\)/);
});

// ── F: UX azioni — loading, disabled, no doppio submit, conferma inline, no window.prompt ──
test('F — mutazione: busyId lock, bottoni disabled, conferma inline, nessun window.prompt/confirm/alert', () => {
  assert.match(PAGE, /if \(busyId\) return;/);           // no doppio submit
  assert.match(PAGE, /setBusyId\(id\)/);
  assert.match(PAGE, /disabled=\{anyBusy\}/);            // azioni disabilitate durante una mutazione
  assert.match(PAGE, /disabled=\{rowBusy\}/);
  assert.match(PAGE, /setConfirm\(\{ id: s\.id, to: t\.to \}\)/); // conferma inline
  assert.match(PAGE, /Confermi: \{STATUS_LABEL\[pendingConfirm\.to\]\}\?/);
  assert.doesNotMatch(PAGE, /window\.prompt|window\.confirm|window\.alert|\balert\(|\bconfirm\(/);
  // reload lista + messaggio dopo successo; errore mappato
  assert.match(PAGE, /await adminSetSupplierStatus\(id, to\);\s*\n\s*await load\(\);\s*\n\s*setNotice\(/);
  assert.match(PAGE, /setState\(\(s\) => \(\{ \.\.\.s, error: mapMarketplaceError\(err\) \}\)\)/);
});

// ── G: nessun raw DB error mostrato ──
test('G — errori via mapMarketplaceError; mai raw SQL/PostgREST/token', () => {
  assert.match(PAGE, /import \{ mapMarketplaceError \}/);
  assert.doesNotMatch(PAGE, /err\.message|error\.message|JSON\.stringify\(err|SQLSTATE|23505|23503/);
  // mapper conosce gli errori dell'RPC admin
  for (const tok of ['ADMIN_RICHIESTO', 'STATUS_NON_VALIDO', 'FORNITORE_NON_TROVATO']) {
    assert.match(MKTERR, new RegExp(`${tok}:`), tok);
  }
});

// ── H: security — solo AdminGuard, nessuna seconda dashboard ──
test('H — /admin/suppliers dietro AdminGuard, nessuna Admin dashboard duplicata', () => {
  assert.match(ROUTES, /if \(p === '\/admin\/suppliers'\) return 'admin-suppliers';/);
  // risolto PRIMA del catch-all `startsWith('/admin')`
  assert.ok(ROUTES.indexOf("'/admin/suppliers'") < ROUTES.indexOf("p.startsWith('/admin')"));
  assert.match(APPROUTER, /const AdminSuppliers = lazy\(/);
  assert.match(APPROUTER, /"admin-suppliers": "\/admin\/suppliers"/);
  // reso DENTRO il blocco <AdminGuard> come le altre pagine admin
  const guardBlock = APPROUTER.slice(APPROUTER.indexOf('<AdminGuard'), APPROUTER.indexOf('</AdminGuard>'));
  assert.match(guardBlock, /page === "admin-suppliers" && <AdminSuppliers onNav=\{goTo\} \/>/);
  // usa AdminLayout esistente, non un nuovo shell
  assert.match(PAGE, /import \{ AdminLayout \} from '\.\/AdminLayout\.jsx'/);
  assert.match(PAGE, /<AdminLayout onNav=\{onNav\} title="Fornitori"/);
});

// ── I: voce "Fornitori" nella dashboard Admin esistente ──
test('I — ModuleCard "Fornitori" -> onNav(admin-suppliers) nel pannello moduli esistente', () => {
  assert.match(MODULES, /title="Fornitori"/);
  assert.match(MODULES, /cta="Apri Fornitori"/);
  assert.match(MODULES, /onOpen=\{\(\) => onNav\('admin-suppliers'\)\}/);
});

// ── J: payload — niente dati riservati non previsti ──
test('J — la pagina non referenzia token/secret/password/documents', () => {
  assert.doesNotMatch(PAGE, /token|secret|password|documents|access_token|service_role/i);
});
