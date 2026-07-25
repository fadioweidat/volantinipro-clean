# GPS-PROD-6O — Clone rehearsal report

Date: 2026-07-25

Scope: isolated PostgreSQL 17 clone only.

Production safety invariant: no production DDL, DML, migration, migration
repair, or deploy was executed. No connection string is included in this
report or in the committed test artifacts.

## Isolated clone

- Container: `gps-prod-6o-restore-20260725-053603`
- Image: `public.ecr.aws/supabase/postgres:17.6.1.084`
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
| 1 | Dump SHA-256 | `D5597F6F2975E17888A0531314F07867D2D70C9F78BBB4482CB7AA1E82A43CFD` | PASS |
| 2 | `pg_restore --list` | Exit code 0; 924 archive entries | PASS |
| 3 | `202607230001_campaign_zone_progress.sql` on clone | Exit code 0; transaction committed on `restore_rehearsal` | PASS |
| 4 | `20260724101527_campaign_zone_progress_predeploy_fixes.sql` on clone | Exit code 0; transaction committed on `restore_rehearsal` | PASS |
| 5 | Schema contracts | Original and predeploy schema contracts, exit code 0 | PASS |
| 6 | RPC contracts | Original and predeploy RPC contracts, exit code 0 | PASS |
| 7 | Behavior contract | 38 passed, 0 failed; exit code 0 | PASS |
| 8 | Concurrency contract | 5 passed, 0 failed; two overlapping PostgreSQL sessions | PASS |
| 9 | Retention contract | 8 passed, 0 failed; exit code 0 | PASS |
| 10 | Migration-history rehearsal | 5 passed, 0 failed; 9 → 11 simulated rows; duplicate rejected | PASS |

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

## Sanitized verdict

**PASS — 10/10 clone-only controls completed successfully.**

This verdict proves the requested isolated clone rehearsal only. It is not an
authorization for production DDL, DML, migration repair, migration, or deploy.
