// Combined release check: 3B.4-D6 (20261009150000 campaigns owner write lockdown)
// + campaign_summary view lockdown (20261009160000, candidate 1333e1a).
// Rebuilds the Production catalog (D6 fixture: campaigns/profiles/quotes/
// supplier_profiles/clienti/campaign_admin_action_log with real policies, ACLs,
// triggers and function bodies; view fixture: campaign_analysis + exact
// campaign_summary definition, owner and ACL) in an in-memory PGlite and checks
// both migrations, both orders, independent rollbacks, idempotency, atomicity
// and the guarded release scripts. Schema-only fixtures; never a remote database.
// Set PGLITE_MODULE to an installed @electric-sql/pglite dist/index.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const D6 = read('supabase/migrations/20261009150000_campaigns_owner_write_lockdown.sql');
const D6_RB = read('supabase/migrations/rollback/20261009150000_campaigns_owner_write_lockdown.rollback.sql');
const D6_APPLY = read('docs/release/3b4d6-apply-campaigns-write-lockdown.sql');
const D6_VERIFY = read('docs/release/3b4d6-verify-campaigns-write-lockdown.sql');
const CSV = read('supabase/migrations/20261009160000_campaign_summary_view_lockdown.sql');
const CSV_RB = read('supabase/migrations/rollback/20261009160000_campaign_summary_view_lockdown.rollback.sql');
const CSV_APPLY = read('docs/release/3b4v-apply-campaign-summary-view-lockdown.sql');
const CSV_VERIFY = read('docs/release/3b4v-verify-campaign-summary-view-lockdown.sql');
const BASE = JSON.parse(read('tests/fixtures/campaigns_security_catalog.json'));
const VIEWCAT = JSON.parse(read('tests/fixtures/campaign_summary_catalog.json'));
const stmts = s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').replace(/\s+/g, ' ').trim();

test('versions: unique migration versions, both new versions after the last applied one', () => {
  const files = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(f => /^\d{14}_.*\.sql$/.test(f));
  const versions = files.map(f => f.slice(0, 14));
  assert.equal(new Set(versions).size, versions.length, 'duplicate migration version');
  for (const v of ['20261009150000', '20261009160000']) assert.equal(versions.filter(x => x === v).length, 1);
  assert.ok('20261009150000' > '20261009120000' && '20261009160000' > '20261009150000');
});

test('release scripts embed each migration verbatim', () => {
  const block = (apply, v) => apply.split(`BEGIN ${v}`)[1].split('===== END migration')[0].split('\n').slice(1).join('\n');
  assert.equal(stmts(block(D6_APPLY, '20261009150000')), stmts(D6));
  assert.equal(stmts(block(CSV_APPLY, '20261009160000')), stmts(CSV));
});

// ---------------------------------------------------------------------------
let PGlite = null;
try {
  const mod = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
  PGlite = mod.PGlite;
} catch { /* engine checks skipped */ }
const engine = { skip: PGlite ? false : 'PGlite not available (set PGLITE_MODULE)' };

const ACL = { a: 'insert', r: 'select', w: 'update', d: 'delete', D: 'truncate', x: 'references', t: 'trigger', m: 'maintain' };
const grants = (rel, acl) => [`revoke all on ${rel} from anon, authenticated, service_role;`, ...acl.replace(/[{}]/g, '').split(',').map(e => {
  const [g, rest] = e.split('='); const p = rest.split('/')[0];
  return g && g !== 'postgres' && p ? `grant ${[...p].map(c => ACL[c]).join(', ')} on ${rel} to ${g};` : '';
})].join('\n');
const U = { admin: '00000000-0000-4000-8000-0000000000a1', admin2: '00000000-0000-4000-8000-0000000000a2', custA: '00000000-0000-4000-8000-0000000000c1',
  custB: '00000000-0000-4000-8000-0000000000c2', supplier: '00000000-0000-4000-8000-000000000051' };
const EMAIL = { admin: 'allowlisted-admin@example.test', admin2: 'second-admin@example.test', custA: 'cust-a@example.test', custB: 'cust-b@example.test', supplier: 'supplier@example.test' };
const C = { a1: '10000000-0000-4000-8000-000000000001', b1: '10000000-0000-4000-8000-000000000002', pub: '10000000-0000-4000-8000-000000000003',
  mkt: '10000000-0000-4000-8000-000000000004', req: '10000000-0000-4000-8000-000000000005', paid: '10000000-0000-4000-8000-000000000006' };
