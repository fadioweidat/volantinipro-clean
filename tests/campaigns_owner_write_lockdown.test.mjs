// Phase 3B.4-D6: campaigns owner write lockdown.
// Static checks always run. Engine checks rebuild the Production catalog for
// campaigns/profiles/quotes/supplier_profiles/clienti/campaign_admin_action_log
// (columns, defaults, constraints, RLS, policies, table ACLs, triggers and the
// real function bodies, from tests/fixtures/campaigns_security_catalog.json:
// read-only catalog export, schema only, no row data) in an in-memory PGlite,
// with Supabase-style auth.uid()/auth.jwt()/auth.role() over
// request.jwt.claims. They never touch a remote database.
// PGlite is not a repo dependency: point PGLITE_MODULE at an installed
// @electric-sql/pglite entry (…/node_modules/@electric-sql/pglite/dist/index.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Normalise line endings: Windows checkouts (core.autocrlf) turn the LF blobs into CRLF,
// and several mutants below are built with '\n'-specific replacements.
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = read('supabase/migrations/20261009150000_campaigns_owner_write_lockdown.sql');
const ROLLBACK = read('supabase/migrations/rollback/20261009150000_campaigns_owner_write_lockdown.rollback.sql');
const CATALOG = JSON.parse(read('tests/fixtures/campaigns_security_catalog.json'));
const sqlOnly = s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').toLowerCase().replace(/\s+/g, ' ').trim();

test('migration is minimal: two policy drops, two revokes, one invoker guard trigger', () => {
  const m = sqlOnly(MIGRATION);
  assert.match(m, /drop policy if exists "campaigns_own_insert" on public\.campaigns;/);
  assert.match(m, /drop policy if exists "campaigns_own_update" on public\.campaigns;/);
  assert.match(m, /revoke insert, update, delete, truncate, references, trigger, maintain on table public\.campaigns from anon;/);
  assert.match(m, /revoke truncate, references, trigger, maintain on table public\.campaigns from authenticated;/);
  assert.match(m, /security invoker set search_path = ''/);
  assert.match(m, /current_user in \('anon', 'authenticated'\)/);
  assert.match(m, /profiles\.role = any \(array\['admin', 'super_admin'\]\)/);
  assert.match(m, /before insert or update or delete on public\.campaigns for each row execute function public\.campaigns_client_write_guard\(\);/);
  assert.doesNotMatch(m, /campaigns_own_select|campaigns_admin_all|security definer|grant |alter table|update public\.|delete from|insert into|truncate public/);
});

test('rollback restores the exact Production policies and grants in one transaction', () => {
  const r = sqlOnly(ROLLBACK);
  assert.match(r, /^begin;.*commit;$/);
  const live = Object.fromEntries(CATALOG.tables.find(t => t.rel === 'campaigns').policies.map(p => [p.n, p]));
  assert.equal(live.campaigns_own_insert.check, '(auth.uid() = user_id)');
  assert.equal(live.campaigns_own_update.using, '(auth.uid() = user_id)');
  assert.match(r, /create policy "campaigns_own_insert" on public\.campaigns for insert to authenticated with check \(\(auth\.uid\(\) = user_id\)\);/);
  assert.match(r, /create policy "campaigns_own_update" on public\.campaigns for update to authenticated using \(\(auth\.uid\(\) = user_id\)\) with check \(\(auth\.uid\(\) = user_id\)\);/);
  assert.match(r, /grant insert, update, delete, truncate, references, trigger, maintain on table public\.campaigns to anon;/);
  assert.match(r, /grant truncate, references, trigger, maintain on table public\.campaigns to authenticated;/);
  assert.match(r, /drop trigger if exists campaigns_client_write_guard_trg on public\.campaigns; drop function if exists public\.campaigns_client_write_guard\(\);/);
  assert.doesNotMatch(r, /delete from|update public\.|insert into|truncate public/);
});

