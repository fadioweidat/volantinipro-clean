-- Fix timeout on address_points bbox queries
-- Adds partial index on (lat, lng) WHERE source = 'osm' — the hottest query path
-- All CREATE INDEX statements are idempotent (IF NOT EXISTS)

CREATE INDEX IF NOT EXISTS idx_address_points_osm_lat_lng
ON public.address_points (lat, lng)
WHERE source = 'osm';

CREATE INDEX IF NOT EXISTS idx_address_points_source_lat_lng
ON public.address_points (source, lat, lng);
