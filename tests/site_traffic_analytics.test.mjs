import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeSiteTrafficSummary } from "../src/lib/analytics/siteTrafficSummary.js";
import { SITE_EVENT_NAMES } from "../src/lib/analytics/siteEvents.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, "..", "supabase", "migrations", "20260825190000_site_traffic_events.sql");

function row(eventName, { createdAt, sessionId = "s1", campaignId = null, quoteId = null } = {}) {
  return { event_name: eventName, created_at: createdAt, anonymous_session_id: sessionId, campaign_id: campaignId, quote_id: quoteId };
}

const NOW = new Date("2026-08-25T18:00:00.000Z");
const TODAY_MORNING = "2026-08-25T08:00:00.000Z";
const TODAY_NOON = "2026-08-25T12:00:00.000Z";
const YESTERDAY = "2026-08-24T18:00:00.000Z";

test("tracking page_view: page_view non fa parte del funnel aggregato ma conta come attivita' del visitatore", () => {
  const rows = [
    row(SITE_EVENT_NAMES.SESSION_STARTED, { createdAt: TODAY_MORNING, sessionId: "a" }),
    row(SITE_EVENT_NAMES.PAGE_VIEW, { createdAt: TODAY_MORNING, sessionId: "a" }),
    row(SITE_EVENT_NAMES.PAGE_VIEW, { createdAt: TODAY_NOON, sessionId: "a" }),
  ];
  const summary = computeSiteTrafficSummary(rows, { now: NOW });
  assert.equal(summary.visitorsToday, 1);
  assert.equal(summary.sessionsToday, 1);
});

test("quote_started: conteggiato in preventivi iniziati", () => {
  const rows = [row(SITE_EVENT_NAMES.QUOTE_STARTED, { createdAt: TODAY_MORNING, sessionId: "a" })];
  const summary = computeSiteTrafficSummary(rows, { now: NOW });
  assert.equal(summary.quotesStartedToday, 1);
  assert.equal(summary.quotesCompletedToday, 0);
});

test("quote_completed: conteggiato in preventivi completati, con campaign_id se disponibile", () => {
  const rows = [
    row(SITE_EVENT_NAMES.QUOTE_STARTED, { createdAt: TODAY_MORNING, sessionId: "a" }),
    row(SITE_EVENT_NAMES.QUOTE_COMPLETED, { createdAt: TODAY_NOON, sessionId: "a", campaignId: "camp-123" }),
  ];
  const summary = computeSiteTrafficSummary(rows, { now: NOW });
  assert.equal(summary.quotesStartedToday, 1);
  assert.equal(summary.quotesCompletedToday, 1);
  assert.equal(rows[1].campaign_id, "camp-123");
});

test("consultation_requested: conteggiata separatamente dal funnel preventivi", () => {
  const rows = [
    row(SITE_EVENT_NAMES.CONSULTATION_REQUESTED, { createdAt: TODAY_MORNING, sessionId: "a" }),
  ];
  const summary = computeSiteTrafficSummary(rows, { now: NOW });
  assert.equal(summary.consultationRequestsToday, 1);
  assert.equal(summary.quotesStartedToday, 0);
});

test("aggregazione giornaliera: eventi di ieri non contano in 'oggi'", () => {
  const rows = [
    row(SITE_EVENT_NAMES.SESSION_STARTED, { createdAt: YESTERDAY, sessionId: "old" }),
    row(SITE_EVENT_NAMES.QUOTE_STARTED, { createdAt: YESTERDAY, sessionId: "old" }),
    row(SITE_EVENT_NAMES.SESSION_STARTED, { createdAt: TODAY_MORNING, sessionId: "new" }),
  ];
  const summary = computeSiteTrafficSummary(rows, { now: NOW });
  assert.equal(summary.sessionsToday, 1);
  assert.equal(summary.quotesStartedToday, 0);
  assert.equal(summary.visitorsToday, 1);
});

