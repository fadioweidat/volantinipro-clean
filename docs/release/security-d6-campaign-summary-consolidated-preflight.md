# Consolidated security release preflight: 3B.4-D6 + campaign_summary

**Status: preflight complete. NOTHING APPLIED. Wait for explicit approval before any Production change.**

| | |
|---|---|
| Date | 2026-10-09 |
| Production app | `047a764d54624088c6271b112ca53be09b6c5732` (unchanged) |
| Supabase project | `volantinipro`, eu-west-1, ACTIVE_HEALTHY. Linked ref = app env ref = ref in the live `www.volantinipro.it` bundle. |
| PostgreSQL | 17.6 |
| Consolidation branch | `release/security-d6-campaign-summary-preflight`, based on `1333e1a`, which contains D6 `757053b` |
| Method | Production: read-only only (`BEGIN TRANSACTION READ ONLY … ROLLBACK`, aggregates and catalog, no customer data). Tests: PGlite 0.5.8 (PG 18.3) built from Production catalog exports. |

## 1. Duplicate campaign_summary work: resolution

| | **Selected: `security/campaign-summary-security-invoker` @ `1333e1a`** (task_7844ef05) | Alternative: `security/campaign-summary-anon-read-lockdown` @ `62ee06d` |
|---|---|---|
| Migration | `20261009160000_campaign_summary_view_lockdown.sql` | `20261009170000_campaign_summary_security_invoker.sql` |
| SQL | `revoke all … from anon, authenticated;` then `security_invoker = true` | `security_invoker = true`; `revoke all … from anon`; authenticated keeps **SELECT** |
| anon | no access | no access |
| customer | **no access** to the view | own rows only (RLS) |
| admin | **no access** to the view | all campaigns, but **NULL quote/analysis columns** (no admin SELECT policy on `quotes` / `campaign_analysis`): partial, misleading data |
| supplier | no access | 0 rows |
| service_role / postgres | full (unchanged) | full (unchanged) |
| Rollback | exact privileges and options; ACL entry **order** differs (anon/authenticated re-granted after service_role). No security effect; its test compares sorted ACLs. | exact privileges, options and ACL text |
| Tests | 15/15 (minimality, matrix, idempotent, D6 order, rollback, atomicity, 5 mutants incl. "authenticated keeps SELECT") | 22/22 (plus release scripts) |
| Release scripts | none (added on the consolidation branch, §5) | yes |

**Why `1333e1a`.**
- It is least privilege: no client role reads the view.
- It removes the admin-NULL ambiguity instead of documenting it.
- Nothing reads the view:
  - no code at `047a764`;
  - no deployed edge function: 17 of 19 downloaded, the other 2 refused by the CLI path-safety check, and their repo source has no reference;
  - no SQL function, view or cron job;
  - `pg_stat_statements` since 2026-09-16 shows only 2 single `anon` reads, which are the audit probes.
- It has the smaller and clearer migration.

Its only cosmetic gap, the ACL text order after rollback, is handled by comparing ACLs as sets in the release verify script. Neither branch was modified or merged. The background task's worktree was inspected read-only (idle session, clean worktree, branch pushed).

The 62ee06d variant is kept only as a reference: it is the "safer alternative" if a future admin or customer report needs the view. Even then, admin SELECT policies on `quotes` and `campaign_analysis` would be needed first.

## 2. D6 integrity

- `757053b` artifacts are byte-identical in `1333e1a` and in the consolidation branch:
  - migration `13d1fa58…`
  - rollback `8b5f5c83…`
  - apply `7bffffbd…`
  - verify `fc41da29…`
- **CRLF issue: a harness bug, not a security bug.** The original `757053b` test gives:
  - **24/24** on a clean LF checkout;
  - **21/24** on a Windows CRLF checkout, because three mutants use `\n`-specific replacements and fail-safe with "mutation must change the SQL".
- Test-only fix: branch `test/d6-crlf-portability` @ `c061c31`, a one-line `read()` CRLF normalisation. It gives **24/24 on CRLF**. Migration, rollback and release scripts are unchanged.

## 3. Combined isolated tests

`tests/security_d6_campaign_summary_combined.test.mjs` passes **12/12**. Fixtures:
- D6 Production catalog (6 tables, real function bodies);
- the view fixture of `1333e1a` (`campaign_analysis` plus the exact view; md5 `ab3f147a…` reproduced in the engine).

