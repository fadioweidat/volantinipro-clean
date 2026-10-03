# Chat / Driver timeout hardening — local candidate

Date: 2026-10-02. Branch: `codex/chat-driver-timeout-hardening`.
Base: `44c6ac957e1462c95d788ef0ca0f21014bb4873a`.
No commit, staging, push, deploy or Production migration performed.
The Android workflow/signing WIPs remain in the original checkout, unchanged.

## Scope and reproduction

The previous diagnosis remains **ROOT CAUSE 57014: PARZIALE**. This patch removes
specific failure paths; it does not establish or repair every Production timeout.

Reported scenario: Driver assignment/program page, public assignment token,
send a message to Admin, register program opening and obtain an operator link.
Observed: missing message, opening error and operator-link loading indicator.
The original screenshot viewport and exact reproduction timestamp are not
available in this phase. No real tokens or entity identifiers are reproduced.

Local reproduction uses PostgreSQL 17.6 in a dedicated Docker container, synthetic
assignments, separate anonymous/authenticated/Admin sessions, and the repository's
actual RPC bodies. Auth helpers, dependency tables, Storage objects and the
Realtime transport boundary are fixtures. No production data was imported.

## SQL strategy chosen before implementation

`20261002120000_chat_realtime_outbox.sql` replaces both message notification trigger
bodies with an append-only outbox insert in the message/seen transaction. No
`realtime.send` runs inside message persistence. A separate server-only dispatcher
(procedure `dispatch_chat_realtime_outbox`, phase 4.1 migration safety):

1. **Claim** up to 100 due `pending` rows with `FOR UPDATE SKIP LOCKED`, increment
   `attempts`, set `last_attempt_at`, `last_error='DISPATCH_INTERRUPTED'` and the next
   backoff (5 s doubling, max 300 s), then **COMMIT**. A cancelled or terminated run
   therefore stays visible and its rows stay `pending`, never claimed twice.
2. **Deliver** each distinct topic once in its own subtransaction, broadcasting only
   `messages_changed` / `{changed:true}`. Supabase `realtime.send` turns ordinary
   errors into a WARNING, so the dispatcher requires the `realtime.messages` row it
   just wrote; otherwise it records `REALTIME_SEND_NOT_PERSISTED`.
3. **Settle**: delivered rows are deleted; rows with a failed topic keep the error
   and become `failed` (dead letter) after 8 attempts; rows skipped by the time
   budget are released without penalty.

