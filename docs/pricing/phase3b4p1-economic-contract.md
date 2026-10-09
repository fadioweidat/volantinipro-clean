# VolantiniPro — Phase 3B.4-P1: server-side pricing contract & economic audit

**Status: audit and design only. No pricing code changed, nothing deployed, no Production writes.**

| | |
|---|---|
| Date | 2026-10-09 |
| Branch / base | `docs/pricing-phase3b4p1-economic-contract` from `8945e7f` (pricing step-0 audit, on top of 3B.3 `4d46bc9`) |
| Production app | `047a764d54624088c6271b112ca53be09b6c5732` |
| Deployed `submit-campaign-request` | **v11** (`index.ts` sha256 `6a2ecf91…`). The repo `index.ts` contains undeployed territorial materialization and the 3B.3-H fingerprint, so it **must never be deployed as-is**. |
| Production security state | `smart_pairing_slots` lockdown, `campaign_summary` lockdown (`20261009160000`) and campaigns D6 lockdown (`20261009150000`) are all applied |
| Evidence | Code at `047a764` (Production) vs `4d46bc9` (3B.3 feature, undeployed), the deployed v11 source, and Production aggregates read inside `BEGIN TRANSACTION READ ONLY … ROLLBACK` (no personal data) |

**Scope note.** The pricing modules are **byte-identical between Production `047a764` and `4d46bc9`**:
- `distributionPricing.js`
- `quotePricing.js`
- `printPricing.js`
- `extraServicesRegistry.js`
- `graphicPricing.js`
- `controlProBundle.js`
- `appConstants.js`

Only the per-PV modules (`src/lib/step3/perPv*`), Step3/Step4 wiring, the byte-PDF and the undeployed function differ. Unless marked **(3B.3, undeployed)**, every rule below is what Production runs today.

Status labels used in §3: **CONFIRMED FROM CODE**, **INCONSISTENT**, **MISSING BUSINESS DECISION**, **PROPOSED CHANGE**.

---

## 1. Current pricing architecture

```
Step1 (client)  estimate = qty/1000 × flat rate (18.5/22/35) × urgency × (1−plan%) + print estimate
                rounded to whole €       ← NOT the D2D territorial grid
Step2 (client)  campaignZones[] (PV) with selectedComuni[{name, densita?}], allocation rows,
                finalFlyers; assigned_budget = qty × 18.5/1000 (dead: computed, never shown)
Step3 (client)  pairing preview; per-PV (3B.3) discount always 0; legacy slots from v10 response
Step4 (client)  calculateQuotePricing (or pricePerPvQuote, 3B.3):
                  base   = Σ zone grid price (D2D) | qty × QUOTE_PRICES/1000 (h2h/b2b)
                  − pairing% × base  + urgency% × base  → subtotalBeforePlan
                  − plan% × subtotalBeforePlan  + Σ distribution extras  → total
                grandTotal = total + printing line (indicative) + graphics line
PDF (client)    printQuotePdf (HTML print, the one wired in Production) shows grandTotal, "IVA esclusa"
Payload         total_amount = total; metadata.grand_total, metadata.pricing.*, smart_pairing_discount
v11 (server)    stores total_amount verbatim (bounded 0..1,000,000) and metadata verbatim; v1 fingerprint
DB              campaigns.total_amount (numeric), metadata (jsonb)
Consumers       paymentMode/PagamentoBonifico amount due = total_amount; quote e-mail = client grandTotal;
                admin revenue = total_amount; feasibility credit = admin-verified round(total_amount×100)
```

**There is no server-side tariff.** Production has 0 tariff, price or price-list tables, and no edge function computes a price.

Production evidence (aggregates):
- 104 campaigns (86 `quote_requests`, 18 `manual`);
- 79 with `metadata.pricing`, and `total_amount` equals `pricing.total` to the cent in all 79 (no detected tampering so far);
- 7 with `total_amount` null or 0;
- 0 with a positive Smart Pairing discount;
- 1 with printing selected, 0 with artwork selected.

## 2. Exact tariff inventory

### 2.1 D2D distribution (territorial grid)

