import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/pages/admin/GpsMonitor.jsx', import.meta.url), 'utf8');

test('Admin GPS: shared-link participant usa assignmentId come chiave GPS quando operator_id e null', () => {
  assert.match(src, /hasGps: gpsDriverIds\.has\(o\.operatorId \|\| o\.assignmentId\)/);
  assert.match(src, /const opByDriver = new Map\([\s\S]*?o\.operatorId, o\.assignmentId/);
  assert.match(src, /const operatorTrackKey = op\.operatorId \|\| op\.assignmentId/);
  assert.match(src, /t\.session\?\.assignment_id === op\.assignmentId/);
});

test('Admin GPS: label OP del participant arriva fino al marker live', () => {
  assert.match(src, /canonicalOperators = \[\]/);
  assert.match(src, /operatorLabel: canonical\?\.displayName \|\| canonical\?\.slot \|\| `OP \$\{index \+ 1\}`/);
  assert.match(src, /className="vp-gps-operator-label"/);
  assert.match(src, /<span>\{track\.operatorLabel\}<\/span>/);
  assert.match(src, /<strong>\{track\.operatorLabel\}<\/strong>/);
  assert.match(src, /canonicalOperators=\{canonicalOperators\}/);
});
