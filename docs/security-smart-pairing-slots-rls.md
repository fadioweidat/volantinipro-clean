# Security: `public.smart_pairing_slots` write lockdown (Phase 3B.4-S)

Status: **prepared and tested locally. Not applied to Production.**

Files:
- `supabase/migrations/20261009120000_smart_pairing_slots_write_lockdown.sql`
- rollback: `supabase/migrations/rollback/20261009120000_smart_pairing_slots_write_lockdown.rollback.sql`
- tests: `tests/smart_pairing_slots_rls.test.mjs`

## 1. Confirmed exposure (Production catalog, read-only, 2026-10-09)

The evidence comes from SELECT queries on catalog and aggregate data inside `begin transaction read only … rollback`. No row contents were read.

| Item | Production value |
|---|---|
| RLS | enabled, not forced; owner `postgres` |
| Policy `Public read slots` | `FOR SELECT TO public USING (true)` |
| Policy `Service role all` | `FOR ALL TO public USING (true) WITH CHECK (true)`. It applies to **every** role, despite its name. |
| Table ACL | `anon=arwdDxtm`, `authenticated=arwdDxtm`, `service_role=arwdDxtm`. There are no explicit column ACLs. |
| Role attributes | `service_role` and `postgres` have BYPASSRLS. `anon`, `authenticated` and `authenticator` do not. |
| Rows | 36 rows, all `stato='attiva'`, dated 2026-04-21 to 2026-07-14. **No row has `cliente` or `note` populated.** |
| Dependent objects | View `available_slots_with_pairing`: a LEFT JOIN with `availability_slots`, not insertable or updatable, owner `postgres`, no `security_invoker`. Trigger `sp_slots_updated_at_trigger` runs `update_sp_slots_updated_at()`, which is not SECURITY DEFINER. No other function references the table. It is not in any publication. |

**Consequence:** anyone holding the public anon key (shipped in the web bundle) can INSERT, UPDATE and DELETE every slot through PostgREST `/rest/v1/smart_pairing_slots`. `TRUNCATE`, `TRIGGER` and `MAINTAIN` are also granted at SQL level. PostgREST does not expose those, but they are unnecessary privileges.

## 2. Who legitimately uses the table

- **Production code (`047a764`):** no reads or writes. The table appears only in the remote baseline migration.
- **Legacy client code** on old branches (`volantinipro-final.jsx`, the pre-`e00c348` `Step3.jsx`): `select("id").eq("stato","attiva")` as anon. This is **read-only**. It was removed on 2026-08-05.
- **Edge functions:** `smart-pairing-availability` v10 reads `campaigns`, not this table. Server-side writers would use `service_role`, which bypasses RLS.
- **Data entry:** rows were seeded by the owner, via the dashboard or SQL editor as `postgres`, which bypasses RLS.

**Is public SELECT needed?** Production doesn't need it. It is **kept unchanged** in this minimal fix, for these reasons:
- the ticket targets write authorization;
- old cached bundles may still run the legacy read;
- today the readable columns hold no personal data (`cliente` and `note` are empty in all 36 rows).

Removing public SELECT is listed as an optional follow-up.

## 3. Permission matrix (verified on a real Postgres engine)

The baseline DDL was loaded verbatim. Every probe is rolled back.

| Role | SELECT | legacy `id where stato='attiva'` | view SELECT | INSERT | UPDATE | DELETE | TRUNCATE |
|---|---|---|---|---|---|---|---|
| anon, **before** | ✅ 36 | ✅ 36 | ✅ | ✅ | ✅ 36 rows | ✅ 36 rows | ✅ |
| anon, **after** | ✅ 36 | ✅ 36 | ✅ | ❌ 42501 | ❌ 42501 | ❌ 42501 | ❌ 42501 |
| authenticated, **before** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| authenticated, **after** | ✅ 36 | ✅ 36 | ✅ | ❌ 42501 | ❌ 42501 | ❌ 42501 | ❌ 42501 |
| service_role, before and after | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| postgres (owner), before and after | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

`anon` reached through the `authenticator` login role, as PostgREST does, is also denied (42501).

## 4. Migration

```sql
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.smart_pairing_slots from anon, authenticated;

drop policy if exists "Service role all" on public.smart_pairing_slots;
drop policy if exists "smart_pairing_slots_service_role_all" on public.smart_pairing_slots;
create policy "smart_pairing_slots_service_role_all"
  on public.smart_pairing_slots for all to service_role
  using (true) with check (true);
```

- There are two independent layers: the privilege revoke, and the policy scoped to `service_role`. Each one alone blocks anon/authenticated writes; the mutation tests prove both are checked.
- It is idempotent and touches no data.
- `MAINTAIN` requires PostgreSQL ≥ 17. Production runs 17.6.

## 5. Rollback

