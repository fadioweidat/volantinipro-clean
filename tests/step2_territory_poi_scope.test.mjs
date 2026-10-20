import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTerritoryPoiScope } from '../src/lib/step2/territoryPoiScope.js';
import { resolvePoiQueryRadiusKm } from '../src/lib/step2/poiQueryRadius.js';
const polygon = (x,y) => ({type:'Polygon',coordinates:[[[x,y],[x+.01,y],[x+.01,y+.01],[x,y+.01],[x,y]]]});
test('POI query includes both Certosa and Parco Nord instead of a stale address', () => {
  const rows = [{geometry:polygon(9.12,45.49)},{geometry:polygon(9.19,45.53)}];
  const before = JSON.stringify(rows);
  const scope = resolveTerritoryPoiScope(rows);
  assert.equal(scope.lat,45.515);
  assert.ok(Math.abs(scope.lng-9.16)<1e-9);
  assert.ok(scope.radiusKm>3 && scope.radiusKm<5);
  assert.equal(JSON.stringify(rows),before);
});
test('missing or invalid boundaries cannot invent a query area', () => {
  assert.equal(resolveTerritoryPoiScope([{geometry:{type:'Polygon',coordinates:[]}}]),null);
  assert.equal(resolveTerritoryPoiScope([]),null);
});
test('distant NILs: the POI circle is capped at 6 km without a sector, unchanged with a specific sector', () => {
  // Gratosoglio (south) + Comasina (north): circle well above the no-sector cap.
  const scope = resolveTerritoryPoiScope([{geometry:polygon(9.17,45.40)},{geometry:polygon(9.16,45.52)}]);
  assert.ok(scope.radiusKm > 6, `circle ${scope.radiusKm} km`);
  const capped = (targetSelection) => resolvePoiQueryRadiusKm({ poiRadiusKm: scope.radiusKm, usesTechnicalAnalysisRadius: true, serviceType: 'd2d', targetSelection });
  assert.equal(capped([]), 6);
  assert.equal(capped(['all']), 6);
  assert.equal(capped(['ristorazione']), scope.radiusKm);
});