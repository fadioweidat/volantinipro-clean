-- Keep existing functions, results, permissions and geographic calculations.
-- Explicit-municipality analysis uses one PostgREST checkout / PostGIS backend.
create or replace function public.get_step2_territorial_bundle(
  p_lat double precision, p_lng double precision, p_radius_km double precision,
  p_municipality text, p_include_nil boolean
) returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  result jsonb := '{}'::jsonb;
  rows_json jsonb;
  started timestamptz;
  phase text;
begin
  foreach phase in array array['get_comuni_breakdown_in_radius', 'get_nil_breakdown_in_radius', 'get_omi_zones_by_municipality'] loop
    if phase = 'get_nil_breakdown_in_radius' and not p_include_nil then continue; end if;
    started := clock_timestamp();
    begin
      if phase = 'get_comuni_breakdown_in_radius' then
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into rows_json
        from public.get_comuni_breakdown_in_radius(p_lat,p_lng,p_radius_km) t;
      elsif phase = 'get_nil_breakdown_in_radius' then
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into rows_json
        from public.get_nil_breakdown_in_radius(p_lat,p_lng,p_radius_km) t;
      else
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into rows_json
        from public.get_omi_zones_by_municipality(p_municipality,null) t;
      end if;
      result := result || jsonb_build_object(phase,jsonb_build_object(
        'data',rows_json,'error',null,'status',200,
        'databaseMs',round(extract(epoch from clock_timestamp()-started)*1000,3)));
    exception when others then
      result := result || jsonb_build_object(phase,jsonb_build_object(
        'data',null,'error',jsonb_build_object('message',sqlerrm,'code',sqlstate),'status',500,
        'databaseMs',round(extract(epoch from clock_timestamp()-started)*1000,3)));
    end;
  end loop;
  return result;
end;
$$;
revoke all on function public.get_step2_territorial_bundle(double precision,double precision,double precision,text,boolean) from public,anon,authenticated;
grant execute on function public.get_step2_territorial_bundle(double precision,double precision,double precision,text,boolean) to service_role;
