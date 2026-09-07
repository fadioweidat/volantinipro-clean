# Milano Municipi — Phase B, geometry preview only

Date: 2026-09-07. Audited baseline: c3877bf9d8ae35a4ac9d310d4a8977a69271ee58.
Branch: integration/rc2-full-site. Remote fetched before work and before commit; no peer commits to integrate.

## Source and attribution

Comune di Milano, DS379 — Territorio: superficie dei Municipi.

- Dataset: https://dati.comune.milano.it/dataset/ds379-infogeo-municipi-superficie
- Exact resource: https://dati.comune.milano.it/dataset/36ba21c2-8b48-43ce-bbe1-e236a8a49ff6/resource/99ecd085-0b04-4fb2-a66e-9795694d4fc4/download/ds379_municipi_label.geojson
- License: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- License catalog: https://www.dati.gov.it/node/view-dataset/dataset?id=683cde8b-0706-4f04-bc95-2202a3b00d10
- Reference date 2017-01-13; dataset modification 2019-12-13. Later catalog maintenance does not imply newer boundaries.

Original resource preserved byte-for-byte in public/data/territories/milano-municipi-ds379.geojson (3,447,281 bytes).
SHA-256: 913e39d7c5970e9053c68c07c50cbcda3f154f95904f447fe2ef08b115264581.
Attribution, source and license links are displayed in the preview. Derived bbox, planar centroid and spherical area are explicitly documented; original geometries are unchanged. No demographics inferred.

## Geometry validation

Nine unique source MUNICIPIO values, exactly 1–9; nine Polygon geometries; declared EPSG:4326.
All rings nonempty/closed, coordinates finite and longitude/latitude within Milano bounds.
All bboxes and centroids valid. Independent Shapely validation: all nine valid, no repair.
Area displayed is spherical surface area computed from the source geometry (mean Earth radius 6371008.8 m), not the source's differently measured AREA or Shape_Area attributes.

## Isolation and changed files

- src/lib/geo/territories/territoryTypes.js — geometry validation and presentation metrics.
- src/lib/geo/territories/municipioMilano.js — normalized records, provenance, abortable/timed/cached loader.
- src/pages/public/configurator/step2/TerritoryGeometryPreview.jsx — independent Leaflet map, local preview state, hover/tooltips and keyboard-accessible Municipio buttons.
- src/pages/public/configurator/step2/MilanoGuidance.jsx — import and mount of preview only (three added lines).
- public/data/territories/milano-municipi-ds379.geojson and README.md — original source and attribution.
- tests/territory_geometry_adapters.test.mjs — six test groups covering dataset, malformed geometry, loading/caching, isolation and visibility.
- This report.

The existing Milano visibility gate is reused. Operational Municipio chip remains disabled.
Preview has no campaign props/callbacks. It does not reference campaign state, backend analysis, pricing or the shared map.
Geometry, Leaflet and its CSS load on opening; successful geometry is cached for the page lifetime, failed/aborted reads are not. No hover fetches or polling.
Unavailable/invalid geometry has an explicit state and retry; tile failure leaves boundaries available with a degraded message.

Untouched: Step2.jsx, Step2Map.jsx, useServiceAnalysis, analysis-istat, NIL/CAP/Radius logic, coverage/quantity/pricing, Step 3 gate and DB schema.
Existing package.json/package-lock.json modifications and unrelated untracked WIP were not changed or staged.

## Validation

- Dedicated and protected-flow tests: 75 passed, zero failed (including six new test groups, Milano UX, selection preservation, analysis gate/mapping, Comune, mode state machine and POI fallback).
- Full package test list: 1,801 tests, 1,799 passed, two failed, zero cancelled/skipped. The first npm test invocation did not terminate after assertions. The same package script was rerun with Node --test-force-exit and a 90-second per-file timeout; it completed in 139 seconds without cancellations.
- Both failures are in tests/gps_admin_final_fix.test.mjs: operator count and canonical operator legend assertions. This test and both inspected implementation files, GpsMonitor.jsx and CoverageAdjustmentPanel.jsx, are identical to HEAD. Running this test alone reproduces 24 pass / 2 fail. No unrelated GPS changes applied.
- npm run build: successful after final preview edits (44.67 seconds).
- git diff --check: successful.

## Browser evidence

Chrome headless against the compiled application served locally at http://127.0.0.1:5176/configuratore?step=2, with real territorial backend responses and an isolated browser profile containing synthetic campaign inputs.

- Milano Comune opens the preview; exactly nine SVG polygon paths rendered.
- Municipio 1, 4 and 9 buttons show the matching detail and preserve the saved selection/quantity/coverage fields and CTA.
- Actual pointer hover opens the tooltip; actual polygon click selects Municipio 1 in the preview.
- Closing preview preserves the recorded campaign fields and CTA.
- Bruzzano selected as the sole NIL using the existing UI; preview leaves that selection and the enabled CTA intact.
- Radius flow retains its recorded canonical mode/radius and CTA through preview open/close.
- Varedo loads with no Milano guidance/preview.
- One geometry request across Comune/NIL/Radius opens; zero additional geometry requests during each 20-second idle observation.
- Zero JavaScript page crashes. Existing analytics/local API and POI network errors were recorded; they did not prevent geometry rendering or the tested interactions. This is not a claim of globally error-free networking.

Evidence directory: D:/cloaude volantini/step2-audit-20260906/

- phase-b-runtime-evidence.json — before/after canonical fields, CTA states, geometry request counts and errors.
- phase-b-browser.mjs — reproducible browser assertions.
- phase-b-comune.png, phase-b-nil-bruzzano.png, phase-b-radius.png, phase-b-varedo.png — screenshots.
- phase-b-topology.json — independent topology validation.
- phase-b-targeted-final.log, phase-b-suite-bounded.log, phase-b-gps-baseline.log, phase-b-build.log — test/build evidence.

## Release state

No push or deployment. Production has not been changed or tested with this new preview.
The full suite remains red on the two pre-existing GPS assertions. The preview is read-only; operational Municipio selection, CAP geometry and demographic KPI remain out of scope.
