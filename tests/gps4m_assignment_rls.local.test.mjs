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
const runId = `gps4m-${Date.now()}-${randomUUID().slice(0, 8)}`;
const email = (label) => `${runId}-${label}@example.invalid`;
const password = `GPS4M-${randomUUID()}-local-only!`;
const localUrl = process.env.GPS4M_SUPABASE_URL || DEFAULT_LOCAL_URL;
const jwtSecret = process.env.GPS4M_JWT_SECRET || DEFAULT_LOCAL_JWT_SECRET;
const DB_CONTAINER = process.env.GPS_SUPABASE_DB_CONTAINER ?? 'supabase_db_volantinipro';

const results = [];
const created = {
  assignmentIds: [],
  authUserIds: [],
  campaignIds: [],
  clienteIds: [],
  operatorProfileIds: [],
  pointIds: [],
  sessionIds: [],
};

function record(category, label, detail = '') {
  results.push({ category, label, detail });
  console.log(`${category.toUpperCase()} ${label}${detail ? ` — ${detail}` : ''}`);
}

function ensureLocalOnly() {
  assert.equal(process.env.GPS4M_ALLOW_LOCAL_RLS, 'true', 'GPS4M_ALLOW_LOCAL_RLS=true richiesto per eseguire test RLS locali');
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
    if (!/^GPS4M_/.test(key)) continue;
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

function dbScalar(sql) {
  return dbExec(`\\pset tuples_only on\n\\pset format unaligned\n${sql}`).trim();
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

function expectDbDenied(label, operation) {
  try {
    operation();
    throw new Error(`${label}: operazione consentita inaspettatamente`);
  } catch (error) {
    const text = `${error?.message || error}`.toLowerCase();
    if (!text.includes('violates foreign key constraint')) throw error;
    record('denied', label, 'foreign key constraint');
    return null;
  }
}

async function createAuthUser(label) {
  const data = await must(`create auth user ${label}`, service.auth.admin.createUser({
    email: email(label),
    password,
    email_confirm: true,
    user_metadata: { gps4m_fixture: true, runId, label },
  }));
  created.authUserIds.push(data.user.id);
  return data.user;
}

function preflightCutover() {
  const count = Number(dbScalar(`
    select count(*)
    from public.delivery_sessions
    where status in ('started', 'paused')
      and assignment_id is null;
  `));
  assert.equal(count, 0, `preflight cutover fallito: ${count} sessioni started/paused senza assignment_id`);
  record('preflight', 'zero sessioni started/paused con assignment_id IS NULL');
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
  const activeAssignmentId = randomUUID();
  const otherOperatorAssignmentId = randomUUID();
  const otherCampaignAssignmentId = randomUUID();
  const revokedAssignmentId = randomUUID();
  const completedAssignmentId = randomUUID();
  const futureAssignmentId = randomUUID();
  const expiredAssignmentId = randomUUID();

  created.clienteIds.push(clienteAId, clienteBId);
  created.campaignIds.push(campaignAId, campaignBId);
  created.operatorProfileIds.push(driverA.id, driverB.id);
  created.assignmentIds.push(
    activeAssignmentId,
    otherOperatorAssignmentId,
    otherCampaignAssignmentId,
    revokedAssignmentId,
    completedAssignmentId,
    futureAssignmentId,
    expiredAssignmentId,
  );

  dbExec(`
    insert into public.clienti (id, user_id, email, nome)
    values
      (${sqlUuid(clienteAId)}, ${sqlUuid(clientA.id)}, ${sqlValue(clientA.email)}, 'GPS4M Cliente A'),
      (${sqlUuid(clienteBId)}, ${sqlUuid(clientB.id)}, ${sqlValue(clientB.email)}, 'GPS4M Cliente B');

    insert into public.campaigns (
      id, customer_id, title, campaign_type, total_flyers, total_budget
    )
    values
      (
        ${sqlUuid(campaignAId)},
        ${sqlUuid(clienteAId)},
        ${sqlValue(`GPS4M Campaign A ${runId}`)},
        'standard',
        1000,
        100
      ),
      (
        ${sqlUuid(campaignBId)},
        ${sqlUuid(clienteBId)},
        ${sqlValue(`GPS4M Campaign B ${runId}`)},
        'standard',
        1000,
        100
      );

    insert into public.operator_profiles (id, display_name, status, metadata)
    values
      (${sqlUuid(driverA.id)}, 'GPS4M Driver A', 'active', ${sqlJson({ gps4m_fixture: true, runId })}),
      (${sqlUuid(driverB.id)}, 'GPS4M Driver B', 'active', ${sqlJson({ gps4m_fixture: true, runId })});

    insert into public.operator_assignments (
      id, operator_id, campaign_id, status, starts_at, ends_at, metadata
    )
    values
      (${sqlUuid(activeAssignmentId)}, ${sqlUuid(driverA.id)}, ${sqlUuid(campaignAId)}, 'active', now() - interval '1 hour', now() + interval '1 hour', ${sqlJson({ case: 'active', runId })}),
      (${sqlUuid(otherOperatorAssignmentId)}, ${sqlUuid(driverB.id)}, ${sqlUuid(campaignAId)}, 'active', now() - interval '1 hour', now() + interval '1 hour', ${sqlJson({ case: 'other_operator', runId })}),
      (${sqlUuid(otherCampaignAssignmentId)}, ${sqlUuid(driverA.id)}, ${sqlUuid(campaignBId)}, 'active', now() - interval '1 hour', now() + interval '1 hour', ${sqlJson({ case: 'other_campaign', runId })}),
      (${sqlUuid(revokedAssignmentId)}, ${sqlUuid(driverA.id)}, ${sqlUuid(campaignAId)}, 'revoked', now() - interval '1 hour', now() + interval '1 hour', ${sqlJson({ case: 'revoked', runId })}),
      (${sqlUuid(completedAssignmentId)}, ${sqlUuid(driverA.id)}, ${sqlUuid(campaignAId)}, 'completed', now() - interval '1 hour', now() + interval '1 hour', ${sqlJson({ case: 'completed', runId })}),
      (${sqlUuid(futureAssignmentId)}, ${sqlUuid(driverA.id)}, ${sqlUuid(campaignAId)}, 'active', now() + interval '1 hour', now() + interval '2 hours', ${sqlJson({ case: 'future', runId })}),
      (${sqlUuid(expiredAssignmentId)}, ${sqlUuid(driverA.id)}, ${sqlUuid(campaignAId)}, 'active', now() - interval '2 hours', now() - interval '1 hour', ${sqlJson({ case: 'expired', runId })});
  `);

  return {
    assignments: {
      active: activeAssignmentId,
      otherOperator: otherOperatorAssignmentId,
      otherCampaign: otherCampaignAssignmentId,
      revoked: revokedAssignmentId,
      completed: completedAssignmentId,
      future: futureAssignmentId,
      expired: expiredAssignmentId,
    },
    campaigns: {
      campaignA: { id: campaignAId, customer_id: clienteAId },
      campaignB: { id: campaignBId, customer_id: clienteBId },
    },
    users: { clientA, clientB, driverA, driverB, admin },
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

function sessionPayload({ campaignId, driverId, assignmentId, status = 'started' }) {
  const payload = {
    campaign_id: campaignId,
    driver_id: driverId,
    status,
    started_at: new Date().toISOString(),
  };
  if (assignmentId !== undefined) payload.assignment_id = assignmentId;
  return payload;
}

function pointPayload({ campaignId, sessionId, driverId }) {
  return {
    campaign_id: campaignId,
    session_id: sessionId,
    driver_id: driverId,
    lat: 45.4642,
    lng: 9.19,
    accuracy: 6,
    recorded_at: new Date().toISOString(),
  };
}

async function cleanup() {
  if (
    created.pointIds.length ||
    created.sessionIds.length ||
    created.assignmentIds.length ||
    created.operatorProfileIds.length ||
    created.campaignIds.length ||
    created.clienteIds.length
  ) {
    dbExec(`
      delete from public.gps_tracking_points where id in (${sqlUuidList(created.pointIds)});
      delete from public.delivery_sessions where id in (${sqlUuidList(created.sessionIds)});
      delete from public.operator_assignments where id in (${sqlUuidList(created.assignmentIds)});
      delete from public.operator_profiles where id in (${sqlUuidList(created.operatorProfileIds)});
      delete from public.campaigns where id in (${sqlUuidList(created.campaignIds)});
      delete from public.clienti where id in (${sqlUuidList(created.clienteIds)});
    `);
  }
  for (const id of created.authUserIds.reverse()) {
    await service.auth.admin.deleteUser(id);
  }
}

ensureLocalOnly();
preflightCutover();

try {
  const { assignments, campaigns, users } = await setupFixtures();
  const driverAClient = supabaseFor(userJwt(users.driverA));
  const driverBClient = supabaseFor(userJwt(users.driverB));
  const clientAClient = supabaseFor(userJwt(users.clientA));
  const clientBClient = supabaseFor(userJwt(users.clientB));
  const adminClient = supabaseFor(userJwt(users.admin, { app_role: 'admin' }));
  const anonClient = supabaseFor(anonKey);

  expectDbDenied('created_by inesistente in auth.users: FK negata', () => dbExec(`
    insert into public.operator_assignments (
      id, operator_id, campaign_id, status, starts_at, ends_at, created_by, metadata
    )
    values (
      ${sqlUuid(randomUUID())},
      ${sqlUuid(users.driverA.id)},
      ${sqlUuid(campaigns.campaignA.id)},
      'active',
      now() - interval '1 hour',
      now() + interval '1 hour',
      ${sqlUuid(randomUUID())},
      ${sqlJson({ case: 'invalid_created_by', runId })}
    );
  `));

  const sessionA = await expectAllowed('assignment active: driver_a crea sessione assegnata', () => insertSession(driverAClient, sessionPayload({
    campaignId: campaigns.campaignA.id,
    driverId: users.driverA.id,
    assignmentId: assignments.active,
  })));

  await expectDenied('assenza assignment: driver_a non crea sessione senza assignment_id', () => insertSession(driverAClient, sessionPayload({
    campaignId: campaigns.campaignA.id,
    driverId: users.driverA.id,
  })));

  await expectDenied('assignment altro operatore: driver_a non usa assignment di driver_b', () => insertSession(driverAClient, sessionPayload({
    campaignId: campaigns.campaignA.id,
    driverId: users.driverA.id,
    assignmentId: assignments.otherOperator,
  })));

  await expectDenied('campagna diversa: driver_a non usa assignment su campaign_b per campaign_a', () => insertSession(driverAClient, sessionPayload({
    campaignId: campaigns.campaignA.id,
    driverId: users.driverA.id,
    assignmentId: assignments.otherCampaign,
  })));

  await expectDenied('assignment revoked: sessione negata', () => insertSession(driverAClient, sessionPayload({
    campaignId: campaigns.campaignA.id,
    driverId: users.driverA.id,
    assignmentId: assignments.revoked,
  })));

  await expectDenied('assignment completed: sessione negata', () => insertSession(driverAClient, sessionPayload({
    campaignId: campaigns.campaignA.id,
    driverId: users.driverA.id,
    assignmentId: assignments.completed,
  })));

  await expectDenied('assignment futuro: sessione negata', () => insertSession(driverAClient, sessionPayload({
    campaignId: campaigns.campaignA.id,
    driverId: users.driverA.id,
    assignmentId: assignments.future,
  })));

  await expectDenied('assignment scaduto: sessione negata', () => insertSession(driverAClient, sessionPayload({
    campaignId: campaigns.campaignA.id,
    driverId: users.driverA.id,
    assignmentId: assignments.expired,
  })));

  const pointA = await expectAllowed('punto GPS su sessione valida: consentito', () => insertPoint(driverAClient, pointPayload({
    campaignId: campaigns.campaignA.id,
    sessionId: sessionA.id,
    driverId: users.driverA.id,
  })));

  await expectDenied('cross-driver: driver_b non inserisce punto nella sessione di driver_a', () => insertPoint(driverBClient, pointPayload({
    campaignId: campaigns.campaignA.id,
    sessionId: sessionA.id,
    driverId: users.driverB.id,
  })));

  await expectDenied('campaign mismatch: punto negato se campaign_id non combacia con sessione', () => insertPoint(driverAClient, pointPayload({
    campaignId: campaigns.campaignB.id,
    sessionId: sessionA.id,
    driverId: users.driverA.id,
  })));

  const completedSessionId = randomUUID();
  created.sessionIds.push(completedSessionId);
  dbExec(`
    insert into public.delivery_sessions (
      id,
      campaign_id,
      driver_id,
      assignment_id,
      status,
      started_at,
      ended_at
    )
    values (
      ${sqlUuid(completedSessionId)},
      ${sqlUuid(campaigns.campaignA.id)},
      ${sqlUuid(users.driverA.id)},
      ${sqlUuid(assignments.active)},
      'completed',
      now(),
      now()
    );
  `);

  await expectDenied('punto su sessione completed: negato', () => insertPoint(driverAClient, pointPayload({
    campaignId: campaigns.campaignA.id,
    sessionId: completedSessionId,
    driverId: users.driverA.id,
  })));

  await expectAllowed('cliente proprietario legge punti della propria campagna', async () => {
    const rows = await must('client owner select gps points', clientAClient.from('gps_tracking_points').select('id,campaign_id').eq('id', pointA.id));
    assert.equal(rows.length, 1);
    return rows;
  });

  await expectDenied('cliente non proprietario non legge punti della campagna altrui', async () => {
    const rows = await must('client non-owner select gps points', clientBClient.from('gps_tracking_points').select('id,campaign_id').eq('id', pointA.id));
    return rows;
  });

  await expectAllowed('admin con app_role top-level legge punti GPS', async () => {
    const rows = await must('admin select gps points', adminClient.from('gps_tracking_points').select('id,campaign_id').eq('id', pointA.id));
    assert.equal(rows.length, 1);
    return rows;
  });

  await expectDenied('anon non legge punti GPS', async () => {
    const rows = await must('anon select gps points', anonClient.from('gps_tracking_points').select('id,campaign_id').eq('id', pointA.id));
    return rows;
  });

  const categories = new Set(results.map((item) => item.category));
  for (const category of ['preflight', 'allowed', 'denied']) {
    assert.ok(categories.has(category), `categoria assente: ${category}`);
  }

  console.log(JSON.stringify({
    result: 'GPS4M_ASSIGNMENT_RLS_COMPLETE',
    localUrl,
    runId,
    realDataImported: false,
    categories: Object.fromEntries([...categories].map((category) => [category, results.filter((item) => item.category === category).length])),
  }, null, 2));
} finally {
  await cleanup();
}