const Q1 = '20000000-0000-4000-8000-000000000001'; const REQ_CODE = 'REQ-TESTCODE0001';
const NOT_LOADED = /^public\.(admin_create_operator_assignment|admin_hard_delete_campaign)\(/;

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
  const tables = Object.fromEntries([...BASE.tables, ...VIEWCAT.tables].map(t => [t.rel, t]));
  const order = ['profiles', 'clienti', 'supplier_profiles', 'campaigns', 'quotes', 'campaign_admin_action_log', 'campaign_analysis'];
  for (const n of order) {
    const t = tables[n];
    await db.exec(`create table public.${n} (${[...t.cols.map(c => `"${c.n}" ${c.t}${c.d ? ` default ${c.d}` : ''}${c.nn ? ' not null' : ''}`),
      ...(t.cons || []).filter(k => k.type !== 'f').map(k => `constraint "${k.n}" ${k.def}`)].join(', ')});`);
  }
  // campaign_analysis.zone_id -> campaign_zones: not in the fixture, irrelevant to RLS.
  for (const n of order) for (const k of (tables[n].cons || []).filter(k => k.type === 'f' && !/REFERENCES campaign_zones\(/.test(k.def))) await db.exec(`alter table public.${n} add constraint "${k.n}" ${k.def};`);
  for (const def of Object.values(BASE.functions)) if (!NOT_LOADED.test(def.match(/FUNCTION (\S+?\()/)?.[1] || '')) await db.exec(def);
  for (const n of order) {
    const t = tables[n];
    if (t.rls) await db.exec(`alter table public.${n} enable row level security;`);
    await db.exec(grants(`public.${n}`, t.acl));
    for (const p of t.policies || []) await db.exec(`create policy "${p.n}" on public.${n} as ${p.perm.toLowerCase()} for ${p.cmd.toLowerCase()} to ${p.roles.join(', ')}${p.using ? ` using (${p.using})` : ''}${p.check ? ` with check (${p.check})` : ''};`);
    for (const trg of t.triggers || []) await db.exec(trg + ';');
  }
  const view = VIEWCAT.views.find(v => v.rel === 'campaign_summary');
  await db.exec(`create view public.campaign_summary as ${view.def}`);
  await db.exec(grants('public.campaign_summary', view.acl));
  await db.exec(`alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
                 alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
  await db.exec(`
    insert into auth.users values ('${U.admin}','${EMAIL.admin}',now()),('${U.admin2}','${EMAIL.admin2}',now()),('${U.custA}','${EMAIL.custA}',now()),('${U.custB}','${EMAIL.custB}',now()),('${U.supplier}','${EMAIL.supplier}',now());
    insert into public.profiles (id, role) values ('${U.admin}','admin'),('${U.admin2}','admin'),('${U.custA}','client'),('${U.custB}','client'),('${U.supplier}','supplier');
    insert into public.supplier_profiles (id, company_name, status) values ('${U.supplier}','Fornitore','verified');
    insert into public.campaigns (id, user_id, title, service_type, status, total_amount, client_email, source, metadata, created_at, updated_at) values
      ('${C.a1}','${U.custA}','A1','d2d','pending_review',236.85,'${EMAIL.custA}','quote_requests','{"payment_status":"in_attesa_pagamento","grand_total":236.85}','2026-10-01','2026-10-01'),
      ('${C.b1}','${U.custB}','B1','d2d','pending_review',473.70,'${EMAIL.custB}','quote_requests','{"payment_status":"in_attesa_pagamento"}','2026-10-01','2026-10-01'),
      ('${C.pub}',null,'PUB','d2d','pending_review',100.00,'${EMAIL.custA}','quote_requests','{"payment_status":"in_attesa_pagamento"}','2026-10-01','2026-10-01'),
      ('${C.mkt}','${U.custA}','MKT','d2d','receiving_quotes',0,'${EMAIL.custA}','manual','{}','2026-10-01','2026-10-01'),
      ('${C.req}','${U.custA}','REQ','d2d','requested',0,'${EMAIL.custA}','manual','{}','2026-10-01','2026-10-01'),
      ('${C.paid}','${U.custA}','PAID','d2d','approved',300.00,'${EMAIL.custA}','quote_requests','{"payment_status":"pagato"}','2026-10-01','2026-10-01');
    update public.campaigns set marketplace_code = '${REQ_CODE}' where id = '${C.req}';
    select set_config('marketplace.rpc', 'on', false);
    insert into public.quotes (id, campaign_id, supplier_id, quote_status, subtotal, total_amount, submitted_at) values ('${Q1}','${C.mkt}','${U.supplier}','submitted',400,400,now());
    select set_config('marketplace.rpc', '', false);
    insert into public.quotes (id, campaign_id, subtotal, service_fee, total_amount) values
      ('20000000-0000-4000-8000-0000000000a1','${C.a1}',200,20,236.85), ('20000000-0000-4000-8000-0000000000b1','${C.b1}',400,40,473.70);
    insert into public.campaign_analysis (id, campaign_id, source, households_estimate, raw_inputs) values
      ('30000000-0000-4000-8000-0000000000a1','${C.a1}','istat',5417,'{"k":"a"}'), ('30000000-0000-4000-8000-0000000000b1','${C.b1}','istat',4000,'{"k":"b"}');`);
  return db;
}

const ACTORS = { anon: { role: 'anon' }, custA: { role: 'authenticated', uid: U.custA }, custB: { role: 'authenticated', uid: U.custB },
  admin: { role: 'authenticated', uid: U.admin }, admin2: { role: 'authenticated', uid: U.admin2 }, supplier: { role: 'authenticated', uid: U.supplier }, service: { role: 'service_role' } };
async function attempt(db, actor, sql, probe) {
  const a = ACTORS[actor];
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: a.role, ...(a.uid ? { sub: a.uid, email: EMAIL[actor] } : {}) })]);
    await db.exec(`set local role ${a.role}`);
    let n;
    try { const r = await db.query(sql); n = /^\s*select/i.test(sql) ? (r.rows[0]?.v ?? r.rows.length) : (r.affectedRows ?? 0); }
    catch (e) { return `denied:${e.code}${/CAMPAIGN_WRITE_SERVER_ONLY/.test(e.message) ? ':guard' : ''}`; }
    await db.exec('reset role');
    const seen = probe ? (await db.query(probe)).rows[0]?.v : undefined;
    return `ok:${n}${probe ? `:${seen}` : ''}`;
  } finally { await db.exec('rollback'); }
}
const val = (id, expr) => `select (${expr})::text as v from public.campaigns where id = '${id}'`;
const VIEW_READ = `select (count(*) || '|' || count(quote_id) || '|' || count(analysis_created_at) || '|' || coalesce(string_agg(title, ',' order by title), '')) as v from public.campaign_summary`;
const S = {
  // D6 surface
  anon_insert: ['anon', `insert into public.campaigns (title, service_type, status, total_amount) values ('x','d2d','approved',1)`],
  anon_update: ['anon', `update public.campaigns set total_amount = 1`],
  anon_truncate: ['anon', `truncate public.campaigns`],
  owner_insert_price: ['custA', `insert into public.campaigns (user_id, title, service_type, status, total_amount, metadata) values ('${U.custA}','x','d2d','approved',0.01,'{"payment_status":"pagato"}')`],
  owner_total_amount: ['custA', `update public.campaigns set total_amount = 0.01 where id = '${C.a1}'`, val(C.a1, 'total_amount')],
  owner_status: ['custA', `update public.campaigns set status = 'approved' where id = '${C.a1}'`, val(C.a1, 'status')],
  owner_payment: ['custA', `update public.campaigns set metadata = jsonb_set(metadata, '{payment_status}', '"pagato"') where id = '${C.a1}'`, val(C.a1, "metadata->>'payment_status'")],
  owner_truncate: ['custA', `truncate public.campaigns`],
  other_customer_update: ['custB', `update public.campaigns set total_amount = 0.01 where id = '${C.a1}'`, val(C.a1, 'total_amount')],
  admin_approve_pay: ['admin', `update public.campaigns set status = 'approved', metadata = jsonb_set(metadata, '{payment_status}', '"pagato"') where id = '${C.a1}'`, val(C.a1, "status || '/' || (metadata->>'payment_status')")],
  admin2_update: ['admin2', `update public.campaigns set metadata = metadata || '{"m":1}' where id = '${C.b1}'`, val(C.b1, "metadata ? 'm'")],
  service_insert: ['service', `insert into public.campaigns (title, service_type, status, total_amount, source) values ('svc','d2d','pending_review',236.85,'quote_requests')`],
  service_update: ['service', `update public.campaigns set total_amount = 250 where id = '${C.a1}'`, val(C.a1, 'total_amount')],
  rpc_claim: ['custA', `select public.claim_public_campaign('${C.pub}')`, val(C.pub, 'user_id')],
  rpc_supplier_quote: ['supplier', `select public.supplier_submit_quote('${REQ_CODE}', 500)`, val(C.req, 'status')],
  rpc_accept_quote: ['custA', `select public.customer_accept_supplier_quote('${Q1}')`, val(C.mkt, 'status')],
  rpc_admin_revoke_payment: ['admin', `select public.admin_revoke_payment_confirmation('${C.paid}', 'test')`, val(C.paid, "metadata->>'payment_status'")],
  // Base-table reads (unchanged by both)
  custA_campaigns: ['custA', `select count(*)::text as v from public.campaigns`],
  custA_quotes: ['custA', `select count(*)::text as v from public.quotes`],
  admin_campaigns: ['admin', `select count(*)::text as v from public.campaigns`],
  // View surface
  view_anon: ['anon', VIEW_READ], view_custA: ['custA', VIEW_READ], view_custB: ['custB', VIEW_READ],
  view_admin: ['admin', VIEW_READ], view_supplier: ['supplier', VIEW_READ], view_service: ['service', VIEW_READ],
};
async function matrix(db) { const m = {}; for (const [k, [a, sql, p]] of Object.entries(S)) m[k] = await attempt(db, a, sql, p); return m; }

const ALL_ROWS = 'ok:6|3|2|A1,B1,MKT,PAID,PUB,REQ';
const PRE = {
  anon_insert: 'denied:42501', anon_update: 'ok:0', anon_truncate: 'denied:0A000',
  owner_insert_price: 'ok:1', owner_total_amount: 'ok:1:0.01', owner_status: 'ok:1:approved', owner_payment: 'ok:1:pagato',
  owner_truncate: 'denied:0A000', other_customer_update: 'ok:0:236.85',
  admin_approve_pay: 'ok:1:approved/pagato', admin2_update: 'ok:1:true', service_insert: 'ok:1', service_update: 'ok:1:250',
  rpc_claim: `ok:1:${U.custA}`, rpc_supplier_quote: 'ok:1:receiving_quotes', rpc_accept_quote: 'ok:1:quote_selected', rpc_admin_revoke_payment: 'ok:1:in_attesa_pagamento',
  custA_campaigns: 'ok:4', custA_quotes: 'ok:2', admin_campaigns: 'ok:6',
  view_anon: ALL_ROWS, view_custA: ALL_ROWS, view_custB: ALL_ROWS, view_admin: ALL_ROWS, view_supplier: ALL_ROWS, view_service: ALL_ROWS,
};
const D6_EFFECT = {
  anon_update: 'denied:42501', anon_truncate: 'denied:42501', owner_insert_price: 'denied:42501:guard',
  owner_total_amount: 'ok:0:236.85', owner_status: 'ok:0:pending_review', owner_payment: 'ok:0:in_attesa_pagamento', owner_truncate: 'denied:42501',
};
const VIEW_EFFECT = { view_anon: 'denied:42501', view_custA: 'denied:42501', view_custB: 'denied:42501', view_admin: 'denied:42501', view_supplier: 'denied:42501' };
const D6_ONLY = { ...PRE, ...D6_EFFECT }; const VIEW_ONLY = { ...PRE, ...VIEW_EFFECT }; const BOTH = { ...PRE, ...D6_EFFECT, ...VIEW_EFFECT };

const data = async db => (await db.query(`select
  (select md5(string_agg(row_to_json(c)::text, '|' order by id)) from public.campaigns c) as c,
  (select md5(string_agg(row_to_json(q)::text, '|' order by id)) from public.quotes q) as q,
  (select md5(string_agg(row_to_json(a)::text, '|' order by id)) from public.campaign_analysis a) as a`)).rows[0];
const catalog = async db => (await db.query(`select
  (select json_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':' || coalesce(qual, '-') || ':' || coalesce(with_check, '-') order by policyname)::text from pg_policies where tablename = 'campaigns') as campaigns_policies,
  (select relacl::text from pg_class where oid = 'public.campaigns'::regclass) as campaigns_acl,
  (select json_agg(tgname order by tgname)::text from pg_trigger where tgrelid = 'public.campaigns'::regclass and not tgisinternal) as campaigns_triggers,
  (select count(*)::int from pg_proc where proname = 'campaigns_client_write_guard') as guard_fn,
  (select string_agg(e, ',' order by e) from pg_class, unnest(relacl::text[]) e where oid = 'public.campaign_summary'::regclass) as view_acl_sorted,
  (select reloptions::text from pg_class where oid = 'public.campaign_summary'::regclass) as view_options,
  md5(pg_get_viewdef('public.campaign_summary'::regclass, true)) as view_def_md5`)).rows[0];

test('engine: fixture reproduces both exposures; view definition matches the live md5', engine, async () => {
  const db = await buildDb();
  assert.equal((await catalog(db)).view_def_md5, 'ab3f147ae7ef5ece7555debe9afde189');
  assert.deepEqual(await matrix(db), PRE);
  await db.close();
});

for (const [name, seq] of [['D6 -> campaign_summary', [D6, CSV]], ['campaign_summary -> D6', [CSV, D6]]]) {
  test(`engine: ${name} gives the combined matrix, data untouched, idempotent`, engine, async () => {
    const db = await buildDb(); const d0 = await data(db);
    await db.exec(seq[0]);
    assert.deepEqual(await matrix(db), seq[0] === D6 ? D6_ONLY : VIEW_ONLY);
    await db.exec(seq[1]);
    assert.deepEqual(await matrix(db), BOTH);
    const once = await catalog(db);
    for (const sql of seq) await db.exec(sql);
    assert.deepEqual(await catalog(db), once);
    assert.deepEqual(await matrix(db), BOTH);
    assert.deepEqual(await data(db), d0);
    await db.close();
  });
}

for (const [name, first, second, mid] of [['view first', CSV_RB, D6_RB, D6_ONLY], ['D6 first', D6_RB, CSV_RB, VIEW_ONLY]]) {
  test(`engine: independent rollbacks (${name}) return to the exact Production catalog and behaviour`, engine, async () => {
    const db = await buildDb(); const c0 = await catalog(db); const d0 = await data(db);
    await db.exec(D6); await db.exec(CSV);
    await db.exec(first);
    assert.deepEqual(await matrix(db), mid);
    await db.exec(second);
    assert.deepEqual(await catalog(db), c0);
    assert.deepEqual(await matrix(db), PRE);
    assert.deepEqual(await data(db), d0);
    await db.close();
  });
}

test('engine: a failure after both migrations in one transaction leaves no partial state', engine, async () => {
  const db = await buildDb(); const c0 = await catalog(db);
  await db.exec('begin'); await db.exec(D6); await db.exec(CSV);
  await assert.rejects(db.exec('select 1/0'));
  await db.exec('rollback');
  assert.deepEqual(await catalog(db), c0);
  assert.deepEqual(await matrix(db), PRE);
  await db.close();
});

const verify = async (db, sql) => (await db.exec(sql)).find(r => r.rows?.[0]?.verification).rows[0].verification;
for (const [name, seq] of [['A=D6 then B=view', [[D6_APPLY, D6_VERIFY], [CSV_APPLY, CSV_VERIFY]]], ['B=view then A=D6', [[CSV_APPLY, CSV_VERIFY], [D6_APPLY, D6_VERIFY]]]]) {
  test(`engine release: guarded scripts ${name}: pre -> post each, history once each, combined matrix`, engine, async () => {
    const db = await buildDb(); const d0 = await data(db);
    for (const [apply, ver] of seq) {
      assert.equal((await verify(db, ver)).state, 'pre');
      await db.exec(apply);
      assert.equal((await verify(db, ver)).state, 'post');
    }
    const hist = (await db.query(`select string_agg(version, ',' order by version) as v from supabase_migrations.schema_migrations`)).rows[0].v;
    assert.equal(hist, '20261009120000,20261009150000,20261009160000');
    assert.deepEqual(await matrix(db), BOTH);
    assert.deepEqual(await data(db), d0);
    // Re-running either guarded script aborts with zero changes.
    for (const [apply] of seq) {
      const c = await catalog(db);
      await assert.rejects(db.exec(apply), /_ABORT/); await db.exec('rollback');
      assert.deepEqual(await catalog(db), c);
    }
    await db.close();
  });
}

test('engine release: view rollback + history delete returns verify to "pre" (ACL compared as a set)', engine, async () => {
  const db = await buildDb(); const pre = await verify(db, CSV_VERIFY);
  await db.exec(CSV_APPLY); await db.exec(CSV_RB);
  await db.exec(`delete from supabase_migrations.schema_migrations where version = '20261009160000'`);
  const after = await verify(db, CSV_VERIFY);
  assert.equal(after.state, 'pre');
  assert.notEqual(after.acl, pre.acl, 'candidate rollback re-orders ACL entries (documented, no security effect)');
  assert.deepEqual({ ...after, acl: null }, { ...pre, acl: null });
  await db.close();
});

test('engine release: both verify scripts are read-only', engine, async () => {
  const db = await buildDb();
  for (const v of [D6_VERIFY, CSV_VERIFY]) {
    await assert.rejects(db.exec(v.replace('select json_build_object(', `update public.campaigns set notes = 'x'; select json_build_object(`)), e => e.code === '25006');
    await db.exec('rollback');
  }
  await db.close();
});
