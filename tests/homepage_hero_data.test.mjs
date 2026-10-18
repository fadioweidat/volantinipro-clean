import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeHomepageAnalysis,formatHeroMetric} from '../src/components/home/homepageHeroData.js';
const geo={type:'Polygon',coordinates:[[[9.1,45.5],[9.2,45.5],[9.2,45.6],[9.1,45.5]]]};
const row=(name,code,families,pct=50,total=families==null?null:families*2)=>({comune_name:name,municipality_code:code,households_in_radius:families,households_total:total,pct_copertura:pct,geometry_geojson:JSON.stringify(geo)});
test('Groups NIL under their real municipality without double-counting parent or duplicate rows',()=>{
const nil={...row('BRUZZANO','015146',100),nil_code:'83',nil_name:'BRUZZANO',territory_level:'nil'};
const data={comuni_breakdown:[row('Milano','015146',999),nil,nil,{...nil,nil_code:'82',nil_name:'COMASINA',households_in_radius:200,households_total:400},row('Cormano','015086',300,100,300)]};const before=JSON.stringify(data);const a=normalizeHomepageAnalysis(data);
assert.equal(a.municipalityCount,2);assert.equal(a.families,600);assert.equal(a.familiesShare,67); // (100+200+300)/(200+400+300)assert.equal(a.groups.find(g=>g.id==='015146').features.length,2);assert.equal(a.groups.reduce((s,g)=>s+g.share,0),100);assert.equal(JSON.stringify(data),before);
});
test('Null, error and empty response never produce invented KPIs',()=>{for(const data of [null,{error:'unavailable'},{comuni_breakdown:[]}]){const a=normalizeHomepageAnalysis(data);assert.equal(a.families,null);assert.equal(a.familiesShare,null);assert.deepEqual(a.groups,[]);}assert.equal(formatHeroMetric(null),'—');});
test('Zero is a real measurement; missing values are not coerced to zero',()=>{const a=normalizeHomepageAnalysis({comuni_breakdown:[row('Cormano','015086',0,0,500)]});assert.equal(a.families,0);assert.equal(a.familiesShare,0);assert.equal(a.groups[0].share,null);const b=normalizeHomepageAnalysis({comuni_breakdown:[row('Cormano','015086',null)]});assert.equal(b.families,null);});
test('Invalid geometry is omitted, never fabricated, while real metrics remain visible',()=>{const r=row('Cormano','015086',123);r.geometry_geojson='{broken';const a=normalizeHomepageAnalysis({comuni_breakdown:[r]});assert.equal(a.families,123);assert.equal(a.missingGeometries,1);assert.equal(a.groups[0].features.length,0);});
test('Map and summary share the exact same geometry and counts',()=>{const a=normalizeHomepageAnalysis({comuni_breakdown:[row('Cormano','015086',700),row('Bresso','015032',300)]});assert.equal(a.families,1000);assert.deepEqual(a.groups.map(g=>g.share),[70,30]);assert.deepEqual(a.groups[0].features[0].geometry,geo);});

test('familiesShare is weighted by families (sum in radius / sum of totals), never a mean of percentages',()=>{
  // Real shape of the Cormano 3 km hero response: 100% of a small comune + 6% of a large one.
  const a=normalizeHomepageAnalysis({comuni_breakdown:[row('Cormano','015086',9297,100,9297),row('Cinisello Balsamo','015077',2074,6,34563)]});
  assert.equal(a.familiesShare,Math.round(100*(9297+2074)/(9297+34563))); // 26, not (100+6)/2 = 53
  assert.equal(a.familiesShare,26);
});
test('familiesShare is null when a territory lacks the in-radius or total figure (no invented share)',()=>{
  const missingTotal=row('Bresso','015032',300,50,null);
  assert.equal(normalizeHomepageAnalysis({comuni_breakdown:[row('Cormano','015086',700,100,700),missingTotal]}).familiesShare,null);
  assert.equal(normalizeHomepageAnalysis({comuni_breakdown:[row('Cormano','015086',700,100,700),row('Bresso','015032',null,50,1000)]}).familiesShare,null);
  assert.equal(normalizeHomepageAnalysis({comuni_breakdown:[row('Cormano','015086',900,100,700)]}).familiesShare,null,'in-radius above total is inconsistent data');
});
test('hero shows the families share with its plain-language label and updated methodology',async()=>{
  const {readFileSync}=await import('node:fs');
  const hero=readFileSync(new URL('../src/components/home/VolantiniProHeroMap.jsx',import.meta.url),'utf8');
  assert.match(hero,/\['coverage', 'delle famiglie dei comuni coinvolti', `\$\{metric\(analysis\.familiesShare\)\}/);
  assert.match(hero,/<span>delle famiglie dei comuni coinvolti <a className="vph-info"/);
  assert.doesNotMatch(hero,/Copertura stimata|analysis\.coverage|media delle percentuali/);
  assert.match(hero,/rapporto tra le famiglie dentro il raggio e le famiglie totali dei comuni coinvolti/);
});
