// Phase 3B.4-V: campaign_summary anonymous/cross-customer read leak.
// Static checks always run. Engine checks rebuild, in an in-memory PGlite, the
// Production catalog of campaigns/profiles/quotes/supplier_profiles/clienti
// (tests/fixtures/campaigns_security_catalog.json, 3B.4-D6) plus
// campaign_analysis and the exact campaign_summary definition, owner and ACL
// (tests/fixtures/campaign_summary_catalog.json). Read-only catalog exports,
// schema only, no row data. Never touches a remote database.
// Set PGLITE_MODULE to an installed @electric-sql/pglite dist/index.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Normalise line endings: Windows checkouts (core.autocrlf) turn the LF blobs into CRLF.
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = read('supabase/migrations/20261009170000_campaign_summary_security_invoker.sql');
const ROLLBACK = read('supabase/migrations/rollback/20261009170000_campaign_summary_security_invoker.rollback.sql');
const D6 = read('supabase/migrations/20261009150000_campaigns_owner_write_lockdown.sql');
const APPLY = read('docs/release/3b4v-apply-campaign-summary.sql');
const VERIFY = read('docs/release/3b4v-verify-campaign-summary.sql');
const BASE = JSON.parse(read('tests/fixtures/campaigns_security_catalog.json'));
const CS = JSON.parse(read('tests/fixtures/campaign_summary_catalog.json'));
const sqlOnly = s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').toLowerCase().replace(/\s+/g, ' ').trim();

test('migration is minimal: security_invoker + two revokes, nothing else', () => {
  const m = sqlOnly(MIGRATION);
  assert.equal(m, 'alter view public.campaign_summary set (security_invoker = true); revoke all on table public.campaign_summary from anon; revoke insert, update, delete, truncate, references, trigger, maintain on table public.campaign_summary from authenticated;');
});

test('rollback restores the exact Production options and ACL in one transaction', () => {
  const r = sqlOnly(ROLLBACK);
  assert.equal(CS.view.options, null);
  assert.equal(CS.view.acl, '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}');
  assert.equal(r, 'begin; alter view public.campaign_summary reset (security_invoker); revoke all on table public.campaign_summary from anon, authenticated, service_role; grant insert, select, update, delete, truncate, references, trigger, maintain on table public.campaign_summary to anon; grant insert, select, update, delete, truncate, references, trigger, maintain on table public.campaign_summary to authenticated; grant insert, select, update, delete, truncate, references, trigger, maintain on table public.campaign_summary to service_role; commit;');
});

test('release: apply script embeds the migration verbatim and pins the audited view definition', () => {
  const block = APPLY.split('BEGIN 20261009170000')[1].split('===== END migration')[0];
  assert.equal(sqlOnly(block.split('\n').slice(1).join('\n')), sqlOnly(MIGRATION));
  assert.equal((APPLY.match(/ab3f147ae7ef5ece7555debe9afde189/g) || []).length, 2);
});

// ---------------------------------------------------------------------------
let PGlite = null;
try {
  const mod = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
  PGlite = mod.PGlite;
} catch { /* engine checks skipped */ }
const engine = { skip: PGlite ? false : 'PGlite not available (set PGLITE_MODULE)' };

