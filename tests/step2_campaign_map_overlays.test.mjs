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

test('inactive NIL IDs resolve exact loaded geometry without mutating the saved snapshot', () => {
  const incomplete = [{...zones[0], zonesAllocation:[{id:'nil_certosa'}]}, zones[1]];
  const loaded = zones[0].zonesAllocation;
  const result = buildCampaignMapOverlays(incomplete, 'parco', zones[1].zonesAllocation, loaded);
  assert.equal(result.find(row => row.ownerId === 'certosa').geometry, polygon);
  assert.equal(incomplete[0].zonesAllocation[0].geometry, undefined);
});

test('geometry lookup never borrows a matching ID from a different city', () => {
  const owners = [{id:'a', cityName:'Roma', nilManualMode:true, selected:['same'], allocation:[]}, {id:'b', cityName:'Milano'}];
  assert.deepEqual(buildCampaignMapOverlays(owners, 'b', [], [{id:'same',geometry:polygon}]), []);
});

test('same municipality resolves geometry across geocoder labels and place IDs', () => {
  const owners=[{...zones[0],city:{label:'Milano',id:'bootstrap'},zonesAllocation:[]},{...zones[1],city:{label:'Milano (MI)',id:'osm:123'}}];
  assert.equal(buildCampaignMapOverlays(owners,'parco',zones[1].zonesAllocation,zones[0].zonesAllocation).length,2);
});