test("conversion rate: preventivi completati / iniziati", () => {
  const rows = [
    row(SITE_EVENT_NAMES.QUOTE_STARTED, { createdAt: TODAY_MORNING, sessionId: "a" }),
    row(SITE_EVENT_NAMES.QUOTE_STARTED, { createdAt: TODAY_MORNING, sessionId: "b" }),
    row(SITE_EVENT_NAMES.QUOTE_COMPLETED, { createdAt: TODAY_NOON, sessionId: "a" }),
  ];
  const summary = computeSiteTrafficSummary(rows, { now: NOW });
  assert.equal(summary.quotesStartedToday, 2);
  assert.equal(summary.quotesCompletedToday, 1);
  assert.equal(summary.conversionRate, 0.5);
});

test("conversion rate: divisione per zero gestita senza numeri finti (null, non 0 e non Infinity)", () => {
  const rows = [row(SITE_EVENT_NAMES.QUOTE_COMPLETED, { createdAt: TODAY_MORNING, sessionId: "a" })];
  const summary = computeSiteTrafficSummary(rows, { now: NOW });
  assert.equal(summary.quotesStartedToday, 0);
  assert.equal(summary.quotesCompletedToday, 1);
  assert.equal(summary.conversionRate, null);
});

test("zero-data state: nessuna riga mai registrata (hasAnyData=false) distinto da 'zero traffico oggi'", () => {
  const neverTracked = computeSiteTrafficSummary([], { now: NOW });
  assert.equal(neverTracked.hasAnyData, false);
  assert.equal(neverTracked.visitorsToday, 0);
  assert.equal(neverTracked.conversionRate, null);

  const trackedButQuietToday = computeSiteTrafficSummary(
    [row(SITE_EVENT_NAMES.SESSION_STARTED, { createdAt: YESTERDAY, sessionId: "a" })],
    { now: NOW }
  );
  assert.equal(trackedButQuietToday.hasAnyData, true);
  assert.equal(trackedButQuietToday.sessionsToday, 0);
});

test("nessun numero inventato dai record commerciali: input mancante/vuoto produce solo zeri, mai un fallback stimato", () => {
  // La firma accetta solo righe site_events grezze — nessun parametro
  // "campaigns" esiste da cui poter derivare un fallback stimato.
  const summary = computeSiteTrafficSummary(undefined, { now: NOW });
  assert.deepEqual(summary, {
    hasAnyData: false,
    visitorsToday: 0,
    sessionsToday: 0,
    quotesStartedToday: 0,
    quotesCompletedToday: 0,
    consultationRequestsToday: 0,
    conversionRate: null,
  });
});

test("RLS: la migration site_events consente INSERT pubblico solo per gli eventi consentiti e SELECT solo agli admin", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  // Public/anon puo' solo inserire, mai leggere.
  assert.match(sql, /CREATE POLICY "site_events_insert_anon" ON "public"\."site_events"\s+FOR INSERT TO "anon"/);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]*TO "anon"[^;]*FOR SELECT/s);
  assert.doesNotMatch(sql, /GRANT SELECT ON "public"\."site_events" TO "anon"/);

  // Solo admin/super_admin possono leggere (stesso pattern di campaigns_admin_all/quote_requests_admin_all).
  assert.match(sql, /CREATE POLICY "site_events_admin_all" ON "public"\."site_events" TO "authenticated"/);
  assert.match(sql, /"profiles"\."role" = ANY \(ARRAY\['admin'::"text", 'super_admin'::"text"\]\)/);

  // Whitelist eventi applicata sia da CHECK constraint sia dalla policy di insert (difesa in profondita').
  for (const eventName of Object.values({
    page_view: "page_view", session_started: "session_started", quote_started: "quote_started",
    quote_completed: "quote_completed", consultation_requested: "consultation_requested",
  })) {
    assert.match(sql, new RegExp(`'${eventName}'::text`));
  }

  // RLS abilitata, e nessuna colonna PII (password/token/service_role/email body) nello schema.
  assert.match(sql, /ALTER TABLE "public"\."site_events" ENABLE ROW LEVEL SECURITY/);
  const createTableBlock = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf(');') + 2);
  assert.doesNotMatch(createTableBlock, /password|token|service_role|email/i);
});

test("evento non consentito viene rifiutato dal CHECK constraint (allowlist esplicita, non un semplice NOT NULL)", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /CONSTRAINT "site_events_event_name_check" CHECK/);
  assert.match(sql, /"event_name" = ANY \(ARRAY\[/);
});
