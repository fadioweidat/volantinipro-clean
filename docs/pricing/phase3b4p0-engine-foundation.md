# VolantiniPro — Phase 3B.4-P0: server-authoritative pricing engine foundation

**Status: implemented and tested in isolation.** The engine is a pure module. It is **not wired** into Step1/Step3/Step4, the PDF, the payload, checkout or any Edge Function, so Production behaviour is unchanged. No migrations, deploys or database writes.

| | |
|---|---|
| Branch / base | `feat/pricing-engine-p0` from `778798e` (P1 economic contract; pricing modules byte-identical to Production `047a764`) |
| Pricing version | `PRICING_VERSION = 'vp-2026.10-p0'` |
| Code | `src/lib/pricing/engine/`: `catalog.js`, `cents.js`, `distribution.js`, `rounding.js`, `priceQuote.js`, `index.js` |
| Tests | `tests/pricing_engine_p0.test.mjs` (24), `tests/pricing_engine_p0_parity.test.mjs` (13). They are not added to `npm test`; `package.json` is untouched. |

## 1. Canonical catalog (EUR, ex VAT, integer cents)

Every value is copied 1:1 from the Production modules. The parity test asserts each one against those modules.

**D2D grid** (cents; quantity points 1,000 / 2,500 / 5,000 / 10,000 / 20,000 / 30,000 / 50,000):

| Tier | Points | Minimum |
|---|---|---|
| MILANO_CORE | 12000 / 15000 / 21000 / 35000 / 66000 / 96000 / 150000 | 12000 |
| HINTERLAND_DENSE | 14000 / 18000 / 26000 / 42000 / 80000 / 117000 / 185000 | 14000 |
| COMO_LECCO | 17000 / 23000 / 33000 / 52000 / 100000 / 145000 / 230000 | 17000 |
| LOW_DENSITY_MOUNTAIN | 22000 / 32000 / 45000 / 75000 / 145000 / 210000 / 335000 | 22000 |

**Tier** comes from a **server-resolved** territory record:
1. Name anchors as in Production: `milano`, `seveso`, `meda`, `cormano`, `sesto`, `sesto san giovanni`, `como`, `lecco`, `sondrio`.
2. Otherwise density: ≥6000 MILANO_CORE, ≥2500 HINTERLAND_DENSE, ≥800 COMO_LECCO, else LOW_DENSITY_MOUNTAIN.

A NIL record resolves with parent Milano, so MILANO_CORE.

**Other rates:**

| Item | Value |
|---|---|
| Flat services | h2h 2200, b2b 3500 cents per 1,000 |
| Urgency | normal 0 %, urgent 20 %, express 35 % (on the distribution base) |
| Plans | **Current Production UI codes**: `single` 0, `monthly3` 3, `monthly6` 5, `monthly12` 8 %. Canonical naming is unresolved; other codes, including the unused `quarterly/semiannual/annual`, are rejected. |
| Pairing caps | same ≤ 40 %, nearby ≤ 20 % |
| Graphics | 7900, **once per campaign** (rule 3) |
| Printing | Production `printPricing.js` reused as-is (Pixart matrices + internal 20 % markup) |

**Extras** (prices = Production registry):

| Id | Cents | Scope | Status | Evidence |
|---|---|---|---|---|
| control_pro | 9900 | **ambiguous** | active | Includes `tracking_gps`, `photo_proof`, `photo_report_advanced` (registry `bundleIncludesIds`); "a prezzo fisso"; scope not stated |
| tracking_gps | 6000 | **pv** | active | "Segui in tempo reale gli operatori" |
| photo_proof | 3000 | **pv** | active | "Conferma visiva zona per zona" |
| photo_report_advanced | 5000 | **ambiguous** | active | Report deliverable vs field photos |
| video_proof | 6000 | **pv** | active | "Video delle operazioni in campo" |
| qr_analytics | 5000 | **campaign** | active | "Codice QR univoco", "Landing page dedicata" |
| advanced_report | 4000 | **campaign** | active | "post-campagna" |
| account_manager | 8000 | **campaign** | active | "ciclo di vita della campagna" |
| dedicated_supervision | 12000 | **campaign** | active | **Rule 1** |
| puntiVetrina | 3500 | **ambiguous** | active (D2D only) | "Fino a 5 punti vetrina": per campaign or per area not stated |
| gps_plus_report | 9000 | ambiguous | **blocked** | Premium GPS/report outside Control PRO: decision pending |
| quality_control | 2500 | pv | **legacy_unpriced** | Hidden legacy item, not in the contract |
| operator_support | 3900 | campaign | **legacy_unpriced** | Hidden legacy item, not in the contract |

