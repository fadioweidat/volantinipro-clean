import React from 'react';
import { createRoot } from 'react-dom/client';
import { Step4 } from '../../src/pages/public/configurator/Step4.jsx';

const square = (lng, lat) => ({ type: 'Polygon', coordinates: [[[lng,lat],[lng+.016,lat],[lng+.016,lat+.012],[lng,lat+.012],[lng,lat]]] });
const units = [
  { id:'nil_1', name:'NIL TEST', isNil:true, nilCode:'1', parent_municipality:'Milano', familiesTotal:10000, densita:8000, geometry:square(9.10,45.46) },
  { id:'comune_baranzate', name:'Baranzate', municipality_code:'015250', isNil:false, familiesTotal:6000, densita:4000, geometry:square(9.116,45.46) },
];
const pv = (id,lng) => ({ id,readyForQuote:true,city:{name:'Milano',lat:45.46,lng:9.11},cityName:'Milano', selectedComuni:[{name:'Milano'}],searchMode:'address',radiusKm:3,selectedSearchPoint:{lat:45.466,lng,label:`Via Test ${id}, Milano`},assigned_flyers:10000,finalFlyers:10000,store_name:`PV ${id}`,kpiSnapshot:{families:14000,requiredFlyers:15000,areaMode:'radius',center:{lat:45.466,lng},radiusKm:3},allocation:units });
export const multiPv = {type:'d2d',service:'d2d',cityName:'Milano',quantity:20000,flyerQuantity:20000,flyers:20000,campaignZones:[pv('west',9.112),pv('east',9.121)]};
// The legacy multi-comune flow intentionally has NO campaignZones: minimum
// applies by municipality, unlike the per-PV commercial rule above.
export const multiComune = {type:'d2d',service:'d2d',cityName:'Milano',quantity:20000,flyerQuantity:20000,flyers:20000,
  serviceKpis:{families:15000,recommendedFlyers:20000,coverage:100},searchMode:'municipality',
  selectedComuni:[{name:'Milano'},{name:'Cormano'},{name:'Bresso'}],
  zonesAllocation:[{name:'Milano',assignedFlyers:10000,requiredFlyers:10000},{name:'Cormano',assignedFlyers:5000,requiredFlyers:5000},{name:'Bresso',assignedFlyers:5000,requiredFlyers:5000}],
};
export const makeStep4 = data => <Step4 data={data} setData={() => {}} onBack={() => {}} onNav={() => {}} onHome={() => {}} />;
if (typeof document !== 'undefined') {
  const chosen = new URLSearchParams(window.location.search).get('scenario') === 'multi-comune' ? multiComune : multiPv;
  window.addEventListener('error', e => { document.body.dataset.runtimeError = e.message || 'window error'; });
  window.addEventListener('unhandledrejection', e => { document.body.dataset.runtimeError = String(e.reason); });
  createRoot(document.getElementById('root')).render(makeStep4(chosen));
}