**Source:** `src/lib/pricing/distributionPricing.js`, using `DISTRIBUTION_GRID`, `TERRITORY_MINIMUMS`, `interpolateGridPrice`, `calculateDistributionZonePrice` and `calculateMultiZoneDistributionPrice`. All prices ex VAT.

| Tier | 1,000 | 2,500 | 5,000 | 10,000 | 20,000 | 30,000 | 50,000 | Minimum |
|---|---|---|---|---|---|---|---|---|
| MILANO_CORE | 120 | 150 | 210 | 350 | 660 | 960 | 1500 | 120 |
| HINTERLAND_DENSE | 140 | 180 | 260 | 420 | 800 | 1170 | 1850 | 140 |
| COMO_LECCO | 170 | 230 | 330 | 520 | 1000 | 1450 | 2300 | 170 |
| LOW_DENSITY_MOUNTAIN | 220 | 320 | 450 | 750 | 1450 | 2100 | 3350 | 220 |

**Formula:**
- piecewise-linear interpolation between grid points;
- linear extrapolation below 1,000 and above 50,000 using the nearest segment;
- zone price = `round2(max(interpolated, minimum))`;
- campaign base = `round2(Σ zone prices)`.

Example: 5,959 flyers in MILANO_CORE = 236.85.

| Aspect | Finding |
|---|---|
| Authoritative? | Code constants in the **client bundle only** |
| Trust boundary | Client computes, server stores `total_amount` verbatim |
| Inconsistency | `calculateDoorToDoorPricing` (uses `PLAN_CODES` quarterly/semiannual/annual) is **unused**. Step4 uses `calculateQuotePricing` with the plan keys `monthly3/6/12`. |
| Recommended contract | Same grid in a shared, versioned server module (`PRICING_VERSION`), in integer cents with the **same per-zone rounding** so existing quotes keep their cents |

### 2.2 Territory tier (density)

**Source:** `classifyTerritory({name, densityPerKm2})` and `resolveConfiguratorDistributionZones`.
1. An explicit name anchor is checked first:
   - `milano` → MILANO_CORE;
   - `seveso`, `meda`, `cormano`, `sesto`, `sesto san giovanni` → HINTERLAND_DENSE;
   - `como`, `lecco` → COMO_LECCO;
   - `sondrio` → LOW_DENSITY_MOUNTAIN.
2. Otherwise density thresholds apply: ≥6000 MILANO_CORE, ≥2500 HINTERLAND_DENSE, ≥800 COMO_LECCO, else LOW_DENSITY_MOUNTAIN.
3. Otherwise the fallback is HINTERLAND_DENSE (confidence `low`).

Density comes from the client: `densita` / `density_per_km2` / `densityPerKm2` on the selected comune or allocation row.

| Aspect | Finding |
|---|---|
| Trust boundary | **Client-controlled.** Renaming a zone "Milano" (cheapest tier) or editing density changes the price. |
| Trusted server data (verified live) | `geo_municipalities` has **1,502 Lombardy comuni**, unique `municipality_code`, `density_per_km2` for all, PostGIS `geom` SRID 4326. Live tier distribution by density: 5 comuni ≥6000, 47 in 2500–6000, 298 in 800–2500, 1,152 below 800. `geo_nil_milano` has 88 NIL polygons. `istat_census_sections` has 1,502 comune rows (population, area, geometry). |
| Recommended contract | The server resolves each PV from `municipality_code` (and `nil_code` for Milano NIL), verifies the PV centre lies inside the comune polygon, and applies anchors plus DB density. Client density and names are ignored. |

### 2.3 Hand-to-hand / business (flat)

`QUOTE_PRICES` (`appConstants.js`): **d2d 18.5 / h2h 22.0 / b2b 35.0 € per 1,000**, used for h2h and b2b base (`quantity × rate / 1000`). D2D uses the grid (§2.1).

`BASE_PRICES` (1.85 / 2.20 / 3.50) is **dead**: its last consumer was removed from Step3.

The Step1 estimate uses its own copy `baseRate` (same values) **for every service, D2D included** (§2.11).

### 2.4 Urgency

