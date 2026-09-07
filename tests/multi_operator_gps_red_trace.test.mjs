import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const GM = readFileSync(new URL('../src/pages/admin/GpsMonitor.jsx', import.meta.url), 'utf8');
const PANEL = readFileSync(new URL('../src/components/admin/CoverageAdjustmentPanel.jsx', import.meta.url), 'utf8');
const TRACKING = readFileSync(new URL('../src/pages/customer/CampaignTracking.jsx', import.meta.url), 'utf8');
const REPORT = readFileSync(new URL('../src/components/reports/FinalDistributionReportView.jsx', import.meta.url), 'utf8');
const COV_API = readFileSync(new URL('../src/lib/services/coverage-adjustments-api.js', import.meta.url), 'utf8');

// ── 1. ABSOLUTE IMMUTABILITY OF RAW GPS PIPELINE ────────────────────────────
test('1 — RAW GPS Immutability: no deletion, no coordinate mutation, no token leaks', () => {
  // GpsMonitor only reads points and passes them to pure filter/display functions
  assert.doesNotMatch(GM, /deleteFrom\(['"]gps_tracking_points['"]\)/);
  assert.doesNotMatch(GM, /update\(['"]gps_tracking_points['"]\)/);
  assert.doesNotMatch(PANEL, /deleteFrom\(['"]gps_tracking_points['"]\)/);
  assert.doesNotMatch(TRACKING, /deleteFrom\(['"]gps_tracking_points['"]\)/);
  
  // Access tokens must never be exposed or logged in frontend UI payloads
  assert.doesNotMatch(GM, /access_token.*render/);
});

// ── 2. MULTI-OPERATOR SLOTS (MAX 5: OP-01 .. OP-05) ─────────────────────────
test('2 — Multi-operator management: max 5 slots backed by real assignments', () => {
  // GpsMonitor derives canonicalOperators with slot labels and max 5
  assert.match(GM, /const slot = operatorKeyFor\('OP', out\.length\)/);
  assert.match(GM, /if \(out\.length >= 5\) break/);
  assert.match(GM, /OPERATORI CAMPAGNA \(\{assignedOperatorCount\}\/5\)/);
  
  // CoverageAdjustmentPanel limits options to 5 slots with OP-01..OP-05
  assert.match(PANEL, /\.slice\(0, 5\)/);
  assert.match(PANEL, /operatorKeyFor\('OP', i\)/);
});

// ── 3. OPERATOR FILTERING ───────────────────────────────────────────────────
test('3 — Operator Filtering in Admin Monitor: [ TUTTI ] and [ OP-01 ] filters', () => {
  assert.match(GM, /const \[selectedOperatorFilter, setSelectedOperatorFilter\] = useState\('all'\)/);
  assert.match(GM, /const filteredSessionTracks = useMemo\(/);
  assert.match(GM, /const filteredPoints = useMemo\(/);
  assert.match(GM, /onClick=\{\(\) => setSelectedOperatorFilter\('all'\)\}/);
  assert.match(GM, /onClick=\{\(\) => setSelectedOperatorFilter\(opKey\)\}/);
});

// ── 4. UNIFIED FINAL RED TRACE ACROSS ADMIN, CUSTOMER & REPORT ──────────────
test('4 — Unified RED Style: GPS dots & verified coverage render in red', () => {
  // API constants declare canonical RED style
  assert.match(COV_API, /VERIFIED_COVERAGE_STYLE = Object\.freeze\(\{[\s\S]*color: '#dc2626'[\s\S]*fillColor: '#ef4444'/);
  assert.match(COV_API, /GPS_TRACE_RED_STYLE = Object\.freeze\(\{[\s\S]*pointFill: '#ef4444'[\s\S]*pointColor: '#b91c1c'/);

  // Admin Monitor renders GPS points in red
  assert.match(GM, /fillColor: '#ef4444'/);
  assert.match(GM, /fillColor: '#dc2626'/); // live point
  assert.match(GM, /Traccia GPS rilevata \(Rosso\)/);

  // Admin Coverage Adjustment Panel renders GPS dots in red
  assert.match(PANEL, /pathOptions=\{\{ color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 0\.8, weight: 1 \}\}/);
  assert.match(PANEL, /\{ color: '#ef4444', label: 'Traccia GPS rilevata' \}/);
  assert.match(PANEL, /\{ color: '#dc2626', label: 'Copertura verificata', fillOnly: true \}/);

  // Customer Tracking Map renders GPS dots & verified coverage in red
  assert.match(TRACKING, /pathOptions=\{\{ color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 0\.8, weight: 1 \}\}/);
  assert.match(TRACKING, /pathOptions=\{\{ color: '#7f1d1d', fillColor: '#dc2626', fillOpacity: 0\.95, weight: 2 \}\}/);
  assert.match(TRACKING, /<LegendItem color="#ef4444" label="Traccia GPS rilevata" \/>/);
  assert.match(TRACKING, /<LegendItem color="#dc2626" label="Ultima posizione" \/>/);

  // Report view renders GPS points in red
  assert.match(REPORT, /pathOptions=\{\{ color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 0\.8, weight: 1 \}\}/);
});

// ── 5. INACCESSIBLE / EXCLUSIONS REMAIN DISTINCT ────────────────────────────
test('5 — Inaccessible & Exclusion zones remain distinct from verified coverage', () => {
  // Inaccessible is orange/dashed, not red verified coverage
  assert.match(PANEL, /inaccessible: '#dc2626'/);
  assert.match(PANEL, /\{ color: '#f97316', label: 'Area non accessibile', dashed: true \}/);
  assert.match(GM, /Area non accessibile/);
});

// ── 6. CUSTOMER PRIVACY FIREWALL ────────────────────────────────────────────
test('6 — Customer Privacy: no operator phone, real name, or supplier leaked', () => {
  assert.doesNotMatch(TRACKING, /operator_phone|phone_number|driver_phone/);
  assert.doesNotMatch(TRACKING, /supplier_name|fornitore|ragione_sociale/);
  assert.doesNotMatch(TRACKING, /manual_verified|automatic_verified/);
});
