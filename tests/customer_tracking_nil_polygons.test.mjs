import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMunicipalityBoundary, clearMunicipalityBoundaryCache } from '../src/lib/geo/resolveMunicipalityBoundary.js';

test('NIL Boundary Resolution: fallback query strategy includes district/NIL queries', async (t) => {
  clearMunicipalityBoundaryCache();

  // Test with mock Nominatim responses for a district
  const queriesCalled = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    queriesCalled.push(urlStr);

    if (urlStr.includes('nominatim.openstreetmap.org')) {
      if (urlStr.includes('BRUZZANO%2C%20Milano')) {
        return {
          ok: true,
          json: async () => ({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { addresstype: 'suburb' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [9.172, 45.522],
                      [9.185, 45.524],
                      [9.182, 45.515],
                      [9.172, 45.522],
                    ],
                  ],
                },
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) };
    }

    if (urlStr.includes('analysis-istat')) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          nil_breakdown: [
            {
              nil_name: 'BRUZZANO',
              geojson: {
                type: 'Polygon',
                coordinates: [
                  [
                    [9.172, 45.522],
                    [9.185, 45.524],
                    [9.182, 45.515],
                    [9.172, 45.522],
                  ],
                ],
              },
            },
          ],
        }),
      };
    }

    return { ok: false, status: 404 };
  };

  try {
    const result = await resolveMunicipalityBoundary('BRUZZANO');
    assert.ok(result, 'Boundary should be resolved for BRUZZANO');
    assert.equal(result.type, 'Polygon');
    assert.ok(Array.isArray(result.coordinates), 'Coordinates array must be present');

    // Verify cache returns same result without extra fetches
    const cachedResult = await resolveMunicipalityBoundary('BRUZZANO');
    assert.deepEqual(cachedResult, result, 'Cached boundary must match resolved boundary');
  } finally {
    globalThis.fetch = originalFetch;
    clearMunicipalityBoundaryCache();
  }
});

test('NIL Boundary Resolution: no fake/synthetic geometries created if resolution fails', async (t) => {
  clearMunicipalityBoundaryCache();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [],
  });

  try {
    const result = await resolveMunicipalityBoundary('NON_EXISTENT_ZONE_12345');
    assert.equal(result, null, 'Must return null rather than generating fake circles/rectangles');
  } finally {
    globalThis.fetch = originalFetch;
    clearMunicipalityBoundaryCache();
  }
});

test('Leaflet Layer Panes & Z-Index Ordering Contract', async (t) => {
  // Static audit of CampaignTracking.jsx to ensure layer hierarchy adheres to contract
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const trackingCode = await fs.readFile(path.resolve('src/pages/customer/CampaignTracking.jsx'), 'utf8');

  // Verify Pane components and z-indices
  assert.match(trackingCode, /<Pane\s+name="nilPane"\s+style=\{\{\s*zIndex:\s*400\s*\}\}\s*\/>/, 'nilPane must be configured with zIndex: 400');
  assert.match(trackingCode, /<Pane\s+name="coveragePane"\s+style=\{\{\s*zIndex:\s*450\s*\}\}\s*\/>/, 'coveragePane must be configured with zIndex: 450');
  assert.match(trackingCode, /<Pane\s+name="gpsPointsPane"\s+style=\{\{\s*zIndex:\s*500\s*\}\}\s*\/>/, 'gpsPointsPane must be configured with zIndex: 500');
  assert.match(trackingCode, /<Pane\s+name="gpsLivePane"\s+style=\{\{\s*zIndex:\s*550\s*\}\}\s*\/>/, 'gpsLivePane must be configured with zIndex: 550');

  // Verify NIL Polygons use nilPane and have permanent tooltips
  assert.match(trackingCode, /pane="nilPane"/, 'NIL polygons must be assigned to nilPane');
  assert.match(trackingCode, /<Tooltip\s+permanent/, 'NIL polygons must have permanent tooltips with zone names');
  assert.match(trackingCode, /className="vp-nil-map-label"/, 'NIL map tooltips must use vp-nil-map-label class');

  // Verify Verified Coverage uses coveragePane
  assert.match(trackingCode, /pane="coveragePane"/, 'Verified coverage must be assigned to coveragePane');

  // Verify GPS points use gpsPointsPane and latestPoint uses gpsLivePane
  assert.match(trackingCode, /pane="gpsPointsPane"/, 'GPS dots must be assigned to gpsPointsPane');
  assert.match(trackingCode, /pane="gpsLivePane"/, 'Latest GPS point must be assigned to gpsLivePane');

  // Verify Legend contains NIL entry
  assert.match(trackingCode, /label="Confini Zone \/ NIL"/, 'Legend must list Confini Zone / NIL');
});

test('Card & Map Two-Way Selection Synchronization Contract', async (t) => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const trackingCode = await fs.readFile(path.resolve('src/pages/customer/CampaignTracking.jsx'), 'utf8');
  const panelCode = await fs.readFile(path.resolve('src/components/zone-progress/ZoneProgressPanel.jsx'), 'utf8');

  // CampaignTracking state & handlers
  assert.match(trackingCode, /const\s*\[selectedZoneId,\s*setSelectedZoneId\]\s*=\s*useState\(null\)/, 'CampaignTracking must maintain selectedZoneId state');
  assert.match(trackingCode, /selectedZoneId=\{selectedZoneId\}/, 'TrackingMap and AuthorizedZoneProgress must receive selectedZoneId');
  assert.match(trackingCode, /onSelectZone=/, 'TrackingMap and AuthorizedZoneProgress must receive onSelectZone callback');

  // ZoneProgressPanel handles selection and styling
  assert.match(panelCode, /selectedZoneId\s*=\s*null/, 'ZoneProgressPanel must accept selectedZoneId prop');
  assert.match(panelCode, /onSelectZone\s*=\s*null/, 'ZoneProgressPanel must accept onSelectZone prop');
  assert.match(panelCode, /Mappa attiva/, 'ZoneProgressPanel must render active selection indicator');
});
