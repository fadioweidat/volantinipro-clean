import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='https://mqkelrsvksrzrpmbstvd.supabase.co';
const key=process.env.STEP2_PUBLIC_KEY;
if(!key) throw new Error('STEP2_PUBLIC_KEY required');
const headers={apikey:key,'Content-Type':'application/json'};
const results=[];
for(let round=0;round<3;round++){
 const outcomes = await Promise.allSettled([['certosa',45.504,9.130],['bruzzano',45.528,9.173]].flatMap(([pv,lat,lng])=>[
  ['analysis',`/functions/v1/analysis-istat?lat=${lat}&lng=${lng}&radius=3&service=d2d&municipality=Milano&analysisLevel=nil&selectionScope=radius`],
  ['sectors','/rest/v1/rpc/get_map_sectors',{p_service_type:'d2d',p_center_lat:lat,p_center_lng:lng,p_radius_km:3}]
 ].map(async([name,path,body])=>{
  const start=performance.now();
  const res=await fetch(base+path,{headers,method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});
  const ttfb=performance.now()-start;
  const text=await res.text();const data=JSON.parse(text);
  const row={round,pv,name,at:new Date().toISOString(),status:res.status,ttfbMs:Math.round(ttfb),totalMs:Math.round(performance.now()-start),bytes:Buffer.byteLength(text),error:data.error||data.code||null,rows:data.nil_breakdown?.length??data.features?.length,hash:createHash('sha256').update(text).digest('hex'),requestId:res.headers.get('sb-request-id')};
  results.push(row);console.log(JSON.stringify(row));
  writeFileSync(`review-artifacts/step2-timeout/${process.argv[2]}-${pv}-${name}-${round}.json`,text);
 })));
 for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
}
writeFileSync(`review-artifacts/step2-timeout/${process.argv[2]}-timings.json`,JSON.stringify(results,null,2));