// ---------------------------------------------------------------------------
let PGlite = null;
try {
  const mod = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
  PGlite = mod.PGlite;
} catch { /* engine checks skipped */ }
const engine = { skip: PGlite ? false : 'PGlite not available (set PGLITE_MODULE)' };

const ACL_LETTERS = { a: 'insert', r: 'select', w: 'update', d: 'delete', D: 'truncate', x: 'references', t: 'trigger', m: 'maintain' };
const ORDER = ['profiles', 'clienti', 'supplier_profiles', 'campaigns', 'quotes', 'campaign_admin_action_log'];
const U = {
  admin: '00000000-0000-4000-8000-0000000000a1', admin2: '00000000-0000-4000-8000-0000000000a2',
  custA: '00000000-0000-4000-8000-0000000000c1', custB: '00000000-0000-4000-8000-0000000000c2',
  supplier: '00000000-0000-4000-8000-0000000000s1'.replace('s', '5'),
};
const EMAIL = { admin: 'allowlisted-admin@example.test', admin2: 'second-admin@example.test', custA: 'cust-a@example.test', custB: 'cust-b@example.test', supplier: 'supplier@example.test' };
const C = { a1: '10000000-0000-4000-8000-000000000001', b1: '10000000-0000-4000-8000-000000000002', pub: '10000000-0000-4000-8000-000000000003',
  mkt: '10000000-0000-4000-8000-000000000004', req: '10000000-0000-4000-8000-000000000005', paid: '10000000-0000-4000-8000-000000000006' };
const Q1 = '20000000-0000-4000-8000-000000000001';
const REQ_CODE = 'REQ-TESTCODE0001';

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
    insert into supabase_migrations.schema_migrations (version, name) values ('20261009120000', 'smart_pairing_slots_write_lockdown');
    set check_function_bodies = off;`);
  const tables = Object.fromEntries(CATALOG.tables.map(t => [t.rel, t]));
  for (const name of ORDER) {
    const t = tables[name];
    const cols = t.cols.map(c => `"${c.n}" ${c.t}${c.d ? ` default ${c.d}` : ''}${c.nn ? ' not null' : ''}`);
    const cons = (t.cons || []).filter(k => k.type !== 'f').map(k => `constraint "${k.n}" ${k.def}`);
    await db.exec(`create table public.${name} (${[...cols, ...cons].join(', ')});`);
  }
  for (const name of ORDER) for (const k of (tables[name].cons || []).filter(k => k.type === 'f')) await db.exec(`alter table public.${name} add constraint "${k.n}" ${k.def};`);
  // admin_create_operator_assignment / admin_hard_delete_campaign depend on ~15
  // GPS/assignment tables outside this fixture; they are SECURITY DEFINER RPCs
  // owned by postgres, the same mechanism exercised by the RPCs loaded here.
  const NOT_LOADED = /^public\.(admin_create_operator_assignment|admin_hard_delete_campaign)\(/;
  for (const def of Object.values(CATALOG.functions)) {
    if (!NOT_LOADED.test(def.match(/FUNCTION (\S+?\()/)?.[1] || '')) await db.exec(def);
  }
  for (const name of ORDER) {
    const t = tables[name];
    if (t.rls) await db.exec(`alter table public.${name} enable row level security;`);
    await db.exec(`revoke all on public.${name} from anon, authenticated, service_role;`);
    for (const entry of t.acl.replace(/[{}]/g, '').split(',')) {
      const [grantee, rest] = entry.split('='); const privs = rest.split('/')[0];
      if (!grantee || grantee === 'postgres' || !privs) continue;
      await db.exec(`grant ${[...privs].map(ch => ACL_LETTERS[ch]).join(', ')} on public.${name} to ${grantee};`);
    }
    for (const p of t.policies || []) {
      await db.exec(`create policy "${p.n}" on public.${name} as ${p.perm.toLowerCase()} for ${p.cmd.toLowerCase()} to ${p.roles.join(', ')}${p.using ? ` using (${p.using})` : ''}${p.check ? ` with check (${p.check})` : ''};`);
    }
    for (const trg of t.triggers || []) await db.exec(trg + ';');
  }
  // Production default privileges in public (new functions are executable by anon/authenticated).
  await db.exec(`alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
                 alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
  await seed(db);
  return db;
}