| Check | Result |
|---|---|
| Unique migration versions; 150000 and 160000 both after the last applied version (120000) | PASS |
| Both release scripts embed their migration verbatim | PASS |
| Fixture reproduces both exposures | PASS |
| D6 → view: intermediate D6-only matrix, then BOTH matrix; re-apply idempotent; data md5 unchanged | PASS |
| view → D6: intermediate view-only matrix, then BOTH matrix; idempotent; data unchanged | PASS |
| Rollback view first (D6-only), then D6: exact Production catalog, matrix and data | PASS |
| Rollback D6 first (view-only), then view: exact catalog, matrix and data | PASS |
| Error after both migrations in one transaction: no partial state | PASS |
| Guarded scripts A→B and B→A: each `pre` → `post`; history `120000,150000,160000`; BOTH matrix; re-running either script aborts with zero changes | PASS |
| View rollback plus history delete: verify `pre` (ACL as a set) | PASS |
| Both verify scripts read-only (25006) | PASS |

Other suites:

| Suite | Result |
|---|---|
| View candidate | 15/15 |
| D6 (fixed harness) | 24/24 |
| D6 (original harness, CRLF) | 21/24, harness only |
| Alternative view branch | 22/22 |
| **Full `npm test`** on the consolidation branch | 2075 tests, 2056 pass, **19 fail, names identical to the clean baseline `99422c7`**, so **0 new** |

The 19 pre-existing failures (unrelated: GPS monitor/map, homepage/SEO sections, AdminGuard, env/URL checks) are:
- `AdminGuard`
- `DriverWorkMapPage: traccia propria + tracce gruppo…`
- `E — GpsMonitor: canonicalOperators…`
- `F — autoNetRef…`
- `GpsLiveSection…`
- `HomePage: ordine sezioni…`
- `HowItWorksSection…`
- `ISOLAMENTO: nessun file map-studio…`
- `MULTI-OP — contratto sorgente…`
- `Nuove sezioni: responsive…`
- `nessun 192.168.10.65 / localhost:5174…`
- `publicAppUrl…`
- `riuso consentito (classe A audit)…`
- `sessione scaduta -> trattata come anonima…`
- `vercel.json: rewrite SPA…`
- `§18-A — "OPERATORI: N"…`
- `§18-A — canonicalOperators…`
- `§18-C — nome reale…`
- `§19-C(src)…`

## 4. Read-only Production preflight

| Item | Live |
|---|---|
| Schema fingerprint | Fresh export **byte-equal** to `tests/fixtures/campaigns_security_catalog.json` (tables and the 20 function bodies, admin email sanitised). `campaign_analysis` and the view (definition, owner, options, ACL) are equal to `tests/fixtures/campaign_summary_catalog.json`. |
| D6 verify | `state: "pre"`. ACL `anon=arwdDxtm, authenticated=arwdDxtm`. Policies `admin_all, own_insert, own_select, own_update`. 3 triggers; no guard function. Rows **n=104, md5 `b568acfa2ddc87083fd8eccf76d65e81`**, max `updated_at` 2026-10-02T09:01:08Z. 9 writer RPCs SECURITY DEFINER, owner `postgres`. |
| View verify | `state: "pre"`. Options null; ACL as audited; md5 `ab3f147ae7ef5ece7555debe9afde189`; 0 dependent views; base RLS on (campaigns, quotes, campaign_analysis); 104 rows via owner. |
| Guard 1 dry-run (READ ONLY) | D6 apply: **PASS**. View apply: **PASS**. |
| Roles | `authenticator` → anon/authenticated/service_role. BYPASSRLS: postgres, service_role, supabase_admin, supabase_etl_admin, supabase_read_only_user. Queries run as `postgres`. |
| Migration history | 68 rows, max `20261009120000`. `150000`, `160000` and `170000` are **absent** (no collision). Repo-vs-Production history divergence is known: never `db push`. |
| Locks / transactions | 0 foreign locks on campaigns, campaign_summary, quotes and campaign_analysis; 0 waiting; 0 idle-in-transaction; 0 other active clients |
| Consumers (`pg_stat_statements` since 2026-09-16) | View: only the 2 audit `anon` reads. `campaigns` writes: `service_role` 32 INSERT and 1 DELETE (submissions); `authenticated` **37 UPDATE, 0 INSERT**. |
| Attribution of the 37 authenticated UPDATEs | 32 campaigns updated since then: 22 with `payment_confirmed_at` (admin confirm-payment) and 16 with `supplier_mode` (admin AssignWork). **0 campaigns owned by a non-admin were modified after creation**, so no customer used the owner UPDATE path that D6 removes. Admin paths keep working (policy `campaigns_admin_all` plus guard admin predicate). |

