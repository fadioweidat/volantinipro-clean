# Multi-PV Phase 3B.4-P: server-side pricing authorization — Step 0 audit

| | |
|---|---|
| Status | **Read-only audit. No pricing code changed, nothing deployed, no DB writes.** |
| Branch / base | `feat/multipv-phase3b4p-server-pricing` @ `4d46bc913784959133afc3cab9c20a0db18595bb` (Phase 3B.3) |
| Production app | `047a764d54624088c6271b112ca53be09b6c5732` |
| Deployed functions | `submit-campaign-request` **v11** (`index.ts` sha256 `6a2ecf91…`), `smart-pairing-availability` v10 |
| Security release | 3B.4-S `smart_pairing_slots` lockdown applied 2026-10-09 08:44Z; artifacts preserved in `security/smart-pairing-slots-rls` @ `99422c7` |
| Evidence method | Code trace on `4d46bc9` plus deployed v11 source. DB facts come from aggregate/catalog SELECTs inside `BEGIN TRANSACTION READ ONLY … ROLLBACK`; no row contents or personal data were read. |

---

## 1. End-to-end pricing chain (as built today)

```
Step1  data.qty, data.type, data.urgency (normal|urgent|express), data.subscription
       (single|monthly3|monthly6|monthly12) -> data.planDiscount (0/3/5/8),
       data.printing{format,grammage,sides,color,folding,artwork…}, extraServices[]
Step2  campaignZones[] (PV = zone): selectedComuni[{name, densita?}], allocation rows
       {name, assignedFlyers, densita?}, finalFlyers, addressLabel, center/radius/NIL
Step3  per-PV Smart Pairing (3B.2/3B.3): provisional, discount always 0.
       Legacy path (h2h/b2b, drafts without campaignZones): data.smartPairingSlots from v10.
Step4  QUOTE_PRICES[svc] (flat €/1000, h2h/b2b only)
       distributionZones = resolveConfiguratorDistributionZones / buildMultiZoneDistributionZones
         -> classifyTerritory({name, densityPerKm2}) -> tier -> grid price per zone
       per-PV (3B.3): buildPerPvEconomics -> pricePerPvQuote (= calculateQuotePricing, 0 % pairing)
       calculateQuotePricing: base -> -pairing% -> +urgency% -> -plan% -> +extras  (roundMoney per step)
       printing (printPricing, indicative), graphics (GRAPHIC_SERVICE_PRICE 79)
       total      = distribution + distribution extras       -> payload.total_amount
       grandTotal = total + printing line + graphics line    -> payload.metadata.grand_total
Payload  submitPublicCampaign -> functions.invoke('submit-campaign-request', body)
v11      totalAmount = body.total_budget ?? body.total_amount ?? 0, bound 0..1,000,000
         metadata = {...body.metadata, payment_status:'in_attesa_pagamento', …} (client JSON verbatim)
         smart_pairing_discount, pricing, grand_total, smart_pairing snapshot: all client-supplied
DB       campaigns.total_amount (numeric), campaigns.metadata (jsonb); campaign_zones rows
Consumers paymentMode.js amountDue = settlement ?? total_amount; customer/admin dashboards;
         quote e-mail (_shared/quoteEmail.ts grandTotal ?? total_amount); feasibility credit
         flow (admin verifies gross == round(total_amount*100))
```

A second public entry point, **Preventivo Rapido** (`QuickQuotePage.jsx`), submits through the same v11 function with its own `calculateQuotePricing` result. Its `campaignZones` carry placeholder coordinates `lat: 0, lng: 0`.

## 2. Per-component trust analysis

Legend: **CC** = client-controlled. **SV** = server-verifiable today, meaning trusted inputs exist server-side.

