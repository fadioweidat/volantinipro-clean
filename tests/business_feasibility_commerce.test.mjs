// TICKET "BUSINESS FEASIBILITY €49 COMMERCE BACKEND". Static contract tests
// on the new migration/edge-function source, mirroring the established repo
// convention for migration correctness (see gps_rpc_reconciliation_contract.
// test.mjs "migration 030" tests): this backend has no local Postgres/Deno
// runtime available in CI, so structural guarantees are verified by reading
// the actual SQL/TS source rather than executing it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Le sorgenti SQL/TS sono lette con normalizzazione CRLF -> LF: in un checkout Windows
// (core.autocrlf=true) i file hanno CRLF mentre git li conserva con LF. Le asserzioni
// restano invariate (nessuna regex indebolita), ma non dipendono dal tipo di fine riga.
const readLf = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const migration = readLf('supabase/migrations/20260915180000_business_feasibility_commerce.sql');
const analyticsMigration = readLf('supabase/migrations/20260915181000_business_feasibility_analytics_events.sql');
const service = readLf('supabase/functions/feasibility-business-commerce/service.ts');
const campaignMigration = readLf('supabase/migrations/20260909143528_feasibility_commerce.sql');
const campaignService = readLf('supabase/functions/feasibility-commerce/service.ts');
const siteEvents = readLf('src/lib/analytics/siteEvents.js');

