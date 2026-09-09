import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CAP_LOMBARDIA } from '../src/lib/step2/capLombardia.js';
import { capToZone } from '../src/lib/step2/zoneGeoHelpers.js';

test('STEP 2 CAP SELECTION SUITE', async (t) => {
  await t.test('CAP_LOMBARDIA dataset contains Milano and Lombardia CAPs', () => {
    assert.ok(CAP_LOMBARDIA.length > 100, 'Catalog should contain over 100 CAP entries');
    const cap20161 = CAP_LOMBARDIA.find(c => c.postal_code === '20161');
    assert.ok(cap20161, '20161 should exist in catalog');
    assert.match(cap20161.municipality_name, /Milano/i, '20161 should map to Milano');

    const cap20121 = CAP_LOMBARDIA.find(c => c.postal_code === '20121');
    assert.ok(cap20121, '20121 should exist in catalog');

    const cap20091 = CAP_LOMBARDIA.find(c => c.postal_code === '20091');
    assert.ok(cap20091, '20091 should exist in catalog');
    assert.match(cap20091.municipality_name, /Bresso/i, '20091 should map to Bresso');
  });

  await t.test('CAP Autocomplete extraction simulation', () => {
    function simulateCapSearch(query) {
      const trimmed = (query || '').trim();
      const fiveDigitMatch = trimmed.match(/\b(2\d{4}|\d{5})\b/);
      const digitsOnlyMatch = trimmed.match(/^\d{1,5}$/);
      const digitsMatch = fiveDigitMatch ? fiveDigitMatch[0] : (digitsOnlyMatch ? digitsOnlyMatch[0] : null);

      if (digitsMatch) {
        return CAP_LOMBARDIA.filter(c => c.postal_code.startsWith(digitsMatch)).slice(0, 8);
      } else {
        const cleanText = trimmed.replace(/\s*\([A-Za-z]{2}\)/g, '').trim();
        if (cleanText.length >= 2) {
          return CAP_LOMBARDIA.filter(c =>
            c.municipality_name.toLowerCase().includes(cleanText.toLowerCase()) ||
            c.postal_code.startsWith(cleanText)
          ).slice(0, 12);
        }
      }
      return [];
    }

    // 1. Exact CAP
    const res1 = simulateCapSearch('20161');
    assert.ok(res1.some(c => c.postal_code === '20161'), 'Search 20161 must find 20161');

    // 2. City + Province + CAP: Milano (MI) 20161 (The exact ticket repro)
    const res2 = simulateCapSearch('Milano (MI) 20161');
    assert.ok(res2.some(c => c.postal_code === '20161'), 'Search Milano (MI) 20161 must find 20161');

    // 3. City name: Milano
    const res3 = simulateCapSearch('Milano');
    assert.ok(res3.length > 0, 'Search Milano must return Milano CAPs');
    assert.ok(res3.some(c => c.postal_code.startsWith('201')), 'Milano CAPs must start with 201');

    // 4. Prefix: 201
    const res4 = simulateCapSearch('201');
    assert.ok(res4.length > 0, 'Search 201 must return 201xx CAPs');

    // 5. Province town: Bresso
    const res5 = simulateCapSearch('Bresso');
    assert.ok(res5.some(c => c.postal_code === '20091'), 'Search Bresso must find 20091');
  });

  await t.test('capToZone creates valid, functional zone metrics', () => {
    const analysisData = {
      postal_code: '20161',
      municipality_name: 'Milano (Bovisa)',
      households_estimated: 7200,
      population_estimated: 16000,
      area_km2: 3.4,
      recommended_flyers: 7560,
      geometry_geojson: null,
      source_flags: ['Dati geografici CAP']
    };

    const zone = capToZone(analysisData, 0);
    assert.equal(zone.id, 'cap_20161');
    assert.equal(zone.name, 'CAP 20161');
    assert.equal(zone.postalCode, '20161');
    assert.equal(zone.families, 7200);
    assert.equal(zone.pop, 16000);
    assert.equal(zone.volantiniNelRaggio, 7560);
    assert.equal(zone.coverage, 100);
    assert.equal(zone.unavailable, undefined);
  });

  await t.test('Step2TerritoryControlsPanel includes id, name, and Enter key handling', () => {
    const panelCode = readFileSync(resolve('src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx'), 'utf-8');
    assert.match(panelCode, /id="step2-search-input"/, 'Search input must have id="step2-search-input"');
    assert.match(panelCode, /name="step2_search_input"/, 'Search input must have name="step2_search_input"');
    assert.match(panelCode, /if\s*\(searchMode\s*===\s*"cap"\)/, 'Search input onKeyDown must handle searchMode === "cap"');
  });

  await t.test('Step2.jsx CAP search & handleCapSelect verification', () => {
    const step2Code = readFileSync(resolve('src/pages/public/configurator/Step2.jsx'), 'utf-8');
    assert.match(step2Code, /fiveDigitMatch\s*=\s*trimmed\.match/, 'Step2.jsx must extract 5-digit CAPs from search query');
    assert.match(step2Code, /cleanText\s*=\s*trimmed\.replace/, 'Step2.jsx must support municipality name search in CAP mode');
    assert.match(step2Code, /capToZone\(fallbackAnalysis/, 'Step2.jsx must provide robust fallback zone analysis for known CAPs');
  });
});
