# Security: `public.campaigns` owner write lockdown (Phase 3B.4-D6)

**Status: prepared and tested in isolation. NOT applied to Production. Wait for explicit approval.**

| | |
|---|---|
| Branch / base | `security/campaigns-owner-write-lockdown` from `99422c7` (3B.4-S artifacts; `4d46bc9` lineage) |
| Production app | `047a764d54624088c6271b112ca53be09b6c5732` |
| Migration | `supabase/migrations/20261009150000_campaigns_owner_write_lockdown.sql` |
| Rollback | `supabase/migrations/rollback/20261009150000_campaigns_owner_write_lockdown.rollback.sql` (manual) |
| Release scripts | `docs/release/3b4d6-apply-campaigns-write-lockdown.sql` (guarded, one transaction), `docs/release/3b4d6-verify-campaigns-write-lockdown.sql` (read-only) |
| Tests | `tests/campaigns_owner_write_lockdown.test.mjs` + `tests/fixtures/campaigns_security_catalog.json` |

Evidence comes from Production catalog SELECTs inside `BEGIN TRANSACTION READ ONLY … ROLLBACK`. Only aggregates, catalog rows and function source were read; no customer row contents. **No write test was ever run against Production.**

## 1. Confirmed exposure (live catalog, 2026-10-09)

| Object | Live state |
|---|---|
| `campaigns` table | RLS on (not forced), owner `postgres`. ACL `anon=arwdDxtm`, `authenticated=arwdDxtm`, `service_role=arwdDxtm`. No column ACLs. |
| Policy `campaigns_own_insert` | `INSERT TO authenticated WITH CHECK (auth.uid() = user_id)` |
| Policy `campaigns_own_update` | `UPDATE TO authenticated USING/CHECK (auth.uid() = user_id)` |
| Policy `campaigns_own_select` | `SELECT TO authenticated USING (auth.uid() = user_id)` (kept) |
| Policy `campaigns_admin_all` | `ALL TO authenticated`, condition `profiles.role IN ('admin','super_admin')` (kept) |
| Triggers | `campaigns_marketplace_assignment_guard_trg` (blocks only `supplier_id` and the `quote_selected/assigned` statuses), `campaigns_marketplace_code`, `set_campaigns_updated_at` |
| Data shape | 104 rows; `metadata.payment_status`: 64 `pagato`, 22 `in_attesa_pagamento`, 18 null |

Reproduced on the Production-faithful fixture before the migration (§5):
- a signed-in customer can **INSERT** a campaign with `total_amount 0.01`, `status 'approved'` and `payment_status 'pagato'`;
- on their own campaign they can **UPDATE** `total_amount`, set `status = 'approved'`, set `metadata.payment_status = 'pagato'`, replace the whole `metadata`, and edit any column.

