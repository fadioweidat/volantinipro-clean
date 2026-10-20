type RpcResult = { data: any; error: any; status?: number };
type Rpc = (name: string, args: any) => PromiseLike<RpcResult>;

// Request-local only. Preserve the existing per-RPC result/error contract and
// resolver; consolidate the transport and connection checkout, not the data.
export function createBundledRpc(rpc: Rpc, params: {
  lat: number; lng: number; radiusKm: number; municipality: string; includeNil: boolean;
}, report: (event: any) => void): Rpc {
  let pending: Promise<RpcResult> | undefined;
  const names = new Set(['get_comuni_breakdown_in_radius', 'get_omi_zones_by_municipality']);
  if (params.includeNil) names.add('get_nil_breakdown_in_radius');
  return async (name, args) => {
    if (!names.has(name)) return rpc(name,args);
    if (!pending) {
      const started = performance.now();
      pending = Promise.resolve(rpc('get_step2_territorial_bundle', {
        p_lat:params.lat,p_lng:params.lng,p_radius_km:params.radiusKm,
        p_municipality:params.municipality,p_include_nil:params.includeNil,
      })).then(result => {
        report({phase:'territorial_bundle',rpcMs:Math.round(performance.now()-started),
          ok:!result.error && [...names].every(key => result.data?.[key] && !result.data[key].error),
          status:result.status??null,errorCode:result.error?.code??null,
          databasePhases:result.error?null:Object.fromEntries(Object.entries(result.data??{}).map(([key,value]:[string,any])=>[key,{
            databaseMs:value.databaseMs,ok:!value.error,errorCode:value.error?.code??null,
            rows:Array.isArray(value.data)?value.data.length:null,
          }]))});
        return result;
      });
    }
    const result = await pending;
    if (result.error) return {data:null,error:result.error,status:result.status};
    const phase = result.data?.[name];
    if (!phase || !('data' in phase) || !('error' in phase)) {
      return {data:null,error:{code:'INVALID_TERRITORIAL_BUNDLE',message:`Missing RPC result: ${name}`},status:502};
    }
    return phase;
  };
}
