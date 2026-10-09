# 3B.4-S release runbook: `smart_pairing_slots` write lockdown

**Status: preflight complete. NOT authorized to apply. Wait for explicit approval.**

- Migration: `supabase/migrations/20261009120000_smart_pairing_slots_write_lockdown.sql` @ `514ae27`
  - sha256 `11296dc1b31137376a825ba19ebac3b9100b3985cf330f9595d49f83eca4e1f2` (LF), git blob `459a52f2`
- Rollback: `supabase/migrations/rollback/20261009120000_smart_pairing_slots_write_lockdown.rollback.sql`
  - sha256 `f15211359616097e53d9136c6ef1197458c7c0ebc9643b17432bcf7a5eef5dea` (LF)
- Execution script: `docs/release/3b4s-apply-smart-pairing-slots-lockdown.sql`. It runs guards, then the migration statements verbatim, then in-transaction checks and the history row, all in one transaction.
- Verification: `docs/release/3b4s-verify-smart-pairing-slots.sql`. It is read-only and returns `state: pre | post | UNEXPECTED`.

**Never use `supabase db push`.** 11 other repo migrations are absent from Production history, and `db push` would apply them all:
- `20260919123000` through `20260924140000`: map sectors, driver multi-zone/GPS, group links and others.

## 1. Preflight evidence (2026-10-09, read-only)

| Check | Result |
|---|---|
| Live vs tested schema | Catalog fingerprint is **equal**: columns, defaults, constraints, indexes, trigger, trigger function, view definition/owner/ACL, table ACL/RLS/owner, policies and dependents of `smart_pairing_slots` and `availability_slots`. Differences were normalized only for PG18 catalogued NOT NULL constraints (same 14 NOT NULL columns both sides) and OIDs. |
| Server | PostgreSQL **17.6**. `MAINTAIN` exists: `aclexplode` shows it and `has_table_privilege(...,'MAINTAIN')` works. |
| Grantor / executor | Every anon/authenticated privilege was granted by `postgres`. The owner is `postgres`, which has BYPASSRLS but not superuser, so `postgres` can revoke them and replace the policies. |
| Column ACLs | none |
| Callers | No Production code, edge function, SQL function or cron job references the table. Rows were last created or updated on 2026-04-18. |
| Event triggers | Supabase standard only: `pgrst_ddl_watch` reloads the PostgREST schema cache; `grant_pg_*` act on extension creation. Nothing re-grants table privileges. |
| Live guard dry run | Guard 1 of the execution script was run on live inside `BEGIN TRANSACTION READ ONLY`: **passed**. |
| Live verify | `state: "pre"`, rows `n=36`, md5 `a6195dc8663d3d08ed84947bd61459d4`, triggers 1, indexes 3, version not recorded. |

## 2. Expected role/permission matrix

| Role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE/REFERENCES/TRIGGER/MAINTAIN |
|---|---|---|---|---|---|
| anon (before → after) | ✅ → ✅ | ✅ → ❌ | ✅ → ❌ | ✅ → ❌ | ✅ → ❌ |
| authenticated (before → after) | ✅ → ✅ | ✅ → ❌ | ✅ → ❌ | ✅ → ❌ | ✅ → ❌ |
| service_role | ✅ | ✅ | ✅ | ✅ | ✅ (unchanged; BYPASSRLS) |
| postgres (owner) | ✅ | ✅ | ✅ | ✅ | ✅ (unchanged) |

- ACL after: `{postgres=arwdDxtm/postgres,anon=r/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}`.
- Policies after: `Public read slots` (SELECT, public, `true`) and `smart_pairing_slots_service_role_all` (ALL, `{service_role}`, `true`/`true`).
- The view `available_slots_with_pairing` is unchanged.

## 3. Execution plan (single migration, single transaction)

1. **Approval recorded:** who approved, when, and the SHA `514ae27`.
2. **Pre-check:** run `3b4s-verify-smart-pairing-slots.sql`. It must return `state: "pre"`, `n: 36` and md5 `a6195dc8…` (or a newly recorded md5 if rows legitimately changed). Save the output.
3. **Apply:** run `3b4s-apply-smart-pairing-slots-lockdown.sql` as `postgres`, either in the SQL editor or with `psql -v ON_ERROR_STOP=1 -f` (**without** `-1`). The script sets `lock_timeout 3s` and `statement_timeout 30s`.
   - Guard 1: version ≥ 17, `current_user = postgres`, exact pre-ACL, no column ACLs, exact two policies, version not yet recorded.
   - The migration statements, byte-equal to the migration file.
   - Guard 2: anon and authenticated keep SELECT and have no write privilege, `service_role` keeps SELECT/INSERT/UPDATE/DELETE, and the policy set is exact.
   - A `supabase_migrations.schema_migrations` row (`20261009120000`, `smart_pairing_slots_write_lockdown`, 4 statements).
   - `COMMIT`.
