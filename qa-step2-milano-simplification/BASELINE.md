# Step 2 Milano UX simplification — baseline

BASE HEAD: 6cf46dd59f0b396a903254f9bdea306e0ae7ea9d
Branch integration/rc2-full-site; fetched origin at 9f087b7. Two existing local review-workflow commits preserved. Working tree clean before this ticket.
Baseline build PASS; targeted Step2 tests 32/32 PASS.

## Runtime reproduction before edits
Anonymous customer, http://localhost:5176/configuratore?step=2&service=d2d&qty=10000, desktop 1440x900. Typed Via Antonio Oroboni, Milano into the existing search input and clicked a real geocoder result. No API responses were mocked.
Milano municipality and address point resolved; canonical API returned 88 NIL. Diagnostic state: areaMode unconfirmed_address, selectedNils [], containingNil BRUZZANO, selZonesCount 1 (preview), hasConfirmedCoverageMode false, canContinueCalendar false.
Actual UI incorrectly presents that preview as “1 zona selezionata”, with coverage metrics, MilanoGuidance, address context, CoverageModeSwitcher, address-decision card and coverage-quantity section all competing. See baseline-oroboni.png, baseline-oroboni.txt and baseline-state.json.

## Existing contracts / firewall
Step2.jsx remains owner of state: searchMode, nilManualMode, selected, selectedSearchPoint, addressFullCoverageConfirmed, coverageAddress and quantity/coverage fields. No duplicate business state.
Keep apiZones as complete canonical NIL search dataset. Keep selZones, allocation, coverage formulas, pricing, geocoding, Supabase, DB, payloads, Step3/4 unchanged.
Reuse switchToComuneMode, switchToRadiusMode, enterNilManualMode, toggleNilZone, updateActiveRadius, selectCoverageQuantityDecision, updateManualFlyersQuantity and handleNext.
Minimal explicit-selection guards may be needed when entering manual NIL mode: do not inherit automatic all-NIL selection from the previous radius/comune mode. These are UI selection transitions, not formula changes.
Only the residential Milano customer view is reorganized; other comuni, CAP, H2H/B2B and advanced-report core remain on their existing flows.
