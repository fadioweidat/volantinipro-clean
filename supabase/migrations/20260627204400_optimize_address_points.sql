-- Ottimizzazione indici tabella address_points per velocizzare query bbox in Step 2

CREATE INDEX IF NOT EXISTS idx_address_points_source_lat_lng
ON public.address_points (source, lat, lng);

CREATE INDEX IF NOT EXISTS idx_address_points_lat_lng
ON public.address_points (lat, lng);

CREATE INDEX IF NOT EXISTS idx_address_points_osm_lat_lng
ON public.address_points (lat, lng)
WHERE source = 'osm';

-- Funzione RPC per caricare i civici in modo super ottimizzato
CREATE OR REPLACE FUNCTION public.get_address_points_bbox(
  p_lat_min double precision,
  p_lat_max double precision,
  p_lng_min double precision,
  p_lng_max double precision,
  p_limit integer DEFAULT 1500
)
RETURNS TABLE (
  id bigint,
  lat double precision,
  lng double precision,
  source text
)
LANGUAGE sql
STABLE
AS $$
  SELECT ap.id, ap.lat, ap.lng, ap.source
  FROM public.address_points ap
  WHERE ap.source = 'osm'
    AND ap.lat BETWEEN p_lat_min AND p_lat_max
    AND ap.lng BETWEEN p_lng_min AND p_lng_max
  LIMIT LEAST(p_limit, 1500);
$$;
