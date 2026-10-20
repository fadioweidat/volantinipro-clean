import test from 'node:test';
import assert from 'node:assert/strict';
import { createBundledRpc } from '../supabase/functions/analysis-istat/bundledRpc.ts';
const params={lat:45.5,lng:9.1,radiusKm:15,municipality:'Milano',includeNil:true};
test('three overlapping readers share one checkout, with distinct data and errors',async()=>{
 const calls=[],events=[];
 const nil={data:[{nil_code:'38'}],error:null,status:200};
 const comuni={data:null,error:{code:'57014',message:'statement timeout'},status:500};
 const omi={data:[{zone_code:'B01'}],error:null,status:200};
 const rpc=createBundledRpc(async(name,args)=>{calls.push({name,args});return {data:{get_nil_breakdown_in_radius:nil,get_comuni_breakdown_in_radius:comuni,get_omi_zones_by_municipality:omi},error:null,status:200};},params,e=>events.push(e));
 const values=await Promise.all(['get_nil_breakdown_in_radius','get_comuni_breakdown_in_radius','get_omi_zones_by_municipality'].map(name=>rpc(name,{})));
 assert.equal(calls.length,1); assert.deepEqual(values,[nil,comuni,omi]);
 assert.equal(events[0].databasePhases.get_comuni_breakdown_in_radius.ok,false);
});
test('separate point-of-sale requests never share promises or data',async()=>{
 const rpc=async(name,args)=>({data:{get_comuni_breakdown_in_radius:{data:[args.p_lat],error:null}},error:null});
 const a=createBundledRpc(rpc,params,()=>{});
 const b=createBundledRpc(rpc,{...params,lat:45.55},()=>{});
 assert.deepEqual((await a('get_comuni_breakdown_in_radius',{})).data,[45.5]);
 assert.deepEqual((await b('get_comuni_breakdown_in_radius',{})).data,[45.55]);
});
test('missing result and transport errors remain errors, later inferred NIL uses original RPC',async()=>{
 const err={code:'57014',message:'statement timeout'};
 const failed=createBundledRpc(async()=>({data:null,error:err,status:500}),params,()=>{});
 assert.equal((await failed('get_comuni_breakdown_in_radius',{})).error,err);
 const missing=createBundledRpc(async()=>({data:{},error:null}),params,()=>{});
 assert.equal((await missing('get_comuni_breakdown_in_radius',{})).error.code,'INVALID_TERRITORIAL_BUNDLE');
 const calls=[];
 const inferred=createBundledRpc(async(name,args)=>{calls.push({name,args});return {data:[1],error:null};},{...params,includeNil:false},()=>{});
 await inferred('get_nil_breakdown_in_radius',{radius_km:3});
 assert.deepEqual(calls,[{name:'get_nil_breakdown_in_radius',args:{radius_km:3}}]);
});
