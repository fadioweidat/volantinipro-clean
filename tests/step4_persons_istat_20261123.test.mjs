// "Persone stimate" da popolazione ISTAT reale (2026-11-23), non famiglie x 2,4.
import test from "node:test";
import assert from "node:assert/strict";
import { estimateCampaignPersons, personsPerFamily } from "../src/lib/step4/personsEstimate.js";

test("un PV: la popolazione ISTAT dell'area, se c'e'", () => {
  assert.deepEqual(estimateCampaignPersons({ singlePopulation: 26513 }), { value: 26513, method: "istat_area" });
  assert.equal(estimateCampaignPersons({ singlePopulation: 0 }), null);
  assert.equal(estimateCampaignPersons({ singlePopulation: null }), null);
});

test("piu' PV: rapporto ISTAT di ogni PV x sue famiglie uniche", () => {
  const plan = { ready: true, rows: [{ id: "a", families: 1000 }, { id: "b", families: 500 }] };
  const zones = [{ id: "a", families: 2000, population: 4000 }, { id: "b", families: 1000, population: 2300 }];
  // 1000 x 2,0 + 500 x 2,3 = 3150
  assert.deepEqual(estimateCampaignPersons({ plan, zones }), { value: 3150, method: "istat_ratio_per_pv" });
});

test("piu' PV: senza un dato o con rapporto non plausibile niente numero", () => {
  const plan = { ready: true, rows: [{ id: "a", families: 1000 }, { id: "b", families: 500 }] };
  assert.equal(estimateCampaignPersons({ plan, zones: [{ id: "a", families: 2000, population: 4000 }, { id: "b", families: 1000, population: null }] }), null);
  assert.equal(estimateCampaignPersons({ plan, zones: [{ id: "a", families: 2000, population: 4000 }, { id: "b", families: 1000, population: 9000 }] }), null);
  assert.equal(estimateCampaignPersons({ plan: { ready: false, rows: [] }, zones: [] }), null);
  assert.equal(personsPerFamily(0, 10), null);
  assert.equal(personsPerFamily(25, 10), 2.5);
});