async function seed(db) {
  await db.exec(`
    insert into auth.users values
      ('${U.admin}', '${EMAIL.admin}', now()), ('${U.admin2}', '${EMAIL.admin2}', now()),
      ('${U.custA}', '${EMAIL.custA}', now()), ('${U.custB}', '${EMAIL.custB}', now()), ('${U.supplier}', '${EMAIL.supplier}', now());
    insert into public.profiles (id, role) values ('${U.admin}', 'admin'), ('${U.admin2}', 'admin'), ('${U.custA}', 'client'), ('${U.custB}', 'client'), ('${U.supplier}', 'supplier');
    insert into public.supplier_profiles (id, company_name, status) values ('${U.supplier}', 'Fornitore Test', 'verified');
    insert into public.campaigns (id, user_id, title, service_type, status, total_amount, client_email, source, metadata, created_at, updated_at) values
      ('${C.a1}', '${U.custA}', 'A1', 'd2d', 'pending_review', 236.85, '${EMAIL.custA}', 'quote_requests', '{"payment_status":"in_attesa_pagamento","grand_total":236.85}', '2026-10-01', '2026-10-01'),
      ('${C.b1}', '${U.custB}', 'B1', 'd2d', 'pending_review', 473.70, '${EMAIL.custB}', 'quote_requests', '{"payment_status":"in_attesa_pagamento"}', '2026-10-01', '2026-10-01'),
      ('${C.pub}', null, 'PUB', 'd2d', 'pending_review', 100.00, '${EMAIL.custA}', 'quote_requests', '{"payment_status":"in_attesa_pagamento"}', '2026-10-01', '2026-10-01'),
      ('${C.mkt}', '${U.custA}', 'MKT', 'd2d', 'receiving_quotes', 0, '${EMAIL.custA}', 'manual', '{}', '2026-10-01', '2026-10-01'),
      ('${C.req}', '${U.custA}', 'REQ', 'd2d', 'requested', 0, '${EMAIL.custA}', 'manual', '{}', '2026-10-01', '2026-10-01'),
      ('${C.paid}', '${U.custA}', 'PAID', 'd2d', 'approved', 300.00, '${EMAIL.custA}', 'quote_requests', '{"payment_status":"pagato"}', '2026-10-01', '2026-10-01');
    update public.campaigns set marketplace_code = '${REQ_CODE}' where id = '${C.req}';
    select set_config('marketplace.rpc', 'on', false);
    insert into public.quotes (id, campaign_id, supplier_id, quote_status, subtotal, total_amount, submitted_at) values ('${Q1}', '${C.mkt}', '${U.supplier}', 'submitted', 400, 400, now());
    select set_config('marketplace.rpc', '', false);`);
}

const ACTORS = {
  anon: { role: 'anon' }, custA: { role: 'authenticated', uid: U.custA }, custB: { role: 'authenticated', uid: U.custB },
  admin: { role: 'authenticated', uid: U.admin }, admin2: { role: 'authenticated', uid: U.admin2 },
  supplier: { role: 'authenticated', uid: U.supplier }, service: { role: 'service_role' },
};
// Runs `sql` as the actor inside a transaction that is always rolled back; `probe`
// (run as superuser, still inside the transaction) observes the effect.
async function attempt(db, actorName, sql, probe) {
  const a = ACTORS[actorName];
  const claims = JSON.stringify({ role: a.role, ...(a.uid ? { sub: a.uid, email: EMAIL[actorName] } : {}) });
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await db.exec(`set local role ${a.role}`);
    let rows;
    try { const res = await db.query(sql); rows = /^\s*select/i.test(sql) ? res.rows.length : (res.affectedRows ?? 0); }
    catch (e) { return `denied:${e.code}${/CAMPAIGN_WRITE_SERVER_ONLY/.test(e.message) ? ':guard' : ''}`; }
    await db.exec('reset role');
    const seen = probe ? (await db.query(probe)).rows[0]?.v : undefined;
    return `ok:${rows}${probe ? `:${seen}` : ''}`;
  } finally { await db.exec('rollback'); }
}

