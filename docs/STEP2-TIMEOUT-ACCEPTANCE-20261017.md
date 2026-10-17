# Step 2: runtime verification, 17 October 2026

Base remote verified twice: `480959efd4ac50ff49539c549aec03df921ef2b8`, branch `fix/customer-dashboard-false-zero-20261011`. Existing local work was preserved in the original checkout. Work took place in a separate detached checkout.

## Reproduction and causal evidence

Anonymous preview, D2D, 10,000, A5, already printed; 390x844 browser viewport, Windows Chromium, **not a physical Samsung**. Search/select Viale Certosa 333, Milano, without selecting a NIL. The initial browser request used the municipality context: lat 45.463945, lng 9.188558, radius 15, analysisLevel=nil, municipality selection 015146. One analysis request, not a hook retry loop, was observed. Browser request `01a14925-d059-7e64-a078-54d225ccd3bf` completed in 2453 ms at the Edge, 88 NIL; sector request was HTTP 200, origin 957 ms. The original timeout was intermittent and did not occur on this first attempt.

The historical 16 October 17:41 UTC trace spends 14781–18377 ms in the PostgREST upstream, not Mapbox tiles. PostgreSQL reports 57014 inside `get_map_sectors` and the comuni call, on sessions created at 17:41:23 and :25. The unrelated periodic database job also slows at this time. This establishes backend contention; it does not identify CPU vs memory vs scheduler as the precise host resource.

Controlled A/B reproduction used two overlapping analyses and their full GeoJSON sector responses, three consecutive rounds. Fixed laboratory centers were (45.504,9.130) and (45.528,9.173), radius 3 km, labelled Certosa/Bruzzano in scripts; these are **not claimed to be exact geocoder coordinates of the original street address**. This reproduces overlapping work during a PV change without changing database records.

| Version / same workload | Analysis min–max | Analysis mean | Sectors min–max | Sector errors |
|---|---:|---:|---:|---:|
| Original v43 code redeployed as v47 | 12989–14680 ms | 13661 ms | 7996–12997 ms | 1/6 SQL 57014 |
| Consolidated v46, first series | 2608–6012 ms | 4635 ms | 992–5162 ms | 0/6 |
| Consolidated v48, confirmation | 2163–4283 ms | 2908 ms | 642–1171 ms | 0/6 |

Baseline error: gateway request `01a14a43-a889-72e7-8e85-4ef352b61270`, HTTP 500, PostgreSQL 57014. The database session was created at 14:28:32 UTC and timed out at 14:28:37.591. Even successful baseline sector calls exceeded the frontend's unchanged 8-second deadline. All successful response hashes match across variants, separately for each point and endpoint. No sectors or POIs were dropped.

Three independent HTTP RPCs open multiple PostgREST database sessions, including newly initialized PostGIS backends after inactivity. Serializing HTTP alone did not solve this: the database still created separate sessions and measured analysis times were 6282/3691/1764 ms. That experiment was immediately rolled back. Consolidating the same reads into one RPC reduces connection checkouts and competing database work per analysis. The A/B error reproduction and reversal support this as a demonstrated contributor, rather than a phone/network attribution. It is not a claim that every millisecond of the historical incident has been uniquely attributed.

## Implementation and contracts

`get_step2_territorial_bundle` calls the existing comuni, NIL (when initially required), and explicit-municipality OMI functions in one database session. It changes no datasets, boundaries, formulas, ordering expressions, or existing function definitions. SECURITY INVOKER; executable only by service_role, verified anon=false/service_role=true. No authentication settings or existing grants changed. Query cancellation is not swallowed. Individual non-cancellation SQL errors preserve their code/message and remain errors, not empty successful arrays.

The Edge request-local adapter shares one promise among the existing consumers. No cross-request cache or global queue, so data cannot cross PV identities. Requests without an explicit municipality retain the original path; a NIL requirement discovered from comuni later still calls the original NIL RPC. Existing frontend stale-response guards, debounce (450 ms), two retries for transient network/502–504 errors, 5-second slow notice, 16-second GIS deadline and 8-second sector deadline are unchanged.

Final deployment: `analysis-istat` **v49**, JWT setting remains false as in v43. Migration version `20261017092404`. v44 was the rejected HTTP-serialization experiment; v45/v47 restored original code for comparison. v46/v48 were consolidation tests. v49 adds explicit correlation/serialization timing; response body remains identical.

`completed` now remains only completion. `rpcOk` and SQL error codes distinguish RPC failure; aggregate phases have rpcOk=null. `ANALYSIS_RPC_TIMING` includes SQL phase durations/status/counts. `X-Analysis-Request-Id` and `Server-Timing` connect client responses with logs. No sensitive payloads are logged.

