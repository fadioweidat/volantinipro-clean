begin;

-- analysis-istat invokes get_comuni_breakdown_in_radius with the Edge
-- Runtime service_role. The function is intentionally SECURITY INVOKER, so
-- that role needs read access to the two public, non-personal source tables.
grant select on table public.geo_municipalities to service_role;
grant select on table public.demographic_indicators to service_role;
grant select on table public.gtfs_stops to service_role;
grant select, insert, update on table public.poi_cache to service_role;
grant insert on table public.poi_search_logs to service_role;

commit;