**Aliases:**
- Production `legacyIds` map to canonical ids.
- Graphics aliases `design`, `grafica`, `preparazione_grafica`, `graphic_design` and `grafica_progetto` all map to the single graphics component. The legacy €49 is **never** priced.
- `stampa`, `printing`, `urgent`, `urgent_distribution` and `distribuzione_urgente` are markers: printing comes from the printing spec and urgency from the urgency enum.

## 2. Rounding rules (exact)

- All amounts are safe integers in cents. Divisions are exact integer ratios rounded **half-up** (`divHalfUp`), with no float accumulation.
- **Zone price** = `max(rational interpolation, minimum)`, rounded half-up. Extrapolation applies below 1,000 (→ minimum) and above 50,000.
- **Flat price** = `round(qty × rate / 1000)`.
- **Percentages** = `round(cents × pct / 100)`.
- **Date allocation** splits a PV base proportionally to date quantities using the largest-remainder method (ties go to the earlier date). Parts always sum exactly to the PV base.
- **Order (Production):**
  1. base = Σ zones (D2D) or the campaign flat base;
  2. − pairing;
  3. + urgency (on base);
  4. → subtotal;
  5. − plan % of the subtotal;
  6. + payable extras;
  7. = **payable**.
- **`legacy-float` rounding.** This replays Production's `roundMoney` float arithmetic step by step. It is used **only** to prove structural parity and, in P2, to separate float artefacts from real mismatches. It is never authoritative.

**Production rounding inconsistency (EXISTING PRODUCTION INCONSISTENCY).** Production intends half-up (`Math.round(x×100)/100`) but works on binary floats:
- Over 240,000 zone prices (4 tiers × 1..60,000) there are 30,000 exact half-cent cases. Production rounds 28,516 of them up and **1,484 down**.
- Over 285,715 percentage cases, 1,326 differ, all exact half-cents.

The exact engine is always +1 cent in those cases. It follows the documented intent, and in P1 client and server use the same engine, so both sides agree.

## 3. Payable, quoted and indicative (Production checkout semantics preserved)

| Component | In `payableCents` (= today's `total_amount`) | In `grossQuoteCents` (= today's `grandTotal`) |
|---|---|---|
| Distribution, pairing, urgency, plan | yes | yes |
| Payable extras | yes | yes |
| Graphics €79 | **no** (quoted, invoiced separately, as today) | yes |
| Printing | **no** (indicative; `REQUIRES_REVIEW` → `null`) | yes when priced |

`totals = { payableCents, quotedNotPayableCents, indicativeCents, grossQuoteCents, printingPriceKnown, clientTotalComparison? }`.

## 4. Input trust boundaries (contract A–E)

| Input | Content | Trust |
|---|---|---|
| **A. `request`** (customer claims) | `service`, `urgency`, `plan`, `pvs[{pvId, zones[{territoryRef, quantity}], dates[{date, quantity}]}]`, `extras[id \| {id, pvIds}]`, `printing`, `graphics{required, selected}`, `clientClaims` | Validated. `clientClaims` and any `density`, `densita`, `tier`, `price`, `priceCents` or `amount` fields are **recorded in `ignoredClientClaims` and never used**. |
| **B. `territory`** | `{[territoryRef]: {status:'resolved', municipalityName, municipalityCode \| nilCode, densityPerKm2, source} \| {status:'unresolved', reason}}` | Must come from the server (`geo_municipalities` / `geo_nil_milano`) in P1. An unresolved ref or missing density gives status `unresolved`, with no fallback tier. |
| **C. `authorizations.pairing`** | `{mode:'disabled' (default) \| 'verified-only', now, eligibility[]}` | See §6. In P0 nothing issues eligibility, so the default is disabled. |
| **D. `catalog`** | Defaults to the P0 catalog | — |
| **E. output** | `pricingVersion`, `status` (`priced \| unresolved \| invalid`), `vatIncluded:false`, `serverAuthorized:false` (P0), `rounding`, `pvs` (zones with tier, basis and evidence; dates with allocation and pairing), `extras` (scope, units, unit cents, `includedIn`), `graphics`, `printing`, `campaign`, `totals`, `issues[{severity, code, path}]`, `ignoredClientClaims` | Output is **deeply frozen**; input is never mutated; the result is deterministic and independent of PV order |

