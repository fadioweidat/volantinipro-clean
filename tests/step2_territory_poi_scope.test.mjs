import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTerritoryPoiScope } from '../src/lib/step2/territoryPoiScope.js';
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
