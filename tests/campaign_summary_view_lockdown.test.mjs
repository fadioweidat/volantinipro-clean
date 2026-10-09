// campaign_summary view lockdown (RLS bypass through an owner-rights view).
// Static checks always run. Engine checks rebuild the Production catalog for
// campaigns/profiles/quotes/supplier_profiles/clienti/campaign_admin_action_log
// (tests/fixtures/campaigns_security_catalog.json) plus campaign_analysis and
// the campaign_summary view (tests/fixtures/campaign_summary_catalog.json):
// read-only catalog exports, schema only, no row data. They run in an in-memory
// PGlite with Supabase-style auth.uid()/auth.jwt()/auth.role() over
// request.jwt.claims and never touch a remote database.
// PGlite is not a repo dependency: point PGLITE_MODULE at an installed
// @electric-sql/pglite entry (…/node_modules/@electric-sql/pglite/dist/index.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Normalised to LF so the checks behave the same on a core.autocrlf checkout.
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = read('supabase/migrations/20261009160000_campaign_summary_view_lockdown.sql');
const ROLLBACK = read('supabase/migrations/rollback/20261009160000_campaign_summary_view_lockdown.rollback.sql');
const CAMPAIGNS_LOCKDOWN = read('supabase/migrations/20261009150000_campaigns_owner_write_lockdown.sql');
const CATALOG = JSON.parse(read('tests/fixtures/campaigns_security_catalog.json'));
const VIEW_CATALOG = JSON.parse(read('tests/fixtures/campaign_summary_catalog.json'));
const VIEW = VIEW_CATALOG.views.find(v => v.rel === 'campaign_summary');
const ANALYSIS = VIEW_CATALOG.tables.find(t => t.rel === 'campaign_analysis');
const sqlOnly = s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').toLowerCase().replace(/\s+/g, ' ').trim();

const VIEW_COLUMNS = ['id', 'user_id', 'title', 'service_type', 'distribution_mode', 'campaign_status', 'quote_id', 'quote_subtotal',
  'service_fee', 'printing_fee', 'logistics_fee', 'zone_id', 'source', 'households_estimate', 'population_estimate', 'competitor_count',
  'poi_count', 'avg_income_estimate', 'family_index', 'commercial_density_index', 'reach_score', 'roi_score', 'confidence_score',
  'raw_inputs', 'analysis_created_at'];

test('fixture matches the audited Production state', () => {
  assert.equal(VIEW.owner, 'postgres');
  assert.equal(VIEW.reloptions, null);
  assert.equal(VIEW.acl, '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}');
  assert.equal(VIEW.dependents, null);
  assert.equal(VIEW.referenced_by_functions, null);
  assert.equal(ANALYSIS.rls, true);
  assert.deepEqual(ANALYSIS.policies.map(p => `${p.n}:${p.cmd}:${p.roles}`), ['campaign_analysis_own_insert:INSERT:public', 'campaign_analysis_own_select:SELECT:public']);
  // quotes/campaigns ACL in the two exports agree.
  assert.equal(CATALOG.tables.find(t => t.rel === 'quotes').acl, VIEW_CATALOG.quotes_acl);
  assert.equal(CATALOG.tables.find(t => t.rel === 'campaigns').acl, VIEW_CATALOG.campaigns_acl);
});

test('migration is minimal: one revoke from anon/authenticated, security_invoker on', () => {
  const m = sqlOnly(MIGRATION);
  assert.equal(m, 'revoke all on table public.campaign_summary from anon, authenticated; alter view public.campaign_summary set (security_invoker = true);');
});

test('rollback restores the exact Production reloptions and grants in one transaction', () => {
  const r = sqlOnly(ROLLBACK);
  assert.equal(r, 'begin; alter view public.campaign_summary reset (security_invoker); grant all on table public.campaign_summary to anon, authenticated; commit;');
});

// ---------------------------------------------------------------------------
let PGlite = null;
try {
  const mod = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
  PGlite = mod.PGlite;
} catch { /* engine checks skipped */ }
const engine = { skip: PGlite ? false : 'PGlite not available (set PGLITE_MODULE)' };

