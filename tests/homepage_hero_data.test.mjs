import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeHomepageAnalysis,formatHeroMetric} from '../src/components/home/homepageHeroData.js';
const geo={type:'Polygon',coordinates:[[[9.1,45.5],[9.2,45.5],[9.2,45.6],[9.1,45.5]]]};
const row=(name,code,families,pct=50)=>({comune_name:name,municipality_code:code,households_in_radius:families,pct_copertura:pct,geometry_geojson:JSON.stringify(geo)});
test('Groups NIL under their real municipality without double-counting parent or duplicate rows',()=>{
const nil={...row('BRUZZANO','015146',100),nil_code:'83',nil_name:'BRUZZANO',territory_level:'nil'};
const data={comuni_breakdown:[row('Milano','015146',999),nil,nil,{...nil,nil_code:'82',nil_name:'COMASINA',households_in_radius:200},row('Cormano','015086',300,100)]};const before=JSON.stringify(data);const a=normalizeHomepageAnalysis(data);
assert.equal(a.municipalityCount,2);assert.equal(a.families,600);assert.equal(a.coverage,67);assert.equal(a.groups.find(g=>g.id==='015146').features.length,2);assert.equal(a.groups.reduce((s,g)=>s+g.share,0),100);assert.equal(JSON.stringify(data),before);
});
test('Null, error and empty response never produce invented KPIs',()=>{for(const data of [null,{error:'unavailable'},{comuni_breakdown:[]}]){const a=normalizeHomepageAnalysis(data);assert.equal(a.families,null);assert.equal(a.coverage,null);assert.deepEqual(a.groups,[]);}assert.equal(formatHeroMetric(null),'—');});
test('Zero is a real measurement; missing values are not coerced to zero',()=>{const a=normalizeHomepageAnalysis({comuni_breakdown:[row('Cormano','015086',0,0)]});assert.equal(a.families,0);assert.equal(a.coverage,0);assert.equal(a.groups[0].share,null);const b=normalizeHomepageAnalysis({comuni_breakdown:[row('Cormano','015086',null)]});assert.equal(b.families,null);});
test('Invalid geometry is omitted, never fabricated, while real metrics remain visible',()=>{const r=row('Cormano','015086',123);r.geometry_geojson='{broken';const a=normalizeHomepageAnalysis({comuni_breakdown:[r]});assert.equal(a.families,123);assert.equal(a.missingGeometries,1);assert.equal(a.groups[0].features.length,0);});
test('Map and summary share the exact same geometry and counts',()=>{const a=normalizeHomepageAnalysis({comuni_breakdown:[row('Cormano','015086',700),row('Bresso','015032',300)]});assert.equal(a.families,1000);assert.deepEqual(a.groups.map(g=>g.share),[70,30]);assert.deepEqual(a.groups[0].features[0].geometry,geo);});
