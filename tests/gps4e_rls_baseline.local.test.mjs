import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_LOCAL_URL = 'http://127.0.0.1:54321';
const DEFAULT_LOCAL_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const PRODUCTION_PROJECT_REF = 'mqkelrsvksrzrpmbstvd';

const repoRoot = resolve(import.meta.dirname, '..');
const linkedProjectRefPath = resolve(repoRoot, 'supabase/.temp/project-ref');
const runId = `gps4e-${Date.now()}-${randomUUID().slice(0, 8)}`;
const email = (label) => `${runId}-${label}@example.invalid`;
const password = `GPS4E-${randomUUID()}-local-only!`;
const localUrl = process.env.GPS4E_SUPABASE_URL || DEFAULT_LOCAL_URL;
const jwtSecret = process.env.GPS4E_JWT_SECRET || DEFAULT_LOCAL_JWT_SECRET;

const results = [];
const created = {
  authUserIds: [],
  pointIds: [],
  sessionIds: [],
  campaignIds: [],
  clienteIds: [],
};

function record(category, label, detail = '') {
  results.push({ category, label, detail });
  console.log(`${category.toUpperCase()} ${label}${detail ? ` — ${detail}` : ''}`);
}

function ensureLocalOnly() {
  assert.equal(process.env.GPS4E_ALLOW_LOCAL_RLS, 'true', 'GPS4E_ALLOW_LOCAL_RLS=true richiesto per eseguire test RLS locali');
  const parsed = new URL(localUrl);
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(parsed.hostname), `URL Supabase non locale: ${localUrl}`);
  assert.doesNotMatch(localUrl, /supabase\.co/i, 'URL Supabase remoto non consentito');
  assert.doesNotMatch(localUrl, new RegExp(PRODUCTION_PROJECT_REF, 'i'), 'project ref produzione non consentito');
  assert.ok(jwtSecret.length >= 32, 'JWT secret locale troppo corto');

  if (existsSync(linkedProjectRefPath)) {
    const projectRef = readFileSync(linkedProjectRefPath, 'utf8').trim();
    assert.ok(!projectRef, `Supabase project linked non consentito: ${projectRef}`);
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (!/^GPS4E_/.test(key)) continue;
    assert.doesNotMatch(String(value || ''), /supabase\.co/i, `${key} sembra puntare a Supabase remoto`);
    assert.doesNotMatch(String(value || ''), new RegExp(PRODUCTION_PROJECT_REF, 'i'), `${key} contiene project ref produzione`);
  }
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    aud: 'authenticated',
    iss: 'supabase',
    iat: now,
    exp: now + 3600,
    ...payload,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(fullPayload))}`;
  const signature = createHmac('sha256', jwtSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

const anonKey = signJwt({ role: 'anon' });
const serviceRoleKey = signJwt({ role: 'service_role' });

function userJwt(user, extra = {}) {
  return signJwt({
    role: 'authenticated',
    sub: user.id,
    email: user.email,
    ...extra,
  });
}

function supabaseFor(token) {
  return createClient(localUrl, token, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

const service = supabaseFor(serviceRoleKey);

function sqlValue(value) {
  if (value == null) return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlValue(JSON.stringify(value))}::jsonb`;
}

function sqlUuid(value) {
  return `${sqlValue(value)}::uuid`;
}

function sqlUuidList(values) {
  return values.length ? values.map(sqlUuid).join(',') : "null::uuid";
}

