# campaign_summary view lockdown (prepared, NOT applied)

Migration: `supabase/migrations/20261009160000_campaign_summary_view_lockdown.sql`
Rollback (manual): `supabase/migrations/rollback/20261009160000_campaign_summary_view_lockdown.rollback.sql`
Tests: `tests/campaign_summary_view_lockdown.test.mjs` (PGlite, `PGLITE_MODULE=…/@electric-sql/pglite/dist/index.js`)
Fixture: `tests/fixtures/campaign_summary_catalog.json` (Production catalog, schema only, no rows)

## Read-only audit, 2026-10-09

The queries were run with `supabase db query --linked` inside `begin transaction read only; … rollback;`. They returned catalog data and aggregate counts only.

| Item | Production |
|---|---|
| View owner / reloptions | `postgres` / none (owner rights, RLS of base tables not applied) |
| View ACL | `anon`, `authenticated`, `service_role`: `arwdDxtm` (baseline `GRANT ALL`) |
| Definition | `campaigns c LEFT JOIN LATERAL (latest quote by id) LEFT JOIN campaign_analysis`, 25 columns |
| Updatable | no (`_RETURN` rule only, no triggers), so writes already fail with 55000 |
| Dependents | no view or function references it |
| `campaigns` RLS | `campaigns_own_select` (owner), `campaigns_admin_all` (profiles admin) |
| `quotes` RLS | owner (via campaigns) + `quotes_supplier_own_select`; **no admin policy** |
| `campaign_analysis` RLS | `campaign_analysis_own_select` / `_own_insert` (owner via campaigns); **no admin policy** |
| As anon | view 104 rows (1 with quote, 1 with analysis); campaigns 0, quotes 0, campaign_analysis 0 |
| pg_stat_statements since 2026-09-16 | 2 statements, all as `anon` (the audit's own probes); none as `authenticated` or `service_role` |
| Code at Production SHA 047a764 | no reference in `src/` or `supabase/functions` (only `own_campaign_summary`, an AI permission label) |

## Fix

```sql
revoke all on table public.campaign_summary from anon, authenticated;
alter view public.campaign_summary set (security_invoker = true);
```

- The revoke closes the leak. No client caller exists, so nothing breaks. `service_role` and `postgres` keep their access.
- `security_invoker` is defence in depth. A later `GRANT`, or a recreate under the `public` default privileges (which grant ALL to anon/authenticated), would then apply the caller's RLS instead of the owner's.
- `security_invoker` alone was rejected. It stops the leak, but admins would get every campaign with the quote and analysis columns empty for other owners, because `quotes` and `campaign_analysis` have no admin policy. anon and authenticated would also keep write privileges.
- **Owners and admins:** their legitimate reads go to the base tables, and those are unchanged. The tests check, as each role, that `campaigns`, `quotes` and `campaign_analysis` return exactly the same counts before and after the migration.
- The migration does not depend on `20261009150000_campaigns_owner_write_lockdown`. The tests apply the two in either order.
- **Rollback:** after a rollback the ACL entries come back in a different order (`grant` appends them). The privilege set is identical.
