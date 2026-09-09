import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  POI_TAGS as CLIENT_POI_TAGS,
  getPoiTagsForTargets,
  getPoiTagsForService,
} from '../src/lib/services/poi-api.js';

import {
  POI_TAGS as SERVER_POI_TAGS,
  TARGET_POI_CATEGORIES as SERVER_TARGET_CATEGORIES,
  getServiceTargetTags,
} from '../supabase/functions/_shared/poiSearchProxy.ts';

import { filterPoisForCampaignTarget } from '../src/lib/step2/poiFiltering.js';

// ── 1. Target mapping & normalization ──────────────────────────────────────
test('Gym / Fitness targets ("fitness", "palestra", "palestre", "gym", "sport") resolve to Palestra & Centro sportivo', () => {
  const gymAliases = ['fitness', 'palestra', 'palestre', 'gym', 'sport'];
  for (const alias of gymAliases) {
    const clientTags = getPoiTagsForTargets('h2h', [alias]);
    assert.ok(clientTags.length > 0, `client tags should not be empty for alias "${alias}"`);
    assert.ok(clientTags.every(t => t.cat === 'Palestra' || t.cat === 'Centro sportivo'), `all client tags for "${alias}" must be gym/sport`);

    const serverTags = getServiceTargetTags('h2h', [alias]);
    assert.ok(serverTags.length > 0, `server tags should not be empty for alias "${alias}"`);
    assert.ok(serverTags.every(t => t.cat === 'Palestra' || t.cat === 'Centro sportivo'), `all server tags for "${alias}" must be gym/sport`);
  }
});

// ── 2. Tag anti-drift between client and server ────────────────────────────
test('Server and Client POI_TAGS for gym/fitness remain identical without drift', () => {
  for (const svc of ['d2d', 'h2h', 'b2b']) {
    const sTags = SERVER_POI_TAGS[svc].filter(t => t.cat === 'Palestra' || t.cat === 'Centro sportivo');
    const cTags = (CLIENT_POI_TAGS[svc] || []).filter(t => t.cat === 'Palestra' || t.cat === 'Centro sportivo');

    const sSet = new Set(sTags.map(t => `${t.key}:${t.val}:${t.cat}`));
    const cSet = new Set(cTags.map(t => `${t.key}:${t.val}:${t.cat}`));
    assert.deepEqual([...sSet].sort(), [...cSet].sort(), `tag drift on service ${svc}`);
  }
});

// ── 3. Whitelist & Blacklist filtering ─────────────────────────────────────
test('filterPoisForCampaignTarget accurately accepts gym POIs and avoids false-positive blacklist drops', () => {
  const testPois = [
    { id: '1', lat: 45.46, lng: 9.19, name: 'McFIT Milano', category: 'Palestra' },
    { id: '2', lat: 45.47, lng: 9.20, name: 'CrossFit Barbell Club', category: 'Palestra' }, // contains "bar"
    { id: '3', lat: 45.48, lng: 9.21, name: 'Palestra Via Baracca', category: 'Palestra' },  // contains "bar"
    { id: '4', lat: 45.49, lng: 9.22, name: 'Virgin Active Corso Como', category: 'Palestra' },
    { id: '5', lat: 45.50, lng: 9.23, name: 'Centro Sportivo Saini', category: 'Centro sportivo' },
    { id: '6', lat: 45.51, lng: 9.24, name: 'Bar Sport Caffe', category: 'Bar' },            // should be rejected
    { id: '7', lat: 45.52, lng: 9.25, name: 'Farmacia Santa Maria', category: 'Farmacia' }, // should be rejected
    { id: '8', lat: 45.53, lng: 9.26, name: 'Supermercato Conad', category: 'Supermercato' },// should be rejected
  ];

  for (const target of ['fitness', 'palestra', 'gym']) {
    const filtered = filterPoisForCampaignTarget(testPois, [target]);
    const ids = filtered.map(p => p.id);

    // Gyms with name substrings like "barbell" or "baracca" must NOT be dropped
    assert.ok(ids.includes('1'), 'McFIT should be kept');
    assert.ok(ids.includes('2'), 'CrossFit Barbell Club must not be falsely blacklisted');
    assert.ok(ids.includes('3'), 'Palestra Via Baracca must not be falsely blacklisted');
    assert.ok(ids.includes('4'), 'Virgin Active should be kept');
    assert.ok(ids.includes('5'), 'Centro Sportivo should be kept');

    // Non-gyms must be excluded
    assert.ok(!ids.includes('6'), 'Bar must be excluded');
    assert.ok(!ids.includes('7'), 'Pharmacy must be excluded');
    assert.ok(!ids.includes('8'), 'Supermarket must be excluded');
  }
});

// ── 4. Unrelated categories remain intact ──────────────────────────────────
test('filterPoisForCampaignTarget preserves other categories correctly', () => {
  const testPois = [
    { id: '1', lat: 45.46, lng: 9.19, name: 'Pizzeria Bella Napoli', category: 'Ristorante' },
    { id: '2', lat: 45.47, lng: 9.20, name: 'Liceo Parini', category: 'Scuola' },
    { id: '3', lat: 45.48, lng: 9.21, name: 'McFIT', category: 'Palestra' },
  ];

  const ristorazione = filterPoisForCampaignTarget(testPois, ['ristorazione']);
  assert.equal(ristorazione.length, 1);
  assert.equal(ristorazione[0].name, 'Pizzeria Bella Napoli');

  const scuole = filterPoisForCampaignTarget(testPois, ['scuole']);
  assert.equal(scuole.length, 1);
  assert.equal(scuole[0].name, 'Liceo Parini');
});
