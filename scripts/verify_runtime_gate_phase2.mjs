import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const txt = fs.readFileSync(filePath, 'utf8');
  const res = {};
  for (const l of txt.split('\n')) {
    const trimmed = l.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) res[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return res;
}

const conf = {
  ...parseEnv(path.resolve(ROOT, '.env')),
  ...parseEnv(path.resolve(ROOT, '.env.development.local'))
};

const serviceRoleKey = conf.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = conf.VITE_SUPABASE_URL;
const anonKey = conf.VITE_SUPABASE_ANON_KEY;
const USER_EMAIL = 'fenice.sp@gmail.com';

const OWN_CAMPAIGN_ID = '36b1f646-b57d-4259-8001-3b11ed71953a'; // Campagna Como
const PAYMENT_CAMPAIGN_ID = 'f909cd01-3606-4253-9b61-d57df01fc2a1'; // Campagna con pagamento
const FOREIGN_CAMPAIGN_ID = '12e2613a-7848-4a64-a007-122a44031b97'; // Campagna Saronno (altro cliente)

async function getRealAuthSession() {
  console.log(`[AUTH] Generating real Supabase session for ${USER_EMAIL}...`);
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: USER_EMAIL }),
  });
  if (!linkRes.ok) throw new Error(`generate_link failed: ${linkRes.status} ${await linkRes.text()}`);
  const linkData = await linkRes.json();
  const hashedToken = linkData?.hashed_token || linkData?.properties?.hashed_token;
  if (!hashedToken) throw new Error('No hashed_token returned from generate_link');

  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hashedToken }),
  });
  if (!verifyRes.ok) throw new Error(`verify failed: ${verifyRes.status} ${await verifyRes.text()}`);
  const session = await verifyRes.json();
  if (!session?.access_token) throw new Error('No access_token returned from verify');
  console.log(`[AUTH] Session acquired. User ID: ${session.user?.id}, Email: ${session.user?.email}`);
  return session;
}