| # | Component | Source of truth today | CC | SV | Current vulnerability | Proposed authoritative server calculation |
|---|---|---|---|---|---|---|
| 1 | D2D distribution grid (4 tiers × 7 quantity points, minimums, interpolation) | `src/lib/pricing/distributionPricing.js` constants (client bundle) | Yes: the server never computes it | Code exists, but not server-side | `total_amount` is accepted as sent (only bounded 0..1M) | The same pure module moves into a shared server/client package, with a `PRICING_VERSION` |
| 2 | Territory tier per zone | `classifyTerritory(name, density)`: an explicit name anchor first (`milano` = **cheapest** tier), then client `densita` / `density_per_km2`, then fallback `HINTERLAND_DENSE` | **Yes**: the name and density come from draft or allocation rows | **Yes**: `geo_municipalities` has 1,502 Lombardy comuni, each with unique `municipality_code`, `density_per_km2` and PostGIS `geom` (SRID 4326). `geo_nil_milano` has 88 NIL polygons. | Renaming a comune "Milano" or editing density changes the tier, and so the price | The server resolves each PV: comune by `municipality_code` plus a point-in-polygon check of the PV centre, NIL by `nil_code` inside Milano. Density comes from `geo_municipalities`; client density is ignored. If unresolved, fail closed. |
| 3 | Quantity per PV/zone | `campaignZones[].finalFlyers`, allocation `assignedFlyers` | Yes (the customer's order) | n/a: it's the order itself | The sum can diverge from `flyer_quantity`. The single-PV `increase`/`useRecommended` rule is client-only. | Accept as the order claim. Integers 1..N per PV; the PV sum must equal the stated total. Re-apply the single-PV recommended-quantity rule server-side from stored required flyers, or reject on mismatch. |
| 4 | h2h / b2b flat rate | `QUOTE_PRICES` (`appConstants.js`) | Yes | Code-only | Same as row 1 | Shared module constant |
| 5 | Urgency surcharge (0/20/35 % on base) | `URGENCY_SURCHARGE_PCT` | `data.urgency` is CC (a legitimate choice) | Yes (enum) | The amount is client-computed | Server computes from the enum: unknown value is rejected, `normal` maps to standard |
| 6 | Plan discount | Step1 `discountMult` → **`data.planDiscount`**, read first by Step4 (`subDiscPct = data.planDiscount \|\| …`). The engine clamps it only to **0–100 %**. | **Yes: a forged `planDiscount: 100` gives a €0 distribution total** | Yes (enum) | Direct client percentage | The server derives the % from `subscription` alone (`single 0`, `monthly3 3`, `monthly6 5`, `monthly12 8`). Note: the keys differ from `PLAN_CODES` (`quarterly/semiannual/annual`). |
| 7 | Smart Pairing discount (per-PV) | 3B.3: always 0, `serverAuthorized:false` | Snapshot is CC | No verified eligibility exists | None today for per-PV, but the snapshot travels in metadata | The server ignores every client discount. 0 % until a 3B.4-T signed eligibility exists. |
| 8 | Smart Pairing discount (legacy campaign-wide) | `data.smartPairingSlots` from a v10 response stored in the draft. Up to 40 % ("same") / 20 % ("nearby"), averaged over the selected days. | **Yes**: the draft is in client storage | No: v10 matching is name equality only, and campaigns have no coordinates | Forged slots give up to 40 % off h2h/b2b and legacy drafts. `smart_pairing_discount` is stored verbatim. | **Decision D3**: force 0 server-side (changes legacy prices) or keep it, flagged as unverified |
| 9 | Distribution extras (GPS 60, photo 30, report 50, gps+report 90, video 60, Control PRO 99, graphic_design 79, supervision 120/day, account manager 80, QR 50, advanced report 40, puntiVetrina 35, design 49, QC 25, operator 39) | `extraServicesRegistry.js`, priced **by ID** from the registry | IDs are CC (legitimate). Prices come from the registry, but the server stores the client's `price`. | Yes, if the registry is shared | A client can send any `extras[].price` / `servizi_extra[].price` in metadata, and `total_amount` already contains them | The server prices extras from IDs only, applying the Control PRO de-duplication |
| 10 | Printing | `printPricing.js` benchmark matrices (Pixartprinting 2026-08-28, ex VAT) × 1.20 markup. Marked **indicative**, excluded from `total_amount`. | Specs CC; price client-computed | Yes (pure module) | `metadata.grand_total` and `printing_price` are client numbers | The server recomputes from specs and stores it as indicative, still outside `total_amount`, per the current policy |
| 11 | Graphics | `GRAPHIC_SERVICE_PRICE = 79` (`graphicPricing.js`) | Flags CC | Yes | Client number stored | Server constant from `artwork.required && artwork.selected` |
| 12 | VAT | None. Every price is "IVA esclusa"; no VAT is computed anywhere. | — | — | — | Keep ex-VAT. Document `vat_included:false` in the authorization record. |
| 13 | Rounding | `roundMoney` (`Math.round(x*100)/100`) after every step, in float euros | — | — | Float euros; per-zone rounding then sum; 3B.3 per-PV cents reconcile to the engine | Integer cents end to end. Reproduce the **same step order and per-zone rounding**, so existing quotes keep the same cents (proved by a parity corpus). |
| 14 | Per-PV subtotal / campaign total | 3B.3 `buildPerPvEconomics` (cents) feeding `pricePerPvQuote` | CC (computed in the browser) | Yes, once rows 1–2 are server-side | Client totals stored | The server computes per-PV base cents, then the campaign pipeline, and returns its breakdown |
| 15 | `total_amount` | `Number(total.toFixed(2))` | **Yes** | — | **It drives the amount due** (`paymentMode.js`) and the quote e-mail | Server value only. On mismatch: reject (D1). |
| 16 | Multiple dates | Per-PV: `multiple_date_policy_required` (blocked). Legacy: the discount is averaged across days. | — | — | — | Unchanged: blocked until a policy exists |

### 2.1 Internal inconsistencies found (need a decision before tariffs become authoritative)

- **I1. Supervision price.** `dedicated_supervision` costs a flat **€120** in the registry (`priceUnit:"day"`, but never multiplied by days). Step4/Step1 also compute `dedicatedSupervisionPrice` = 45/70 by duration, and this value is not used for the total.
- **I2. Control PRO contents.** The registry's `CONTROL_PRO_INCLUDED_IDS` has 3 IDs (includes `photo_report_advanced`), while `controlProBundle.js` has 2.
- **I3. Graphics prices.** There are two: `design` €49 (hidden legacy) and `graphic_design` / `GRAPHIC_SERVICE_PRICE` €79.
- **I4. Plan multiplier.** Step1 computes `totalCampaigns = campaignsPerMonth × months`, but `total_amount` is for **one** campaign with the plan discount applied. Is `total_amount` the price per campaign or for the whole plan?
- **I5. Plan keys.** `monthly3/6/12` vs `PLAN_CODES` `quarterly/semiannual/annual` (`calculateDoorToDoorPricing` is unused by Step4).
- **I6. Quick quote zones.** Quick-quote `campaignZones` carry `lat:0,lng:0` placeholders, so they can't be territory-verified.

## 3. Authorization bypasses outside the pricing function (blockers)

Live catalog facts (read-only):

| Path | Live policy / grant | Effect |
|---|---|---|
| `campaigns_own_insert` (authenticated) | `WITH CHECK (auth.uid() = user_id)` | Any signed-in customer can **INSERT a campaign directly through REST** with any `total_amount`, `status` and `metadata`, bypassing `submit-campaign-request` entirely. Legacy client code for this exists (`saveCampaign`, no current caller). |
| `campaigns_own_update` (authenticated) | `USING/CHECK (auth.uid() = user_id)`. The only guard trigger (`campaigns_marketplace_assignment_guard`) blocks `supplier_id` changes and the `quote_selected/assigned` statuses. | An owner can **UPDATE their own campaign's `total_amount`, `status` (e.g. `approved`) and `metadata.payment_status` (e.g. `pagato`)** after submission. |
| `anon` | Has the INSERT grant, but no anon policy | Blocked by RLS (no anon policy) |

Server pricing in the edge function is **ineffective while these two paths exist**: a customer can change the authorized amount afterwards. The feasibility-credit flow is protected, because it fingerprints `total_amount` and requires admin verification. The plain bank-transfer flow (`paymentMode.js`) is not.

Fixing this needs an RLS/trigger **migration**: column-level UPDATE restrictions, or a BEFORE UPDATE trigger that freezes pricing, status and payment fields for non-admin, non-service roles, and removal or restriction of the direct insert. That needs separate approval (**D6**), and I recommend it as its own security release, like 3B.4-S.

## 4. Proposed architecture

### 4.1 Pure pricing engine (shared, versioned)

`supabase/functions/_shared/pricing/` holds plain ES modules with no Deno or browser APIs. The client imports the same files, so parity is structural, not duplicated.

| Item | Contents |
|---|---|
| `PRICING_VERSION` | e.g. `"2026-10-v1"` |
| Tariffs moved verbatim | Grid, minimums, urgency %, plan %, `QUOTE_PRICES`, extras registry prices, printing matrices plus markup, graphics price |
| Computation | Integer cents |
| `priceCampaign(input)` | Takes `{service, urgency, subscription, pvs:[{pvId, quantity, territory:{tier, source, ref}}], extraIds, printingSpec, artwork, pairing:{}}` and returns `{version, perPv:[{pvId, baseCents}], baseCents, pairingCents:0, urgencyCents, planCents, extrasCents, totalCents, printingCents, graphicsCents, grandTotalCents, ruleOrder}` |
| Rule order (current, preserved) | Per-zone grid with minimum, rounded to cents, then summed. Then pairing (0), urgency on base, plan on (base − pairing + urgency), then extras added. Printing and graphics stay outside `total`. |
| Parity proof | A frozen corpus of real Step4 inputs (1/2/5 PV, all tiers, urgency, plans, extras, printing) must give **identical cents** to today's `calculateQuotePricing` before anything is enforced |

### 4.2 Tariff storage

- **Recommended, Stage 1 (no migration):** tariffs live as code constants in the shared module, versioned by `PRICING_VERSION` and git history.
  - Deploying the function equals publishing the tariff.
  - The stored authorization records the version.
- **Later, D5:** DB tables (`pricing_tariff_versions`, `pricing_grid`, `pricing_extras`), read with the service role, with an effective date.
  - Needs a migration plus admin tooling.
  - Only worth it if non-developers must edit prices.

### 4.3 Trusted territory resolution (server, service role, read-only)

| PV type | Resolution | Result |
|---|---|---|
| Comune mode | The client sends `municipality_code` for each selected comune. The server loads the matching rows from `geo_municipalities` (name, `density_per_km2`, `geom_geojson`). | The tier comes from the explicit anchor list plus DB density, never the client's. A name/code mismatch or an unknown code gives `TERRITORY_UNRESOLVED`, and the request is rejected. |
| Radius / address PV | The server checks that the PV centre lies inside the claimed comune polygon. The point-in-polygon check runs in TS on `geom_geojson`, so **no SQL function or migration** is needed. | Allocation rows must name only comuni whose polygons intersect the radius; otherwise reject. |
| NIL PV | `nil_code` must exist in `geo_nil_milano`. The parent comune is Milano, which uses the explicit anchor. | `MILANO_CORE` |
| Outside Lombardy, or no `geo_municipalities` row | Fail closed | `TERRITORY_UNSUPPORTED`; manual quote (D4) |
| Quick quote | Placeholder coordinates | Code-based lookup only. If unresolved, gives a non-authorized "stima" (D4). |

> **Correction to the earlier 3B.4 audit** (uncommitted `multipv-phase3b4-backend-audit.md`): it said comune geometry was missing (`dbgt_limiti_comunali` has 0 geometries). **`geo_municipalities` does have all 1,502 Lombardy comune polygons.** Comune-level verification is therefore feasible without new data.

### 4.4 Submit-time authorization (edge function)

1. Validate the payload strictly:
   - enums, integer quantities, unique PV IDs;
   - PV sum equals the total;
   - known extra IDs;
   - known printing spec or `null`.

   Unknown or malformed input gives `400 PRICING_INPUT_INVALID`.
2. Resolve territories (4.3), then run `priceCampaign`. The client's `total_amount`, `metadata.pricing`, `grand_total`, `smart_pairing_discount`, `planDiscount`, extras prices and every `verified` / `serverAuthorized` flag are **ignored as inputs**.
3. Compare `round(client total_amount × 100)` with the server's `totalCents`.
   - **D1 recommended:** reject with `409 PRICE_MISMATCH`, returning the server breakdown so Step4 can show the refreshed price. Nothing is silently replaced.
   - Alternative: accept and store `price_authorization.status = 'mismatch'` for admin review.
4. On success, persist:
   - `total_amount` = server cents / 100;
   - `metadata.price_authorization = {version, status:'authorized', server_total_cents, client_total_cents, per_pv:[…], territory_evidence:[{pvId, municipality_code|nil_code, density, tier, source:'geo_municipalities'}], pairing:{discount_cents:0, reason:'unverified'}, computed_at}`.

   The client `metadata` stays as a non-authoritative snapshot.
5. **Idempotency:** the 3B.3-H v2 fingerprint gains the server `totalCents` and `PRICING_VERSION`.
   - An exact retry gives the same cents and the same campaign.
   - A tariff or version change gives a new fingerprint and a new campaign.
   - Concurrency stays best-effort until the unique index (D7) exists.
6. **Fail closed:**
   - any missing tariff, territory or engine error gives `422 PRICING_UNAVAILABLE`;
   - the campaign is never stored with a client-only amount;
   - D4 decides whether manual-quote requests are still accepted as `estimate_only`.

### 4.5 Frontend contract (minimal adapters)

- Step4 calls the same shared engine, so its displayed price equals the server price by construction. It sends `municipality_code`/`nil_code` per PV and the extra IDs. On `409` it shows the server breakdown and asks for reconfirmation.
- Per-PV pairing stays at 0, and multiple dates stay blocked. No snapshot from localStorage, drafts or history can authorize a discount.
- Legacy single-PV: the same engine and the same cents (parity corpus). Only forged inputs change outcome.

## 5. Compatibility with deployed v11 (deploy safety)

- The repo `submit-campaign-request/index.ts` contains **undeployed** territorial materialization (`radius_m`, `polygon_geojson`, `address_label`; commits `1660433`, `e8bb013`). **Never deploy the repo `index.ts`.**
- The patch strategy, as in `docs/multipv-phase3b3-v11-safe-patch.md`:
  - start from the exact downloaded v11 (`6a2ecf91…`);
  - apply the 3B.3-H hardening hunks (`v11-to-hardening.patch`, sha256 `59cfdb87…`);
  - apply a **new, separate pricing hunk** that imports `../_shared/pricing/*` and adds steps 1–5 of 4.4.
- Deploy from a dedicated directory containing only `index.ts`, `submissionFingerprint.ts` and `_shared/pricing/*`.
- Before deploy, the Node harness (`tests/helpers/submitCampaignHarness.mjs`, with `SUBMIT_FN_PATH`) runs the full suites against that exact copy.
- Shadow mode first (6, stage P2) means v11 behaviour stays unchanged until enforcement.

## 6. Database / schema changes

| Change | Needed for | Migration? | Decision |
|---|---|---|---|
| None | Stages P0–P3 (engine, shadow, enforcement in the function, territory via existing tables) | **No** | — |
| Freeze pricing, status and payment columns for owners; restrict direct INSERT | Making server authorization meaningful (section 3) | **Yes** (RLS/trigger) | **D6** |
| Unique index or idempotency-key table | Atomic duplicate prevention | Yes | D7 |
| Tariff tables | DB-editable tariffs | Yes | D5 |
| Optional columns `pricing_version`, `price_authorized_cents` | Queryable audit (otherwise in metadata) | Yes | optional |

## 7. Test plan

1. **Engine unit tests (pure):**
   - each tier at grid points and interpolated points, plus minimums;
   - urgency × plan × extras combinations;
   - Control PRO de-duplication;
   - printing matrix lookups;
   - graphics;
   - integer-cent rounding.
2. **Parity corpus:** at least 500 deterministic generated inputs plus a curated real-quote set (1/2/5 PV, NIL, radius, comune, mixed). Server cents must equal today's `calculateQuotePricing` and 3B.3 `pricePerPvQuote` exactly.
3. **Territory resolver:**
   - known comune codes;
   - name/code mismatch;
   - centre outside the polygon;
   - NIL code;
   - outside Lombardy;
   - missing data (fail closed).

   Uses fixtures extracted from `geo_municipalities` (no personal data).
4. **Security, through the real handler** (Node harness against v11 + hardening + pricing):
   - forged `total_amount` (lower and higher);
   - `planDiscount:100`;
   - forged extras prices;
   - forged `smart_pairing_discount` and `smartPairingSlots`;
   - `serverAuthorized:true` / `verified:true` snapshots;
   - renamed comune ("Milano") with another code;
   - forged density;
   - altered PV ids or territories;
   - deleted PVs, 2→1 and 5→4;
   - stale `PRICING_VERSION`;
   - replay of an exact retry, retry with a changed price, concurrent duplicates (documented as best-effort).
5. **Single-PV regression:** legacy single-PV and quick quote give the same cents as before for honest inputs.
6. **Integration:** a 1/2/5 PV Step4 browser run (zero-write harness) where the displayed price equals the server-authorized price, the PDF, payload and stored row are consistent, and the 390 px layout works.
7. **Full suite** against a clean baseline, comparing exact failure names, plus build/prerender and a diff check.

## 8. Open decisions (explicit approval required)

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Price mismatch policy | **Reject with 409** and the server breakdown; never silently replace |
| D2 | Tariff authority | The code constants in the shared module **become the official price list** (`PRICING_VERSION`), as of today's values |
| D3 | Legacy campaign-wide Smart Pairing (h2h/b2b, legacy drafts) | Force **0 %** server-side until 3B.4-T verified eligibility exists. This changes prices for legacy pairing users. |
| D4 | Unresolvable territory (outside Lombardy, quick quote with no code) | Accept as `estimate_only` (no payable amount, admin quote) **or** reject |
| D5 | DB tariff tables | Defer |
| D6 | Close the campaigns owner INSERT/UPDATE bypass (migration) | **Required before enforcement.** Run it as a separate security release. |
| D7 | Atomic idempotency (unique index) | Later, separate |
| D8 | Resolve I1–I5 (supervision 120 flat vs per day vs 45/70; Control PRO contents; graphics 49 vs 79; per-campaign vs per-plan total; plan keys) | Business owner to confirm before D2 |

## 9. Implementation stages (each a separate approval)

| Stage | Scope | Production impact |
|---|---|---|
| **P0** | Extract the shared pure engine (`_shared/pricing`) with integer cents; the client uses it; parity corpus | None. Same prices; client refactor only. |
| **P1** | Server territory resolver plus engine in the edge-function patch (v11 + hardening + pricing); Node-harness security tests | None until deploy |
| **P2** | Deploy in **shadow mode**: compute and store `price_authorization` and mismatches, never reject. Observe real traffic. | Metadata-only; needs deploy approval |
| **P3** | Enforce D1 (409 on mismatch, fail closed); Step4 handles 409 | Behaviour change; needs approval and D6 done |
| **P4** | D6 security release (owner INSERT/UPDATE freeze) | Migration; separate controlled release |
| **P5** | Optional: D5 tariff tables, D7 unique index | Migrations |

Rollback per stage:
- P0: revert the commit.
- P2/P3: redeploy the previous function version (v11 + hardening).
- P4: a manual rollback script, as in 3B.4-S.

## 10. GO / NO-GO

- **GO** for **P0 + P1** (isolated engine extraction and server engine, with tests, no deploy) once **D1, D2 and D8** are answered.
- **NO-GO** for enforcement (P3) until **D6** (campaign owner bypass) is fixed, because otherwise a client can overwrite the authorized amount after submission.
- **NO-GO** for any change to legacy pairing discounts until **D3** is decided.