const ACL_LETTERS = { a: 'insert', r: 'select', w: 'update', d: 'delete', D: 'truncate', x: 'references', t: 'trigger', m: 'maintain' };
const ORDER = ['profiles', 'clienti', 'supplier_profiles', 'campaigns', 'quotes', 'campaign_admin_action_log', 'campaign_analysis'];
const U = {
  admin: '00000000-0000-4000-8000-0000000000a1', custA: '00000000-0000-4000-8000-0000000000c1',
  custB: '00000000-0000-4000-8000-0000000000c2', supplier: '00000000-0000-4000-8000-000000000051',
};
const EMAIL = { admin: 'admin@example.test', custA: 'cust-a@example.test', custB: 'cust-b@example.test', supplier: 'supplier@example.test' };
const C = { a1: '10000000-0000-4000-8000-000000000001', a2: '10000000-0000-4000-8000-000000000002',
  b1: '10000000-0000-4000-8000-000000000003', pub: '10000000-0000-4000-8000-000000000004' };

const grantAcl = async (db, rel, acl) => {
  await db.exec(`revoke all on public.${rel} from anon, authenticated, service_role;`);
  for (const entry of acl.replace(/[{}]/g, '').split(',')) {
    const [grantee, rest] = entry.split('='); const privs = rest.split('/')[0];
    if (!grantee || grantee === 'postgres' || !privs) continue;
    await db.exec(`grant ${[...privs].map(ch => ACL_LETTERS[ch]).join(', ')} on public.${rel} to ${grantee};`);
  }
};

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
    set check_function_bodies = off;`);
  const tables = Object.fromEntries([...CATALOG.tables, ...VIEW_CATALOG.tables].map(t => [t.rel, t]));
  for (const name of ORDER) {
    const t = tables[name];
    const cols = t.cols.map(c => `"${c.n}" ${c.t}${c.d ? ` default ${c.d}` : ''}${c.nn ? ' not null' : ''}`);
    const cons = (t.cons || []).filter(k => k.type !== 'f').map(k => `constraint "${k.n}" ${k.def}`);
    await db.exec(`create table public.${name} (${[...cols, ...cons].join(', ')});`);
  }
  // campaign_analysis_zone_id_fkey points at campaign_zones (GPS schema, not loaded).
  for (const name of ORDER) {
    for (const k of (tables[name].cons || []).filter(k => k.type === 'f' && !/REFERENCES campaign_zones\(/.test(k.def))) {
      await db.exec(`alter table public.${name} add constraint "${k.n}" ${k.def};`);
    }
  }
  const NOT_LOADED = /^public\.(admin_create_operator_assignment|admin_hard_delete_campaign)\(/;
  for (const def of Object.values(CATALOG.functions)) {
    if (!NOT_LOADED.test(def.match(/FUNCTION (\S+?\()/)?.[1] || '')) await db.exec(def);
  }
  for (const name of ORDER) {
    const t = tables[name];
    if (t.rls) await db.exec(`alter table public.${name} enable row level security;`);
    await grantAcl(db, name, t.acl);
    for (const p of t.policies || []) {
      await db.exec(`create policy "${p.n}" on public.${name} as ${p.perm.toLowerCase()} for ${p.cmd.toLowerCase()} to ${p.roles.join(', ')}${p.using ? ` using (${p.using})` : ''}${p.check ? ` with check (${p.check})` : ''};`);
    }
    for (const trg of t.triggers || []) await db.exec(trg + ';');
  }
  // The Production view, verbatim, owned by postgres, no reloptions.
  await db.exec(`set search_path = public; create view public.campaign_summary as ${VIEW.def} reset search_path;`);
  await grantAcl(db, 'campaign_summary', VIEW.acl);
  await seed(db);
  return db;
}

async function seed(db) {
  await db.exec(`
    insert into auth.users values
      ('${U.admin}', '${EMAIL.admin}', now()), ('${U.custA}', '${EMAIL.custA}', now()),
      ('${U.custB}', '${EMAIL.custB}', now()), ('${U.supplier}', '${EMAIL.supplier}', now());
    insert into public.profiles (id, role) values ('${U.admin}', 'admin'), ('${U.custA}', 'client'), ('${U.custB}', 'client'), ('${U.supplier}', 'supplier');
    insert into public.supplier_profiles (id, company_name, status) values ('${U.supplier}', 'Fornitore Test', 'verified');
    insert into public.campaigns (id, user_id, title, service_type, status, total_amount, source, metadata) values
      ('${C.a1}', '${U.custA}', 'A1', 'd2d', 'pending_review', 236.85, 'quote_requests', '{}'),
      ('${C.a2}', '${U.custA}', 'A2', 'd2d', 'draft', 0, 'manual', '{}'),
      ('${C.b1}', '${U.custB}', 'B1', 'd2d', 'pending_review', 473.70, 'quote_requests', '{}'),
      ('${C.pub}', null, 'PUB', 'd2d', 'pending_review', 100.00, 'quote_requests', '{}');
    insert into public.quotes (id, campaign_id, subtotal, service_fee, printing_fee, logistics_fee, total_amount) values
      ('20000000-0000-4000-8000-000000000001', '${C.a1}', 200, 10, 20, 6.85, 236.85);
    select set_config('marketplace.rpc', 'on', false);
    insert into public.quotes (id, campaign_id, supplier_id, quote_status, subtotal, total_amount, submitted_at) values
      ('20000000-0000-4000-8000-000000000002', '${C.b1}', '${U.supplier}', 'submitted', 400, 473.70, now());
    select set_config('marketplace.rpc', '', false);
    insert into public.campaign_analysis (campaign_id, households_estimate, reach_score, raw_inputs) values
      ('${C.a1}', 1200, 71.5, '{"k":"a1"}'), ('${C.b1}', 3400, 64.0, '{"k":"b1"}'), ('${C.pub}', 800, 50.0, '{}');`);
}

const ACTORS = {
  anon: { role: 'anon' }, custA: { role: 'authenticated', uid: U.custA }, custB: { role: 'authenticated', uid: U.custB },
  admin: { role: 'authenticated', uid: U.admin }, supplier: { role: 'authenticated', uid: U.supplier },
  service: { role: 'service_role' }, postgres: { role: 'postgres' },
};
// Runs `sql` as the actor inside a transaction that is always rolled back.
// `pre` runs first as superuser (e.g. to simulate a future re-grant).
async function attempt(db, actorName, sql, pre) {
  const a = ACTORS[actorName];
  const claims = JSON.stringify({ role: a.role, ...(a.uid ? { sub: a.uid, email: EMAIL[actorName] } : {}) });
  await db.exec('begin');
  try {
    if (pre) await db.exec(pre);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await db.exec(`set local role ${a.role}`);
    try {
      const res = await db.query(sql);
      return /^\s*select/i.test(sql) ? `ok:${Object.values(res.rows[0]).join('/')}` : `ok:${res.affectedRows ?? 0}`;
    } catch (e) { return `denied:${e.code}`; }
  } finally { await db.exec('rollback'); }
}

// rows / rows with a quote / rows with an analysis / distinct owners
const VIEW_READ = `select count(*)::int as n, count(quote_id)::int as q, count(analysis_created_at)::int as a, count(distinct user_id)::int as owners from public.campaign_summary`;
const BASE_READ = `select (select count(*) from public.campaigns)::int as c, (select count(*) from public.quotes)::int as q, (select count(*) from public.campaign_analysis)::int as a`;
const SCENARIOS = {
  anon_view: ['anon', VIEW_READ],
  anon_view_columns: ['anon', `select raw_inputs::text, quote_subtotal::text from public.campaign_summary where id = '${C.b1}'`],
  custA_view: ['custA', VIEW_READ],
  custB_view: ['custB', VIEW_READ],
  supplier_view: ['supplier', VIEW_READ],
  admin_view: ['admin', VIEW_READ],
  service_view: ['service', VIEW_READ],
  postgres_view: ['postgres', VIEW_READ],
  // The view is not auto-updatable: writes fail in the rewriter (55000) before
  // any privilege check, before and after; the write privileges themselves are
  // asserted on the catalog (view_acl).
  anon_view_insert: ['anon', `insert into public.campaign_summary (id) values (gen_random_uuid())`],
  anon_view_update: ['anon', `update public.campaign_summary set title = 'x'`],
  anon_view_delete: ['anon', `delete from public.campaign_summary`],
  // Base-table reads: what owners/admins legitimately use; must be unchanged.
  anon_base: ['anon', BASE_READ],
  custA_base: ['custA', BASE_READ],
  custB_base: ['custB', BASE_READ],
  supplier_base: ['supplier', BASE_READ],
  admin_base: ['admin', BASE_READ],
  service_base: ['service', BASE_READ],
  // Defence in depth: a future accidental GRANT SELECT must not reopen the bypass.
  regrant_anon_view: ['anon', VIEW_READ, 'grant select on public.campaign_summary to anon, authenticated;'],
  regrant_custA_view: ['custA', VIEW_READ, 'grant select on public.campaign_summary to anon, authenticated;'],
};

async function matrix(db) {
  const m = {};
  for (const [k, [actor, sql, pre]] of Object.entries(SCENARIOS)) m[k] = await attempt(db, actor, sql, pre);
  return m;
}

const ALL = 'ok:4/2/3/2'; // 4 campaigns, 2 quotes, 3 analyses, 2 owners (null owner not counted)
const BASE = {
  anon_base: 'ok:0/0/0', custA_base: 'ok:2/1/1', custB_base: 'ok:1/1/1', supplier_base: 'ok:0/1/0', admin_base: 'ok:4/0/0', service_base: 'ok:4/2/3',
};
const BEFORE = {
  anon_view: ALL, anon_view_columns: 'ok:{"k": "b1"}/400.00', custA_view: ALL, custB_view: ALL, supplier_view: ALL, admin_view: ALL,
  service_view: ALL, postgres_view: ALL,
  anon_view_insert: 'denied:55000', anon_view_update: 'denied:55000', anon_view_delete: 'denied:55000',
  ...BASE,
  regrant_anon_view: ALL, regrant_custA_view: ALL,
};
const AFTER = {
  ...BEFORE,
  anon_view: 'denied:42501', anon_view_columns: 'denied:42501', custA_view: 'denied:42501', custB_view: 'denied:42501',
  supplier_view: 'denied:42501', admin_view: 'denied:42501',
  // Re-granted, the view now follows the caller's RLS: anon nothing, owner only own rows.
  regrant_anon_view: 'ok:0/0/0/0', regrant_custA_view: 'ok:2/1/1/1',
};

const checksum = async db => (await db.query(`select
   (select md5(string_agg(row_to_json(c)::text, '|' order by id)) from public.campaigns c) as c,
   (select md5(string_agg(row_to_json(q)::text, '|' order by id)) from public.quotes q) as q,
   (select md5(string_agg(row_to_json(a)::text, '|' order by id)) from public.campaign_analysis a) as a,
   (select md5(string_agg(row_to_json(s)::text, '|' order by id)) from public.campaign_summary s) as s`)).rows[0];
const catalogState = async db => (await db.query(`select
   (select string_agg(e, ',' order by e) from pg_class, unnest(relacl::text[]) e where oid = 'public.campaign_summary'::regclass) as view_acl,
   (select reloptions::text from pg_class where oid = 'public.campaign_summary'::regclass) as view_opts,
   (select pg_get_viewdef('public.campaign_summary'::regclass, true)) as view_def,
   (select pg_get_userbyid(relowner) from pg_class where oid = 'public.campaign_summary'::regclass) as view_owner,
   (select json_agg(attname order by attnum)::text from pg_attribute where attrelid = 'public.campaign_summary'::regclass and attnum > 0) as view_cols,
   (select json_agg(c.relname || '=' || array_to_string(array(select unnest(c.relacl::text[]) order by 1), ',') order by c.relname)::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('campaigns', 'quotes', 'campaign_analysis')) as base_acls,
   (select json_agg(tablename || ':' || policyname order by tablename, policyname)::text from pg_policies where schemaname = 'public') as policies`)).rows[0];

test('engine: fixture view has the audited 25 columns and reproduces the exposure', engine, async () => {
  const db = await buildDb();
  assert.deepEqual(JSON.parse((await catalogState(db)).view_cols), VIEW_COLUMNS);
  assert.deepEqual(await matrix(db), BEFORE);
  await db.close();
});

test('engine: migration closes the bypass for every client role; service_role, postgres and base-table RLS unchanged', engine, async () => {
  const db = await buildDb();
  const before = await checksum(db); const base = await catalogState(db);
  await db.exec(MIGRATION);
  assert.deepEqual(await checksum(db), before, 'migration must not modify data');
  assert.deepEqual(await matrix(db), AFTER);
  const cat = await catalogState(db);
  assert.equal(cat.view_acl, 'postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres');
  assert.equal(cat.view_opts, '{security_invoker=true}');
  assert.equal(cat.view_def, base.view_def);
  assert.equal(cat.view_owner, 'postgres');
  assert.equal(cat.base_acls, base.base_acls, 'base-table grants untouched');
  assert.equal(cat.policies, base.policies, 'no policy touched');
  await db.close();
});

test('engine: migration is idempotent', engine, async () => {
  const db = await buildDb();
  const before = await checksum(db);
  await db.exec(MIGRATION); const once = await catalogState(db);
  await db.exec(MIGRATION);
  assert.deepEqual(await catalogState(db), once);
  assert.deepEqual(await matrix(db), AFTER);
  assert.deepEqual(await checksum(db), before);
  await db.close();
});

test('engine: independent of 20261009150000 campaigns lockdown (either order)', engine, async () => {
  for (const order of [[CAMPAIGNS_LOCKDOWN, MIGRATION], [MIGRATION, CAMPAIGNS_LOCKDOWN]]) {
    const db = await buildDb();
    for (const sql of order) await db.exec(sql);
    assert.deepEqual(await matrix(db), AFTER);
    await db.close();
  }
});

test('engine: rollback restores the exact Production catalog and behaviour; re-apply locks again', engine, async () => {
  const db = await buildDb();
  const base = await catalogState(db); const before = await checksum(db);
  await db.exec(MIGRATION);
  await db.exec(ROLLBACK);
  assert.deepEqual(await catalogState(db), base);
  assert.equal(base.view_acl, VIEW.acl.replace(/[{}]/g, '').split(',').sort().join(','));
  assert.equal(base.view_opts, null);
  assert.deepEqual(await matrix(db), BEFORE);
  await db.exec(MIGRATION);
  assert.deepEqual(await matrix(db), AFTER);
  assert.deepEqual(await checksum(db), before);
  await db.close();
});

test('engine: a failure inside the migration transaction leaves no partial state', engine, async () => {
  const db = await buildDb();
  const base = await catalogState(db);
  await db.exec('begin');
  await db.exec(MIGRATION);
  await assert.rejects(db.exec('select 1/0'));
  await db.exec('rollback');
  assert.deepEqual(await catalogState(db), base);
  assert.deepEqual(await matrix(db), BEFORE);
  await db.close();
});

// Why revoke rather than security_invoker alone: with invoker rights the admin
// sees every campaign but no quote/analysis of other owners (quotes and
// campaign_analysis have no admin policy), so the view would silently return
// partial data to admins; and anon/authenticated would keep write privileges.
test('engine: security_invoker alone would leak nothing but return partial rows to admins', engine, async () => {
  const db = await buildDb();
  await db.exec(`alter view public.campaign_summary set (security_invoker = true);`);
  assert.equal(await attempt(db, 'anon', VIEW_READ), 'ok:0/0/0/0');
  assert.equal(await attempt(db, 'custA', VIEW_READ), 'ok:2/1/1/1');
  assert.equal(await attempt(db, 'admin', VIEW_READ), 'ok:4/0/0/2');
  await db.close();
});

// Negative mutation tests: deliberately weakened variants must be caught.
const MUTANTS = {
  'security_invoker only, grants kept': MIGRATION.replace('revoke all on table public.campaign_summary from anon, authenticated;', ''),
  'revoke only, owner rights kept': MIGRATION.replace('alter view public.campaign_summary set (security_invoker = true);', ''),
  'authenticated keeps SELECT': MIGRATION.replace('from anon, authenticated;', 'from anon;'),
  'anon keeps SELECT': MIGRATION.replace('from anon, authenticated;', 'from authenticated;'),
  'revoke SELECT only, writes kept': MIGRATION.replace('revoke all on table', 'revoke select on table'),
};
for (const [name, sql] of Object.entries(MUTANTS)) {
  test(`engine: mutation "${name}" is detected`, engine, async () => {
    assert.notEqual(sql, MIGRATION, 'mutation must change the SQL');
    const db = await buildDb();
    await db.exec(sql);
    const cat = await catalogState(db);
    const caught = JSON.stringify(await matrix(db)) !== JSON.stringify(AFTER)
      || cat.view_acl !== 'postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres';
    assert.ok(caught);
    await db.close();
  });
}