**Statuses:**
- `invalid` covers bad service, urgency or plan code; quantity outside 1..5,000,000 integers; empty, duplicate or blank PV ids; unknown extra; extra on an unknown PV; PV quantity ≠ Σ zones; bad date.
- `unresolved` covers unresolved territory, missing density, a blocked or legacy extra, and an ambiguous-scope extra on more than 1 PV.
- In both cases `totals = null`: the engine never pretends a quote is authorized.

## 5. Multi-PV extras (rule 4)

| Scope | Rule |
|---|---|
| pv | `unit × number of selected PVs` (default all; `pvIds` narrows). Removed PVs are not counted. |
| campaign | Once |
| ambiguous | Priced once for 1 PV (identical to today); `EXTRA_SCOPE_UNDECIDED` for more than 1 PV |

Control PRO de-duplication applies in every case: included items are listed with `includedIn: 'control_pro'` at 0.

## 6. Multi-date pairing (rule 5)

1. Each PV's base is allocated to its dates proportionally to date quantities (largest remainder). If date quantities are missing or do not sum to the PV quantity, allocation is **unreliable** and pairing is 0 for that PV (`PAIRING_ALLOCATION_UNRELIABLE`).
2. An eligibility entry applies to **exactly one PV × date** and only if all of these hold:
   - `pvId` and `date` match (exactly one entry);
   - `territoryRef` belongs to that PV;
   - `pricingVersion` equals the engine version;
   - `verification.verified === true` and `issuer === 'server'`;
   - `now < expiresAt`;
   - `matchType` is `same` or `nearby` and `discountPct` is an integer in 1..cap.
3. The discount is `round(allocated date base × pct / 100)`. It never touches other dates, other PVs, extras, printing or graphics. Eligibility for a PV that is not in the request is ignored and flagged.
4. **Future trust contract (not implemented).** P1/3B.4-T must issue eligibility server-side: signed, short-lived, bound to `pvId + date + territory hash + pricingVersion`, verified before calling the engine. P0 only consumes already-verified data and defaults to `disabled`.

## 7. Legacy compatibility

- **Stored campaigns are never re-priced.** `describeHistoricalPricingSnapshot()` returns a frozen copy marked `legacy-unversioned` / `repriceable:false`, and `repriceHistorical()` throws `LEGACY_SNAPSHOT_IMMUTABLE`. Example: the 4 historical "3 mesi" orders keep "Piano -5%", while new `monthly3` is 3 %.
- Legacy drafts are recomputed at submit time. Legacy graphics aliases map to €79 quoted. `quality_control`, `operator_support` and `gps_plus_report` are unresolved rather than invented.

## 8. Test corpus and parity results

| Suite | Result |
|---|---|
| `pricing_engine_p0.test.mjs` | **24/24** |
| `pricing_engine_p0_parity.test.mjs` | **13/13** |

**Mutation check.** Five deliberately weakened engines are **all detected**:
- no Control PRO de-duplication;
- pairing not bound to the PV;
- plan % taken from the client claim;
- per-PV extras charged once;
- ambiguous scope priced.

**Parity vs Production modules:**