| Item | Value |
|---|---|
| Source | `URGENCY_SURCHARGE_PCT` = standard 0 / urgent 20 / express 35, mapped from `data.urgency` (`normal` / `urgent` / `express`) in `quotePricing.urgencySurchargePct` |
| Applies to | Distribution base only, **after** the pairing discount and **before** the plan discount |
| Printing | No effect: `PRINT_URGENCY_MULTIPLIER = 1.0`. Urgent printing is not calibrated. |
| Extra item | `urgent_distribution` costs €0 (marker only) |

### 2.5 Plans

| Item | Value |
|---|---|
| UI (Step1) | `single` "Singola" 0 %, `monthly3` "Trimestrale" 3 %, `monthly6` "Semestrale" 5 %, `monthly12` "Annuale" 8 % |
| Stored | Step1 writes `data.planDiscount` (the %). Step4 uses `subDiscPct = data.planDiscount \|\| map[subscription]`. |
| Engine bound | `calculateQuotePricing` clamps `planDiscountPct` only to **0–100** |
| **Vulnerability** | A forged `planDiscount: 100` gives a €0 distribution total, and `total_amount` would be accepted |
| Historical | 4 Production campaigns (2026-08, plan "3 mesi") carry "Piano -5%", the pre-change scale (-5/-10/-15 → -3/-5/-8). Stored totals therefore follow an **older tariff version**. |
| Scope | `total_amount` covers **one campaign**. Step1 also computes `totalCampaigns = campaignsPerMonth × months`, which is never priced (§3.F). |
| Recommended contract | The server derives % from the `subscription` enum only. Unknown value → reject. `planDiscount` is ignored. |

### 2.6 Smart Pairing

| Path | Rule | Trust |
|---|---|---|
| Per-PV (3B.2/3B.3, undeployed) | Discount **always 0**: `verified:false`, `serverAuthorized:false`, `match` downgraded; multiple dates → `multiple_date_policy_required` | Fail-closed |
| Legacy campaign-wide (h2h/b2b, drafts without per-PV mode) | `data.smartPairingSlots` (v10 response stored in the draft); "same" ≤40 %, "nearby" ≤20 %, **averaged over selected days**; `smart_pairing_discount` sent to v11 | **Client-controlled.** v10 matching is city/zone-name equality only, and campaigns have no coordinates. |
| Production data | 0 campaigns with a positive pairing discount | — |
| Recommended contract | Unknown eligibility means 0. A discount requires a server-issued, signed, expiring per-PV eligibility (3B.4-T). The server ignores every client discount. | — |

### 2.7 Extras (`extraServicesRegistry.js`, priced **by ID** from the registry; legacy aliases in `legacyIds`)

| ID | Price € | Unit | Optional (shown) | Notes |
|---|---|---|---|---|
| `control_pro` | 99 | campaign | yes | Bundle; dedup removes `tracking_gps`, `photo_proof`, `photo_report_advanced` |
| `tracking_gps` | 60 | campaign | yes | Included in Control PRO |
| `photo_proof` | 30 | campaign | yes | Included in Control PRO |
| `photo_report_advanced` | 50 | campaign | yes | Included in Control PRO (registry) |
| `gps_plus_report` | 90 | campaign | no (legacy) | **Not** de-duplicated by Control PRO, so it can double-charge GPS |
| `video_proof` | 60 | campaign | yes | |
| `qr_analytics` | 50 | campaign | yes | |
| `advanced_report` | 40 | campaign | yes | |
| `account_manager` | 80 | campaign | yes | |
| `dedicated_supervision` | **120** | labelled "€120 / giorno", **charged once** | yes | See §3.A |
| `puntiVetrina` | 35 | campaign | via Step1 toggle (D2D only) | |
| `graphic_design` | 79 | campaign | hidden legacy | Equal to `GRAPHIC_SERVICE_PRICE` |
| `design` | **49** | campaign | hidden legacy (`grafica`) | See §3.C |
| `quality_control` | 25 | campaign | hidden legacy | |
| `operator_support` | 39 | campaign | hidden legacy | |
| `urgent_distribution` | 0 | — | marker | |
| `printing` | `computePrintEstimate` | — | excluded from `total` | §2.8 |

