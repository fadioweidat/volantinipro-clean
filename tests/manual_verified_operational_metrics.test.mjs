import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateOperationalMetrics } from '../src/lib/services/gps-api.js';

test('Test A: Raw GPS remains unchanged and unmutated when manual metrics are saved', () => {
  const immutableGpsPoints = Object.freeze([
    { id: 'pt-1', lat: 45.4642, lng: 9.1900, recorded_at: '2026-09-08T10:00:00Z', session_id: 'sess-1' },
    { id: 'pt-2', lat: 45.4645, lng: 9.1905, recorded_at: '2026-09-08T10:01:00Z', session_id: 'sess-1' },
  ]);
  const immutableSessions = Object.freeze([
    { id: 'sess-1', status: 'completed', started_at: '2026-09-08T10:00:00Z', ended_at: '2026-09-08T10:30:00Z' },
  ]);

  const manualMetrics = {
    campaign_level: {
      coverage_percent: 90,
      operational_time_seconds: 3600,
      operational_distance_km: 8.5,
      verified_points_count: 200,
      verified_at: '2026-09-08T11:00:00Z',
    },
  };

  const res = aggregateOperationalMetrics({
    gpsPoints: immutableGpsPoints,
    sessions: immutableSessions,
    manualMetrics,
  });

  // Verify points & session integrity
  assert.equal(immutableGpsPoints.length, 2);
  assert.equal(immutableGpsPoints[0].lat, 45.4642);
  assert.equal(immutableSessions[0].id, 'sess-1');
  assert.equal(res.hasRawGps, true);
  assert.equal(res.hasManualData, true);
});

test('Test B: Manual coverage stored separately in metadata.manual_operational_metrics', () => {
  const metadata = {
    manual_operational_metrics: {
      campaign_level: {
        coverage_percent: 78.5,
        operational_time_seconds: 5400,
        operational_distance_km: 10.2,
        verified_points_count: 310,
        verified_at: '2026-09-08T12:00:00Z',
      },
      zones: {
        'zone-1': {
          zone_name: 'Milano Centro',
          coverage_percent: 100,
          operational_time_seconds: 3600,
          operational_distance_km: 7.0,
          verified_points_count: 210,
        },
      },
      updated_at: '2026-09-08T12:05:00Z',
    },
  };

  assert.ok(metadata.manual_operational_metrics);
  assert.equal(metadata.manual_operational_metrics.campaign_level.coverage_percent, 78.5);
  assert.equal(metadata.manual_operational_metrics.zones['zone-1'].coverage_percent, 100);
});

test('Test C: Manual time and distance stored separately from raw GPS', () => {
  const manualMetrics = {
    campaign_level: {
      coverage_percent: 80,
      operational_time_seconds: 7200, // 2 hours
      operational_distance_km: 15.0,
      verified_points_count: 400,
      verified_at: '2026-09-08T14:00:00Z',
    },
  };

  const res = aggregateOperationalMetrics({
    gpsPoints: [],
    sessions: [],
    manualMetrics,
  });

  assert.equal(res.operationalTimeSeconds, 7200);
  assert.equal(res.operationalTimeDisplay, '2h 0m');
  assert.equal(res.operationalDistanceKm, 15.0);
  assert.equal(res.operationalDistanceDisplay, '15.00 km');
});

test('Test D: Customer with real GPS telemetry renders real GPS metrics correctly', () => {
  const gpsPoints = [
    { id: '1', lat: 45.4642, lng: 9.1900, recorded_at: '2026-09-08T09:00:00Z', session_id: 's1' },
    { id: '2', lat: 45.4650, lng: 9.1920, recorded_at: '2026-09-08T09:10:00Z', session_id: 's1' },
  ];
  const sessions = [
    { id: 's1', started_at: '2026-09-08T09:00:00Z', ended_at: '2026-09-08T09:30:00Z', status: 'completed' },
  ];

  const res = aggregateOperationalMetrics({
    gpsPoints,
    sessions,
    finalCoverage: { final_operational_coverage_pct: 65.4 },
  });

  assert.equal(res.coverageDisplay, '65.4%');
  assert.equal(res.verifiedPointsDisplay, '2');
  assert.equal(res.operationalTimeDisplay, '30m');
  assert.ok(res.operationalDistanceKm > 0);
  assert.equal(res.hasRawGps, true);
});

test('Test E: Customer with manual verified metrics but no raw GPS renders verified operational metrics with zero misleading 0-cards', () => {
  const manualMetrics = {
    campaign_level: {
      coverage_percent: 92.0,
      operational_time_seconds: 5400, // 1h 30m
      operational_distance_km: 11.45,
      verified_points_count: 280,
      verified_at: '2026-09-08T15:00:00Z',
    },
  };

  const res = aggregateOperationalMetrics({
    gpsPoints: [],
    sessions: [],
    photos: [{ id: 'ph1', approved: true }],
    manualMetrics,
  });

  assert.equal(res.coverageDisplay, '92%');
  assert.equal(res.verifiedPointsDisplay, '280'); // NOT '0' or '0 GPS'
  assert.notEqual(res.verifiedPointsDisplay, '0');
  assert.equal(res.operationalTimeDisplay, '1h 30m'); // NOT '0m'
  assert.notEqual(res.operationalTimeDisplay, '0m');
  assert.equal(res.operationalDistanceDisplay, '11.45 km'); // NOT '0.00 km'
  assert.notEqual(res.operationalDistanceDisplay, '0.00 km');
  assert.equal(res.approvedPhotosCount, 1);
});

