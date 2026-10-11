import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCampaignMapOverlays, pointOfSaleMapColor } from '../src/lib/step2/campaignMapOverlays.js';

const polygon = { type: 'Polygon', coordinates: [[[9,45],[9.1,45],[9.1,45.1],[9,45]]] };
const zones = [
  { id:'certosa', store_name:'Certosa', nilManualMode:true, selected:['nil_certosa'], zonesAllocation:[{id:'nil_certosa',name:'CERTOSA',geometry:polygon},{id:'other',geometry:polygon}] },
  { id:'parco', store_name:'Parco Nord', nilManualMode:true, selected:['nil_parco'], zonesAllocation:[{id:'nil_parco',name:'PARCO NORD',geometry:polygon}] },
];
test('both PVs remain visible; active rows cannot overwrite the inactive selection', () => {
  const before = JSON.stringify(zones);
  const overlays = buildCampaignMapOverlays(zones,'parco',zones[1].zonesAllocation);
  assert.deepEqual(overlays.map(x=>x.key),['certosa:nil_certosa','parco:nil_parco']);
  assert.equal(overlays[0].geometry,polygon);
  assert.deepEqual(overlays.map(x=>x.active),[false,true]);
  assert.equal(JSON.stringify(zones),before);
});
test('switching PV preserves geometry and color ownership', () => {
  const a=buildCampaignMapOverlays(zones,'certosa',zones[0].zonesAllocation);
  const b=buildCampaignMapOverlays([...zones].reverse(),'parco',zones[1].zonesAllocation);
  assert.equal(a.find(x=>x.ownerId==='certosa').color,b.find(x=>x.ownerId==='certosa').color);
  assert.equal(pointOfSaleMapColor('certosa'),pointOfSaleMapColor('certosa'));
});
test('overlapping polygons are preserved per owner, not deduplicated across PVs', () => {
  assert.equal(buildCampaignMapOverlays(zones,'parco',zones[1].zonesAllocation).length,2);
});
test('missing geometry never becomes an invented polygon; single PV is unchanged', () => {
  assert.deepEqual(buildCampaignMapOverlays([zones[0]],'certosa',zones[0].zonesAllocation),[]);
  assert.deepEqual(buildCampaignMapOverlays([{id:'a',zonesAllocation:[{id:'x'}]},{id:'b'}],'b',[]),[]);
});

test('colliding PV IDs receive distinct stable colors; cleared NIL selections stay empty', () => {
  const owners = [{id:'a'}, {id:'g'}];
  assert.notEqual(pointOfSaleMapColor('a', owners),pointOfSaleMapColor('g', owners));
  assert.equal(pointOfSaleMapColor('a', owners),pointOfSaleMapColor('a', [...owners].reverse()));
  const cleared = [{...zones[0], selected:[]}, zones[1]];
  assert.deepEqual(buildCampaignMapOverlays(cleared,'parco',zones[1].zonesAllocation).map(x=>x.ownerId),['parco']);
});