const ACL_LETTERS = { a: 'insert', r: 'select', w: 'update', d: 'delete', D: 'truncate', x: 'references', t: 'trigger', m: 'maintain' };
const U = { admin: '00000000-0000-4000-8000-0000000000a1', custA: '00000000-0000-4000-8000-0000000000c1', custB: '00000000-0000-4000-8000-0000000000c2', supplier: '00000000-0000-4000-8000-000000000051' };
const EMAIL = { admin: 'allowlisted-admin@example.test', custA: 'cust-a@example.test', custB: 'cust-b@example.test', supplier: 'supplier@example.test' };
const NOT_LOADED = /^public\.(admin_create_operator_assignment|admin_hard_delete_campaign)\(/;

function applyAcl(rel, acl) {
  const out = [`revoke all on ${rel} from anon, authenticated, service_role;`];
  for (const entry of acl.replace(/[{}]/g, '').split(',')) {
    const [grantee, rest] = entry.split('='); const privs = rest.split('/')[0];
    if (grantee && grantee !== 'postgres' && privs) out.push(`grant ${[...privs].map(ch => ACL_LETTERS[ch]).join(', ')} on ${rel} to ${grantee};`);
  }
  return out.join('\n');
}

async function buildDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role authenticator noinherit login; grant anon, authenticated, service_role to authenticator;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(auth.jwt() ->> 'role', '') $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text, idempotency_key text, rollback text[]);
    set check_function_bodies = off;`);
  const tables = [...BASE.tables, ...CS.tables];
  const order = ['profiles', 'clienti', 'supplier_profiles', 'campaigns', 'quotes', 'campaign_admin_action_log', 'campaign_analysis'];
  const byName = Object.fromEntries(tables.map(t => [t.rel, t]));
  for (const name of order) {
    const t = byName[name];
    const cols = t.cols.map(c => `"${c.n}" ${c.t}${c.d ? ` default ${c.d}` : ''}${c.nn ? ' not null' : ''}`);
    const cons = (t.cons || []).filter(k => k.type !== 'f').map(k => `constraint "${k.n}" ${k.def}`);
    await db.exec(`create table public.${name} (${[...cols, ...cons].join(', ')});`);
  }
  // campaign_analysis.zone_id -> campaign_zones is not part of the fixture (irrelevant to RLS).
  for (const name of order) for (const k of (byName[name].cons || []).filter(k => k.type === 'f' && k.ref !== 'campaign_zones')) await db.exec(`alter table public.${name} add constraint "${k.n}" ${k.def};`);
  for (const def of Object.values(BASE.functions)) if (!NOT_LOADED.test(def.match(/FUNCTION (\S+?\()/)?.[1] || '')) await db.exec(def);
  for (const name of order) {
    const t = byName[name];
    if (t.rls) await db.exec(`alter table public.${name} enable row level security;`);
    await db.exec(applyAcl(`public.${name}`, t.acl));
    for (const p of t.policies || []) await db.exec(`create policy "${p.n}" on public.${name} as ${p.perm.toLowerCase()} for ${p.cmd.toLowerCase()} to ${p.roles.join(', ')}${p.using ? ` using (${p.using})` : ''}${p.check ? ` with check (${p.check})` : ''};`);
    for (const trg of t.triggers || []) await db.exec(trg + ';');
  }
  await db.exec(`create view public.campaign_summary as ${CS.view.def}`);
  await db.exec(applyAcl('public.campaign_summary', CS.view.acl));
  await db.exec(`
    insert into auth.users values ('${U.admin}','${EMAIL.admin}',now()),('${U.custA}','${EMAIL.custA}',now()),('${U.custB}','${EMAIL.custB}',now()),('${U.supplier}','${EMAIL.supplier}',now());
    insert into public.profiles (id, role) values ('${U.admin}','admin'),('${U.custA}','client'),('${U.custB}','client'),('${U.supplier}','supplier');
    insert into public.supplier_profiles (id, company_name, status) values ('${U.supplier}','Fornitore','verified');
    insert into public.campaigns (id, user_id, title, service_type, status, total_amount, created_at, updated_at) values
      ('10000000-0000-4000-8000-0000000000a1','${U.custA}','A1','d2d','pending_review',236.85,'2026-10-01','2026-10-01'),
      ('10000000-0000-4000-8000-0000000000a2','${U.custA}','A2','d2d','approved',473.70,'2026-10-01','2026-10-01'),
      ('10000000-0000-4000-8000-0000000000b1','${U.custB}','B1','d2d','in_progress',300,'2026-10-01','2026-10-01'),
      ('10000000-0000-4000-8000-0000000000f0',null,'PUB','d2d','pending_review',100,'2026-10-01','2026-10-01');
    insert into public.quotes (id, campaign_id, subtotal, service_fee, total_amount) values
      ('20000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1',200,20,236.85),
      ('20000000-0000-4000-8000-0000000000b1','10000000-0000-4000-8000-0000000000b1',250,25,300);
    insert into public.campaign_analysis (id, campaign_id, source, households_estimate, raw_inputs) values
      ('30000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1','istat',5417,'{"k":"a"}'),
      ('30000000-0000-4000-8000-0000000000b1','10000000-0000-4000-8000-0000000000b1','istat',4000,'{"k":"b"}');`);
  return db;
}

const ACTORS = { anon: { role: 'anon' }, custA: { role: 'authenticated', uid: U.custA }, custB: { role: 'authenticated', uid: U.custB },
  admin: { role: 'authenticated', uid: U.admin }, supplier: { role: 'authenticated', uid: U.supplier }, service: { role: 'service_role' } };
async function as(db, actor, sql) {
  const a = ACTORS[actor];
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: a.role, ...(a.uid ? { sub: a.uid, email: EMAIL[actor] } : {}) })]);
    await db.exec(`set local role ${a.role}`);
    try { return (await db.query(sql)).rows; } catch (e) { return `denied:${e.code}`; }
  } finally { await db.exec('rollback'); }
}
// What each actor can read through the view: rows, owners, quote and analysis visibility.
const READ = `select count(*)::int as n,
  coalesce(string_agg(title, ',' order by title), '') as titles,
  count(quote_id)::int as with_quote, count(analysis_created_at)::int as with_analysis,
  count(raw_inputs)::int as with_raw_inputs from public.campaign_summary`;
async function matrix(db) {
  const m = {};
  for (const actor of Object.keys(ACTORS)) {
    const r = await as(db, actor, READ);
    m[`${actor}_read`] = typeof r === 'string' ? r : `${r[0].n}|${r[0].titles}|q${r[0].with_quote}|a${r[0].with_analysis}|raw${r[0].with_raw_inputs}`;
  }
  m.anon_insert = await as(db, 'anon', `insert into public.campaign_summary (id) values (gen_random_uuid())`).then(r => typeof r === 'string' ? r : 'ok');
  m.custA_update = await as(db, 'custA', `update public.campaign_summary set title = 'x'`).then(r => typeof r === 'string' ? r : 'ok');
  m.custA_base_campaigns = await as(db, 'custA', `select count(*)::int as n from public.campaigns`).then(r => typeof r === 'string' ? r : String(r[0].n));
  return m;
}

const BEFORE = {
  anon_read: '4|A1,A2,B1,PUB|q2|a2|raw2', custA_read: '4|A1,A2,B1,PUB|q2|a2|raw2', custB_read: '4|A1,A2,B1,PUB|q2|a2|raw2',
  admin_read: '4|A1,A2,B1,PUB|q2|a2|raw2', supplier_read: '4|A1,A2,B1,PUB|q2|a2|raw2', service_read: '4|A1,A2,B1,PUB|q2|a2|raw2',
  anon_insert: 'denied:55000', custA_update: 'denied:55000', custA_base_campaigns: '2',
};
const AFTER = {
  anon_read: 'denied:42501',
  custA_read: '2|A1,A2|q1|a1|raw1',          // own campaigns, own quote and analysis only
  custB_read: '1|B1|q1|a1|raw1',
  admin_read: '4|A1,A2,B1,PUB|q0|a0|raw0',   // campaigns_admin_all; quotes/campaign_analysis have no admin SELECT policy
  supplier_read: '0||q0|a0|raw0',
  service_read: '4|A1,A2,B1,PUB|q2|a2|raw2', // service_role / postgres unchanged
  // The view is not auto-updatable: Postgres rejects writes (55000) before the privilege check,
  // before and after; the revokes are defence in depth.
  anon_insert: 'denied:55000', custA_update: 'denied:55000', custA_base_campaigns: '2',
};
const checksum = async db => (await db.query(`select
  (select md5(string_agg(row_to_json(c)::text, '|' order by id)) from public.campaigns c) as c,
  (select md5(string_agg(row_to_json(q)::text, '|' order by id)) from public.quotes q) as q,
  (select md5(string_agg(row_to_json(a)::text, '|' order by id)) from public.campaign_analysis a) as a`)).rows[0];
const viewState = async db => (await db.query(`select reloptions::text as options, relacl::text as acl, pg_get_userbyid(relowner) as owner,
  md5(pg_get_viewdef('public.campaign_summary'::regclass, true)) as def_md5 from pg_class where oid = 'public.campaign_summary'::regclass`)).rows[0];

test('engine: fixture view definition hashes to the audited Production md5', engine, async () => {
  const db = await buildDb();
  assert.equal((await viewState(db)).def_md5, 'ab3f147ae7ef5ece7555debe9afde189');
  await db.close();
});

test('engine: Production state reproduces the leak (anon and every customer read all campaigns)', engine, async () => {
  const db = await buildDb();
  assert.deepEqual(await matrix(db), BEFORE);
  await db.close();
});

test('engine: migration closes anon and cross-customer reads; owners, admins and service_role keep legitimate access; data unchanged', engine, async () => {
  const db = await buildDb(); const before = await checksum(db); const v0 = await viewState(db);
  await db.exec(MIGRATION);
  assert.deepEqual(await matrix(db), AFTER);
  assert.deepEqual(await checksum(db), before);
  const v = await viewState(db);
  assert.equal(v.options, '{security_invoker=true}');
  assert.equal(v.acl, '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}');
  assert.equal(v.owner, 'postgres'); assert.equal(v.def_md5, v0.def_md5);
  await db.close();
});

test('engine: independent of 3B.4-D6 (either order gives the same view behaviour)', engine, async () => {
  for (const order of [[D6, MIGRATION], [MIGRATION, D6]]) {
    const db = await buildDb();
    for (const sql of order) await db.exec(sql);
    assert.deepEqual(await matrix(db), AFTER);
    await db.close();
  }
});

test('engine: idempotent; rollback restores exact options/ACL/leak; re-apply closes again', engine, async () => {
  const db = await buildDb(); const v0 = await viewState(db); const before = await checksum(db);
  await db.exec(MIGRATION); await db.exec(MIGRATION);
  assert.deepEqual(await matrix(db), AFTER);
  await db.exec(ROLLBACK);
  assert.deepEqual(await viewState(db), v0);
  assert.deepEqual(await matrix(db), BEFORE);
  await db.exec(MIGRATION);
  assert.deepEqual(await matrix(db), AFTER);
  assert.deepEqual(await checksum(db), before);
  await db.close();
});

test('engine: failure inside the migration transaction leaves no partial state', engine, async () => {
  const db = await buildDb(); const v0 = await viewState(db);
  await db.exec('begin'); await db.exec(MIGRATION);
  await assert.rejects(db.exec('select 1/0'));
  await db.exec('rollback');
  assert.deepEqual(await viewState(db), v0);
  assert.deepEqual(await matrix(db), BEFORE);
  await db.close();
});

const MUTANTS = {
  'revoke anon only (no security_invoker): customers still read every campaign': MIGRATION.replace('alter view public.campaign_summary set (security_invoker = true);', ''),
  'security_invoker only (anon keeps privileges)': MIGRATION.replace('revoke all on table public.campaign_summary from anon;', ''),
  'also revoke authenticated SELECT (breaks owners/admins)': MIGRATION + '\nrevoke select on table public.campaign_summary from authenticated;',
  'security_invoker = false': MIGRATION.replace('set (security_invoker = true)', 'set (security_invoker = false)'),
};
for (const [name, sql] of Object.entries(MUTANTS)) {
  test(`engine: mutation "${name}" is detected`, engine, async () => {
    assert.notEqual(sqlOnly(sql), sqlOnly(MIGRATION), 'mutation must change executable SQL, not comments');
    const db = await buildDb(); await db.exec(sql);
    assert.notDeepEqual(await matrix(db), AFTER);
    await db.close();
  });
}

// Release artifacts.
const verify = async db => (await db.exec(VERIFY)).find(r => r.rows?.[0]?.verification).rows[0].verification;
const tryApply = async (db, prefix = '') => { try { await db.exec(prefix + APPLY); return 'ok'; } catch (e) { await db.exec('rollback'); return e.message; } };

test('engine release: verify pre -> apply -> verify post; history once; matrix AFTER', engine, async () => {
  const db = await buildDb();
  const pre = await verify(db);
  assert.equal(pre.state, 'pre'); assert.equal(pre.privileges.anon_any, true); assert.equal(pre.migration_recorded, false);
  assert.equal(await tryApply(db), 'ok');
  const post = await verify(db);
  assert.equal(post.state, 'post'); assert.equal(post.def_md5, pre.def_md5); assert.equal(post.rows_via_owner, pre.rows_via_owner);
  assert.deepEqual(post.privileges, { anon_any: false, authenticated_select: true, authenticated_other: false, service_role_select: true });
  assert.equal(post.migration_recorded, true);
  assert.deepEqual(await matrix(db), AFTER);
  await db.close();
});

for (const [name, drift, msg] of [
  ['second apply', null, /already has reloptions/],
  ['ACL drift', `revoke truncate on public.campaign_summary from anon`, /ACL differs/],
  ['definition drift', `create or replace view public.campaign_summary as ${CS.view.def.replace(/;\s*$/, '')} where true`, /definition differs/],
  ['already recorded', `insert into supabase_migrations.schema_migrations (version) values ('20261009170000')`, /already recorded/],
  ['base table RLS off', `alter table public.quotes disable row level security`, /RLS disabled/],
]) {
  test(`engine release: Guard 1 aborts on ${name} with zero changes`, engine, async () => {
    const db = await buildDb();
    if (drift) await db.exec(drift); else await db.exec(APPLY);
    const before = await verify(db);
    assert.match(await tryApply(db), msg);
    assert.deepEqual(await verify(db), before);
    await db.close();
  });
}

test('engine release: non-postgres executor aborts with zero changes', engine, async () => {
  const db = await buildDb(); await db.exec(`create role deployer nologin; grant postgres to deployer;`); const before = await verify(db);
  assert.match(await tryApply(db, 'set role deployer; '), /run as postgres/);
  await db.exec('reset role'); assert.deepEqual(await verify(db), before); await db.close();
});

test('engine release: rollback + history delete returns to exact "pre"', engine, async () => {
  const db = await buildDb(); const pre = await verify(db);
  await db.exec(APPLY); await db.exec(ROLLBACK);
  await db.exec(`delete from supabase_migrations.schema_migrations where version = '20261009170000'`);
  assert.deepEqual(await verify(db), pre);
  assert.deepEqual(await matrix(db), BEFORE);
  await db.close();
});

test('engine release: verify script is read-only', engine, async () => {
  const db = await buildDb();
  await assert.rejects(db.exec(VERIFY.replace('select json_build_object(', `update public.campaigns set notes = 'x'; select json_build_object(`)), e => e.code === '25006');
  await db.exec('rollback'); await db.close();
});