| Aspect | Finding |
|---|---|
| Inclusion | `normalizeSelectedExtras`: from `data.extraServices`, `data.printServices`, urgency, or `data[id] === true`. The summed **client** `price` goes into `total`. |
| Trust | IDs are client choices (legitimate). The **amounts are client-computed** and stored as numbers. |
| Production usage (IDs seen in `metadata.extra_services`) | account_manager, advanced_report, control_pro, dedicated_supervision, photo_proof, photo_report_advanced, printing, puntiVetrina, qr_analytics, tracking_gps, urgent_distribution, video_proof |
| Dead code | `controlProBundle.js` (`CONTROL_PRO_INCLUDED_EXTRA_IDS` = 2 IDs) is **unused** in Production. The registry (3 IDs) is what applies. |
| Recommended contract | The server prices extras from a versioned catalogue by ID, applies the Control PRO dedup and rejects unknown IDs. Client prices are ignored. |

### 2.8 Printing (`printPricing.js`)

- **Prices:** Pixartprinting benchmark matrices (2026-08-28, ex VAT), each independent:
  - A5, A6 and A4, coated matt/gloss at 100/130/170/250/300/350 g;
  - uncoated 90 g per format;
  - 10 quantity points from 1,000 to 50,000.
  - Example A5 130 g: 1,000 → 47.60; 10,000 → 155.93; 50,000 → 623.44 (base).
- **Customer price:** `round2(base × 1.20)` (internal 20 % markup `VOLANTINIPRO_MARKUP_PCT`, never shown).
- **Quantities:**
  - below 1,000 → the **1,000 price** (minimum, status INTERPOLATED);
  - above 50,000 → linear extrapolation;
  - between points → linear interpolation.
- **Status values:**
  - `AUTO_CONFIRMED` (exact point);
  - `INTERPOLATED`;
  - `REQUIRES_REVIEW` (fold, B/W, incompatible paper/grammage, other format) → `customerPrice null`, and `computePrintEstimate` returns 0;
  - `NOT_CONFIGURED`.
- **Fixed factors:** sides do not change the price (verified), and urgency has no effect.
- **In totals:** printing is **excluded from `total_amount`** ("stampa indicativa, fatturata separatamente") and included in `grandTotal` and `metadata.printing.printing_price`.
- **Recommended contract:** the server recomputes from the spec with the same module. Keep the line **indicative** and outside the payable amount unless business decides otherwise (§3.F/G).

### 2.9 Graphics

| Item | Value |
|---|---|
| Current flow | `GRAPHIC_SERVICE_PRICE = 79` (`graphicPricing.js`), charged when `printing.artwork.required && artwork.selected` |
| Totals | Added to `grandTotal`, **not** to `total_amount` |
| Legacy | `design` €49 (legacy id `grafica`) and `graphic_design` €79 are still in the registry. No current UI adds `grafica`, but a **legacy or forged draft** would add €49 inside `total` while artwork adds €79 in `grandTotal`. |

### 2.10 VAT and rounding

- **VAT:** every price is **ex VAT**. No VAT is computed anywhere. The HTML PDF says "IVA esclusa · soggetto a conferma finale". **CONFIRMED FROM CODE.**
- **Rounding:** float euros with `roundMoney` (`Math.round(x×100)/100`) applied at:
  - each zone;
  - the subtotal;
  - the pairing discount;
  - the urgency surcharge;
  - `subtotalBeforePlan`;
  - the plan discount;
  - extras;
  - the total.

  Printing uses `round2` with `EPSILON`. The Step1 estimate rounds to **whole euros**. 3B.3 per-PV economics carry integer cents and reconcile with the engine (200-case parity sweep).

### 2.11 Where totals are shown or used

