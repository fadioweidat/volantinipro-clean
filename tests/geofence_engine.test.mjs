import assert from "node:assert/strict";
import test from "node:test";

import {
  GEOFENCE_EXIT_MIN_DURATION_MS,
  GEOFENCE_RETURN_MIN_DURATION_MS,
  GEOFENCE_STALE_AFTER_MS,
  applyStaleness,
  createGeofenceState,
  evaluateGeofencePoint,
  isPointInAnyZone,
  normalizeZonesFromCampaign,
  summarizeGeofencePoints,
} from "../src/lib/geofence/geofenceEngine.js";

const CENTER = { lat: 45.4642, lng: 9.19 };
const CIRCLE_ZONES = [{ kind: "circle", centerLat: CENTER.lat, centerLng: CENTER.lng, radiusKm: 1 }];

// Quadrato ~2.2km di lato attorno al centro (poligono GeoJSON, lng/lat).
const SQUARE_RING = [
  [9.18, 45.454],
  [9.20, 45.454],
  [9.20, 45.474],
  [9.18, 45.474],
  [9.18, 45.454],
];
const POLYGON_ZONES = [{ kind: "polygon", geometry: { type: "Polygon", coordinates: [SQUARE_RING] } }];

const START_MS = Date.parse("2026-07-30T10:00:00.000Z");

function pointAt(offsetMs, overrides = {}) {
  return {
    lat: CENTER.lat,
    lng: CENTER.lng,
    accuracy: 15,
    recordedAt: new Date(START_MS + offsetMs).toISOString(),
    ...overrides,
  };
}

function feed(points, zones) {
  let state = createGeofenceState();
  for (const point of points) {
    state = evaluateGeofencePoint(state, point, zones);
  }
  return state;
}

test("normalizeZonesFromCampaign", async (t) => {
  await t.test("legge campaign.metadata.campaign_zones (forma reale campagne legacy)", () => {
    const zones = normalizeZonesFromCampaign({ metadata: { campaign_zones: [{ center_lat: 1, center_lng: 2, radius_km: 3 }] } });
    assert.equal(zones.length, 1);
    assert.equal(zones[0].kind, "circle");
  });

  await t.test("legge campaign.campaignZones e campaign.zones come fallback difensivo", () => {
    assert.equal(normalizeZonesFromCampaign({ campaignZones: [{ center_lat: 1, center_lng: 2, radius_km: 3 }] }).length, 1);
    assert.equal(normalizeZonesFromCampaign({ zones: [{ center_lat: 1, center_lng: 2, radius_km: 3 }] }).length, 1);
  });

  await t.test("nessuna zona disponibile -> array vuoto, mai un errore", () => {
    assert.deepEqual(normalizeZonesFromCampaign(null), []);
    assert.deepEqual(normalizeZonesFromCampaign({}), []);
    assert.deepEqual(normalizeZonesFromCampaign({ metadata: {} }), []);
  });

  await t.test("zone senza geometria e senza cerchio valido vengono scartate", () => {
    const zones = normalizeZonesFromCampaign({ metadata: { campaign_zones: [{ zone_label: "solo nome" }] } });
    assert.deepEqual(zones, []);
  });

  await t.test("preferisce geometry_geojson quando presente rispetto al cerchio", () => {
    const zones = normalizeZonesFromCampaign({
      metadata: { campaign_zones: [{ geometry_geojson: { type: "Polygon", coordinates: [SQUARE_RING] }, center_lat: 1, center_lng: 2, radius_km: 3 }] },
    });
    assert.equal(zones[0].kind, "polygon");
  });
});

test("isPointInAnyZone", async (t) => {
  await t.test("nessuna zona utilizzabile -> null (fallback zona assente)", () => {
    assert.equal(isPointInAnyZone([], CENTER.lat, CENTER.lng), null);
  });

  await t.test("punto dentro il cerchio -> true; punto lontano -> false", () => {
    assert.equal(isPointInAnyZone(CIRCLE_ZONES, CENTER.lat, CENTER.lng), true);
    assert.equal(isPointInAnyZone(CIRCLE_ZONES, CENTER.lat + 1, CENTER.lng + 1), false);
  });
});

test("evaluateGeofencePoint: punto dentro zona", () => {
  const state = feed(
    [pointAt(0, { lat: CENTER.lat, lng: CENTER.lng }), pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 1000, { lat: CENTER.lat, lng: CENTER.lng })],
    CIRCLE_ZONES,
  );
  assert.equal(state.status, "inside");
});

