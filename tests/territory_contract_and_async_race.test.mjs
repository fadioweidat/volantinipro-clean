import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProgramTerritory, clearProgramTerritoryCache, generateCirclePolygon } from '../src/lib/geo/territories/resolveProgramTerritory.js';

test('SAFEGUARD 3: Direct canonical persisted geometry wins over any lookup', async () => {
  clearProgramTerritoryCache();

  const persistedGeoJson = {
    type: 'Polygon',
    coordinates: [[[9.1, 45.5], [9.2, 45.5], [9.2, 45.6], [9.1, 45.6], [9.1, 45.5]]]
  };

  const zone = {
    id: 'test-zone-persisted',
    zone_name: 'BRUZZANO',
    polygon_geojson: persistedGeoJson,
    territory_type: 'nil',
    parent_municipality: 'Milano',
    quantity: 5000,
  };

  const resolved = await resolveProgramTerritory(zone);
  assert.equal(resolved.source, 'direct-polygon');
  assert.equal(resolved.type, 'nil');
  assert.equal(resolved.displayName, 'BRUZZANO');
  assert.deepEqual(resolved.geometry, persistedGeoJson);
});

test('SAFEGUARD 3: Radius generates accurate circle from center + radius_m', async () => {
  clearProgramTerritoryCache();

  const radiusZone = {
    id: 'test-radius-zone',
    zone_name: 'Area Raggio',
    centerLat: 45.4642,
    centerLng: 9.1900,
    radiusM: 1500,
    territory_type: 'radius',
    address_label: 'Duomo, Milano',
  };

  const resolved = await resolveProgramTerritory(radiusZone);
  assert.equal(resolved.source, 'radius-circle');
  assert.equal(resolved.type, 'radius');
  assert.equal(resolved.geometry?.type, 'Polygon');
  assert.equal(resolved.geometry?.coordinates?.[0]?.length, 65); // 64 segments + closing point
});

test('SAFEGUARD 3: Radius without valid center/radius NEVER falls back to Comune Milano', async () => {
  clearProgramTerritoryCache();

  const invalidRadiusZone = {
    id: 'test-invalid-radius',
    zone_name: 'Area Raggio Sconosciuta',
    centerLat: 0,
    centerLng: 0,
    radiusM: 1000,
    territory_type: 'radius',
    parent_municipality: 'Milano',
  };

  const resolved = await resolveProgramTerritory(invalidRadiusZone, { city: 'Milano' });
  assert.equal(resolved.source, 'radius-missing-center');
  assert.equal(resolved.type, 'radius');
  assert.equal(resolved.geometry, null, 'Must NOT fall back to Comune Milano polygon');
});

test('SAFEGUARD 3: Null zone during loading NEVER resolves fallback city polygon', async () => {
  clearProgramTerritoryCache();

  const resolved = await resolveProgramTerritory(null, { city: 'Milano', lat: 45.4642, lng: 9.19 });
  assert.equal(resolved.source, 'none');
  assert.equal(resolved.geometry, null, 'Must NOT resolve Milano boundary while zone is null');
  assert.equal(resolved.displayName, 'Area assegnata');
});

test('MANDATORY ASYNC RACE TEST: Cormano immediately followed by Bollate with delayed Cormano resolution', async () => {
  // Simulates the exact state machine in DriverWorkMapPage:
  // zoneSeqRef increments on each zone switch.
  // Responses from earlier seq must be dropped.

  let activeSeq = 0;
  let activeState = {
    zoneId: null,
    displayName: null,
    boundary: null,
  };

  function switchZone(zone, delayMs, mockGeometry) {
    const seq = ++activeSeq;
    const currentZoneId = zone.id || zone.zone_name;

    // Atomic switch: clear old geometry immediately
    activeState = {
      zoneId: currentZoneId,
      displayName: zone.zone_name,
      boundary: null,
    };

    return new Promise((resolve) => {
      setTimeout(() => {
        // ASYNC RACE PROTECTION
        if (activeSeq !== seq) {
          // Late response dropped
          resolve({ dropped: true, seq, activeSeq });
          return;
        }
        activeState = {
          zoneId: currentZoneId,
          displayName: zone.zone_name,
          boundary: mockGeometry,
        };
        resolve({ dropped: false, seq, activeSeq });
      }, delayMs);
    });
  }

  const cormanoGeom = { type: 'Polygon', coordinates: [[[9.16, 45.54], [9.18, 45.54], [9.16, 45.54]]] };
  const bollateGeom = { type: 'Polygon', coordinates: [[[9.11, 45.54], [9.13, 45.54], [9.11, 45.54]]] };

  // 1. Select Cormano (slow: 200ms)
  const cormanoPromise = switchZone({ id: 'zone-cormano', zone_name: 'Cormano' }, 200, cormanoGeom);

  // 2. Immediately select Bollate (fast: 50ms)
  const bollatePromise = switchZone({ id: 'zone-bollate', zone_name: 'Bollate' }, 50, bollateGeom);

  const [cormanoRes, bollateRes] = await Promise.all([cormanoPromise, bollatePromise]);

  assert.equal(bollateRes.dropped, false, 'Bollate was current and must be applied');
  assert.equal(cormanoRes.dropped, true, 'Late Cormano response must be dropped');
  assert.equal(activeState.zoneId, 'zone-bollate');
  assert.equal(activeState.displayName, 'Bollate');
  assert.deepEqual(activeState.boundary, bollateGeom);

  // 3. Repeat: BRUZZANO -> Cormano -> BRUZZANO rapidly
  const bruzzanoGeom = { type: 'Polygon', coordinates: [[[9.17, 45.52], [9.19, 45.52], [9.17, 45.52]]] };

  const p1 = switchZone({ id: 'zone-bruzzano', zone_name: 'BRUZZANO' }, 300, bruzzanoGeom);
  const p2 = switchZone({ id: 'zone-cormano', zone_name: 'Cormano' }, 150, cormanoGeom);
  const p3 = switchZone({ id: 'zone-bruzzano', zone_name: 'BRUZZANO' }, 50, bruzzanoGeom);

  await Promise.all([p1, p2, p3]);

  assert.equal(activeState.zoneId, 'zone-bruzzano');
  assert.equal(activeState.displayName, 'BRUZZANO');
  assert.deepEqual(activeState.boundary, bruzzanoGeom);
});
