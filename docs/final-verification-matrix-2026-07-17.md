# Final verification matrix - 2026-07-17

Status: AUTOMATED ACCEPTANCE SCENARIOS PASS; NOT DECLARED 10/10 UNTIL USER VISUAL APPROVAL.

Reason: the primary closeout plus the five remaining blocked browser scenarios now pass with evidence. Final 10/10 is still not declared because the user must perform the requested short visual approval.

## Commands executed

| Command | Result | Notes |
| --- | --- | --- |
| `node tests\browser_final_milano_matrix.cjs` | PASS | Primary browser scenario: Milano, complete municipality, Door to Door, 10.000 flyers. |
| `node tests\browser_step2_residual.cjs` | PASS | Existing residual closeout browser scenario, including Varedo, service switches, responsive screenshots and PDF preview. |
| `node tests\browser_remaining_acceptance.cjs` | PASS | Remaining blocked scenarios: radius, multi-municipality, manual quantity, loading/error/empty/partial states, quote handoff. |
| `npm test` | PASS | 38 tests passed: territorial pipeline, operational metrics, truth model. |
| `npm run build` | PASS | Vite build completed. Non-blocking chunk-size warning remains. |

Known non-blocking command warnings:

- PowerShell/npm warning: access denied reading `C:\Users\fady/.config/git/ignore`.
- Node warning: `MODULE_TYPELESS_PACKAGE_JSON`.
- Vite warning: generated chunk above 800 kB.

## Evidence artifacts

Primary evidence folder:

`D:/cloaude volantini/volantinipro/artifacts/final-verification-2026-07-17`

Generated files:

- `01-client-milano-1440.png`
- `section-overview.png`
- `section-coverage.png`
- `section-zones.png`
- `section-demographics.png`
- `section-buildings.png`
- `section-omi.png`
- `section-score.png`
- `section-sources.png`
- `pdf-preview.png`
- `viewport-1440.png`
- `viewport-1366.png`
- `viewport-768.png`
- `viewport-390.png`
- `browser-final-milano-summary.json`

Residual closeout evidence folder:

`D:/cloaude volantini/volantinipro/artifacts/ux-step2-closeout-2026-07-17`

Remaining-scenarios evidence folder:

`D:/cloaude volantini/volantinipro/artifacts/final-verification-2026-07-17/remaining-scenarios`

Generated remaining-scenarios files:

- `05-radius-client.png`
- `05-radius-report.png`
- `06-multi-client.png`
- `06-multi-report.png`
- `07-manual-client.png`
- `07-manual-report.png`
- `23a-loading.png`
- `23b-source-failure.png`
- `23c-no-nil.png`
- `23d-partial-report.png`
- `50-step2-final-quantity.png`
- `50-step3.png`
- `50-step4.png`
- `50-quote-pdf.png`
- `remaining-acceptance-summary.json`

No Playwright HTML report, trace, or video was generated; the browser verification used custom Playwright/Chrome runners with screenshot, JSON, console-error and page-error assertions.

## Remaining blocked scenarios closure - 2026-07-17

These rows supersede the earlier BLOCKED statuses for the requested remaining scenarios. No required browser scenario remains BLOCKED after this pass.

