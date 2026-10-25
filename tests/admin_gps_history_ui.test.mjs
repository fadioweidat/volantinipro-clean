import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { transform } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const source=(await readFile(new URL('../src/pages/admin/AdminLiveDashboard.jsx',import.meta.url),'utf8'))
  .replace(/^import[\s\S]*?;\n/gm,'');
const out=new URL('./.admin-gps-history-ui.mjs',import.meta.url);
await writeFile(out,(await transform(`import React from 'react';
import { EXCLUSION_LABELS,calculateFilteredDistanceKm,summarizeGpsQuality } from '../src/lib/gps/pointQuality.js';
import { zoneStatusLabel } from '../src/lib/services/admin-gps-history-core.js';
const displayDriverName=s=>s.driver_name || 'Operatore '+s.driver_id.slice(0,6);
const displayDeviceId=s=>s.device_id || 'n/d';
const ZONE_LIVE_STATUS_LABELS={awaiting_gps:'In attesa GPS'};
const ZONE_LIVE_STATUS_COLORS={zone_unavailable:'#888888'};
${source}
export { DriverRow,SessionQualityPanel,LiveZoneStatusBadge,filterGridStyle,labelStyle,inputStyle };`,{loader:'jsx',format:'esm'})).code);
const {DriverRow,SessionQualityPanel,LiveZoneStatusBadge,filterGridStyle,labelStyle,inputStyle}=await import(out.href);
await unlink(out);
const item={session:{id:'77f4c70f',driver_id:'operator-id',driver_name:'Nome reale',campaign_id:'code',status:'completed'},
  points:[],pointCount:325,km:.67,campaignName:'Campagna reale',lifecycle:'history',status:'offline'};
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
test('row renders server count and real names before selected trace has loaded',()=>{
  const html=render(DriverRow,{item});assert.match(html,/325 punti/);assert.match(html,/0.67 km/);
  assert.match(html,/Nome reale/);assert.match(html,/Campagna reale/);assert.doesNotMatch(html,/0 punti/);
});
test('quality distinguishes pending/error from genuine zero',()=>{
  const loading=render(SessionQualityPanel,{item:{...item,traceLoading:true}});
  assert.match(loading,/325 punti nel database/);assert.match(loading,/Caricamento/);assert.doesNotMatch(loading,/Punti totali/);
  const error=render(SessionQualityPanel,{item:{...item,traceError:'Database non disponibile'}});
  assert.match(error,/Database non disponibile/);assert.doesNotMatch(error,/Punti totali/);
  const empty=render(SessionQualityPanel,{item:{...item,pointCount:0,km:0}});assert.match(empty,/Punti totali/);
});
test('terminal badge and bounded native selects prevent misleading text/overflow',()=>{
  assert.match(render(LiveZoneStatusBadge,{status:'session_ended'}),/Sessione conclusa/);
  assert.doesNotMatch(render(LiveZoneStatusBadge,{status:'session_ended'}),/In attesa GPS/);
  assert.equal(labelStyle.minWidth,0);assert.equal(inputStyle.width,'100%');
  assert.equal(inputStyle.boxSizing,'border-box');assert.match(filterGridStyle.gridTemplateColumns,/min\(100%,180px\)/);
});
