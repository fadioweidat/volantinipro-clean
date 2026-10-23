-- address_points fuori dal database (opzione B, approvata 2026-10-23).
-- 337.049 civici OSM (242 MB), nessuna chiamata dal 16/09; il livello "Civici" dello Step 2 e' gia' rimosso
-- (commit 0003ec1). Export completo + prova di ripristino locale riuscita:
--   db-backups/address_points-export/ (address_points.schema.sql, address_points.data.sql, RIPRISTINO.md)
-- DROP senza CASCADE: se qualche altro oggetto dipendesse da questi, la migrazione si ferma.

DROP FUNCTION IF EXISTS "public"."get_address_points_bbox"(double precision, double precision, double precision, double precision, integer);
DROP FUNCTION IF EXISTS "public"."get_address_points_in_radius"(double precision, double precision, double precision);
DROP FUNCTION IF EXISTS "public"."get_address_points_osm_in_radius"(double precision, double precision, double precision, integer);
DROP FUNCTION IF EXISTS "public"."get_address_points_radius_summary"(double precision, double precision, double precision, integer);
DROP FUNCTION IF EXISTS "public"."materialize_dbgt_address_points"(text);
DROP FUNCTION IF EXISTS "public"."upsert_address_points_batch"(jsonb);

-- La tabella porta con se' indici, trigger e policy RLS.
DROP TABLE IF EXISTS "public"."address_points";

-- Funzioni dei due trigger, usate solo da address_points.
DROP FUNCTION IF EXISTS "public"."sync_address_points_geom"();
DROP FUNCTION IF EXISTS "public"."touch_address_points_updated_at"();