## 5. Release plan: two separate guarded transactions

**Order: B (campaign_summary) first, then A (D6). STOP between them.**

- B is the lowest-risk change (no consumer, read-only effect) and closes the **anonymous** exposure immediately.
- A changes write authorization on a table with live admin traffic, so it gets its own window and an admin smoke test.
- Both orders were tested and are equivalent.

### Artifacts (sha256 of the LF git blob; on Windows use `git show <commit>:<path> | sha256sum`)

| Step | File | sha256 |
|---|---|---|
| B migration | `supabase/migrations/20261009160000_campaign_summary_view_lockdown.sql` | `f9f11d170e1b055d7d2cd1248c4670c87451a5d6903bc4483d67eacd5c822883` |
| B rollback | `supabase/migrations/rollback/20261009160000_campaign_summary_view_lockdown.rollback.sql` | `6cffe3991aee4fcb7ad74bbdcca805709cd5ac51d43a510f144b595228b1aa1d` |
| B apply | `docs/release/3b4v-apply-campaign-summary-view-lockdown.sql` | `599dedecf1a22205e960362c885e9f0f1f4584577d018536d5baeb3a7bfb5fe5` |
| B verify | `docs/release/3b4v-verify-campaign-summary-view-lockdown.sql` | `ac845361ea28c003b4e3cd2a5817b0d6ff4d6ab98f90a8a4097bb9f21f8e64c8` |
| A migration | `supabase/migrations/20261009150000_campaigns_owner_write_lockdown.sql` | `13d1fa584ee3532c2661721fe03bdb5a57f385dccd276010e4d6eeb0b63f4938` |
| A rollback | `supabase/migrations/rollback/20261009150000_campaigns_owner_write_lockdown.rollback.sql` | `8b5f5c83b9e405a3184d7609bf13617fead9a49db6a1d7a289e38ed2a3374aba` |
| A apply | `docs/release/3b4d6-apply-campaigns-write-lockdown.sql` | `7bffffbde283a1bcef6ee2b104da1cb699dbfd80b0e133c55d32706969cbf9c4` |
| A verify | `docs/release/3b4d6-verify-campaigns-write-lockdown.sql` | `fc41da29a9982a6ad9bea8e328e34ccfc9dcdb309db343afb69f30269bb22d56` |

### Per step (B, then A)

1. **Gate 1, artifacts.** Commit and blob hashes as above. Same project identity check as §4.
2. **Gate 2, precheck (read-only).** The step's verify script must return `pre` with the §4 values (record the new md5 if rows legitimately changed). Locks, waiting, idle-in-transaction and active clients should all be 0 or low.
3. **Gate 3, apply** the step's guarded script once, as `postgres`, through `supabase db query --linked -f` (path proven in 3B.4-S: BEGIN honoured, an error aborts the batch, no session left open). It uses `lock_timeout 3s` and `statement_timeout 30s`, and runs Guard 1, then the migration verbatim, then Guard 2, then the history row, then COMMIT. **Never** use `db push`, `db reset` or any migration runner.
4. **Gate 4, postcheck (read-only).** The verify script must return `post`.
   - **B:**
     - options `{security_invoker=true}`;
     - ACL set `{postgres, service_role}`;
     - md5 unchanged, `rows_via_owner` 104;
     - `160000` recorded once.
   - **A:**
     - ACL `anon=r`, `authenticated=arwd`;
     - policies `admin_all` and `own_select`;
     - guard trigger enabled; function `secdef=false` with no client EXECUTE;
     - rows n/md5 equal to the precheck;
     - `150000` recorded once.
5. **Gate 5, API probes** (anon key only; no data change possible).
   - **B:** `GET /rest/v1/campaign_summary?select=id&limit=1` returns **401/42501** (was 200 with rows).
   - **A:**
     - `GET /rest/v1/campaigns?select=id&limit=1` returns 200 `[]`;
     - `PATCH /rest/v1/campaigns?id=eq.00000000-0000-0000-0000-000000000000` with `{"notes":null}` returns **401/42501**.
   - **No** authenticated customer write probes against Production.