## Timing decomposition and parity

Final example gateway request `01a14a48-3eb3-787f-bbba-baf8da73bc8f`, analysis ID `0d1f909c-7eb1-4534-80be-abfff9723e9d`:

- Client complete 3365 ms, TTFB 3307 ms, JSON parse 3 ms.
- Edge total 2219 ms, serialization 1 ms, response 284436 bytes.
- Mapbox reverse lookup 18 ms, independent of visible map tiles.
- Consolidated RPC 2194 ms; SQL+internal JSON phases: comuni 410.565 ms, NIL 360.257 ms, OMI 434.431 ms.
- Remaining ~989 ms within RPC includes transport, PostgREST, checkout/startup and outer serialization; **not independently separable as connection wait alone with the available telemetry**.

Complete comuni SQL including json_agg: planning 228.034 ms, execution 194.035 ms, 62 rows, indexed scan. Full sector RPC at test point/radius 2.5 km: planning 0.088 ms, execution 150.612 ms, 8 features/5867 bytes over HTTP; this measures the GeoJSON result, not just IDs. Bundle internal response sizes: comuni 93077, NIL 134742, OMI 449252 bytes. No justification for deleting polygons to reduce loading time was found.

Exact SQL JSON equality verified for all three functions at radii 0, 0.5, 3 and 15 km. Final full analysis responses (including 88 NIL) retain SHA256 `df8fa0ebbd0d3196f8d51662bb1dcd8382289dd3133214680523d6e92d09c1ff` and 284436 bytes throughout baseline/serial/bundle/final runs.

Single-request baseline: 4031/1802/828 ms; second baseline 3330/2528/793 ms. Consolidated first run 3711/1033/1055 ms; after approximately five hours of test inactivity 4371/2864/1433 ms. Final v49: 3365/2538/5082 ms. These variable single-request samples alone do **not** prove a universal speedup; the controlled overlap A/B is the useful evidence. An unchanged warning remains: server Mapbox reverse lookup returns MAPBOX_403. Map tiles load, and territorial data succeeds. No timeout thresholds were increased.

Direct anonymous comuni/NIL probes return [] under existing RLS. They are retained in the raw timings for transparency and **excluded** from service-role SQL performance conclusions. SQL comparison uses the full functions and Edge uses the service-role path as before.

## Browser and validation

- Original Certosa selection reached “Come vuoi distribuire a Milano?” and identified MAGGIORE - MUSOCCO - CERTOSA without manual NIL selection; map and POIs rendered, no console errors in inspected snapshots.
- Raggio 3 km at the geocoded address: 104391 families, 114722 recommended, 5 comuni, 17 NIL, 28.3 km².
- Added PV2 and selected Bruzzano: 6840 families, 7524 recommended, 1.7 km².
- Returned to PV1: correct original Certosa radius values. Returned to PV2: correct Bruzzano values, never Certosa values. During the initial switch frame the existing UI briefly says “Dato non disponibile” before completing; this unrelated presentation behavior was not concealed or treated as zero.
- 63 targeted automated regressions passed, plus final bundle/pipeline tests (4 runner tests, pipeline includes 20 assertions). Production build passed. Existing React act/deprecation warnings were present in tests.
- Browser viewport testing is not a real Samsung test. Screenshot capture intermittently failed in the browser tool; acceptance evidence is DOM snapshots plus correlated live API/database logs, not fabricated screenshots. No repeated screenshot request was sent to the user.

Raw responses remain in local `review-artifacts/step2-timeout/`; timing manifests are committed. No payment, GPS, pricing, auth or production business records were changed.

ROOT CAUSE:
Concurrent RPC fan-out and fresh database backends amplified PostgREST/database contention; A/B reproduced 57014 and reversed it by consolidating identical reads. Exact CPU/memory/connection-wait proportions remain unmeasured.

FILES CHANGED:
Edge index/adapter, one service-only RPC migration, adapter tests, benchmark scripts, timing manifests and this report.

CODE:
PASS

TESTS:
PASS

BUILD:
PASS

RUNTIME:
PASS (390x844 desktop browser viewport, not Samsung)

PRODUCTION:
PASS (live shared backend, measured scenarios)

ORIGINAL USER SCENARIO:
NOT VERIFIED on physical Samsung; browser viewport equivalent completed

REGRESSION:
PARTIAL (tested Step 2 flows and targeted tests, not unrelated product flows)

PERFORMANCE:
PASS for measured overlapping workload; no universal latency guarantee

OVERALL:
PARTIALLY VERIFIED
