# VolantiniPro — Phase 3B.4-P1: server adapter, territory resolver and shadow pricing

**Status: implemented and tested in isolation. Nothing deployed, no migration, no database write, no change to real prices, no 409.**

| | |
|---|---|
| Branch / base | `feat/pricing-p1-shadow` from P0 `5b6b324` |
| Production app | `047a764d54624088c6271b112ca53be09b6c5732` (unchanged) |
| Deployed function | `submit-campaign-request` **v11**, downloaded read-only on 2026-10-09. A single file `index.ts`, sha256 `6a2ecf9149679f5d6d098d33902c6d552ab93a9dd8d934b8364adb2b868ac1ca`, ezbr `cbb35610d10a7f79…`, updated 2026-08-15T13:02:17Z. Byte-identical to git `2b01ce9:supabase/functions/submit-campaign-request/index.ts`. |
| Integration base | **The verified deployed v11 only.** The repo `supabase/functions/submit-campaign-request/index.ts` (undeployed territorial materialization plus 3B.3-H) is **not** used and not modified. |

## 1. What was built

| Path | Role |
|---|---|
| `src/lib/pricing/server/payloadAdapter.js` | Maps today's Production payloads (Step4 and Quick Quote → v11) into the P0 engine contract |
| `src/lib/pricing/server/territoryResolver.js` | Server-side territory resolution over an injected lookup |
| `src/lib/pricing/server/shadowPricing.js` | Runs the engine (exact and `legacy-float`) and builds the shadow record. **Never throws.** |
| `deploy/edge/submit-campaign-request-v11-shadow/` | The deployable artefact (§4) |
| `scripts/vendor-pricing-shadow.mjs` | Copies the pure modules into the artefact; `--check` verifies them |
| `tests/pricing_p1_shadow.test.mjs` | 17 tests |

## 2. Payload adapter (client data → engine input)

Price-like fields (`total_amount`, `grand_total`, `pricing.*`, discounts, `smart_pairing_discount`, extra prices, densities) are **client claims**. They are only copied into `clientClaims` for comparison. Customer choices are read from the payload, and each inference is recorded in `adapterNotes`.

| Input | Rule (matches Production pricing) |
|---|---|
| Service | `service_type` mapped to `d2d` / `h2h` / `b2b`, using the same spellings v11 accepts |
| PV | One PV per `campaign_zone_id` (multi-PV payload), otherwise one implicit PV `pv-1` |
| Territories | Rows are grouped per municipality name. **NIL rows are priced under `parent_municipality`**, as Production prices Milano NIL as one Milano zone. |
| Quantity | A single-territory PV is priced on the **PV quantity**: `metadata.multi_zone.zones[].quantity`, or `flyer_quantity` for a single PV, as Production does. A multi-municipality PV is priced on the sum of the rows per municipality. |
| Urgency | Taken from an explicit field if present. For Quick Quote, from `metadata.timing` ("Urgente"). For Step4, **inferred** from the ratio of client-declared surcharge to base (0, 20 or 35 % only); otherwise from the `urgent_distribution` marker; otherwise `URGENCY_UNKNOWN`, which makes the quote unresolved. Step4 does not send the urgency level today. |
| Plan | Explicit field if present. Quick Quote → `single`. Step4 `metadata.piano` label (`Singola`, `3 mesi`, `6 mesi`, `12 mesi`); otherwise `PLAN_UNKNOWN`. |
| Extras | Step4 sends `metadata.extra_services` ids. Quick Quote sends registry **labels**, mapped by `EXTRA_HEADS` (a test pins this map to the registry). Unknown labels are noted. |
| Printing and graphics | Taken from `metadata.printing` (`printing_selected`, specs, `artwork_required/selected`) |
| Coordinates | Row `lat/lng`. The `0,0` placeholders from Quick Quote / v11 are ignored. |

## 3. Territory resolver (server data only)