| Surface | Value | Consistent with the payable `total_amount`? |
|---|---|---|
| Step1 estimate | flat 18.5/1000 even for D2D, × urgency × (1−plan), + print, rounded to € | **No**. Example: 5,959 D2D Milano gives Step1 ≈ €110 vs Step4 €236.85. **INCONSISTENT.** |
| Step2 `assigned_budget` | qty × 18.5/1000 | Computed, never shown (dead) |
| Step3 preview | `calculateQuotePricing` (same engine) | Yes |
| Step4 | `total` (payable) and `grandTotal` (shown, includes indicative printing and graphics) | Yes, by construction |
| PDF (HTML print, wired in Production) | `grandTotal`, "IVA esclusa" | `grandTotal` ≠ `total_amount` when printing or graphics are selected |
| Byte PDF `generateQuotePdf` | `pricing.total` at `047a764`; `grandTotal` at 3B.3 | Not wired in Production |
| Quote e-mail (`_shared/quoteEmail.ts`) | client `grandTotal ?? total_amount` | Client value |
| Payment (`paymentMode.js` / `PagamentoBonifico`) | `settlement.amount_due_cents` (feasibility credit) else **`total_amount`** | Payable amount = client value |
| Admin revenue / orders | `total_amount` | — |
| Supplier marketplace | `supplier_submit_quote(p_total_amount)` → `quotes.total_amount`, visible to the campaign owner | Separate channel (supplier price). 1 quote live, 0 supplier quotes. |
| Admin AssignWork | `metadata.supplier_compensation` written **on the `campaigns` row** | Readable by the campaign owner through `campaigns_own_select`. Live: 25 rows have it, **0** currently owned by a non-admin. Structural leak risk (for example after `claim_public_campaign`). |

## 3. Business decisions

| # | Topic | Evidence | Status | Options | Recommendation |
|---|---|---|---|---|---|
| A | Supervisor | Registry `dedicated_supervision` €120, `priceUnit:"day"`, microcopy "€120 / giorno", **charged once** (not × days). Step4 computes `dedicatedSupervisionPrice` 45/70 by duration and Quick Quote passes 45, but `buildExtraServicesRegistry` **ignores** both (dead). | **INCONSISTENT + MISSING BUSINESS DECISION** | (1) €120 per campaign; (2) €120 × operational days (needs a server-known day count, otherwise fail closed); (3) 45/70 per day by duration | Owner decides. Until then, keep **(1) as charged today** and fix the microcopy. |
| B | Control PRO | Registry: €99 includes GPS (60) + Photo (30) + Advanced photo report (50) = €140 value. `controlProBundle.js` (unused) lists 2 IDs. `gps_plus_report` (90) is not de-duplicated. | **CONFIRMED FROM CODE** (registry) / **INCONSISTENT** (dead module, `gps_plus_report`) | Keep registry semantics; decide whether `gps_plus_report` and `advanced_report` are covered | Registry is authoritative. Remove the dead module. Decide `gps_plus_report` (**MISSING BUSINESS DECISION**). |
| C | Graphics | `GRAPHIC_SERVICE_PRICE` 79 (current flow, in `grandTotal`). Legacy `design` 49 and `graphic_design` 79 can still be priced from legacy drafts, inside `total`. | **INCONSISTENT** | 79 only; or 49 for "adaptation" vs 79 for "creation" | **PROPOSED CHANGE:** one graphics price (79) priced server-side; legacy IDs rejected or mapped. Owner confirms. |
| D | Plans | UI `single/monthly3/monthly6/monthly12` = 0/3/5/8 %. Engine `PLAN_CODES` `single/quarterly/semiannual/annual` (unused). Historical orders at 5 % for "3 mesi". | **INCONSISTENT** (naming) / **CONFIRMED** (current %) | Canonical codes, then map | **PROPOSED CHANGE:** canonical enum with a version; historical orders keep their stored version |
| E | Per-PV vs per-campaign extras | Extras are added once per campaign regardless of PV count (Multi-PV 3B.3 too). GPS, photos, supervision and account manager are effectively per campaign. | **MISSING BUSINESS DECISION** | Per campaign; per PV for operational items (supervision, GPS); mixed | Owner decides per item. The engine supports `unit: campaign \| pv \| day`. |
| F | Per-campaign vs per-plan totals | `total_amount` = one campaign with plan %; `totalCampaigns` computed, never priced; printing and graphics outside the payable amount | **MISSING BUSINESS DECISION** | (1) per campaign (status quo); (2) per plan (× campaigns); (3) per campaign with a plan header | Keep (1), and show "per campagna" explicitly |
| G | VAT / rounding | Every amount ex VAT; float with `roundMoney` per step; Step1 rounded to € | **CONFIRMED FROM CODE** | Integer cents with identical step rounding; VAT stays outside (shown as "IVA esclusa") or a 22 % VAT line | **PROPOSED CHANGE:** cents, same step order, `vat_included:false`; adding VAT is a separate decision |
| H | Multi-date & pairing | Per-PV: more than one date → `multiple_date_policy_required` (blocked, 0 %). Legacy: average of per-day discounts. | **MISSING BUSINESS DECISION** | Single date only; per-date pro-rata; best or worst date | Keep blocked (fail-closed) until approved |