| Check | Result |
|---|---|
| Catalog | Equals Production constants (grid, minimums, flat rates, urgency, extras prices, Control PRO contents, graphics); legacy `design` still €49 in Production |
| `legacy-float` replay | Identical to Production on **every** zone price (4 tiers × 1..60,000 plus a sweep to 500,000), every flat price (1..200,000), and **every component of 4,000 single-PV quotes**. This proves identical logic and order. |
| Exact engine, single-PV | Identical on **3,933 / 4,000** quotes. 67 differ by ≤ 2 cents, all explained by exact half-cent rounding steps. |
| Exact engine, multi-PV base (500 campaigns, 2 and 5 PV) | Identical except 17, all half-cent zones |

**Classified differences:**

| Category | Case | Production | Engine |
|---|---|---|---|
| EXISTING PRODUCTION INCONSISTENCY | Float half-cent rounding | rounds some halves down | +1 cent (half-up) |
| EXPECTED APPROVED BUSINESS CHANGE | Legacy `design` + artwork | 49 (payable) + 79 | 79 once (rule 3) |
| LEGACY COMPATIBILITY DIFFERENCE | Legacy `design` alone | +49 in payable | 0 payable, 79 quoted |
| EXPECTED APPROVED BUSINESS CHANGE | 2 PV with GPS, photo, account manager, supervision | extras 290 € | 380 € (GPS and photo per PV; rule 4) |
| EXISTING PRODUCTION INCONSISTENCY | `gps_plus_report` (+ Control PRO) | 90 € (double GPS) | unresolved |
| LEGACY COMPATIBILITY DIFFERENCE | `quality_control` / `operator_support` | 25 € / 39 € | unresolved |
| LEGACY COMPATIBILITY DIFFERENCE | Unknown territory or missing density | HINTERLAND fallback | unresolved |
| EXISTING PRODUCTION INCONSISTENCY | `planDiscount: 100`, forged density | €0 / cheaper tier | ignored |
| **UNEXPECTED REGRESSION** | — | — | **0** |

## 9. Unresolved decisions (isolated, not guessed)

1. Canonical plan codes and display names. The engine keeps the current UI codes.
2. Premium GPS/report outside Control PRO (`gps_plus_report`): blocked.
3. Scope of Control PRO, `photo_report_advanced` and Punti Vetrina for more than 1 PV: unresolved on multi-PV quotes.
4. Step 1 estimate reconciliation (flat 18.5/1000 for D2D in Step 1): not touched.
5. Timing of strict 409 mismatch enforcement.
6. Municipality mismatch behaviour: P0 returns `unresolved`; P1 must choose reject vs `estimate_only`.
7. Supplier compensation storage migration.
8. Atomic idempotency migration.
9. Acknowledge the exact half-up rounding: up to +1 cent per half-cent step vs today's float, max 2 cents in the corpus.
10. Pairing attribution method: proportional to date flyers (deterministic). Confirm it, or supply per-date amounts.

## 10. Proposed P1 server integration (requires approval)

1. **Shared code.** Move or bundle `src/lib/pricing/engine/` and `printPricing.js` into `supabase/functions/_shared/pricing/`, both pure ES modules. The client imports the same files.
2. **Server territory resolver.** It reads `geo_municipalities` / `geo_nil_milano` by `municipality_code` / `nil_code` with the service role, and checks that the PV centre lies inside the comune polygon. Its output is the `territory` map (B).
3. **Edge function.** A **v11-based** patch: downloaded v11 + 3B.3-H hardening hunks + a pricing hunk. **Never** the repo `index.ts`. The client sends request A plus `municipality_code` / `nil_code`. The server runs `priceQuote`.
   - Shadow mode (P2) stores `metadata.price_authorization = { pricingVersion, status, serverPayableCents, clientTotalCents, exactVsLegacyFloatDelta, per-PV evidence, issues }` and never rejects.
   - Enforce mode (P3, flag) returns 409 with the server breakdown, after decisions 5–6.
4. **Fingerprint.** The v2 fingerprint gains `serverPayableCents` and `pricingVersion`.
5. **Rollout.** Shadow first; compare exact vs `legacy-float` to classify mismatches (half-cent artefact vs tampering); then the enforce flag. Rollback means flag off or redeploying the previous function.
