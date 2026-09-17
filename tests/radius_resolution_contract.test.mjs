import { resolveProgramTerritory, generateCirclePolygon } from '../src/lib/geo/territories/resolveProgramTerritory.js';
import { geoJsonContainsPoint } from '../src/lib/geo/pointInPolygon.js';

async function testRadiusAndStep4Payload() {
  console.log('--- TEST: Radius Geodesic Resolution & Precision ---');
  
  // Center: Duomo di Milano (45.4642, 9.19)
  const centerLat = 45.4642;
  const centerLng = 9.19;
  const radiusM = 3000; // 3km

  const circle = generateCirclePolygon(centerLat, centerLng, radiusM, 64);
  if (!circle || circle.type !== 'Polygon') {
    throw new Error('Circle polygon generation failed');
  }

  const ring = circle.coordinates[0];
  console.log(`Generated Circle vertices count: ${ring.length} (closed loop)`);
  if (ring.length !== 65) throw new Error('Expected 65 points (64 segments closed)');

  // Geofence tests:
  // 1. Center is strictly inside
  const pCenter = geoJsonContainsPoint(circle, centerLat, centerLng);
  console.log(`Center inside: ${pCenter} (expected: true)`);
  if (!pCenter) throw new Error('Center must be inside circle');

  // 2. Point 1.5km north (approx lat 45.4777, lng 9.19) -> INSIDE
  const pInside = geoJsonContainsPoint(circle, 45.4777, 9.19);
  console.log(`Point 1.5km north inside: ${pInside} (expected: true)`);
  if (!pInside) throw new Error('1.5km point must be inside 3km circle');

  // 3. Point 5km north (approx lat 45.509, lng 9.19) -> OUTSIDE
  const pOutside = geoJsonContainsPoint(circle, 45.509, 9.19);
  console.log(`Point 5km north inside: ${pOutside} (expected: false)`);
  if (pOutside) throw new Error('5km point must be outside 3km circle');

  // 4. Test resolveProgramTerritory with a Radius zone
  const radiusZone = {
    id: 'test-zone-radius-3km',
    zone_name: 'Milano (Raggio 3 km)',
    territory_type: 'radius',
    center_lat: centerLat,
    center_lng: centerLng,
    radius_m: radiusM,
    quantity: 15000,
  };

  const resolved = await resolveProgramTerritory(radiusZone);
  console.log('Resolved Territory Contract:', {
    id: resolved.id,
    type: resolved.type,
    source: resolved.source,
    radiusM: resolved.radiusM,
    displayName: resolved.displayName,
    geomType: resolved.geometry.type,
  });

  if (resolved.type !== 'radius' || resolved.source !== 'radius-circle' || resolved.radiusM !== 3000) {
    throw new Error('resolveProgramTerritory failed radius contract');
  }

  console.log('RADIUS GEODESIC TEST PASSED');
}

testRadiusAndStep4Payload().catch(err => {
  console.error(err);
  process.exit(1);
});