const val = (id, expr) => `select (${expr})::text as v from public.campaigns where id = '${id}'`;
const SCENARIOS = {
  anon_insert: ['anon', `insert into public.campaigns (title, service_type, status, total_amount) values ('x','d2d','approved',1)`],
  anon_update: ['anon', `update public.campaigns set total_amount = 1`],
  anon_delete: ['anon', `delete from public.campaigns`],
  anon_truncate: ['anon', `truncate public.campaigns`],
  owner_insert_arbitrary_price: ['custA', `insert into public.campaigns (user_id, title, service_type, status, total_amount, metadata) values ('${U.custA}','x','d2d','approved',0.01,'{"payment_status":"pagato"}')`],
  owner_total_amount: ['custA', `update public.campaigns set total_amount = 0.01 where id = '${C.a1}'`, val(C.a1, 'total_amount')],
  owner_status_approved: ['custA', `update public.campaigns set status = 'approved' where id = '${C.a1}'`, val(C.a1, 'status')],
  owner_payment_pagato: ['custA', `update public.campaigns set metadata = jsonb_set(metadata, '{payment_status}', '"pagato"') where id = '${C.a1}'`, val(C.a1, "metadata->>'payment_status'")],
  owner_replace_metadata: ['custA', `update public.campaigns set metadata = '{"payment_status":"pagato","grand_total":0}' where id = '${C.a1}'`, val(C.a1, 'metadata::text')],
  owner_editable_notes: ['custA', `update public.campaigns set notes = 'nota cliente' where id = '${C.a1}'`, val(C.a1, "coalesce(notes,'∅')")],
  owner_delete: ['custA', `delete from public.campaigns where id = '${C.a1}'`, `select count(*)::text as v from public.campaigns where id = '${C.a1}'`],
  owner_truncate: ['custA', `truncate public.campaigns`],
  other_customer_update: ['custB', `update public.campaigns set total_amount = 0.01 where id = '${C.a1}'`, val(C.a1, 'total_amount')],
  owner_select_own: ['custA', `select * from public.campaigns`],
  admin_approve_and_pay: ['admin', `update public.campaigns set status = 'approved', metadata = jsonb_set(metadata, '{payment_status}', '"pagato"') where id = '${C.a1}'`, val(C.a1, "status || '/' || (metadata->>'payment_status')")],
  admin2_policy_admin_update: ['admin2', `update public.campaigns set metadata = metadata || '{"manual_operational_metrics":{}}' where id = '${C.b1}'`, val(C.b1, "metadata ? 'manual_operational_metrics'")],
  admin_insert: ['admin', `insert into public.campaigns (title, service_type, status, total_amount, source) values ('admin','d2d','draft',10,'manual')`],
  admin_delete: ['admin', `delete from public.campaigns where id = '${C.b1}'`],
  service_insert: ['service', `insert into public.campaigns (title, service_type, status, total_amount, metadata, source) values ('svc','d2d','pending_review',236.85,'{"payment_status":"in_attesa_pagamento"}','quote_requests')`],
  service_update: ['service', `update public.campaigns set total_amount = 250 where id = '${C.a1}'`, val(C.a1, 'total_amount')],
  service_delete: ['service', `delete from public.campaigns where id = '${C.b1}'`],
  rpc_claim_public_campaign: ['custA', `select public.claim_public_campaign('${C.pub}')`, val(C.pub, 'user_id')],
  rpc_supplier_submit_quote: ['supplier', `select public.supplier_submit_quote('${REQ_CODE}', 500)`, val(C.req, 'status')],
  rpc_customer_accept_quote: ['custA', `select public.customer_accept_supplier_quote('${Q1}')`, val(C.mkt, "status || '/' || coalesce(supplier_id::text,'')")],
  rpc_admin_revoke_payment: ['admin', `select public.admin_revoke_payment_confirmation('${C.paid}', 'test revoke')`, val(C.paid, "metadata->>'payment_status'")],
  rpc_admin_cancel: ['admin', `select public.admin_cancel_campaign('${C.a1}', 'test cancel')`, val(C.a1, 'status')],
  rpc_customer_calls_admin_rpc: ['custA', `select public.admin_revoke_payment_confirmation('${C.paid}', 'x')`],
  guard_not_callable: ['custA', `select public.campaigns_client_write_guard()`],
};