`supabase/migrations/rollback/…rollback.sql` restores, in one transaction:
- the exact `Service role all` policy (`TO public`, `USING true`, `WITH CHECK true`);
- the `arwdDxtm` grants.

It is manual only, and it **re-opens the exposure**.

## 6. Test evidence

`tests/smart_pairing_slots_rls.test.mjs`, run with `PGLITE_MODULE=<…>/@electric-sql/pglite/dist/index.js node --test tests/smart_pairing_slots_rls.test.mjs`. Result: **7/7 pass** on PGlite 0.5.8 (PostgreSQL 18.3). This is an isolated in-memory engine, not a remote database.

1. Static check: the migration contains only the revoke and the policy swap. There is no SELECT change, no data DML and no other object.
2. Static check: the rollback restores the exact baseline statements, wrapped in `begin`/`commit`.
3. The baseline fixture reproduces the Production catalog: same policies and ACL, and the exposure is reproduced (anon/authenticated can write).
4. After the migration:
   - the matrix above holds;
   - the row checksum (md5 of all rows) is unchanged;
   - the view, `availability_slots`, triggers, indexes and RLS flag are unchanged;
   - column privileges for writes are gone;
   - the `authenticator` → `anon` path is denied;
   - `service_role` updates persist and the `updated_at` trigger still fires.
5. It is idempotent: applying it twice gives the same matrix and checksum.
6. Migration → rollback → migration: the rollback restores policies, ACL and the write matrix exactly, the data is unchanged, and re-applying locks writes again.
7. A failure inside the migration transaction leaves no partial state.

**Mutation check:**
- Without the REVOKE, 4 tests fail.
- With the policy scoped to `public`, 2 tests fail. Writes are still blocked by the grants, and the policy assertion catches the change.

**Not covered:** the engine is PostgreSQL 18.3, while Production is 17.6. The statements used behave the same on both. PostgREST is not run; it maps the same database roles.

## 7. Impact assessment

- **Customer site, configurator, admin, driver, GPS and payments:** no impact. No Production code reads or writes this table.
- **Edge functions:** no impact. `service_role` bypasses RLS and keeps all privileges.
- **Manual data entry as `postgres`:** no impact.
- **Legacy cached bundles:** their read still works.
- **Anything writing as anon/authenticated:** now gets `42501`. None is known; that's the intended effect.

## 8. Production deployment checklist (needs explicit approval; not done)

1. **Pre-check (read-only).** Confirm the catalog still matches §1:
   ```sql
   select policyname, roles, cmd, qual, with_check from pg_policies where tablename='smart_pairing_slots';
   select relacl from pg_class where oid='public.smart_pairing_slots'::regclass;
   select attname from pg_attribute where attrelid='public.smart_pairing_slots'::regclass and attacl is not null;  -- expect 0 rows
   select count(*), md5(string_agg(row_to_json(s)::text,'|' order by id)) from public.smart_pairing_slots s;  -- record
   ```
   If anything differs, **STOP**.
2. Apply only this migration file, in a transaction, for example with the SQL editor or `psql -1 -f`. Do **not** run `supabase db push`, which could also push other pending repo migrations.
3. **Post-check:**
   - policies are `Public read slots` plus `smart_pairing_slots_service_role_all` (`{service_role}`);
   - `relacl` shows `anon=r`, `authenticated=r`, `service_role=arwdDxtm`;
   - the count and md5 match the pre-check.
4. **Functional check without writing data.** With the anon key:
   - `GET /rest/v1/smart_pairing_slots?select=id&limit=1` returns 200;
   - `PATCH /rest/v1/smart_pairing_slots?id=eq.00000000-0000-0000-0000-000000000000` with body `{}` returns 401/403 (`42501`) and matches no row.

   Do not send INSERT or DELETE probes to Production.
5. Smoke-test the public site (configurator Step 3) and the admin dashboard. Neither depends on the table.
6. Record the migration in `supabase_migrations.schema_migrations` only if that is the team's convention for manually applied files.
7. **Rollback:** run the rollback file if an unexpected regression appears, then re-plan.

## 9. Related findings (not changed here; separate decisions)

- **View read bypass.** `available_slots_with_pairing` is owned by `postgres` without `security_invoker`, so anon reads `availability_slots` rows through it. `availability_slots` has RLS enabled with **no** policies, so direct anon reads are otherwise denied. Fix options: `alter view … set (security_invoker = true)` plus explicit policies, or revoke SELECT on the view from anon. Writes through the view are impossible because it is not updatable.
- **Broad default privileges.** Default privileges in `public` grant `arwdDxtm` on new tables to `anon` and `authenticated`. Any new table without RLS would be fully exposed.
- **`availability_slots` grants.** It also has `GRANT ALL` to anon/authenticated. RLS with no policies currently blocks it, but the grants are broader than needed.
- **Optional public SELECT removal.** Revoking SELECT on `smart_pairing_slots` from anon/authenticated once legacy bundles are gone.
