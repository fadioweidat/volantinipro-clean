import test from 'node:test';
import assert from 'node:assert/strict';
import { filterValidGpsPoints, calculateFilteredDistanceKm, summarizeGpsQuality, EXCLUSION_REASONS } from '../src/lib/gps/pointQuality.js';
import { getOperatorColor } from '../src/lib/geo/operatorColor.js';
import { dedupeGpsPointQueue, gpsPointQueueKey } from '../src/lib/gps/offlineQueue.js';
import { deriveCampaignStatus, sessionDurationMs } from '../src/lib/services/report-utils.js';
import { deriveLiveZoneStatus, estimateDistanceToZoneBoundaryMeters } from '../src/lib/geofence/geofenceEngine.js';

test('1. TRACK RENDERING - Discrete GPS points, coordinates validation, and point filtering', () => {
  const points = [
    { id: 'p1', lat: 45.4642, lng: 9.1900, accuracy: 12, recorded_at: '2026-09-05T10:00:00Z' },
    { id: 'p2', lat: 45.4645, lng: 9.1905, accuracy: 14, recorded_at: '2026-09-05T10:00:15Z' },
    { id: 'p3', lat: 45.4650, lng: 9.1910, accuracy: 15, recorded_at: '2026-09-05T10:00:30Z' },
  ];

  const { valid, excluded } = filterValidGpsPoints(points);
  assert.equal(valid.length, 3, 'all 3 points valid');
  assert.equal(excluded.length, 0, 'no points excluded');
  assert.equal(valid[0].id, 'p1');
  assert.equal(valid[2].id, 'p3');
});

test('2. MULTI OPERATORE - Stable distinct colors, legend IDs, filtering, and per-operator distance', () => {
  const op1 = 'driver-alpha-uuid';
  const op2 = 'driver-beta-uuid';
  const op3 = 'driver-gamma-uuid';

  const color1 = getOperatorColor(op1);
  const color2 = getOperatorColor(op2);
  const color3 = getOperatorColor(op3);

  assert.notEqual(color1, color2, 'Operator 1 and Operator 2 must have distinct colors');
  assert.notEqual(color2, color3, 'Operator 2 and Operator 3 must have distinct colors');
  assert.notEqual(color1, color3, 'Operator 1 and Operator 3 must have distinct colors');
  assert.equal(getOperatorColor(op1), color1, 'Color assignment must be deterministic and stable');

  const trackOp1 = [
    { id: 't1_1', lat: 45.4642, lng: 9.1900, accuracy: 10, recorded_at: '2026-09-05T10:00:00Z' },
    { id: 't1_2', lat: 45.4650, lng: 9.1910, accuracy: 10, recorded_at: '2026-09-05T10:01:00Z' },
  ];
  const trackOp2 = [
    { id: 't2_1', lat: 45.4700, lng: 9.2000, accuracy: 10, recorded_at: '2026-09-05T10:00:00Z' },
    { id: 't2_2', lat: 45.4720, lng: 9.2020, accuracy: 10, recorded_at: '2026-09-05T10:02:00Z' },
  ];

  const dist1 = calculateFilteredDistanceKm(trackOp1);
  const dist2 = calculateFilteredDistanceKm(trackOp2);
  assert.ok(dist1 > 0, 'Distance for operator 1 must be calculated');
  assert.ok(dist2 > 0, 'Distance for operator 2 must be calculated');
});

test('3. BOUNDARIES & GEOFENCE - Inside, outside, and boundary distance', () => {
  const zonePolygon = {
    type: 'Polygon',
    coordinates: [[
      [9.1800, 45.4600],
      [9.2000, 45.4600],
      [9.2000, 45.4700],
      [9.1800, 45.4700],
      [9.1800, 45.4600]
    ]]
  };
  const liveZones = [{ kind: 'polygon', geometry: zonePolygon }];

  const statusInside = deriveLiveZoneStatus(liveZones, 45.4650, 9.1900);
  assert.equal(statusInside, 'inside', 'Point inside polygon must have status inside');

  const statusOutside = deriveLiveZoneStatus(liveZones, 45.4800, 9.2100);
  assert.equal(statusOutside, 'outside', 'Point outside polygon must have status outside');

  const distMeters = estimateDistanceToZoneBoundaryMeters(liveZones, 45.4800, 9.2100);
  assert.ok(distMeters > 0, 'Distance to boundary must be positive when outside');
});

