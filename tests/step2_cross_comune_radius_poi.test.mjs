import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  nilModeCountLabel,
  summariseNilCoverage,
} from 'file:///d:/cloaude%20volantini/volantinipro-full-site-final/src/lib/step2/milanoNilView.js';

import { apiToZones } from 'file:///d:/cloaude%20volantini/volantinipro-full-site-final/src/lib/step2/zoneGeoHelpers.js';
import { filterPoisForCampaignTarget } from 'file:///d:/cloaude%20volantini/volantinipro-full-site-final/src/lib/step2/poiFiltering.js';
import { getPoiTagsForTargets } from 'file:///d:/cloaude%20volantini/volantinipro-full-site-final/src/lib/services/poi-api.js';

test('nilModeCountLabel formats cross-comune radius coverage correctly', () => {
  const labelWithComuni = nilModeCountLabel({
    isRadiusMode: true,
    intersectedCount: 12,
    externalComuniCount: 2,
    externalComuniNames: ['Cormano', 'Bresso'],
  });
  assert.equal(labelWithComuni, '12 NIL Milano + 2 Comuni limitrofi (Cormano, Bresso)');

  const labelSingle = nilModeCountLabel({
    isRadiusMode: true,
    intersectedCount: 8,
    externalComuniCount: 1,
    externalComuniNames: ['Cormano'],
  });
  assert.equal(labelSingle, '8 NIL Milano + 1 Comune limitrofo (Cormano)');

  const labelPure = nilModeCountLabel({
    isRadiusMode: true,
    intersectedCount: 15,
    externalComuniCount: 0,
  });
  assert.equal(labelPure, 'NIL intercettati dal raggio: 15');

  const labelManual = nilModeCountLabel({
    nilManualMode: true,
    selectedCount: 4,
  });
  assert.equal(labelManual, 'NIL selezionati: 4');
});

test('apiToZones preserves both Milano NILs and external Comuni in mixed radius mode', () => {
  const mixedApiData = {
    metadata: {
      analysis_level: 'mixed',
    },
    values: {
      analysis_level: 'mixed',
      famiglie_stimate: 70899,
      popolazione_stimata: 152000,
      volantini_consigliati: 77989,
    },
    comuni_breakdown: [
      {
        territory_level: 'nil',
        nil_code: '9',
        nil_name: 'BRUZZANO',
        households_in_radius: 5800,
        population_in_radius: 11800,
        volantini_nel_raggio: 6380,
        pct_copertura: 94,
        area_km2: 1.8,
      },
      {
        territory_level: 'nil',
        nil_code: '10',
        nil_name: 'AFFORI',
        households_in_radius: 9500,
        population_in_radius: 19000,
        volantini_nel_raggio: 10450,
        pct_copertura: 80,
        area_km2: 2.1,
      },
      {
        territory_level: 'comune',
        municipality_code: '015086',
        comune_name: 'Cormano',
        households_in_radius: 3579,
        population_in_radius: 7986,
        volantini_nel_raggio: 3937,
        pct_copertura: 38,
        area_km2: 4.5,
      },
      {
        territory_level: 'comune',
        municipality_code: '015032',
        comune_name: 'Bresso',
        households_in_radius: 2751,
        population_in_radius: 5768,
        volantini_nel_raggio: 3026,
        pct_copertura: 22,
        area_km2: 3.4,
      },
    ],
    nil_breakdown: [
      {
        territory_level: 'nil',
        nil_code: '9',
        nil_name: 'BRUZZANO',
        households_in_radius: 5800,
      },
      {
        territory_level: 'nil',
        nil_code: '10',
        nil_name: 'AFFORI',
        households_in_radius: 9500,
      },
    ],
  };

  const zones = apiToZones(mixedApiData, { name: 'Milano', lat: 45.52, lng: 9.17 });
  assert.ok(Array.isArray(zones), 'zones must be an array');
  assert.equal(zones.length, 4, 'must include all 4 zones (2 NILs + 2 Comuni)');

  const nilZones = zones.filter(z => z.isNil);
  const extComuni = zones.filter(z => !z.isNil);

  assert.equal(nilZones.length, 2, '2 NIL zones');
  assert.equal(extComuni.length, 2, '2 external comuni');

  assert.equal(nilZones[0].name, 'BRUZZANO');
  assert.equal(nilZones[0].nilCode, '9');
  assert.equal(nilZones[0].families, 5800);

  assert.equal(extComuni[0].name, 'Cormano');
  assert.equal(extComuni[0].municipality_code, '015086');
  assert.equal(extComuni[0].families, 3579);

  assert.equal(extComuni[1].name, 'Bresso');
  assert.equal(extComuni[1].municipality_code, '015032');
  assert.equal(extComuni[1].families, 2751);

  const totalFam = zones.reduce((a, z) => a + z.families, 0);
  assert.equal(totalFam, 5800 + 9500 + 3579 + 2751);

  const totalVol = zones.reduce((a, z) => a + z.volantiniNelRaggio, 0);
  assert.equal(totalVol, 6380 + 10450 + 3937 + 3026);
});

test('Fitness sector POI pipeline works for all aliases', () => {
  const aliases = ['fitness', 'palestra', 'palestre', 'gym', 'sport'];
  for (const alias of aliases) {
    const tags = getPoiTagsForTargets('d2d', [alias]);
    assert.ok(tags.length > 0, `tags for ${alias} must exist`);
    assert.ok(tags.every(t => t.cat === 'Palestra' || t.cat === 'Centro sportivo'));
  }

  const pois = [
    { id: '1', name: 'Palestra Gold Gym', category: 'Palestra' },
    { id: '2', name: 'Centro Fitness FitActive', category: 'Palestra' },
    { id: '3', name: 'Bar Centrale', category: 'Bar' },
  ];

  const filtered = filterPoisForCampaignTarget(pois, ['fitness']);
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].name, 'Palestra Gold Gym');
  assert.equal(filtered[1].name, 'Centro Fitness FitActive');
});