4. **Post-check:** run the verify script again. It must return `state: "post"`:
   - `anon_write=false`, `authenticated_write=false`, `anon_select=true`, `service_role_write=true`;
   - `column_acl=0`, `rls=true`;
   - the **same** rows `n` and `md5` as step 2, triggers 1, indexes 3, the same `view_acl`;
   - `migration_recorded=true`.
5. **REST functional check (anon key only; no data change possible).**
   - `GET /rest/v1/smart_pairing_slots?select=id&limit=1` → **200**.
   - `PATCH /rest/v1/smart_pairing_slots?id=eq.00000000-0000-0000-0000-000000000000` with body `{"note":null}` and `Prefer: return=minimal` → **401**, code `42501` ("permission denied"). The filter matches no row, so even a broken lockdown would change nothing.
   - Do **not** send INSERT or DELETE probes.
6. **Smoke test:** public homepage, configurator Step 3/Step 4 and Admin dashboard load normally. None of them use this table.
7. **Record:** keep the step 2 and step 4 outputs with the release notes.

## 4. STOP / rollback decision matrix

| Observation | Committed? | Decision |
|---|---|---|
| Step 2 returns `pre` with expected values | — | Proceed to step 3. |
| Step 2 returns `UNEXPECTED`, or md5/n changed unexpectedly | — | **STOP.** Re-run preflight and re-review. |
| Step 3 raises `3B4S_ABORT: …` | No (transaction aborted) | **STOP.** Nothing changed. Re-preflight; do not edit the guards to force through. |
| Step 3 raises `lock timeout` / `statement timeout` | No | Retry once at a quiet time. If it repeats, **STOP** and inspect `pg_locks`. |
| Step 3 raises any other error | No | **STOP.** Run verify: it must still say `pre`. |
| Step 4 returns `post` with identical rows/md5 | Yes | Continue to step 5. |
| Step 4 returns `UNEXPECTED` | Yes | **STOP**, capture the output, investigate. Roll back **only** if a legitimate consumer is broken. Rolling back re-opens anonymous writes. |
| Step 4 shows a changed rows md5 | Yes | **STOP.** Investigate concurrent writers; this migration cannot change data. |
| Step 5 GET → 200 and PATCH → 401/42501 | Yes | Success. |
| Step 5 GET fails (401/403/404) | Yes | Unexpected, because SELECT is untouched. Check the PostgREST schema cache reload (`NOTIFY pgrst, 'reload schema'`). If it's still failing and a consumer needs it, **roll back**. |
| Step 5 PATCH → 204/200 (accepted) | Yes | Lockdown not effective via the API. **STOP and investigate** (role mapping, cache). **Do not roll back**: that re-opens the hole. |
| Any service_role / edge-function error mentioning `smart_pairing_slots` | Yes | Not expected (BYPASSRLS, no callers). Capture it, then **roll back** if it blocks a business flow. |
| Unrelated site errors | Yes | Not caused by this change, since the table is unused. **No rollback**; triage separately. |

**Rollback procedure** (only per the matrix): run the rollback file as `postgres`, then the following and verify that `state: "pre"` is returned:
```sql
delete from supabase_migrations.schema_migrations where version = '20261009120000';
```

The rollback was tested on the same fixture:
- migration, then rollback, then the history delete returns the verify output exactly to `pre`, data included;
- re-applying afterwards locks writes again.

## 5. Evidence for the execution artifacts (PGlite, PostgreSQL 18.3, baseline DDL verbatim)

`runbook-test.mjs` (session scratchpad) passed **11/11**:
- the apply script embeds the migration statements verbatim;
- pre verification;
- apply → exact `post`, with unchanged data, triggers, indexes and view ACL, and one history row;
- a second apply aborts with zero changes;
- guards abort with zero changes on ACL drift, extra policy, column ACL and an already-recorded version;
- a non-`postgres` executor aborts;
- rollback plus history delete returns to the exact `pre`;
- the verify script cannot write (25006).

`tests/smart_pairing_slots_rls.test.mjs` passed **7/7** (role/operation matrix).

## 6. Residual risks

1. **Unknown external writer using the anon key** (for example an automation). Evidence against it: no row has been created or updated since 2026-04-18, and no code references the table. If one exists, it will now get 401/403. Under the matrix that is the intended outcome, not a rollback trigger, unless it is a confirmed business flow.
2. **Rollback re-opens the vulnerability.** Use it only per the matrix.
3. **Test engine version.** The engine was PG 18.3, while live is 17.6. All statements are PG ≥ 17 syntax, live supports `MAINTAIN` (verified), and the normalized catalogs are equal.
4. **Lock.** `DROP/CREATE POLICY` takes an ACCESS EXCLUSIVE lock on a 36-row, unused table, bounded by `lock_timeout 3s`.
5. **Not addressed by this release** (separate decisions):
   - the `available_slots_with_pairing` read bypass (owner-rights view);
   - broad default privileges in `public`;
   - `GRANT ALL` on `availability_slots`.
