// Contract tests for the NOT-YET-APPLIED migration
// supabase/migrations/20260905160000_smart_pairing_admin_rls.sql and its
// coupling with src/lib/services/admin-api.js. Static-source assertions only —
// nothing is run against a database.
//
// Decision B (APPLY AFTER SMALL MODIFICATION): the migration must, when applied,
//  1. add `status` (6-state canonical) + `admin_notes`
//  2. keep `gestita` as the DERIVED terminal-state boolean
//  3. backfill historical `gestita = true` rows off the DEFAULT
//  4. keep `admin_notes` internal-only
//  5. restore the public INSERT table privilege for anon/authenticated
//  6. add an Admin RLS policy gated by public.jwt_is_admin()
//  7. keep the 10-minute email+comune+servizio dedupe, not blocking after a
//     terminal/closed request, not surfacing a duplicate as a client error
//  8. touch nothing else (no DROP TABLE/COLUMN, TRUNCATE, DELETE, auth, or
//     service_role grants)

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const MIG = readFileSync(
  new URL('../supabase/migrations/20260905160000_smart_pairing_admin_rls.sql', import.meta.url),
  'utf8',
);
const ADMIN_API = readFileSync(new URL('../src/lib/services/admin-api.js', import.meta.url), 'utf8');
const ADMIN_UI = readFileSync(new URL('../src/pages/admin/SmartPairingWaitlist.jsx', import.meta.url), 'utf8');

// EXECUTABLE SQL only: strip `--` line comments so prose (which legitimately
// mentions words like "truncate"/"delete"/"drop") never trips the safety regexes.
const migCode = MIG.replace(/--.*$/gm, '');
// normalize whitespace + case for tolerant matching against the code
const migFlat = migCode.replace(/\s+/g, ' ').toLowerCase().trim();

const TERMINAL = ['accepted', 'rejected', 'closed'];
const NON_TERMINAL = ['open', 'reviewing', 'proposal_sent'];
const ALL_STATES = [...NON_TERMINAL, ...TERMINAL];

test('1. migration adds the status column', () => {
  assert.match(migFlat, /add column if not exists "?status"?\s+text/);
});

test('2. status DEFAULT is "open" for new rows and no new lifecycle states are invented', () => {
  assert.match(migFlat, /add column if not exists "?status"?\s+text\s+default\s+'open'/);
  // the canonical 6 states, exactly those already used by the shipped Admin UI
  for (const s of ALL_STATES) {
    assert.ok(ADMIN_UI.includes(`"${s}"`) || ADMIN_UI.includes(`'${s}'`) || ADMIN_UI.includes(`value="${s}"`),
      `Admin UI must already know state "${s}"`);
  }
  // migration doc lists exactly the 6 canonical states, nothing else
  assert.match(MIG, /open \| reviewing \| proposal_sent \| accepted \| rejected \| closed/);
  assert.doesNotMatch(migFlat, /'matched'|'notified'|'contacted'|'converted'|'pending'/);
});

test('3. historical backfill: gestita = true rows get the terminal status "closed"', () => {
  assert.match(
    migFlat,
    /update public\.smart_pairing_waitlist set status = 'closed' where gestita = true and coalesce\(status, 'open'\) = 'open'/,
  );
  // backfill lives only inside the migration (single UPDATE, no standalone script)
  assert.equal((MIG.match(/update public\.smart_pairing_waitlist/gi) || []).length >= 1, true);
});

test('4. admin-api.js keeps the deterministic status -> gestita mapping', () => {
  // terminal set is exactly {accepted, rejected, closed}
  assert.match(
    ADMIN_API,
    /\[\s*'accepted',\s*'rejected',\s*'closed'\s*\]\.includes\(newStatus\)\s*\|\|\s*patch\.gestita === true/,
  );
  // gestita is written as the derived boolean on every admin update
  assert.match(ADMIN_API, /gestita:\s*isClosed/);
  assert.match(ADMIN_API, /gestita_at:\s*isClosed\s*\?/);
  // gestita is NOT removed / model not replaced
  assert.doesNotMatch(migFlat, /drop column[^;]*gestita/);
});

test('4b. terminal -> gestita true, non-terminal -> gestita false (pure re-check of the code rule)', () => {
  const isClosed = (newStatus, gestita) =>
    ['accepted', 'rejected', 'closed'].includes(newStatus) || gestita === true;
  for (const s of TERMINAL) assert.equal(isClosed(s, false), true, `${s} must be terminal`);
  for (const s of NON_TERMINAL) assert.equal(isClosed(s, false), false, `${s} must be non-terminal`);
});

test('5. admin_notes column kept, documented as internal, not customer-facing', () => {
  assert.match(migFlat, /add column if not exists "?admin_notes"?\s+text/);
  assert.match(MIG, /comment on column public\.smart_pairing_waitlist\.admin_notes is/i);
  assert.match(MIG, /riservate al workflow Admin, mai customer-facing/i);
  // no new UI wiring for admin_notes in this change
  assert.ok(!ADMIN_UI.includes('admin_notes') && !ADMIN_UI.includes('adminNotes'),
    'Admin UI must not be wired to admin_notes in this task');
});

test('6. public INSERT privilege restored for anon + authenticated only', () => {
  assert.match(migFlat, /grant insert on table public\.smart_pairing_waitlist to anon, authenticated/);
});