async function matrix(db) {
  const m = {};
  for (const [k, [actor, sql, probe]] of Object.entries(SCENARIOS)) {
    if (k === 'guard_not_callable') continue;
    m[k] = await attempt(db, actor, sql, probe);
  }
  return m;
}

const BEFORE = {
  anon_insert: 'denied:42501', anon_update: 'ok:0', anon_delete: 'ok:0', anon_truncate: 'denied:0A000',
  owner_insert_arbitrary_price: 'ok:1', owner_total_amount: 'ok:1:0.01', owner_status_approved: 'ok:1:approved',
  owner_payment_pagato: 'ok:1:pagato', owner_replace_metadata: 'ok:1:{"grand_total": 0, "payment_status": "pagato"}',
  owner_editable_notes: 'ok:1:nota cliente', owner_delete: 'ok:0:1', owner_truncate: 'denied:0A000', other_customer_update: 'ok:0:236.85',
  owner_select_own: 'ok:4',
  admin_approve_and_pay: 'ok:1:approved/pagato', admin2_policy_admin_update: 'ok:1:true', admin_insert: 'ok:1', admin_delete: 'ok:1',
  service_insert: 'ok:1', service_update: 'ok:1:250', service_delete: 'ok:1',
  rpc_claim_public_campaign: `ok:1:${U.custA}`, rpc_supplier_submit_quote: 'ok:1:receiving_quotes',
  rpc_customer_accept_quote: `ok:1:quote_selected/${U.supplier}`, rpc_admin_revoke_payment: 'ok:1:in_attesa_pagamento',
  rpc_admin_cancel: 'ok:1:cancelled', rpc_customer_calls_admin_rpc: 'denied:42501',
};
const AFTER = {
  ...BEFORE,
  anon_update: 'denied:42501', anon_delete: 'denied:42501', anon_truncate: 'denied:42501',
  owner_insert_arbitrary_price: 'denied:42501:guard', owner_total_amount: 'ok:0:236.85', owner_status_approved: 'ok:0:pending_review',
  owner_payment_pagato: 'ok:0:in_attesa_pagamento', owner_replace_metadata: 'ok:0:{"grand_total": 236.85, "payment_status": "in_attesa_pagamento"}',
  owner_editable_notes: 'ok:0:∅', owner_truncate: 'denied:42501',
};

const checksum = async db => (await db.query(`select count(*)::int as n, md5(string_agg(row_to_json(c)::text, '|' order by id)) as h from public.campaigns c`)).rows[0];
const catalogState = async db => (await db.query(`select
   (select json_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':' || coalesce(qual, '-') || ':' || coalesce(with_check, '-') order by policyname)::text from pg_policies where tablename = 'campaigns') as policies,
   (select relacl::text from pg_class where oid = 'public.campaigns'::regclass) as acl,
   (select json_agg(tgname order by tgname)::text from pg_trigger where tgrelid = 'public.campaigns'::regclass and not tgisinternal) as triggers,
   (select count(*)::int from pg_proc where proname = 'campaigns_client_write_guard') as guard_fn`)).rows[0];