Timeouts never touch the global `statement_timeout`: `lock_timeout` 1 s per phase,
a 3 s budget for starting new topics, and a session-scoped `transaction_timeout`
of 10 s as hard cap (pg_cron opens one session per run). `QUERY_CANCELED` is not
caught: [PostgreSQL excludes it from OTHERS](https://www.postgresql.org/docs/17/plpgsql-control-structures.html);
the committed claim keeps it observable. Polling remains the authoritative
fallback; this is not an exactly-once notification promise.

The outbox has no FK or unique per-conversation upsert that could couple worker
locks to messages. RLS is enabled; client table/sequence access is revoked. The
dispatcher and housekeeping are executable only by postgres. COMMIT requires a
SECURITY INVOKER procedure without a SET clause, so every reference is
schema-qualified. Topics derive from the DB conversation only.

pg_cron >= 1.5 must already be installed; scheduling failure aborts the migration.
`chat-realtime-outbox` runs every 5 seconds and never overlaps itself.
`chat-realtime-outbox-housekeeping` runs every 10 minutes and prunes only these
two jobs' `cron.job_run_details` (succeeded > 1 h, other > 3 days, max 50,000 per
run) and dead letters older than 14 days.
See [pg_cron scheduling semantics](https://github.com/citusdata/pg_cron).

Rollback (manual, not scanned by the CLI):
`supabase/migrations/rollback/20261002120000_chat_realtime_outbox.rollback.sql`
restores the exact Production `chat_channel_isolation` notifiers and ACL; it never
restores the 2026-09-12 triggers that broadcast message text.

`20260923184105_chat_channel_isolation.sql` is the migration already applied in
Production under that version (byte-identical to
`supabase_migrations.schema_migrations.statements`). Same version, so Production
skips it; re-running it is a no-op (trigger/policy created only if missing).

`20261002121000_driver_group_link_lock_scope.sql`:

- Holds `FOR SHARE` on the token-authorized assignment, preventing concurrent
  revocation/status changes while permitting FK `KEY SHARE` for program events.
- Reads an existing active link with `FOR SHARE`; this common path takes no
  exclusive group lock and returns the same HMAC-derived token.
- On a miss, prepares candidate crypto first, then locks the operational group
  with `FOR NO KEY UPDATE`, rechecks, and inserts/audits only if still absent.
- Admin regeneration uses that same parent lock. Its existing revoke-and-create
  behavior is preserved; legacy nonrecoverable links stay nonrecoverable.
- Adds one targeted partial unique index on `(campaign_id, group_id)` for active
  links. Existing duplicates fail the migration; no automatic data cleanup.

`log_assignment_event` is unchanged. The demonstrated improvement is compatibility
with its existing FK locks, preserving the mandatory opened-before-confirmed rule.

## Frontend behavior

Only `messages_changed` is subscribed. Event payloads are discarded, including
forged message content. Reconnect and invalidation trigger the existing authorized
list RPC for that screen. Full-message client broadcasts and payload merges from
subscriptions have been removed. Successful send RPC responses can still update
the sender's own UI immediately.

Single-flight covers Driver chat, Driver structured issues, operator-link loading,
Admin conversation list/detail/issue assignment lookups, Customer chat and the
Customer modification-request list. Poll timers retain their existing intervals.
Seen writes belong to the same flight as message reads. Concurrent ticks/events
join the existing request; rapid completed requests have a 1-second start-rate
limit. No pending-event retry loop is scheduled. A new identity waits for the old
request to finish, then performs its own initial read. Scope guards discard late
results; listeners/timers/subscriptions are cleaned up. GPS polling is unchanged.

Chat sends no longer automatically retry ambiguous RPC failures. A response
failure does not prove the server failed to commit. This does not add an
idempotency key for a later manual resend; that remains a separate limitation.

## Files

- `supabase/migrations/20260923184105_chat_channel_isolation.sql` (Production baseline)
- `supabase/migrations/20261002120000_chat_realtime_outbox.sql`
- `supabase/migrations/rollback/20261002120000_chat_realtime_outbox.rollback.sql`
- `supabase/migrations/20261002121000_driver_group_link_lock_scope.sql`
- `src/lib/services/messaging-realtime.js`
- `src/lib/services/singleFlightRefresh.js`
- `src/hooks/useSingleFlightRefresh.js`
- `src/lib/services/hub-api.js`
- `src/pages/driver/DriverAssignmentPage.jsx`
- `src/pages/admin/communications/AdminCommunicationsPage.jsx`
- `src/components/customer/CampaignHubPanels.jsx`
- `tests/messaging_realtime.test.mjs`
- `tests/chat_driver_hardening.test.mjs`
- `tests/chat_driver_hardening.integration.test.mjs`
- `tests/fixtures/chat-driver-hardening.sql.fixture`
- `docs/chat-driver-timeout-hardening.md`

The fixture suffix avoids the repository-wide ignore rule for non-migration SQL.
No existing migrations were edited, and no unrelated WIP migration was imported.
The rollback lives in a migrations subfolder so `.gitignore` keeps it tracked while
the Supabase CLI (top-level files only) never applies it.

## Validation

Targeted run: **75 passed, 0 failed**. Includes PostgreSQL integration scenarios
and React StrictMode lifecycle tests; also includes historical/static tests, so
the count must not be read as 75 end-to-end browser scenarios.

| Required scenario | Evidence |
|---|---|
| Driver → Admin | Actual send/list RPCs with synthetic anonymous Driver token and Admin session |
| Admin → Driver | Actual first-message RPC and Driver-authorized read |
| Customer → Admin | Actual Customer send and Admin list RPCs |
| Admin → Customer | Actual Admin send and owning Customer list RPCs |
| Customer → Driver forbidden | DB CHECK rejection and unauthorized Admin RPC rejection |
| Driver → Customer forbidden | DB CHECK rejection and unauthorized Admin RPC rejection |
| Realtime failure preserves message | Original trigger reproduced rollback on actual timed pg_sleep; candidate persists with the same injected failure; dispatcher P0001/57014 leaves message and queued batch intact |
| Realtime reload authorized | Actual subscription implementation ignores forged payload and invokes RPC-backed invalidation callback; screens wired to authorized readers |
| Single-flight | 100 concurrent signals share one request; cleanup, identity change, rate limit and StrictMode verified |
| Concurrent/idempotent operator link | 8 separate connections, two assignments, one link/token and exactly one creator; invalid token/participant denied; concurrent Admin regeneration tested |
| Opening → confirmation | Early confirmation rejected; repeat confirmation idempotent; opening succeeds while link transaction remains open |
| Structured issues separate | Customer create → assigned Driver list/seen/take/photo registration/resolve → Customer and Admin read; chat count unchanged |

The real pg_cron worker also drained a newly committed outbox item locally.
Photo verification covers DB registration and visibility with a synthetic Storage
object, not browser camera capture/upload/watermark. Realtime websocket transport
is not exercised. Full Production RLS/schema replay and original browser/token
scenario were not run in this phase.

Controlled lock comparison on the same synthetic assignment: original link RPC
causes opening to time out at **150 ms**; candidate opening completes in **5 ms**
in the final run, while the link transaction remains open. This demonstrates lock
compatibility, not a Production throughput or latency guarantee.

Full regression: `npm run test:all` discovered **277 files** and ran **3,001 tests**:
**2,977 pass, 22 fail, 2 skip**; **7 standalone browser scripts excluded** by the
existing runner. The opt-in SQL integration test was run separately with the local
database enabled. Full regression is **FAIL**, not green.

Failures concern existing GPS assertions, AI/Supplier suites requiring absent
environment configuration, URL/configuration assertions, Step2/territory tests,
Map Studio isolation and a performance threshold. They were compared against a
clean archive of `44c6ac9`. The performance test passes both on the baseline and on
an isolated candidate rerun, so that suite failure is timing-sensitive. Protected
code and these tests were not changed to obtain a green result.

Final `npm run build`: **PASS**, Vite completed in 26.24 s. `git diff --check` clean.

Reproduce focused SQL tests only against the dedicated local fixture:

```powershell
docker start vp-chat-hardening-pg
$env:CHAT_HARDENING_LOCAL_DB='1'
node --import tsx --test tests/chat_driver_hardening.integration.test.mjs
```

The integration runner is explicitly destructive to its fixed disposable database
on loopback port 55439 and accepts no remote connection URL. The dedicated
container was stopped after verification. No environment files/credentials from
the original checkout were copied into either candidate or baseline test trees.

## Review risks and limits

| Fix | File/migration | Test | Risk | Result |
|---|---|---|---|---|
| Persistence independent of realtime | Outbox migration | Actual cancellation + rollback/persistence + cron execution | Cron prerequisite, additional queue storage, delayed/best-effort notification; monitor backlog before any future rollout | Verified locally |
| Unified event | messaging-realtime + three chat screens | Forged payload ignored; RPC reload; existing channel tests | Requires matching backend/frontend contract; fallback covers missed hints | Verified locally, transport not verified |
| Single-flight | Helper/hook + communication panels + hub-api | Slow request, StrictMode, cleanup, concurrent signals | Invalidations during a request can wait until next poll; outstanding HTTP calls are not forcibly aborted | Verified locally |
| Link lock scope | Group-link migration, including Admin creator | Concurrent Driver/Admin requests, idempotency, auth denial | Unique index may reject pre-existing duplicates and takes a DDL lock; preflight required before any future application | Verified locally |
| Opening | No event RPC change | Baseline timeout vs candidate success; opened-before-confirmed | Other database blockers can still cause 57014 | Verified locally |

Before any future rollout, separately review schema/function drift against the
actual Production definitions, duplicate active links, pg_cron version/job owner,
outbox backlog monitoring, and the exact original browser scenario. This document
does not authorize that rollout. The existing chat role contract and structured
issue/photo workflow remain unchanged.

ROOT CAUSE: PARZIALE; concrete realtime-transaction and FK-lock failure paths reproduced locally.
FILES CHANGED: the fourteen files listed above.
CODE: PASS.
TESTS: FAIL for full suite; targeted 75/75 PASS.
BUILD: PASS.
RUNTIME: NOT VERIFIED for original UI; local PostgreSQL/React evidence above.
PRODUCTION: NOT VERIFIED; no changes applied.
ORIGINAL USER SCENARIO: NOT VERIFIED.
REGRESSION: PARTIAL; complete runner executed with failures recorded.
PERFORMANCE: NOT PROVEN in Production; controlled local lock experiment only.
OVERALL: NOT VERIFIED for the original Production incident; local implementation completed.