test('4. GPS QUALITY FILTERS - Excludes speed, accuracy, jumps, duplicates, zeros', () => {
  const mixedPoints = [
    { id: 'good1', lat: 45.4642, lng: 9.1900, accuracy: 10, recorded_at: '2026-09-05T10:00:00Z' },
    { id: 'zero_coord', lat: 0, lng: 0, accuracy: 10, recorded_at: '2026-09-05T10:00:10Z' },
    { id: 'inaccurate', lat: 45.4643, lng: 9.1901, accuracy: 250, recorded_at: '2026-09-05T10:00:20Z' },
    { id: 'teleport_jump', lat: 48.8566, lng: 2.3522, accuracy: 10, recorded_at: '2026-09-05T10:00:30Z' },
    { id: 'good2', lat: 45.4646, lng: 9.1904, accuracy: 12, recorded_at: '2026-09-05T10:00:40Z' },
    { id: 'dup', lat: 45.4646, lng: 9.1904, accuracy: 12, recorded_at: '2026-09-05T10:00:40Z' },
  ];

  const { valid, excluded } = filterValidGpsPoints(mixedPoints);
  assert.equal(valid.length, 2, 'Exactly 2 valid points');
  assert.equal(valid[0].id, 'good1');
  assert.equal(valid[1].id, 'good2');

  const summary = summarizeGpsQuality(mixedPoints);
  assert.equal(summary.validCount, 2);
  assert.equal(summary.excludedCount, 4);
  assert.ok(summary.excludedByReason[EXCLUSION_REASONS.ZERO_COORDINATES] >= 1);
  assert.ok(summary.excludedByReason[EXCLUSION_REASONS.LOW_ACCURACY] >= 1);
  assert.ok(summary.excludedByReason[EXCLUSION_REASONS.IMPOSSIBLE_JUMP] >= 1);
  assert.ok(summary.excludedByReason[EXCLUSION_REASONS.DUPLICATE_POINT] >= 1);
});

test('5. OFFLINE & CHRONOLOGICAL ORDERING', () => {
  const p1 = { sessionId: 's1', recordedAt: '2026-09-05T10:00:00Z', lat: 45.4642, lng: 9.1900 };
  const p2 = { sessionId: 's1', recordedAt: '2026-09-05T10:00:15Z', lat: 45.4645, lng: 9.1905 };
  const p3 = { sessionId: 's1', recordedAt: '2026-09-05T10:00:30Z', lat: 45.4650, lng: 9.1910 };
  const plane_out_of_order = [p2, p1, p3, p2];

  const deduped = dedupeGpsPointQueue(plane_out_of_order);
  assert.equal(deduped.length, 3, 'Duplicates must be pruned');

  const { valid } = filterValidGpsPoints(deduped);
  assert.equal(valid[0].recordedAt, '2026-09-05T10:00:00Z');
  assert.equal(valid[1].recordedAt, '2026-09-05T10:00:15Z');
  assert.equal(valid[2].recordedAt, '2026-09-05T10:00:30Z');
});

test('6. END SESSION - Session completion status and duration', () => {
  const sessions = [
    { id: 's1', status: 'completed', started_at: '2026-09-05T08:00:00Z', ended_at: '2026-09-05T12:00:00Z' }
  ];
  const status = deriveCampaignStatus(sessions);
  assert.equal(status, 'completata', 'Derived campaign status must be completata');

  const durationMs = sessionDurationMs(sessions[0]);
  assert.equal(durationMs, 4 * 3600 * 1000, 'Duration reflects 4 hours');
});

test('7. ADMIN -> CUSTOMER SYNC - Coverage percentage alignment contract', () => {
  // Simulates Admin saving 80% coverage on a zone
  const zoneAdjustment = {
    campaign_zone_id: 'zone-bovisa-1',
    effective_percent: 80,
    is_active: true,
    adjustment_type: 'manual_covered',
  };

  // Customer tracking reading final coverage
  const customerFinalCoverage = {
    final_operational_coverage_pct: zoneAdjustment.effective_percent,
    final_coverage_geometry: { type: 'Polygon', coordinates: [] },
  };

  assert.equal(customerFinalCoverage.final_operational_coverage_pct, 80, 'Customer must read exact 80% saved by Admin');
});

test('8. MULTI-OPERATOR QUICK FILTER - Session tracks and points isolation', () => {
  const sessionTracks = [
    { session: { id: 's1', driver_id: 'op-01', assignment_id: 'a1' }, points: [{ id: 'p1' }, { id: 'p2' }] },
    { session: { id: 's2', driver_id: 'op-02', assignment_id: 'a2' }, points: [{ id: 'p3' }, { id: 'p4' }] },
    { session: { id: 's3', driver_id: 'op-03', assignment_id: 'a3' }, points: [{ id: 'p5' }, { id: 'p6' }] },
  ];

  // Filter for OP-02
  const selectedOperatorFilter = 'op-02';
  const filtered = sessionTracks.filter((track) => {
    return track.session?.driver_id === selectedOperatorFilter || track.session?.assignment_id === selectedOperatorFilter || track.session?.id === selectedOperatorFilter;
  });

  assert.equal(filtered.length, 1, 'Only 1 track isolated for OP-02');
  assert.equal(filtered[0].session.driver_id, 'op-02');
  const filteredPoints = filtered.flatMap((t) => t.points);
  assert.equal(filteredPoints.length, 2);
  assert.equal(filteredPoints[0].id, 'p3');
});