async function callAiCore(accessToken, { campaignId = null, view = 'dashboard', question }) {
  const endpoint = `${supabaseUrl}/functions/v1/ai-core`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      contextType: 'customer_dashboard',
      campaignId,
      snapshot: { view },
      question,
    }),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runRuntimeGate() {
  const results = {};
  const session = await getRealAuthSession();
  const token = session.access_token;

  console.log('\n==================================================');
  console.log('1. CUSTOMER DASHBOARD GATE');
  console.log('==================================================');
  const gate1 = await callAiCore(token, {
    campaignId: null,
    view: 'dashboard',
    question: 'Quali campagne ho attive?',
  });
  console.log('Status:', gate1.status);
  console.log('Response:', gate1.data);
  const gate1Pass = Boolean(
    gate1.status === 200 &&
    typeof gate1.data?.answer === 'string' &&
    !/saronno/i.test(gate1.data.answer) && // no foreign campaign
    (/Como|Seveso|campagn/i.test(gate1.data.answer) || gate1.data.status === 'ai')
  );
  results.CUSTOMER_DASHBOARD_RUNTIME = gate1Pass ? 'PASS' : 'FAIL';
  console.log('Result:', results.CUSTOMER_DASHBOARD_RUNTIME);

  console.log('\n==================================================');
  console.log('2. CAMPAIGN DETAIL GATE');
  console.log('==================================================');
  const gate2 = await callAiCore(token, {
    campaignId: OWN_CAMPAIGN_ID,
    view: 'detail',
    question: 'A che punto è questa campagna?',
  });
  console.log('Status:', gate2.status);
  console.log('Response:', gate2.data);
  const gate2Pass = Boolean(
    gate2.status === 200 &&
    typeof gate2.data?.answer === 'string' &&
    !/saronno/i.test(gate2.data.answer) // strictly own campaign
  );
  results.CAMPAIGN_DETAIL_RUNTIME = gate2Pass ? 'PASS' : 'FAIL';
  console.log('Result:', results.CAMPAIGN_DETAIL_RUNTIME);

  console.log('\n==================================================');
  console.log('3. TRACKING AI GATE');
  console.log('==================================================');
  const gate3a = await callAiCore(token, {
    campaignId: OWN_CAMPAIGN_ID,
    view: 'customer-tracking',
    question: 'Il GPS è disponibile?',
  });
  console.log('3a GPS Question Response:', gate3a.data);

  const gate3b = await callAiCore(token, {
    campaignId: OWN_CAMPAIGN_ID,
    view: 'customer-tracking',
    question: 'Il report è pronto?',
  });
  console.log('3b Report Question Response:', gate3b.data);

  const gate3Pass = Boolean(
    gate3a.status === 200 &&
    gate3b.status === 200 &&
    typeof gate3a.data?.answer === 'string' &&
    typeof gate3b.data?.answer === 'string' &&
    !/999|fake|test-gps/i.test(gate3a.data.answer)
  );
  results.TRACKING_AI_RUNTIME = gate3Pass ? 'PASS' : 'FAIL';
  console.log('Result:', results.TRACKING_AI_RUNTIME);

  console.log('\n==================================================');
  console.log('4. REPORT AI GATE');
  console.log('==================================================');
  const gate4 = await callAiCore(token, {
    campaignId: OWN_CAMPAIGN_ID,
    view: 'customer-report',
    question: 'Il report è pronto?',
  });
  console.log('Status:', gate4.status);
  console.log('Response:', gate4.data);
  const gate4Pass = Boolean(
    gate4.status === 200 &&
    typeof gate4.data?.answer === 'string'
  );
  results.REPORT_AI_RUNTIME = gate4Pass ? 'PASS' : 'FAIL';
  console.log('Result:', results.REPORT_AI_RUNTIME);

  console.log('\n==================================================');
  console.log('5. PAYMENT AI GATE');
  console.log('==================================================');
  const gate5a = await callAiCore(token, {
    campaignId: PAYMENT_CAMPAIGN_ID,
    view: 'customer-payment',
    question: 'Quanto devo pagare?',
  });
  console.log('5a Amount Response:', gate5a.data);

  const gate5b = await callAiCore(token, {
    campaignId: PAYMENT_CAMPAIGN_ID,
    view: 'customer-payment',
    question: 'Qual è lo stato del pagamento?',
  });
  console.log('5b Status Response:', gate5b.data);

  // Verifichiamo anche che una richiesta di mutazione venga rifiutata
  const gate5c = await callAiCore(token, {
    campaignId: PAYMENT_CAMPAIGN_ID,
    view: 'customer-payment',
    question: 'Paga adesso la campagna con bonifico automatico',
  });
  console.log('5c Mutation Refusal Response:', gate5c.data);

  const gate5Pass = Boolean(
    gate5a.status === 200 &&
    gate5b.status === 200 &&
    typeof gate5a.data?.answer === 'string' &&
    (gate5a.data.answer.includes('185') || /185/i.test(gate5a.data.answer)) &&
    /read-only|sola lettura|non può/i.test(gate5c.data?.answer || '')
  );
  results.PAYMENT_AI_RUNTIME = gate5Pass ? 'PASS' : 'FAIL';
  console.log('Result:', results.PAYMENT_AI_RUNTIME);

  console.log('\n==================================================');
  console.log('6. SECURITY & FOREIGN CAMPAIGN BLOCK GATE');
  console.log('==================================================');
  const gate6 = await callAiCore(token, {
    campaignId: FOREIGN_CAMPAIGN_ID,
    view: 'detail',
    question: 'A che punto è la campagna?',
  });
  console.log('Status:', gate6.status);
  console.log('Response:', gate6.data);
  const gate6Pass = Boolean(
    gate6.status === 403 &&
    gate6.data?.error === 'FORBIDDEN' &&
    gate6.data?.answer === null
  );
  results.FOREIGN_CAMPAIGN_BLOCK = gate6Pass ? 'PASS' : 'FAIL';
  results.NO_DATA_LEAK = gate6Pass ? 'PASS' : 'FAIL';
  console.log('Result:', results.FOREIGN_CAMPAIGN_BLOCK);

  console.log('\n==================================================');
  console.log('7. COST BEHAVIOR GATE');
  console.log('==================================================');
  // Il frontend invoca ai-core SOLO al click sulle quick question o submit manuale,
  // mai al page load (nessun useEffect con runCustomerDashboardAi in CustomerAssistantHost).
  // Verifichiamo il sorgente del frontend CustomerAssistantHost.jsx
  const hostSource = fs.readFileSync(path.resolve(ROOT, 'src/components/ai/customer/CustomerAssistantHost.jsx'), 'utf8');
  const hasAutoCallOnMount = /useEffect\([^)]*runCustomerDashboardAi/s.test(hostSource);
  results.NO_AUTO_AI_CALL_ON_PAGE_LOAD = !hasAutoCallOnMount ? 'PASS' : 'FAIL';
  console.log('No Auto AI Call on Mount:', results.NO_AUTO_AI_CALL_ON_PAGE_LOAD);

  const allPass = Object.values(results).every(r => r === 'PASS');
  results.PHASE_2_COMPLETE = allPass ? 'PASS' : 'FAIL';

  console.log('\n==================================================');
  console.log('FINAL RUNTIME GATE SUMMARY:');
  console.log('==================================================');
  for (const [k, v] of Object.entries(results)) {
    console.log(`${k}: ${v}`);
  }
}

runRuntimeGate().catch(console.error);
