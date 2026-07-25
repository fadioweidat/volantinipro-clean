# GPS-PROD-6O — Clone rehearsal report

Date: 2026-07-25

Scope: isolated PostgreSQL 17 clone only.

Production safety invariant: no production DDL, DML, migration, migration
repair, or deploy was executed. No secret material is included in this report
or in the committed test artifacts.

## Dump and restore evidence

- Dump format: PostgreSQL custom.
- Dump size: 38,796,427 bytes.
- Dump SHA-256:
  `D5597F6F2975E17888A0531314F07867D2D70C9F78BBB4482CB7AA1E82A43CFD`.
- `pg_dump` runner exit code: 124 (runner timeout).
- Final child-process exit code: not captured because the container continued
  after the runner timed out.
- The completed archive was observed after the timeout and accepted only after
  independent archive, restore, and row-count verification.
- `pg_restore --list`: exit code 0; 924 archive entries.
- `pg_restore` into the isolated clone: exit code 0.

The wrapper timeout is retained as a closeout reserve. It does not establish a
clean `pg_dump` process exit, but the resulting artifact is proven usable by a
successful catalog read, full restore, and exact production/clone sentinel
counts.

## Isolated clone

- Container: `gps-prod-6o-restore-20260725-053603`
- Image: Supabase PostgreSQL `17.6.1.084`
- Database: `restore_rehearsal`
- Docker network mode: `none`
- Published ports: none
- Production dump mount: read-only
- Restored database size: 291 MB
- Restored non-system tables: 104
- Required extensions: 6/6

The restore had already completed before this final audit and was not repeated.

## Control results

| # | Control | Evidence | Result |
| ---: | --- | --- | :---: |
| 1 | Dump artifact | 38,796,427 bytes; SHA-256 verified; runner timeout documented | PASS |
| 2 | `pg_restore --list` | Exit code 0; 924 archive entries | PASS |
| 3 | `202607230001_campaign_zone_progress.sql` on clone | Exit code 0; transaction committed on `restore_rehearsal` | PASS |
| 4 | `20260724101527_campaign_zone_progress_predeploy_fixes.sql` on clone | Exit code 0; transaction committed on `restore_rehearsal` | PASS |
| 5 | Schema contracts | Original and predeploy schema contracts, exit code 0 | PASS |
| 6 | RPC contracts | Original and predeploy RPC contracts, exit code 0 | PASS |
| 7 | Behavior contract | 38 passed, 0 failed; exit code 0 | PASS |
| 8 | Concurrency contract | 5 passed, 0 failed; two overlapping PostgreSQL sessions | PASS |
| 9 | Retention contract | 8 passed, 0 failed; exit code 0 | PASS |
| 10 | Migration-history rehearsal | 5 passed, 0 failed; 9 → 11 simulated rows; duplicate rejected | PASS |

## Production/clone row-count comparison

The comparison used one read-only production query and the same count matrix on
the isolated clone. All 15 sentinels matched exactly.

| Object | Production | Clone | Delta |
| --- | ---: | ---: | ---: |
| `audit_log` | 39 | 39 | 0 |
| `campagne` | 14 | 14 | 0 |
| `campaign_zones` | 0 | 0 | 0 |
| `campaigns` | 2 | 2 | 0 |
| `clienti` | 1 | 1 | 0 |
| `delivery_sessions` | 21 | 21 | 0 |
| `gps_tracking_points` | 221 | 221 | 0 |
| `operator_assignments` | 0 | 0 | 0 |
| `operator_profiles` | 0 | 0 | 0 |
| `poi_cache` | 59 | 59 | 0 |
| `poi_search_logs` | 342 | 342 | 0 |
| `profiles` | 1 | 1 | 0 |
| `schema_migrations` | 9 | 9 | 0 |
| `smart_pairing_waitlist` | 6 | 6 | 0 |
| `territorial_profile_indicators` | 1,502 | 1,502 | 0 |

Result: 15/15 equal counts; every delta is zero.

## Structural post-migration evidence

- `campaign_zone_progress` exists.
- `campaign_zone_progress_history` exists.
- `get_campaign_zone_progress(uuid)` exists.
- `admin_set_zone_manual_progress(uuid,numeric,text)` exists.
- `admin_clear_zone_manual_progress(uuid,text)` exists.
- Forced RLS is active on both new tables.
- Both retained-history foreign keys use `ON DELETE SET NULL`.
- The immutable-snapshot trigger is enabled.
- The restored production snapshot has zero campaign zones, therefore the new
  progress and history tables correctly contain zero rows after migration.

## Contract isolation and cleanup

Behavior, concurrency, and retention tests used disposable databases derived
from the restored clone. Synthetic fixture compatibility adjustments were
limited to those disposable databases because:

- the production schema rejects the fixture-only `super_admin` role;
- production requires synthetic defaults not present in the minimal fixture;
- the portable restore used `--no-owner --no-acl`, so the fixture's local
  security-definer owner and base `profiles` read grant had to be restored in
  the disposable harness.

All disposable databases were removed after execution. The canonical clone was
not changed by fixture or destructive contract data.

The migration-history rehearsal registered only these pairs:

- `202607230001` → `campaign_zone_progress`;
- `20260724101527` → `campaign_zone_progress_predeploy_fixes`.

It used empty `statements` arrays, performed no SQL migration replay, rejected a
duplicate version, and ended with `ROLLBACK`. The canonical clone migration
history therefore remains at 9 rows.

## Closeout review

- Source commit `a7a3c8d709e6fdf737242517092fe62e5a11a8a1` was reviewed in
  full.
- The source commit added only this Markdown report.
- The worktree was clean before the closeout corrections.
- Closeout corrections modify only this Markdown report.
- No migration, database object, test, or application source file was changed.
- `git diff --check` passed.
- The evidence checklist passed 17/17 required content checks.
- The sanitized-content scan found zero secret-pattern matches.
- No production command was executed during closeout.

## Sanitized verdict

**PASS — 10/10 clone-only controls completed successfully.**

This verdict proves the requested isolated clone rehearsal only. It is not an
authorization for production DDL, DML, migration repair, migration, or deploy.
The only residual evidence reserve is the unavailable final child-process exit
code for `pg_dump`; artifact integrity and restore fidelity were independently
verified as described above.
