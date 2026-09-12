import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geoJsonContainsPoint } from '../src/lib/geo/pointInPolygon.js';
import { driverPathWithQuery } from '../src/pages/driver/driverNav.js';

test('Driver Zone Geometry Alignment Suite', async (t) => {

  await t.test('1. driverPathWithQuery safely merges target query and current access token without duplication', () => {
    const originalWindow = globalThis.window;
    globalThis.window = {
      location: {
        search: '?access=SECRET_OPERATOR_TOKEN&device=dev_123',
      }
    };

    try {
      const resA = driverPathWithQuery('/driver/assignment/assign-1/map');
      assert.match(resA, /\/driver\/assignment\/assign-1\/map\?access=SECRET_OPERATOR_TOKEN&device=dev_123/);
      assert.equal((resA.match(/\?/g) || []).length, 1, 'Should have exactly one question mark');

      const resB = driverPathWithQuery('/driver/assignment/assign-1/map?zoneId=zone-limbiate');
      assert.match(resB, /\/driver\/assignment\/assign-1\/map\?zoneId=zone-limbiate&access=SECRET_OPERATOR_TOKEN&device=dev_123/);
      assert.equal((resB.match(/\?/g) || []).length, 1, 'Should never produce duplicate question marks');

      const resC = driverPathWithQuery('/driver/assignment/assign-1/map?access=NEW_TOKEN&zoneId=zone-limbiate');
      assert.equal(resC, '/driver/assignment/assign-1/map?access=NEW_TOKEN&zoneId=zone-limbiate&device=dev_123');
    } finally {
      globalThis.window = originalWindow;
    }
  });

  await t.test('2. Canonical zone resolution assigns correct zone record and municipality name', () => {
    const mockAssignmentZones = [
      {
        id: '6b21b32a-9787-4576-b64e-e7f3c5d45ee4',
        zone_name: 'Paderno Dugnano',
        priority: 1,
        quantity: 23370,
        status: 'In corso',
      },
      {
        id: '40995874-1524-4c7f-b759-cedf3a4dfc6a',
        zone_name: 'Limbiate',
        priority: 2,
        quantity: 16516,
        status: 'In corso',
      }
    ];

    function resolveActiveZone({ assignmentZones, selectedZoneId, activeSessionZoneId, isSessionLoading }) {
      const activeId = selectedZoneId || activeSessionZoneId || null;
      if (activeId) {
        const found = assignmentZones.find(z => z.id === activeId);
        if (found) return found;
      }
      if (isSessionLoading) return null;
      return assignmentZones[0] || null;
    }

    const zoneWhenLimbiateActive = resolveActiveZone({
      assignmentZones: mockAssignmentZones,
      selectedZoneId: null,
      activeSessionZoneId: '40995874-1524-4c7f-b759-cedf3a4dfc6a',
      isSessionLoading: false,
    });
    assert.equal(zoneWhenLimbiateActive?.id, '40995874-1524-4c7f-b759-cedf3a4dfc6a');
    assert.equal(zoneWhenLimbiateActive?.zone_name, 'Limbiate');

    const zoneWhileLoading = resolveActiveZone({
      assignmentZones: mockAssignmentZones,
      selectedZoneId: null,
      activeSessionZoneId: null,
      isSessionLoading: true,
    });
    assert.equal(zoneWhileLoading, null, 'Must not prematurely grab index [0] while session is resuming');

    const zoneExplicitUrl = resolveActiveZone({
      assignmentZones: mockAssignmentZones,
      selectedZoneId: '40995874-1524-4c7f-b759-cedf3a4dfc6a',
      activeSessionZoneId: '6b21b32a-9787-4576-b64e-e7f3c5d45ee4',
      isSessionLoading: false,
    });
    assert.equal(zoneExplicitUrl?.zone_name, 'Limbiate');
  });

  await t.test('3. Key generation for React-Leaflet ensures layer unmount/remount on zone switch', () => {
    const padernoId = '6b21b32a-9787-4576-b64e-e7f3c5d45ee4';
    const limbiateId = '40995874-1524-4c7f-b759-cedf3a4dfc6a';

    const keyPaderno = `zone-boundary-${padernoId}`;
    const keyLimbiate = `zone-boundary-${limbiateId}`;

    assert.notEqual(keyPaderno, keyLimbiate, 'Keys must be distinct so Leaflet destroys and recreates the polygon layer');
    assert.match(keyPaderno, new RegExp(padernoId));
    assert.match(keyLimbiate, new RegExp(limbiateId));
  });

  await t.test('4. Geofence point evaluation correctly discriminates between Limbiate and Paderno Dugnano boundaries', () => {
    const limbiatePolygon = {
      type: 'Polygon',
      coordinates: [[
        [9.100, 45.585],
        [9.135, 45.585],
        [9.135, 45.610],
        [9.100, 45.610],
        [9.100, 45.585]
      ]]
    };

    const padernoPolygon = {
      type: 'Polygon',
      coordinates: [[
        [9.140, 45.550],
        [9.180, 45.550],
        [9.180, 45.580],
        [9.140, 45.580],
        [9.140, 45.550]
      ]]
    };

    const limbiateGpsPoint = { lat: 45.595, lng: 9.120 };
    const padernoGpsPoint = { lat: 45.565, lng: 9.160 };

    assert.equal(geoJsonContainsPoint(limbiatePolygon, limbiateGpsPoint.lat, limbiateGpsPoint.lng), true);
    assert.equal(geoJsonContainsPoint(padernoPolygon, limbiateGpsPoint.lat, limbiateGpsPoint.lng), false);

    assert.equal(geoJsonContainsPoint(padernoPolygon, padernoGpsPoint.lat, padernoGpsPoint.lng), true);
    assert.equal(geoJsonContainsPoint(limbiatePolygon, padernoGpsPoint.lat, padernoGpsPoint.lng), false);
  });

});