## 4. Security contract (server-authoritative)

### 4.1 Principles

1. The server computes every amount in **integer cents** with a versioned module (`PRICING_VERSION`, for example `2026-10-v1`). Client totals, percentages, prices, discounts and `verified` / `serverAuthorized` flags are **informational only**.
2. **Inputs accepted from the client** (claims to validate): service enum, urgency enum, subscription enum, PV list (`pvId`, quantity, `municipality_code` / `nil_code` / centre-radius), extra IDs, printing spec, artwork flags and dates.
3. **Territory:** resolved server-side from `geo_municipalities` / `geo_nil_milano`. The PV centre must lie inside the claimed comune. Unknown or outside Lombardy → `TERRITORY_UNRESOLVED`.
4. **Discounts:**
   - plan % comes from the enum only;
   - pairing = 0 unless a valid, signed, unexpired per-PV eligibility (3B.4-T) matches `pvId`, territory hash and date;
   - unknown eligibility means 0;
   - there is no campaign-wide pairing for Multi-PV, so no cross-PV leakage.
5. **Dates:** the server validates format and period, and only the single-date policy applies (H).
6. **Auditability:** store `metadata.price_authorization` containing:
   - `version` and `status`;
   - `server_total_cents` and `client_total_cents`;
   - per-PV `base_cents` with territory evidence (code, density, tier, source);
   - urgency, plan and extras lines;
   - printing and graphics as indicative lines;
   - `pairing: {cents:0, reason}`;
   - `computed_at`.
7. **Supplier isolation:** supplier compensation never sits in customer-readable rows. Move `supplier_compensation` from `campaigns.metadata` to an admin-only table or column (a separate migration; currently 0 customer-owned rows).
8. **Idempotency:**
   - the fingerprint uses canonical server data (the 3B.3-H v2 whitelist) plus `server_total_cents` and `PRICING_VERSION`;
   - exact retry → same campaign; changed price → new campaign;
   - concurrency stays best-effort until a unique key exists (needs a migration);
   - deployed v11 still uses the v1 fingerprint (email, city, qty, client total, zones; 10-minute window). Live: 4 fingerprints repeated 6–10 days apart, i.e. repeats rather than races.

### 4.2 Behaviour by case

| Case | Server behaviour |
|---|---|
| Single-PV | One PV resolved, same grid and rounding. Honest inputs give identical cents to today (parity corpus). |
| 2-PV / 5-PV | Each PV is priced independently (per-zone rounding). Campaign base = Σ PV; urgency and plan on the campaign subtotal (current order); extras per E. A deleted PV is never priced; PV IDs must be unique. |
| Legacy orders (stored) | Never re-priced. Their stored totals belong to their historical version (for example 5 % plans). New submissions only. |
| Legacy drafts (client) | Recomputed at submit; legacy extra IDs (`design`, `graphic_design`, `gps_plus_report`, …) handled per §3 decisions (reject or map) |
| Empty or invalid territory | `422 TERRITORY_UNRESOLVED`; or, under policy, accept as `estimate_only` with no payable amount |
| Partial availability / pairing | Discount 0 for unverified PVs; verified PVs only after 3B.4-T. Never averaged across PVs. |
| Stale client snapshot | Ignored; mismatch → `409 PRICE_MISMATCH` with the server breakdown (D1); client re-confirms |
| API manipulation | Forged totals, percentages, prices, flags or density have no effect (recomputed); the mismatch is logged |
| Duplicate concurrent requests | v2 fingerprint plus server cents; best-effort until a unique index or idempotency-key table exists |

## 5. Migration and rollout design (not implemented)