test("evaluateGeofencePoint: punto fuori zona confermato", () => {
  const farLat = CENTER.lat + 1;
  const state = feed(
    [
      pointAt(0, { lat: farLat }),
      pointAt(20000, { lat: farLat }),
      pointAt(GEOFENCE_EXIT_MIN_DURATION_MS + 1000, { lat: farLat }),
    ],
    CIRCLE_ZONES,
  );
  assert.equal(state.status, "outside");
});

test("evaluateGeofencePoint: punto sul confine del poligono e' trattato come dentro", () => {
  const boundaryPoint = { lat: SQUARE_RING[0][1], lng: SQUARE_RING[0][0] };
  const state = feed(
    [pointAt(0, boundaryPoint), pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 1000, boundaryPoint)],
    POLYGON_ZONES,
  );
  assert.equal(state.status, "inside");
});

test("evaluateGeofencePoint: accuracy scarsa viene ignorata (nessun contributo al debounce)", () => {
  const state1 = createGeofenceState();
  const state2 = evaluateGeofencePoint(state1, pointAt(0, { accuracy: 250 }), CIRCLE_ZONES);
  assert.equal(state2, state1, "un punto con accuracy scarsa non deve modificare lo stato");
});

test("evaluateGeofencePoint: GPS jitter (dentro/fuori alternati) non conferma mai una transizione", () => {
  const farLat = CENTER.lat + 1;
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    points.push(pointAt(i * 20000, { lat: i % 2 === 0 ? CENTER.lat : farLat }));
  }
  const state = feed(points, CIRCLE_ZONES);
  assert.equal(state.status, "unknown", "il jitter al confine non deve mai produrre un allarme");
  assert.equal(state.events.length, 0);
});

test("evaluateGeofencePoint: uscita breve (sotto soglia) non genera alert", () => {
  const farLat = CENTER.lat + 1;
  const state = feed(
    [
      pointAt(0, { lat: CENTER.lat }),
      pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 1000, { lat: CENTER.lat }), // conferma 'inside'
      pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 2000, { lat: farLat }),
      pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 4000, { lat: farLat }), // solo 2 punti fuori, sotto soglia dei 3
      pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 6000, { lat: CENTER.lat }),
    ],
    CIRCLE_ZONES,
  );
  assert.equal(state.status, "inside", "un'uscita breve non deve mai essere confermata");
  assert.equal(state.events.length, 0);
});

test("evaluateGeofencePoint: uscita confermata registra un evento 'exited' solo dopo una zona confermata", () => {
  const farLat = CENTER.lat + 1;
  const points = [
    pointAt(0, { lat: CENTER.lat }),
    pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 1000, { lat: CENTER.lat }), // conferma iniziale 'inside'
    pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 2000, { lat: farLat }),
    pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 22000, { lat: farLat }),
    pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 2000 + GEOFENCE_EXIT_MIN_DURATION_MS + 1000, { lat: farLat }),
  ];
  const state = feed(points, CIRCLE_ZONES);
  assert.equal(state.status, "outside");
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].type, "exited");
});

test("evaluateGeofencePoint: rientro confermato dopo un'uscita registra un evento 'returned'", () => {
  const farLat = CENTER.lat + 1;
  let state = createGeofenceState();
  // Conferma 'inside'
  state = evaluateGeofencePoint(state, pointAt(0, { lat: CENTER.lat }), CIRCLE_ZONES);
  state = evaluateGeofencePoint(state, pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 1000, { lat: CENTER.lat }), CIRCLE_ZONES);
  assert.equal(state.status, "inside");
  // Conferma 'outside'
  const exitStart = GEOFENCE_RETURN_MIN_DURATION_MS + 2000;
  state = evaluateGeofencePoint(state, pointAt(exitStart, { lat: farLat }), CIRCLE_ZONES);
  state = evaluateGeofencePoint(state, pointAt(exitStart + 20000, { lat: farLat }), CIRCLE_ZONES);
  state = evaluateGeofencePoint(state, pointAt(exitStart + GEOFENCE_EXIT_MIN_DURATION_MS + 1000, { lat: farLat }), CIRCLE_ZONES);
  assert.equal(state.status, "outside");
  // Rientro
  const returnStart = exitStart + GEOFENCE_EXIT_MIN_DURATION_MS + 2000;
  state = evaluateGeofencePoint(state, pointAt(returnStart, { lat: CENTER.lat }), CIRCLE_ZONES);
  state = evaluateGeofencePoint(state, pointAt(returnStart + GEOFENCE_RETURN_MIN_DURATION_MS + 1000, { lat: CENTER.lat }), CIRCLE_ZONES);
  assert.equal(state.status, "inside");
  assert.equal(state.events.length, 2);
  assert.equal(state.events[0].type, "exited");
  assert.equal(state.events[1].type, "returned");
});