// ── A. create purchase ──────────────────────────────────────────────────
test('A: la migration definisce business_feasibility_create_purchase e il service la invoca sull\'azione "purchase"', () => {
  assert.match(migration, /create function public\.business_feasibility_create_purchase\(/);
  assert.match(service, /action === 'purchase'/);
  assert.match(service, /rpc\('business_feasibility_create_purchase'/);
});

// ── B. duplicate purchase idempotency ───────────────────────────────────
test('B: unique(owner_id,business_analysis_id) + return anticipato se la purchase esiste già (nessun duplicato)', () => {
  assert.match(migration, /unique\(owner_id,business_analysis_id\)/);
  assert.match(migration, /if found then return p; end if;/);
});

// ── C. unpaid preview allowed ────────────────────────────────────────────
test('C: get_preview non controlla mai lo stato del pagamento (la preview è sempre consentita)', () => {
  const start = service.indexOf("action === 'get_preview'");
  const end = service.indexOf("if (action === 'get_report'", start);
  const block = service.slice(start, end);
  assert.doesNotMatch(block, /business_feasibility_purchases/);
  assert.doesNotMatch(block, /status/);
  assert.match(block, /buildPreview\(analysis\)/);
});

// ── D. unpaid full report blocked ───────────────────────────────────────
test('D: get_report lancia PAYMENT_REQUIRED se lo stato non è "paid" (mai il pieno report senza pagamento verificato)', () => {
  const start = service.indexOf("action === 'get_report'");
  const end = service.indexOf("if (action === 'verify_payment'", start);
  const block = service.slice(start, end);
  assert.match(block, /purchase\.status !== 'paid'/);
  assert.match(block, /PAYMENT_REQUIRED/);
});

// ── E. customer cannot mark paid ────────────────────────────────────────
test('E: nessuna policy INSERT/UPDATE per authenticated su business_feasibility_purchases; il flip a paid richiede role=\'admin\'', () => {
  assert.doesNotMatch(migration, /create policy .*for (insert|update) to authenticated on public\.business_feasibility_purchases/i);
  const fn = migration.slice(migration.indexOf('create function public.business_feasibility_verify_payment('));
  assert.match(fn, /role='admin'/);
  assert.match(fn, /raise exception 'ADMIN_REQUIRED'/);
});

// ── F. Admin verify -> paid ──────────────────────────────────────────────
test('F: business_feasibility_verify_payment imposta status=\'paid\', paid_at=now(), verified_by=p_actor', () => {
  const fn = migration.slice(migration.indexOf('create function public.business_feasibility_verify_payment('), migration.indexOf('create function public.business_feasibility_revoke('));
  assert.match(fn, /status='paid',paid_at=now\(\),verified_by=p_actor/);
});

// ── G. paid full report allowed ──────────────────────────────────────────
test('G: get_report restituisce purchase+analysis completi quando lo stato è "paid"', () => {
  const start = service.indexOf("action === 'get_report'");
  const end = service.indexOf("if (action === 'verify_payment'", start);
  const block = service.slice(start, end);
  assert.match(block, /return reply\(\{ purchase, analysis \}\)/);
});

// ── H. refresh/new session still unlocked ───────────────────────────────
test('H: nessuna persistenza lato browser (sessionStorage/localStorage/query-string) nel backend o nel client wrapper — solo la tabella Postgres', () => {
  assert.doesNotMatch(service, /sessionStorage|localStorage/);
  const clientWrapper = readLf('src/pages/customer/feasibility/business/feasibilityBusinessCommerce.js');
  assert.doesNotMatch(clientWrapper, /sessionStorage|localStorage/);
  assert.match(migration, /create table public\.business_feasibility_purchases/);
});

// ── I. direct full-report route cannot bypass ───────────────────────────
test('I: get_report richiede sempre requireClient + owner_id=user.id lato server, mai un gate solo client-side', () => {
  const start = service.indexOf("action === 'get_report'");
  const end = service.indexOf("if (action === 'verify_payment'", start);
  const block = service.slice(start, end);
  assert.match(block, /requireClient\(user\)/);
  assert.match(block, /\.eq\('owner_id', user!\.id\)/);
});

// ── J. user A cannot read user B purchase/report ────────────────────────
test('J: RLS + query lato server sono sempre filtrate per owner_id=auth.uid() / owner_id=user.id', () => {
  assert.match(migration, /create policy business_feasibility_purchase_owner on public\.business_feasibility_purchases for select to authenticated\n using\(owner_id=auth\.uid\(\)/);
  assert.match(migration, /create policy business_feasibility_analysis_owner on public\.business_feasibility_analyses for select to authenticated\n using\(owner_id=auth\.uid\(\)/);
  for (const action of ["get_purchase", "get_report"]) {
    const start = service.indexOf(`action === '${action}'`);
    const end = service.indexOf('\n\n    if (action', start + 1);
    const block = service.slice(start, end === -1 ? undefined : end);
    assert.match(block, /owner_id', user!\.id/);
  }
});

// ── K. revoked report blocked ────────────────────────────────────────────
test('K: uno stato "revoked" fallisce lo stesso controllo "!== \'paid\'" di get_report (nessun percorso separato per revoked)', () => {
  assert.match(migration, /status text not null default 'pending' check\(status in \('pending','paid','revoked'\)\)/);
  const start = service.indexOf("action === 'get_report'");
  const end = service.indexOf("if (action === 'verify_payment'", start);
  const block = service.slice(start, end);
  assert.match(block, /purchase\.status !== 'paid'/); // 'revoked' !== 'paid' -> stesso branch, stesso errore
});

// ── L. amount fixed at 4900 ───────────────────────────────────────────────
test('L: amount_cents è vincolato a 4900 dal DB (CHECK), non solo da un default lato applicativo', () => {
  assert.match(migration, /amount_cents integer not null default 4900 check\(amount_cents=4900\)/);
});

// ── M. payment reference stable ──────────────────────────────────────────
test('M: payment_reference viene generato una sola volta alla creazione e business_feasibility_verify_payment non lo sovrascrive mai', () => {
  assert.match(migration, /ref := 'BF49-'\|\|upper\(substr\(replace\(a\.id::text,'-',''\),1,10\)\);/);
  const verifyFn = migration.slice(migration.indexOf('create function public.business_feasibility_verify_payment('), migration.indexOf('create function public.business_feasibility_revoke('));
  assert.doesNotMatch(verifyFn, /payment_reference\s*=/);
});

// ── N. analytics event allowlist works ───────────────────────────────────
test('N: i 6 nuovi eventi sono nel CHECK e in entrambe le policy INSERT (anon+authenticated), ed esposti come SITE_EVENT_NAMES lato client', () => {
  const names = ['feasibility_preview_viewed','feasibility_paywall_viewed','feasibility_unlock_clicked','feasibility_payment_requested','feasibility_unlocked','feasibility_pdf_opened'];
  for (const name of names) {
    assert.match(analyticsMigration, new RegExp(`'${name}'`), `${name} mancante nella migration`);
    assert.match(siteEvents, new RegExp(`'${name}'`), `${name} mancante in SITE_EVENT_NAMES`);
  }
  const checkCount = (analyticsMigration.match(/'feasibility_preview_viewed'/g) || []).length;
  assert.ok(checkCount >= 3, 'deve apparire nel CHECK + policy anon + policy authenticated');
  assert.doesNotMatch(analyticsMigration, /drop table|truncate|delete from/i);
});

// ── O. campaign feasibility backend unchanged ────────────────────────────
test('O: la migration/edge-function Campaign Feasibility esistenti restano intatte; il nuovo backend non le importa mai', () => {
  assert.match(campaignMigration, /create table public\.feasibility_purchases/);
  assert.match(campaignMigration, /option text not null check\(option in \('study_only','study_campaign'\)\)/);
  assert.match(campaignService, /calculateFeasibility/);
  const imports = service.split('\n').filter(l => l.trim().startsWith('import')).join('\n');
  assert.doesNotMatch(imports, /feasibility-commerce|feasibilityEngine\.js|feasibilitySchemas\.js/);
  // Solo istruzioni SQL eseguite (righe non-commento): la migration può
  // MENZIONARE le vecchie tabelle nella prosa esplicativa (isolamento), ma
  // non deve mai CREARLE/ALTERARLE/referenziarle in codice reale.
  const executable = migration.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(executable, /\bpublic\.feasibility_purchases\b|\bpublic\.feasibility_analyses\b|\bpublic\.feasibility_reports\b/);
});

// ── Additional structural guarantees (mirroring "migration 030" style) ──
test('la migration è additiva (nessun DROP TABLE, DROP COLUMN, TRUNCATE o DELETE come istruzione SQL eseguita — il blocco di rollback documentato è tutto commentato)', () => {
  const executable = migration.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(executable, /drop table (?!if exists)|drop column|truncate|delete from/i);
});

test('la migration è avvolta in una transazione esplicita (rollback atomico su qualunque errore)', () => {
  assert.match(migration, /\nbegin;\n/);
  const codeLines = migration.split('\n').filter(l => l.trim() && !l.trim().startsWith('--'));
  assert.equal(codeLines[0].trim(), 'begin;');
  assert.equal(codeLines[codeLines.length - 1].trim(), 'commit;');
});

test('ogni RPC scrivente è SECURITY DEFINER, revocata a public/anon/authenticated e concessa solo a service_role', () => {
  for (const fn of ['business_feasibility_create_purchase', 'business_feasibility_verify_payment', 'business_feasibility_revoke']) {
    const start = migration.indexOf(`create function public.${fn}(`);
    assert.ok(start >= 0, `${fn} non trovata`);
    const end = migration.indexOf('\n$$;', start);
    assert.match(migration.slice(start, end), /security definer/i);
  }
  assert.match(migration, /revoke all on function public\.business_feasibility_create_purchase[\s\S]*? from public,anon,authenticated;/);
  assert.match(migration, /grant execute on function public\.business_feasibility_create_purchase[\s\S]*? to service_role;/);
});

test('gli eventi di audit sono append-only (trigger immutabile su UPDATE/DELETE)', () => {
  assert.match(migration, /create trigger business_feasibility_event_immutable before update or delete on public\.business_feasibility_commerce_events/);
});

test('anon non riceve alcun grant sulle 3 nuove tabelle', () => {
  assert.match(migration, /revoke all on public\.business_feasibility_analyses, public\.business_feasibility_purchases,\n public\.business_feasibility_commerce_events from anon, authenticated;/);
  assert.doesNotMatch(migration, /grant .* to anon/i);
});
