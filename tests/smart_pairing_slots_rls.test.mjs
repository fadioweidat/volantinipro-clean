// Phase 3B.4-S: smart_pairing_slots write lockdown.
// Static checks always run. The engine checks need a real Postgres: they load
// the table/view/trigger/policy/grant DDL verbatim from the remote baseline
// migration into an in-memory PGlite (never a remote database), then exercise
// anon / authenticated / service_role / owner before the migration, after it,
// after re-applying it, after the rollback and after re-applying it again.
// PGlite is not a repo dependency: point PGLITE_MODULE at an installed
// @electric-sql/pglite entry (e.g. <dir>/node_modules/@electric-sql/pglite/dist/index.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const BASELINE = read('supabase/migrations/20260821211000_remote_baseline.sql');
const MIGRATION = read('supabase/migrations/20261009120000_smart_pairing_slots_write_lockdown.sql');
const ROLLBACK = read('supabase/migrations/rollback/20261009120000_smart_pairing_slots_write_lockdown.rollback.sql');
const sqlOnly = s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').toLowerCase().replace(/\s+/g, ' ').trim();

test('migration is minimal: only write privileges and the ALL policy change', () => {
  const m = sqlOnly(MIGRATION);
  assert.match(m, /revoke insert, update, delete, truncate, references, trigger, maintain on table public\.smart_pairing_slots from anon, authenticated;/);
  assert.match(m, /drop policy if exists "service role all" on public\.smart_pairing_slots;/);
  assert.match(m, /create policy "smart_pairing_slots_service_role_all" on public\.smart_pairing_slots for all to service_role using \(true\) with check \(true\);/);
  assert.doesNotMatch(m, /revoke[^;]*select|grant |public read slots|available_slots_with_pairing|availability_slots|alter table|drop table|delete from|update public|truncate public|insert into|security definer/);
  assert.equal((m.match(/;/g) || []).length, 4);
});

test('rollback restores the exact baseline policy and grants, outside the migration runner', () => {
  const r = sqlOnly(ROLLBACK);
  assert.match(r, /^begin;.*commit;$/);
  assert.match(r, /create policy "service role all" on public\.smart_pairing_slots using \(true\) with check \(true\);/);
  assert.match(r, /grant insert, update, delete, truncate, references, trigger, maintain on table public\.smart_pairing_slots to anon, authenticated;/);
  assert.doesNotMatch(r, /delete from|update public|insert into|truncate public|alter table/);
  // The baseline really is the exposure being reverted to.
  assert.match(BASELINE, /CREATE POLICY "Service role all" ON "public"\."smart_pairing_slots" USING \(true\) WITH CHECK \(true\);/);
  assert.match(BASELINE, /GRANT ALL ON TABLE "public"\."smart_pairing_slots" TO "anon";/);
});

// ---------------------------------------------------------------------------
// Real-engine checks
// ---------------------------------------------------------------------------
function splitStatements(sql) {
  const out = []; let cur = ''; let inDollar = false;
  for (const line of sql.split('\n')) {
    if (!inDollar && line.trim().startsWith('--')) continue;
    cur += line + '\n';
    if ((line.match(/\$\$/g) || []).length % 2 === 1) inDollar = !inDollar;
    if (!inDollar && /;\s*$/.test(line)) { out.push(cur.trim()); cur = ''; }
  }
  return out;
}
const TARGETS = [/"smart_pairing_slots"/, /"availability_slots"/, /"available_slots_with_pairing"/, /"update_sp_slots_updated_at"/];
const baselineFixture = () => splitStatements(BASELINE).filter(s => TARGETS.some(t => t.test(s)));

let PGlite = null;
try {
  const mod = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
  PGlite = mod.PGlite;
} catch { /* engine checks skipped below */ }
const engine = { skip: PGlite ? false : 'PGlite not available (set PGLITE_MODULE)' };

const ROLES = ['anon', 'authenticated', 'service_role', 'postgres'];
const OPS = {
  select: `select count(*)::int as n from public.smart_pairing_slots`,
  legacy_select: `select count(*)::int as n from (select id from public.smart_pairing_slots where stato = 'attiva') s`,
  view_select: `select count(*)::int as n from public.available_slots_with_pairing`,
  insert: `with i as (insert into public.smart_pairing_slots (data, zona) values ('2026-12-01', 'probe') returning 1) select count(*)::int as n from i`,
  update: `with u as (update public.smart_pairing_slots set note = 'probe' returning 1) select count(*)::int as n from u`,
  delete: `with d as (delete from public.smart_pairing_slots returning 1) select count(*)::int as n from d`,
  truncate: `truncate public.smart_pairing_slots`,
};

