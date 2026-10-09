# Security: `public.campaign_summary` anonymous / cross-customer read leak (Phase 3B.4-V)

**Status: prepared and tested in isolation. NOT applied to Production. Wait for explicit approval.**

| | |
|---|---|
| Branch / base | `security/campaign-summary-anon-read-lockdown` from `757053b` (3B.4-D6, unchanged) |
| Production app | `047a764d54624088c6271b112ca53be09b6c5732` |
| Migration | `supabase/migrations/20261009170000_campaign_summary_security_invoker.sql` |
| Rollback | `supabase/migrations/rollback/20261009170000_campaign_summary_security_invoker.rollback.sql` (manual) |
| Release scripts | `docs/release/3b4v-apply-campaign-summary.sql` (guarded, one transaction), `docs/release/3b4v-verify-campaign-summary.sql` (read-only) |
| Tests | `tests/campaign_summary_security_invoker.test.mjs` + `tests/fixtures/campaign_summary_catalog.json` (also reuses the D6 fixture) |

Evidence comes from Production catalog SELECTs inside `BEGIN TRANSACTION READ ONLY … ROLLBACK`. Only counts, catalog rows and source code were read; no campaign contents. No writes.

## 1. Confirmed exposure

| Item | Live value (2026-10-09) |
|---|---|
| View | `campaign_summary`: `campaigns c LEFT JOIN LATERAL (latest quote) LEFT JOIN campaign_analysis`. 25 columns, including `user_id`, `title`, `campaign_status`, quote subtotal and fees, and the analysis KPIs including `raw_inputs`. Definition md5 `ab3f147ae7ef5ece7555debe9afde189`. |
| Owner / options | `postgres`, **no `security_invoker`**, so it is evaluated with the owner's rights and bypasses the RLS of all 3 base tables |
| ACL | `anon=arwdDxtm`, `authenticated=arwdDxtm`, `service_role=arwdDxtm` |
| Measured as `anon` (counts only) | **104 of 104** rows through the view, vs **0** from `campaigns` |
| Same mechanism for `authenticated` | **Any signed-in customer reads every campaign** (reproduced on the fixture: each customer sees 4 of 4) |
| Writes through the view | Impossible: the view is not auto-updatable, and Postgres returns `55000` before checking privileges |

Base tables (unchanged by this fix):

| Table | RLS | SELECT policies |
|---|---|---|
| `campaigns` | on | `campaigns_own_select` (owner), `campaigns_admin_all` |
| `quotes` | on | `quotes_own_select` (campaign owner), `quotes_supplier_own_select` |
| `campaign_analysis` | on | `campaign_analysis_own_select` (campaign owner) |

## 2. Who uses the view

| Source | Result |
|---|---|
| Production code `047a764` (`src/`, `api/`, `supabase/functions/`) | **no reader**. The only match is the label string `own_campaign_summary` in `projectAiPermissions.js`. |
| Every local and remote branch | no reader |
| Deployed edge functions | 17 of 19 downloaded read-only: no reference. The other 2 (`feasibility-ai`, `feasibility-commerce`) were refused by the CLI's path-safety check; their repo source has no reference. |
| SQL functions / views / cron | none reference it; no dependent views |
| `pg_stat_statements` (since 2026-09-16) | 3 statements: 2 single `anon` reads matching today's audit probes, plus 1 `postgres` introspection. No application traffic. |

## 3. Fix (minimal, reversible)

```sql
alter view public.campaign_summary set (security_invoker = true);
revoke all on table public.campaign_summary from anon;
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.campaign_summary from authenticated;
```

- **`security_invoker = true`.** The view now runs with the caller's rights, so the **existing** base-table RLS applies. No policy change is needed, and any future grant can no longer leak.
- **`anon`** loses every privilege: there is no anonymous use.
- **`authenticated`** keeps SELECT only, so legitimate owner and admin reads remain possible.
- The definition, owner, base tables and policies are untouched. 3B.4-D6 is untouched (verified: D6 files equal `757053b`).

## 4. Read matrix (fixture: customer A owns A1 and A2; B owns B1; one unowned campaign; quotes and analysis for A1 and B1)