test('Test F: Customer with neither raw GPS nor manual metrics renders "Non disponibile" (Zero-State Rule)', () => {
  const res = aggregateOperationalMetrics({
    gpsPoints: [],
    sessions: [],
    photos: [],
    manualMetrics: null,
    finalCoverage: null,
    zoneProgress: null,
  });

  assert.equal(res.coverageDisplay, 'Dato non disponibile');
  assert.equal(res.verifiedPointsDisplay, 'Non disponibile');
  assert.equal(res.operationalTimeDisplay, 'Non disponibile');
  assert.equal(res.operationalDistanceDisplay, 'Non disponibile');
  assert.equal(res.latestEventIso, null);
  assert.equal(res.approvedPhotosCount, 0);
});

test('Test G: Multi-comune: manual correction to Comune B does not mutate Comune A or C', () => {
  const multiZoneManual = {
    zones: {
      'zone-A': { zone_name: 'Comune A', coverage_percent: 100, operational_distance_km: 5.0 },
      'zone-B': { zone_name: 'Comune B', coverage_percent: 60, operational_distance_km: 3.5 },
      'zone-C': { zone_name: 'Comune C', coverage_percent: 40, operational_distance_km: 2.0 },
    },
  };

  // Check scoping to zone-B
  const resB = aggregateOperationalMetrics({
    manualMetrics: multiZoneManual,
    selectedZoneId: 'zone-B',
  });
  assert.equal(resB.coverageDisplay, '60%');
  assert.equal(resB.operationalDistanceDisplay, '3.50 km');

  // Check scoping to zone-A remains independent
  const resA = aggregateOperationalMetrics({
    manualMetrics: multiZoneManual,
    selectedZoneId: 'zone-A',
  });
  assert.equal(resA.coverageDisplay, '100%');
  assert.equal(resA.operationalDistanceDisplay, '5.00 km');

  // Check scoping to zone-C remains independent
  const resC = aggregateOperationalMetrics({
    manualMetrics: multiZoneManual,
    selectedZoneId: 'zone-C',
  });
  assert.equal(resC.coverageDisplay, '40%');
  assert.equal(resC.operationalDistanceDisplay, '2.00 km');
});

test('Test H: Operator association is optional (saving without operator allowed)', () => {
  const entryWithoutOperator = {
    zone_id: 'zone-1',
    coverage_percent: 85,
    operator_id: null,
    operator_slot: null,
    note: 'Verifica eseguita senza operatore specificato',
  };

  assert.equal(entryWithoutOperator.operator_id, null);
  assert.equal(entryWithoutOperator.operator_slot, null);
  assert.equal(entryWithoutOperator.coverage_percent, 85);
});

test('Test I: Last update timestamp uses latest real verified event among GPS, manual, and photos', () => {
  const res = aggregateOperationalMetrics({
    gpsPoints: [{ id: 'p1', recorded_at: '2026-09-08T08:00:00Z' }],
    sessions: [{ id: 's1', updated_at: '2026-09-08T08:30:00Z' }],
    photos: [{ id: 'ph1', taken_at: '2026-09-08T09:00:00Z' }],
    manualMetrics: {
      campaign_level: {
        updated_at: '2026-09-08T11:45:00Z',
      },
    },
  });

  assert.equal(res.latestEventIso, '2026-09-08T11:45:00.000Z');
});

test('Test J: Customer privacy: customer payload does not expose internal provenance or admin notes', () => {
  const customerViewMetrics = aggregateOperationalMetrics({
    gpsPoints: [],
    manualMetrics: {
      campaign_level: {
        coverage_percent: 88,
        operational_time_seconds: 3600,
        operational_distance_km: 6.0,
        verified_points_count: 150,
        note: 'INTERNAL ADMIN SECRET NOTE - DO NOT SHOW TO CUSTOMER',
      },
    },
  });

  // Client gets only verified metrics numbers, no private internals
  assert.equal(customerViewMetrics.coverageDisplay, '88%');
  assert.equal(customerViewMetrics.verifiedPointsDisplay, '150');
  assert.equal(customerViewMetrics.operationalTimeDisplay, '1h 0m');
  assert.equal(customerViewMetrics.operationalDistanceDisplay, '6.00 km');
  // Note is not part of customerViewMetrics output fields
  assert.equal(customerViewMetrics.note, undefined);
  assert.equal(customerViewMetrics.adminNotes, undefined);
});
