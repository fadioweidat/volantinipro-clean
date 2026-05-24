-- ============================================================
-- Migration 001: map_sectors
-- Operational delivery sectors — micro-zones that subdivide
-- municipalities for distribution planning.
--
-- Run via Supabase SQL Editor or `supabase db push`.
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE.
-- ============================================================


-- 1. TABLE ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.map_sectors (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type      TEXT         NOT NULL
                      CHECK (service_type IN ('d2d', 'h2h', 'b2b')),
  municipality_code TEXT         NOT NULL,   -- 6-digit ISTAT code
  sector_number     INTEGER      NOT NULL DEFAULT 1,
  sector_name       TEXT,
  geometry          GEOMETRY(MultiPolygon, 4326) NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (service_type, municipality_code, sector_number)
);

COMMENT ON TABLE  public.map_sectors IS
  'Operational delivery sectors: micro-zones subdividing municipalities for distribution planning.';
COMMENT ON COLUMN public.map_sectors.municipality_code IS
  '6-digit ISTAT municipality code (e.g. 015146 = Milano).';
COMMENT ON COLUMN public.map_sectors.sector_number IS
  'Sequential sector number within the municipality, starting at 1.';


-- 2. INDEXES ──────────────────────────────────────────────────

-- Spatial index — critical for radius queries
CREATE INDEX IF NOT EXISTS idx_map_sectors_geometry
  ON public.map_sectors USING GIST (geometry);

-- Lookup by municipality
CREATE INDEX IF NOT EXISTS idx_map_sectors_municipality
  ON public.map_sectors (municipality_code);

-- Compound index for the most common query pattern
CREATE INDEX IF NOT EXISTS idx_map_sectors_service_municipality
  ON public.map_sectors (service_type, municipality_code);


-- 3. ROW LEVEL SECURITY ───────────────────────────────────────

ALTER TABLE public.map_sectors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'map_sectors' AND policyname = 'Public read'
  ) THEN
    CREATE POLICY "Public read"
      ON public.map_sectors
      FOR SELECT
      USING (true);
  END IF;
END $$;


-- 4. UPDATED_AT TRIGGER ───────────────────────────────────────

-- Reuse existing helper if available, else create it
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_map_sectors_updated_at ON public.map_sectors;

CREATE TRIGGER trg_map_sectors_updated_at
  BEFORE UPDATE ON public.map_sectors
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();


-- 5. RPC FUNCTION: get_map_sectors ────────────────────────────
--
-- Returns a GeoJSON FeatureCollection of sectors whose geometry
-- intersects the circle defined by (p_center_lat, p_center_lng, p_radius_km).
--
-- Called by the frontend via:
--   supabase.rpc('get_map_sectors', { p_service_type, p_center_lat, p_center_lng, p_radius_km })

CREATE OR REPLACE FUNCTION public.get_map_sectors(
  p_service_type TEXT,
  p_center_lat   FLOAT,
  p_center_lng   FLOAT,
  p_radius_km    FLOAT DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'type',     'FeatureCollection',
    'features', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type',       'Feature',
          'geometry',   ST_AsGeoJSON(s.geometry)::jsonb,
          'properties', jsonb_build_object(
            'id',                s.id,
            'municipality_code', s.municipality_code,
            'sector_number',     s.sector_number,
            'sector_name',       s.sector_name,
            'service_type',      s.service_type
          )
        )
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM public.map_sectors s
  WHERE s.service_type = p_service_type
    AND ST_DWithin(
          s.geometry::geography,
          ST_SetSRID(ST_MakePoint(p_center_lng, p_center_lat), 4326)::geography,
          p_radius_km * 1000   -- metres
        );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_map_sectors IS
  'Returns a GeoJSON FeatureCollection of operational sectors within a radius of a center point.';


-- ============================================================
-- HOW TO POPULATE SECTORS
-- ============================================================
-- INSERT example (replace geometry with actual MultiPolygon WKT):
--
-- INSERT INTO public.map_sectors
--   (service_type, municipality_code, sector_number, sector_name, geometry)
-- VALUES
--   ('d2d', '015146', 1, 'Centro', ST_GeomFromText('MULTIPOLYGON(((9.18 45.46,9.19 45.46,9.19 45.47,9.18 45.47,9.18 45.46)))', 4326)),
--   ('d2d', '015146', 2, 'Nord',   ST_GeomFromText('MULTIPOLYGON(((9.18 45.47,9.19 45.47,9.19 45.48,9.18 45.48,9.18 45.47)))', 4326));
--
-- For bulk import from Shapefile/GeoJSON, use the data/istat/ import scripts
-- or a PostGIS-aware tool (QGIS, ogr2ogr).
-- ============================================================
