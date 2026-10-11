# Customer dashboard false-zero — 2026-10-11

Base: integration/rc2-full-site, 047a764d54624088c6271b112ca53be09b6c5732.
Route: /dashboard. Role: Customer. Active implementation: DashboardPage in volantinipro-final.jsx, selected by src/app/AppRouter.jsx.

## Reproduction evidence
Controlled server renders of the actual DashboardPage body, with hook fixtures, reproduced three failures before the fix: a failed campaign request displayed the successful empty state; a successful empty response did not display the authoritative zero spend; missing/mixed totals displayed zero flyers or incomplete spend as a total. Baseline: 3/6 render checks failed. This is automated rendering evidence, not a live authenticated reproduction.

## Change
Loading retains skeletons. Failed/unconfigured campaign reads expose unavailable KPIs and an error with a reload/retry button. Successful empty responses retain a true empty state with zero totals. A sum is shown only if every campaign supplies a finite value; unknown campaign/payment states do not become zero counts.

## Validation
33/33 targeted checks passed:
`node --import tsx --test tests/customer_dashboard_false_zero.render.test.mjs tests/customer_dashboard_contract.test.mjs tests/customer_campaign_ownership.test.mjs tests/mobile_dashboard_loading_compensation.test.mjs`
`npm run build` passed, including SEO prerender.
`npm ci --ignore-scripts` failed because the existing package lock omits declared dependencies. Verification used `npm install --ignore-scripts --package-lock=false --no-audit --no-fund`, leaving the lockfile unchanged. Runtime Node is 24.19.0; the repository declares Node 22.x.

## Remaining acceptance
Use an authenticated Customer account on desktop and Samsung (412x915 viewport plus physical device). Open /dashboard with a valid owned campaign; delay the campaign read and verify skeletons, fail it and verify unavailable KPIs without "Nessuna campagna ancora", then retry and verify recovery. Also verify successful empty, explicit zero, missing metric and mixed-known totals. Check overflow and the retry button. Confirm the deployed commit before production verification. Do not create production campaigns merely to populate fixtures. Measure cold first load separately; no performance improvement is claimed.

ROOT CAUSE:
The dashboard reduced missing distributed quantities to zero, summed only known spend as a complete total, and used empty rows after errors as successful empty results. Unconfigured service also ended loading without an error.

FILES CHANGED:
volantinipro-final.jsx; src/lib/customerDashboardMetrics.js; src/hooks/useCampagne.js; tests/customer_dashboard_false_zero.render.test.mjs; package.json; this report.

CODE:
PASS

TESTS:
PASS — 33 targeted checks

BUILD:
PASS

RUNTIME:
NOT VERIFIED — no authenticated Customer browser flow executed

PRODUCTION:
NOT VERIFIED — not deployed by this task

ORIGINAL USER SCENARIO:
NOT VERIFIED — physical Samsung and authenticated data unavailable in this verification

REGRESSION:
PARTIAL — targeted dashboard, ownership, session and mobile contracts pass; full suite not executed

PERFORMANCE:
NOT PROVEN — no cold-load before/after measurement

OVERALL:
NOT VERIFIED — implementation and automated validation complete; runtime acceptance remains open
