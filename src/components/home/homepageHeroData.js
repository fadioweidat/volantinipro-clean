// Homepage-only, pure read adapter. Never reads or writes configurator state.
export const HERO_SCENARIO = Object.freeze({ name: 'Cormano', label: 'Cormano · Milano Nord', lat: 45.551, lng: 9.163, radiusKm: 3 });
const COLORS = ['#ff727c', '#ff873b', '#459cff', '#aa69ff', '#ffcf45', '#2ce5c4', '#ea57cc', '#69dc77', '#53c6ef'];
function number(value) { if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null; const n=Number(value); return Number.isFinite(n)&&n>=0?n:null; }
function geometry(value) {
  try { const g=typeof value==='string'?JSON.parse(value):value; const geo=g?.type==='Feature'?g.geometry:g;
    if (!['Polygon','MultiPolygon'].includes(geo?.type)) return null;
    const polygons=geo.type==='Polygon'?[geo.coordinates]:geo.coordinates;
    if (!Array.isArray(polygons)||!polygons.length||!polygons.every(p=>Array.isArray(p)&&p.length&&p.every(r=>Array.isArray(r)&&r.length>=4&&r.every(c=>Array.isArray(c)&&c.length>=2&&Number.isFinite(c[0])&&Number.isFinite(c[1])&&Math.abs(c[0])<=180&&Math.abs(c[1])<=90)))) return null;
    return geo;
  } catch { return null; }
}
export function normalizeHomepageAnalysis(data) {
  if (!data || data.error) return { groups: [], families: null, coverage: null, municipalityCount: null, missingGeometries: 0, sources: [] };
  const groups=new Map(), seen=new Set(), coverages=[]; let missingGeometries=0;
  const rows=Array.isArray(data.comuni_breakdown)?data.comuni_breakdown:[];
  // Prefer the returned NIL detail when a response also includes its parent municipality.
  const nilParents=new Set(rows.filter(r=>r.nil_code||r.territory_level==='nil').map(r=>String(r.municipality_code||'')));
  for (const row of rows) {
    const code=String(row.municipality_code||row.comune_code||''); const isNil=Boolean(row.nil_code||row.territory_level==='nil');
    if (!code||(!isNil&&nilParents.has(code))) continue;
    const name=isNil?(row.municipality_name||(code==='015146'?'Milano':null)):(row.comune_name||row.municipality_name);
    if (!name) continue;
    const key=`${code}:${isNil?row.nil_code||row.nil_name:'comune'}`; if(seen.has(key))continue; seen.add(key);
    const families=number(row.households_in_radius ?? row.famiglie_nel_raggio);
    const pct=number(row.pct_copertura); coverages.push(pct!==null&&pct<=100?pct:null);
    const geo=geometry(row.geometry_geojson ?? row.geometry); if(!geo)missingGeometries++;
    if(!groups.has(code))groups.set(code,{id:code,name,families:0,partial:false,isNil,units:[],features:[]});
    const group=groups.get(code); if(families===null)group.partial=true; else group.families+=families;
    group.units.push({name:row.nil_name||row.comune_name, families,coverage:pct});
    if(geo)group.features.push({type:'Feature',properties:{municipalityCode:code,name},geometry:geo});
  }
  const result=[...groups.values()].map(g=>({...g,families:g.partial?null:g.families})).sort((a,b)=>(b.families??-1)-(a.families??-1));
  const families=result.length&&result.every(g=>g.families!==null)?result.reduce((s,g)=>s+g.families,0):null;
  return {groups:result.map((g,i)=>({...g,color:COLORS[i%COLORS.length],share:families>0&&g.families!==null?100*g.families/families:null})),families,municipalityCount:result.length||null,coverage:coverages.length&&coverages.every(n=>n!==null)?Math.round(coverages.reduce((s,n)=>s+n,0)/coverages.length):null,missingGeometries,sources:Array.isArray(data.sources)?data.sources.filter(s=>typeof s==='string'&&/ISTAT|PostGIS|geograf/i.test(s)):[]};
}
export const formatHeroMetric = value => value===null||value===undefined?'—':new Intl.NumberFormat('it-IT',{maximumFractionDigits:0,useGrouping:"always"}).format(value);
