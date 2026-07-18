import assert from 'node:assert/strict';
import {
  calculateBusinessMaterials,
  calculateBusinessOperationalPlan,
  getBusinessCopiesForPoi,
} from '../src/lib/business/business-config.js';
import { getPoiTagsForTargets } from '../src/lib/services/poi-api.js';

const pois = [
  { id: 'a', category: 'Negozio' },
  { id: 'b', category: 'Studio medico' },
  { id: 'c', category: 'Negozio' },
];

const officeTargetCategories = getPoiTagsForTargets('b2b', ['business']).map(tag => tag.cat);
assert.deepEqual(officeTargetCategories, ['Ufficio']);
assert.equal(officeTargetCategories.includes('Hotel'), false, 'Il target Uffici e aziende non deve includere hotel');

const hospitalityTargetCategories = getPoiTagsForTargets('b2b', ['hospitality']).map(tag => tag.cat);
assert.deepEqual(hospitalityTargetCategories.sort(), ['Hotel', 'Struttura ricettiva'].sort());

assert.equal(getBusinessCopiesForPoi(pois[0], { businessCopiesMode: 'fixed_2' }), 2);
assert.equal(getBusinessCopiesForPoi(pois[0], {
  businessCopiesMode: 'by_category',
  businessCopiesByCategory: { Negozio: 4 },
}), 4);

assert.deepEqual(
  calculateBusinessMaterials(pois, { a: { copies: 2 }, b: { copies: 3 }, c: { copies: 1 } }, { businessMaterialQuantity: 10 }),
  {
    rows: [
      { ...pois[0], copies: 2 },
      { ...pois[1], copies: 3 },
      { ...pois[2], copies: 1 },
    ],
    inserted: 10,
    materialsRequired: 6,
    materialsRemaining: 4,
    materialsMissing: 0,
    selectedActivities: 3,
  },
);

const missing = calculateBusinessMaterials(pois, {}, {
  businessCopiesMode: 'fixed_2',
  businessMaterialQuantity: 4,
});
assert.equal(missing.materialsRequired, 6);
assert.equal(missing.materialsMissing, 2);
assert.equal(missing.materialsRemaining, 0);

const undefinedCopies = calculateBusinessMaterials(pois, {}, {
  businessCopiesMode: 'to_define',
  businessMaterialQuantity: 100,
});
assert.equal(undefinedCopies.materialsRequired, null);

const plan = calculateBusinessOperationalPlan(84, {
  businessDeliveryMethod: 'owner',
  businessPreferredStartDate: '2026-07-20',
  businessCompleteBy: '2026-07-21',
});
assert.equal(plan.calculable, true);
assert.equal(plan.minutesPerVisit, 10);
assert.equal(plan.visitsPerOperatorDay, 42);
assert.equal(plan.operatorDays, 2);
assert.equal(plan.availableDays, 2);
assert.equal(plan.recommendedOperators, 1);

const unknownPlan = calculateBusinessOperationalPlan(12, { businessDeliveryMethod: 'other' });
assert.equal(unknownPlan.calculable, false);

console.log('business_distribution.test.mjs: ok');