1. **P0 — shared module** `supabase/functions/_shared/pricing/`: pure ES modules, cents, `PRICING_VERSION`, extras catalogue with `unit`, printing matrices, graphics. The client imports the same files (structural parity). A frozen parity corpus (≥500 generated plus curated real inputs) must match today's engine cent for cent.
2. **P1 — server validation** in a **v11-based patch**: the downloaded v11 + 3B.3-H hardening hunks + a pricing hunk. Never the repo `index.ts`. Deploy only from a dedicated directory; the Node harness (`SUBMIT_FN_PATH`) runs against that exact copy.
3. **P2 — shadow mode:** compute and store `price_authorization` (status `shadow`); never reject.
   - Mismatch logging stores only cents deltas, component names and version, with no personal data.
   - Feature flag `PRICING_ENFORCE=off`.
4. **P3 — enforcement** behind `PRICING_ENFORCE=on`: `409 PRICE_MISMATCH` and fail-closed `422`. Step4 handles 409 by showing the server breakdown. Rollback: flag off, or redeploy the previous function version.
5. **Server-owned quote snapshot.** Optionally a signed quote token returned by a `quote` endpoint, so the client submits the token rather than amounts.
6. **Related migrations** (separate approvals): `supplier_compensation` isolation; unique idempotency key; optional tariff tables.
7. **Do not:** deploy the repo `submit-campaign-request`, modify applied migrations, or activate Smart Pairing discounts.

## 6. Test plan

| Area | Tests |
|---|---|
| Amount manipulation | Forged `total_amount` lower/higher, `metadata.pricing`, `grand_total` → server cents unchanged; 409 in enforce, logged in shadow |
| 100 % forged discount | `planDiscount:100`, `smart_pairing_discount:40`, forged `smartPairingSlots`, `serverAuthorized/verified:true` → plan from enum, pairing 0 |
| Territory | Renamed "Milano" with another code; forged density; unknown code; centre outside polygon; outside Lombardy; NIL code → reject or `estimate_only` |
| Extras | Control PRO + GPS/Photo/Report (dedup); `gps_plus_report` + Control PRO; legacy `design` + artwork; unknown ID; supervision unit |
| VAT & rounding | Every tier at grid points and between, minimums, extrapolation, urgency × plan combinations; cents equal to today's engine (parity); `vat_included:false` |
| Single-PV regression | Legacy single-PV, Step1 → Step4, quick quote → identical cents for honest inputs |
| 2 / 5 PV | Mixed tiers; delete 2→1, 5→4; reorder; duplicate PV IDs rejected; per-PV evidence |
| Concurrency | Exact retry → same campaign; changed price → new; two simultaneous identical requests (documented best-effort) |
| PDF / HTML / checkout | Step4 `total`/`grandTotal` = server `price_authorization` = PDF = payload = `total_amount`; payment amount = server total |
| Payment & Admin | `paymentMode` amount due, feasibility credit fingerprint, admin confirm-payment and AssignWork unaffected (D6-compatible) |
| v11 compatibility | Harness against v11 + hardening + pricing; existing v11 payloads (Step4, quick quote) accepted in shadow; no territorial materialization added |

## 7. Readiness

**READY FOR IMPLEMENTATION: NO.** Blockers:

1. **Business decisions:**
   - A (supervision unit);
   - B (`gps_plus_report` coverage);
   - C (single graphics price);
   - D (canonical plan codes);
   - E (per-PV vs per-campaign extras);
   - F (per-campaign vs per-plan total);
   - G (VAT stays excluded);
   - H (multi-date policy);
   - D1 (mismatch → 409);
   - D2 (code constants become the official versioned price list);
   - D3 (legacy pairing → 0 %);
   - D4 (unresolved territory → reject or `estimate_only`).
2. **Step1 estimate** uses a flat rate for D2D and diverges from Step4. Decide whether Step1 shows the grid price or a clearly labelled range.
3. **Supplier compensation isolation** (migration) before marketplace or claim flows can expose it.
4. **Atomic idempotency** (unique key, migration) if concurrent duplicates must be impossible rather than best-effort.

Not blockers for **P0** (shared module plus parity corpus, no behaviour change). P0 can start once **D2 and G** are approved, because it only re-houses today's rules in cents.