async function newDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role authenticator noinherit login; grant anon, authenticated, service_role to authenticator;`);
  const fixture = baselineFixture();
  for (const stmt of fixture) await db.exec(stmt);
  // Synthetic rows only (no production data): 36 active slots like Production.
  await db.exec(`insert into public.smart_pairing_slots (id, data, zona, raggio_km, stato, posti_disponibili, posti_occupati, created_at, updated_at)
    select md5('slot'||g)::uuid, date '2026-04-21' + g * 2, 'zona-test-'||(g % 6), 2.0, 'attiva', 3, g % 3, timestamptz '2026-04-01', timestamptz '2026-04-01'
    from generate_series(1, 36) g;
    insert into public.availability_slots (id, service_type, city, slot_date, status)
    select md5('avail'||g)::uuid, 'd2d', 'zona-test-'||(g % 6), date '2026-04-21' + g * 2, 'available' from generate_series(1, 20) g;`);
  return { db, fixture };
}

async function attempt(db, role, op) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    const res = await db.query(OPS[op]);
    return op === 'truncate' ? 'ok' : `ok:${res.rows[0].n}`;
  } catch (e) {
    return `denied:${e.code}`;
  } finally {
    await db.exec('rollback'); // every probe is rolled back: no write persists
  }
}
async function matrix(db) {
  const m = {};
  for (const role of ROLES) { m[role] = {}; for (const op of Object.keys(OPS)) m[role][op] = await attempt(db, role, op); }
  return m;
}
const checksum = async db => (await db.query(`select md5(coalesce(string_agg(row_to_json(s)::text, '|' order by id), '')) as h, count(*)::int as n from public.smart_pairing_slots s`)).rows[0];
const policies = async db => (await db.query(`select policyname, permissive, roles::text[] as roles, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'smart_pairing_slots' order by policyname`)).rows;
const acl = async db => (await db.query(`select relacl::text as acl from pg_class where oid = 'public.smart_pairing_slots'::regclass`)).rows[0].acl;
const otherObjects = async db => (await db.query(`select
    (select relacl::text from pg_class where oid = 'public.available_slots_with_pairing'::regclass) as view_acl,
    (select relacl::text from pg_class where oid = 'public.availability_slots'::regclass) as avail_acl,
    (select json_agg(policyname order by policyname)::text from pg_policies where tablename = 'availability_slots') as avail_policies,
    (select count(*)::int from pg_trigger where tgrelid = 'public.smart_pairing_slots'::regclass and not tgisinternal) as triggers,
    (select count(*)::int from pg_indexes where tablename = 'smart_pairing_slots') as indexes,
    (select relrowsecurity from pg_class where oid = 'public.smart_pairing_slots'::regclass) as rls`)).rows[0];

const BEFORE = {
  anon:          { select: 'ok:36', legacy_select: 'ok:36', view_select: 'ok:20', insert: 'ok:1', update: 'ok:36', delete: 'ok:36', truncate: 'ok' },
  authenticated: { select: 'ok:36', legacy_select: 'ok:36', view_select: 'ok:20', insert: 'ok:1', update: 'ok:36', delete: 'ok:36', truncate: 'ok' },
  service_role:  { select: 'ok:36', legacy_select: 'ok:36', view_select: 'ok:20', insert: 'ok:1', update: 'ok:36', delete: 'ok:36', truncate: 'ok' },
  postgres:      { select: 'ok:36', legacy_select: 'ok:36', view_select: 'ok:20', insert: 'ok:1', update: 'ok:36', delete: 'ok:36', truncate: 'ok' },
};
const LOCKED = { select: 'ok:36', legacy_select: 'ok:36', view_select: 'ok:20', insert: 'denied:42501', update: 'denied:42501', delete: 'denied:42501', truncate: 'denied:42501' };
const AFTER = { ...BEFORE, anon: LOCKED, authenticated: LOCKED };

test('engine: baseline fixture mirrors the remote catalog and reproduces the exposure', engine, async () => {
  const { db, fixture } = await newDb();
  assert.ok(fixture.length >= 15, `fixture statements: ${fixture.length}`);
  assert.deepEqual((await policies(db)).map(p => [p.policyname, p.cmd, p.roles.join(','), p.qual, p.with_check]), [
    ['Public read slots', 'SELECT', 'public', 'true', null],
    ['Service role all', 'ALL', 'public', 'true', 'true'],
  ]);
  assert.match(await acl(db), /anon=arwdDxtm\/postgres/);
  assert.deepEqual(await matrix(db), BEFORE);
  await db.close();
});

test('engine: migration blocks anon/authenticated writes, keeps reads and backend writes, data unchanged', engine, async () => {
  const { db } = await newDb();
  const before = await checksum(db); const others = await otherObjects(db);
  await db.exec(MIGRATION);
  assert.deepEqual(await matrix(db), AFTER);
  assert.deepEqual(await checksum(db), before);
  assert.equal(before.n, 36);
  assert.deepEqual(await otherObjects(db), others, 'view, availability_slots, triggers, indexes and RLS flag untouched');
  assert.deepEqual((await policies(db)).map(p => [p.policyname, p.cmd, p.roles.join(','), p.qual, p.with_check]), [
    ['Public read slots', 'SELECT', 'public', 'true', null],
    ['smart_pairing_slots_service_role_all', 'ALL', 'service_role', 'true', 'true'],
  ]);
  const a = await acl(db);
  assert.match(a, /anon=r\/postgres/); assert.match(a, /authenticated=r\/postgres/); assert.match(a, /service_role=arwdDxtm\/postgres/);
  // Column-level privileges also gone (information_schema derives them from the table ACL).
  const cols = (await db.query(`select count(*)::int as n from information_schema.column_privileges where table_name = 'smart_pairing_slots' and grantee in ('anon','authenticated') and privilege_type <> 'SELECT'`)).rows[0].n;
  assert.equal(cols, 0);
  // Through the PostgREST login role too.
  await db.exec('begin'); await db.exec('set local role authenticator'); await db.exec('set local role anon');
  await assert.rejects(db.query(`insert into public.smart_pairing_slots (data, zona) values ('2026-12-02','x')`), e => e.code === '42501');
  await db.exec('rollback');
  // service_role writes really persist and the updated_at trigger still fires.
  await db.exec(`set role service_role; update public.smart_pairing_slots set posti_occupati = posti_occupati where id = md5('slot1')::uuid; reset role;`);
  const row = (await db.query(`select updated_at > timestamptz '2026-04-01' as touched from public.smart_pairing_slots where id = md5('slot1')::uuid`)).rows[0];
  assert.equal(row.touched, true);
  await db.close();
});

test('engine: migration is idempotent', engine, async () => {
  const { db } = await newDb();
  const before = await checksum(db);
  await db.exec(MIGRATION); await db.exec(MIGRATION);
  assert.deepEqual(await matrix(db), AFTER);
  assert.deepEqual(await checksum(db), before);
  assert.equal((await policies(db)).length, 2);
  await db.close();
});

test('engine: rollback restores the exact baseline state; re-applying locks again; data unchanged', engine, async () => {
  const { db } = await newDb();
  const basePolicies = await policies(db); const baseAcl = await acl(db); const before = await checksum(db);
  await db.exec(MIGRATION);
  await db.exec(ROLLBACK);
  assert.deepEqual(await policies(db), basePolicies);
  assert.equal(await acl(db), baseAcl);
  assert.deepEqual(await matrix(db), BEFORE);
  assert.deepEqual(await checksum(db), before);
  await db.exec(MIGRATION);
  assert.deepEqual(await matrix(db), AFTER);
  assert.deepEqual(await checksum(db), before);
  await db.close();
});

test('engine: a failing migration leaves no partial state (atomic in a transaction)', engine, async () => {
  const { db } = await newDb();
  const basePolicies = await policies(db); const baseAcl = await acl(db);
  await db.exec('begin');
  await db.exec(MIGRATION);
  await assert.rejects(db.exec('select 1/0'));
  await db.exec('rollback');
  assert.deepEqual(await policies(db), basePolicies);
  assert.equal(await acl(db), baseAcl);
  assert.deepEqual(await matrix(db), BEFORE);
  await db.close();
});
