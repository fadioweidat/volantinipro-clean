# submit-campaign-request — deployed v11 → idempotency hardening only (patch plan)

Status: **plan only. Nothing here has been deployed.** No schema change, no migration, no env change.

## Why a separate plan

| Source | Content |
|---|---|
| Deployed `submit-campaign-request` **v11** (updated 2026-08-15) | Byte-identical to repo commit `2b01ce9`. Normalized `index.ts` sha256 `6a2ecf9149679f5d6d098d33902c6d552ab93a9dd8d934b8364adb2b868ac1ca`. |
| Repo `main` / `047a764` | **Newer than v11**: commits `1660433` and `e8bb013` add `radius_m`, `polygon_geojson` and `address_label` materialization into `campaign_zones`. These were never deployed. |
| Hardening `fdcd019` | Built on the repo source, so it also contains the undeployed territorial delta. |

Deploying the repo `index.ts`, whether from `fdcd019`, this branch or `main`, would ship the territorial delta along with the hardening. **Never deploy the repo `index.ts` for this change.**

## Patch

[`docs/patches/submit-campaign-request-v11-hardening.patch`](patches/submit-campaign-request-v11-hardening.patch), sha256 `59cfdb87dd848d47f357f152ed7022893dd91bbfb97c3a268d95b24575172eff`.

- It contains only the `index.ts` hunks of `git diff 6e5a4c2 fdcd019`, rebased onto deployed v11. The original hunks applied to v11 with a −5 line offset and no fuzz. This patch was regenerated against v11, so it applies exactly (`git apply --check` is clean).
- Five hunks:
  - import `computeSemanticFingerprint` and `fingerprintFromStoredCampaign`, plus the window and candidate constants;
  - compute the v2 semantic fingerprint;
  - scan same-email `quote_requests` rows in the 10-minute window (limit 20) and reuse a campaign **only** when the fingerprint rebuilt from the stored row is equal;
  - keep writing the v1 key;
  - store the fingerprint in metadata.
- It adds **0** lines mentioning `radius_m`, `polygon_geojson` or `address_label`. The zone insert stays v11's `{ ...z, campaign_id: campaign.id }`.

## Files to deploy (from a dedicated directory, never the repo)

| File | Source | sha256 (LF) |
|---|---|---|
| `index.ts` | deployed v11 + the patch above | `7b67729a347ba86e1ea22e4efb87e321f6064a9bc5b5e685b4e1ee1a9d05d370` |
| `submissionFingerprint.ts` | verbatim `git show fdcd019:supabase/functions/submit-campaign-request/submissionFingerprint.ts` | `01d1efc38b7619c81f713be9a0153c27138df20f59112b2418a1facee5fa1e8b` |

Hashes are for LF line endings. A Windows checkout with `core.autocrlf=true` writes CRLF copies, so hash the git blob or normalize before comparing.

## Steps (for the future approved deploy ticket only)

1. Download the live source again, read-only:
   ```bash
   supabase functions download submit-campaign-request --project-ref <ref> --use-api
   ```
   Confirm the version is still v11 and the normalized `index.ts` sha256 is still `6a2ecf91…`. If it differs, **STOP** and redo this plan.
2. In a scratch directory outside the repo:
   - `git apply --check`, then `git apply` the patch onto that `index.ts`;
   - add `submissionFingerprint.ts` from `fdcd019`;
   - verify both hashes in the table above.
3. Run the harness against the copy. The copy needs a sibling `package.json` containing `{"type":"module"}` for the Node loader.
   ```bash
   SUBMIT_FN_PATH=<copy>/index.ts node --import tsx --test tests/submit_campaign_idempotency.test.mjs
   ```
   ```bash
   SUBMIT_FN_PATH=<copy>/index.ts node --import tsx --test tests/per_pv_economic_idempotency.test.mjs
   ```
4. Deploy only that directory, and only after explicit approval. Deploying the territorial delta needs its own separate decision.

## Evidence (2026-10-08, Node harness, in-memory Supabase, no network/DB writes)

- `submit_campaign_idempotency.test.mjs` against v11+patch: **16/16 pass**.
- `per_pv_economic_idempotency.test.mjs` against v11+patch: **7/7 pass**. This covers:
  - exact and volatile retries for 1/2/5 PV;
  - changed PV ids, radius, quantity, dates, preferred dates or urgency never reuse a campaign;
  - deletes 2→1 and 5→4;
  - a forged `serverAuthorized` / discount snapshot has no economic effect.

## Known limitations (unchanged by this patch)

- **Not atomic.** The duplicate check is a read followed by an insert, and there is no unique index on the fingerprint. Two truly simultaneous identical submissions can both insert. Atomic idempotency needs a unique key and a migration, which is out of scope here.
- `metadata.smart_pairing` / `pricing.smart_pairing` is client evidence only. It is part of the identity fingerprint, but it never authorizes a discount, availability or a reservation. `serverAuthorized` is always `false`.
- `total_amount` is still client-computed and is not recomputed server-side. This is pre-existing behaviour.
