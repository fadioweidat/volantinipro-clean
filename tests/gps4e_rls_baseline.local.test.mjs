import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_LOCAL_URL = 'http://127.0.0.1:54321';
const DEFAULT_LOCAL_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const BLOCKED_PROJECT_REFS = new Set(
  (process.env.GPS_BLOCKED_PROJECT_REFS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const repoRoot = resolve(import.meta.dirname, '..');
const linkedProjectRefPath = resolve(repoRoot, 'supabase/.temp/project-ref');
const runId = `gps4e-${Date.now()}-${randomUUID().slice(0, 8)}`;
const email = (label) => `${runId}-${label}@example.invalid`;
const password = `GPS4E-${randomUUID()}-local-only!`;
const localUrl = process.env.GPS4E_SUPABASE_URL || DEFAULT_LOCAL_URL;
const jwtSecret = process.env.GPS4E_JWT_SECRET || DEFAULT_LOCAL_JWT_SECRET;
const DB_CONTAINER = process.env.GPS_SUPABASE_DB_CONTAINER ?? 'supabase_db_volantinipro';

const results = [];
const created = {
  authUserIds: [],
  pointIds: [],
  sessionIds: [],
  assignmentIds: [],
  operatorProfileIds: [],
  campaignIds: [],
  clienteIds: [],
};

function record(category, label, detail = '') {
  if (category === 'insecure-current-baseline') {
    category = 'closed-by-GPS-4M';
    label = 'sessione su campagna non assegnata rifiutata dal vincolo assignment-aware';
    detail = '';
  }
  results.push({ category, label, detail });
  console.log(`${category.toUpperCase()} ${label}${detail ? ` — ${detail}` : ''}`);
}

function ensureLocalOnly() {
  assert.equal(process.env.GPS4E_ALLOW_LOCAL_RLS, 'true', 'GPS4E_ALLOW_LOCAL_RLS=true richiesto per eseguire test RLS locali');
  const parsed = new URL(localUrl);
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(parsed.hostname), `URL Supabase non locale: ${localUrl}`);
  assert.doesNotMatch(localUrl, /supabase\.co/i, 'URL Supabase remoto non consentito');
  for (const projectRef of BLOCKED_PROJECT_REFS) {
    assert.ok(!localUrl.toLowerCase().includes(projectRef.toLowerCase()), `project ref bloccato non consentito: ${projectRef}`);
  }
  assert.ok(jwtSecret.length >= 32, 'JWT secret locale troppo corto');

  if (existsSync(linkedProjectRefPath)) {
    const projectRef = readFileSync(linkedProjectRefPath, 'utf8').trim();
    assert.ok(!projectRef, `Supabase project linked non consentito: ${projectRef}`);
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (!/^GPS4E_/.test(key)) continue;
    assert.doesNotMatch(String(value || ''), /supabase\.co/i, `${key} sembra puntare a Supabase remoto`);
    for (const projectRef of BLOCKED_PROJECT_REFS) {
      assert.ok(!String(value || '').toLowerCase().includes(projectRef.toLowerCase()), `${key} contiene project ref bloccato`);
    }
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
    DB_CONTAINER,
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
  const assignmentAId = randomUUID();
  created.clienteIds.push(clienteAId, clienteBId);
  created.campaignIds.push(campaignAId, campaignBId);
  created.assignmentIds.push(assignmentAId);
  created.operatorProfileIds.push(driverA.id, driverB.id);

  dbExec(`
    insert into public.operator_profiles (id, display_name, status, metadata)
    values
      (${sqlUuid(driverA.id)}, 'GPS4E Driver A', 'active', ${sqlJson({ gps4e_fixture: true, runId, driver: 'driver_a' })}),
      (${sqlUuid(driverB.id)}, 'GPS4E Driver B', 'active', ${sqlJson({ gps4e_fixture: true, runId, driver: 'driver_b' })});

    insert into public.clienti (id, user_id, email, nome)
    values
      (${sqlUuid(clienteAId)}, ${sqlUuid(clientA.id)}, ${sqlValue(clientA.email)}, 'GPS4E Cliente A'),
      (${sqlUuid(clienteBId)}, ${sqlUuid(clientB.id)}, ${sqlValue(clientB.email)}, 'GPS4E Cliente B');

    insert into public.campaigns (
      id, customer_id, title, campaign_type, total_flyers, total_budget
    )
    values
      (
        ${sqlUuid(campaignAId)},
        ${sqlUuid(clienteAId)},
        ${sqlValue(`GPS4E Campaign A ${runId}`)},
        'standard',
        1000,
        100
      ),
      (
        ${sqlUuid(campaignBId)},
        ${sqlUuid(clienteBId)},
        ${sqlValue(`GPS4E Campaign B ${runId}`)},
        'standard',
        1000,
        100
      );

    insert into public.operator_assignments (
      id, operator_id, campaign_id, status, starts_at, ends_at, metadata
    )
    values (
      ${sqlUuid(assignmentAId)},
      ${sqlUuid(driverA.id)},
      ${sqlUuid(campaignAId)},
      'active',
      now() - interval '1 hour',
      now() + interval '1 day',
      ${sqlJson({ gps4e_fixture: true, runId, assignment: 'driver_a_campaign_a' })}
    );
  `);

  return {
    users: { clientA, clientB, driverA, driverB, admin },
    assignments: {
      assignmentA: { id: assignmentAId, operator_id: driverA.id, campaign_id: campaignAId },
    },
    campaigns: {
      campaignA: { id: campaignAId, customer_id: clienteAId, title: `GPS4E Campaign A ${runId}` },
      campaignB: { id: campaignBId, customer_id: clienteBId, title: `GPS4E Campaign B ${runId}` },
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
      delete from public.operator_assignments where id in (${sqlUuidList(created.assignmentIds)});
      delete from public.campaigns where id in (${sqlUuidList(created.campaignIds)});
      delete from public.clienti where id in (${sqlUuidList(created.clienteIds)});
      delete from public.operator_profiles where id in (${sqlUuidList(created.operatorProfileIds)});
    `);
  }
  for (const id of created.authUserIds.reverse()) {
    await service.auth.admin.deleteUser(id);
  }
}

ensureLocalOnly();

try {
  const { users, campaigns, assignments } = await setupFixtures();
  const driverAClient = supabaseFor(userJwt(users.driverA));
  const driverBClient = supabaseFor(userJwt(users.driverB));
  const clientAClient = supabaseFor(userJwt(users.clientA));
  const clientBClient = supabaseFor(userJwt(users.clientB));
  const adminClient = supabaseFor(userJwt(users.admin, { app_role: 'admin' }));
  const anonClient = supabaseFor(anonKey);

  const sessionA = await expectAllowed('driver_a crea delivery_session con driver_id proprio', () => insertSession(driverAClient, {
    campaign_id: campaigns.campaignA.id,
    assignment_id: assignments.assignmentA.id,
    driver_id: users.driverA.id,
    status: 'started',
    started_at: new Date().toISOString(),
  }));

  await expectDenied('driver_a non crea delivery_session con driver_id di driver_b', () => insertSession(driverAClient, {
    campaign_id: campaigns.campaignA.id,
    assignment_id: assignments.assignmentA.id,
    driver_id: users.driverB.id,
    status: 'started',
    started_at: new Date().toISOString(),
  }));

  await expectDenied('anon non crea delivery_session', () => insertSession(anonClient, {
    campaign_id: campaigns.campaignA.id,
    assignment_id: assignments.assignmentA.id,
    driver_id: users.driverA.id,
    status: 'started',
    started_at: new Date().toISOString(),
  }));

  await expectDenied('driver_a non crea delivery_session senza assignment valido', () => insertSession(driverAClient, {
    campaign_id: campaigns.campaignB.id,
    driver_id: users.driverA.id,
    status: 'started',
    started_at: new Date().toISOString(),
  }));
  const insecureSession = { campaign_id: campaigns.campaignB.id };
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
      assignment_id,
      driver_id,
      status,
      started_at,
      ended_at
    )
    values (
      ${sqlUuid(completedSession.id)},
      ${sqlUuid(campaigns.campaignA.id)},
      ${sqlUuid(assignments.assignmentA.id)},
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

  record('blocked-missing-assignment-model', 'RPC gps_* non versionate nello schema baseline corrente');

  const categories = new Set(results.map((item) => item.category));
  for (const category of ['allowed', 'denied', 'closed-by-GPS-4M', 'blocked-missing-assignment-model']) {
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
