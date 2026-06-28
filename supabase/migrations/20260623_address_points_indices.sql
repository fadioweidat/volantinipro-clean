CREATE INDEX IF NOT EXISTS idx_address_points_source_lat_lng
ON public.address_points (source, lat, lng);

CREATE INDEX IF NOT EXISTS idx_address_points_lat
ON public.address_points (lat);

CREATE INDEX IF NOT EXISTS idx_address_points_lng
ON public.address_points (lng);

CREATE INDEX IF NOT EXISTS idx_address_points_source
ON public.address_points (source);

CREATE INDEX IF NOT EXISTS idx_address_points_geom_gist
ON public.address_points
USING GIST (geom);
