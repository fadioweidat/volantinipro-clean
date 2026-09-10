// Public Smart Pairing submission fix: saveSmartPairingWaitlist must use
// Prefer: return=minimal so PostgREST does a plain INSERT (no RETURNING).
//
// Root cause it fixes: `anon` has an INSERT grant + WITH CHECK policy on
// smart_pairing_waitlist but NO permissive SELECT policy for its own new row
// (waitlist_own needs a JWT email). With return=representation PostgREST runs
// INSERT ... RETURNING, whose RETURNING read is denied by RLS -> 42501 and the
// whole INSERT rolls back. return=minimal -> plain INSERT -> succeeds.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://proj.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'anon-test-key';

const SRC = readFileSync(new URL('../src/lib/supabaseClient.js', import.meta.url), 'utf8');
const STEP3 = readFileSync(new URL('../src/pages/public/configurator/Step3.jsx', import.meta.url), 'utf8');

const { saveSmartPairingWaitlist } = await import('../src/lib/supabaseClient.js');

// Records every fetch and returns a scripted response.
function installFetch(responder) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: (init.method || 'GET').toUpperCase(), headers: init.headers || {}, body: init.body });
    return responder(String(url), init);
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

const okEmpty = (status = 204) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => '',
});

const PAYLOAD = { nome: 'QA Test', email: 'qa.test@example.invalid', comune: 'nil_0_1', servizio: 'd2d' };

test('1+2. saveSmartPairingWaitlist sends Prefer: return=minimal (not representation)', async () => {
  const f = installFetch(() => okEmpty(204));
  try {
    await saveSmartPairingWaitlist(PAYLOAD);
    const post = f.calls.find((c) => c.method === 'POST' && c.url.includes('/smart_pairing_waitlist'));
    assert.ok(post, 'a POST to /rest/v1/smart_pairing_waitlist was made');
    assert.equal(post.headers.Prefer, 'return=minimal');
    assert.notEqual(post.headers.Prefer, 'return=representation');
  } finally { f.restore(); }
});

test('6+7. exactly one request (the INSERT), no follow-up SELECT/GET, no anon read', async () => {
  const f = installFetch(() => okEmpty(204));
  try {
    await saveSmartPairingWaitlist(PAYLOAD);
    assert.equal(f.calls.length, 1, 'no extra request after the INSERT');
    assert.equal(f.calls[0].method, 'POST');
    assert.ok(!f.calls.some((c) => c.method === 'GET'), 'no GET/SELECT issued');
  } finally { f.restore(); }
});

test('3. HTTP 204 empty body is treated as success (resolves, no throw)', async () => {
  const f = installFetch(() => okEmpty(204));
  try {
    const r = await saveSmartPairingWaitlist(PAYLOAD);
    assert.equal(r, null); // 204 -> null, not an error
  } finally { f.restore(); }
});

test('3b. HTTP 201 empty body is also treated as success', async () => {
  const f = installFetch(() => ({ ok: true, status: 201, text: async () => '' }));
  try {
    const r = await saveSmartPairingWaitlist(PAYLOAD);
    assert.equal(r, null);
  } finally { f.restore(); }
});

test('5. deduped insert (trigger RETURN NULL -> 2xx empty) is treated as success', async () => {
  // PostgREST returns 2xx with no rows when the BEFORE INSERT trigger suppresses
  const f = installFetch(() => okEmpty(200));
  try {
    const r = await saveSmartPairingWaitlist(PAYLOAD);
    assert.equal(r, null);
  } finally { f.restore(); }
});

test('4. 42501 / 4xx still throws (error is not swallowed)', async () => {
  const body = '{"code":"42501","message":"new row violates row-level security policy for table \\"smart_pairing_waitlist\\""}';
  const f = installFetch(() => ({ ok: false, status: 403, text: async () => body }));
  try {
    await assert.rejects(() => saveSmartPairingWaitlist(PAYLOAD), (err) => {
      assert.match(err.message, /42501|row-level security/);
      return true;
    });
  } finally { f.restore(); }
});

test('4b. generic 4xx without body still throws', async () => {
  const f = installFetch(() => ({ ok: false, status: 400, text: async () => '' }));
  try {
    await assert.rejects(() => saveSmartPairingWaitlist(PAYLOAD), /400/);
  } finally { f.restore(); }
});

test('source: saveSmartPairingWaitlist uses return=minimal and NOT return=representation', () => {
  const fnStart = SRC.indexOf('export async function saveSmartPairingWaitlist');
  assert.ok(fnStart > 0);
  const fnBody = SRC.slice(fnStart, SRC.indexOf('\nexport ', fnStart + 1));
  assert.match(fnBody, /prefer:\s*["']return=minimal["']/);
  assert.doesNotMatch(fnBody, /prefer:\s*["']return=representation["']/);
  // scoped: the change is local to this call, the module default is untouched
  assert.match(SRC, /async function supabaseRequest\([^)]*prefer = "return=representation"/);
});

test('caller contract: Step3 does not consume the returned row', () => {
  assert.match(STEP3, /await saveSmartPairingWaitlist\(waitlistPayload\);/);
  // not assigned to a variable
  assert.doesNotMatch(STEP3, /=\s*await saveSmartPairingWaitlist\(/);
  // success/error handling only
  assert.match(STEP3, /catch \(err\) \{[\s\S]{0,400}setFormError/);
  assert.match(STEP3, /setFormSent\(true\)/);
});
