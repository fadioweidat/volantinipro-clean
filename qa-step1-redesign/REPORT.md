# Step 1 — redesign and acceptance report

BASE HEAD: a92aa35242945f458d3cd7b23f56ad06933cb4eb
UI COMMIT: 95e01838a627827d2ce574767b43ae815453bda7
BRANCH: integration/rc2-full-site

## Implementation
The existing Step1 component now follows the reference structure: repository logo, green horizontal stepper, hero, compact numbered configuration panels, three service cards, sticky desktop summary, collapsed mobile summary and a full-width orange final CTA with live choices. AppRouter suppresses its duplicate stepper only on Step 1. Other steps retain the existing shared stepper.

Source files modified:
- src/pages/public/configurator/Step1.jsx
- src/app/AppRouter.jsx (one Step-1-only presentation condition)

Source files created:
- src/pages/public/configurator/step1-reference.css

Evidence files: BASELINE.md, REPORT.md, runtime.mjs, runtime-summary.json, conditional-runtime.json and final desktop/Samsung/iPhone screenshots in this directory. Full command logs remain in this directory locally.

BUSINESS LOGIC CHANGED: NO
PRICING CHANGED: NO
STEP2-4 CHANGED: NO
DB/MIGRATIONS CHANGED: NO

No functional differences were introduced. The complete existing pre-render state/handler/validation/pricing region was compared byte-for-byte to BASE HEAD, excluding only new read-only summary derivations. Existing form callbacks, enum values, quantity bounds, date controls, print flags and handleContinue are retained. No tests were modified for this task.

Differences from the reference are intentional: original repository logo and fonts; real plan discounts 3/5/8; actual urgency premiums; existing required service/sector selection; date pickers remain conditional on the custom period; Punti Vetrina and H2H/B2B operational options remain available. No decorative skyline was copied. B2B keeps its own operational sections and validation instead of forcing the residential seven-section flow.

## Verification
- Baseline build: PASS.
- Baseline targeted tests: PASS, 104 tests.
- Final build: PASS.
- Final targeted tests: PASS, 108 tests, including router contracts.
- npm test: PASS, 1,837 tests, zero failures.
- npm run test:all: see final outcome below. This command excludes seven standalone browser scripts by its existing configuration.

Runtime at http://localhost:5175/configuratore, anonymous role, real application and React state, Chrome headless:
- Desktop 1440x900: PASS; document scroll width 1440.
- Samsung-like 412x915: PASS; document scroll width 412; visible text inputs 16px.
- iPhone-like 390x844: PASS; document scroll width 390; visible text inputs 16px.
- Selected Door to Door and Ristorazione; changed quantity, DL format, period, urgency and recurring plan; enabled printing and disabled it again; returned to A5/10,000/Standard/Singola; verified live summary and enabled CTA.
- Existing Continue handler reached Step 2 on all three viewports. Canonical fields preserved: type, selectedService, activityType, businessSector, qty, flyerQuantity, flyerFormat, printing, extraServices, urgency, subscription, campaignPeriodPreset, startDate, endDate and planDiscount.
- Hand to Hand and Business operational panels opened at all three widths without horizontal overflow or page errors. Their full geocoding/operational submissions were not exercised.
- Runtime reports contain zero JavaScript page errors. Screenshots inspected for hierarchy, selected cards, responsive layout and CTA.
- Baseline visual was reconstructed from BASE HEAD after the initial capture used /preventivo (service center). See BASELINE.md for that limitation.

The broader working tree already contained unrelated supplier/admin changes and five local commits. They were preserved; unrelated working files were not staged. Test results refer to this shared working tree. The requested push also published those five pre-existing commits already on the current branch.

VERCEL DEPLOY: PENDING — GitHub returned no deployment status for the UI commit. Production runtime has not been verified.
PERFORMANCE: NOT APPLICABLE — no performance improvement claim.
OVERALL: PARTIALLY VERIFIED — local Step 1 acceptance passed; production and full external-service regression are not verified.

## Full-suite final outcome
TEST:ALL: FAIL — 2,696 passed / 2,709 tests, 13 failed across 3 of 7 batches (256 test files executed).
- ai_action_executions_migration.test.mjs: 4 failures, network EACCES/fetch failed.
- ai_admin_send_message_phase5b.test.mjs: 1 failure, fetch failed during session setup.
- full_supplier_workflow_acceptance.test.mjs: 6 failures beginning with unavailable Supabase responses/user creation, followed by null fixture failures.
- territory_map_sectors_contract.test.mjs: 2 failures (null result vs expected empty FeatureCollection; missing Milano Bruzzano RPC result). These tests and the territory implementation were not changed by this redesign.
No external integration tests were modified, and no elevated live database/message mutations were used to make them pass.

ROOT CAUSE: Existing Step 1 presentation had oversized sections, verbose service cards, duplicate progress bars and a narrow final CTA, differing from the supplied reference.
CODE: PASS
TESTS: FAIL (full suite); targeted and npm test PASS
BUILD: PASS
RUNTIME: PASS (local scope described above)
PRODUCTION: NOT VERIFIED
ORIGINAL USER SCENARIO: PASS (local visual redesign and D2D continuation on all three sizes)
REGRESSION: PARTIAL
PERFORMANCE: NOT APPLICABLE
OVERALL: PARTIALLY VERIFIED
