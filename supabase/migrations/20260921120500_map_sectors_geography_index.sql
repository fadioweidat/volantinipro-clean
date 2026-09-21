begin;

-- Performance-only index for get_map_sectors().
-- The RPC filters with ST_DWithin(geometry::geography, ...). The existing
-- GiST index on geometry cannot accelerate that cast, which caused a
-- sequential scan on every public sector lookup.
create index if not exists idx_map_sectors_geography
  on public.map_sectors
  using gist ((geometry::geography));

commit;
