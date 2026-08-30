// MARKETPLACE FORNITORE — test di CONTRATTO reali (nessun assert.ok(true)).
// La migration NON e' applicata: si verifica il testo SQL + il wiring frontend.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MIG = read('supabase/migrations/20260830160000_supplier_marketplace.sql');
const API = read('src/lib/services/supplier-api.js');
const GUARD = read('src/auth/guards/SupplierGuard.jsx');
const DASH = read('src/pages/supplier/SupplierDashboard.jsx');
const CUSTVIEW = read('src/pages/customer/CustomerQuotesView.jsx');
const APPROUTER = read('src/app/AppRouter.jsx');
const RESOLVE = read('src/app/routeResolution.js');

// helper: corpo di una funzione SQL "create or replace function public.NAME(...)... $$;"
function fnBody(name) {
  const start = MIG.indexOf(`function public.${name}(`);
  assert.ok(start > 0, `RPC ${name} assente`);
  const end = MIG.indexOf('$$;', start);
  return MIG.slice(start, end + 3);
}

// ── A: supplier non puo' update status ────────────────────────────────
test('A — nessuna policy UPDATE per il supplier su supplier_profiles; status via RPC Admin', () => {
  assert.doesNotMatch(MIG, /create policy [^\n]*on public\.supplier_profiles\s+for update/i);
  assert.doesNotMatch(MIG, /"Suppliers can update own profile"/);
  assert.match(fnBody('supplier_update_profile'), /company_name\s*=/);
  assert.doesNotMatch(fnBody('supplier_update_profile'), /\bstatus\b\s*=|verified_at|verified_by|admin_notes|public_code/);
  assert.match(fnBody('admin_set_supplier_status'), /if not public\.jwt_is_admin\(\) then raise exception/);
});

// ── B: FORCE RLS ─────────────────────────────────────────────────────
test('B — FORCE ROW LEVEL SECURITY su supplier_profiles', () => {
  assert.match(MIG, /alter table public\.supplier_profiles enable row level security/);
  assert.match(MIG, /alter table public\.supplier_profiles force row level security/);
});