test('engine: Production fixture reproduces the exposure before the migration', engine, async () => {
  const db = await buildDb();
  assert.deepEqual(await matrix(db), BEFORE);
  await db.close();
});

test('engine: migration blocks every direct customer/anon write and keeps admin, service_role and RPC flows', engine, async () => {
  const db = await buildDb();
  const before = await checksum(db);
  await db.exec(MIGRATION);
  assert.deepEqual(await checksum(db), before, 'migration must not modify data');
  assert.deepEqual(await matrix(db), AFTER);
  // Guard function is not callable as an RPC.
  const r = await attempt(db, 'custA', SCENARIOS.guard_not_callable[1]);
  assert.match(r, /^denied:/);
  // Catalog result.
  const cat = await catalogState(db);
  assert.equal(cat.guard_fn, 1);
  assert.match(cat.acl, /anon=r\/postgres/);
  assert.match(cat.acl, /authenticated=arwd\/postgres/);
  assert.match(cat.acl, /service_role=arwdDxtm\/postgres/);
  assert.deepEqual(JSON.parse(cat.policies).map(p => p.split(':')[0]), ['campaigns_admin_all', 'campaigns_own_select']);
  assert.deepEqual(JSON.parse(cat.triggers), ['campaigns_client_write_guard_trg', 'campaigns_marketplace_assignment_guard_trg', 'campaigns_marketplace_code', 'set_campaigns_updated_at']);
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

test('engine: rollback restores the exact Production catalog and behaviour; re-apply locks again', engine, async () => {
  const db = await buildDb();
  const base = await catalogState(db); const before = await checksum(db);
  await db.exec(MIGRATION);
  await db.exec(ROLLBACK);
  assert.deepEqual(await catalogState(db), base);
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

// Negative mutation tests: deliberately weakened variants must be caught.
const MUTANTS = {
  'policies kept, no guard trigger': MIGRATION.replace(/drop policy if exists "campaigns_own_(insert|update)" on public\.campaigns;/g, '').replace(/create trigger campaigns_client_write_guard_trg[\s\S]*?;\s*$/m, ''),
  'guard keyed on JWT role instead of current_user (breaks SECURITY DEFINER RPCs)': MIGRATION.replace(/policies kept/, '').replace("current_user in ('anon', 'authenticated')", "coalesce(auth.role(), 'anon') in ('anon', 'authenticated')"),
  'guard requires gps_is_admin (breaks policy admins)': MIGRATION.replace(/not exists \([\s\S]*?\]\)\n\s*\) then/, 'not public.gps_is_admin() then'),
  'TRUNCATE left to authenticated': MIGRATION.replace('revoke truncate, references, trigger, maintain\n  on table public.campaigns from authenticated;', ''),
  'anon writes left': MIGRATION.replace('revoke insert, update, delete, truncate, references, trigger, maintain\n  on table public.campaigns from anon;', ''),
};
for (const [name, sql] of Object.entries(MUTANTS)) {
  test(`engine: mutation "${name}" is detected`, engine, async () => {
    assert.notEqual(sql, MIGRATION, 'mutation must change the SQL');
    const db = await buildDb();
    await db.exec(sql);
    assert.notDeepEqual(await matrix(db), AFTER);
    await db.close();
  });
}

// ---------------------------------------------------------------------------
// Release artifacts (docs/release): guarded single-transaction apply + read-only verify.
const APPLY = read('docs/release/3b4d6-apply-campaigns-write-lockdown.sql');
const VERIFY = read('docs/release/3b4d6-verify-campaigns-write-lockdown.sql');
const stmts = s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').replace(/\s+/g, ' ').trim();
const verify = async db => (await db.exec(VERIFY)).find(r => r.rows?.[0]?.verification).rows[0].verification;
const tryApply = async (db, prefix = '') => { try { await db.exec(prefix + APPLY); return 'ok'; } catch (e) { await db.exec('rollback'); return e.message; } };

test('release: apply script embeds the migration statements verbatim', () => {
  const block = APPLY.split('BEGIN 20261009150000')[1].split('===== END migration')[0];
  assert.equal(stmts(block.split('\n').slice(1).join('\n')), stmts(MIGRATION));
});

test('engine release: verify pre -> apply -> verify post; data untouched; history once; matrix AFTER', engine, async () => {
  const db = await buildDb();
  const pre = await verify(db);
  assert.equal(pre.state, 'pre'); assert.equal(pre.migration_recorded, false); assert.equal(pre.privileges.anon.write, true);
  assert.equal(await tryApply(db), 'ok');
  const post = await verify(db);
  assert.equal(post.state, 'post');
  assert.deepEqual(post.rows, pre.rows);
  assert.equal(post.migration_recorded, true);
  assert.deepEqual(post.privileges, { anon: { select: true, write: false }, authenticated: { select: true, insert: true, update: true, delete: true, truncate_refs_trigger_maintain: false }, service_role_all: true });
  assert.deepEqual(post.guard_fn, { secdef: false, anon_exec: false, auth_exec: false });
  assert.equal((await db.query(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '20261009150000'`)).rows[0].n, 1);
  assert.deepEqual(await matrix(db), AFTER);
  await db.close();
});

test('engine release: second apply aborts on Guard 1 with zero changes', engine, async () => {
  const db = await buildDb(); await db.exec(APPLY); const before = await verify(db);
  assert.match(await tryApply(db), /3B4D6_ABORT: campaigns ACL differs/);
  assert.deepEqual(await verify(db), before);
  await db.close();
});

for (const [name, drift, msg] of [
  ['ACL drift', `revoke truncate on public.campaigns from anon`, /ACL differs/],
  ['extra policy', `create policy extra on public.campaigns for select to anon using (false)`, /policies differ/],
  ['changed owner policy', `alter policy campaigns_own_update on public.campaigns using (true)`, /policies differ/],
  ['column ACL', `grant update (notes) on public.campaigns to anon`, /column-level ACL|ACL differs/],
  ['extra trigger', `create trigger zz_extra before update on public.campaigns for each row execute function public.set_updated_at()`, /triggers differ/],
  ['already recorded', `insert into supabase_migrations.schema_migrations (version) values ('20261009150000')`, /already recorded/],
]) {
  test(`engine release: Guard 1 aborts on ${name} with zero changes`, engine, async () => {
    const db = await buildDb(); await db.exec(drift); const before = await verify(db);
    assert.match(await tryApply(db), msg);
    assert.deepEqual(await verify(db), before);
    await db.close();
  });
}

test('engine release: non-postgres executor aborts with zero changes', engine, async () => {
  const db = await buildDb(); await db.exec(`create role deployer nologin; grant postgres to deployer;`); const before = await verify(db);
  assert.match(await tryApply(db, 'set role deployer; '), /run as postgres/);
  await db.exec('reset role');
  assert.deepEqual(await verify(db), before);
  await db.close();
});

test('engine release: rollback + history delete returns to exact "pre" (data included)', engine, async () => {
  const db = await buildDb(); const pre = await verify(db);
  await db.exec(APPLY); await db.exec(ROLLBACK);
  await db.exec(`delete from supabase_migrations.schema_migrations where version = '20261009150000'`);
  assert.deepEqual(await verify(db), pre);
  assert.deepEqual(await matrix(db), BEFORE);
  await db.close();
});

test('engine release: verify script is read-only', engine, async () => {
  const db = await buildDb();
  await assert.rejects(db.exec(VERIFY.replace('select json_build_object(', `update public.campaigns set notes = 'x'; select json_build_object(`)), e => e.code === '25006');
  await db.exec('rollback'); await db.close();
});