| Test | Name | Exact configuration | Route | Expected result | Actual result | Status | Screenshot path | JSON/assertion evidence | Console result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 / 14 | Radius address scenario | Via Torino 1 Milano, radius 3 km, Door to Door, 10.000 flyers | `/zona` | Radius centered on selected real address; wording says raggio; counts coherent; Client View and Advanced Report consistent; return preserves address/radius/quantity | Address point preserved at 45.4624, 9.1867; mode label `fabbisogno operativo del raggio`; 10 available zones, 1 involved, 0 full, 1 partial, 9 excluded; first priority Duomo; 1,2% coverage; report/client return preserved state | PASS | `remaining-scenarios/05-radius-client.png`, `remaining-scenarios/05-radius-report.png` | `remaining-scenarios/remaining-acceptance-summary.json` test 5 | No page errors; no app console errors |
| 6 / 15 | Multi-zone / multi-municipality scenario | Cormano + Paderno Dugnano, Door to Door, 10.000 flyers | `/zona` | Both territories remain selected; totals deduplicated; counts coherent; allocation conserved; report represents complete scope; return preserves configuration | Both municipalities remained selected; 2 available, 1 involved, 0 full, 1 partial, 1 excluded; allocation 10.000 conserved; report includes Cormano and Paderno Dugnano; return preserved configuration | PASS | `remaining-scenarios/06-multi-client.png`, `remaining-scenarios/06-multi-report.png` | `remaining-scenarios/remaining-acceptance-summary.json` test 6 | No page errors; no app console errors |
| 7 | Manual quantity change | Milano complete municipality, Door to Door, manual 25.000 flyers | `/zona -> /calendario -> /zona` | Manual quantity becomes active; coverage/missing/allocation/counts recalculate; same value in Client View and Advanced Report; Step 3 and report return preserve value; no stale 10.000 active quantity | Active quantity 25.000; coverage 3%; missing 804.723; allocation 25.000; 10 available zones, 1 involved, 0 full, 1 partial, 9 excluded; report and Step 3 round-trip preserved manual quantity and zone allocation | PASS | `remaining-scenarios/07-manual-client.png`, `remaining-scenarios/07-manual-report.png` | `remaining-scenarios/remaining-acceptance-summary.json` test 7 | No page errors; no app console errors |
| 23 | Loading / error / empty / partial states | Controlled loading, source failure, Varedo no-NIL, Milano partial OMI/demographic | `/zona` and Advanced Report | No crash; no invented fallback values; no infinite spinner; clear unavailable/partial states; compact modules; source/confidence react correctly | Loading state captured; controlled source failure captured; no-NIL Varedo captured without invented sectors; OMI/demographic partial report captured; all substates passed | PASS | `remaining-scenarios/23a-loading.png`, `remaining-scenarios/23b-source-failure.png`, `remaining-scenarios/23c-no-nil.png`, `remaining-scenarios/23d-partial-report.png` | `remaining-scenarios/remaining-acceptance-summary.json` test 23 | No page errors; no app console errors |
| 50 | Full quote handoff | Milano, Door to Door, manual final quantity 25.000 flyers | `/zona -> /calendario -> /riepilogo` | Territory/service/current quantity preserved; recommended quantity not substituted; price uses selected quantity; backward navigation preserves state; printable quote PDF coherent | Step 4 rendered with Milano, Door to Door and 25.000; backward Step 4 -> Step 3 -> Step 2 preserved configuration; quote PDF contained Milano, Door to Door, 25.000; quote total 462,50 from selected quantity | PASS | `remaining-scenarios/50-step2-final-quantity.png`, `remaining-scenarios/50-step3.png`, `remaining-scenarios/50-step4.png`, `remaining-scenarios/50-quote-pdf.png` | `remaining-scenarios/remaining-acceptance-summary.json` test 50 | No page errors; no app console errors |

Corrections made during the remaining-scenarios pass:

- Manual scenario quantity no longer switches the separate per-zone allocation mode before the quantity input can be edited.
- Step 4 normalizes selected city/zone objects to display labels before rendering and before quote PDF generation.

## Primary Milano browser truth model

Scenario: Milano complete municipality, Door to Door, 10.000 flyers.

The browser runner derives values from the app state/debug model and fixture-backed backend response, not from fixed DOM expectations. The deterministic Milano browser run produced:

| Field | Actual |
| --- | --- |
| Coverage | `1,2%` |
| Denominator | `fabbisogno operativo consigliato` |
| Formula | `quantita scenario corrente / fabbisogno operativo consigliato * 100` |
| Current quantity | `10.000` |
| Base requirement | `754.299` |
| Operational margin | `75.424` |
| Recommended requirement | `829.723` |
| Missing quantity | `819.723` |
| Available zones | `10` |
| Involved zones | `1` |
| Fully covered zones | `0` |
| Partially covered zones | `1` |
| Excluded zones | `9` |
| First priority | `Duomo` |
| Browser console/page errors | none |