`TRUNCATE` (granted to anon/authenticated; RLS doesn't filter it) passes the privilege check and is stopped only by foreign keys.

## 2. Legitimate write paths (Production code `047a764` and deployed functions)

| Path | Actor / DB role | Operation and fields | Authorization today | Legitimate | Effect of this fix |
|---|---|---|---|---|---|
| `submit-campaign-request` v11 (Step4 and Preventivo Rapido) | Edge function, **service_role** key (`SUPABASE_SERVICE_ROLE_KEY`) | INSERT campaign; DELETE on zone-insert failure | service_role (BYPASSRLS) | yes | **None.** Pricing trust is a separate issue (3B.4-P). |
| `admin-grant-access` v11 (deployed equals repo) | Edge function: checks the JWT, then `profiles.role='admin'`, then writes with the service client | UPDATE `user_id` | service_role | yes | None |
| `ai-campaign-report` | — | UPDATE | — | **Not deployed** (absent from the function list) | n/a |
| `claim_public_campaign` RPC (`useCampagne.js`) | customer, `authenticated` → SECURITY DEFINER owned by `postgres` | UPDATE `user_id` where the email matches and the user is verified | function checks | yes | None (runs as `postgres`) — tested |
| `customer_accept_supplier_quote` RPC | customer → SECURITY DEFINER | UPDATE `supplier_id`, `status = 'quote_selected'` | function checks plus `marketplace.rpc` | yes | None — tested |
| `supplier_submit_quote` RPC | supplier → SECURITY DEFINER | UPDATE `status = 'receiving_quotes'` | function checks | yes | None — tested |
| `admin_cancel/archive/reopen_campaign`, `admin_revoke_payment_confirmation` | admin → SECURITY DEFINER (`gps_is_admin`) | UPDATE `status` and `metadata.payment_status` | function checks | yes | None — cancel and revoke tested; archive and reopen use the same mechanism |
| `admin_hard_delete_campaign`, `admin_create_operator_assignment` | admin → SECURITY DEFINER | DELETE / UPDATE `status` | function checks | yes | None (same mechanism; not loaded in the fixture because of about 15 GPS-table dependencies) |
| Admin `NewCampaign` (`campaigns-api.createCampaign`) | admin, `authenticated` direct REST | INSERT | `campaigns_admin_all` | yes | None — tested |
| Admin `confirmCampaignPayment` (AdminOrdersRegistry, ClientsQuotes) | admin, direct PATCH | `metadata.payment_status = 'pagato'`, `status` | `campaigns_admin_all` | yes | None — tested |
| Admin `AssignWork` | admin, direct UPDATE | `supplier_id`, `metadata` | `campaigns_admin_all` plus marketplace guard | yes | None (existing guard unchanged) |
| Admin GPS monitor `saveCampaignManualOperationalMetrics` | admin, direct UPDATE | `metadata.manual_operational_metrics` | `campaigns_admin_all` | yes | None — tested, including an admin outside the email allowlist |
| `campaigns-api.updateCampaignStatus` | — | UPDATE status | — | no callers | n/a |
| `supabaseClient.saveCampaign` (direct REST POST as the customer) | customer | INSERT with any `total_amount` | `campaigns_own_insert` | **no current caller (legacy)** | **Blocked (intended)** |
| Any customer direct PATCH | customer | any column | `campaigns_own_update` | **none found** | **Blocked (intended)** |
| Cron jobs / other-table triggers writing `campaigns` | — | — | — | none exist | n/a |
| Views | `campaign_summary`, owner `postgres`, not insertable or updatable | — | — | — | No write path (but see §7 for reads) |

The edge-function check was done on deployed sources: `submit-campaign-request` v11 = `6a2ecf91…` and `admin-grant-access` v11 both write with the **service_role** client.

## 3. Design

Three layers. Each one is independently covered by a mutation test.

1. **RLS.** Drop `campaigns_own_insert` and `campaigns_own_update`. Owners keep SELECT (`campaigns_own_select`). Admins keep everything (`campaigns_admin_all`). No owner write policy remains.
2. **Grants.**
   - `anon` loses INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. It has no `campaigns` write policy anyway, and keeps SELECT, which RLS still filters to 0 rows.
   - `authenticated` loses TRUNCATE (not filtered by RLS), REFERENCES, TRIGGER and MAINTAIN. It keeps SELECT, INSERT, UPDATE and DELETE because admins write through `campaigns_admin_all`.
   - Column privileges were considered and rejected. Admins and customers share the `authenticated` role, so a column REVOKE would break the admin pages.
3. **Guard trigger** `campaigns_client_write_guard_trg`, BEFORE INSERT OR UPDATE OR DELETE, SECURITY INVOKER, `search_path = ''`.
   - It raises `42501 CAMPAIGN_WRITE_SERVER_ONLY` when `current_user IN ('anon','authenticated')` and the caller does not pass the **same admin predicate as `campaigns_admin_all`**.
   - Statements inside SECURITY DEFINER RPCs run as `postgres`, and service_role/postgres are exempt, so all legitimate server-mediated flows keep working.
   - It protects every column, including nested `metadata`, even if a permissive owner policy is added again later.
   - It is not callable as an RPC: EXECUTE is revoked and it is a trigger function.

**Requirements check**

| # | Requirement | Met by |
|---|---|---|
| 1 | No arbitrary customer prices | Layers 1 and 3 |
| 2 | No self-approval | Layers 1 and 3 |
| 3 | No self-marked payment | Layers 1 and 3 |
| 4 | Financial fields and nested JSON guarded | The whole row is guarded for non-admins |
| 5 | Customer reads retained | `campaigns_own_select` kept. No legitimate direct customer edit exists today; future customer edits must go through a narrow SECURITY DEFINER RPC. |
| 6 | Admin and service workflows retained | Tested |
| 7 | Direct REST bypass blocked | Tested |
| 8 | No writable view/RPC bypass | The only view is not updatable. The 9 writer RPCs enforce their own authorization. |
| 9 | RLS, grants and triggers evaluated together | Tested as a matrix |
| 10 | Server-mediated creation | Already the case: `submit-campaign-request` |

## 4. Role / operation permission matrix

Proven on the fixture by `tests/campaigns_owner_write_lockdown.test.mjs`.

| Scenario | Before | After |
|---|---|---|
| anon INSERT | denied 42501 | denied 42501 |
| anon UPDATE / DELETE | 0 rows (RLS) | **denied 42501** (no grant) |
| anon TRUNCATE | privilege OK, stopped only by FK (0A000) | **denied 42501** |
| customer INSERT, arbitrary price / approved / pagato | **allowed** | **denied 42501 `CAMPAIGN_WRITE_SERVER_ONLY`** |
| owner UPDATE `total_amount` 236.85 → 0.01 | **1 row changed** | 0 rows, unchanged |
| owner UPDATE `status = 'approved'` | **changed** | unchanged (`pending_review`) |
| owner UPDATE `metadata.payment_status = 'pagato'` | **changed** | unchanged |
| owner replaces the whole `metadata` | **changed** | unchanged |
| owner UPDATE `notes` (a "harmless" field) | changed | unchanged. No legitimate direct owner edit exists. |
| owner DELETE | 0 rows | 0 rows |
| owner TRUNCATE | privilege OK (FK stops it) | **denied 42501** |
| other customer UPDATE | 0 rows | 0 rows |
| owner SELECT own campaigns | 4 rows | 4 rows |
| admin (allowlisted) approve + mark paid | OK | OK |
| admin (role admin, **not** email-allowlisted) metadata update | OK | OK |
| admin INSERT / DELETE | OK | OK |
| service_role INSERT / UPDATE / DELETE | OK | OK |
| RPC `claim_public_campaign` (customer) | OK, `user_id` set | OK |
| RPC `supplier_submit_quote` (supplier) | OK, `receiving_quotes` | OK |
| RPC `customer_accept_supplier_quote` (customer) | OK, `quote_selected` + supplier | OK |
| RPC `admin_revoke_payment_confirmation` (admin) | OK | OK |
| RPC `admin_cancel_campaign` (admin) | OK, `cancelled` | OK |
| customer calls an admin RPC | denied 42501 | denied 42501 |
| customer calls `campaigns_client_write_guard()` | — | denied |

**Final ACL:** `{postgres=arwdDxtm, anon=r, authenticated=arwd, service_role=arwdDxtm}`.
**Policies:** `campaigns_admin_all`, `campaigns_own_select`.

## 5. Test evidence

`PGLITE_MODULE=<…>/@electric-sql/pglite/dist/index.js node --test tests/campaigns_owner_write_lockdown.test.mjs` passes **24/24** on PGlite 0.5.8 (PostgreSQL 18.3).

**Fixture.** `tests/fixtures/campaigns_security_catalog.json` is a read-only export of the Production catalog:
- 6 tables (`campaigns`, `profiles`, `quotes`, `supplier_profiles`, `clienti`, `campaign_admin_action_log`) with exact columns, types, defaults, constraints, RLS flags, policies, ACLs and triggers;
- the real bodies of 20 functions.

A re-export just before commit was byte-equal. The single allowlisted admin email was replaced with `allowlisted-admin@example.test`. `auth.uid()/jwt()/role()` follow Supabase's `request.jwt.claims` semantics, and every probe runs as the real role (`SET LOCAL ROLE`) inside a rolled-back transaction.

| Area | Tests |
|---|---|
| Static | Migration minimality; rollback text equals the live policy text |
| Engine | Exposure reproduced before; full matrix after (§4); data checksum unchanged; idempotent re-apply; migration → rollback → exact catalog and matrix → re-apply; failure inside the transaction leaves no partial state |
| **Mutations (detected)** | (a) policies kept and no trigger; (b) guard keyed on the JWT role instead of `current_user`, which breaks SECURITY DEFINER RPCs; (c) guard requiring `gps_is_admin`, which breaks policy admins; (d) TRUNCATE left to authenticated; (e) anon writes left |
| Release scripts | Apply embeds the migration verbatim. verify `pre` → apply → verify `post` (rows md5 unchanged, history row once, matrix equals AFTER). A second apply aborts. Guard 1 aborts with zero changes on: ACL drift, extra policy, changed owner policy, column ACL, extra trigger, already-recorded version, non-`postgres` executor. Rollback plus history delete returns to the exact `pre`. The verify script cannot write (25006). |

**Engine differences (PG 18.3 vs live 17.6).**
- PG18 catalogs NOT NULL as constraints. That has no effect on RLS, grants or triggers.
- In PGlite, `postgres` is a superuser, while in Supabase it is BYPASSRLS but not superuser. SECURITY DEFINER RPCs run as `postgres` in both, and the guard keys on `current_user`, so behaviour is the same.
- `MAINTAIN` exists on both (verified live).

**Not exercised.** `admin_hard_delete_campaign` and `admin_create_operator_assignment`, because of their dependencies. They are SECURITY DEFINER and owned by `postgres` (verified live), the same mechanism as the tested RPCs. PostgREST itself is not run; it maps to the same roles.

## 6. Regression

Full `npm test`, branch versus clean baseline `99422c7`: **2075 tests**. The baseline has 19 failures; the branch shows the same 19 plus `map_studio_performance` "hit-test con indice…". That test is a timing benchmark that flakes under parallel load (seen before on `fdcd019`), and it passed 3/3 in isolation. **0 new failures.** `git diff --check` is clean. The branch changes no application source, so build and prerender are unaffected.

## 7. Remaining bypasses / related findings (not changed here: separate decisions)

1. **`campaign_summary` view read exposure (HIGH).**
   - The view is owned by `postgres` without `security_invoker`, and `anon` has SELECT on it.
   - Measured as `anon` in a read-only transaction (count only): **104 of 104 campaign rows are readable**, while `campaigns` returns 0 as anon.
   - Columns include `user_id`, `title`, quote amounts and `raw_inputs`.
   - Fix options: `ALTER VIEW … SET (security_invoker = true)` plus a check of the policies on `quotes` and `campaign_analysis`, or REVOKE SELECT from anon/authenticated if unused.
2. **`campaign_zones` owner write.** `campaign_zones_own_insert/own_update` (roles public, scoped by campaign ownership) still let owners edit their zone rows: quantity and geometry, which are pricing evidence.
3. **Admin definition mismatch.** `campaigns_admin_all` trusts `profiles.role IN ('admin','super_admin')` without the email allowlist that the admin RPCs use (`gps_is_admin`). This is kept unchanged here to avoid admin regressions. Profile `role` updates are blocked by trigger. Profile INSERT of `role` is possible in principle, but every auth user already has a profile created as `client` by `handle_new_user` (17/17), so there is no current path.
4. **Broad default privileges.** Default privileges in `public` grant `arwdDxtm` and EXECUTE on new objects to anon/authenticated.
5. **Server-side pricing.** Even after this fix, `submit-campaign-request` still accepts client `total_amount`. That is 3B.4-P.

## 8. Production deployment plan (single migration; requires explicit approval)

**Never `supabase db push`.** Repository and Production histories diverge.

1. **Gate 1, artifacts.** Check commit, paths and sha256 of the migration, rollback, apply and verify files against the release record.
2. **Gate 2, read-only precheck.** Run `3b4d6-verify-campaigns-write-lockdown.sql`. It must return `state: "pre"`.

   Precheck observed on 2026-10-09:
   - ACL as in §1, 4 policies;
   - triggers: the 3 existing ones;
   - no guard function, version not recorded;
   - rows n=104, md5 `b568acfa2ddc87083fd8eccf76d65e81`, max `updated_at` 2026-10-02T09:01:08Z.

   Record the values at release time; md5 changes with legitimate traffic. Also check locks and idle-in-transaction sessions, as in 3B.4-S. Guard 1 of the apply script was dry-run on live inside a READ ONLY transaction and **passed**.
3. **Gate 3, apply** `3b4d6-apply-campaigns-write-lockdown.sql` once, as `postgres`, through `supabase db query --linked -f` (the path proven in 3B.4-S: BEGIN honoured, an error aborts the batch). It uses `lock_timeout 3s` and `statement_timeout 30s`, and runs Guard 1, then the migration statements verbatim, then Guard 2, then the history row, then COMMIT.
4. **Gate 4, read-only postcheck.** The verify script must return `state: "post"`:
   - ACL `anon=r`, `authenticated=arwd`;
   - 2 policies, 4 triggers;
   - guard function `secdef=false` with no anon/auth EXECUTE;
   - rows n and md5 equal to the precheck (if they differ, check `max_updated_at` for concurrent legitimate writes);
   - version recorded once.
5. **Gate 5, API probes.** No data change is possible:
   - **anon** `GET /rest/v1/campaigns?select=id&limit=1` → 200 with `[]`;
   - **anon** `PATCH /rest/v1/campaigns?id=eq.00000000-0000-0000-0000-000000000000` `{"notes":null}` → 401/42501 "permission denied";
   - **no** authenticated customer write probes against Production, because they would need a real account and could touch real rows.
6. **Gate 6, smoke** (read-only browser, non-GET blocked):
   - public pages, configurator Step3/Step4, quick quote load;
   - customer dashboard reads;
   - admin pages load.

   Optionally, after the release, a real admin action (for example confirm payment) performed by the admin in their own session.

## 9. STOP / rollback decision matrix

| Observation | Committed? | Decision |
|---|---|---|
| Precheck `pre` with expected values | — | Proceed |
| Precheck `UNEXPECTED` or drift | — | **STOP**, re-audit |
| Apply raises `3B4D6_ABORT` / timeout / error | No | **STOP.** Verify still `pre`. Never edit the guards to force through. |
| Postcheck `post`, rows unchanged | Yes | Continue |
| Postcheck `UNEXPECTED` | Yes | **STOP**, preserve evidence, investigate. Do not auto-rollback. |
| anon PATCH returns 2xx | Yes | **STOP and investigate. Do not roll back** (that re-opens writes). |
| Customer submission (Step4 / quick quote) fails | Yes | Not expected (service_role). Capture the error. Roll back only on a demonstrated cause, **with separate approval**. |
| Admin action fails with `CAMPAIGN_WRITE_SERVER_ONLY` | Yes | The admin's profile role is not `admin/super_admin`. Fix the profile, not the guard. Rollback only with separate approval. |
| Claim / accept-quote / supplier-quote RPC fails | Yes | Not expected (runs as `postgres`). Capture it. Rollback only with separate approval. |

**Rollback** (separate explicit approval only): run the rollback file as `postgres`, then:

```sql
delete from supabase_migrations.schema_migrations where version = '20261009150000';
```

The verify script must then return `pre`. Rollback re-opens the vulnerability.