test('6b. NO broad public SELECT / UPDATE / DELETE grant is introduced', () => {
  assert.doesNotMatch(migFlat, /grant select[^;]*to[^;]*anon/);
  assert.doesNotMatch(migFlat, /grant update[^;]*to[^;]*anon/);
  assert.doesNotMatch(migFlat, /grant delete[^;]*to[^;]*anon/);
  assert.doesNotMatch(migFlat, /grant all[^;]*to[^;]*anon/);
  // the only GRANT in the file is the INSERT one above
  const grants = migFlat.match(/grant [a-z ]+ on table public\.smart_pairing_waitlist to [a-z, ]+/g) || [];
  assert.deepEqual(grants, ['grant insert on table public.smart_pairing_waitlist to anon, authenticated']);
});

test('7. Admin RLS policy uses the current jwt_is_admin() model', () => {
  assert.match(migFlat, /create policy "smart_pairing_waitlist_admin_all"/);
  assert.match(migFlat, /for all\s+to authenticated/);
  assert.match(migFlat, /using \(public\.jwt_is_admin\(\)\)/);
  assert.match(migFlat, /with check \(public\.jwt_is_admin\(\)\)/);
  // no hardcoded email, no service_role, no open authenticated access
  assert.doesNotMatch(migFlat, /auth\.email|auth\.jwt\(\) ->> 'email'|'fenice\.sp@gmail\.com'/);
  assert.doesNotMatch(migFlat, /to service_role/);
  assert.doesNotMatch(migFlat, /using \(true\)|with check \(true\)/);
});

test('8. Admin policy has BOTH USING and WITH CHECK (covers SELECT/UPDATE/DELETE and INSERT/UPDATE)', () => {
  const idx = migFlat.indexOf('create policy "smart_pairing_waitlist_admin_all"');
  const block = migFlat.slice(idx, idx + 400);
  assert.ok(block.includes('using (public.jwt_is_admin())'), 'USING present');
  assert.ok(block.includes('with check (public.jwt_is_admin())'), 'WITH CHECK present');
});

test('9. dedupe key is exactly email + comune + servizio', () => {
  assert.match(migFlat, /lower\(email\) = lower\(new\.email\)/);
  assert.match(migFlat, /lower\(coalesce\(comune, ''\)\) = lower\(coalesce\(new\.comune, ''\)\)/);
  assert.match(migFlat, /lower\(coalesce\(servizio, 'd2d'\)\) = lower\(coalesce\(new\.servizio, 'd2d'\)\)/);
  // not keyed on phone / whatsapp / cliente_id / user id
  const idx = migFlat.indexOf('create or replace function public.trg_smart_pairing_waitlist_dedupe');
  const fn = migFlat.slice(idx, idx + 1400);
  const whereIdx = fn.indexOf('where lower(email)');
  const whereClause = fn.slice(whereIdx, fn.indexOf('order by'));
  assert.ok(!/whatsapp|cliente_id|user_id|auth\.uid/.test(whereClause), 'dedupe key must not use phone/cliente_id/uid');
});

test('10. dedupe window is 10 minutes', () => {
  assert.match(migFlat, /created_at >= \(now\(\) - interval '10 minutes'\)/);
});

test('11. a terminal/closed request does NOT suppress a new submission', () => {
  // guard requires the prior row to be BOTH non-terminal AND gestita = false
  assert.match(
    migFlat,
    /coalesce\(status, 'open'\) not in \('accepted', 'rejected', 'closed'\)\s+and gestita = false/,
  );
});

test('11b. dedupe suppression keeps the client-success contract (RETURN NULL, no error path)', () => {
  const idx = migFlat.indexOf('if v_existing_id is not null then');
  const branch = migFlat.slice(idx, idx + 400);
  assert.ok(branch.includes('return null;'), 'duplicate path returns NULL (row suppressed, insert still HTTP 2xx)');
  assert.ok(!/raise exception|raise error/.test(branch), 'duplicate must NOT raise -> never a client-visible error');
});

test('12. BEFORE INSERT row-level trigger is (re)created deterministically', () => {
  assert.match(migFlat, /drop trigger if exists trg_smart_pairing_waitlist_dedupe on public\.smart_pairing_waitlist/);
  assert.match(migFlat, /create trigger trg_smart_pairing_waitlist_dedupe\s+before insert on public\.smart_pairing_waitlist\s+for each row/);
});

test('SAFETY: migration contains no destructive / unrelated statements', () => {
  assert.doesNotMatch(migFlat, /drop table/);
  assert.doesNotMatch(migFlat, /drop column/);
  assert.doesNotMatch(migFlat, /truncate/);
  assert.doesNotMatch(migFlat, /delete from/);
  assert.doesNotMatch(migFlat, /alter .*auth\.|drop .*auth\.|grant .* on .*auth\./);
  assert.doesNotMatch(migFlat, /to service_role/);
  // DROP is only the paired trigger drop-before-recreate
  const drops = migFlat.match(/drop [a-z ]+ if exists [a-z_.]+/g) || [];
  assert.deepEqual(drops, ['drop trigger if exists trg_smart_pairing_waitlist_dedupe']);
});

test('SAFETY: SECURITY DEFINER dedupe function pins search_path', () => {
  assert.match(migFlat, /security definer\s+set search_path = pg_catalog, public/);
});
