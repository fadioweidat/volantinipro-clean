CREATE INDEX IF NOT EXISTS geo_municipalities_geography_gix
ON public.geo_municipalities USING gist ((geom::geography))
WHERE geom IS NOT NULL;