// ── C: public_code opaco, non da UUID ───────────────────────────────
test('C — public_code random opaco (gen_random_uuid), NOT NULL + UNIQUE, mai da id/email/vat', () => {
  assert.match(MIG, /public_code text not null unique/);
  assert.match(MIG, /'VP-' \|\| upper\(substr\(replace\(gen_random_uuid\(\)::text, '-', ''\), 1, 10\)\)/);
  // il codice NON e' derivato dall'id del supplier
  assert.doesNotMatch(MIG, /substr\(\s*q?\.?supplier_id::text/);
  assert.doesNotMatch(MIG, /substr\(\s*s?\.?id::text/);
});

// ── D: customer payload pulito ──────────────────────────────────────
test('D — customer_get_supplier_quotes: solo public_code, niente supplier_id/subtotal/PII', () => {
  const b = fnBody('customer_get_supplier_quotes');
  const retTable = b.slice(b.indexOf('returns table ('), b.indexOf('language plpgsql'));
  assert.doesNotMatch(retTable, /supplier_id|subtotal|company_name|email|phone|vat_number|documents|admin_notes/);
  assert.match(retTable, /supplier_public_code text/);
  const selectList = b.slice(b.indexOf('return query'), b.indexOf('from public.quotes q'));
  assert.match(selectList, /s\.public_code/);
  assert.doesNotMatch(selectList, /supplier_id|subtotal/);
  assert.match(b, /c\.user_id = auth\.uid\(\) or public\.jwt_is_admin\(\)/);
});

// ── E: supplier payload senza PII cliente ──────────────────────────
test('E — supplier_get_available_requests: niente user_id/PII cliente, niente UUID campagna reale', () => {
  const b = fnBody('supplier_get_available_requests');
  assert.doesNotMatch(b, /c\.user_id|customer|email|phone|payment|platform_margin|admin_notes|internal_pric/i);
  assert.match(b, /c\.marketplace_code/);
  assert.doesNotMatch(b, /c\.id as campaign_id|select\s+c\.id\b/i);
});

// ── F: submit quote verified gate ─────────────────────────────────
test('F — supplier_submit_quote: verified gate + supplier_id server-side + campagna disponibile', () => {
  const b = fnBody('supplier_submit_quote');
  assert.match(b, /if not public\.is_verified_supplier\(v_uid\) then/);
  assert.match(b, /\(campaign_id, supplier_id, quote_status,/); // colonna supplier_id nella insert list
  assert.match(b, /values\s*\n\s*\(v_campaign\.id, v_uid, 'submitted'/); // valore = auth.uid()
  assert.doesNotMatch(b, /p_supplier_id/); // mai supplier_id dal browser
  assert.match(b, /where marketplace_code = p_request_code for update/);
  assert.match(b, /v_campaign\.supplier_id is not null/);
  assert.match(b, /OFFERTA_GIA_INVIATA/);
});

// ── G: frontend NON fa insert diretto ────────────────────────────
test('G — supplier-api.js usa SOLO RPC (nessun .from().insert/update su quotes)', () => {
  assert.doesNotMatch(API, /\.from\(['"]quotes['"]\)/);
  assert.doesNotMatch(API, /\.from\(['"]supplier_profiles['"]\)/);
  assert.doesNotMatch(API, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.match(API, /rpc\('supplier_submit_quote'/);
  assert.match(API, /rpc\('customer_accept_supplier_quote', \{ p_quote_id: quoteId \}\)/);
});

// ── H: accept usa FOR UPDATE ────────────────────────────────────
test('H — customer_accept_supplier_quote: SELECT ... FOR UPDATE su quota e campagna', () => {
  const b = fnBody('customer_accept_supplier_quote');
  assert.match(b, /select \* into v_quote from public\.quotes where id = p_quote_id for update/);
  assert.match(b, /select \* into v_campaign from public\.campaigns where id = v_quote\.campaign_id for update/);
});

// ── I: accept deriva campaign dalla quote ──────────────────────
test('I — accept: input SOLO p_quote_id, campaign derivata dalla quote', () => {
  assert.match(MIG, /function public\.customer_accept_supplier_quote\(p_quote_id uuid\)/);
  assert.doesNotMatch(MIG, /customer_accept_supplier_quote\(target_quote_id uuid, target_campaign_id uuid\)/);
});

// ── J: legacy supplier_id IS NULL non toccate ─────────────────
test('J — le quote piattaforma legacy (supplier_id IS NULL) non vengono mai modificate', () => {
  const b = fnBody('customer_accept_supplier_quote');
  assert.match(b, /update public\.quotes set quote_status = 'not_selected'[\s\S]{0,200}and supplier_id is not null/);
  assert.doesNotMatch(b, /and id <> p_quote_id;\s*\n\s*update public\.campaigns/); // non c'e' un UPDATE senza il filtro supplier_id
});

// ── K: campaign already assigned denied ──────────────────────
test('K — seconda accettazione su vincitore diverso -> FAIL; stessa quota accettata -> idempotente', () => {
  const b = fnBody('customer_accept_supplier_quote');
  assert.match(b, /if v_quote\.quote_status = 'accepted' and v_campaign\.supplier_id = v_quote\.supplier_id then\s*\n\s*return v_campaign;/);
  assert.match(b, /if v_campaign\.supplier_id is not null then\s*\n\s*raise exception 'CAMPAGNA_GIA_ASSEGNATA'/);
});

// ── L: altre offerte fornitore -> not_selected ──────────────
test('L — le altre offerte Fornitore diventano not_selected', () => {
  assert.match(fnBody('customer_accept_supplier_quote'), /set quote_status = 'not_selected'/);
});

// ── M: tutte le SECURITY DEFINER hanno search_path '' ───────
test('M — ogni SECURITY DEFINER ha SET search_path TO \'\'', () => {
  const code = MIG.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const defs = code.match(/security definer/gi) || [];
  const withPath = code.match(/security definer set search_path to ''/gi) || [];
  assert.ok(defs.length >= 12, `attese >=12 SECURITY DEFINER, trovate ${defs.length}`);
  assert.equal(withPath.length, defs.length, `search_path mancante su ${defs.length - withPath.length} funzioni`);
});

// ── N: revoke public/anon ──────────────────────────────────
test('N — ogni RPC: REVOKE ALL ... FROM public, anon + GRANT EXECUTE TO authenticated', () => {
  const rpcs = [
    'is_verified_supplier(uuid)', 'supplier_update_profile(text, text, text, text[], text[])',
    'admin_set_supplier_status(uuid, text, text)', 'customer_get_supplier_quotes(uuid)',
    'supplier_get_available_requests()', 'supplier_submit_quote(text, numeric, text, text, text, timestamptz)',
    'customer_accept_supplier_quote(uuid)', 'supplier_list_own_quotes()',
    'supplier_list_assigned_campaigns()', 'supplier_list_own_operators()',
    'supplier_assign_operator(uuid, uuid)',
  ];
  for (const sig of rpcs) {
    const esc = sig.replace(/[()[\]]/g, (c) => '\\' + c);
    assert.match(MIG, new RegExp(`revoke all on function public\\.${esc} from public, anon`, 'i'), `REVOKE mancante: ${sig}`);
    assert.match(MIG, new RegExp(`grant execute on function public\\.${esc} to authenticated`, 'i'), `GRANT mancante: ${sig}`);
  }
});

// ── O: operator isolation ─────────────────────────────────
test('O — supplier_assign_operator: operatore E campagna devono essere del fornitore', () => {
  const b = fnBody('supplier_assign_operator');
  assert.match(b, /where op\.user_id = p_operator_id and op\.supplier_id = v_uid/);
  assert.match(b, /where c\.id = p_campaign_id and c\.supplier_id = v_uid/);
  assert.match(b, /OPERATORE_NON_DEL_FORNITORE/);
  assert.match(b, /CAMPAGNA_NON_DEL_FORNITORE/);
  assert.match(MIG, /create policy operator_profiles_supplier_select on public\.operator_profiles\s+for select to authenticated using \(supplier_id = auth\.uid\(\)\)/);
});

// ── P: SupplierGuard verified gate ───────────────────────
test('P — SupplierGuard verifica role=supplier E supplier_profiles.status=verified; loading chiuso su denied/error', () => {
  assert.match(GUARD, /profile\?\.role !== 'supplier'/);
  assert.match(GUARD, /from\('supplier_profiles'\)\.select\('status'\)/);
  assert.match(GUARD, /sp\.status !== 'verified'/);
  assert.match(GUARD, /phase: 'not-verified'/);
  // nessun ramo lascia phase:'loading' appeso
  assert.doesNotMatch(GUARD, /setLoading\(false\)/); // rimpiazzato da phase-state
  assert.match(GUARD, /pending: 'Il tuo account fornitore è in attesa di verifica\.'/);
});

// ── Q: own quotes RPC ───────────────────────────────────
test('Q — supplier_list_own_quotes RPC + client', () => {
  assert.match(MIG, /function public\.supplier_list_own_quotes\(\)/);
  assert.match(fnBody('supplier_list_own_quotes'), /where q\.supplier_id = v_uid/);
  assert.match(API, /rpc\('supplier_list_own_quotes'\)/);
  assert.match(DASH, /supplierListOwnQuotes/);
});

// ── R: assigned campaigns RPC ──────────────────────────
test('R — supplier_list_assigned_campaigns RPC + client + dashboard', () => {
  assert.match(fnBody('supplier_list_assigned_campaigns'), /where c\.supplier_id = v_uid/);
  assert.match(API, /rpc\('supplier_list_assigned_campaigns'\)/);
  assert.match(DASH, /Lavori assegnati/);
});

// ── S: legacy quote compatibility ─────────────────────
test('S — quotes.supplier_id nullable FK SET NULL; quote_status nullable (legacy = NULL)', () => {
  assert.match(MIG, /alter table public\.quotes\s*\n\s*add column if not exists supplier_id uuid references public\.supplier_profiles\(id\) on delete set null/);
  assert.doesNotMatch(MIG, /quotes[\s\S]{0,120}supplier_id[\s\S]{0,40}on delete cascade/i);
  assert.match(MIG, /quote_status text\s*\n\s*check \(quote_status is null or quote_status in/);
  // trigger che rende immutabili le quote marketplace dai client diretti
  assert.match(MIG, /create trigger quotes_marketplace_guard_trg/);
});

// ── T: no secret/service_role frontend ────────────────
test('T — nessun secret/service_role nei file frontend marketplace', () => {
  for (const [name, src] of [['supplier-api', API], ['SupplierGuard', GUARD], ['SupplierDashboard', DASH], ['CustomerQuotesView', CUSTVIEW]]) {
    assert.doesNotMatch(src, /service_role|SERVICE_ROLE|SUPABASE_SERVICE|sk-[A-Za-z0-9]{16}|secret\s*[:=]/i, `${name}`);
  }
});

// ── routing ───────────────────────────────────────────
test('routing — /supplier registrato, risolto, protetto da SupplierGuard', () => {
  assert.match(RESOLVE, /p === '\/supplier'[\s\S]{0,90}return 'supplier-dashboard'/);
  assert.match(APPROUTER, /import \{ SupplierGuard \}/);
  assert.match(APPROUTER, /page === "supplier-dashboard"[\s\S]{0,120}<SupplierGuard/);
});

// ── CustomerQuotesView non montata (pre-migration) ────
test('CustomerQuotesView NON montata (nessuna regressione Cliente pre-migration)', () => {
  assert.doesNotMatch(APPROUTER, /CustomerQuotesView/);
  const custPage = read('src/pages/customer/CampaignTracking.jsx');
  assert.doesNotMatch(custPage, /CustomerQuotesView/);
});