function dbExec(sql) {
  const result = spawnSync('docker', [
    'exec',
    '-i',
    'supabase_db_volantinipro',
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-q',
  ], {
    input: sql,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`local db exec failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

async function must(label, promise) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function isDeniedError(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return error && (
    error.code === '42501' ||
    error.status === 401 ||
    error.status === 403 ||
    text.includes('permission denied') ||
    text.includes('row-level security') ||
    text.includes('jwt')
  );
}

async function expectAllowed(label, operation) {
  const data = await operation();
  record('allowed', label);
  return data;
}

async function expectDenied(label, operation) {
  try {
    const data = await operation();
    if (Array.isArray(data) && data.length === 0) {
      record('denied', label, 'nessuna riga visibile');
      return null;
    }
    throw new Error(`${label}: operazione consentita inaspettatamente`);
  } catch (error) {
    if (!isDeniedError(error)) throw error;
    record('denied', label, error.code || error.message);
    return null;
  }
}

async function createAuthUser(label) {
  const data = await must(`create auth user ${label}`, service.auth.admin.createUser({
    email: email(label),
    password,
    email_confirm: true,
    user_metadata: { gps4e_fixture: true, runId, label },
  }));
  created.authUserIds.push(data.user.id);
  return data.user;
}

async function setupFixtures() {
  const [clientA, clientB, driverA, driverB, admin] = await Promise.all([
    createAuthUser('client-a'),
    createAuthUser('client-b'),
    createAuthUser('driver-a'),
    createAuthUser('driver-b'),
    createAuthUser('admin'),
  ]);

  const clienteAId = randomUUID();
  const clienteBId = randomUUID();
  const campaignAId = randomUUID();
  const campaignBId = randomUUID();
  created.clienteIds.push(clienteAId, clienteBId);
  created.campaignIds.push(campaignAId, campaignBId);

  dbExec(`
    insert into public.clienti (id, user_id, email, nome)
    values
      (${sqlUuid(clienteAId)}, ${sqlUuid(clientA.id)}, ${sqlValue(clientA.email)}, 'GPS4E Cliente A'),
      (${sqlUuid(clienteBId)}, ${sqlUuid(clientB.id)}, ${sqlValue(clientB.email)}, 'GPS4E Cliente B');

    insert into public.campaigns (
      id, user_id, customer_id, title, campaign_name, service_type,
      total_flyers, total_budget, status, is_test, source, metadata
    )
    values
      (
        ${sqlUuid(campaignAId)},
        ${sqlUuid(clientA.id)},
        ${sqlUuid(clienteAId)},
        ${sqlValue(`GPS4E Campaign A ${runId}`)},
        ${sqlValue(`GPS4E Campaign A ${runId}`)},
        'd2d',
        1000,
        100,
        'active',
        true,
        'gps4e_rls_fixture',
        ${sqlJson({ gps4e_fixture: true, runId, owner: 'client_a' })}
      ),
      (
        ${sqlUuid(campaignBId)},
        ${sqlUuid(clientB.id)},
        ${sqlUuid(clienteBId)},
        ${sqlValue(`GPS4E Campaign B ${runId}`)},
        ${sqlValue(`GPS4E Campaign B ${runId}`)},
        'd2d',
        1000,
        100,
        'active',
        true,
        'gps4e_rls_fixture',
        ${sqlJson({ gps4e_fixture: true, runId, owner: 'client_b' })}
      );
  `);

  return {
    users: { clientA, clientB, driverA, driverB, admin },
    campaigns: {
      campaignA: { id: campaignAId, user_id: clientA.id, customer_id: clienteAId, title: `GPS4E Campaign A ${runId}` },
      campaignB: { id: campaignBId, user_id: clientB.id, customer_id: clienteBId, title: `GPS4E Campaign B ${runId}` },
    },
  };
}

async function insertSession(client, values) {
  const data = await must('insert delivery session', client.from('delivery_sessions').insert(values).select('*').single());
  created.sessionIds.push(data.id);
  return data;
}

async function insertPoint(client, values) {
  const data = await must('insert GPS point', client.from('gps_tracking_points').insert(values).select('*').single());
  created.pointIds.push(data.id);
  return data;
}

async function cleanup() {
  if (created.authUserIds.length || created.clienteIds.length || created.campaignIds.length || created.sessionIds.length || created.pointIds.length) {
    dbExec(`
      delete from public.gps_tracking_points where id in (${sqlUuidList(created.pointIds)});
      delete from public.delivery_sessions where id in (${sqlUuidList(created.sessionIds)});
      delete from public.campaigns where id in (${sqlUuidList(created.campaignIds)});
      delete from public.clienti where id in (${sqlUuidList(created.clienteIds)});
    `);
  }
  for (const id of created.authUserIds.reverse()) {
    await service.auth.admin.deleteUser(id);
  }
}

ensureLocalOnly();

try {
  const { users, campaigns } = await setupFixtures();
  const driverAClient = supabaseFor(userJwt(users.driverA));
  const driverBClient = supabaseFor(userJwt(users.driverB));
  const clientAClient = supabaseFor(userJwt(users.clientA));
  const clientBClient = supabaseFor(userJwt(users.clientB));
  const adminClient = supabaseFor(userJwt(users.admin, { app_role: 'admin' }));
  const anonClient = supabaseFor(anonKey);

  const sessionA = await expectAllowed('driver_a crea delivery_session con driver_id proprio', () => insertSession(driverAClient, {
    campaign_id: campaigns.campaignA.id,
    driver_id: users.driverA.id,
    status: 'started',
    started_at: new Date().toISOString(),
  }));

  await expectDenied('driver_a non crea delivery_session con driver_id di driver_b', () => insertSession(driverAClient, {
    campaign_id: campaigns.campaignA.id,
    driver_id: users.driverB.id,
    status: 'started',
    started_at: new Date().toISOString(),
  }));

  await expectDenied('anon non crea delivery_session', () => insertSession(anonClient, {
    campaign_id: campaigns.campaignA.id,
    driver_id: users.driverA.id,
    status: 'started',
    started_at: new Date().toISOString(),
  }));

  const insecureSession = await insertSession(driverAClient, {
    campaign_id: campaigns.campaignB.id,
    driver_id: users.driverA.id,
    status: 'started',
    started_at: new Date().toISOString(),
  });
  record('insecure-current-baseline', 'driver_a può creare sessione su campagna non assegnata', `campaign_id=${insecureSession.campaign_id}`);

  await expectAllowed('driver_a inserisce punto nella propria sessione started', () => insertPoint(driverAClient, {
    campaign_id: campaigns.campaignA.id,
    session_id: sessionA.id,
    driver_id: users.driverA.id,
    lat: 45.4642,
    lng: 9.19,
    accuracy: 6,
    recorded_at: new Date().toISOString(),
  }));

  await expectDenied('driver_b non inserisce punto nella sessione di driver_a', () => insertPoint(driverBClient, {
    campaign_id: campaigns.campaignA.id,
    session_id: sessionA.id,
    driver_id: users.driverB.id,
    lat: 45.4643,
    lng: 9.1901,
    accuracy: 6,
    recorded_at: new Date().toISOString(),
  }));

  await expectDenied('driver_a non inserisce punto con campaign_id diverso dalla sessione', () => insertPoint(driverAClient, {
    campaign_id: campaigns.campaignB.id,
    session_id: sessionA.id,
    driver_id: users.driverA.id,
    lat: 45.4644,
    lng: 9.1902,
    accuracy: 6,
    recorded_at: new Date().toISOString(),
  }));

  const completedSession = { id: randomUUID() };
  created.sessionIds.push(completedSession.id);
  dbExec(`
    insert into public.delivery_sessions (
      id,
      campaign_id,
      driver_id,
      status,
      started_at,
      ended_at
    )
    values (
      ${sqlUuid(completedSession.id)},
      ${sqlUuid(campaigns.campaignA.id)},
      ${sqlUuid(users.driverA.id)},
      'completed',
      now(),
      now()
    );
  `);
  await expectDenied('driver_a non inserisce punto in sessione completed', () => insertPoint(driverAClient, {
    campaign_id: campaigns.campaignA.id,
    session_id: completedSession.id,
    driver_id: users.driverA.id,
    lat: 45.4645,
    lng: 9.1903,
    accuracy: 6,
    recorded_at: new Date().toISOString(),
  }));

  await expectAllowed('cliente proprietario legge punti della propria campagna', async () => {
    const rows = await must('client owner select gps points', clientAClient.from('gps_tracking_points').select('id,campaign_id').eq('campaign_id', campaigns.campaignA.id));
    assert.ok(rows.length >= 1);
    return rows;
  });

  await expectDenied('cliente non proprietario non legge punti di campaign_a', async () => {
    const rows = await must('client non-owner select gps points', clientBClient.from('gps_tracking_points').select('id,campaign_id').eq('campaign_id', campaigns.campaignA.id));
    return rows;
  });

  await expectAllowed('admin con app_role top-level legge punti GPS', async () => {
    const rows = await must('admin select gps points', adminClient.from('gps_tracking_points').select('id,campaign_id').eq('campaign_id', campaigns.campaignA.id));
    assert.ok(rows.length >= 1);
    return rows;
  });

  await expectDenied('anon non legge punti GPS', async () => {
    const rows = await must('anon select gps points', anonClient.from('gps_tracking_points').select('id,campaign_id').eq('campaign_id', campaigns.campaignA.id));
    return rows;
  });

  record('blocked-missing-assignment-model', 'operator_profiles non versionata nello schema baseline corrente');
  record('blocked-missing-assignment-model', 'operator_assignments non versionata nello schema baseline corrente');
  record('blocked-missing-assignment-model', 'RPC gps_* non versionate nello schema baseline corrente');

  const categories = new Set(results.map((item) => item.category));
  for (const category of ['allowed', 'denied', 'insecure-current-baseline', 'blocked-missing-assignment-model']) {
    assert.ok(categories.has(category), `categoria assente: ${category}`);
  }

  console.log(JSON.stringify({
    result: 'GPS4E_RLS_BASELINE_COMPLETE',
    localUrl,
    runId,
    realDataImported: false,
    categories: Object.fromEntries([...categories].map((category) => [category, results.filter((item) => item.category === category).length])),
  }, null, 2));
} finally {
  await cleanup();
}