6. **Gate 6, smoke** (read-only browser, non-GET blocked): homepage, configurator Step3/Step4, quick quote, Customer dashboard and Admin dashboard load. **After A:** one real admin action by the admin in their own session (for example confirm payment on a test-safe campaign) succeeds. Optionally one quick-quote submission is observed in normal traffic (`service_role` INSERT).
7. **Evidence.** Keep pre/post verify JSON, apply output, probe statuses, timestamps and the commit/hash table. On success, commit the evidence like 3B.4-S.

### STOP / rollback matrix

| Observation | Committed? | Decision |
|---|---|---|
| Precheck not `pre` / drift | — | **STOP**, re-audit; do not continue to the next step |
| Apply raises `*_ABORT`, timeout or error | No | **STOP.** Verify still `pre`. Never edit guards to force through. |
| Postcheck `UNEXPECTED` | Yes | **STOP**, preserve evidence, investigate. No automatic rollback. |
| B: anon GET still 200 with rows | Yes | **STOP, investigate** (PostgREST schema cache: `NOTIFY pgrst, 'reload schema'`). Do not roll back. |
| A: anon PATCH 2xx | Yes | **STOP, investigate. Do not roll back** (that re-opens writes). |
| A: admin action fails with `CAMPAIGN_WRITE_SERVER_ONLY` | Yes | That admin's `profiles.role` is not admin/super_admin; fix the profile. Rollback only with separate approval. |
| A: submissions / claim / accept-quote / supplier-quote / admin RPC fail | Yes | Not expected (`service_role` / SECURITY DEFINER as `postgres`). Capture it. Rollback **only with separate explicit approval**. |
| Unrelated site errors | Yes | No rollback; triage separately |

**Manual rollback** (separate approval only; each re-opens its exposure): run the step's rollback file as `postgres`, delete its `schema_migrations` row, and confirm verify returns `pre`. The two rollbacks are independent and were tested in both orders.

## 6. Expected role / permission matrix after both steps

| Actor | `campaigns` read | `campaigns` direct write | `campaign_summary` read | RPC / server flows |
|---|---|---|---|---|
| anon | 0 rows (RLS) | **denied 42501** (no grants) | **denied 42501** | — |
| customer A | own rows | **blocked** (no owner policy; guard) | **denied** | `claim_public_campaign`, `customer_accept_supplier_quote` OK |
| customer B | own rows; cannot touch A | **blocked** | **denied** | OK |
| admin (policy role) | all | allowed (`campaigns_admin_all`) | **denied** (use base tables or service role) | admin RPCs OK (`gps_is_admin`) |
| supplier | 0 campaign rows | blocked | denied | `supplier_submit_quote` OK |
| service_role | all | allowed | full | submissions OK |

Amount, status and payment fields: no longer writable by any non-admin client (tested: `total_amount`, `status = 'approved'`, `payment_status = 'pagato'`, full metadata replace, arbitrary-price INSERT, TRUNCATE).

## 7. Compatibility risks

1. **Admins lose `campaign_summary` access.** No consumer exists (evidence in §1). A future report should read base tables or use the service role.
2. **D6 and admin writes.** The guard uses the same admin predicate as `campaigns_admin_all`. Live: 4 admin profiles. The 37 recent authenticated UPDATEs are admin flows; 0 non-admin owner edits.
3. **Release hash checks on Windows** must hash git blobs, not CRLF working files.
4. **Engine difference (PG 18.3 vs 17.6).** Statements used exist in 17 (`security_invoker` ≥ 15, `MAINTAIN` ≥ 17). Catalog fingerprints are equal.
5. **Not exercised in the fixture:** `admin_hard_delete_campaign` and `admin_create_operator_assignment`. They are SECURITY DEFINER owned by `postgres`, the same mechanism as the tested RPCs.

## 8. Remaining exposures after both steps (not addressed here)

- `quotes_own_insert` / `quotes_own_update` and `campaign_analysis_own_insert` (roles `public`): campaign owners can write their own quote and analysis rows.
- `campaign_zones_own_insert` / `own_update`: owners can edit zone quantities and geometry.
- `available_slots_with_pairing` (owner-rights view): anon reads `availability_slots`.
- `campaigns_admin_all` trusts `profiles.role` without the admin email allowlist used by the admin RPCs.
- Broad default privileges in `public` (new tables and functions are granted to anon/authenticated).
- Server-side pricing authorization (3B.4-P) is still pending: `submit-campaign-request` accepts client `total_amount`.