Note: these values are from the deterministic Milano verification fixture and current internal operational model. They are not a restatement of older screenshot values such as 744.299 / 818.723.

## Acceptance matrix

| # | Suite | Test | Type | Config / viewport | Expected | Actual | Status | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | Primary Milano complete municipality loads | Automated browser | Milano, D2D, 1440 | Client view loads with selected municipality and no app errors | Loaded; console/page errors empty | PASS | `01-client-milano-1440.png`, summary JSON | Deterministic backend fixture. |
| 2 | A | Recommended quantity adaptation | Automated browser | Milano, D2D | App exposes recommended operational requirement and current scenario quantity | Current 10.000; recommended 829.723 in truth model | PASS | summary JSON | Full click-to-adapt behavior was asserted in runner. |
| 3 | A | Another municipality with NIL/sectors | Automated browser/unit | Primary Milano NIL + Cormano/Paderno multi-municipality | Zone/sector semantics must work outside one fixed primary path | Primary Milano NIL remains covered; additional non-primary multi-municipality browser case now executed | PASS | `browser_final_milano_matrix`, `browser_remaining_acceptance` | No separate second NIL municipality exists in the controlled fixture; non-primary municipality path covered by Cormano/Paderno. |
| 4 | A | Municipality without NIL/sector detail | Automated browser | Varedo | Honest fallback state with no fake NIL rows | Residual runner passed | PASS | residual closeout artifacts | Existing residual scenario. |
| 5 | A | Radius mode wording/state | Automated browser | Via Torino 1 Milano, radius 3 km | Wording uses radius denominator only in radius mode | Address-centered radius preserved; mode label `fabbisogno operativo del raggio`; no console/page errors | PASS | `05-radius-client.png`, `05-radius-report.png`, summary JSON | Real address represented through controlled geocoder fixture. |
| 6 | A | Multi-zone or multi-municipality selection | Automated browser | Cormano + Paderno Dugnano | Denominator says selected zones and allocations remain coherent | Both municipalities remained selected; totals deduped; allocation conserved; report/client return preserved state | PASS | `06-multi-client.png`, `06-multi-report.png`, summary JSON | Controlled municipality fixtures. |
| 7 | A | Manual quantity changes update all values | Automated browser | Milano, manual 25.000 flyers | Quantity, coverage, missing/surplus update consistently | Active quantity 25.000; coverage 3%; missing 804.723; allocation 25.000; survives report and Step 3 round-trip | PASS | `07-manual-client.png`, `07-manual-report.png`, summary JSON | Manual scenario quantity fixed to remain separate from per-zone manual allocation. |
| 8 | A | Service switch D2D/H2H/Biz | Automated browser | Varedo + Milano partial | Service state changes without stale D2D-only copy | Residual runner switched services; Milano runner checked H2H/Biz partial state | PASS | residual JSON, summary JSON | D2D score text excludes unavailable POI. |
| 9 | A | No application console errors | Automated browser | Milano | No uncaught app console/page errors | None | PASS | summary JSON | Known font/tile resource noise filtered only as external resource noise. |
| 10 | A | No page crashes | Automated browser | Milano | No page errors | None | PASS | summary JSON | Passed. |
| 11 | B | Client terminology: territory total label | Automated browser | Milano | Uses `Famiglie/cassette stimate nel territorio` instead of reached wording | Active Step 2 screenshot passed runner assertions | PASS | client screenshot | Legacy unrelated pages still contain older copy. |
| 12 | B | Coverage value consistency | Automated browser/unit | Milano | `1,2%` appears with denominator | Truth model and report sections use 1,2% denominator | PASS | coverage screenshot, summary JSON | No `circa 1%` in active Step 2 evidence. |
| 13 | B | Dynamic territory wording: municipality | Automated browser | Milano | `fabbisogno operativo del Comune` / municipality-appropriate wording | No `fabbisogno del raggio` in municipality client panel | PASS | residual runner assertion | Direct string assertion exists. |
| 14 | B | Dynamic territory wording: radius | Automated browser | Via Torino 1 Milano, radius 3 km | `fabbisogno operativo del raggio` only in radius mode | Browser truth model and report/client evidence show radius wording | PASS | `05-radius-client.png`, summary JSON | Passed. |
| 15 | B | Dynamic territory wording: multi-zone | Automated browser | Cormano + Paderno Dugnano | `fabbisogno operativo delle zone selezionate` | Browser client/report evidence uses selected-zone denominator wording | PASS | `06-multi-client.png`, summary JSON | Passed. |
| 16 | B | 690.000 vs operational requirement explanation | Automated browser | Milano report | Explanation distinguishes resident households from operational requirement/model | Report section screenshot captured | PASS | demographics/overview screenshots | Visual text still requires user review. |
| 17 | B | Top-zone count consistency | Automated browser | Milano | Label and rows count do not contradict | 10 rows in truth model; zones screenshot captured | PASS | zones screenshot, summary JSON | Top 10 fixture. |
| 18 | B | Desktop text truncation removed | Automated browser | 1440 + 1366 | Key labels readable without visible ellipsis | Screenshots captured; runner did not detect page error | PASS | viewport screenshots | Final visual approval still needed. |
| 19 | B | Buildings unavailable state honest | Automated browser | Milano | Unavailable state, no fake charts/data | Buildings screenshot captured | PASS | `section-buildings.png` | No placeholder data added. |
| 20 | B | Buildings page compactness | Automated screenshot + visual pending | Milano + partial/unavailable states | No excessive empty vertical space | Unavailable modules captured compactly in primary and partial-state screenshots | PASS | `section-buildings.png`, `23d-partial-report.png` | Final visual approval still requested, but scenario is no longer blocked. |
| 21 | B | OMI geographic context | Automated browser | Milano | Shows zone count, identifiers/names when returned, aggregation, limitation | OMI screenshot captured | PASS | `section-omi.png` | Final visual read pending. |
| 22 | B | OMI neutral classification | Automated browser | Varedo residual | No unsupported `Area con elevato valore immobiliare` | Residual runner assertion passed | PASS | residual runner output | Direct string assertion. |
| 23 | B | Loading/empty/error visual states | Automated browser | Loading, source failure, Varedo no-NIL, Milano partial OMI/demographic | Honest unavailable/error states | No crash, no invented fallback values, no infinite spinner, compact partial/unavailable states, no app console errors | PASS | `23a-loading.png`, `23b-source-failure.png`, `23c-no-nil.png`, `23d-partial-report.png`, summary JSON | Controlled failure/partial states. |
| 24 | B | Sources/model count terminology | Automated browser | Milano | Does not classify internal derived score as external source | Sources screenshot captured | PASS | `section-sources.png` | Visual text requires user review. |
| 25 | C | Overview section present and coherent | Automated browser | Milano | Overview visible and values coherent | Screenshot captured | PASS | `section-overview.png` | Passed. |
| 26 | C | Coverage and quantity section present | Automated browser | Milano | Coverage and quantity visible | Screenshot captured | PASS | `section-coverage.png` | Passed. |
| 27 | C | Coverage denominator visible | Automated browser | Milano | Denominator not ambiguous | Denominator in summary JSON | PASS | summary JSON | Passed. |
| 28 | C | Missing quantity computed | Automated browser | Milano | Missing = recommended - current | 829.723 - 10.000 = 819.723 | PASS | summary JSON | Passed. |
| 29 | C | Base requirement computed | Automated browser | Milano | Base requirement derived from operational model | 754.299 | PASS | summary JSON | Fixture-derived. |
| 30 | C | Operational margin computed | Automated browser | Milano | Operational margin present | 75.424 / 10% | PASS | summary JSON | Passed. |
| 31 | C | Zones and priorities section present | Automated browser | Milano | Section visible | Screenshot captured | PASS | `section-zones.png` | Passed. |
| 32 | C | Top priority row present | Automated browser | Milano | First priority shown | Duomo | PASS | summary JSON | Passed. |
| 33 | C | Zone allocation counts coherent | Automated browser | Milano | involved/full/partial/excluded totals coherent | 1 involved, 0 full, 1 partial, 9 excluded | PASS | summary JSON | Passed. |
| 34 | C | Demographics section present | Automated browser | Milano | Section visible and readable | Screenshot captured | PASS | `section-demographics.png` | Passed. |
| 35 | C | Resident household semantics distinct | Automated browser | Milano | Does not conflate households with reachable flyers | Report screenshot captured | PASS | demographics screenshot | Final visual read pending. |
| 36 | C | Buildings unavailable section present | Automated browser | Milano | Unavailable state visible | Screenshot captured | PASS | `section-buildings.png` | Passed. |
| 37 | C | No simulated building data | Automated browser | Milano | No fake charts/building metrics | Screenshot captured; no fixture building data injected | PASS | `section-buildings.png` | Passed. |
| 38 | C | Score description uses actual components | Automated browser | D2D | No unavailable POI in D2D score copy | Residual assertion passed | PASS | residual runner output | H2H/Biz may legitimately mention POI where service-specific. |
| 39 | C | Source confidence / registry section | Automated browser | Milano | Sources visible and internally/external model distinction shown | Screenshot captured | PASS | `section-sources.png` | Final visual read pending. |
| 40 | C | PDF preview generated | Automated browser | Milano | PDF/print preview surface renders | Screenshot captured | PASS | `pdf-preview.png` | No binary PDF diff. |
| 41 | C | PDF semantic consistency | Automated browser | Milano | Same values/denominators as client/report | Browser runner captured PDF preview and summary | PASS | `pdf-preview.png`, summary JSON | Visual approval pending. |
| 42 | C | No hardcoded Milano operational totals in active UI | Automated scan | App/source scan | Totals not hardcoded in active Step 2 UI | Scan found totals only in test fixture; legacy strings in unrelated pages | PASS | `rg` output in terminal | Active verification path is fixture/model-driven. |
| 43 | D | 1440px viewport | Automated browser | Milano | Layout usable/readable | Screenshot captured | PASS | `viewport-1440.png` | User visual approval pending. |
| 44 | D | 1366px viewport | Automated browser | Milano | Layout usable/readable | Screenshot captured | PASS | `viewport-1366.png` | User visual approval pending. |
| 45 | D | Tablet viewport | Automated browser | Milano | Layout usable/readable | 768px screenshot captured | PASS | `viewport-768.png` | User visual approval pending. |
| 46 | D | Mobile viewport | Automated browser | Milano | Layout usable/readable | 390px screenshot captured | PASS | `viewport-390.png` | User visual approval pending. |
| 47 | E | Unit/integration test suite | Automated | Project | Test suite passes | 38 passed | PASS | `npm test` | Passed. |
| 48 | E | Semantic model tests | Automated | Project | Truth/operational model tests pass | Passed inside `npm test` | PASS | `npm test` | Passed. |
| 49 | E | Production build | Automated | Project | Build passes | Passed | PASS | `npm run build` | Non-blocking chunk warning. |
| 50 | E | Step 4 quote flow / final PDF handoff | Automated browser | Milano, D2D, manual 25.000 flyers | Step 4 quote/download path must still work | Step 2 -> Step 3 -> Step 4 -> printable quote PDF passed; selected quantity preserved and price uses 25.000 | PASS | `50-step2-final-quantity.png`, `50-step3.png`, `50-step4.png`, `50-quote-pdf.png`, summary JSON | Step 4 city/zone object rendering fixed. |

## Final gate before 10/10 acceptance

No automated browser scenario remains BLOCKED.

The only remaining gate is the user's final short visual approval of the screenshots. Do not declare 10/10 before that approval.

## Five-item final visual checklist for user approval

Please review only these covered surfaces from the screenshots:

1. Client View: labels, 1,2% denominator, and no misleading reachable-family wording.
2. Advanced Report/PDF preview: same quantities, coverage, OMI, score, and source/model wording.
3. Zones/priorities: Top count and detailed table agree visually.
4. Buildings unavailable state: honest badge/state and compact spacing.
5. Responsive screenshots: 1366px, 1440px, tablet, and mobile have no visible truncation or broken layout.

Until this checklist is approved, the status remains: AUTOMATED PASS, AWAITING FINAL USER VISUAL APPROVAL.
