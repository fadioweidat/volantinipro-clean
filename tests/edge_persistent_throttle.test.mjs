// Test Suite: Edge Function Persistent Throttle, Idempotency & Rate Limit
// Verifica offline completa delle invarianti di sicurezza, schema DB, hashing e logica RPC.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// Helper SHA-256
const sha256 = (str) => crypto.createHash("sha256").update(str).digest("hex");

// ── 1. Verifica Migration SQL (20260904100000_edge_function_persistent_throttle.sql) ──
test("MIGRATION: contiene le tabelle e constraint attese", () => {
  const sql = read("supabase/migrations/20260904100000_edge_function_persistent_throttle.sql");

  // Tabelle
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.edge_rate_limit_buckets/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.edge_idempotency_keys/i);

  // Colonne sicure (nessun raw email / raw ip)
  assert.match(sql, /recipient_hash text NOT NULL/i);
  assert.match(sql, /ip_hash text NULL/i);
  assert.match(sql, /identifier_hash text NOT NULL/i);
  assert.doesNotMatch(sql, /recipient_email/i);
  assert.doesNotMatch(sql, /client_ip\b/i);

  // Constraint UNIQUE
  assert.match(sql, /CONSTRAINT uq_edge_rate_limit_bucket UNIQUE \(scope, identifier_type, identifier_hash\)/i);
  assert.match(sql, /CONSTRAINT uq_edge_idempotency_key UNIQUE \(idempotency_key\)/i);
  assert.match(sql, /CHECK \(status IN \('pending', 'sent', 'failed'\)\)/i);
});

test("MIGRATION: RLS abilitato e permessi revocati da anon/authenticated (solo service_role)", () => {
  const sql = read("supabase/migrations/20260904100000_edge_function_persistent_throttle.sql");

  assert.match(sql, /ALTER TABLE public\.edge_rate_limit_buckets ENABLE ROW LEVEL SECURITY;/i);
  assert.match(sql, /ALTER TABLE public\.edge_idempotency_keys ENABLE ROW LEVEL SECURITY;/i);

  assert.match(sql, /REVOKE ALL ON TABLE public\.edge_rate_limit_buckets FROM PUBLIC, anon, authenticated;/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.edge_idempotency_keys FROM PUBLIC, anon, authenticated;/i);

  assert.match(sql, /GRANT ALL ON TABLE public\.edge_rate_limit_buckets TO service_role;/i);
  assert.match(sql, /GRANT ALL ON TABLE public\.edge_idempotency_keys TO service_role;/i);
});

test("MIGRATION: RPC SECURITY DEFINER presenti con permessi ristretti a service_role", () => {
  const sql = read("supabase/migrations/20260904100000_edge_function_persistent_throttle.sql");

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.check_idempotency_and_mark/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.mark_idempotency_result/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.consume_edge_rate_limit/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cleanup_edge_throttle_state/i);

  // SECURITY DEFINER + search_path
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = public, pg_temp/i);

  // Revoke da anon/authenticated
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.check_idempotency_and_mark/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.mark_idempotency_result/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.consume_edge_rate_limit/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.cleanup_edge_throttle_state/i);

  // Grant a service_role
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.check_idempotency_and_mark.*TO service_role;/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.mark_idempotency_result.*TO service_role;/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.consume_edge_rate_limit.*TO service_role;/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.cleanup_edge_throttle_state.*TO service_role;/i);
});

test("MIGRATION: NESSUN cron job creato (pulizia futura separata)", () => {
  const sql = read("supabase/migrations/20260904100000_edge_function_persistent_throttle.sql");

  assert.doesNotMatch(sql, /cron\.schedule/i);
  assert.doesNotMatch(sql, /edge-throttle-state-cleanup-hourly/i);
});