test("applyStaleness: nessun punto valido per oltre la soglia -> stato 'stale', poi si riprende con un nuovo punto valido", () => {
  let state = createGeofenceState();
  state = evaluateGeofencePoint(state, pointAt(0, { lat: CENTER.lat }), CIRCLE_ZONES);
  state = evaluateGeofencePoint(state, pointAt(GEOFENCE_RETURN_MIN_DURATION_MS + 1000, { lat: CENTER.lat }), CIRCLE_ZONES);
  assert.equal(state.status, "inside");

  const staleCheckMs = state.lastValidPointAt + GEOFENCE_STALE_AFTER_MS + 1000;
  const staleState = applyStaleness(state, staleCheckMs);
  assert.equal(staleState.status, "stale");

  // Il rilevamento e' puramente funzione dei punti passati: nessuna dipendenza di rete.
  // Un nuovo punto valido (es. tornati online, o semplicemente GPS ripreso) fa riprendere
  // normalmente la valutazione dallo stato precedente.
  const resumed = evaluateGeofencePoint(staleState, pointAt(staleCheckMs - START_MS + 1000, { lat: CENTER.lat }), CIRCLE_ZONES);
  assert.notEqual(resumed.status, "stale");
});

test("evaluateGeofencePoint: zona mancante -> fallback 'zone_unavailable', nessun allarme", () => {
  const state = evaluateGeofencePoint(createGeofenceState(), pointAt(0), []);
  assert.equal(state.status, "zone_unavailable");
  assert.equal(state.events.length, 0);
});

test("evaluateGeofencePoint: coordinate non valide vengono ignorate senza alterare lo stato", () => {
  const state1 = createGeofenceState();
  const state2 = evaluateGeofencePoint(state1, pointAt(0, { lat: "non-numero", lng: NaN }), CIRCLE_ZONES);
  assert.equal(state2, state1);
});

test("summarizeGeofencePoints: rigioca punti gia' persistiti (gps_tracking_points) senza scrivere nulla", () => {
  const farLat = CENTER.lat + 1;
  const points = [
    { lat: CENTER.lat, lng: CENTER.lng, accuracy: 10, recorded_at: new Date(START_MS).toISOString() },
    { lat: CENTER.lat, lng: CENTER.lng, accuracy: 10, recorded_at: new Date(START_MS + GEOFENCE_RETURN_MIN_DURATION_MS + 1000).toISOString() },
    { lat: farLat, lng: CENTER.lng, accuracy: 10, recorded_at: new Date(START_MS + GEOFENCE_RETURN_MIN_DURATION_MS + 2000).toISOString() },
    { lat: farLat, lng: CENTER.lng, accuracy: 10, recorded_at: new Date(START_MS + GEOFENCE_RETURN_MIN_DURATION_MS + 22000).toISOString() },
    { lat: farLat, lng: CENTER.lng, accuracy: 10, recorded_at: new Date(START_MS + GEOFENCE_RETURN_MIN_DURATION_MS + 2000 + GEOFENCE_EXIT_MIN_DURATION_MS + 1000).toISOString() },
  ];
  const state = summarizeGeofencePoints(points, CIRCLE_ZONES);
  assert.equal(state.status, "outside");
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].type, "exited");
});

test("summarizeGeofencePoints: ordina i punti per recorded_at anche se arrivano fuori ordine", () => {
  const points = [
    { lat: CENTER.lat, lng: CENTER.lng, accuracy: 10, recorded_at: new Date(START_MS + GEOFENCE_RETURN_MIN_DURATION_MS + 1000).toISOString() },
    { lat: CENTER.lat, lng: CENTER.lng, accuracy: 10, recorded_at: new Date(START_MS).toISOString() },
  ];
  const state = summarizeGeofencePoints(points, CIRCLE_ZONES);
  assert.equal(state.status, "inside");
});
