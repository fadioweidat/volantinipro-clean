import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = 'https://mqkelrsvksrzrpmbstvd.supabase.co';
const headers = { apikey: process.env.STEP2_PUBLIC_KEY, 'Content-Type': 'application/json' };
if (!headers.apikey) throw new Error('STEP2_PUBLIC_KEY required');
const output = process.argv[2] || 'baseline';
// Direct anon comuni/NIL probes are RLS-filtered and return []; they are NOT
// equivalent SQL benchmarks for service-role calls made by analysis-istat.
mkdirSync('review-artifacts/step2-timeout', { recursive: true });
const calls = [
 ['analysis', '/functions/v1/analysis-istat?lat=45.463945&lng=9.188558&radius=15&service=d2d&municipality=Milano&quantity=10000&analysisLevel=nil&selectionScope=municipality&selectedMunicipalityCodes=015146'],
 ['comuni', '/rest/v1/rpc/get_comuni_breakdown_in_radius', {p_lat:45.463945,p_lng:9.188558,p_radius_km:15}],
 ['nil','/rest/v1/rpc/get_nil_breakdown_in_radius',{center_lat:45.463945,center_lng:9.188558,radius_km:15}],
 ['sectors','/rest/v1/rpc/get_map_sectors',{p_service_type:'d2d',p_center_lat:45.504,p_center_lng:9.13,p_radius_km:2.5}]
];
const results = [];
for(let round=0;round<3;round++) for(const [name,path,body] of calls){
 const started=performance.now();
 const response=await fetch(base+path,{headers,method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});
 const ttfb=performance.now()-started;
 const text=await response.text(); const downloaded=performance.now();
 const json=JSON.parse(text); const end=performance.now();
 const row={round,name,at:new Date().toISOString(),status:response.status,ttfbMs:Math.round(ttfb),totalMs:Math.round(end-started),parseMs:Math.round(end-downloaded),bytes:Buffer.byteLength(text),requestId:response.headers.get('sb-request-id'),hash:createHash('sha256').update(text).digest('hex'),error:json.error||json.code||null,rows:Array.isArray(json)?json.length:json.nil_breakdown?.length??json.features?.length,warnings:json.metadata?.warnings};
 results.push(row); console.log(JSON.stringify(row));
 writeFileSync(`review-artifacts/step2-timeout/${output}-${name}-${round}.json`,text);
 writeFileSync(`review-artifacts/step2-timeout/${output}-timings.json`,JSON.stringify(results,null,2));
}
