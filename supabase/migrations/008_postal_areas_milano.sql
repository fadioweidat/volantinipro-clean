ALTER TABLE geo_postal_areas ADD COLUMN IF NOT EXISTS area_km2 numeric;
ALTER TABLE geo_postal_areas ADD COLUMN IF NOT EXISTS households_estimated numeric;
ALTER TABLE geo_postal_areas ADD COLUMN IF NOT EXISTS population_estimated numeric;

-- Delete any incomplete Milano CAPs so we can re-insert cleanly
DELETE FROM geo_postal_areas WHERE municipality_name = 'Milano' AND geom_geojson IS NULL;

-- Insert Milano CAPs (20121 to 20162)
INSERT INTO geo_postal_areas (postal_code, municipality_name, province_code, region_name, area_km2, households_estimated, population_estimated)
SELECT 
  cap::text, 
  'Milano', 
  '015', 
  'Lombardia', 
  4.3, 
  16500, 
  32500 
FROM generate_series(20121, 20162) as cap
WHERE NOT EXISTS (
  SELECT 1 FROM geo_postal_areas WHERE postal_code = cap::text
);

CREATE OR REPLACE FUNCTION get_postal_areas_analysis(postal_codes text[])
RETURNS TABLE (
  postal_code text,
  municipality_name text,
  households_estimated numeric,
  population_estimated numeric,
  area_km2 numeric,
  recommended_flyers numeric,
  geometry_geojson jsonb,
  source_flags text[]
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.postal_code,
    p.municipality_name,
    COALESCE(p.households_estimated, (m.households_total * (COALESCE(p.area_km2, 1) / NULLIF(m.area_km2, 1)))::numeric) AS households_estimated,
    COALESCE(p.population_estimated, (m.population_total * (COALESCE(p.area_km2, 1) / NULLIF(m.area_km2, 1)))::numeric) AS population_estimated,
    COALESCE(p.area_km2, 0) AS area_km2,
    (COALESCE(p.households_estimated, (m.households_total * (COALESCE(p.area_km2, 1) / NULLIF(m.area_km2, 1)))) * 1.05)::numeric AS recommended_flyers,
    p.geom_geojson::jsonb AS geometry_geojson,
    CASE 
      WHEN p.geom_geojson IS NOT NULL THEN ARRAY['Dati geografici CAP', 'Stima territoriale']::text[]
      ELSE ARRAY['Stima territoriale']::text[]
    END AS source_flags
  FROM geo_postal_areas p
  LEFT JOIN geo_municipalities m ON m.municipality_name = p.municipality_name
  WHERE p.postal_code = ANY(postal_codes);
END;
$$;