| Actor | Before | After |
|---|---|---|
| anon | 4 rows, all quotes, analysis and `raw_inputs` | **denied 42501** |
| customer A | 4 rows (**others' campaigns, quotes, analysis**) | **own 2 rows**, own quote and analysis only |
| customer B | 4 rows | **own 1 row** |
| admin | 4 rows with quotes and analysis | 4 rows (`campaigns_admin_all`); quote and analysis columns **null**, because those tables have no admin SELECT policy |
| supplier | 4 rows | 0 rows |
| service_role / postgres | 4 rows, full | 4 rows, full (unchanged) |
| anon INSERT / customer UPDATE on the view | 55000 (not updatable) | 55000 (not updatable). The revoke is defence in depth. |
| Base table data (campaigns, quotes, analysis md5) | — | unchanged |

**Dashboards and reports.** The Customer dashboard, Admin dashboard, PDF and AI reports, edge functions and RPCs do **not** read this view; they use the base tables, which this fix doesn't touch. They are therefore unaffected. The only behaviour change for a hypothetical admin reader is the null quote and analysis columns (no such reader exists).

## 5. Test evidence

`PGLITE_MODULE=<…>/@electric-sql/pglite/dist/index.js node --test tests/campaign_summary_security_invoker.test.mjs` passes **22/22** on PGlite 0.5.8 (PostgreSQL 18.3).

**Fixture.** It combines:
- the D6 fixture (`campaigns`, `profiles`, `quotes`, `supplier_profiles`, `clienti`, `campaign_admin_action_log` with real policies, ACLs, triggers and function bodies);
- `campaign_analysis` (exact columns, constraints, RLS, policies, ACL);
- the exact view definition, owner and ACL.

The view definition re-created in the engine **hashes to the live md5**. Schema only, no row data. The FK `campaign_analysis.zone_id → campaign_zones` is omitted because it is irrelevant to RLS.

| Area | Tests |
|---|---|
| Static | Exact migration text; exact rollback text and live options/ACL; apply script embeds the migration verbatim and pins the md5 |
| Engine | Leak reproduced before. Matrix after (§4). Data checksums unchanged. View owner and definition unchanged. **Independent of D6 in either order.** Idempotent. Rollback restores exact options and ACL text (the grants are re-created in the original order) and the leak. Re-apply closes again. A failure inside the transaction leaves no partial state. |
| Mutations (all detected) | revoke anon only (customers still read everything); `security_invoker` only (anon keeps privileges); also revoking authenticated SELECT (breaks owners); `security_invoker = false`. Mutants must change executable SQL, not comments. |
| Release scripts | verify `pre` → apply → verify `post` (history once). Guard 1 aborts with zero changes on: second apply, ACL drift, definition drift, already-recorded version, base-table RLS off, non-`postgres` executor. Rollback plus history delete returns to the exact `pre`. The verify script cannot write. |

**Production read-only precheck (2026-10-09).** Verify returns `state: "pre"`: options null, live ACL, md5 `ab3f147a…`, base RLS on, 104 rows via owner, version not recorded. Guard 1 of the apply script, dry-run on live inside a READ ONLY transaction: **PASS**.

**Engine differences.**
- PG 18.3 vs 17.6: `security_invoker` exists since PG 15 and `MAINTAIN` since 17 (verified live).
- In PGlite `postgres` is a superuser, while in Supabase it has BYPASSRLS. The owner-rights path bypasses RLS in both.

## 6. Risks and findings

1. **Admin readers.** Through the view, admins would get null quote and analysis columns, because `quotes` and `campaign_analysis` have no admin SELECT policy. There are no current readers. If an admin report needs the view later, add admin SELECT policies on those tables, or read with the service role.
2. **Release hash check on Windows.** Blobs are LF, but Windows checkouts are CRLF. Hash the git blob (`git show <sha>:<path> | sha256sum`), not the working file.
3. **3B.4-D6 test portability (D6 not modified, per instructions).** `tests/campaigns_owner_write_lockdown.test.mjs` at `757053b` builds 3 of its mutants with `\n`-specific replacements. On a CRLF checkout those 3 mutants fail with "mutation must change the SQL" (fail-safe: they never pass falsely), giving 21/24. In the D6 worktree (LF) it passes 24/24. The D6 migration and release scripts are unaffected. Fix: normalise `\r\n` in the test's `read()`, as this suite does. That needs approval to touch D6.
4. **Related, not changed here.**
   - `quotes_own_insert` / `quotes_own_update` and `campaign_analysis_own_insert` (roles `public`) let campaign owners write their own quote and analysis rows. `quotes_marketplace_guard` covers supplier quotes only.
   - Other owner-rights views readable by anon: `available_slots_with_pairing` (exposes `availability_slots`, already reported), `lombardia_comuni_bbox` (public geodata), and PostGIS `geometry_columns` / `geography_columns`.
   - Broad default privileges in `public`.

## 7. Release plan (requires explicit approval; never `supabase db push`)

1. **Gate 1, artifacts.** Commit and git-blob sha256 of the migration, rollback, apply and verify files.
2. **Gate 2, precheck.** The verify script must return `pre` with the values in §5. Check locks and idle-in-transaction sessions.
3. **Gate 3, apply** `3b4v-apply-campaign-summary.sql` once, as `postgres`, through `supabase db query --linked -f` (path proven in 3B.4-S). It uses `lock_timeout 3s` and `statement_timeout 30s`, and runs Guard 1, then the migration verbatim, then Guard 2, then the history row, then COMMIT. Order relative to D6 doesn't matter.
4. **Gate 4, postcheck.** The verify script must return `post`:
   - options `{security_invoker=true}`;
   - ACL `{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}`;
   - md5 unchanged, `rows_via_owner` unchanged;
   - version recorded once.
5. **Gate 5, API probes** (read-only):
   - anon `GET /rest/v1/campaign_summary?select=id&limit=1` → **401/42501** (it was 200 with data);
   - anon `GET /rest/v1/campaigns?select=id&limit=1` → 200 `[]` (unchanged).
6. **Gate 6, smoke** (read-only, non-GET blocked): public pages, configurator, Customer and Admin dashboards load. No reader of the view exists.

| Observation | Decision |
|---|---|
| Precheck not `pre` / Guard abort / error | **STOP.** Nothing committed. Re-audit. |
| Postcheck `UNEXPECTED` | **STOP**, preserve evidence, investigate (no automatic rollback) |
| anon GET still 200 with rows | **STOP and investigate** (PostgREST schema cache: `NOTIFY pgrst, 'reload schema'`). Do not roll back. |
| A legitimate consumer breaks | Not expected (no readers). Capture it. Rollback **only with separate approval**: run the rollback, then `delete from supabase_migrations.schema_migrations where version = '20261009170000'`, then verify returns `pre`. |
