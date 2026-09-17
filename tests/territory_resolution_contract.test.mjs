import { resolveProgramTerritory, generateCirclePolygon } from '../src/lib/geo/territories/resolveProgramTerritory.js';
import { geoJsonContainsPoint } from '../src/lib/geo/pointInPolygon.js';

async function testResolution() {
  console.log('--- Testing resolveProgramTerritory Contract ---');

  // Test Case 1: Radius Zone (e.g., 3km around Milan Duomo)
  const radiusZone = {
    id: 'zone-radius-1',
    zone_name: 'Milano Centro 3km',
    territory_type: 'radius',
    center_lat: 45.4642,
    center_lng: 9.19,
    radius_m: 3000,
    quantity_assigned: 15000,
  };
  const resolvedRadius = await resolveProgramTerritory(radiusZone);
  console.log('Resolved Radius:', {
    type: resolvedRadius.type,
    source: resolvedRadius.source,
    geomType: resolvedRadius.geometry?.type,
    ringPoints: resolvedRadius.geometry?.coordinates[0]?.length,
  });

  if (resolvedRadius.type !== 'radius' || resolvedRadius.geometry?.type !== 'Polygon') {
    throw new Error('Radius resolution failed');
  }

  // Inside center point check
  const insideRadius = geoJsonContainsPoint(resolvedRadius.geometry, 45.4642, 9.19);
  // Far outside point check (Monza)
  const outsideRadius = geoJsonContainsPoint(resolvedRadius.geometry, 45.58, 9.27);
  console.log(`Radius Geofence: inside=${insideRadius} (expected true), outside=${outsideRadius} (expected false)`);
  if (!insideRadius || outsideRadius) throw new Error('Radius geofence calculation incorrect');

  // Test Case 2: NIL Zone (Bruzzano)
  const nilZone = {
    id: 'zone-nil-bruzzano',
    zone_name: 'BRUZZANO',
    parent_municipality: 'Milano',
    territory_type: 'nil',
    center_lat: 45.528,
    center_lng: 9.178,
    quantity_assigned: 7524,
  };
  const resolvedNil = await resolveProgramTerritory(nilZone);
  console.log('Resolved NIL:', {
    type: resolvedNil.type,
    source: resolvedNil.source,
    geomType: resolvedNil.geometry?.type,
    parentMunicipality: resolvedNil.parentMunicipality,
  });
  if (resolvedNil.type !== 'nil') {
    throw new Error('NIL resolution failed');
  }

  // Test Case 3: Comune Zone (Bollate)
  const comuneZone = {
    id: 'zone-comune-bollate',
    zone_name: 'Bollate',
    territory_type: 'comune',
    center_lat: 45.548,
    center_lng: 9.117,
    quantity_assigned: 371,
  };
  const resolvedComune = await resolveProgramTerritory(comuneZone);
  console.log('Resolved Comune:', {
    type: resolvedComune.type,
    source: resolvedComune.source,
    geomType: resolvedComune.geometry?.type,
  });

  console.log('ALL RESOLUTION TESTS PASSED');
}

testResolution().catch(err => {
  console.error(err);
  process.exit(1);
});