// ── 2. Verifica Edge Function (supabase/functions/send-email-conferma/index.ts) ──
test("EDGE FUNCTION: hashing recipient e IP con SHA-256 prima di qualunque log o DB call", () => {
  const src = read("supabase/functions/send-email-conferma/index.ts");

  assert.match(src, /sha256Hex/);
  assert.match(src, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(src, /recipientHash = await sha256Hex\(recipientEmail\)/);
  assert.match(src, /ipHash = await sha256Hex\(clientIp\)/);

  // Idempotency key usa recipientHash, non email in chiaro
  assert.match(src, /buildPersistentIdempotencyKey/);
  assert.match(src, /\$\{type\}:\$\{recipientHash\}/);
});

test("EDGE FUNCTION: RPC atomiche invocate in sequenza corretta", () => {
  const src = read("supabase/functions/send-email-conferma/index.ts");

  assert.match(src, /supabase\.rpc\("check_idempotency_and_mark"/);
  assert.match(src, /supabase\.rpc\("consume_edge_rate_limit"/);
  assert.match(src, /supabase\.rpc\("mark_idempotency_result"/);
  assert.match(src, /deduped:\s*true/);
  assert.match(src, /RETRY_TOO_EARLY/);
  assert.match(src, /RATE_LIMITED/);
});

test("EDGE FUNCTION: nessun log di dati sensibili / email / PII", () => {
  const src = read("supabase/functions/send-email-conferma/index.ts");

  assert.doesNotMatch(src, /console\.\w+\([^)]*recipientEmail\b/);
  assert.doesNotMatch(src, /console\.\w+\([^)]*clientIp\b/);
  assert.doesNotMatch(src, /console\.\w+\([^)]*raw\.cliente\b/);
});

// ── 3. Simulazione Logica Idempotency & Rate Limit Engine ───────────────────
class MockPersistentThrottleDb {
  constructor() {
    this.idempotency = new Map();
    this.rateLimits = new Map();
  }

  checkIdempotencyAndMark({ key, emailType, recipientHash, ipHash, cooldownSeconds = 60, ttlSeconds = 86400 }) {
    const now = Date.now();
    const existing = this.idempotency.get(key);

    if (!existing) {
      this.idempotency.set(key, {
        key,
        emailType,
        recipientHash,
        ipHash,
        status: "pending",
        attemptCount: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
        expiresAt: now + ttlSeconds * 1000,
      });
      return { action: "proceed", status: "new", attempt_count: 1 };
    }

    if (existing.status === "sent") {
      return {
        action: "dedup",
        status: "sent",
        provider_message_id: existing.providerMessageId || "msg_mock",
        attempt_count: existing.attemptCount,
      };
    }

    if (existing.status === "pending") {
      if (now - existing.lastAttemptAt < 120000) {
        return { action: "in_progress", status: "pending", attempt_count: existing.attemptCount };
      }
    }

    const cooldownMs = cooldownSeconds * 1000;
    if (now - existing.lastAttemptAt < cooldownMs) {
      return {
        action: "cooldown",
        status: existing.status,
        retry_after_seconds: Math.ceil((existing.lastAttemptAt + cooldownMs - now) / 1000),
        attempt_count: existing.attemptCount,
      };
    }

    existing.status = "pending";
    existing.attemptCount += 1;
    existing.lastAttemptAt = now;
    existing.errorCode = null;
    return { action: "proceed", status: "retry", attempt_count: existing.attemptCount };
  }

  markIdempotencyResult({ key, status, providerMessageId, errorCode }) {
    const rec = this.idempotency.get(key);
    if (rec) {
      rec.status = status;
      if (providerMessageId) rec.providerMessageId = providerMessageId;
      if (errorCode) rec.errorCode = errorCode;
      rec.lastAttemptAt = Date.now();
    }
  }

  consumeRateLimit({ scope, identifierType, identifierHash, maxRequests = 5, windowSeconds = 600 }) {
    const now = Date.now();
    const k = `${scope}:${identifierType}:${identifierHash}`;
    const windowMs = windowSeconds * 1000;
    let b = this.rateLimits.get(k);

    if (!b || now >= b.windowStart + windowMs) {
      b = { tokens: 1, windowStart: now, expiresAt: now + windowMs };
      this.rateLimits.set(k, b);
      return { allowed: true, tokens: 1, max_requests: maxRequests, retry_after_seconds: 0 };
    }

    b.tokens += 1;
    if (b.tokens <= maxRequests) {
      return { allowed: true, tokens: b.tokens, max_requests: maxRequests, retry_after_seconds: 0 };
    }

    const retryAfter = Math.max(1, Math.ceil((b.windowStart + windowMs - now) / 1000));
    return { allowed: false, tokens: b.tokens, max_requests: maxRequests, retry_after_seconds: retryAfter };
  }
}

test("THROTTLE ENGINE: 2 richieste identiche simultanee -> 1 send, 1 dedup", () => {
  const db = new MockPersistentThrottleDb();
  const recipient = "cliente@example.com";
  const rHash = sha256(recipient);
  const key = `preventivo:${rHash}:q1:req_123`;

  // 1a richiesta
  const step1 = db.checkIdempotencyAndMark({ key, emailType: "preventivo", recipientHash: rHash });
  assert.equal(step1.action, "proceed");
  assert.equal(step1.status, "new");

  // 2a richiesta simultanea (mentre la 1a è ancora pending)
  const step2 = db.checkIdempotencyAndMark({ key, emailType: "preventivo", recipientHash: rHash });
  assert.equal(step2.action, "in_progress");

  // 1a completa con successo
  db.markIdempotencyResult({ key, status: "sent", providerMessageId: "resend_123" });

  // 3a richiesta successiva -> deduped
  const step3 = db.checkIdempotencyAndMark({ key, emailType: "preventivo", recipientHash: rHash });
  assert.equal(step3.action, "dedup");
  assert.equal(step3.status, "sent");
  assert.equal(step3.provider_message_id, "resend_123");
});

test("THROTTLE ENGINE: 8 richieste identiche consecutive -> 1 solo invio reale, 0 token rate limit consumati dai 7 duplicati", () => {
  const db = new MockPersistentThrottleDb();
  const recipient = "mario@example.com";
  const rHash = sha256(recipient);
  const key = `preventivo:${rHash}:q1:req_burst`;

  let actualSends = 0;
  for (let i = 0; i < 8; i++) {
    const idem = db.checkIdempotencyAndMark({ key, emailType: "preventivo", recipientHash: rHash });
    if (idem.action === "proceed") {
      const rl = db.consumeRateLimit({ scope: "email_preventivo", identifierType: "recipient", identifierHash: rHash, maxRequests: 5 });
      assert.ok(rl.allowed);
      actualSends++;
      db.markIdempotencyResult({ key, status: "sent", providerMessageId: `msg_${actualSends}` });
    } else {
      assert.ok(idem.action === "dedup" || idem.action === "in_progress");
    }
  }

  assert.equal(actualSends, 1);
  // I token consumati nel bucket rate limit sono esattamente 1
  const b = db.rateLimits.get(`email_preventivo:recipient:${rHash}`);
  assert.equal(b.tokens, 1);
});

test("THROTTLE ENGINE: richieste diverse generano send separati fino al limite di 5 in 10 minuti", () => {
  const db = new MockPersistentThrottleDb();
  const recipient = "luigi@example.com";
  const rHash = sha256(recipient);

  let successSends = 0;
  let rateLimitedSends = 0;

  for (let i = 1; i <= 7; i++) {
    const key = `preventivo:${rHash}:quote_${i}:req_${i}`;
    const idem = db.checkIdempotencyAndMark({ key, emailType: "preventivo", recipientHash: rHash });
    assert.equal(idem.action, "proceed");

    const rl = db.consumeRateLimit({ scope: "email_preventivo", identifierType: "recipient", identifierHash: rHash, maxRequests: 5, windowSeconds: 600 });
    if (rl.allowed) {
      successSends++;
      db.markIdempotencyResult({ key, status: "sent", providerMessageId: `msg_${i}` });
    } else {
      rateLimitedSends++;
      db.markIdempotencyResult({ key, status: "failed", errorCode: "RATE_LIMITED" });
    }
  }

  assert.equal(successSends, 5);
  assert.equal(rateLimitedSends, 2);
});

test("THROTTLE ENGINE: se il provider fallisce, retry consentito solo dopo cooldown >= 60s con incremento attempt_count", () => {
  const db = new MockPersistentThrottleDb();
  const recipient = "test-fail@example.com";
  const rHash = sha256(recipient);
  const key = `preventivo:${rHash}:q_err:req_err`;

  // 1. Primo tentativo fallisce
  const step1 = db.checkIdempotencyAndMark({ key, emailType: "preventivo", recipientHash: rHash });
  assert.equal(step1.action, "proceed");
  db.markIdempotencyResult({ key, status: "failed", errorCode: "502_BAD_GATEWAY" });

  // 2. Retry immediato -> bloccato da cooldown
  const step2 = db.checkIdempotencyAndMark({ key, emailType: "preventivo", recipientHash: rHash, cooldownSeconds: 60 });
  assert.equal(step2.action, "cooldown");
  assert.equal(step2.status, "failed");

  // 3. Simula passaggio di 61 secondi
  const rec = db.idempotency.get(key);
  rec.lastAttemptAt = Date.now() - 61000;

  // 4. Retry dopo cooldown -> consentito, attempt_count incrementato a 2
  const step3 = db.checkIdempotencyAndMark({ key, emailType: "preventivo", recipientHash: rHash, cooldownSeconds: 60 });
  assert.equal(step3.action, "proceed");
  assert.equal(step3.status, "retry");
  assert.equal(step3.attempt_count, 2);
});