1. **Name lookup.** The client municipality name is used only as a search key. It is matched (accent, case and space insensitive) against `geo_municipalities` (1,502 Lombardy rows, read with the service role and paged past PostgREST's 1,000-row limit, cached per function instance). Official name, `municipality_code` and `density_per_km2` all come from the table.
2. **Point check.** Production `geo_municipalities.geom_geojson` is **NULL for all 1,502 rows** (verified read-only), so no client-side polygon test is possible. Geometry is checked server-side through the **existing** read-only RPC `get_comuni_breakdown_in_radius(p_lat, p_lng, 0.001 km)` (STABLE, not SECURITY DEFINER, executable by `service_role`). Verified read-only on Production:
   - the Milano centre returns `015146`;
   - a Sesto point returns `015209`;
   - Rome and 0,0 return nothing.

   At most 5 distinct points are checked per territory.
3. **Outcomes:**

| Case | Result |
|---|---|
| Name found and every point inside | `resolved`, `verification: name_and_point` |
| Name found, no coordinates (e.g. Quick Quote) | `resolved`, `name_only` |
| Name found, RPC unavailable | `resolved`, `name_only_geometry_unavailable` |
| Point outside the municipality | `unresolved` (`point_outside_municipality`) |
| Name not found, ambiguous or missing | `unresolved`, `reason: verification_required` |

**Binding decision 1:** any `unresolved` territory gives **no definitive quote and no payable amount**. The shadow record has `classification: unresolved` and `serverPayableCents: null`.

## 4. Shadow Edge Function artefact (`deploy/edge/submit-campaign-request-v11-shadow/`)

| File | Content |
|---|---|
| `index.ts` | Deployed v11 + `v11-to-shadow.patch`: **7 added and 2 changed lines** |
| `pricingShadow.ts` | Geo lookup (paged, cached), `containing()` via the RPC, 1.5 s timeout, kill switch, PII-free warning log, `stripPriceShadow` |
| `_pricing/` | Vendored copies of the engine, `printPricing.js` and the server modules, plus `MANIFEST.json` (sha256). Tests verify it against `src/lib/pricing`. |
| `DEPLOYED_V11.sha256` | Identity of the verified base |
| `package.json` | Only for the Node test harness |

**The patch:**
1. Imports `runPriceShadow` and `stripPriceShadow`.
2. After v11 builds `metadata` (and after all v11 validation and the v11 idempotency check), sets `metadata.price_authorization = await runPriceShadow(supabase, body)`. Any client-supplied `price_authorization` is always overwritten.
3. Strips `price_authorization` from both client responses (new insert and idempotent retry).

The artefact is self-contained. Its only remote imports are the two v11 URLs, and no import leaves the directory. The patch contains no territorial materialization (`radius_m`, `polygon_geojson`, `address_label`) and no 409.

**Guarantees** (each covered by tests):

| Guarantee | Details |
|---|---|
| Unchanged behaviour | Same HTTP status, same response JSON (timestamps aside), same stored `campaigns` row and same `campaign_zones` as v11. `metadata.price_authorization` is the only addition. |
| `total_amount` | Always the client value, as in v11. A mismatch never blocks. |
| Failure handling | Geo failure, RPC failure, exceptions and the 1.5 s timeout give a shadow record with `status: error`, and the submission still succeeds |
| Kill switch | `PRICING_SHADOW_MODE=off` gives a `disabled` record and makes no geo reads |
| Validation and idempotent retry | Identical to v11 |
| Existing suite | `tests/submit_campaign_idempotency.test.mjs` gives **identical per-test outcomes** for deployed v11 and the shadow artefact (7 ok / 9 not ok each; the 9 are the 3B.3-H hardening expectations v11 does not meet) |

## 5. Shadow record (`metadata.price_authorization`)

Fields:
- `version`, `mode: 'shadow'`, `enforcement: 'none'`, `computedAt`;
- `pricingVersion`, `adapterVersion`, `resolverVersion`;
- `source`, `adapterNotes`, `status`, `classification`;
- `serverPayableCents`, `serverGrossCents`, `serverLegacyFloatPayableCents`;
- `clientTotalCents`, `clientGrossCents`, `deltaCents`, `grossDeltaCents`;
- `components`: base, urgency, plan, payable extras, graphics, printing, per-PV base and tiers;
- `territory` evidence (codes, verification level, kinds, NIL count);
- `issueCodes`, `ignoredClientClaims`.

**No names, e-mails, phones or free text.** A test checks this against the request's PII.

**Classification:**

| Value | Meaning |
|---|---|
| `match` | Server cents equal client cents |
| `rounding_half_cent` | The `legacy-float` replay equals the client and the exact result differs by ≤ 2 cents (approved, decision 3) |
| `mismatch` | Any other difference |
| `unresolved` / `invalid` | No payable amount |
| `error` / `disabled` | Shadow failed or switched off |

Warnings are logged only for non-`match` records, with codes and cents only.

## 6. Expected differences vs Production in shadow data

| Category | Case | Shadow outcome |
|---|---|---|
| Approved business change | Multi-PV operational extras (GPS, photo proof, video proof) per PV | `mismatch` until the client adopts the engine |
| Approved business change | Legacy `design` (49 €) → graphics 79 € quoted, not payable | `mismatch` on legacy drafts |
| Approved rounding (decision 3) | Production float half-cent artefacts | `rounding_half_cent` |
| Existing Production inconsistency | Quick Quote multi-municipality D2D uses the flat 18.5/1000 instead of the grid | `mismatch` |
| Existing Production inconsistency | Quick Quote sums Control PRO + GPS / photos without de-duplication | `mismatch` |
| Existing Production inconsistency | `gps_plus_report` | `unresolved` (decision pending) |
| Open classification (decision 4) | Control PRO / photo report / Punti Vetrina on more than 1 PV | `unresolved` |
| Verification required (decision 1) | Unknown municipality, or point outside the municipality | `unresolved`, no payable amount |
| Adapter limitation | Step4 urgency inferred from client pricing ratios; `URGENCY_UNKNOWN` when ambiguous | `unresolved` |
| Adapter limitation | Per-PV extra selection is not in the payload (all PVs assumed) | Affects only operational extras on multi-PV |

## 7. Residual issues

1. **Payload gaps.** Step4 sends neither the urgency level nor `municipality_code`. A future client change should send `urgency`, `plan` code, `municipality_code` / `nil_code` and per-PV extra selection. That is out of scope here, because no client changes were made.
2. **Name-only resolution** where coordinates are absent (Quick Quote), and NIL-level geometry is not checked: NIL rows are priced under their parent comune, as Production does.
3. **Customers can read their own `price_authorization`** (`campaigns_own_select`). It holds only codes and cents. D6 prevents customers from modifying it.
4. **Latency.** Each submission adds at most 2 paged reads (then cached per instance) plus ≤ 5 RPC calls per territory, capped by the 1.5 s timeout.
5. **3B.3-H idempotency hardening is not included.** Shadow is built on the deployed v11 as it is. Combining them requires a separate, ordered patch.
6. **Not live-tested.** Deno and Supabase runtime behaviour (env, RPC latency, PostgREST paging) is covered by the Node harness only. A staging or controlled shadow release must confirm it.

## 8. Readiness for a future shadow release

**Ready for a controlled shadow release: YES (technically), pending separate authorization.** No migration is needed, and the kill switch defaults to `on`; set `PRICING_SHADOW_MODE=off` before deploying if a dark launch is preferred.

**Release plan** (for the future authorized ticket):
1. Read-only precheck: the function list still shows v11 with ezbr `cbb35610…`; the downloaded `index.ts` sha256 equals `DEPLOYED_V11.sha256`; the RPC and `geo_municipalities` are unchanged.
2. `node scripts/vendor-pricing-shadow.mjs --check`, then run the tests.
3. Deploy **only** from `deploy/edge/submit-campaign-request-v11-shadow/`. Never from `supabase/functions/submit-campaign-request`.
4. Postcheck:
   - one real submission observed in normal traffic (no test submissions) carries `price_authorization`;
   - `total_amount` is unchanged;
   - error and timeout rates are monitored.
5. Rollback: redeploy the verified v11 (`2b01ce9` file, sha `6a2ecf91…`), or set `PRICING_SHADOW_MODE=off`.

**Not covered and still requiring separate approval:** 409 enforcement, client changes, the scope decision for the ambiguous extras, migrations, and atomic idempotency.
