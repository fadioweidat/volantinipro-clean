


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" DEFAULT 'Campagna senza titolo'::"text" NOT NULL,
    "service_type" "text" NOT NULL,
    "distribution_mode" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "address_input" "text",
    "place_id" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "radius_m" integer,
    "target_quantity" integer,
    "distribution_start_date" "date",
    "distribution_end_date" "date",
    "notes" "text",
    "ai_summary" "text",
    "estimated_price" numeric(12,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "address" "text",
    "client_name" "text",
    "client_phone" "text",
    "client_email" "text",
    "campaign_name" "text",
    "zone_name" "text",
    "city" "text",
    "lat" double precision,
    "lng" double precision,
    "radius_km" numeric,
    "quantity" integer,
    "total_amount" numeric,
    "is_test" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "start_date" "date",
    "end_date" "date",
    "source" "text" DEFAULT 'manual'::"text",
    "customer_id" "uuid",
    "customer_name" "text",
    "campaign_type" "text",
    "center_lat" double precision,
    "center_lng" double precision,
    "total_flyers" integer DEFAULT 0 NOT NULL,
    "total_budget" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "ai_suggestions" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_review'::"text", 'approved'::"text", 'scheduled'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text", 'archived'::"text", 'problem'::"text"])))
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_archive_campaign"("p_campaign_id" "uuid", "p_reason" "text") RETURNS "public"."campaigns"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_old public.campaigns%rowtype;
  v_new public.campaigns%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text, 0)
  );

  select * into v_old from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_old.status not in ('completed', 'cancelled') then
    raise exception 'STATO_NON_ARCHIVIABILE' using errcode = '22023';
  end if;

  update public.campaigns
    set status = 'archived', updated_at = now()
    where id = p_campaign_id
    returning * into v_new;

  perform public.admin_log_campaign_action(
    p_campaign_id, 'campaign_archived', v_old.status, 'archived', p_reason
  );

  return v_new;
end;
$$;


ALTER FUNCTION "public"."admin_archive_campaign"("p_campaign_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_cancel_campaign"("p_campaign_id" "uuid", "p_reason" "text") RETURNS "public"."campaigns"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_old public.campaigns%rowtype;
  v_new public.campaigns%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text, 0)
  );

  select * into v_old from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_old.status = 'cancelled' then
    raise exception 'CAMPAGNA_GIA_ANNULLATA' using errcode = '22023';
  end if;
  -- 'archived' e' uno stato amministrativo chiuso con un solo percorso di
  -- uscita esplicito e tracciato (reopen -> stato operativo ricostruito
  -- dall'audit, vedi admin_reopen_campaign). Annullare direttamente una
  -- campagna archiviata bypasserebbe quella ricostruzione: va prima
  -- riaperta.
  if v_old.status = 'archived' then
    raise exception 'CAMPAGNA_ARCHIVIATA_RIAPRIRE_PRIMA' using errcode = '22023';
  end if;

  update public.campaigns
    set status = 'cancelled', updated_at = now()
    where id = p_campaign_id
    returning * into v_new;

  perform public.admin_log_campaign_action(
    p_campaign_id, 'campaign_cancelled', v_old.status, 'cancelled', p_reason
  );

  return v_new;
end;
$$;


ALTER FUNCTION "public"."admin_cancel_campaign"("p_campaign_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_zone_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_zone_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "automatic_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    "manual_percent" numeric(5,2),
    "manual_override_enabled" boolean DEFAULT false NOT NULL,
    "override_reason" "text",
    "calculation_version" "text" DEFAULT 'zone-progress-v1'::"text" NOT NULL,
    "source_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "automatic_updated_at" timestamp with time zone,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "adjustment_type" "text",
    "inaccessible_percent" numeric(5,2),
    "notes" "text",
    "source" "text" DEFAULT 'legacy'::"text" NOT NULL,
    "effective_percent" numeric(5,2),
    CONSTRAINT "campaign_zone_progress_adjustment_type_check" CHECK (("adjustment_type" = ANY (ARRAY['manual_covered'::"text", 'partially_covered'::"text", 'inaccessible'::"text"]))),
    CONSTRAINT "campaign_zone_progress_automatic_percent_range" CHECK ((("automatic_percent" >= (0)::numeric) AND ("automatic_percent" <= (100)::numeric))),
    CONSTRAINT "campaign_zone_progress_effective_percent_range" CHECK ((("effective_percent" IS NULL) OR (("effective_percent" >= (0)::numeric) AND ("effective_percent" <= (100)::numeric)))),
    CONSTRAINT "campaign_zone_progress_inaccessible_percent_check" CHECK ((("inaccessible_percent" IS NULL) OR (("inaccessible_percent" >= (0)::numeric) AND ("inaccessible_percent" <= (100)::numeric)))),
    CONSTRAINT "campaign_zone_progress_manual_percent_range" CHECK ((("manual_percent" IS NULL) OR (("manual_percent" >= (0)::numeric) AND ("manual_percent" <= (100)::numeric)))),
    CONSTRAINT "campaign_zone_progress_override_consistency" CHECK (((("manual_override_enabled" = true) AND ("manual_percent" IS NOT NULL) AND (NULLIF("btrim"("override_reason"), ''::"text") IS NOT NULL)) OR (("manual_override_enabled" = false) AND ("manual_percent" IS NULL)))),
    CONSTRAINT "campaign_zone_progress_source_check" CHECK (("source" = ANY (ARRAY['legacy'::"text", 'geometric'::"text"])))
);

ALTER TABLE ONLY "public"."campaign_zone_progress" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_zone_progress" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_clear_zone_manual_progress"("p_campaign_zone_id" "uuid", "p_reason" "text") RETURNS "public"."campaign_zone_progress"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_campaign_id uuid;
  v_old public.campaign_zone_progress%rowtype;
  v_new public.campaign_zone_progress%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if exists (select 1 from public.campaign_coverage_adjustments where zone_id = p_campaign_zone_id) then
    raise exception 'ZONA_GESTITA_DA_CORREZIONE_GEOMETRICA: revoca le correzioni poligono per questa zona, non l''override percentuale.' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select z.campaign_id into v_campaign_id from public.campaign_zones z where z.id = p_campaign_zone_id;
  if v_campaign_id is null then
    raise exception 'ZONA_CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  select * into v_old from public.campaign_zone_progress where campaign_zone_id = p_campaign_zone_id for update;

  insert into public.campaign_zone_progress (
    campaign_zone_id, campaign_id, source, adjustment_type, manual_percent, inaccessible_percent,
    manual_override_enabled, override_reason, notes, updated_by, updated_at
  ) values (
    p_campaign_zone_id, v_campaign_id, 'legacy', null, null, null, false, null, null, v_uid, now()
  )
  on conflict (campaign_zone_id) do update
    set source = 'legacy', adjustment_type = null, manual_percent = null, inaccessible_percent = null,
        manual_override_enabled = false, override_reason = null, notes = null, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id, campaign_zone_id, campaign_id, campaign_zone_id_snapshot, campaign_id_snapshot, zone_name_snapshot,
    event_type, old_automatic_percent, new_automatic_percent, old_manual_percent, new_manual_percent,
    old_effective_percent, new_effective_percent, old_manual_override_enabled, new_manual_override_enabled,
    old_adjustment_type, adjustment_type, old_inaccessible_percent, inaccessible_percent, old_notes, notes,
    reason, source_summary, calculation_version, changed_by
  ) values (
    v_new.id, v_new.campaign_zone_id, v_new.campaign_id,
    v_new.campaign_zone_id, v_new.campaign_id, (select zone_name from public.campaign_zones where id = p_campaign_zone_id),
    'manual_clear',
    v_old.automatic_percent, v_new.automatic_percent, v_old.manual_percent, v_new.manual_percent,
    v_old.effective_percent, v_new.effective_percent, v_old.manual_override_enabled, v_new.manual_override_enabled,
    v_old.adjustment_type, v_new.adjustment_type, v_old.inaccessible_percent, v_new.inaccessible_percent,
    v_old.notes, v_new.notes, btrim(p_reason), v_new.source_summary, v_new.calculation_version, v_uid
  );

  return v_new;
end;
$$;


ALTER FUNCTION "public"."admin_clear_zone_manual_progress"("p_campaign_zone_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_coverage_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "zone_id" "uuid",
    "adjustment_type" "text" NOT NULL,
    "geometry" "public"."geometry"(Polygon,4326) NOT NULL,
    "reason" "text" NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "revoke_reason" "text",
    CONSTRAINT "campaign_coverage_adjustments_geometry_valid" CHECK (("public"."st_isvalid"("geometry") AND (NOT "public"."st_isempty"("geometry")))),
    CONSTRAINT "campaign_coverage_adjustments_reason_required" CHECK ((NULLIF("btrim"("reason"), ''::"text") IS NOT NULL)),
    CONSTRAINT "campaign_coverage_adjustments_revocation_check" CHECK (((("revoked_at" IS NULL) AND ("revoked_by" IS NULL)) OR (("revoked_at" IS NOT NULL) AND ("revoked_by" IS NOT NULL) AND (NULLIF("btrim"("revoke_reason"), ''::"text") IS NOT NULL)))),
    CONSTRAINT "campaign_coverage_adjustments_type_check" CHECK (("adjustment_type" = ANY (ARRAY['manual_covered'::"text", 'partially_covered'::"text", 'inaccessible'::"text"])))
);

ALTER TABLE ONLY "public"."campaign_coverage_adjustments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_coverage_adjustments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_coverage_adjustment"("p_campaign_id" "uuid", "p_zone_id" "uuid", "p_adjustment_type" "text", "p_geometry_geojson" "jsonb", "p_reason" "text", "p_notes" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."campaign_coverage_adjustments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_geom public.geometry;
  v_new public.campaign_coverage_adjustments%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if p_adjustment_type not in ('manual_covered', 'partially_covered', 'inaccessible') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDO' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;
  if p_geometry_geojson is null then
    raise exception 'GEOMETRIA_OBBLIGATORIA' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  v_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(p_geometry_geojson::text), 4326));
  if v_geom is null or public.ST_IsEmpty(v_geom) or public.GeometryType(v_geom) not in ('POLYGON', 'MULTIPOLYGON') then
    raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
  end if;
  if public.GeometryType(v_geom) = 'MULTIPOLYGON' then
    if public.ST_NumGeometries(v_geom) <> 1 then
      raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
    end if;
    v_geom := public.ST_GeometryN(v_geom, 1);
  end if;

  insert into public.campaign_coverage_adjustments (campaign_id, zone_id, adjustment_type, geometry, reason, notes, metadata, created_by)
  values (p_campaign_id, p_zone_id, p_adjustment_type, v_geom, btrim(p_reason), nullif(btrim(p_notes), ''), coalesce(p_metadata, '{}'::jsonb), v_uid)
  returning * into v_new;

  insert into public.campaign_coverage_adjustments_log (adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by)
  values (v_new.id, v_new.campaign_id, v_new.zone_id, 'created', v_new.adjustment_type, v_new.reason, v_new.notes, public.ST_AsGeoJSON(v_new.geometry)::jsonb, v_uid);

  return v_new;
end;
$$;


ALTER FUNCTION "public"."admin_create_coverage_adjustment"("p_campaign_id" "uuid", "p_zone_id" "uuid", "p_adjustment_type" "text", "p_geometry_geojson" "jsonb", "p_reason" "text", "p_notes" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operator_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "zone_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "access_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text") NOT NULL,
    CONSTRAINT "operator_assignments_period_check" CHECK ((("ends_at" IS NULL) OR ("ends_at" > "starts_at"))),
    CONSTRAINT "operator_assignments_revocation_check" CHECK ((("status" <> 'revoked'::"text") OR ("revoked_at" IS NOT NULL))),
    CONSTRAINT "operator_assignments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'revoked'::"text"])))
);

ALTER TABLE ONLY "public"."operator_assignments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."operator_assignments" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_operator_assignment"("p_campaign_id" "uuid", "p_operator_id" "uuid", "p_group_id" "uuid" DEFAULT NULL::"uuid", "p_zone_id" "uuid" DEFAULT NULL::"uuid", "p_starts_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_ends_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."operator_assignments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_admin_id  uuid;
  v_result    public.operator_assignments;
  v_meta      jsonb;
  v_overlap   boolean;
  v_group_id  uuid;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;

  if p_campaign_id is null then
    raise exception 'campaign_id obbligatorio.' using errcode = '22023';
  end if;
  if p_operator_id is null then
    raise exception 'operator_id obbligatorio.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'Campagna non trovata (id: %).', p_campaign_id
      using errcode = '02000';
  end if;

  if p_ends_at is not null and p_starts_at is not null
     and p_ends_at <= p_starts_at then
    raise exception 'ends_at deve essere strettamente successivo a starts_at.'
      using errcode = '22023';
  end if;

  if p_group_id is not null then
    if not exists (
      select 1 from public.operational_groups
      where id = p_group_id and campaign_id = p_campaign_id
    ) then
      raise exception 'Gruppo operativo non trovato per questa campagna (id: %).', p_group_id
        using errcode = '02000';
    end if;
    v_group_id := p_group_id;
  else
    select id into v_group_id
    from public.operational_groups
    where campaign_id = p_campaign_id
    order by created_at asc nulls last
    limit 1;

    if v_group_id is null then
      insert into public.operational_groups (id, campaign_id, name)
      values (gen_random_uuid(), p_campaign_id, 'Generale')
      returning id into v_group_id;
    end if;
  end if;

  if not exists (
    select 1 from public.operator_profiles
    where user_id = p_operator_id
      and active = true
      and disabled_at is null
  ) then
    raise exception 'Operatore non trovato, non attivo o disabilitato (id: %).',
      p_operator_id using errcode = '22023';
  end if;

  select exists (
    select 1 from public.operator_assignments a
    where a.operator_id = p_operator_id
      and a.campaign_id = p_campaign_id
      and a.status = 'active'
      and (a.ends_at is null or a.ends_at > coalesce(p_starts_at, now()))
      and (p_ends_at is null or a.starts_at < p_ends_at)
  ) into v_overlap;

  if v_overlap then
    raise exception 'Esiste giÃ  un''assegnazione attiva sovrapposta per questo operatore su questa campagna.'
      using errcode = '23505';
  end if;

  v_admin_id := auth.uid();

  v_meta := coalesce(p_metadata, '{}'::jsonb);
  if p_notes is not null then
    v_meta := v_meta || jsonb_build_object('notes', p_notes);
  end if;
  v_meta := v_meta || jsonb_build_object(
    '_created_by_admin', v_admin_id,
    '_created_at_iso',   now()::text
  );

  insert into public.operator_assignments (
    campaign_id, operator_id, group_id, zone_id,
    status, starts_at, ends_at,
    created_by, metadata, created_at, updated_at
  ) values (
    p_campaign_id, p_operator_id, v_group_id, p_zone_id,
    'active', p_starts_at, p_ends_at,
    v_admin_id, v_meta, now(), now()
  )
  returning * into v_result;

  -- Promozione dello stato campagna: dal preventivo confermato/pagato
  -- all'operativita' reale, solo alla prima assegnazione. Non tocca stati
  -- terminali o gestiti manualmente altrove.
  update public.campaigns
  set status = 'in_progress', updated_at = now()
  where id = p_campaign_id
    and status in ('approved', 'pending_review');

  begin
    insert into public.audit_log (
      actor_id, action, resource_type, resource_id,
      success, metadata
    ) values (
      v_admin_id,
      'admin_create_operator_assignment',
      'operator_assignments',
      v_result.id::text,
      true,
      jsonb_build_object(
        'campaign_id',  p_campaign_id,
        'operator_id',  p_operator_id,
        'group_id',     p_group_id,
        'zone_id',      p_zone_id,
        'starts_at',    p_starts_at,
        'ends_at',      p_ends_at
      )
    );
  exception when others then
    raise notice 'audit_log insert skipped: %', sqlerrm;
  end;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."admin_create_operator_assignment"("p_campaign_id" "uuid", "p_operator_id" "uuid", "p_group_id" "uuid", "p_zone_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_metadata" "jsonb", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_daily_report_telemetry"("p_session_ids" "uuid"[]) RETURNS TABLE("session_id" "uuid", "gps_count" bigint, "first_gps_at" timestamp with time zone, "last_gps_at" timestamp with time zone, "photo_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or not public.gps_is_admin() then
    raise exception 'UNAUTHORIZED';
  end if;

  return query
  with requested as (
    select distinct unnest(coalesce(p_session_ids, array[]::uuid[])) as id
  ),
  gps as (
    select point.session_id,
           count(*) as gps_count,
           min(point.recorded_at) as first_gps_at,
           max(point.recorded_at) as last_gps_at
    from public.gps_tracking_points point
    join requested on requested.id = point.session_id
    group by point.session_id
  ),
  photos as (
    select photo.session_id, count(*) as photo_count
    from public.proof_photos photo
    join requested on requested.id = photo.session_id
    group by photo.session_id
  )
  select requested.id,
         coalesce(gps.gps_count, 0),
         gps.first_gps_at,
         gps.last_gps_at,
         coalesce(photos.photo_count, 0)
  from requested
  left join gps on gps.session_id = requested.id
  left join photos on photos.session_id = requested.id;
end;
$$;


ALTER FUNCTION "public"."admin_daily_report_telemetry"("p_session_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_hard_delete_campaign"("p_campaign_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_title text;
  v_status text;
  v_payment_status text;
  v_blocker text;
begin
  -- 1. ADMIN AUTH â€” auth.uid() implicito dentro gps_is_admin(), stesso
  -- meccanismo gia' usato da tutte le altre RPC di questo ticket.
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;

  -- 7. REASON obbligatorio, DB-enforced (non solo lato client).
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  -- 2. ADVISORY LOCK per-campagna: serializza richieste concorrenti sulla
  -- STESSA campagna (test case G). Se due admin chiamano questa funzione
  -- nello stesso momento per lo stesso id, la seconda attende che la prima
  -- transazione finisca (commit o rollback) prima di procedere.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text, 0)
  );

  select title, status, metadata->>'payment_status'
    into v_title, v_status, v_payment_status
  from public.campaigns
  where id = p_campaign_id
  for update;

  if v_title is null then
    -- Se la prima di due chiamate concorrenti ha gia' cancellato la riga,
    -- la seconda arriva qui (non trova piu' nulla da bloccare ne' da
    -- cancellare) invece di un errore di lock/deadlock â€” comportamento
    -- sicuro e prevedibile per il test case G.
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  -- 3./4. DEPENDENCY CHECK COMPLETO. Un solo messaggio applicativo
  -- uniforme (CAMPAGNA_NON_ELIMINABILE_DATI_OPERATIVI, come richiesto),
  -- con il dettaglio della dipendenza specifica in DETAIL (utile per
  -- debug/log, non e' il messaggio primario mostrato all'utente).
  if v_payment_status = 'pagato' then
    v_blocker := 'payment_status=pagato';
  elsif exists (select 1 from public.operator_assignments where campaign_id = p_campaign_id) then
    v_blocker := 'operator_assignments';
  elsif exists (select 1 from public.operational_groups where campaign_id = p_campaign_id) then
    v_blocker := 'operational_groups';
  elsif exists (select 1 from public.assignment_event_log where campaign_id = p_campaign_id) then
    v_blocker := 'assignment_event_log';
  elsif exists (select 1 from public.delivery_sessions where campaign_id = p_campaign_id) then
    v_blocker := 'delivery_sessions';
  elsif exists (select 1 from public.gps_tracking_points where campaign_id = p_campaign_id) then
    v_blocker := 'gps_tracking_points';
  elsif exists (select 1 from public.proof_photos where campaign_id = p_campaign_id) then
    v_blocker := 'proof_photos';
  elsif exists (select 1 from public.quotes where campaign_id = p_campaign_id) then
    v_blocker := 'quotes';
  elsif exists (select 1 from public.campaign_assets where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_assets';
  elsif exists (select 1 from public.ai_reports where campaign_id = p_campaign_id) then
    v_blocker := 'ai_reports';
  elsif exists (select 1 from public.campaign_zone_progress_history where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_zone_progress_history';
  elsif exists (select 1 from public.campaign_coverage_adjustments where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_coverage_adjustments';
  elsif exists (select 1 from public.campaign_coverage_adjustments_log where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_coverage_adjustments_log';
  elsif exists (select 1 from public.campaign_zone_snapshots where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_zone_snapshots';
  elsif exists (select 1 from public.campaign_events where campaign_id = p_campaign_id) then
    v_blocker := 'campaign_events';
  else
    v_blocker := null;
  end if;

  if v_blocker is not null then
    raise exception 'CAMPAGNA_NON_ELIMINABILE_DATI_OPERATIVI'
      using errcode = '22023', detail = format('blocked_by: %s', v_blocker);
  end if;

  -- 5./6. AUDIT PRIMA del delete, nella STESSA transazione (atomicita' â€”
  -- se il DELETE sotto fallisce per qualunque motivo, questo insert viene
  -- annullato insieme, esattamente come le altre RPC di questo ticket).
  -- campaign_admin_action_log.campaign_id ha ON DELETE SET NULL +
  -- campaign_id_snapshot/campaign_title_snapshot immutabili (gia'
  -- applicati in 20260818120000): la riga di audit sopravvive al DELETE
  -- qui sotto, solo campaign_id diventa NULL.
  perform public.admin_log_campaign_action(
    p_campaign_id, 'campaign_hard_deleted', v_status, null, p_reason
  );

  -- 9. DELETE TARGET: SOLO public.campaigns. Tutte le tabelle bloccanti
  -- sopra sono gia' state verificate ASSENTI a questo punto, quindi il
  -- CASCADE reale su di esse (dove esiste) non cancella nulla perche' non
  -- c'e' nulla da cancellare. Le uniche tabelle che potrebbero ancora
  -- avere righe scollegate da questo controllo esplicito sono quelle senza
  -- alcuna FK verso campaigns (proof_photos/delivery_sessions/
  -- gps_tracking_points) â€” controllate sopra in lettura, questa funzione
  -- non esegue MAI un DELETE su di esse.
  delete from public.campaigns where id = p_campaign_id;
end;
$$;


ALTER FUNCTION "public"."admin_hard_delete_campaign"("p_campaign_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_campaign_assignments"("p_campaign_id" "uuid") RETURNS TABLE("id" "uuid", "campaign_id" "uuid", "operator_id" "uuid", "operator_name" "text", "operator_phone" "text", "group_id" "uuid", "zone_id" "uuid", "status" "text", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone, "revoked_at" timestamp with time zone, "metadata" "jsonb", "created_by" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "access_token" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;
  if p_campaign_id is null then
    raise exception 'campaign_id obbligatorio.' using errcode = '22023';
  end if;

  return query
    select
      oa.id,
      oa.campaign_id,
      oa.operator_id,
      coalesce(op.display_name, oa.operator_id::text) as operator_name,
      p.phone                                          as operator_phone,
      oa.group_id,
      oa.zone_id,
      oa.status,
      oa.starts_at,
      oa.ends_at,
      oa.revoked_at,
      oa.metadata,
      oa.created_by,
      oa.created_at,
      oa.updated_at,
      oa.access_token
    from public.operator_assignments oa
    left join public.operator_profiles op on op.user_id = oa.operator_id
    left join public.profiles p            on p.id      = oa.operator_id
    where oa.campaign_id = p_campaign_id
    order by oa.created_at desc;
end;
$$;


ALTER FUNCTION "public"."admin_list_campaign_assignments"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_operators"() RETURNS TABLE("id" "uuid", "display_name" "text", "phone" "text", "status" "text", "active" boolean, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;

  return query
    select
      op.user_id as id,
      op.display_name,
      p.phone,
      case when op.active and op.disabled_at is null then 'active' else 'inactive' end as status,
      op.active,
      op.created_at
    from public.operator_profiles op
    left join public.profiles p on p.id = op.user_id
    where op.active = true
      and op.disabled_at is null
    order by op.display_name asc nulls last, op.created_at desc;
end;
$$;


ALTER FUNCTION "public"."admin_list_operators"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_admin_action_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid",
    "campaign_id_snapshot" "uuid" NOT NULL,
    "campaign_title_snapshot" "text" NOT NULL,
    "action" "text" NOT NULL,
    "previous_state" "text",
    "new_state" "text",
    "reason" "text" NOT NULL,
    "actor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_admin_action_log_action_check" CHECK (("action" = ANY (ARRAY['campaign_cancelled'::"text", 'campaign_archived'::"text", 'campaign_reopened'::"text", 'payment_confirmation_revoked'::"text", 'program_revoked'::"text", 'campaign_hard_deleted'::"text"]))),
    CONSTRAINT "campaign_admin_action_log_reason_required" CHECK ((NULLIF("btrim"("reason"), ''::"text") IS NOT NULL))
);

ALTER TABLE ONLY "public"."campaign_admin_action_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_admin_action_log" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_log_campaign_action"("p_campaign_id" "uuid", "p_action" "text", "p_previous_state" "text", "p_new_state" "text", "p_reason" "text") RETURNS "public"."campaign_admin_action_log"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_title text;
  v_row public.campaign_admin_action_log%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select title into v_title from public.campaigns where id = p_campaign_id;
  if v_title is null then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  insert into public.campaign_admin_action_log (
    campaign_id, campaign_id_snapshot, campaign_title_snapshot,
    action, previous_state, new_state, reason, actor_id
  ) values (
    p_campaign_id, p_campaign_id, v_title,
    p_action, p_previous_state, p_new_state, btrim(p_reason), v_uid
  )
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."admin_log_campaign_action"("p_campaign_id" "uuid", "p_action" "text", "p_previous_state" "text", "p_new_state" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_reopen_campaign"("p_campaign_id" "uuid", "p_reason" "text") RETURNS "public"."campaigns"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_old public.campaigns%rowtype;
  v_new public.campaigns%rowtype;
  v_target_status text;
  v_last_archive_previous text;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text, 0)
  );

  select * into v_old from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  if v_old.status in ('completed', 'cancelled') then
    v_target_status := 'in_progress';
  elsif v_old.status = 'archived' then
    select previous_state into v_last_archive_previous
    from public.campaign_admin_action_log
    where campaign_id = p_campaign_id
      and action = 'campaign_archived'
    order by created_at desc
    limit 1;

    if v_last_archive_previous is null or nullif(btrim(v_last_archive_previous), '') is null then
      raise exception 'STATO_PRECEDENTE_NON_RICOSTRUIBILE' using errcode = '22023';
    end if;
    v_target_status := v_last_archive_previous;
  else
    raise exception 'STATO_NON_RIAPRIBILE' using errcode = '22023';
  end if;

  update public.campaigns
    set status = v_target_status, updated_at = now()
    where id = p_campaign_id
    returning * into v_new;

  perform public.admin_log_campaign_action(
    p_campaign_id, 'campaign_reopened', v_old.status, v_target_status, p_reason
  );

  return v_new;
end;
$$;


ALTER FUNCTION "public"."admin_reopen_campaign"("p_campaign_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_event_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "operator_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."assignment_event_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_event_log" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_revoke_assignment_program"("p_assignment_id" "uuid", "p_reason" "text") RETURNS "public"."assignment_event_log"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_assignment public.operator_assignments%rowtype;
  v_previous_event text;
  v_row public.assignment_event_log%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_assignment_id::text, 0)
  );

  select * into v_assignment from public.operator_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'ASSEGNAZIONE_NON_TROVATA' using errcode = 'P0002';
  end if;

  -- Ordine cronologico REALE (created_at desc, non "esiste almeno un
  -- sent"): se il programma non e' mai stato inviato non c'e' nulla da
  -- revocare. Questo valore diventa previous_state nell'audit.
  select event_type into v_previous_event
  from public.assignment_event_log
  where assignment_id = p_assignment_id
    and event_type in ('assignment_program_sent', 'assignment_program_opened', 'assignment_program_confirmed')
  order by created_at desc
  limit 1;

  if v_previous_event is null then
    raise exception 'PROGRAMMA_MAI_INVIATO' using errcode = '22023';
  end if;

  -- Chiamata nested a una funzione SECURITY DEFINER: stessa transazione
  -- della funzione chiamante â€” se una riga sotto fallisce, anche questo
  -- insert viene annullato insieme al resto.
  perform public.log_assignment_event(p_assignment_id, 'assignment_program_revoked');

  perform public.admin_log_campaign_action(
    v_assignment.campaign_id, 'program_revoked', v_previous_event, 'assignment_program_revoked', p_reason
  );

  select * into v_row
  from public.assignment_event_log
  where assignment_id = p_assignment_id
    and event_type = 'assignment_program_revoked'
  order by created_at desc
  limit 1;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."admin_revoke_assignment_program"("p_assignment_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_revoke_coverage_adjustment"("p_adjustment_id" "uuid", "p_reason" "text") RETURNS "public"."campaign_coverage_adjustments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_old public.campaign_coverage_adjustments%rowtype;
  v_new public.campaign_coverage_adjustments%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select * into v_old from public.campaign_coverage_adjustments where id = p_adjustment_id for update;
  if not found then
    raise exception 'CORREZIONE_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_old.revoked_at is not null then
    raise exception 'CORREZIONE_GIA_REVOCATA' using errcode = '22023';
  end if;

  update public.campaign_coverage_adjustments
  set revoked_at = now(), revoked_by = v_uid, revoke_reason = btrim(p_reason), updated_by = v_uid, updated_at = now()
  where id = p_adjustment_id
  returning * into v_new;

  insert into public.campaign_coverage_adjustments_log (adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by)
  values (v_new.id, v_new.campaign_id, v_new.zone_id, 'revoked', v_new.adjustment_type, btrim(p_reason), v_new.notes, public.ST_AsGeoJSON(v_new.geometry)::jsonb, v_uid);

  return v_new;
end;
$$;


ALTER FUNCTION "public"."admin_revoke_coverage_adjustment"("p_adjustment_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_revoke_operator_assignment"("p_id" "uuid") RETURNS "public"."operator_assignments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_admin_id  uuid;
  v_result    public.operator_assignments;
  v_had_active_session boolean := false;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'id obbligatorio.' using errcode = '22023';
  end if;

  v_admin_id := auth.uid();

  if not exists (
    select 1 from public.operator_assignments
    where id = p_id
      and status not in ('revoked', 'completed')
  ) then
    raise exception
      'Assegnazione non trovata, giÃ  revocata o completata (id: %).', p_id
      using errcode = '02000';
  end if;

  select exists (
    select 1 from public.delivery_sessions ds
    where ds.assignment_id = p_id
      and ds.status in ('started', 'paused')
  ) into v_had_active_session;

  update public.operator_assignments set
    status     = 'revoked',
    revoked_at = now(),
    updated_at = now(),
    metadata   = metadata || jsonb_build_object(
      '_revoked_by',            v_admin_id,
      '_revoked_at',            now()::text,
      '_revoked_pending_stop',  v_had_active_session
    )
  where id = p_id
    and status not in ('revoked', 'completed')
  returning * into v_result;

  begin
    insert into public.audit_log (
      actor_id, action, resource_type, resource_id, success, metadata
    ) values (
      v_admin_id, 'admin_revoke_operator_assignment',
      'operator_assignments', p_id::text, true,
      jsonb_build_object(
        '_revoked_at',           now()::text,
        '_revoked_pending_stop', v_had_active_session
      )
    );
  exception when others then
    raise notice 'audit_log insert skipped: %', sqlerrm;
  end;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."admin_revoke_operator_assignment"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_revoke_payment_confirmation"("p_campaign_id" "uuid", "p_reason" "text") RETURNS "public"."campaigns"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_old public.campaigns%rowtype;
  v_new public.campaigns%rowtype;
  v_old_payment_status text;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text, 0)
  );

  select * into v_old from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  v_old_payment_status := v_old.metadata->>'payment_status';
  if v_old_payment_status is distinct from 'pagato' then
    raise exception 'PAGAMENTO_NON_CONFERMATO' using errcode = '22023';
  end if;

  -- payment_confirmed_at / payment_reference NON vengono toccati: il fatto
  -- storico "confermato il [data]" resta sulla riga anche dopo la revoca
  -- (mai cancellare storico pagamento) â€” cambia solo payment_status, che
  -- torna operativamente "da pagare".
  update public.campaigns
    set metadata = jsonb_set(
          coalesce(metadata, '{}'::jsonb), '{payment_status}', '"in_attesa_pagamento"'::jsonb
        ),
        updated_at = now()
    where id = p_campaign_id
    returning * into v_new;

  perform public.admin_log_campaign_action(
    p_campaign_id, 'payment_confirmation_revoked', v_old_payment_status, 'in_attesa_pagamento', p_reason
  );

  return v_new;
end;
$$;


ALTER FUNCTION "public"."admin_revoke_payment_confirmation"("p_campaign_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operator_assignment_zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "zone_id" "uuid",
    "municipality_code" "text",
    "municipality_name" "text" NOT NULL,
    "quantity" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operator_assignment_zones_municipality_name_check" CHECK ((("char_length"("municipality_name") >= 1) AND ("char_length"("municipality_name") <= 200))),
    CONSTRAINT "operator_assignment_zones_quantity_check" CHECK ((("quantity" IS NULL) OR ("quantity" >= 0)))
);

ALTER TABLE ONLY "public"."operator_assignment_zones" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."operator_assignment_zones" OWNER TO "postgres";


COMMENT ON TABLE "public"."operator_assignment_zones" IS 'Ponte strutturato fra operator_assignments e zone/comuni. Creato da ADMIN-DRIVER-LINK-2 (20260806150009, riscritta in RC2-FIX-1).';



CREATE OR REPLACE FUNCTION "public"."admin_set_assignment_zones"("p_assignment_id" "uuid", "p_zones" "jsonb") RETURNS SETOF "public"."operator_assignment_zones"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_elem      jsonb;
  v_row       public.operator_assignment_zones;
  v_name      text;
  v_qty       integer;
  v_zone_id   uuid;
  v_group_id  uuid;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;
  if p_assignment_id is null then
    raise exception 'assignment_id obbligatorio.' using errcode = '22023';
  end if;
  if p_zones is null or jsonb_typeof(p_zones) <> 'array' then
    raise exception 'p_zones deve essere un array JSON.' using errcode = '22023';
  end if;

  select group_id into v_group_id
  from public.operator_assignments where id = p_assignment_id;

  if v_group_id is null then
    raise exception 'Assegnazione non trovata (id: %).', p_assignment_id
      using errcode = '02000';
  end if;

  delete from public.operator_assignment_zones
  where assignment_id = p_assignment_id;

  for v_elem in select * from jsonb_array_elements(p_zones)
  loop
    v_name := trim(v_elem->>'municipality_name');
    if v_name is null or char_length(v_name) = 0 then
      raise exception 'Ogni zona deve avere municipality_name non vuoto.'
        using errcode = '22023';
    end if;

    if v_elem ? 'quantity' and v_elem->>'quantity' is not null then
      v_qty := (v_elem->>'quantity')::integer;
      if v_qty < 0 then
        raise exception 'quantity non puÃ² essere negativa (zona: %).',
          v_name using errcode = '22023';
      end if;
    else
      v_qty := null;
    end if;

    v_zone_id := nullif(v_elem->>'zone_id', '')::uuid;

    insert into public.operator_assignment_zones (
      assignment_id, zone_id, municipality_name, municipality_code, quantity
    ) values (
      p_assignment_id,
      v_zone_id,
      v_name,
      v_elem->>'municipality_code',
      v_qty
    )
    returning * into v_row;

    -- Ponte mancante: il motore GPS (gps_start_session/gps_get_operator_campaign)
    -- autorizza le zone via campaign_zones.group_id = operator_assignments.group_id,
    -- ma questa RPC non lo scriveva mai. Solo per zone reali (zone_id non
    -- null, gia' collegate a public.campaign_zones); zone a testo libero
    -- senza zone_id restano fuori dal modello GPS strutturato, invariate.
    if v_zone_id is not null then
      update public.campaign_zones
      set group_id = v_group_id, updated_at = now()
      where id = v_zone_id;
    end if;

    return next v_row;
  end loop;

  return;
end;
$$;


ALTER FUNCTION "public"."admin_set_assignment_zones"("p_assignment_id" "uuid", "p_zones" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_zone_manual_progress"("p_campaign_zone_id" "uuid", "p_adjustment_type" "text", "p_manual_percent" numeric, "p_inaccessible_percent" numeric, "p_reason" "text", "p_notes" "text") RETURNS "public"."campaign_zone_progress"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_campaign_id uuid;
  v_old public.campaign_zone_progress%rowtype;
  v_new public.campaign_zone_progress%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if exists (select 1 from public.campaign_coverage_adjustments where zone_id = p_campaign_zone_id) then
    raise exception 'ZONA_GESTITA_DA_CORREZIONE_GEOMETRICA: usa il disegno poligono in mappa per questa zona, non l''override percentuale.' using errcode = '22023';
  end if;
  if p_adjustment_type not in ('manual_covered', 'partially_covered', 'inaccessible') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDA' using errcode = '22023';
  end if;
  if p_manual_percent is not null and (p_manual_percent < 0 or p_manual_percent > 100) then
    raise exception 'PERCENTUALE_NON_VALIDA' using errcode = '22023';
  end if;
  if p_inaccessible_percent is not null and (p_inaccessible_percent < 0 or p_inaccessible_percent > 100) then
    raise exception 'PERCENTUALE_NON_VALIDA' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select z.campaign_id into v_campaign_id from public.campaign_zones z where z.id = p_campaign_zone_id;
  if v_campaign_id is null then
    raise exception 'ZONA_CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  select * into v_old from public.campaign_zone_progress where campaign_zone_id = p_campaign_zone_id for update;

  insert into public.campaign_zone_progress (
    campaign_zone_id, campaign_id, source, adjustment_type, manual_percent, inaccessible_percent,
    manual_override_enabled, override_reason, notes, updated_by, updated_at
  ) values (
    p_campaign_zone_id, v_campaign_id, 'legacy', p_adjustment_type, p_manual_percent, p_inaccessible_percent,
    true, btrim(p_reason), btrim(p_notes), v_uid, now()
  )
  on conflict (campaign_zone_id) do update
    set source = 'legacy', adjustment_type = excluded.adjustment_type, manual_percent = excluded.manual_percent,
        inaccessible_percent = excluded.inaccessible_percent, manual_override_enabled = true,
        override_reason = excluded.override_reason, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id, campaign_zone_id, campaign_id, campaign_zone_id_snapshot, campaign_id_snapshot, zone_name_snapshot,
    event_type, old_automatic_percent, new_automatic_percent, old_manual_percent, new_manual_percent,
    old_effective_percent, new_effective_percent, old_manual_override_enabled, new_manual_override_enabled,
    old_adjustment_type, adjustment_type, old_inaccessible_percent, inaccessible_percent, old_notes, notes,
    reason, source_summary, calculation_version, changed_by
  ) values (
    v_new.id, v_new.campaign_zone_id, v_new.campaign_id,
    v_new.campaign_zone_id, v_new.campaign_id, (select zone_name from public.campaign_zones where id = p_campaign_zone_id),
    'manual_override',
    v_old.automatic_percent, v_new.automatic_percent, v_old.manual_percent, v_new.manual_percent,
    v_old.effective_percent, v_new.effective_percent, v_old.manual_override_enabled, v_new.manual_override_enabled,
    v_old.adjustment_type, v_new.adjustment_type, v_old.inaccessible_percent, v_new.inaccessible_percent,
    v_old.notes, v_new.notes, btrim(p_reason), v_new.source_summary, v_new.calculation_version, v_uid
  );

  return v_new;
end;
$$;


ALTER FUNCTION "public"."admin_set_zone_manual_progress"("p_campaign_zone_id" "uuid", "p_adjustment_type" "text", "p_manual_percent" numeric, "p_inaccessible_percent" numeric, "p_reason" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_coverage_adjustment"("p_adjustment_id" "uuid", "p_adjustment_type" "text", "p_geometry_geojson" "jsonb", "p_reason" "text", "p_notes" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS "public"."campaign_coverage_adjustments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_geom public.geometry;
  v_old public.campaign_coverage_adjustments%rowtype;
  v_new public.campaign_coverage_adjustments%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if p_adjustment_type not in ('manual_covered', 'partially_covered', 'inaccessible') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDO' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select * into v_old from public.campaign_coverage_adjustments where id = p_adjustment_id for update;
  if not found then
    raise exception 'CORREZIONE_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_old.revoked_at is not null then
    raise exception 'CORREZIONE_GIA_REVOCATA' using errcode = '22023';
  end if;

  if p_geometry_geojson is not null then
    v_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(p_geometry_geojson::text), 4326));
    if v_geom is null or public.ST_IsEmpty(v_geom) or public.GeometryType(v_geom) not in ('POLYGON', 'MULTIPOLYGON') then
      raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
    end if;
    if public.GeometryType(v_geom) = 'MULTIPOLYGON' then
      if public.ST_NumGeometries(v_geom) <> 1 then
        raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
      end if;
      v_geom := public.ST_GeometryN(v_geom, 1);
    end if;
  else
    v_geom := v_old.geometry;
  end if;

  update public.campaign_coverage_adjustments
  set adjustment_type = p_adjustment_type, geometry = v_geom, reason = btrim(p_reason),
      notes = nullif(btrim(p_notes), ''), metadata = coalesce(p_metadata, metadata), updated_by = v_uid, updated_at = now()
  where id = p_adjustment_id
  returning * into v_new;

  insert into public.campaign_coverage_adjustments_log (adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by)
  values (v_new.id, v_new.campaign_id, v_new.zone_id, 'updated', v_new.adjustment_type, v_new.reason, v_new.notes, public.ST_AsGeoJSON(v_new.geometry)::jsonb, v_uid);

  return v_new;
end;
$$;


ALTER FUNCTION "public"."admin_update_coverage_adjustment"("p_adjustment_id" "uuid", "p_adjustment_type" "text", "p_geometry_geojson" "jsonb", "p_reason" "text", "p_notes" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_operator_assignment"("p_id" "uuid", "p_patch" "jsonb") RETURNS "public"."operator_assignments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_admin_id  uuid;
  v_result    public.operator_assignments;
  v_starts    timestamptz;
  v_ends      timestamptz;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'id obbligatorio.' using errcode = '22023';
  end if;
  if p_patch is null then
    raise exception 'patch non puÃ² essere null.' using errcode = '22023';
  end if;

  if p_patch ? 'operator_id' or p_patch ? 'campaign_id' then
    raise exception 'operator_id e campaign_id sono immutabili dopo la creazione.'
      using errcode = '22023';
  end if;

  select
    coalesce((p_patch->>'starts_at')::timestamptz, starts_at),
    coalesce((p_patch->>'ends_at')::timestamptz,   ends_at)
  into v_starts, v_ends
  from public.operator_assignments
  where id = p_id;

  if not found then
    raise exception 'Assegnazione non trovata (id: %).', p_id
      using errcode = '02000';
  end if;

  if v_ends is not null and v_starts is not null and v_ends <= v_starts then
    raise exception 'ends_at deve essere strettamente successivo a starts_at.'
      using errcode = '22023';
  end if;

  v_admin_id := auth.uid();

  update public.operator_assignments set
    starts_at  = coalesce((p_patch->>'starts_at')::timestamptz, starts_at),
    ends_at    = coalesce((p_patch->>'ends_at')::timestamptz,   ends_at),
    group_id   = coalesce((p_patch->>'group_id')::uuid,         group_id),
    zone_id    = coalesce((p_patch->>'zone_id')::uuid,          zone_id),
    metadata   = case
                   when p_patch ? 'metadata'
                   then metadata || (p_patch->'metadata')
                   else metadata
                 end
                 || jsonb_build_object(
                      '_last_updated_by', v_admin_id,
                      '_last_updated_at', now()::text
                    ),
    updated_at = now()
  where id = p_id
  returning * into v_result;

  begin
    insert into public.audit_log (
      actor_id, action, resource_type, resource_id, success, metadata
    ) values (
      v_admin_id, 'admin_update_operator_assignment',
      'operator_assignments', p_id::text, true, p_patch
    );
  exception when others then
    raise notice 'audit_log insert skipped: %', sqlerrm;
  end;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."admin_update_operator_assignment"("p_id" "uuid", "p_patch" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_campaign_final_coverage"("p_campaign_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_total_geom public.geometry;
  v_gps_geom public.geometry;
  v_manual_geom public.geometry;
  v_inaccessible_geom public.geometry;
  v_manual_incremental_geom public.geometry;
  v_effective_covered_geom public.geometry;
  v_total_area numeric := 0;
  v_gps_area numeric := 0;
  v_manual_area numeric := 0;
  v_inaccessible_area numeric := 0;
  v_effective_area numeric := 0;
  v_effective_total_area numeric := 0;
begin
  if v_uid is null and not v_is_admin then
    raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.user_id = v_uid) into v_is_owner;
  if not v_is_admin and not v_is_owner then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select public.ST_UnaryUnion(public.ST_Collect(geom))
  into v_total_geom
  from (
    select
      case
        when z.polygon_geojson is not null then
          public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(z.polygon_geojson::text), 4326))
        when z.center_lat is not null and z.center_lng is not null and z.radius_m is not null then
          public.ST_MakeValid(public.ST_Buffer(public.ST_SetSRID(public.ST_MakePoint(z.center_lng::double precision, z.center_lat::double precision), 4326)::public.geography, z.radius_m)::public.geometry)
        else null
      end as geom
    from public.campaign_zones z
    where z.campaign_id = p_campaign_id
  ) zones
  where geom is not null;

  if v_total_geom is null then
    return pg_catalog.jsonb_build_object(
      'campaign_id', p_campaign_id, 'calculation_status', 'zone_geometry_missing',
      'gps_coverage_pct', null, 'manual_coverage_pct', null, 'inaccessible_area_pct', null, 'final_operational_coverage_pct', null
    );
  end if;

  v_total_area := public.ST_Area(v_total_geom::public.geography);

  select public.ST_Intersection(
    public.ST_UnaryUnion(public.ST_Buffer(public.ST_MakeLine(geom order by recorded_at)::public.geography, 30)::public.geometry),
    v_total_geom
  )
  into v_gps_geom
  from public.gps_tracking_points
  where session_id in (select id from public.delivery_sessions where campaign_id = p_campaign_id)
    and lat != 0 and lng != 0 and (accuracy is null or accuracy <= 65)
  having count(*) >= 2;

  if v_gps_geom is not null and not public.ST_IsEmpty(v_gps_geom) then
    v_gps_area := public.ST_Area(v_gps_geom::public.geography);
  else
    v_gps_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    v_gps_area := 0;
  end if;

  select public.ST_UnaryUnion(public.ST_Collect(geometry))
  into v_manual_geom
  from public.campaign_coverage_adjustments
  where campaign_id = p_campaign_id and revoked_at is null and adjustment_type in ('manual_covered', 'partially_covered');

  if v_manual_geom is not null and not public.ST_IsEmpty(v_manual_geom) then
    v_manual_geom := public.ST_Intersection(public.ST_MakeValid(v_manual_geom), v_total_geom);
    v_manual_incremental_geom := public.ST_Difference(v_manual_geom, v_gps_geom);
    v_manual_area := public.ST_Area(v_manual_incremental_geom::public.geography);
  else
    v_manual_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    v_manual_incremental_geom := v_manual_geom;
    v_manual_area := 0;
  end if;

  select public.ST_UnaryUnion(public.ST_Collect(geometry))
  into v_inaccessible_geom
  from public.campaign_coverage_adjustments
  where campaign_id = p_campaign_id and revoked_at is null and adjustment_type = 'inaccessible';

  if v_inaccessible_geom is not null and not public.ST_IsEmpty(v_inaccessible_geom) then
    v_inaccessible_geom := public.ST_Intersection(public.ST_MakeValid(v_inaccessible_geom), v_total_geom);
    v_inaccessible_area := public.ST_Area(v_inaccessible_geom::public.geography);
  else
    v_inaccessible_area := 0;
  end if;

  v_effective_covered_geom := public.ST_UnaryUnion(public.ST_Collect(array[v_gps_geom, v_manual_incremental_geom]));
  if v_effective_covered_geom is not null and not public.ST_IsEmpty(v_effective_covered_geom) then
    v_effective_area := public.ST_Area(v_effective_covered_geom::public.geography);
  else
    v_effective_area := 0;
  end if;

  v_effective_total_area := greatest(v_total_area - v_inaccessible_area, 0);

  return pg_catalog.jsonb_build_object(
    'campaign_id', p_campaign_id, 'calculation_status', 'ready',
    'total_area_m2', pg_catalog.round(v_total_area, 2),
    'gps_area_m2', pg_catalog.round(v_gps_area, 2),
    'manual_area_m2', pg_catalog.round(v_manual_area, 2),
    'inaccessible_area_m2', pg_catalog.round(v_inaccessible_area, 2),
    'gps_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_gps_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'manual_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_manual_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'inaccessible_area_pct', case when v_total_area > 0 then least(greatest(round((v_inaccessible_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'final_operational_coverage_pct', case when v_effective_total_area > 0 then least(greatest(round((v_effective_area / v_effective_total_area) * 100, 2), 0), 100) else 0 end
  );
end;
$$;


ALTER FUNCTION "public"."calculate_campaign_final_coverage"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_zone_final_coverage"("p_campaign_zone_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_campaign_id uuid;
  v_zone public.campaign_zones%rowtype;
  v_total_geom public.geometry;
  v_gps_geom public.geometry;
  v_manual_geom public.geometry;
  v_inaccessible_geom public.geometry;
  v_manual_incremental_geom public.geometry;
  v_effective_covered_geom public.geometry;
  v_total_area numeric := 0;
  v_gps_area numeric := 0;
  v_manual_area numeric := 0;
  v_inaccessible_area numeric := 0;
  v_effective_area numeric := 0;
  v_effective_total_area numeric := 0;
begin
  select * into v_zone from public.campaign_zones where id = p_campaign_zone_id;
  if not found then
    raise exception 'ZONA_NON_TROVATA' using errcode = 'P0002';
  end if;
  v_campaign_id := v_zone.campaign_id;

  select exists (
    select 1 from public.campaigns c where c.id = v_campaign_id and c.user_id = v_uid
  ) into v_is_owner;

  if not v_is_admin and not v_is_owner then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if v_zone.polygon_geojson is not null then
    v_total_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(v_zone.polygon_geojson::text), 4326));
  elsif v_zone.center_lat is not null and v_zone.center_lng is not null and v_zone.radius_m is not null then
    v_total_geom := public.ST_MakeValid(public.ST_Buffer(public.ST_SetSRID(public.ST_MakePoint(v_zone.center_lng::double precision, v_zone.center_lat::double precision), 4326)::public.geography, v_zone.radius_m)::public.geometry);
  else
    return pg_catalog.jsonb_build_object(
      'campaign_zone_id', p_campaign_zone_id, 'campaign_id', v_campaign_id,
      'calculation_status', 'zone_geometry_missing',
      'gps_coverage_pct', null, 'manual_coverage_pct', null,
      'inaccessible_area_pct', null, 'final_operational_coverage_pct', null
    );
  end if;

  v_total_area := public.ST_Area(v_total_geom::public.geography);

  select public.ST_Intersection(
    public.ST_UnaryUnion(public.ST_Buffer(public.ST_MakeLine(geom order by recorded_at)::public.geography, 30)::public.geometry),
    v_total_geom
  )
  into v_gps_geom
  from public.gps_tracking_points
  where session_id in (select id from public.delivery_sessions where campaign_zone_id = p_campaign_zone_id)
    and lat != 0 and lng != 0
    and (accuracy is null or accuracy <= 65)
  having count(*) >= 2;

  if v_gps_geom is not null and not public.ST_IsEmpty(v_gps_geom) then
    v_gps_area := public.ST_Area(v_gps_geom::public.geography);
  else
    v_gps_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    v_gps_area := 0;
  end if;

  select public.ST_UnaryUnion(public.ST_Collect(geometry))
  into v_manual_geom
  from public.campaign_coverage_adjustments
  where zone_id = p_campaign_zone_id and revoked_at is null and adjustment_type in ('manual_covered', 'partially_covered');

  if v_manual_geom is not null and not public.ST_IsEmpty(v_manual_geom) then
    v_manual_geom := public.ST_Intersection(public.ST_MakeValid(v_manual_geom), v_total_geom);
    v_manual_incremental_geom := public.ST_Difference(v_manual_geom, v_gps_geom);
    v_manual_area := public.ST_Area(v_manual_incremental_geom::public.geography);
  else
    v_manual_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    v_manual_incremental_geom := v_manual_geom;
    v_manual_area := 0;
  end if;

  select public.ST_UnaryUnion(public.ST_Collect(geometry))
  into v_inaccessible_geom
  from public.campaign_coverage_adjustments
  where zone_id = p_campaign_zone_id and revoked_at is null and adjustment_type = 'inaccessible';

  if v_inaccessible_geom is not null and not public.ST_IsEmpty(v_inaccessible_geom) then
    v_inaccessible_geom := public.ST_Intersection(public.ST_MakeValid(v_inaccessible_geom), v_total_geom);
    v_inaccessible_area := public.ST_Area(v_inaccessible_geom::public.geography);
  else
    v_inaccessible_area := 0;
  end if;

  v_effective_covered_geom := public.ST_UnaryUnion(public.ST_Collect(array[v_gps_geom, v_manual_incremental_geom]));
  if v_effective_covered_geom is not null and not public.ST_IsEmpty(v_effective_covered_geom) then
    v_effective_area := public.ST_Area(v_effective_covered_geom::public.geography);
  else
    v_effective_area := 0;
  end if;

  v_effective_total_area := greatest(v_total_area - v_inaccessible_area, 0);

  return pg_catalog.jsonb_build_object(
    'campaign_zone_id', p_campaign_zone_id, 'campaign_id', v_campaign_id,
    'calculation_status', 'ready',
    'total_area_m2', pg_catalog.round(v_total_area, 2),
    'gps_area_m2', pg_catalog.round(v_gps_area, 2),
    'manual_area_m2', pg_catalog.round(v_manual_area, 2),
    'inaccessible_area_m2', pg_catalog.round(v_inaccessible_area, 2),
    'gps_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_gps_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'manual_coverage_pct', case when v_total_area > 0 then least(greatest(round((v_manual_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'inaccessible_area_pct', case when v_total_area > 0 then least(greatest(round((v_inaccessible_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'final_operational_coverage_pct', case when v_effective_total_area > 0 then least(greatest(round((v_effective_area / v_effective_total_area) * 100, 2), 0), 100) else 0 end
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'campaign_zone_id', p_campaign_zone_id, 'calculation_status', 'calculation_failed', 'reason_not_calculable', SQLERRM
  );
end;
$$;


ALTER FUNCTION "public"."calculate_zone_final_coverage"("p_campaign_zone_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."campaign_coverage_adjustments_sync_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.zone_id is not null then
    perform public.sync_campaign_zone_progress_cache(new.zone_id, coalesce(new.updated_by, new.created_by));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."campaign_coverage_adjustments_sync_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_public_campaign"("p_campaign_id" "uuid") RETURNS "public"."campaigns"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_row public.campaigns;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select email into v_email
  from auth.users
  where id = v_uid
    and email_confirmed_at is not null;

  if v_email is null then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = '28000';
  end if;

  update public.campaigns
  set user_id = v_uid,
      updated_at = now()
  where id = p_campaign_id
    and user_id is null
    and client_email is not null
    and lower(client_email) = lower(v_email)
  returning * into v_row;

  if v_row.id is null then
    raise exception 'CLAIM_NOT_ALLOWED' using errcode = '42501';
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."claim_public_campaign"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classify_building"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_area NUMERIC;
BEGIN
  v_area := ST_Area(NEW.geometry::geography);

  IF NEW.osm_type IN ('house', 'detached', 'semidetached', 'bungalow') THEN
    NEW.building_class := 'villa';
  ELSIF NEW.osm_type IN ('apartments', 'residential') AND v_area >= 200 THEN
    NEW.building_class := 'palazzo';
  ELSIF NEW.osm_type IN ('apartments', 'residential') AND v_area < 200 THEN
    NEW.building_class := 'villa'; -- Piccoli condomini/vilette a schiera
  ELSE
    NEW.building_class := 'altro';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."classify_building"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_owns_campaign"("p_campaign_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $_$
declare
  has_campaigns boolean;
  ok boolean := false;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'campaigns'
  ) into has_campaigns;

  if not has_campaigns then
    return false;
  end if;

  execute $q$
    select exists (
      select 1
      from public.campaigns
      where id = $1
        and (
          (to_jsonb(campaigns) ? 'client_id' and (to_jsonb(campaigns)->>'client_id')::uuid = auth.uid())
          or (to_jsonb(campaigns) ? 'customer_id' and (to_jsonb(campaigns)->>'customer_id')::uuid = auth.uid())
          or (to_jsonb(campaigns) ? 'user_id' and (to_jsonb(campaigns)->>'user_id')::uuid = auth.uid())
        )
    )
  $q$ using p_campaign_id into ok;

  return coalesce(ok, false);
exception when others then
  return false;
end;
$_$;


ALTER FUNCTION "public"."current_user_owns_campaign"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."final_distribution_report_telemetry"("p_campaign_id" "uuid") RETURNS TABLE("session_id" "uuid", "campaign_zone_id" "uuid", "status" "text", "started_at" timestamp with time zone, "paused_at" timestamp with time zone, "ended_at" timestamp with time zone, "gps_count" bigint, "first_gps_at" timestamp with time zone, "last_gps_at" timestamp with time zone, "photo_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null or not (
    public.gps_is_admin()
    or exists (
      select 1 from public.campaigns campaign
      where campaign.id = p_campaign_id
        and campaign.user_id = auth.uid()
    )
  ) then
    raise exception 'UNAUTHORIZED';
  end if;

  return query
  with gps as (
    select point.session_id, count(*) as gps_count,
           min(point.recorded_at) as first_gps_at,
           max(point.recorded_at) as last_gps_at
    from public.gps_tracking_points point
    join public.delivery_sessions session on session.id = point.session_id
    where session.campaign_id = p_campaign_id
    group by point.session_id
  ), photos as (
    select photo.session_id, count(*) as photo_count
    from public.proof_photos photo
    where photo.campaign_id = p_campaign_id and photo.approved_at is not null
    group by photo.session_id
  )
  select session.id, session.campaign_zone_id, session.status,
         session.started_at, session.paused_at, session.ended_at,
         coalesce(gps.gps_count, 0), gps.first_gps_at, gps.last_gps_at,
         coalesce(photos.photo_count, 0)
  from public.delivery_sessions session
  left join gps on gps.session_id = session.id
  left join photos on photos.session_id = session.id
  where session.campaign_id = p_campaign_id
  order by session.started_at nulls last, session.created_at;
end;
$$;


ALTER FUNCTION "public"."final_distribution_report_telemetry"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."genera_causale"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.causale_bonifico is null then
    new.causale_bonifico := 'VP-' ||
      to_char(now(), 'YYYYMMDD') || '-' ||
      upper(substring(new.id::text, 1, 6));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."genera_causale"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."genera_causale_bonifico"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.causale_bonifico IS NULL THEN
    NEW.causale_bonifico := 'VP-' ||
      TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
      UPPER(SUBSTRING(NEW.id::TEXT, 1, 6));
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."genera_causale_bonifico"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_driver_session"("p_assignment_id" "uuid", "p_access_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
begin
  if p_assignment_id is null then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if v_uid is null then
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select operator_id into v_uid
    from public.operator_assignments
    where id = p_assignment_id and access_token = p_access_token;
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
  else
    if not exists (
      select 1 from public.operator_assignments
      where id = p_assignment_id and operator_id = v_uid
    ) then
      raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
    end if;
  end if;

  select * into v_session
  from public.delivery_sessions s
  where s.assignment_id = p_assignment_id
    and s.driver_id = v_uid
    and s.status in ('started', 'paused')
  order by s.started_at desc nulls last, s.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('session', null);
  end if;

  return jsonb_build_object('session', to_jsonb(v_session));
end;
$$;


ALTER FUNCTION "public"."get_active_driver_session"("p_assignment_id" "uuid", "p_access_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_address_points_bbox"("p_lat_min" double precision, "p_lat_max" double precision, "p_lng_min" double precision, "p_lng_max" double precision, "p_limit" integer DEFAULT 1500) RETURNS TABLE("id" "uuid", "lat" double precision, "lng" double precision, "source" "text")
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    ap.id,
    ap.lat,
    ap.lng,
    ap.source
  FROM public.address_points ap
  WHERE ap.source = 'osm'
    AND ap.lat BETWEEN p_lat_min AND p_lat_max
    AND ap.lng BETWEEN p_lng_min AND p_lng_max
  LIMIT LEAST(p_limit, 1500);
$$;


ALTER FUNCTION "public"."get_address_points_bbox"("p_lat_min" double precision, "p_lat_max" double precision, "p_lng_min" double precision, "p_lng_max" double precision, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_address_points_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) RETURNS TABLE("id" "uuid", "source" "text", "comune" "text", "codice_comune" "text", "via" "text", "numero_civico" "text", "lat" double precision, "lng" double precision, "confidence" numeric, "distance_m" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  with point as (
    select st_setsrid(st_makepoint(center_lng, center_lat), 4326)::geography as geog
  )
  select
    ap.id,
    ap.source,
    ap.comune,
    ap.codice_comune,
    ap.via,
    ap.numero_civico,
    ap.lat,
    ap.lng,
    ap.confidence,
    st_distance(ap.geom::geography, (select geog from point)) as distance_m
  from public.address_points ap
  where ap.geom is not null
    and st_dwithin(
      ap.geom::geography,
      (select geog from point),
      greatest(0, radius_km) * 1000
    )
  order by distance_m asc;
$$;


ALTER FUNCTION "public"."get_address_points_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_address_points_osm_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "max_rows" integer DEFAULT 500) RETURNS TABLE("id" "uuid", "source" "text", "comune" "text", "codice_comune" "text", "via" "text", "numero_civico" "text", "lat" double precision, "lng" double precision, "confidence" numeric, "distance_m" double precision)
    LANGUAGE "sql" STABLE
    AS $$
with params as (
  select
    st_setsrid(st_makepoint(center_lng, center_lat),4326) as center_geom,
    st_setsrid(st_makepoint(center_lng, center_lat),4326)::geography as center_geog,
    greatest(0,radius_km)*1000 as radius_m,
    greatest(
      greatest(0,radius_km)/111.32,
      greatest(0,radius_km)/(111.32*greatest(0.2,cos(radians(center_lat))))
    ) as expand_degrees,

    least(
      greatest(coalesce(max_rows,500),1),
      5000
    ) as row_limit

)
select
  ap.id,
  ap.source,
  ap.comune,
  ap.codice_comune,
  ap.via,
  ap.numero_civico,
  ap.lat,
  ap.lng,
  ap.confidence,
  st_distance(ap.geom::geography,p.center_geog) as distance_m
from public.address_points ap
cross join params p
where ap.source='osm'
  and ap.geom && st_expand(p.center_geom,p.expand_degrees)
  and st_dwithin(ap.geom::geography,p.center_geog,p.radius_m)
order by distance_m
limit (select row_limit from params);
$$;


ALTER FUNCTION "public"."get_address_points_osm_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "max_rows" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_address_points_radius_summary"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "max_rows" integer DEFAULT 1500) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with point as (
    select st_setsrid(st_makepoint(center_lng, center_lat), 4326)::geography geog
  ), matching as materialized (
    select ap.id, ap.source, ap.comune, ap.codice_comune, ap.via, ap.numero_civico,
      ap.lat, ap.lng, ap.confidence,
      st_distance(ap.geom::geography, point.geog) distance_m
    from public.address_points ap cross join point
    where ap.source = 'osm'
      and ap.geom is not null
      and st_dwithin(ap.geom::geography, point.geog, greatest(0, least(3, radius_km)) * 1000)
  ), sampled as (
    select * from matching order by distance_m limit greatest(0, least(1500, max_rows))
  )
  select jsonb_build_object(
    'count', (select count(*) from matching),
    'rows', coalesce((select jsonb_agg(to_jsonb(sampled) order by distance_m) from sampled), '[]'::jsonb)
  )
$$;


ALTER FUNCTION "public"."get_address_points_radius_summary"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "max_rows" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_aggregates_in_radius"("center_lat" numeric, "center_lng" numeric, "radius_km" numeric) RETURNS TABLE("total_famiglie" bigint, "total_popolazione" bigint, "comuni_count" bigint, "sezioni_count" bigint, "avg_density" numeric, "eta_media_pesata" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    SUM(s.famiglie_totali)::BIGINT,
    SUM(s.popolazione_totale)::BIGINT,
    COUNT(DISTINCT s.comune_code)::BIGINT,
    COUNT(*)::BIGINT,
    AVG(s.density_famiglie)::NUMERIC,
    (
      SUM(s.eta_media * s.popolazione_totale)
      / NULLIF(SUM(s.popolazione_totale), 0)
    )::NUMERIC
  FROM istat_census_sections s
  WHERE ST_DWithin(
    s.geometry::geography,
    ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
    radius_km * 1000
  );
END;
$$;


ALTER FUNCTION "public"."get_aggregates_in_radius"("center_lat" numeric, "center_lng" numeric, "radius_km" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_building_distribution_in_radius"("p_center_lat" numeric, "p_center_lng" numeric, "p_radius_km" numeric) RETURNS TABLE("building_class" "text", "count" bigint, "percentage" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_total BIGINT;
  v_circle GEOGRAPHY;
BEGIN
  v_circle := ST_SetSRID(ST_MakePoint(p_center_lng, p_center_lat), 4326)::geography;

  -- Conta totale edifici intercettati
  SELECT COUNT(*) INTO v_total
  FROM osm_buildings b
  WHERE ST_DWithin(b.geometry::geography, v_circle, p_radius_km * 1000);

  IF v_total = 0 THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    b.building_class,
    COUNT(*)::BIGINT,
    ROUND((COUNT(*)::NUMERIC / v_total) * 100, 1)
  FROM osm_buildings b
  WHERE ST_DWithin(b.geometry::geography, v_circle, p_radius_km * 1000)
  GROUP BY b.building_class
  ORDER BY COUNT(*) DESC;
END;
$$;


ALTER FUNCTION "public"."get_building_distribution_in_radius"("p_center_lat" numeric, "p_center_lng" numeric, "p_radius_km" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_campaign_coverage_adjustments"("p_campaign_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_is_driver boolean := false;
  v_result jsonb;
begin
  if v_uid is null and not v_is_admin then
    raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.user_id = v_uid) into v_is_owner;
  if not v_is_admin and not v_is_owner then
    select exists (
      select 1 from public.operator_assignments a
      where a.campaign_id = p_campaign_id and a.operator_id = v_uid and a.status = 'active' and a.revoked_at is null
    ) into v_is_driver;
  end if;
  if not v_is_admin and not v_is_owner and not v_is_driver then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    case when v_is_admin then
      jsonb_build_object('id', a.id, 'campaign_id', a.campaign_id, 'zone_id', a.zone_id, 'adjustment_type', a.adjustment_type,
        'geometry', public.ST_AsGeoJSON(a.geometry)::jsonb, 'reason', a.reason, 'notes', a.notes, 'metadata', a.metadata,
        'created_by', a.created_by, 'created_at', a.created_at, 'updated_at', a.updated_at, 'updated_by', a.updated_by,
        'revoked_at', a.revoked_at, 'revoked_by', a.revoked_by, 'revoke_reason', a.revoke_reason)
    else
      jsonb_build_object('id', a.id, 'campaign_id', a.campaign_id, 'zone_id', a.zone_id, 'adjustment_type', a.adjustment_type,
        'geometry', public.ST_AsGeoJSON(a.geometry)::jsonb, 'updated_at', a.updated_at)
    end order by a.created_at
  ), '[]'::jsonb)
  into v_result
  from public.campaign_coverage_adjustments a
  where a.campaign_id = p_campaign_id and (v_is_admin or a.revoked_at is null);

  return v_result;
end;
$$;


ALTER FUNCTION "public"."get_campaign_coverage_adjustments"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_campaign_kpis"("p_campaign_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select jsonb_build_object(
    'campaign_id',               c.id,
    'title',                     c.title,
    'service_type',              c.service_type,
    'distribution_mode',         c.distribution_mode,
    'campaign_status',           c.status,
    'quote_subtotal',            q.subtotal,
    'service_fee',               q.service_fee,
    'printing_fee',              q.printing_fee,
    'logistics_fee',             q.logistics_fee,
    'households_estimate',       ca.households_estimate,
    'population_estimate',       ca.population_estimate,
    'competitor_count',          ca.competitor_count,
    'poi_count',                 ca.poi_count,
    'avg_income_estimate',       ca.avg_income_estimate,
    'family_index',              ca.family_index,
    'commercial_density_index',  ca.commercial_density_index,
    'reach_score',               ca.reach_score,
    'roi_score',                 ca.roi_score,
    'confidence_score',          ca.confidence_score
  )
  from campaigns c
  left join campaign_analysis ca on ca.campaign_id = c.id
  left join lateral (
    select subtotal, service_fee, printing_fee, logistics_fee
    from quotes
    where campaign_id = c.id
    order by id desc
    limit 1
  ) q on true
  where c.id = p_campaign_id;
$$;


ALTER FUNCTION "public"."get_campaign_kpis"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_campaign_zone_progress"("p_campaign_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_result jsonb;
begin
  if v_uid is null and not v_is_admin then
    raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.user_id = v_uid) into v_is_owner;
  if not v_is_admin and not v_is_owner then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    case when v_is_admin then
      jsonb_build_object('campaign_zone_id', z.id, 'campaign_id', z.campaign_id, 'zone_name', z.zone_name, 'address_label', z.address_label,
        'effective_percent', coalesce(p.effective_percent, 0), 'updated_at', p.updated_at,
        'automatic_percent', coalesce(p.automatic_percent, 0), 'manual_percent', p.manual_percent,
        'inaccessible_percent', p.inaccessible_percent, 'adjustment_type', p.adjustment_type,
        'manual_override_enabled', coalesce(p.manual_override_enabled, false), 'override_reason', p.override_reason,
        'notes', p.notes, 'source', coalesce(p.source, 'legacy'),
        'calculation_version', p.calculation_version, 'source_summary', coalesce(p.source_summary, '{}'::jsonb),
        'automatic_updated_at', p.automatic_updated_at, 'updated_by', p.updated_by)
    else
      jsonb_build_object('campaign_zone_id', z.id, 'campaign_id', z.campaign_id, 'zone_name', z.zone_name, 'address_label', z.address_label,
        'effective_percent', coalesce(p.effective_percent, 0), 'automatic_percent', coalesce(p.automatic_percent, 0),
        'manual_percent', p.manual_percent, 'inaccessible_percent', p.inaccessible_percent, 'adjustment_type', p.adjustment_type,
        'manual_override_enabled', coalesce(p.manual_override_enabled, false), 'updated_at', p.updated_at)
    end order by z.created_at, z.id
  ), '[]'::jsonb)
  into v_result
  from public.campaign_zones z
  left join public.campaign_zone_progress p on p.campaign_zone_id = z.id and p.campaign_id = z.campaign_id
  where z.campaign_id = p_campaign_id;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."get_campaign_zone_progress"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_comuni_breakdown_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision) RETURNS TABLE("municipality_code" "text", "comune_name" "text", "households_total" integer, "population_total" integer, "area_km2" numeric, "density_per_km2" numeric, "pct_copertura" numeric, "volantini_nel_raggio" integer, "age_0_14_pct" numeric, "age_65_plus_pct" numeric, "average_income" numeric, "old_age_index" numeric, "businesses_total" integer, "geometry_geojson" "text")
    LANGUAGE "sql" STABLE
    AS $$
  with point as (
    select st_setsrid(st_point(p_lng, p_lat), 4326)::geography as geog
  ),
  candidates as (
    select
      gm.*,
      case
        when gm.geom is null then null
        else st_area(
          st_intersection(
            gm.geom,
            st_buffer((select geog from point), p_radius_km * 1000)::geometry
          )::geography
        )
      end as intersection_m2,
      case
        when gm.geom is null then null
        else st_area(gm.geom::geography)
      end as municipality_m2
    from public.geo_municipalities gm
    where gm.geom is not null
      and st_dwithin(
        gm.geom::geography,
        (select geog from point),
        p_radius_km * 1000
      )
  )
  select
    c.municipality_code,
    c.municipality_name as comune_name,
    c.households_total,
    c.population_total,
    c.area_km2,
    c.density_per_km2,
    least(
      100,
      greatest(
        1,
        round((coalesce(c.intersection_m2 / nullif(c.municipality_m2, 0), 1) * 100)::numeric, 2)
      )
    ) as pct_copertura,
    greatest(
      0,
      round(
        coalesce(c.households_total, 0)
        * coalesce(c.intersection_m2 / nullif(c.municipality_m2, 0), 1)
        * 1.1
      )
    )::integer as volantini_nel_raggio,
    di.age_0_14_pct,
    di.age_65_plus_pct,
    di.average_income,
    di.old_age_index,
    di.businesses_total,
    case
      when c.geom is not null
        then st_asgeojson(st_simplifypreservetopology(c.geom, 0.0001))
      else null
    end as geometry_geojson
  from candidates c
  left join public.demographic_indicators di
    on di.municipality_code = c.municipality_code
  order by c.geom <-> st_setsrid(st_point(p_lng, p_lat), 4326);
$$;


ALTER FUNCTION "public"."get_comuni_breakdown_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_demographics_in_radius"("p_center_lat" numeric, "p_center_lng" numeric, "p_radius_km" numeric) RETURNS TABLE("eta_0_14" numeric, "eta_15_29" numeric, "eta_30_44" numeric, "eta_45_64" numeric, "eta_65_79" numeric, "eta_80plus" numeric, "maschi" numeric, "femmine" numeric, "totale_pop" numeric, "eta_media" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE v_circle GEOGRAPHY;
BEGIN
  v_circle := ST_Buffer(
    ST_SetSRID(ST_MakePoint(p_center_lng, p_center_lat), 4326)::geography,
    p_radius_km * 1000
  );
  RETURN QUERY
  WITH sezioni AS (
    SELECT
      s.eta_0_14::NUMERIC, s.eta_15_29::NUMERIC, s.eta_30_44::NUMERIC,
      s.eta_45_64::NUMERIC, s.eta_65_79::NUMERIC, s.eta_80plus::NUMERIC,
      s.maschi::NUMERIC, s.femmine::NUMERIC,
      COALESCE(s.eta_media, 0)::NUMERIC AS eta_media,
      s.popolazione_totale::NUMERIC AS pop,
      CASE
        WHEN ST_Within(s.geometry, v_circle::geometry) THEN 1.0::NUMERIC
        ELSE (ST_Area(ST_Intersection(s.geometry, v_circle::geometry))
             / NULLIF(ST_Area(s.geometry), 0))::NUMERIC
      END AS pct
    FROM istat_census_sections s
    WHERE ST_Intersects(s.geometry, v_circle::geometry)
      AND s.popolazione_totale > 0
  )
  SELECT
    ROUND(SUM(d.eta_0_14  * d.pct)),
    ROUND(SUM(d.eta_15_29 * d.pct)),
    ROUND(SUM(d.eta_30_44 * d.pct)),
    ROUND(SUM(d.eta_45_64 * d.pct)),
    ROUND(SUM(d.eta_65_79 * d.pct)),
    ROUND(SUM(d.eta_80plus* d.pct)),
    ROUND(SUM(d.maschi    * d.pct)),
    ROUND(SUM(d.femmine   * d.pct)),
    ROUND(SUM(d.pop       * d.pct)),
    ROUND(SUM(d.eta_media * d.pop * d.pct) / NULLIF(SUM(d.pop * d.pct), 0), 1)
  FROM sezioni d;
END;
$$;


ALTER FUNCTION "public"."get_demographics_in_radius"("p_center_lat" numeric, "p_center_lng" numeric, "p_radius_km" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_driver_assignment"("p_assignment_id" "uuid") RETURNS TABLE("id" "uuid", "campaign_id" "uuid", "campaign_title" "text", "operator_id" "uuid", "group_id" "uuid", "zone_id" "uuid", "status" "text", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone, "revoked_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Non autenticato.' using errcode = '42501';
  end if;
  if p_assignment_id is null then
    raise exception 'assignment_id obbligatorio.' using errcode = '22023';
  end if;

  if not public.jwt_is_admin() then
    if not exists (
      select 1 from public.operator_assignments oa2
      where oa2.id = p_assignment_id and oa2.operator_id = v_uid
    ) then
      raise exception 'Accesso negato.' using errcode = '42501';
    end if;
  end if;

  return query
    select
      oa.id, oa.campaign_id, c.title, oa.operator_id, oa.group_id, oa.zone_id,
      oa.status, oa.starts_at, oa.ends_at, oa.revoked_at, oa.metadata
    from public.operator_assignments oa
    left join public.campaigns c on c.id = oa.campaign_id
    where oa.id = p_assignment_id;
end;
$$;


ALTER FUNCTION "public"."get_driver_assignment"("p_assignment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_gtfs_stops_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision, "p_limit" integer DEFAULT 200) RETURNS TABLE("source" "text", "agency" "text", "stop_id" "text", "stop_name" "text", "stop_lat" numeric, "stop_lng" numeric, "distance_km" numeric)
    LANGUAGE "sql" STABLE
    AS $$
  with point as (
    select st_setsrid(st_point(p_lng, p_lat), 4326)::geography as geog
  )
  select
    s.source,
    s.agency,
    s.stop_id,
    s.stop_name,
    s.stop_lat,
    s.stop_lng,
    round((st_distance(s.geom::geography, (select geog from point)) / 1000)::numeric, 3) as distance_km
  from public.gtfs_stops s
  where s.geom is not null
    and st_dwithin(s.geom::geography, (select geog from point), greatest(0, p_radius_km) * 1000)
  order by s.geom <-> st_setsrid(st_point(p_lng, p_lat), 4326)
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;


ALTER FUNCTION "public"."get_gtfs_stops_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_map_sectors"("p_service_type" "text", "p_center_lat" double precision, "p_center_lng" double precision, "p_radius_km" double precision DEFAULT 5) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'type',     'FeatureCollection',
    'features', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'type',       'Feature',
          'geometry',   st_asgeojson(s.geometry)::jsonb,
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
  ) into v_result
  from public.map_sectors s
  where s.service_type = p_service_type
    and st_dwithin(
          s.geometry::geography,
          st_setsrid(st_makepoint(p_center_lng, p_center_lat), 4326)::geography,
          p_radius_km * 1000
        );
  return v_result;
end;
$$;


ALTER FUNCTION "public"."get_map_sectors"("p_service_type" "text", "p_center_lat" double precision, "p_center_lng" double precision, "p_radius_km" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nil_breakdown_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) RETURNS TABLE("territory_level" "text", "nil_code" "text", "nil_name" "text", "municipality_code" "text", "comune_name" "text", "households_total" integer, "population_total" integer, "households_in_radius" integer, "population_in_radius" integer, "area_km2" numeric, "density_per_km2" numeric, "pct_copertura" numeric, "volantini_nel_raggio" integer, "age_0_14_pct" numeric, "age_65_plus_pct" numeric, "average_income" numeric, "old_age_index" numeric, "businesses_total" integer, "geometry_geojson" "text")
    LANGUAGE "sql" STABLE
    AS $$
  with point as (
    select st_setsrid(st_point(center_lng, center_lat), 4326)::geography as geog
  ),
  milano as (
    select
      gm.municipality_code,
      gm.municipality_name,
      coalesce(gm.households_total, 0)::numeric as households_total,
      coalesce(gm.population_total, 0)::numeric as population_total,
      nullif(st_area(gm.geom::geography), 0) as municipality_m2
    from public.geo_municipalities gm
    where lower(gm.municipality_name) = 'milano'
       or gm.municipality_code = '015146'
    order by case when gm.municipality_code = '015146' then 0 else 1 end
    limit 1
  ),
  candidates as (
    select
      n.*,
      st_area(n.geom::geography) as nil_m2,
      st_area(st_intersection(n.geom, st_buffer((select geog from point), greatest(radius_km, 0) * 1000)::geometry)::geography) as intersection_m2
    from public.geo_nil_milano n
    where n.geom is not null
      and st_dwithin(n.geom::geography, (select geog from point), greatest(radius_km, 0) * 1000)
  ),
  enriched as (
    select
      c.*,
      m.municipality_code,
      m.municipality_name,
      coalesce(c.nil_m2 / nullif(m.municipality_m2, 0), 0) as nil_city_ratio,
      coalesce(c.intersection_m2 / nullif(c.nil_m2, 0), 0) as nil_radius_ratio,
      m.households_total,
      m.population_total
    from candidates c
    cross join milano m
    where c.intersection_m2 > 0
  )
  select
    'nil'::text as territory_level,
    e.nil_code,
    e.nil_name,
    e.municipality_code,
    e.municipality_name as comune_name,
    greatest(0, round(e.households_total * e.nil_city_ratio))::integer as households_total,
    greatest(0, round(e.population_total * e.nil_city_ratio))::integer as population_total,
    greatest(0, round(e.households_total * e.nil_city_ratio * e.nil_radius_ratio))::integer as households_in_radius,
    greatest(0, round(e.population_total * e.nil_city_ratio * e.nil_radius_ratio))::integer as population_in_radius,
    round((e.nil_m2 / 1000000.0)::numeric, 3) as area_km2,
    case
      when e.nil_m2 > 0 then round((e.population_total * e.nil_city_ratio / (e.nil_m2 / 1000000.0))::numeric, 2)
      else null
    end as density_per_km2,
    least(100, greatest(1, round((e.nil_radius_ratio * 100)::numeric, 2))) as pct_copertura,
    greatest(0, round(e.households_total * e.nil_city_ratio * e.nil_radius_ratio * 1.1))::integer as volantini_nel_raggio,
    di.age_0_14_pct,
    di.age_65_plus_pct,
    di.average_income,
    di.old_age_index,
    di.businesses_total,
    st_asgeojson(st_simplifypreservetopology(e.geom, 0.00007)) as geometry_geojson
  from enriched e
  left join public.demographic_indicators di
    on di.municipality_code = e.municipality_code
  order by e.geom <-> st_setsrid(st_point(center_lng, center_lat), 4326);
$$;


ALTER FUNCTION "public"."get_nil_breakdown_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_omi_zones_by_municipality"("p_municipality_name" "text", "p_municipality_code" "text" DEFAULT NULL::"text") RETURNS TABLE("source" "text", "year" integer, "semester" integer, "municipality_name" "text", "municipality_code" "text", "zone_code" "text", "zone_name" "text", "min_value" numeric, "max_value" numeric, "typology" "text", "geometry_geojson" "text")
    LANGUAGE "sql" STABLE
    AS $$
  select
    z.source,
    z.year,
    z.semester,
    z.municipality_name,
    z.municipality_code,
    z.zone_code,
    z.zone_name,
    z.min_value,
    z.max_value,
    z.typology,
    case when z.geom is not null then st_asgeojson(st_simplifypreservetopology(z.geom, 0.0001)) else null end as geometry_geojson
  from public.omi_zones z
  where (
      p_municipality_code is not null
      and z.municipality_code = p_municipality_code
    )
    or (
      p_municipality_name is not null
      and lower(z.municipality_name) = lower(p_municipality_name)
    )
  order by z.year desc nulls last, z.semester desc nulls last, z.zone_code, z.typology
  limit 200;
$$;


ALTER FUNCTION "public"."get_omi_zones_by_municipality"("p_municipality_name" "text", "p_municipality_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_omi_zones_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision) RETURNS TABLE("source" "text", "year" integer, "semester" integer, "municipality_name" "text", "municipality_code" "text", "zone_code" "text", "zone_name" "text", "min_value" numeric, "max_value" numeric, "typology" "text", "geometry_geojson" "text")
    LANGUAGE "sql" STABLE
    AS $$
  select *
  from public.get_omi_zones_in_radius(
    center_lat => p_lat,
    center_lng => p_lng,
    radius_km => p_radius_km,
    target_year => null,
    target_semester => null
  );
$$;


ALTER FUNCTION "public"."get_omi_zones_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_omi_zones_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "target_year" integer DEFAULT NULL::integer, "target_semester" integer DEFAULT NULL::integer) RETURNS TABLE("source" "text", "year" integer, "semester" integer, "municipality_name" "text", "municipality_code" "text", "zone_code" "text", "zone_name" "text", "min_value" numeric, "max_value" numeric, "typology" "text", "geometry_geojson" "text")
    LANGUAGE "sql" STABLE
    AS $$
  with point as (
    select st_setsrid(st_point(center_lng, center_lat), 4326)::geography as geog
  )
  select
    z.source,
    z.year,
    z.semester,
    z.municipality_name,
    z.municipality_code,
    z.zone_code,
    z.zone_name,
    z.min_value,
    z.max_value,
    z.typology,
    case when z.geom is not null then st_asgeojson(st_simplifypreservetopology(z.geom, 0.0001)) else null end as geometry_geojson
  from public.omi_zones z
  where z.geom is not null
    and st_dwithin(z.geom::geography, (select geog from point), greatest(0, radius_km) * 1000)
    and (target_year is null or z.year = target_year)
    and (target_semester is null or z.semester = target_semester)
  order by z.year desc nulls last, z.semester desc nulls last, z.municipality_name, z.zone_code, z.typology
  limit 200;
$$;


ALTER FUNCTION "public"."get_omi_zones_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "target_year" integer, "target_semester" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_postal_areas_analysis"("postal_codes" "text"[]) RETURNS TABLE("postal_code" "text", "municipality_name" "text", "households_estimated" numeric, "population_estimated" numeric, "area_km2" numeric, "recommended_flyers" numeric, "geometry_geojson" "jsonb", "source_flags" "text"[])
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."get_postal_areas_analysis"("postal_codes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_driver_assignment"("p_assignment_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_assignment public.operator_assignments%rowtype;
  v_campaign_title text;
  v_zones jsonb;
  v_available boolean;
  v_confirmed_at timestamptz;
begin
  if p_assignment_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_assignment
  from public.operator_assignments
  where id = p_assignment_id;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  v_available := v_assignment.status not in ('revoked', 'completed')
    and (v_assignment.starts_at is null or v_assignment.starts_at <= now())
    and (v_assignment.ends_at is null or v_assignment.ends_at > now());

  if not v_available then
    return jsonb_build_object(
      'id', v_assignment.id,
      'status', v_assignment.status,
      'starts_at', v_assignment.starts_at,
      'ends_at', v_assignment.ends_at,
      'error', 'unavailable'
    );
  end if;

  select c.title into v_campaign_title
  from public.campaigns c
  where c.id = v_assignment.campaign_id;

  select ael.created_at into v_confirmed_at
  from public.assignment_event_log ael
  where ael.assignment_id = p_assignment_id
    and ael.event_type = 'assignment_program_confirmed'
  order by ael.created_at asc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(cz.id, oaz.zone_id),
      'zone_name', oaz.municipality_name,
      'priority', coalesce(cz.priority, 999),
      'quantity', coalesce(oaz.quantity, cz.quantity_assigned),
      'status', coalesce(cz.status, 'Da iniziare'),
      'notes', cz.notes,
      'center_lat', cz.center_lat,
      'center_lng', cz.center_lng,
      'radius_m', cz.radius_m
    ) order by coalesce(cz.priority, 999), oaz.municipality_name), '[]'::jsonb)
  into v_zones
  from public.operator_assignment_zones oaz
  left join public.campaign_zones cz on cz.id = oaz.zone_id
  where oaz.assignment_id = p_assignment_id;

  return jsonb_build_object(
    'id', v_assignment.id,
    'campaign_id', v_assignment.campaign_id,
    'campaign_title', v_campaign_title,
    'status', v_assignment.status,
    'starts_at', v_assignment.starts_at,
    'ends_at', v_assignment.ends_at,
    'metadata', v_assignment.metadata,
    'zones', v_zones,
    'confirmed_at', v_confirmed_at
  );
end;
$$;


ALTER FUNCTION "public"."get_public_driver_assignment"("p_assignment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_sections_in_radius"("center_lat" numeric, "center_lng" numeric, "radius_km" numeric) RETURNS TABLE("sezione_code" "text", "comune_name" "text", "cap" "text", "famiglie" integer, "popolazione" integer, "density" numeric, "geometry_geojson" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.sezione_code,
    s.comune_name,
    s.cap,
    s.famiglie_totali::INTEGER,
    s.popolazione_totale::INTEGER,
    s.density_famiglie,
    ST_AsGeoJSON(s.geometry)::jsonb
  FROM istat_census_sections s
  WHERE ST_DWithin(
    s.geometry::geography,
    ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography,
    radius_km * 1000
  );
END;
$$;


ALTER FUNCTION "public"."get_sections_in_radius"("center_lat" numeric, "center_lng" numeric, "radius_km" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_transport_stops_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) RETURNS TABLE("stop_id" "text", "stop_name" "text", "stop_type" "text", "routes" "jsonb", "distance_m" double precision, "lat" double precision, "lng" double precision, "source" "text")
    LANGUAGE "sql" STABLE
    AS $$
  with point as (
    select st_setsrid(st_makepoint(center_lng, center_lat), 4326)::geography as geog
  )
  select
    s.stop_id,
    s.stop_name,
    s.stop_type,
    coalesce(
      jsonb_agg(
        distinct jsonb_build_object(
          'route_id', r.route_id,
          'route_short_name', r.route_short_name,
          'route_long_name', r.route_long_name,
          'route_type', r.route_type,
          'route_type_label', r.route_type_label,
          'route_color', r.route_color,
          'route_text_color', r.route_text_color
        )
      ) filter (where r.route_id is not null),
      '[]'::jsonb
    ) as routes,
    st_distance(s.geom::geography, (select geog from point)) as distance_m,
    s.lat,
    s.lng,
    s.source
  from public.transport_stops s
  left join public.transport_stop_routes sr
    on sr.source = s.source
   and sr.stop_id = s.stop_id
  left join public.transport_routes r
    on r.source = sr.source
   and r.route_id = sr.route_id
  where s.geom is not null
    and st_dwithin(
      s.geom::geography,
      (select geog from point),
      greatest(0, radius_km) * 1000
    )
  group by s.source, s.stop_id, s.stop_name, s.stop_type, s.lat, s.lng, s.geom
  order by distance_m asc;
$$;


ALTER FUNCTION "public"."get_transport_stops_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gps_assignment_is_valid"("p_assignment_id" "uuid", "p_operator_id" "uuid", "p_campaign_id" "uuid", "p_group_id" "uuid", "p_at" timestamp with time zone DEFAULT "now"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.operator_assignments a
    join public.operator_profiles o on o.user_id = a.operator_id
    join public.campaigns c on c.id = a.campaign_id
    join public.operational_groups g
      on g.id = a.group_id and g.campaign_id = a.campaign_id
    where a.id = p_assignment_id
      and a.operator_id = p_operator_id
      and a.campaign_id = p_campaign_id
      and a.group_id = p_group_id
      and a.status = 'active'
      and a.revoked_at is null
      and a.starts_at <= p_at
      and (a.ends_at is null or a.ends_at > p_at)
      and o.active
      and o.disabled_at is null
      and c.status = 'in_progress'
  );
$$;


ALTER FUNCTION "public"."gps_assignment_is_valid"("p_assignment_id" "uuid", "p_operator_id" "uuid", "p_campaign_id" "uuid", "p_group_id" "uuid", "p_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gps_calculate_zone_coverage"("p_session_id" "uuid", "p_buffer_meters" numeric DEFAULT 30) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_role text := auth.role();
  v_session public.delivery_sessions%rowtype;
  v_zone public.campaign_zones%rowtype;
  v_zone_geom public.geometry;
  v_track_geom public.geometry;
  v_buffered_track public.geometry;
  v_intersection public.geometry;
  v_total_area numeric;
  v_covered_area numeric;
  v_coverage_percent numeric(5,2);
  v_valid_points integer := 0;
  v_total_points integer := 0;
  v_excluded_points integer := 0;
  v_status text;
  v_reason text := null;
  v_result jsonb;
  v_has_access boolean := false;
  v_is_admin boolean := false;
begin
  -- Controllo permessi
  v_is_admin := public.jwt_is_admin() or v_role = 'service_role';

  select * into v_session from public.delivery_sessions where id = p_session_id;
  if not found then
    raise exception 'SESSIONE_NON_TROVATA' using errcode = '42501';
  end if;

  if v_is_admin or v_session.driver_id = v_uid then
    v_has_access := true;
  end if;

  if not v_has_access then
    v_status := 'unauthorized';
    v_reason := 'Accesso negato alla sessione specificata.';
    return pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'calculation_status', v_status,
      'reason_not_calculable', v_reason
    );
  end if;

  -- 1. Recupero Zona
  if v_session.campaign_zone_id is null then
    v_status := 'zone_geometry_missing';
    v_reason := 'La sessione non Ã¨ associata ad alcuna campagna_zone_id';
    return pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'campaign_zone_id', null,
      'calculation_status', v_status,
      'reason_not_calculable', v_reason
    );
  end if;

  select * into v_zone from public.campaign_zones where id = v_session.campaign_zone_id;

  -- Definisci e valida la geometria della zona (usando polygon_geojson)
  if v_zone.polygon_geojson is not null then
    v_zone_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(v_zone.polygon_geojson::text), 4326));
  elsif v_zone.center_lat is not null and v_zone.center_lng is not null and v_zone.radius_m is not null then
    v_zone_geom := public.ST_MakeValid(public.ST_Buffer(public.ST_SetSRID(public.ST_MakePoint(v_zone.center_lng, v_zone.center_lat), 4326)::public.geography, v_zone.radius_m)::public.geometry);
  else
    v_status := 'zone_geometry_missing';
    v_reason := 'Geometria zona non disponibile (nessun poligono, nessun centro/raggio)';
    return pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'campaign_zone_id', v_zone.id,
      'calculation_status', v_status,
      'reason_not_calculable', v_reason
    );
  end if;

  -- 2. Filtro avanzato dei punti e generazione LineString
  -- Evitiamo duplicati identici e salti anomali (> 130 km/h = ~36 m/s)
  with raw_points as (
    select
      geom,
      recorded_at,
      pg_catalog.lag(recorded_at) over (order by recorded_at asc) as prev_recorded_at,
      pg_catalog.lag(geom) over (order by recorded_at asc) as prev_geom
    from public.gps_tracking_points
    where session_id = p_session_id
      and lat != 0 and lng != 0
      and (accuracy is null or accuracy <= 65)
  ),
  speed_filtered as (
    select
      geom,
      recorded_at,
      case
        when prev_recorded_at is not null and extract(epoch from (recorded_at - prev_recorded_at)) > 0
        then public.ST_Distance(geom::public.geography, prev_geom::public.geography) / extract(epoch from (recorded_at - prev_recorded_at))
        else 0
      end as speed_mps,
      public.ST_Distance(geom::public.geography, prev_geom::public.geography) as dist_from_prev
    from raw_points
    where prev_geom is null or public.ST_Distance(geom::public.geography, prev_geom::public.geography) > 0
  ),
  valid_points_cte as (
    select geom, recorded_at
    from speed_filtered
    where speed_mps <= 36.1 -- max ~130 km/h
  )
  select
    (select pg_catalog.count(*) from public.gps_tracking_points where session_id = p_session_id),
    (select pg_catalog.count(*) from valid_points_cte),
    (select public.ST_MakeLine(geom order by recorded_at asc) from valid_points_cte)
  into v_total_points, v_valid_points, v_track_geom;

  v_excluded_points := v_total_points - v_valid_points;

  if v_valid_points < 2 or v_track_geom is null or public.ST_IsEmpty(v_track_geom) then
    v_status := 'not_enough_points';
    v_reason := 'Servono almeno 2 punti GPS validi';
    return pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'campaign_zone_id', v_zone.id,
      'calculation_status', v_status,
      'reason_not_calculable', v_reason,
      'valid_points', v_valid_points,
      'excluded_points', v_excluded_points
    );
  end if;

  -- 4. Operazioni Spaziali
  begin
    v_buffered_track := public.ST_MakeValid(public.ST_Buffer(v_track_geom::public.geography, p_buffer_meters)::public.geometry);
    v_buffered_track := public.ST_MakeValid(public.ST_UnaryUnion(v_buffered_track));

    if not public.ST_IsValid(v_zone_geom) then
       v_zone_geom := public.ST_MakeValid(v_zone_geom);
    end if;

    v_intersection := public.ST_Intersection(v_buffered_track, v_zone_geom);

    -- 5. Calcolo Aree
    v_total_area := public.ST_Area(v_zone_geom::public.geography);
    v_covered_area := public.ST_Area(v_intersection::public.geography);

    if v_total_area <= 0 then
      v_coverage_percent := 0;
    else
      v_coverage_percent := least(greatest((v_covered_area / v_total_area) * 100, 0), 100);
    end if;

    v_status := 'ready';

    -- 6. Persistenza
    insert into public.delivery_session_coverage (
      session_id, campaign_zone_id, coverage_percent, covered_area_m2, total_area_m2,
      buffer_meters, valid_points, excluded_points, calculation_status, calculated_at, updated_at
    ) values (
      p_session_id, v_zone.id, pg_catalog.round(v_coverage_percent, 2), pg_catalog.round(v_covered_area, 2), pg_catalog.round(v_total_area, 2),
      p_buffer_meters, v_valid_points, v_excluded_points, v_status, pg_catalog.now(), pg_catalog.now()
    )
    on conflict (session_id) do update set
      coverage_percent = excluded.coverage_percent,
      covered_area_m2 = excluded.covered_area_m2,
      total_area_m2 = excluded.total_area_m2,
      buffer_meters = excluded.buffer_meters,
      valid_points = excluded.valid_points,
      excluded_points = excluded.excluded_points,
      calculation_status = excluded.calculation_status,
      calculated_at = excluded.calculated_at,
      updated_at = pg_catalog.now();

    -- Return JSON
    v_result := pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'campaign_zone_id', v_zone.id,
      'zone_name', v_zone.zone_name,
      'total_area_m2', pg_catalog.round(v_total_area, 2),
      'covered_area_m2', pg_catalog.round(v_covered_area, 2),
      'uncovered_area_m2', pg_catalog.round(greatest(v_total_area - v_covered_area, 0), 2),
      'coverage_percent', pg_catalog.round(v_coverage_percent, 2),
      'valid_points', v_valid_points,
      'excluded_points', v_excluded_points,
      'buffer_meters', p_buffer_meters,
      'calculated_at', pg_catalog.now(),
      'calculation_status', v_status
    );

    return v_result;
  exception when others then
    return pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'campaign_zone_id', v_zone.id,
      'calculation_status', 'calculation_failed',
      'reason_not_calculable', SQLERRM
    );
  end;
end;
$$;


ALTER FUNCTION "public"."gps_calculate_zone_coverage"("p_session_id" "uuid", "p_buffer_meters" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gps_get_operator_campaign"("p_campaign_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'campaign_name', c.campaign_name,
    'service_type', c.service_type,
    'distribution_mode', c.distribution_mode,
    'status', c.status,
    'address_input', c.address_input,
    'address', c.address,
    'zone_name', c.zone_name,
    'city', c.city,
    'distribution_start_date', c.distribution_start_date,
    'distribution_end_date', c.distribution_end_date,
    'start_date', c.start_date,
    'end_date', c.end_date,
    'campaign_zones', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', z.id,
            'zone_name', z.zone_name,
            'status', z.status,
            'quantity_assigned', z.quantity_assigned,
            'priority', z.priority,
            'center_lat', z.center_lat,
            'center_lng', z.center_lng,
            'radius_km', case when z.radius_m is not null then z.radius_m::numeric / 1000 else null end,
            'geometry_geojson', z.polygon_geojson
          )
          order by coalesce(z.priority, 999), z.zone_name
        )
        from public.campaign_zones z
        where z.campaign_id = c.id
          and z.group_id = a.group_id
      ),
      '[]'::jsonb
    )
  ) into v_result
  from public.campaigns c
  join public.operator_assignments a on a.campaign_id = c.id
  where c.id = p_campaign_id
    and a.operator_id = v_uid
    and public.gps_assignment_is_valid(
      a.id, a.operator_id, a.campaign_id, a.group_id, now()
    )
  limit 1;

  if v_result is null then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."gps_get_operator_campaign"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "started_at" timestamp with time zone,
    "paused_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "driver_name" "text",
    "driver_phone" "text",
    "device_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "group_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "assignment_id" "uuid",
    "campaign_zone_id" "uuid",
    CONSTRAINT "delivery_sessions_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'paused'::"text", 'completed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."delivery_sessions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_sessions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gps_heartbeat_session"("p_session_id" "uuid", "p_access_token" "text" DEFAULT NULL::"text") RETURNS "public"."delivery_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
begin
  if v_uid is null then
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select a.operator_id into v_uid
    from public.delivery_sessions s
    join public.operator_assignments a on a.id = s.assignment_id
    where s.id = p_session_id and a.access_token = p_access_token;
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
  end if;

  select * into v_session
  from public.delivery_sessions s
  where s.id = p_session_id
    and s.driver_id = v_uid
    and s.status in ('started', 'paused')
    and s.assignment_id is not null
    and public.gps_assignment_is_valid(
      s.assignment_id, v_uid, s.campaign_id, s.group_id, now()
    )
  for update;

  if not found then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  update public.delivery_sessions
    set updated_at = now()
    where id = p_session_id returning * into v_session;
  return v_session;
end;
$$;


ALTER FUNCTION "public"."gps_heartbeat_session"("p_session_id" "uuid", "p_access_token" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gps_tracking_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "accuracy" double precision,
    "speed" double precision,
    "heading" double precision,
    "recorded_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "geom" "public"."geometry"(Point,4326)
);

ALTER TABLE ONLY "public"."gps_tracking_points" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."gps_tracking_points" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gps_insert_point"("p_session_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision DEFAULT NULL::double precision, "p_speed" double precision DEFAULT NULL::double precision, "p_heading" double precision DEFAULT NULL::double precision, "p_recorded_at" timestamp with time zone DEFAULT "now"(), "p_access_token" "text" DEFAULT NULL::"text") RETURNS "public"."gps_tracking_points"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_point public.gps_tracking_points%rowtype;
begin
  if v_uid is null then
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select a.operator_id into v_uid
    from public.delivery_sessions s
    join public.operator_assignments a on a.id = s.assignment_id
    where s.id = p_session_id and a.access_token = p_access_token;
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
  end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'COORDINATE_NON_VALIDE' using errcode = '22023';
  end if;

  select * into v_session
  from public.delivery_sessions s
  where s.id = p_session_id
    and s.driver_id = v_uid
    and s.status in ('started', 'paused')
    and s.assignment_id is not null
    and public.gps_assignment_is_valid(
      s.assignment_id, v_uid, s.campaign_id, s.group_id, now()
    );

  if not found then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  insert into public.gps_tracking_points (
    campaign_id, session_id, driver_id, lat, lng,
    accuracy, speed, heading, recorded_at
  ) values (
    v_session.campaign_id, v_session.id, v_uid, p_lat, p_lng,
    p_accuracy, p_speed, p_heading, coalesce(p_recorded_at, now())
  ) returning * into v_point;

  return v_point;
end;
$$;


ALTER FUNCTION "public"."gps_insert_point"("p_session_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_speed" double precision, "p_heading" double precision, "p_recorded_at" timestamp with time zone, "p_access_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gps_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(auth.role() = 'service_role', false)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    );
$$;


ALTER FUNCTION "public"."gps_is_admin"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proof_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "driver_id" "uuid",
    "storage_path" "text" NOT NULL,
    "lat" double precision,
    "lng" double precision,
    "note" "text",
    "taken_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."proof_photos" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."proof_photos" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gps_register_proof_photo"("p_session_id" "uuid", "p_storage_path" "text", "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision, "p_note" "text" DEFAULT NULL::"text", "p_taken_at" timestamp with time zone DEFAULT "now"()) RETURNS "public"."proof_photos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_photo public.proof_photos%rowtype;
  v_expected_prefix text;
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select * into v_session
  from public.delivery_sessions s
  where s.id = p_session_id
    and s.driver_id = v_uid
    and s.status in ('started', 'paused')
    and s.assignment_id is not null
    and public.gps_assignment_is_valid(
      s.assignment_id, v_uid, s.campaign_id, s.group_id, now()
    );

  if not found then
    raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  v_expected_prefix := 'campaign/' || v_session.campaign_id::text
    || '/session/' || v_session.id::text || '/photo/';

  if p_storage_path not like (v_expected_prefix || '%') or p_storage_path like '%..%' then
    raise exception 'PERCORSO_FOTO_NON_VALIDO' using errcode = '22023';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'proof-photos' and o.name = p_storage_path
  ) then
    raise exception 'OGGETTO_FOTO_NON_TROVATO' using errcode = 'P0002';
  end if;

  insert into public.proof_photos (
    campaign_id, session_id, driver_id, storage_path,
    lat, lng, note, taken_at
  ) values (
    v_session.campaign_id, v_session.id, v_uid, p_storage_path,
    p_lat, p_lng, nullif(btrim(p_note), ''), coalesce(p_taken_at, now())
  ) returning * into v_photo;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id,
    context
  ) values (
    v_uid, 'proof_photo_registered', v_session.campaign_id,
    v_session.assignment_id, v_session.id,
    jsonb_build_object('photo_id', v_photo.id)
  );

  return v_photo;
end;
$$;


ALTER FUNCTION "public"."gps_register_proof_photo"("p_session_id" "uuid", "p_storage_path" "text", "p_lat" double precision, "p_lng" double precision, "p_note" "text", "p_taken_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gps_start_session"("p_assignment_id" "uuid", "p_device_id" "text" DEFAULT NULL::"text", "p_campaign_zone_id" "uuid" DEFAULT NULL::"uuid", "p_access_token" "text" DEFAULT NULL::"text") RETURNS "public"."delivery_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_session public.delivery_sessions%rowtype;
  v_group_name text;
begin
  if v_uid is null then
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select operator_id into v_uid
    from public.operator_assignments
    where id = p_assignment_id and access_token = p_access_token;
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
  end if;

  select a.* into v_assignment
  from public.operator_assignments a
  where a.id = p_assignment_id
    and a.operator_id = v_uid
  for update;

  if not found or not public.gps_assignment_is_valid(
    v_assignment.id, v_uid, v_assignment.campaign_id, v_assignment.group_id, now()
  ) then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if p_campaign_zone_id is not null and not exists (
    select 1
    from public.campaign_zones z
    where z.id = p_campaign_zone_id
      and z.campaign_id = v_assignment.campaign_id
      and z.group_id = v_assignment.group_id
  ) then
    raise exception 'ZONA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select g.name into v_group_name
  from public.operational_groups g
  where g.id = v_assignment.group_id
    and g.campaign_id = v_assignment.campaign_id;

  begin
    insert into public.delivery_sessions (
      assignment_id, campaign_id, group_id, driver_id, device_id,
      status, started_at, paused_at, ended_at, metadata, updated_at, campaign_zone_id
    ) values (
      v_assignment.id, v_assignment.campaign_id, v_assignment.group_id,
      v_uid, nullif(btrim(p_device_id), ''), 'started', now(), null, null,
      jsonb_build_object(
        'source', 'gps3a_authenticated_operator',
        'group_id', v_assignment.group_id,
        'group_name', v_group_name,
        'campaign_zone_id', p_campaign_zone_id
      ), now(), p_campaign_zone_id
    ) returning * into v_session;
  exception when unique_violation then
    raise exception 'SESSIONE_GIA_ATTIVA' using errcode = '23505';
  end;

  if p_campaign_zone_id is not null then
    update public.campaign_zones
    set status = 'In corso', started_at = coalesce(started_at, now()), updated_at = now()
    where id = p_campaign_zone_id;
  end if;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id, context
  ) values (
    v_uid, 'session_started', v_session.campaign_id, v_session.assignment_id, v_session.id,
    jsonb_build_object('has_device_id', v_session.device_id is not null, 'campaign_zone_id', p_campaign_zone_id)
  );

  return v_session;
end;
$$;


ALTER FUNCTION "public"."gps_start_session"("p_assignment_id" "uuid", "p_device_id" "text", "p_campaign_zone_id" "uuid", "p_access_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gps_transition_session"("p_session_id" "uuid", "p_action" "text", "p_access_token" "text" DEFAULT NULL::"text") RETURNS "public"."delivery_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_is_admin boolean := public.gps_is_admin();
  v_assignment_status text;
  v_revoked_at timestamptz;
begin
  if v_uid is null then
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select a.operator_id into v_uid
    from public.delivery_sessions s
    join public.operator_assignments a on a.id = s.assignment_id
    where s.id = p_session_id and a.access_token = p_access_token;
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
  end if;

  select * into v_session
  from public.delivery_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSIONE_NON_TROVATA' using errcode = 'P0002';
  end if;

  if not v_is_admin then
    if v_session.driver_id <> v_uid or v_session.assignment_id is null then
      raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
    end if;

    if not public.gps_assignment_is_valid(
      v_session.assignment_id, v_uid, v_session.campaign_id,
      v_session.group_id, now()
    ) then
      select status, revoked_at into v_assignment_status, v_revoked_at
      from public.operator_assignments
      where id = v_session.assignment_id;

      if v_assignment_status = 'revoked' or v_revoked_at is not null then
        if p_action not in ('complete', 'cancel') then
          raise exception 'ASSEGNAZIONE_REVOCATA: solo il termine della sessione Ã¨ consentito.'
            using errcode = '42501';
        end if
        -- else: fallthrough consentito, l'assegnazione Ã¨ revocata ma
        -- l'azione richiesta Ã¨ la sola terminazione ammessa.
        ;
      else
        raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
      end if;
    end if;
  end if;

  if p_action = 'pause' and v_session.status = 'started' then
    update public.delivery_sessions
      set status = 'paused', paused_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'resume' and v_session.status = 'paused' then
    update public.delivery_sessions
      set status = 'started', paused_at = null, updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'complete' and v_session.status in ('started', 'paused') then
    update public.delivery_sessions
      set status = 'completed', ended_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'cancel' and v_session.status in ('started', 'paused') then
    update public.delivery_sessions
      set status = 'cancelled',
          ended_at = coalesce(ended_at, now()),
          updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'closed_by_admin', v_is_admin,
             'closed_at', now(),
             'previous_status', v_session.status,
             'reason', 'stale_session_recovery'
          )
      where id = p_session_id returning * into v_session;
  else
    raise exception 'TRANSIZIONE_SESSIONE_NON_VALIDA' using errcode = '22023';
  end if;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id
  ) values (
    v_uid, 'session_' || p_action, v_session.campaign_id,
    v_session.assignment_id, v_session.id
  );

  return v_session;
end;
$$;


ALTER FUNCTION "public"."gps_transition_session"("p_session_id" "uuid", "p_action" "text", "p_access_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gps_transition_zone"("p_campaign_zone_id" "uuid", "p_action" "text", "p_access_token" "text" DEFAULT NULL::"text", "p_assignment_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."delivery_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_zone public.campaign_zones%rowtype;
  v_session public.delivery_sessions%rowtype;
  v_previous_zone_id uuid;
begin
  if v_uid is null then
    if p_access_token is null or p_assignment_id is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select operator_id into v_uid
    from public.operator_assignments
    where id = p_assignment_id and access_token = p_access_token;
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
  end if;

  select z.* into v_zone
  from public.campaign_zones z
  where z.id = p_campaign_zone_id
  for update;

  if not found then
    raise exception 'ZONA_NON_TROVATA' using errcode = 'P0002';
  end if;

  select s.* into v_session
  from public.delivery_sessions s
  where s.driver_id = v_uid
    and s.status in ('started', 'paused')
    and s.campaign_id = v_zone.campaign_id
    and s.group_id = v_zone.group_id
    and s.assignment_id is not null
    and public.gps_assignment_is_valid(
      s.assignment_id, v_uid, s.campaign_id, s.group_id, now()
    )
  order by s.started_at desc nulls last, s.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'ZONA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  v_previous_zone_id := v_session.campaign_zone_id;

  if p_action = 'start' then
    if v_previous_zone_id is distinct from p_campaign_zone_id then
      update public.campaign_zones
      set status = 'Completata', completed_at = coalesce(completed_at, now()), updated_at = now()
      where id = v_previous_zone_id
        and campaign_id = v_session.campaign_id
        and group_id = v_session.group_id;
    end if;

    update public.campaign_zones
    set status = 'In corso', started_at = coalesce(started_at, now()), completed_at = null, updated_at = now()
    where id = p_campaign_zone_id;

    update public.delivery_sessions
    set campaign_zone_id = p_campaign_zone_id,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('campaign_zone_id', p_campaign_zone_id),
        updated_at = now()
    where id = v_session.id
    returning * into v_session;
  elsif p_action = 'complete' then
    if v_previous_zone_id is distinct from p_campaign_zone_id then
      raise exception 'ZONA_SESSIONE_NON_CORRISPONDENTE' using errcode = '42501';
    end if;

    update public.campaign_zones
    set status = 'Completata', completed_at = coalesce(completed_at, now()), updated_at = now()
    where id = p_campaign_zone_id;
  else
    raise exception 'AZIONE_NON_VALIDA' using errcode = '22023';
  end if;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id, context
  ) values (
    v_uid,
    case when p_action = 'start' then 'zone_started' else 'zone_completed' end,
    v_session.campaign_id, v_session.assignment_id, v_session.id,
    jsonb_build_object('previous_zone_id', v_previous_zone_id, 'campaign_zone_id', p_campaign_zone_id)
  );

  return v_session;
end;
$$;


ALTER FUNCTION "public"."gps_transition_zone"("p_campaign_zone_id" "uuid", "p_action" "text", "p_access_token" "text", "p_assignment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, full_name, phone, company_name, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'company_name',
    'client'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jwt_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(auth.role() = 'service_role', false)
    or coalesce(auth.jwt() ->> 'role', '') in ('admin', 'super_admin')
    or coalesce(auth.jwt() ->> 'app_role', '') in ('admin', 'super_admin')
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    );
$$;


ALTER FUNCTION "public"."jwt_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_assignment_zones"("p_assignment_id" "uuid") RETURNS SETOF "public"."operator_assignment_zones"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not public.jwt_is_admin() then
    if not exists (
      select 1 from public.operator_assignments
      where id = p_assignment_id and operator_id = auth.uid()
    ) then
      raise exception 'Accesso negato.' using errcode = '42501';
    end if;
  end if;

  return query
    select * from public.operator_assignment_zones
    where assignment_id = p_assignment_id
    order by created_at asc;
end;
$$;


ALTER FUNCTION "public"."list_assignment_zones"("p_assignment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_assignment_event"("p_assignment_id" "uuid", "p_action" "text", "p_access_token" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_is_admin boolean := public.gps_is_admin();
begin
  if p_action not in (
    'assignment_program_sent',
    'assignment_program_opened',
    'assignment_program_confirmed',
    'assignment_program_revoked'
  ) then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_assignment from public.operator_assignments where id = p_assignment_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  if v_uid is null then
    if p_access_token is null or v_assignment.access_token <> p_access_token then
      raise exception 'UNAUTHORIZED';
    end if;
    v_uid := v_assignment.operator_id;
  end if;

  if p_action = 'assignment_program_sent' and not v_is_admin then raise exception 'UNAUTHORIZED'; end if;
  if p_action = 'assignment_program_opened' and v_assignment.operator_id <> v_uid then raise exception 'UNAUTHORIZED'; end if;

  if p_action = 'assignment_program_confirmed' then
    if v_assignment.operator_id <> v_uid then raise exception 'UNAUTHORIZED'; end if;
    if v_assignment.status <> 'active'
       or (v_assignment.starts_at is not null and v_assignment.starts_at > now())
       or (v_assignment.ends_at is not null and v_assignment.ends_at <= now()) then
      raise exception 'ASSIGNMENT_NOT_ACTIVE';
    end if;
    if not exists (
      select 1
      from public.assignment_event_log opened
      where opened.assignment_id = p_assignment_id
        and opened.event_type = 'assignment_program_opened'
    ) then raise exception 'PROGRAM_NOT_OPENED'; end if;

    insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
    values (p_assignment_id, v_assignment.operator_id, v_assignment.campaign_id, p_action)
    on conflict do nothing;
    return;
  end if;

  -- Solo Admin puo' revocare un programma inviato â€” mai il driver stesso
  -- (ne' via sessione autenticata ne' via access_token pubblico), coerente
  -- con 'assignment_program_sent' (azione Admin esplicita). v_is_admin e'
  -- gia' calcolato sopra da auth.uid() PRIMA dell'eventuale risoluzione via
  -- access_token, quindi un accesso via link pubblico (v_uid impostato solo
  -- dal ramo access_token, auth.uid() reale nullo) non puo' mai risultare
  -- admin qui: v_is_admin resta false in quel caso.
  if p_action = 'assignment_program_revoked' then
    if not v_is_admin then raise exception 'UNAUTHORIZED'; end if;

    insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
    values (p_assignment_id, v_assignment.operator_id, v_assignment.campaign_id, p_action);
    return;
  end if;

  if exists (
    select 1 from public.assignment_event_log
    where assignment_id = p_assignment_id
      and event_type = p_action
      and created_at > now() - interval '5 minutes'
  ) then return; end if;

  insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
  values (p_assignment_id, v_assignment.operator_id, v_assignment.campaign_id, p_action);
end;
$$;


ALTER FUNCTION "public"."log_assignment_event"("p_assignment_id" "uuid", "p_action" "text", "p_access_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."materialize_dbgt_address_points"("p_province" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inserted_count integer := 0;
  updated_count integer := 0;
  disabled_osm_count integer := 0;
begin
  with materialized as (
    select distinct on (a.source_id, nc.source_id)
      'dbgt_lombardia'::text as source,
      concat(a.source_id, ':', nc.source_id) as source_id,
      coalesce(lc.comune, '') as comune,
      nullif(regexp_replace(coalesce(lc.codice_comune, ''), '^03', ''), '') as codice_comune,
      tn.nome as via,
      trim(concat_ws('/', nullif(nc.numero, ''), nullif(nc.subalterno, ''))) as numero_civico,
      st_y(a.geom)::double precision as lat,
      st_x(a.geom)::double precision as lng,
      a.geom,
      1.00::numeric(3,2) as confidence,
      jsonb_build_object(
        'accesso', a.raw_payload,
        'civico', nc.raw_payload,
        'toponimo', ts.raw_payload,
        'toponimo_nome', tn.raw_payload,
        'comune', lc.raw_payload
      ) as raw_tags
    from public.dbgt_accesso_numero_civico rel
    join public.dbgt_accesso_esterno a
      on a.source_id = rel.accesso_id
    join public.dbgt_numero_civico nc
      on nc.source_id = rel.civico_id
    left join public.dbgt_toponimo_stradale ts
      on ts.source_id = nc.toponimo_id
    left join lateral (
      select n.*
      from public.dbgt_toponimo_nome n
      where n.source_id = ts.source_id
      order by case when n.lingua in ('10', 'ita', 'IT', 'it') then 0 else 1 end, n.nome
      limit 1
    ) tn on true
    left join lateral (
      select c.*
      from public.dbgt_limiti_comunali c
      where c.geom is not null
        and a.geom is not null
        and st_intersects(c.geom, a.geom)
      order by st_area(c.geom::geography) asc
      limit 1
    ) lc on true
    where a.geom is not null
      and nullif(nc.numero, '') is not null
      and (p_province is null or lower(coalesce(lc.sigla_provincia, '')) = lower(p_province))
  ),
  upserted as (
    insert into public.address_points (
      source,
      source_id,
      comune,
      codice_comune,
      via,
      numero_civico,
      lat,
      lng,
      geom,
      confidence,
      raw_tags
    )
    select
      source,
      source_id,
      comune,
      codice_comune,
      via,
      numero_civico,
      lat,
      lng,
      geom,
      confidence,
      raw_tags
    from materialized
    where comune <> ''
    on conflict (source, source_id) where source_id is not null do update set
      comune = excluded.comune,
      codice_comune = excluded.codice_comune,
      via = excluded.via,
      numero_civico = excluded.numero_civico,
      lat = excluded.lat,
      lng = excluded.lng,
      geom = excluded.geom,
      confidence = excluded.confidence,
      raw_tags = excluded.raw_tags,
      updated_at = now()
    returning (xmax = 0) as inserted
  )
  select
    count(*) filter (where inserted),
    count(*) filter (where not inserted)
  into inserted_count, updated_count
  from upserted;

  update public.address_points osm
  set raw_tags = coalesce(osm.raw_tags, '{}'::jsonb) || jsonb_build_object('deduped_by', 'dbgt_lombardia')
  from public.address_points dbgt
  where osm.source = 'osm'
    and dbgt.source = 'dbgt_lombardia'
    and lower(coalesce(osm.comune, '')) = lower(coalesce(dbgt.comune, ''))
    and lower(coalesce(osm.via, '')) = lower(coalesce(dbgt.via, ''))
    and lower(coalesce(osm.numero_civico, '')) = lower(coalesce(dbgt.numero_civico, ''))
    and st_dwithin(osm.geom::geography, dbgt.geom::geography, 15);

  get diagnostics disabled_osm_count = row_count;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'osm_deduped', disabled_osm_count
  );
end;
$$;


ALTER FUNCTION "public"."materialize_dbgt_address_points"("p_province" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_campaign_admin_action_log_snapshots"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.campaign_id_snapshot is distinct from old.campaign_id_snapshot
     or new.campaign_title_snapshot is distinct from old.campaign_title_snapshot then
    raise exception 'SNAPSHOT_STORICO_IMMUTABILE' using errcode = '23000';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_campaign_admin_action_log_snapshots"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_campaign_zone_progress_history_snapshots"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.campaign_id_snapshot is distinct from old.campaign_id_snapshot
     or new.campaign_zone_id_snapshot is distinct from old.campaign_zone_id_snapshot
     or new.zone_name_snapshot is distinct from old.zone_name_snapshot then
    raise exception 'SNAPSHOT_STORICO_IMMUTABILE' using errcode = '23000';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_campaign_zone_progress_history_snapshots"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_authorization_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.role is distinct from old.role
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'profile authorization fields are not user-editable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_profile_authorization_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_campaign_coverage_adjustment_zone_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_zone_campaign_id uuid;
begin
  if new.zone_id is not null then
    select z.campaign_id into v_zone_campaign_id
    from public.campaign_zones z
    where z.id = new.zone_id;

    if v_zone_campaign_id is null then
      raise exception 'ZONA_NON_TROVATA' using errcode = 'P0002';
    end if;

    if v_zone_campaign_id <> new.campaign_id then
      raise exception 'ZONA_CAMPAGNA_INCOERENTE' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_campaign_coverage_adjustment_zone_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_campaign_zone_progress_campaign_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_campaign_id uuid;
begin
  select z.campaign_id
    into v_campaign_id
  from public.campaign_zones z
  where z.id = new.campaign_zone_id;

  if v_campaign_id is null then
    raise exception 'ZONA_CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  if new.campaign_id is not null and new.campaign_id <> v_campaign_id then
    raise exception 'ZONA_CAMPAGNA_INCOERENTE' using errcode = '23514';
  end if;

  new.campaign_id := v_campaign_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_campaign_zone_progress_campaign_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_campaign_zone_progress_effective_percent_legacy"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.source = 'legacy' then
    new.effective_percent := case
      when new.manual_override_enabled then least(100, new.automatic_percent + coalesce(new.manual_percent, 0))
      else new.automatic_percent
    end;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_campaign_zone_progress_effective_percent_legacy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_gps_tracking_point_geom"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.geom := public.ST_SetSRID(public.ST_MakePoint(new.lng, new.lat), 4326);
  return new;
end;
$$;


ALTER FUNCTION "public"."set_gps_tracking_point_geom"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_operator_security_audit_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := now();
  if tg_table_name = 'operator_assignments' and tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_operator_security_audit_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_address_points_geom"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.geom := st_setsrid(st_makepoint(new.lng, new.lat), 4326);
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_address_points_geom"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_campaign_zone_progress_cache"("p_campaign_zone_id" "uuid", "p_changed_by" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_campaign_id uuid;
  v_calc jsonb;
  v_latest_active public.campaign_coverage_adjustments%rowtype;
  v_old public.campaign_zone_progress%rowtype;
  v_new public.campaign_zone_progress%rowtype;
begin
  select campaign_id into v_campaign_id from public.campaign_zones where id = p_campaign_zone_id;
  if v_campaign_id is null then
    return;
  end if;

  v_calc := public.calculate_zone_final_coverage(p_campaign_zone_id);
  if coalesce(v_calc->>'calculation_status', '') <> 'ready' then
    return;
  end if;

  select * into v_latest_active from public.campaign_coverage_adjustments
  where zone_id = p_campaign_zone_id and revoked_at is null order by updated_at desc limit 1;

  select * into v_old from public.campaign_zone_progress where campaign_zone_id = p_campaign_zone_id;

  insert into public.campaign_zone_progress (
    campaign_zone_id, campaign_id, source, automatic_percent, manual_percent, inaccessible_percent, effective_percent,
    adjustment_type, manual_override_enabled, override_reason, notes, calculation_version, updated_by, updated_at
  ) values (
    p_campaign_zone_id, v_campaign_id, 'geometric',
    (v_calc->>'gps_coverage_pct')::numeric,
    case when v_latest_active.id is not null then (v_calc->>'manual_coverage_pct')::numeric else null end,
    (v_calc->>'inaccessible_area_pct')::numeric,
    (v_calc->>'final_operational_coverage_pct')::numeric,
    v_latest_active.adjustment_type, v_latest_active.id is not null, v_latest_active.reason, v_latest_active.notes,
    'zone-progress-geometric-v1', p_changed_by, now()
  )
  on conflict (campaign_zone_id) do update
    set source = 'geometric', automatic_percent = excluded.automatic_percent, manual_percent = excluded.manual_percent,
        inaccessible_percent = excluded.inaccessible_percent, effective_percent = excluded.effective_percent,
        adjustment_type = excluded.adjustment_type, manual_override_enabled = excluded.manual_override_enabled,
        override_reason = excluded.override_reason, notes = excluded.notes, calculation_version = excluded.calculation_version,
        updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;

  insert into public.campaign_zone_progress_history (
    progress_id, campaign_zone_id, campaign_id, campaign_zone_id_snapshot, campaign_id_snapshot, zone_name_snapshot,
    event_type, old_automatic_percent, new_automatic_percent, old_manual_percent, new_manual_percent,
    old_effective_percent, new_effective_percent, old_manual_override_enabled, new_manual_override_enabled,
    old_adjustment_type, adjustment_type, old_inaccessible_percent, inaccessible_percent, old_notes, notes,
    reason, source_summary, calculation_version, changed_by
  ) values (
    v_new.id, v_new.campaign_zone_id, v_new.campaign_id,
    v_new.campaign_zone_id, v_new.campaign_id, (select zone_name from public.campaign_zones where id = p_campaign_zone_id),
    'geometric_sync',
    v_old.automatic_percent, v_new.automatic_percent, v_old.manual_percent, v_new.manual_percent,
    v_old.effective_percent, v_new.effective_percent, v_old.manual_override_enabled, v_new.manual_override_enabled,
    v_old.adjustment_type, v_new.adjustment_type, v_old.inaccessible_percent, v_new.inaccessible_percent,
    v_old.notes, v_new.notes,
    coalesce('Sincronizzazione automatica da correzione geometrica: ' || coalesce(v_latest_active.reason, 'nessuna correzione attiva'), 'Sincronizzazione automatica'),
    v_calc, 'zone-progress-geometric-v1', p_changed_by
  );
end;
$$;


ALTER FUNCTION "public"."sync_campaign_zone_progress_cache"("p_campaign_zone_id" "uuid", "p_changed_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_gtfs_stop_geom"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.geom := st_setsrid(st_point(new.stop_lng::double precision, new.stop_lat::double precision), 4326);
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_gtfs_stop_geom"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_poi_cache_geom"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := st_setsrid(st_makepoint(new.lng::double precision, new.lat::double precision), 4326);
  else
    new.geom := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_poi_cache_geom"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."territorial_dataset_status"() RETURNS TABLE("postgis_enabled" boolean, "geo_municipalities_count" bigint, "demographic_indicators_count" bigint, "supported_regions" "text"[], "lombardia_municipalities_count" bigint, "target_municipalities_present" bigint, "random_validation_examples_present" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  with target_names(name) as (values ('milano'),('sesto san giovanni'),('cinisello balsamo'),('bresso'),('cormano'),('cusano milanino'),('paderno dugnano'),('varedo'),('monza'),('nova milanese'),('bollate'),('senago'),('desio'),('muggio'),('muggiÃ²'),('lissone')),
  random_names(name) as (values ('lecco'),('como'),('bergamo'),('brescia'),('milano'),('varedo'),('paderno dugnano'),('cormano'),('cusano milanino'))
  select exists(select 1 from pg_extension where extname = 'postgis') as postgis_enabled, (select count(*) from public.geo_municipalities) as geo_municipalities_count, (select count(*) from public.demographic_indicators) as demographic_indicators_count, (select array_agg(distinct region_name order by region_name) from public.geo_municipalities where region_name is not null) as supported_regions, (select count(*) from public.geo_municipalities where region_code = '03' or lower(region_name) = 'lombardia') as lombardia_municipalities_count, (select count(distinct lower(gm.municipality_name)) from public.geo_municipalities gm join target_names tn on lower(gm.municipality_name) = tn.name) as target_municipalities_present, (select count(distinct lower(gm.municipality_name)) from public.geo_municipalities gm join random_names rn on lower(gm.municipality_name) = rn.name) as random_validation_examples_present;
$$;


ALTER FUNCTION "public"."territorial_dataset_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_address_points_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_address_points_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_transport_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_transport_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_sp_slots_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION "public"."update_sp_slots_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_address_points_batch"("rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  item jsonb;
  inserted_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  exists_row boolean;
  source_value text;
  source_id_value text;
  comune_value text;
  lat_value double precision;
  lng_value double precision;
begin
  for item in select * from jsonb_array_elements(coalesce(rows, '[]'::jsonb))
  loop
    source_value := nullif(item->>'source', '');
    source_id_value := nullif(item->>'source_id', '');
    comune_value := nullif(item->>'comune', '');
    lat_value := nullif(item->>'lat', '')::double precision;
    lng_value := nullif(item->>'lng', '')::double precision;

    if source_value is null
       or source_id_value is null
       or comune_value is null
       or nullif(item->>'numero_civico', '') is null
       or lat_value is null
       or lng_value is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select exists(
      select 1
      from public.address_points
      where source = source_value
        and source_id = source_id_value
    ) into exists_row;

    insert into public.address_points (
      source,
      source_id,
      comune,
      codice_comune,
      via,
      numero_civico,
      lat,
      lng,
      geom,
      confidence,
      raw_tags
    )
    values (
      source_value,
      source_id_value,
      comune_value,
      nullif(item->>'codice_comune', ''),
      nullif(item->>'via', ''),
      nullif(item->>'numero_civico', ''),
      lat_value,
      lng_value,
      st_setsrid(st_makepoint(lng_value, lat_value), 4326),
      coalesce(nullif(item->>'confidence', '')::numeric, 1.00),
      coalesce(item->'raw_tags', '{}'::jsonb)
    )
    on conflict (source, source_id) where source_id is not null do update set
      comune = excluded.comune,
      codice_comune = excluded.codice_comune,
      via = excluded.via,
      numero_civico = excluded.numero_civico,
      lat = excluded.lat,
      lng = excluded.lng,
      geom = excluded.geom,
      confidence = excluded.confidence,
      raw_tags = excluded.raw_tags,
      updated_at = now();

    if exists_row then
      updated_count := updated_count + 1;
    else
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'skipped', skipped_count
  );
end;
$$;


ALTER FUNCTION "public"."upsert_address_points_batch"("rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_economic_indicators_batch"("rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  item jsonb;
  inserted_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  exists_row boolean;
begin
  for item in select * from jsonb_array_elements(rows)
  loop
    if nullif(item->>'municipality_code', '') is null
       and nullif(item->>'municipality_name', '') is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select exists(
      select 1
      from public.economic_indicators
      where municipality_code is not distinct from nullif(item->>'municipality_code', '')
    ) into exists_row;

    insert into public.economic_indicators (
      municipality_code,
      municipality_name,
      average_income,
      employment_rate,
      businesses_total,
      source_name,
      source_year,
      source_level,
      raw_payload
    )
    values (
      nullif(item->>'municipality_code', ''),
      nullif(item->>'municipality_name', ''),
      nullif(item->>'average_income', '')::numeric,
      nullif(item->>'employment_rate', '')::numeric,
      nullif(item->>'businesses_total', '')::integer,
      coalesce(nullif(item->>'source_name', ''), 'UNKNOWN'),
      nullif(item->>'source_year', '')::integer,
      coalesce(nullif(item->>'source_level', ''), 'municipality'),
      coalesce(item->'raw_payload', '{}'::jsonb)
    )
    on conflict (municipality_code) do update set
      municipality_name = excluded.municipality_name,
      average_income = excluded.average_income,
      employment_rate = excluded.employment_rate,
      businesses_total = excluded.businesses_total,
      source_name = excluded.source_name,
      source_year = excluded.source_year,
      source_level = excluded.source_level,
      raw_payload = excluded.raw_payload,
      updated_at = now();

    if exists_row then
      updated_count := updated_count + 1;
    else
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'skipped', skipped_count
  );
end;
$$;


ALTER FUNCTION "public"."upsert_economic_indicators_batch"("rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_gtfs_routes_batch"("rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare affected integer := jsonb_array_length(coalesce(rows, '[]'::jsonb));
begin
  insert into public.gtfs_routes (source, agency, route_id, route_short_name, route_long_name, route_type, raw_payload)
  select item->>'source', nullif(item->>'agency',''), item->>'route_id', nullif(item->>'route_short_name',''),
    nullif(item->>'route_long_name',''), nullif(item->>'route_type','')::integer, item
  from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) item
  on conflict (source, route_id) do update set agency=excluded.agency, route_short_name=excluded.route_short_name,
    route_long_name=excluded.route_long_name, route_type=excluded.route_type, raw_payload=excluded.raw_payload, imported_at=now();
  return affected;
end $$;


ALTER FUNCTION "public"."upsert_gtfs_routes_batch"("rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_gtfs_stop_times_batch"("rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare affected integer := jsonb_array_length(coalesce(rows, '[]'::jsonb));
begin
  insert into public.gtfs_stop_times (source, trip_id, route_id, stop_id, arrival_time, departure_time, stop_sequence, raw_payload)
  select item->>'source', item->>'trip_id', nullif(item->>'route_id',''), item->>'stop_id',
    nullif(item->>'arrival_time',''), nullif(item->>'departure_time',''), (item->>'stop_sequence')::integer, item
  from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) item
  on conflict (source, trip_id, stop_sequence) do update set route_id=excluded.route_id, stop_id=excluded.stop_id,
    arrival_time=excluded.arrival_time, departure_time=excluded.departure_time, raw_payload=excluded.raw_payload, imported_at=now();
  return affected;
end $$;


ALTER FUNCTION "public"."upsert_gtfs_stop_times_batch"("rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_gtfs_stops_batch"("rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  item jsonb;
  affected integer := 0;
begin
  for item in select * from jsonb_array_elements(coalesce(rows, '[]'::jsonb))
  loop
    insert into public.gtfs_stops (
      source,
      agency,
      stop_id,
      stop_name,
      stop_lat,
      stop_lng,
      municipality_code,
      municipality_name,
      raw_payload,
      imported_at
    )
    values (
      coalesce(nullif(item->>'source', ''), 'GTFS / Trasporto pubblico'),
      nullif(item->>'agency', ''),
      nullif(item->>'stop_id', ''),
      nullif(item->>'stop_name', ''),
      nullif(item->>'stop_lat', '')::numeric,
      nullif(coalesce(item->>'stop_lng', item->>'stop_lon'), '')::numeric,
      nullif(item->>'municipality_code', ''),
      nullif(item->>'municipality_name', ''),
      item,
      now()
    )
    on conflict (source, stop_id)
    do update set
      agency = excluded.agency,
      stop_name = excluded.stop_name,
      stop_lat = excluded.stop_lat,
      stop_lng = excluded.stop_lng,
      municipality_code = excluded.municipality_code,
      municipality_name = excluded.municipality_name,
      raw_payload = excluded.raw_payload,
      imported_at = now();

    affected := affected + 1;
  end loop;
  return affected;
end;
$$;


ALTER FUNCTION "public"."upsert_gtfs_stops_batch"("rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_istat_territorial_batch"("rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  item jsonb;
  geo jsonb;
  demo jsonb;
  exists_geo boolean;
  inserted_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
begin
  for item in select * from jsonb_array_elements(rows)
  loop
    geo := item->'geo';
    demo := item->'demographic';
    if nullif(geo->>'municipality_code', '') is null or nullif(geo->>'municipality_name', '') is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;
    select exists(select 1 from public.geo_municipalities where municipality_code = geo->>'municipality_code') into exists_geo;
    insert into public.geo_municipalities (country_code, region_code, region_name, province_code, province_name, municipality_code, municipality_name, cadastral_code, households_total, population_total, area_km2, density_per_km2, centroid_lat, centroid_lng, geom)
    values (coalesce(nullif(geo->>'country_code', ''), 'IT'), nullif(geo->>'region_code', ''), nullif(geo->>'region_name', ''), nullif(geo->>'province_code', ''), nullif(geo->>'province_name', ''), geo->>'municipality_code', geo->>'municipality_name', nullif(geo->>'cadastral_code', ''), nullif(geo->>'households_total', '')::integer, nullif(geo->>'population_total', '')::integer, nullif(geo->>'area_km2', '')::numeric, nullif(geo->>'density_per_km2', '')::numeric, nullif(geo->>'centroid_lat', '')::double precision, nullif(geo->>'centroid_lng', '')::double precision, case when geo ? 'geom_geojson' and geo->'geom_geojson' is not null then st_multi(st_setsrid(st_geomfromgeojson(geo->'geom_geojson'), 4326)) else null end)
    on conflict (municipality_code) do update set country_code = excluded.country_code, region_code = excluded.region_code, region_name = excluded.region_name, province_code = excluded.province_code, province_name = excluded.province_name, municipality_name = excluded.municipality_name, cadastral_code = excluded.cadastral_code, households_total = excluded.households_total, population_total = excluded.population_total, area_km2 = excluded.area_km2, density_per_km2 = excluded.density_per_km2, centroid_lat = excluded.centroid_lat, centroid_lng = excluded.centroid_lng, geom = excluded.geom;
    if exists_geo then updated_count := updated_count + 1; else inserted_count := inserted_count + 1; end if;
    insert into public.demographic_indicators (geography_type, geography_ref, reference_year, population_total, households_total, share_age_0_14, share_age_15_34, share_age_35_64, share_age_65_plus, avg_income_estimate, source, source_ref, raw_payload, municipality_code, municipality_name, age_0_14_pct, age_15_34_pct, age_35_64_pct, age_65_plus_pct, foreigners_pct, employment_rate, average_income, old_age_index, businesses_total, updated_at)
    values ('municipality', geo->>'municipality_code', 2024, nullif(geo->>'population_total', '')::integer, nullif(geo->>'households_total', '')::integer, nullif(demo->>'age_0_14_pct', '')::numeric, nullif(demo->>'age_15_34_pct', '')::numeric, nullif(demo->>'age_35_64_pct', '')::numeric, nullif(demo->>'age_65_plus_pct', '')::numeric, nullif(demo->>'average_income', '')::numeric, 'ISTAT', 'ISTAT Demo P2 2024 + POSAS 2025 + Confini amministrativi 2026', jsonb_build_object('geo', geo, 'demographic', demo), geo->>'municipality_code', coalesce(nullif(demo->>'municipality_name', ''), geo->>'municipality_name'), nullif(demo->>'age_0_14_pct', '')::numeric, nullif(demo->>'age_15_34_pct', '')::numeric, nullif(demo->>'age_35_64_pct', '')::numeric, nullif(demo->>'age_65_plus_pct', '')::numeric, nullif(demo->>'foreigners_pct', '')::numeric, nullif(demo->>'employment_rate', '')::numeric, nullif(demo->>'average_income', '')::numeric, nullif(demo->>'old_age_index', '')::numeric, nullif(demo->>'businesses_total', '')::integer, now())
    on conflict (municipality_code) do update set geography_type = excluded.geography_type, geography_ref = excluded.geography_ref, reference_year = excluded.reference_year, population_total = excluded.population_total, households_total = excluded.households_total, share_age_0_14 = excluded.share_age_0_14, share_age_15_34 = excluded.share_age_15_34, share_age_35_64 = excluded.share_age_35_64, share_age_65_plus = excluded.share_age_65_plus, avg_income_estimate = excluded.avg_income_estimate, source = excluded.source, source_ref = excluded.source_ref, raw_payload = excluded.raw_payload, municipality_name = excluded.municipality_name, age_0_14_pct = excluded.age_0_14_pct, age_15_34_pct = excluded.age_15_34_pct, age_35_64_pct = excluded.age_35_64_pct, age_65_plus_pct = excluded.age_65_plus_pct, foreigners_pct = excluded.foreigners_pct, employment_rate = excluded.employment_rate, average_income = excluded.average_income, old_age_index = excluded.old_age_index, businesses_total = excluded.businesses_total, updated_at = now();
  end loop;
  return jsonb_build_object('inserted', inserted_count, 'updated', updated_count, 'skipped', skipped_count);
end;
$$;


ALTER FUNCTION "public"."upsert_istat_territorial_batch"("rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_nil_milano"("p_nil_code" "text", "p_nil_name" "text", "p_geometry_geojson" "text", "p_source" "text" DEFAULT 'Comune di Milano - DS964 NIL VIGENTI PGT 2030'::"text", "p_source_url" "text" DEFAULT NULL::"text", "p_valid_from" "date" DEFAULT NULL::"date", "p_valid_to" "date" DEFAULT NULL::"date") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  insert into public.geo_nil_milano (
    nil_code,
    nil_name,
    geom,
    source,
    source_url,
    valid_from,
    valid_to
  )
  values (
    p_nil_code,
    p_nil_name,
    st_multi(st_setsrid(st_geomfromgeojson(p_geometry_geojson), 4326))::geometry(MultiPolygon, 4326),
    coalesce(p_source, 'Comune di Milano - DS964 NIL VIGENTI PGT 2030'),
    p_source_url,
    p_valid_from,
    p_valid_to
  )
  on conflict (nil_code) do update
    set nil_name = excluded.nil_name,
        geom = excluded.geom,
        source = excluded.source,
        source_url = excluded.source_url,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        updated_at = now();
$$;


ALTER FUNCTION "public"."upsert_nil_milano"("p_nil_code" "text", "p_nil_name" "text", "p_geometry_geojson" "text", "p_source" "text", "p_source_url" "text", "p_valid_from" "date", "p_valid_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_omi_zones_batch"("rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  item jsonb;
  affected integer := 0;
  geom_value geometry(MultiPolygon, 4326);
begin
  for item in select * from jsonb_array_elements(coalesce(rows, '[]'::jsonb))
  loop
    geom_value := null;
    if coalesce(item->>'geometry_geojson', item->>'geom_geojson', item->>'geometry') is not null then
      geom_value := st_multi(st_setsrid(st_geomfromgeojson(coalesce(item->>'geometry_geojson', item->>'geom_geojson', item->>'geometry')), 4326))::geometry(MultiPolygon, 4326);
    end if;

    insert into public.omi_zones (
      source,
      year,
      semester,
      municipality_name,
      municipality_code,
      zone_code,
      zone_name,
      min_value,
      max_value,
      typology,
      currency,
      geom,
      raw_payload
    )
    values (
      coalesce(nullif(item->>'source', ''), 'Agenzia Entrate - OMI'),
      nullif(item->>'year', '')::integer,
      nullif(item->>'semester', '')::integer,
      nullif(coalesce(item->>'municipality_name', item->>'comune'), ''),
      nullif(coalesce(item->>'municipality_code', item->>'codice_comune'), ''),
      nullif(coalesce(item->>'zone_code', item->>'zona'), ''),
      nullif(coalesce(item->>'zone_name', item->>'nome_zona'), ''),
      nullif(coalesce(item->>'min_value', item->>'valore_minimo'), '')::numeric,
      nullif(coalesce(item->>'max_value', item->>'valore_massimo'), '')::numeric,
      nullif(coalesce(item->>'typology', item->>'tipologia'), ''),
      coalesce(nullif(item->>'currency', ''), 'EUR/mq'),
      geom_value,
      item
    )
    on conflict (
      (coalesce(year, 0)),
      (coalesce(semester, 0)),
      (lower(municipality_name)),
      (coalesce(zone_code, '')),
      (coalesce(typology, ''))
    )
    do update set
      source = excluded.source,
      municipality_code = excluded.municipality_code,
      zone_name = excluded.zone_name,
      min_value = excluded.min_value,
      max_value = excluded.max_value,
      currency = excluded.currency,
      geom = coalesce(excluded.geom, public.omi_zones.geom),
      raw_payload = excluded.raw_payload,
      updated_at = now();

    affected := affected + 1;
  end loop;
  return affected;
end;
$$;


ALTER FUNCTION "public"."upsert_omi_zones_batch"("rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_delivery_session_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.assignment_id is null then
    return new;
  end if;

  if not public.gps_assignment_is_valid(
    new.assignment_id,
    new.driver_id,
    new.campaign_id,
    new.group_id,
    coalesce(new.started_at, now())
  ) then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_delivery_session_assignment"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."address_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "source_id" "text",
    "comune" "text" NOT NULL,
    "codice_comune" "text",
    "via" "text",
    "numero_civico" "text",
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "geom" "public"."geometry"(Point,4326) NOT NULL,
    "confidence" numeric(3,2) DEFAULT 1.00,
    "raw_tags" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "address_points_confidence_check" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))))
);


ALTER TABLE "public"."address_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_coverage_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "group_id" "uuid",
    "driver_id" "uuid",
    "admin_id" "uuid",
    "correction_type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "label" "text" NOT NULL,
    "notes" "text",
    "estimated_km" double precision DEFAULT 0,
    "geom" "public"."geometry"(Geometry,4326),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "admin_coverage_corrections_correction_type_check" CHECK (("correction_type" = ANY (ARRAY['coperto_manualmente'::"text", 'da_rifare'::"text", 'impossibile'::"text", 'validato_admin'::"text"]))),
    CONSTRAINT "admin_coverage_corrections_reason_check" CHECK (("reason" = ANY (ARRAY['GPS debole'::"text", 'zona montagna'::"text", 'strada privata'::"text", 'accesso impossibile'::"text", 'rete assente'::"text", 'operatore conferma copertura'::"text", 'verifica admin'::"text", 'altro'::"text"])))
);

ALTER TABLE ONLY "public"."admin_coverage_corrections" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_coverage_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "zone_id" "uuid",
    "report_type" "text",
    "model" "text",
    "prompt_version" "text",
    "summary" "text",
    "recommendations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "risks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "opportunities" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "full_text" "text",
    "token_usage_input" integer,
    "token_usage_output" integer,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_reports_report_type_check" CHECK (("report_type" = ANY (ARRAY['quick'::"text", 'full'::"text", 'strategy'::"text", 'territory'::"text"])))
);


ALTER TABLE "public"."ai_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_territorial_chat_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "payload_hash" "text" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_territorial_chat_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_territory_summaries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "payload_hash" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "score_explanation" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_territory_summaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_usage" (
    "id" bigint NOT NULL,
    "endpoint" "text",
    "cache_hit" boolean,
    "response_time_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."api_usage" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."api_usage_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."api_usage_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."api_usage_id_seq" OWNED BY "public"."api_usage"."id";



CREATE TABLE IF NOT EXISTS "public"."assigned_zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "group_id" "uuid",
    "driver_id" "uuid",
    "label" "text" NOT NULL,
    "target_km" double precision DEFAULT 0,
    "target_poi" integer DEFAULT 0,
    "geom" "public"."geometry"(Polygon,4326),
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."assigned_zones" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assigned_zones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "uuid",
    "actor_email" "text",
    "action" "text" NOT NULL,
    "resource_type" "text",
    "resource_id" "text",
    "metadata" "jsonb",
    "success" boolean DEFAULT true NOT NULL,
    "error_message" "text",
    "user_agent" "text",
    CONSTRAINT "audit_log_action_check" CHECK (("action" = ANY (ARRAY['login_requested'::"text", 'login_succeeded'::"text", 'login_failed'::"text", 'campaign_saved'::"text", 'campaign_save_failed'::"text", 'waitlist_submitted'::"text", 'waitlist_submit_failed'::"text", 'waitlist_marked_handled'::"text", 'waitlist_mark_handled_failed'::"text", 'admin_access_granted'::"text", 'admin_access_denied'::"text", 'admin_access_no_session'::"text", 'crm_client_updated'::"text", 'crm_referente_created'::"text", 'crm_referente_updated'::"text", 'crm_referente_deleted'::"text", 'dms_document_uploaded'::"text", 'dms_document_upload_failed'::"text", 'dms_document_deleted'::"text", 'dms_document_delete_failed'::"text", 'config_setting_updated'::"text", 'config_setting_update_failed'::"text", 'ai_anomaly_scan_performed'::"text", 'admin_create_operator_assignment'::"text", 'admin_update_operator_assignment'::"text", 'admin_revoke_operator_assignment'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."availability_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_type" "text" NOT NULL,
    "city" "text" NOT NULL,
    "slot_date" "date" NOT NULL,
    "slot_label" "text",
    "status" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."availability_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."smart_pairing_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "data" "date" NOT NULL,
    "zona" "text" NOT NULL,
    "lat" double precision,
    "lng" double precision,
    "raggio_km" double precision DEFAULT 2.0 NOT NULL,
    "cliente" "text",
    "stato" "text" DEFAULT 'attiva'::"text" NOT NULL,
    "posti_disponibili" integer DEFAULT 3 NOT NULL,
    "posti_occupati" integer DEFAULT 0 NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "smart_pairing_slots_stato_check" CHECK (("stato" = ANY (ARRAY['attiva'::"text", 'pausa'::"text"])))
);


ALTER TABLE "public"."smart_pairing_slots" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."available_slots_with_pairing" AS
 SELECT "a"."id",
    "a"."service_type",
    "a"."city",
    "a"."slot_date",
    "a"."slot_label",
    "a"."status",
    "a"."notes",
    ("sp"."id" IS NOT NULL) AS "has_smart_pairing",
    "sp"."id" AS "smart_pairing_id",
    "sp"."zona",
    "sp"."lat",
    "sp"."lng"
   FROM ("public"."availability_slots" "a"
     LEFT JOIN "public"."smart_pairing_slots" "sp" ON ((("sp"."zona" = "a"."city") AND ("sp"."data" = "a"."slot_date"))))
  WHERE ("a"."status" <> 'unavailable'::"text");


ALTER VIEW "public"."available_slots_with_pairing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campagne" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cliente_id" "uuid",
    "servizio" "text" NOT NULL,
    "tipo_attivita" "text",
    "quantita" integer DEFAULT 10000 NOT NULL,
    "formato_volantino" "text" DEFAULT 'A5'::"text",
    "ha_volantini" boolean DEFAULT false,
    "grammatura" "text",
    "urgenza" "text" DEFAULT 'standard'::"text",
    "piano" "text" DEFAULT 'singola'::"text",
    "campagne_mese" integer DEFAULT 1,
    "data_inizio" "date",
    "data_fine" "date",
    "comune_principale" "text",
    "raggio_km" integer DEFAULT 3,
    "comuni_selezionati" "text"[],
    "modalita_selezione" "text" DEFAULT 'auto'::"text",
    "superficie_km2" numeric,
    "copertura_pct" numeric,
    "smart_pairing_date" "date"[],
    "smart_pairing_sconto" numeric DEFAULT 0,
    "smart_pairing_zona" "text",
    "servizi_extra" "text"[],
    "totale_euro" numeric,
    "subtotale_distribuzione" numeric,
    "sconto_piano_pct" numeric DEFAULT 0,
    "stato_pagamento" "text" DEFAULT 'in_attesa'::"text",
    "causale_bonifico" "text",
    "pagamento_confermato_at" timestamp with time zone,
    "stato" "text" DEFAULT 'bozza'::"text",
    "note_admin" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "pagamento_tipo" "text" DEFAULT 'bonifico'::"text",
    "email" "text",
    "zona" "text",
    "comune" "text",
    "campaign_type" "text",
    "format" "text",
    "material" "text",
    "coverage_pct" numeric(5,2),
    "comuni_count" integer,
    CONSTRAINT "campagne_servizio_check" CHECK (("servizio" = ANY (ARRAY['d2d'::"text", 'h2h'::"text", 'b2b'::"text"]))),
    CONSTRAINT "campagne_stato_check" CHECK (("stato" = ANY (ARRAY['bozza'::"text", 'confermata'::"text", 'in_preparazione'::"text", 'in_distribuzione'::"text", 'completata'::"text", 'annullata'::"text"]))),
    CONSTRAINT "campagne_stato_pagamento_check" CHECK (("stato_pagamento" = ANY (ARRAY['in_attesa'::"text", 'pagato'::"text", 'annullato'::"text"])))
);


ALTER TABLE "public"."campagne" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_analysis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "zone_id" "uuid",
    "source" "text" DEFAULT 'system'::"text",
    "households_estimate" integer,
    "population_estimate" integer,
    "competitor_count" integer,
    "poi_count" integer,
    "avg_income_estimate" numeric(12,2),
    "family_index" numeric(8,2),
    "commercial_density_index" numeric(8,2),
    "reach_score" numeric(8,2),
    "roi_score" numeric(8,2),
    "confidence_score" numeric(8,2),
    "raw_inputs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_analysis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "asset_type" "text",
    "file_path" "text" NOT NULL,
    "file_name" "text",
    "mime_type" "text",
    "size_bytes" bigint,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['flyer'::"text", 'image'::"text", 'pdf'::"text", 'proof'::"text", 'report'::"text"])))
);


ALTER TABLE "public"."campaign_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_coverage_adjustments_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "adjustment_id" "uuid",
    "campaign_id" "uuid" NOT NULL,
    "zone_id" "uuid",
    "event_type" "text" NOT NULL,
    "adjustment_type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "notes" "text",
    "geometry_geojson" "jsonb",
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_coverage_adjustments_log_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'updated'::"text", 'revoked'::"text"]))),
    CONSTRAINT "campaign_coverage_adjustments_log_reason_required" CHECK ((NULLIF("btrim"("reason"), ''::"text") IS NOT NULL))
);

ALTER TABLE ONLY "public"."campaign_coverage_adjustments_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_coverage_adjustments_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_status" "text",
    "to_status" "text",
    "message" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_pois" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "zone_id" "uuid",
    "provider" "text",
    "external_id" "text",
    "name" "text" NOT NULL,
    "category" "text",
    "address" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "distance_m" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_pois_provider_check" CHECK (("provider" = ANY (ARRAY['foursquare'::"text", 'google'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."campaign_pois" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "service_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "printing_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "logistics_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quotes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."campaign_summary" AS
 SELECT "c"."id",
    "c"."user_id",
    "c"."title",
    "c"."service_type",
    "c"."distribution_mode",
    "c"."status" AS "campaign_status",
    "q"."id" AS "quote_id",
    "q"."subtotal" AS "quote_subtotal",
    "q"."service_fee",
    "q"."printing_fee",
    "q"."logistics_fee",
    "ca"."zone_id",
    "ca"."source",
    "ca"."households_estimate",
    "ca"."population_estimate",
    "ca"."competitor_count",
    "ca"."poi_count",
    "ca"."avg_income_estimate",
    "ca"."family_index",
    "ca"."commercial_density_index",
    "ca"."reach_score",
    "ca"."roi_score",
    "ca"."confidence_score",
    "ca"."raw_inputs",
    "ca"."created_at" AS "analysis_created_at"
   FROM (("public"."campaigns" "c"
     LEFT JOIN LATERAL ( SELECT "quotes"."id",
            "quotes"."campaign_id",
            "quotes"."subtotal",
            "quotes"."service_fee",
            "quotes"."printing_fee",
            "quotes"."logistics_fee",
            "quotes"."tax_amount",
            "quotes"."total_amount",
            "quotes"."currency",
            "quotes"."version",
            "quotes"."is_active",
            "quotes"."created_at"
           FROM "public"."quotes"
          WHERE ("quotes"."campaign_id" = "c"."id")
          ORDER BY "quotes"."id" DESC
         LIMIT 1) "q" ON (true))
     LEFT JOIN "public"."campaign_analysis" "ca" ON (("ca"."campaign_id" = "c"."id")));


ALTER VIEW "public"."campaign_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_zone_progress_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "progress_id" "uuid",
    "campaign_zone_id" "uuid",
    "campaign_id" "uuid",
    "event_type" "text" NOT NULL,
    "old_automatic_percent" numeric(5,2),
    "new_automatic_percent" numeric(5,2),
    "old_manual_percent" numeric(5,2),
    "new_manual_percent" numeric(5,2),
    "old_effective_percent" numeric(5,2),
    "new_effective_percent" numeric(5,2),
    "old_manual_override_enabled" boolean,
    "new_manual_override_enabled" boolean,
    "reason" "text" NOT NULL,
    "source_summary" "jsonb",
    "calculation_version" "text",
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "campaign_id_snapshot" "uuid" NOT NULL,
    "campaign_zone_id_snapshot" "uuid" NOT NULL,
    "zone_name_snapshot" "text",
    "adjustment_type" "text",
    "inaccessible_percent" numeric(5,2),
    "notes" "text",
    "old_adjustment_type" "text",
    "old_inaccessible_percent" numeric(5,2),
    "old_notes" "text",
    CONSTRAINT "campaign_zone_progress_history_event_type_check" CHECK (("event_type" = ANY (ARRAY['automatic_recalc'::"text", 'manual_override'::"text", 'manual_clear'::"text", 'geometric_sync'::"text"]))),
    CONSTRAINT "campaign_zone_progress_history_reason_required" CHECK ((NULLIF("btrim"("reason"), ''::"text") IS NOT NULL))
);

ALTER TABLE ONLY "public"."campaign_zone_progress_history" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_zone_progress_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_zone_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "zone_id" "uuid",
    "municipality_name" "text",
    "postal_code" "text",
    "matched_geography_type" "text",
    "matched_geography_ref" "text",
    "population_total" integer,
    "households_total" integer,
    "density_per_km2" numeric(12,2),
    "avg_income_estimate" numeric(12,2),
    "competitor_count" integer,
    "poi_count" integer,
    "reach_score" numeric(8,2),
    "roi_score" numeric(8,2),
    "confidence_score" numeric(8,2),
    "raw_inputs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."campaign_zone_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "zone_name" "text",
    "address_label" "text",
    "center_lat" numeric(10,7) NOT NULL,
    "center_lng" numeric(10,7) NOT NULL,
    "radius_m" integer,
    "polygon_geojson" "jsonb",
    "households_estimate" integer,
    "population_estimate" integer,
    "density_score" numeric(8,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "group_id" "uuid",
    "priority" integer DEFAULT 1,
    "status" "text" DEFAULT 'Da iniziare'::"text",
    "quantity_assigned" integer DEFAULT 0,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "notes" "text",
    "geometry" "public"."geometry"(Geometry,4326),
    CONSTRAINT "campaign_zones_status_check" CHECK (("status" = ANY (ARRAY['Da iniziare'::"text", 'In corso'::"text", 'In pausa'::"text", 'Completata'::"text", 'Bloccata'::"text", 'Parziale'::"text"])))
);


ALTER TABLE "public"."campaign_zones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clienti" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "email" "text" NOT NULL,
    "nome" "text",
    "telefono" "text",
    "azienda" "text",
    "tipo_attivita" "text",
    "citta" "text" DEFAULT 'Milano'::"text",
    "note" "text",
    "cognome" "text",
    "piva" "text",
    "codice_fiscale" "text",
    "cellulare" "text",
    "pec" "text",
    "sdi" "text",
    "indirizzo" "text",
    "comune" "text",
    "provincia" "text",
    "cap" "text",
    "nazione" "text" DEFAULT 'Italia'::"text",
    "lat" double precision,
    "lng" double precision,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "categoria" "text",
    "stato" "text" DEFAULT 'nuovo'::"text",
    "updated_at" timestamp with time zone,
    CONSTRAINT "clienti_stato_check" CHECK (("stato" = ANY (ARRAY['nuovo'::"text", 'attivo'::"text", 'inattivo'::"text", 'vip'::"text"])))
);


ALTER TABLE "public"."clienti" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clienti_referenti" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "ruolo" "text",
    "telefono" "text",
    "email" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."clienti_referenti" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbgt_accesso_esterno" (
    "source_id" "text" NOT NULL,
    "fonte" "text",
    "scala" "text",
    "cod_cons" "text",
    "geom" "public"."geometry"(Point,4326),
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbgt_accesso_esterno" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbgt_accesso_numero_civico" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "accesso_id" "text" NOT NULL,
    "civico_id" "text" NOT NULL,
    "cod_cons" "text",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbgt_accesso_numero_civico" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbgt_import_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" DEFAULT 'dbgt_lombardia'::"text" NOT NULL,
    "province" "text",
    "package_name" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "stats" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."dbgt_import_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbgt_limiti_comunali" (
    "source_id" "text" NOT NULL,
    "codice_comune" "text",
    "comune" "text",
    "sigla_provincia" "text",
    "provincia" "text",
    "download_url" "text",
    "anno_ril_agg" "text",
    "geom" "public"."geometry"(MultiPolygon,4326),
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbgt_limiti_comunali" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbgt_numero_civico" (
    "source_id" "text" NOT NULL,
    "numero" "text",
    "subalterno" "text",
    "toponimo_id" "text",
    "fonte" "text",
    "scala" "text",
    "cod_cons" "text",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbgt_numero_civico" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbgt_toponimo_nome" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "text" NOT NULL,
    "lingua" "text",
    "nome" "text",
    "cod_cons" "text",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbgt_toponimo_nome" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dbgt_toponimo_stradale" (
    "source_id" "text" NOT NULL,
    "codice_comune_ref" "text",
    "codice" "text",
    "tipo_toponimo" "text",
    "fonte" "text",
    "scala" "text",
    "cod_cons" "text",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dbgt_toponimo_stradale" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_session_coverage" (
    "session_id" "uuid" NOT NULL,
    "campaign_zone_id" "uuid" NOT NULL,
    "coverage_percent" numeric(5,2) NOT NULL,
    "covered_area_m2" numeric NOT NULL,
    "total_area_m2" numeric NOT NULL,
    "buffer_meters" numeric DEFAULT 30 NOT NULL,
    "valid_points" integer DEFAULT 0 NOT NULL,
    "excluded_points" integer DEFAULT 0 NOT NULL,
    "calculation_status" "text" NOT NULL,
    "reason_not_calculable" "text",
    "calculated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "delivery_session_coverage_percent_range" CHECK ((("coverage_percent" >= (0)::numeric) AND ("coverage_percent" <= (100)::numeric)))
);


ALTER TABLE "public"."delivery_session_coverage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demographic_indicators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "geography_type" "text" NOT NULL,
    "geography_ref" "text" NOT NULL,
    "reference_year" integer NOT NULL,
    "population_total" integer,
    "households_total" integer,
    "avg_household_size" numeric(8,2),
    "share_families_with_children" numeric(8,2),
    "share_age_0_14" numeric(8,2),
    "share_age_15_34" numeric(8,2),
    "share_age_35_64" numeric(8,2),
    "share_age_65_plus" numeric(8,2),
    "avg_income_estimate" numeric(12,2),
    "commercial_density_index" numeric(8,2),
    "mobility_index" numeric(8,2),
    "confidence_score" numeric(8,2),
    "source" "text",
    "source_ref" "text",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"(),
    "municipality_code" "text",
    "municipality_name" "text",
    "age_0_14_pct" numeric(5,2),
    "age_15_34_pct" numeric(5,2),
    "age_35_64_pct" numeric(5,2),
    "age_65_plus_pct" numeric(5,2),
    "foreigners_pct" numeric(5,2),
    "employment_rate" numeric(5,2),
    "average_income" numeric(12,2),
    "old_age_index" numeric(12,2),
    "businesses_total" integer,
    "updated_at" timestamp with time zone,
    CONSTRAINT "demographic_indicators_geography_type_check" CHECK (("geography_type" = ANY (ARRAY['municipality'::"text", 'postal_area'::"text", 'custom_zone'::"text"])))
);


ALTER TABLE "public"."demographic_indicators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documenti" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "nome_file" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "formato" "text",
    "dimensione_bytes" bigint,
    "hash" "text",
    "storage_path" "text" NOT NULL,
    "autore_id" "uuid",
    "autore_email" "text",
    "resource_type" "text",
    "resource_id" "text",
    "tag" "text"[] DEFAULT '{}'::"text"[],
    "note" "text",
    CONSTRAINT "documenti_categoria_check" CHECK (("categoria" = ANY (ARRAY['contratto'::"text", 'preventivo'::"text", 'ordine'::"text", 'fattura'::"text", 'ricevuta'::"text", 'documento_fiscale'::"text", 'ddt'::"text", 'report'::"text", 'foto'::"text", 'video'::"text", 'documentazione_cliente'::"text", 'documentazione_fornitore'::"text", 'documentazione_operatore'::"text", 'allegato'::"text"])))
);


ALTER TABLE "public"."documenti" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."economic_indicators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "municipality_code" "text",
    "municipality_name" "text",
    "average_income" numeric(12,2),
    "employment_rate" numeric(5,2),
    "businesses_total" integer,
    "source_name" "text" NOT NULL,
    "source_year" integer,
    "source_level" "text" DEFAULT 'municipality'::"text" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."economic_indicators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."geo_municipalities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "country_code" "text" DEFAULT 'IT'::"text",
    "region_code" "text",
    "region_name" "text",
    "province_code" "text",
    "province_name" "text",
    "municipality_code" "text",
    "municipality_name" "text" NOT NULL,
    "cadastral_code" "text",
    "istat_code" "text",
    "population_total" integer,
    "households_total" integer,
    "area_km2" numeric(12,2),
    "density_per_km2" numeric(12,2),
    "geom_geojson" "jsonb",
    "centroid_lat" numeric(10,7),
    "centroid_lng" numeric(10,7),
    "source" "text",
    "source_ref" "text",
    "imported_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "geom" "public"."geometry"(MultiPolygon,4326)
);


ALTER TABLE "public"."geo_municipalities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."geo_nil_milano" (
    "id" bigint NOT NULL,
    "nil_code" "text" NOT NULL,
    "nil_name" "text" NOT NULL,
    "geom" "public"."geometry"(MultiPolygon,4326) NOT NULL,
    "source" "text" DEFAULT 'Comune di Milano - DS964 NIL VIGENTI PGT 2030'::"text" NOT NULL,
    "source_url" "text",
    "valid_from" "date",
    "valid_to" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."geo_nil_milano" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."geo_nil_milano_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."geo_nil_milano_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."geo_nil_milano_id_seq" OWNED BY "public"."geo_nil_milano"."id";



CREATE TABLE IF NOT EXISTS "public"."geo_postal_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "postal_code" "text" NOT NULL,
    "municipality_name" "text",
    "province_code" "text",
    "region_name" "text",
    "centroid_lat" numeric(10,7),
    "centroid_lng" numeric(10,7),
    "geom_geojson" "jsonb",
    "source" "text",
    "source_ref" "text",
    "imported_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "area_km2" numeric,
    "households_estimated" numeric,
    "population_estimated" numeric
);


ALTER TABLE "public"."geo_postal_areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gps_operator_audit_log" (
    "id" bigint NOT NULL,
    "operator_id" "uuid",
    "action" "text" NOT NULL,
    "campaign_id" "uuid",
    "assignment_id" "uuid",
    "session_id" "uuid",
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."gps_operator_audit_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."gps_operator_audit_log" OWNER TO "postgres";


ALTER TABLE "public"."gps_operator_audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gps_operator_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gtfs_routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "agency" "text",
    "route_id" "text" NOT NULL,
    "route_short_name" "text",
    "route_long_name" "text",
    "route_type" integer,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gtfs_routes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gtfs_stop_times" (
    "id" bigint NOT NULL,
    "source" "text" NOT NULL,
    "trip_id" "text" NOT NULL,
    "route_id" "text",
    "stop_id" "text" NOT NULL,
    "arrival_time" "text",
    "departure_time" "text",
    "stop_sequence" integer NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gtfs_stop_times" OWNER TO "postgres";


ALTER TABLE "public"."gtfs_stop_times" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gtfs_stop_times_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gtfs_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" DEFAULT 'GTFS / Trasporto pubblico'::"text" NOT NULL,
    "agency" "text",
    "stop_id" "text" NOT NULL,
    "stop_name" "text" NOT NULL,
    "stop_lat" numeric(10,7) NOT NULL,
    "stop_lng" numeric(10,7) NOT NULL,
    "municipality_code" "text",
    "municipality_name" "text",
    "geom" "public"."geometry"(Point,4326),
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gtfs_stops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."impostazioni" (
    "chiave" "text" NOT NULL,
    "categoria" "text" DEFAULT 'generale'::"text" NOT NULL,
    "valore" "jsonb",
    "valore_predefinito" "jsonb",
    "descrizione" "text",
    "updated_at" timestamp with time zone,
    "updated_by_id" "uuid",
    "updated_by_email" "text"
);


ALTER TABLE "public"."impostazioni" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."istat_census_sections" (
    "id" bigint NOT NULL,
    "sezione_code" "text" NOT NULL,
    "comune_code" "text" NOT NULL,
    "comune_name" "text" NOT NULL,
    "provincia" "text" NOT NULL,
    "regione" "text" NOT NULL,
    "cap" "text",
    "popolazione_totale" integer DEFAULT 0 NOT NULL,
    "famiglie_totali" integer DEFAULT 0 NOT NULL,
    "eta_media" numeric(4,1),
    "geometry" "public"."geometry"(MultiPolygon,4326) NOT NULL,
    "area_km2" numeric(10,4) GENERATED ALWAYS AS (("public"."st_area"(("geometry")::"public"."geography") / (1000000)::double precision)) STORED,
    "density_famiglie" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "data_year" integer DEFAULT 2021,
    "pop_0_18" bigint DEFAULT 0,
    "pop_19_34" bigint DEFAULT 0,
    "pop_35_64" bigint DEFAULT 0,
    "pop_65_plus" bigint DEFAULT 0,
    "pop_male" bigint DEFAULT 0,
    "pop_female" bigint DEFAULT 0,
    "eta_0_14" integer DEFAULT 0 NOT NULL,
    "eta_15_29" integer DEFAULT 0 NOT NULL,
    "eta_30_44" integer DEFAULT 0 NOT NULL,
    "eta_45_64" integer DEFAULT 0 NOT NULL,
    "eta_65_79" integer DEFAULT 0 NOT NULL,
    "eta_80plus" integer DEFAULT 0 NOT NULL,
    "maschi" integer DEFAULT 0 NOT NULL,
    "femmine" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."istat_census_sections" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."istat_census_sections_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."istat_census_sections_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."istat_census_sections_id_seq" OWNED BY "public"."istat_census_sections"."id";



CREATE OR REPLACE VIEW "public"."lombardia_comuni_bbox" AS
 SELECT "comune_code",
    "comune_name",
    "provincia",
    "public"."st_ymin"(("public"."st_extent"("geometry"))::"public"."box3d") AS "south",
    "public"."st_xmin"(("public"."st_extent"("geometry"))::"public"."box3d") AS "west",
    "public"."st_ymax"(("public"."st_extent"("geometry"))::"public"."box3d") AS "north",
    "public"."st_xmax"(("public"."st_extent"("geometry"))::"public"."box3d") AS "east",
    "count"(*) AS "sezioni"
   FROM "public"."istat_census_sections"
  GROUP BY "comune_code", "comune_name", "provincia";


ALTER VIEW "public"."lombardia_comuni_bbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."map_sectors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_type" "text" NOT NULL,
    "municipality_code" "text" NOT NULL,
    "sector_number" integer DEFAULT 1 NOT NULL,
    "sector_name" "text",
    "geometry" "public"."geometry"(MultiPolygon,4326) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "map_sectors_service_type_check" CHECK (("service_type" = ANY (ARRAY['d2d'::"text", 'h2h'::"text", 'b2b'::"text"])))
);


ALTER TABLE "public"."map_sectors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."omi_zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" DEFAULT 'Agenzia Entrate - OMI'::"text" NOT NULL,
    "year" integer,
    "semester" integer,
    "municipality_name" "text" NOT NULL,
    "municipality_code" "text",
    "zone_code" "text",
    "zone_name" "text",
    "min_value" numeric(12,2),
    "max_value" numeric(12,2),
    "typology" "text",
    "currency" "text" DEFAULT 'EUR/mq'::"text" NOT NULL,
    "geom" "public"."geometry"(MultiPolygon,4326),
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."omi_zones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "lead_name" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."operational_groups" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operator_profiles" (
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "disabled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operator_profiles_disabled_state_check" CHECK ((("active" AND ("disabled_at" IS NULL)) OR (NOT "active")))
);

ALTER TABLE ONLY "public"."operator_profiles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."operator_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."osm_buildings" (
    "id" bigint NOT NULL,
    "osm_id" bigint NOT NULL,
    "osm_type" "text",
    "geometry" "public"."geometry"(Polygon,4326) NOT NULL,
    "area_m2" numeric(10,2) GENERATED ALWAYS AS ("public"."st_area"(("geometry")::"public"."geography")) STORED,
    "building_class" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "osm_buildings_building_class_check" CHECK (("building_class" = ANY (ARRAY['villa'::"text", 'palazzo'::"text", 'altro'::"text"])))
);


ALTER TABLE "public"."osm_buildings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."osm_buildings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."osm_buildings_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."osm_buildings_id_seq" OWNED BY "public"."osm_buildings"."id";



CREATE TABLE IF NOT EXISTS "public"."poi_cache" (
    "id" bigint NOT NULL,
    "bbox_hash" "text" NOT NULL,
    "service_type" "text" NOT NULL,
    "bbox" "jsonb" NOT NULL,
    "pois" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval),
    "provider" "text",
    "external_id" "text",
    "name" "text",
    "category" "text",
    "service_context" "text",
    "lat" numeric(10,7),
    "lng" numeric(10,7),
    "address" "text",
    "municipality_code" "text",
    "geom" "public"."geometry"(Point,4326),
    "raw_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."poi_cache" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."poi_cache_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."poi_cache_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."poi_cache_id_seq" OWNED BY "public"."poi_cache"."id";



CREATE TABLE IF NOT EXISTS "public"."poi_search_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service" "text" NOT NULL,
    "lat" numeric(10,7),
    "lng" numeric(10,7),
    "radius_km" numeric(8,3),
    "providers_used" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "results_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."poi_search_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "company_name" "text",
    "role" "text" DEFAULT 'client'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'client'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quote_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(16), 'hex'::"text") NOT NULL,
    "service_type" "text" NOT NULL,
    "business_type" "text",
    "address_input" "text",
    "zone_label" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "radius_km" numeric(5,2),
    "radius_m" integer GENERATED ALWAYS AS ("round"(("radius_km" * (1000)::numeric))) STORED,
    "quantity" integer,
    "already_printed" boolean,
    "material" "text",
    "flyer_weight" "text",
    "business_target_points" integer,
    "print_sides" "text",
    "print_grammatura" "text",
    "print_color" "text",
    "print_finish" "text",
    "print_fold" "text",
    "price_base_distribution" numeric(12,2),
    "price_service_extra" numeric(12,2),
    "price_print_extra" numeric(12,2),
    "price_total" numeric(12,2),
    "contact_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "contact_business" "text",
    "privacy_accepted" boolean DEFAULT false,
    "user_id" "uuid",
    "configurator_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "quote_requests_flyer_weight_check" CHECK (("flyer_weight" = ANY (ARRAY['light'::"text", 'normal'::"text", 'heavy'::"text"]))),
    CONSTRAINT "quote_requests_material_check" CHECK (("material" = ANY (ARRAY['a5'::"text", 'a4'::"text", 'depliant'::"text", 'catalogo'::"text"]))),
    CONSTRAINT "quote_requests_service_type_check" CHECK (("service_type" = ANY (ARRAY['door'::"text", 'hand'::"text", 'business'::"text"]))),
    CONSTRAINT "quote_requests_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'zone_selected'::"text", 'plan_selected'::"text", 'contact_added'::"text", 'confirmed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."quote_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."smart_pairing_waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cliente_id" "uuid",
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "whatsapp" "text",
    "comune" "text",
    "servizio" "text",
    "date_preferite" "text",
    "note" "text",
    "gestita" boolean DEFAULT false,
    "gestita_at" timestamp with time zone
);


ALTER TABLE "public"."smart_pairing_waitlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."territorial_profile_indicators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "geography_type" "text" NOT NULL,
    "geography_ref" "text" NOT NULL,
    "municipality_code" "text",
    "municipality_name" "text",
    "reference_year" integer NOT NULL,
    "source" "text" NOT NULL,
    "avg_household_size" numeric,
    "single_households_pct" numeric,
    "couples_no_children_pct" numeric,
    "families_with_children_pct" numeric,
    "single_parent_households_pct" numeric,
    "other_households_pct" numeric,
    "residential_area_pct" numeric,
    "commercial_industrial_area_pct" numeric,
    "raw_payload" "jsonb",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "green_agricultural_area_pct" numeric,
    "other_infrastructure_water_area_pct" numeric,
    CONSTRAINT "territorial_profile_indicators_pct_range_check" CHECK (((("single_households_pct" IS NULL) OR (("single_households_pct" >= (0)::numeric) AND ("single_households_pct" <= (100)::numeric))) AND (("couples_no_children_pct" IS NULL) OR (("couples_no_children_pct" >= (0)::numeric) AND ("couples_no_children_pct" <= (100)::numeric))) AND (("families_with_children_pct" IS NULL) OR (("families_with_children_pct" >= (0)::numeric) AND ("families_with_children_pct" <= (100)::numeric))) AND (("single_parent_households_pct" IS NULL) OR (("single_parent_households_pct" >= (0)::numeric) AND ("single_parent_households_pct" <= (100)::numeric))) AND (("other_households_pct" IS NULL) OR (("other_households_pct" >= (0)::numeric) AND ("other_households_pct" <= (100)::numeric))) AND (("residential_area_pct" IS NULL) OR (("residential_area_pct" >= (0)::numeric) AND ("residential_area_pct" <= (100)::numeric))) AND (("commercial_industrial_area_pct" IS NULL) OR (("commercial_industrial_area_pct" >= (0)::numeric) AND ("commercial_industrial_area_pct" <= (100)::numeric))) AND (("green_agricultural_area_pct" IS NULL) OR (("green_agricultural_area_pct" >= (0)::numeric) AND ("green_agricultural_area_pct" <= (100)::numeric))) AND (("other_infrastructure_water_area_pct" IS NULL) OR (("other_infrastructure_water_area_pct" >= (0)::numeric) AND ("other_infrastructure_water_area_pct" <= (100)::numeric)))))
);


ALTER TABLE "public"."territorial_profile_indicators" OWNER TO "postgres";


COMMENT ON TABLE "public"."territorial_profile_indicators" IS 'Normalized territorial indicators: public read of mapped columns; writes and raw_payload reserved to service_role.';



COMMENT ON COLUMN "public"."territorial_profile_indicators"."raw_payload" IS 'Private source payload for trusted imports and audit; not exposed to anon or authenticated.';



CREATE TABLE IF NOT EXISTS "public"."tracking_gps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "campagna_id" "uuid",
    "lat" numeric NOT NULL,
    "lng" numeric NOT NULL,
    "volantini_n" integer DEFAULT 0,
    "foto_url" "text",
    "nota" "text"
);


ALTER TABLE "public"."tracking_gps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transport_routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "route_id" "text" NOT NULL,
    "route_short_name" "text",
    "route_long_name" "text",
    "route_type" integer,
    "route_type_label" "text" DEFAULT 'unknown'::"text",
    "route_color" "text",
    "route_text_color" "text",
    "raw_tags" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."transport_routes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transport_stop_routes" (
    "source" "text" NOT NULL,
    "stop_id" "text" NOT NULL,
    "route_id" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."transport_stop_routes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transport_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "stop_id" "text" NOT NULL,
    "stop_name" "text" NOT NULL,
    "stop_type" "text" DEFAULT 'unknown'::"text",
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "geom" "public"."geometry"(Point,4326) NOT NULL,
    "raw_tags" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."transport_stops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."volantinipro_release_migrations" (
    "version" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "sha256" "text" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_by" "text" NOT NULL,
    "release_name" "text" NOT NULL,
    "execution_ms" integer NOT NULL,
    "status" "text" NOT NULL,
    CONSTRAINT "volantinipro_release_migrations_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."volantinipro_release_migrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zone_admin" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "comune" "text" NOT NULL,
    "provincia" "text" DEFAULT 'MI'::"text",
    "famiglie" integer,
    "popolazione" integer,
    "superficie_km2" numeric,
    "reddito_medio" numeric,
    "poi_count" integer,
    "competitor_count" integer,
    "family_index" numeric,
    "reach_score" numeric,
    "attiva" boolean DEFAULT true,
    "note" "text"
);


ALTER TABLE "public"."zone_admin" OWNER TO "postgres";


ALTER TABLE ONLY "public"."api_usage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."api_usage_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."geo_nil_milano" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."geo_nil_milano_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."istat_census_sections" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."istat_census_sections_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."osm_buildings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."osm_buildings_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."poi_cache" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."poi_cache_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."address_points"
    ADD CONSTRAINT "address_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_coverage_corrections"
    ADD CONSTRAINT "admin_coverage_corrections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_reports"
    ADD CONSTRAINT "ai_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_territorial_chat_cache"
    ADD CONSTRAINT "ai_territorial_chat_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_territorial_chat_cache"
    ADD CONSTRAINT "ai_territorial_chat_cache_user_id_payload_hash_key" UNIQUE ("user_id", "payload_hash");



ALTER TABLE ONLY "public"."ai_territory_summaries"
    ADD CONSTRAINT "ai_territory_summaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_usage"
    ADD CONSTRAINT "api_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assigned_zones"
    ADD CONSTRAINT "assigned_zones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_event_log"
    ADD CONSTRAINT "assignment_event_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."availability_slots"
    ADD CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campagne"
    ADD CONSTRAINT "campagne_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_admin_action_log"
    ADD CONSTRAINT "campaign_admin_action_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_analysis"
    ADD CONSTRAINT "campaign_analysis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_assets"
    ADD CONSTRAINT "campaign_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_coverage_adjustments_log"
    ADD CONSTRAINT "campaign_coverage_adjustments_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_coverage_adjustments"
    ADD CONSTRAINT "campaign_coverage_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_pois"
    ADD CONSTRAINT "campaign_pois_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_zone_progress"
    ADD CONSTRAINT "campaign_zone_progress_campaign_zone_uidx" UNIQUE ("campaign_zone_id");



ALTER TABLE ONLY "public"."campaign_zone_progress_history"
    ADD CONSTRAINT "campaign_zone_progress_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_zone_progress"
    ADD CONSTRAINT "campaign_zone_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_zone_snapshots"
    ADD CONSTRAINT "campaign_zone_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_zones"
    ADD CONSTRAINT "campaign_zones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clienti"
    ADD CONSTRAINT "clienti_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."clienti"
    ADD CONSTRAINT "clienti_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clienti_referenti"
    ADD CONSTRAINT "clienti_referenti_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbgt_accesso_esterno"
    ADD CONSTRAINT "dbgt_accesso_esterno_pkey" PRIMARY KEY ("source_id");



ALTER TABLE ONLY "public"."dbgt_accesso_numero_civico"
    ADD CONSTRAINT "dbgt_accesso_numero_civico_accesso_id_civico_id_key" UNIQUE ("accesso_id", "civico_id");



ALTER TABLE ONLY "public"."dbgt_accesso_numero_civico"
    ADD CONSTRAINT "dbgt_accesso_numero_civico_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbgt_import_runs"
    ADD CONSTRAINT "dbgt_import_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbgt_limiti_comunali"
    ADD CONSTRAINT "dbgt_limiti_comunali_pkey" PRIMARY KEY ("source_id");



ALTER TABLE ONLY "public"."dbgt_numero_civico"
    ADD CONSTRAINT "dbgt_numero_civico_pkey" PRIMARY KEY ("source_id");



ALTER TABLE ONLY "public"."dbgt_toponimo_nome"
    ADD CONSTRAINT "dbgt_toponimo_nome_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dbgt_toponimo_nome"
    ADD CONSTRAINT "dbgt_toponimo_nome_source_id_lingua_nome_key" UNIQUE ("source_id", "lingua", "nome");



ALTER TABLE ONLY "public"."dbgt_toponimo_stradale"
    ADD CONSTRAINT "dbgt_toponimo_stradale_pkey" PRIMARY KEY ("source_id");



ALTER TABLE ONLY "public"."delivery_session_coverage"
    ADD CONSTRAINT "delivery_session_coverage_pkey" PRIMARY KEY ("session_id");



ALTER TABLE ONLY "public"."delivery_sessions"
    ADD CONSTRAINT "delivery_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demographic_indicators"
    ADD CONSTRAINT "demographic_indicators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demographic_indicators"
    ADD CONSTRAINT "demographic_unique" UNIQUE ("geography_type", "geography_ref", "reference_year");



ALTER TABLE ONLY "public"."documenti"
    ADD CONSTRAINT "documenti_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."economic_indicators"
    ADD CONSTRAINT "economic_indicators_municipality_code_key" UNIQUE ("municipality_code");



ALTER TABLE ONLY "public"."economic_indicators"
    ADD CONSTRAINT "economic_indicators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geo_municipalities"
    ADD CONSTRAINT "geo_municipalities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geo_municipalities"
    ADD CONSTRAINT "geo_municipalities_unique" UNIQUE ("municipality_code");



ALTER TABLE ONLY "public"."geo_nil_milano"
    ADD CONSTRAINT "geo_nil_milano_nil_code_key" UNIQUE ("nil_code");



ALTER TABLE ONLY "public"."geo_nil_milano"
    ADD CONSTRAINT "geo_nil_milano_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geo_postal_areas"
    ADD CONSTRAINT "geo_postal_areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."geo_postal_areas"
    ADD CONSTRAINT "geo_postal_areas_unique" UNIQUE ("postal_code");



ALTER TABLE ONLY "public"."gps_operator_audit_log"
    ADD CONSTRAINT "gps_operator_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gps_tracking_points"
    ADD CONSTRAINT "gps_tracking_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gtfs_routes"
    ADD CONSTRAINT "gtfs_routes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gtfs_routes"
    ADD CONSTRAINT "gtfs_routes_source_route_id_key" UNIQUE ("source", "route_id");



ALTER TABLE ONLY "public"."gtfs_stop_times"
    ADD CONSTRAINT "gtfs_stop_times_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gtfs_stop_times"
    ADD CONSTRAINT "gtfs_stop_times_source_trip_id_stop_sequence_key" UNIQUE ("source", "trip_id", "stop_sequence");



ALTER TABLE ONLY "public"."gtfs_stops"
    ADD CONSTRAINT "gtfs_stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."impostazioni"
    ADD CONSTRAINT "impostazioni_pkey" PRIMARY KEY ("chiave");



ALTER TABLE ONLY "public"."istat_census_sections"
    ADD CONSTRAINT "istat_census_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."istat_census_sections"
    ADD CONSTRAINT "istat_census_sections_sezione_code_key" UNIQUE ("sezione_code");



ALTER TABLE ONLY "public"."map_sectors"
    ADD CONSTRAINT "map_sectors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."map_sectors"
    ADD CONSTRAINT "map_sectors_service_type_municipality_code_sector_number_key" UNIQUE ("service_type", "municipality_code", "sector_number");



ALTER TABLE ONLY "public"."omi_zones"
    ADD CONSTRAINT "omi_zones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_groups"
    ADD CONSTRAINT "operational_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operator_assignment_zones"
    ADD CONSTRAINT "operator_assignment_zones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operator_assignments"
    ADD CONSTRAINT "operator_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operator_profiles"
    ADD CONSTRAINT "operator_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."osm_buildings"
    ADD CONSTRAINT "osm_buildings_osm_id_key" UNIQUE ("osm_id");



ALTER TABLE ONLY "public"."osm_buildings"
    ADD CONSTRAINT "osm_buildings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."poi_cache"
    ADD CONSTRAINT "poi_cache_bbox_hash_key" UNIQUE ("bbox_hash");



ALTER TABLE ONLY "public"."poi_cache"
    ADD CONSTRAINT "poi_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."poi_search_logs"
    ADD CONSTRAINT "poi_search_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proof_photos"
    ADD CONSTRAINT "proof_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quote_requests"
    ADD CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quote_requests"
    ADD CONSTRAINT "quote_requests_session_token_key" UNIQUE ("session_token");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."smart_pairing_slots"
    ADD CONSTRAINT "smart_pairing_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."smart_pairing_waitlist"
    ADD CONSTRAINT "smart_pairing_waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."territorial_profile_indicators"
    ADD CONSTRAINT "territorial_profile_indicators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracking_gps"
    ADD CONSTRAINT "tracking_gps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_routes"
    ADD CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_stop_routes"
    ADD CONSTRAINT "transport_stop_routes_pkey" PRIMARY KEY ("source", "stop_id", "route_id");



ALTER TABLE ONLY "public"."transport_stops"
    ADD CONSTRAINT "transport_stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."volantinipro_release_migrations"
    ADD CONSTRAINT "volantinipro_release_migrations_pkey" PRIMARY KEY ("version");



ALTER TABLE ONLY "public"."zone_admin"
    ADD CONSTRAINT "zone_admin_comune_key" UNIQUE ("comune");



ALTER TABLE ONLY "public"."zone_admin"
    ADD CONSTRAINT "zone_admin_pkey" PRIMARY KEY ("id");



CREATE INDEX "address_points_codice_comune_idx" ON "public"."address_points" USING "btree" ("codice_comune");



CREATE INDEX "address_points_comune_idx" ON "public"."address_points" USING "btree" ("comune");



CREATE INDEX "address_points_geom_gix" ON "public"."address_points" USING "gist" ("geom");



CREATE INDEX "address_points_osm_geography_idx" ON "public"."address_points" USING "gist" ((("geom")::"public"."geography")) WHERE (("source" = 'osm'::"text") AND ("geom" IS NOT NULL));



CREATE UNIQUE INDEX "address_points_source_source_id_uidx" ON "public"."address_points" USING "btree" ("source", "source_id") WHERE ("source_id" IS NOT NULL);



CREATE INDEX "admin_coverage_corrections_campaign_id_idx" ON "public"."admin_coverage_corrections" USING "btree" ("campaign_id");



CREATE INDEX "admin_coverage_corrections_geom_gix" ON "public"."admin_coverage_corrections" USING "gist" ("geom");



CREATE INDEX "admin_coverage_corrections_group_id_idx" ON "public"."admin_coverage_corrections" USING "btree" ("group_id");



CREATE UNIQUE INDEX "ai_territory_summaries_user_payload_key" ON "public"."ai_territory_summaries" USING "btree" ("user_id", "payload_hash");



CREATE INDEX "assigned_zones_campaign_id_idx" ON "public"."assigned_zones" USING "btree" ("campaign_id");



CREATE INDEX "assigned_zones_geom_gix" ON "public"."assigned_zones" USING "gist" ("geom");



CREATE INDEX "assigned_zones_group_id_idx" ON "public"."assigned_zones" USING "btree" ("group_id");



CREATE INDEX "campaign_admin_action_log_campaign_idx" ON "public"."campaign_admin_action_log" USING "btree" ("campaign_id", "created_at" DESC);



CREATE INDEX "campaign_admin_action_log_snapshot_idx" ON "public"."campaign_admin_action_log" USING "btree" ("campaign_id_snapshot", "created_at" DESC);



CREATE INDEX "campaign_coverage_adjustments_active_idx" ON "public"."campaign_coverage_adjustments" USING "btree" ("campaign_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "campaign_coverage_adjustments_campaign_id_idx" ON "public"."campaign_coverage_adjustments" USING "btree" ("campaign_id");



CREATE INDEX "campaign_coverage_adjustments_geometry_gix" ON "public"."campaign_coverage_adjustments" USING "gist" ("geometry");



CREATE INDEX "campaign_coverage_adjustments_log_adjustment_idx" ON "public"."campaign_coverage_adjustments_log" USING "btree" ("adjustment_id", "created_at" DESC);



CREATE INDEX "campaign_coverage_adjustments_log_campaign_idx" ON "public"."campaign_coverage_adjustments_log" USING "btree" ("campaign_id", "created_at" DESC);



CREATE INDEX "campaign_coverage_adjustments_zone_id_idx" ON "public"."campaign_coverage_adjustments" USING "btree" ("zone_id");



CREATE INDEX "campaign_zone_progress_campaign_id_idx" ON "public"."campaign_zone_progress" USING "btree" ("campaign_id");



CREATE INDEX "campaign_zone_progress_history_campaign_idx" ON "public"."campaign_zone_progress_history" USING "btree" ("campaign_id", "created_at" DESC);



CREATE INDEX "campaign_zone_progress_history_zone_idx" ON "public"."campaign_zone_progress_history" USING "btree" ("campaign_zone_id", "created_at" DESC);



CREATE INDEX "campaign_zone_progress_updated_at_idx" ON "public"."campaign_zone_progress" USING "btree" ("updated_at" DESC);



CREATE INDEX "campaigns_customer_id_idx" ON "public"."campaigns" USING "btree" ("customer_id");



CREATE INDEX "campaigns_user_id_idx" ON "public"."campaigns" USING "btree" ("user_id");



CREATE INDEX "dbgt_accesso_esterno_geom_gix" ON "public"."dbgt_accesso_esterno" USING "gist" ("geom");



CREATE INDEX "dbgt_accesso_numero_accesso_idx" ON "public"."dbgt_accesso_numero_civico" USING "btree" ("accesso_id");



CREATE INDEX "dbgt_accesso_numero_civico_idx" ON "public"."dbgt_accesso_numero_civico" USING "btree" ("civico_id");



CREATE INDEX "dbgt_limiti_comunali_geom_gix" ON "public"."dbgt_limiti_comunali" USING "gist" ("geom");



CREATE INDEX "dbgt_limiti_comunali_province_idx" ON "public"."dbgt_limiti_comunali" USING "btree" ("sigla_provincia");



CREATE INDEX "dbgt_numero_civico_toponimo_idx" ON "public"."dbgt_numero_civico" USING "btree" ("toponimo_id");



CREATE INDEX "dbgt_toponimo_nome_source_idx" ON "public"."dbgt_toponimo_nome" USING "btree" ("source_id");



CREATE INDEX "dbgt_toponimo_stradale_comune_ref_idx" ON "public"."dbgt_toponimo_stradale" USING "btree" ("codice_comune_ref");



CREATE INDEX "delivery_session_coverage_zone_idx" ON "public"."delivery_session_coverage" USING "btree" ("campaign_zone_id");



CREATE INDEX "delivery_sessions_assignment_id_idx" ON "public"."delivery_sessions" USING "btree" ("assignment_id");



CREATE INDEX "delivery_sessions_assignment_idx" ON "public"."delivery_sessions" USING "btree" ("assignment_id", "status");



CREATE INDEX "delivery_sessions_campaign_id_idx" ON "public"."delivery_sessions" USING "btree" ("campaign_id");



CREATE INDEX "delivery_sessions_driver_campaign_assignment_idx" ON "public"."delivery_sessions" USING "btree" ("driver_id", "campaign_id", "assignment_id");



CREATE UNIQUE INDEX "delivery_sessions_one_active_operator_campaign_uidx" ON "public"."delivery_sessions" USING "btree" ("driver_id", "campaign_id") WHERE (("assignment_id" IS NOT NULL) AND ("status" = ANY (ARRAY['started'::"text", 'paused'::"text"])));



CREATE UNIQUE INDEX "demographic_indicators_municipality_code_key" ON "public"."demographic_indicators" USING "btree" ("municipality_code");



CREATE INDEX "economic_indicators_municipality_name_idx" ON "public"."economic_indicators" USING "btree" ("municipality_name");



CREATE INDEX "geo_municipalities_geom_idx" ON "public"."geo_municipalities" USING "gist" ("geom");



CREATE INDEX "geo_nil_milano_geom_gix" ON "public"."geo_nil_milano" USING "gist" ("geom");



CREATE INDEX "geo_nil_milano_name_idx" ON "public"."geo_nil_milano" USING "btree" ("nil_name");



CREATE INDEX "gps_operator_audit_operator_idx" ON "public"."gps_operator_audit_log" USING "btree" ("operator_id", "created_at" DESC);



CREATE INDEX "gps_operator_audit_session_idx" ON "public"."gps_operator_audit_log" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "gps_tracking_points_campaign_id_idx" ON "public"."gps_tracking_points" USING "btree" ("campaign_id");



CREATE INDEX "gps_tracking_points_driver_id_idx" ON "public"."gps_tracking_points" USING "btree" ("driver_id");



CREATE INDEX "gps_tracking_points_geom_gix" ON "public"."gps_tracking_points" USING "gist" ("geom");



CREATE INDEX "gps_tracking_points_session_id_idx" ON "public"."gps_tracking_points" USING "btree" ("session_id");



CREATE INDEX "gtfs_stop_times_route_idx" ON "public"."gtfs_stop_times" USING "btree" ("source", "route_id");



CREATE INDEX "gtfs_stop_times_stop_idx" ON "public"."gtfs_stop_times" USING "btree" ("source", "stop_id");



CREATE INDEX "gtfs_stops_geom_idx" ON "public"."gtfs_stops" USING "gist" ("geom");



CREATE UNIQUE INDEX "gtfs_stops_source_stop_id_idx" ON "public"."gtfs_stops" USING "btree" ("source", "stop_id");



CREATE INDEX "idx_address_points_geom_gist" ON "public"."address_points" USING "gist" ("geom");



CREATE INDEX "idx_address_points_lat" ON "public"."address_points" USING "btree" ("lat");



CREATE INDEX "idx_address_points_lng" ON "public"."address_points" USING "btree" ("lng");



CREATE INDEX "idx_address_points_osm_lat_lng" ON "public"."address_points" USING "btree" ("lat", "lng") WHERE ("source" = 'osm'::"text");



CREATE INDEX "idx_address_points_source" ON "public"."address_points" USING "btree" ("source");



CREATE INDEX "idx_address_points_source_lat_lng" ON "public"."address_points" USING "btree" ("source", "lat", "lng");



CREATE INDEX "idx_ai_reports_campaign_id" ON "public"."ai_reports" USING "btree" ("campaign_id");



CREATE INDEX "idx_ai_territorial_chat_cache_hash" ON "public"."ai_territorial_chat_cache" USING "btree" ("payload_hash");



CREATE INDEX "idx_ai_territorial_chat_cache_user" ON "public"."ai_territorial_chat_cache" USING "btree" ("user_id");



CREATE INDEX "idx_assignment_event_log_assignment" ON "public"."assignment_event_log" USING "btree" ("assignment_id");



CREATE INDEX "idx_buildings_class" ON "public"."osm_buildings" USING "btree" ("building_class");



CREATE INDEX "idx_buildings_geometry" ON "public"."osm_buildings" USING "gist" ("geometry");



CREATE INDEX "idx_campaign_analysis_campaign_id" ON "public"."campaign_analysis" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_assets_campaign_id" ON "public"."campaign_assets" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_events_campaign_id" ON "public"."campaign_events" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_pois_campaign_id" ON "public"."campaign_pois" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_pois_zone_id" ON "public"."campaign_pois" USING "btree" ("zone_id");



CREATE INDEX "idx_campaign_zone_snapshots_campaign_id" ON "public"."campaign_zone_snapshots" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_zone_snapshots_zone_id" ON "public"."campaign_zone_snapshots" USING "btree" ("zone_id");



CREATE INDEX "idx_campaign_zones_campaign_id" ON "public"."campaign_zones" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaigns_user_id" ON "public"."campaigns" USING "btree" ("user_id");



CREATE INDEX "idx_demographic_indicators_geo_ref" ON "public"."demographic_indicators" USING "btree" ("geography_type", "geography_ref");



CREATE INDEX "idx_geo_municipalities_istat_code" ON "public"."geo_municipalities" USING "btree" ("istat_code");



CREATE INDEX "idx_geo_municipalities_municipality_name" ON "public"."geo_municipalities" USING "btree" ("municipality_name");



CREATE INDEX "idx_geo_postal_areas_postal_code" ON "public"."geo_postal_areas" USING "btree" ("postal_code");



CREATE INDEX "idx_istat_cap" ON "public"."istat_census_sections" USING "btree" ("cap");



CREATE INDEX "idx_istat_comune" ON "public"."istat_census_sections" USING "btree" ("comune_code");



CREATE INDEX "idx_istat_comune_code" ON "public"."istat_census_sections" USING "btree" ("comune_code");



CREATE INDEX "idx_istat_comune_geometry" ON "public"."istat_census_sections" USING "gist" ("geometry");



CREATE INDEX "idx_istat_density" ON "public"."istat_census_sections" USING "btree" ("density_famiglie");



CREATE INDEX "idx_istat_femmine" ON "public"."istat_census_sections" USING "btree" ("femmine");



CREATE INDEX "idx_istat_geometry" ON "public"."istat_census_sections" USING "gist" ("geometry");



CREATE INDEX "idx_istat_maschi" ON "public"."istat_census_sections" USING "btree" ("maschi");



CREATE INDEX "idx_map_sectors_geom" ON "public"."map_sectors" USING "gist" ("geometry");



CREATE INDEX "idx_map_sectors_service_mun" ON "public"."map_sectors" USING "btree" ("service_type", "municipality_code");



CREATE INDEX "idx_oaz_assignment_id" ON "public"."operator_assignment_zones" USING "btree" ("assignment_id");



CREATE INDEX "idx_oaz_zone_id" ON "public"."operator_assignment_zones" USING "btree" ("zone_id") WHERE ("zone_id" IS NOT NULL);



CREATE INDEX "idx_poi_expires" ON "public"."poi_cache" USING "btree" ("expires_at");



CREATE INDEX "idx_poi_hash" ON "public"."poi_cache" USING "btree" ("bbox_hash");



CREATE INDEX "idx_quote_requests_created_at" ON "public"."quote_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_quote_requests_session_token" ON "public"."quote_requests" USING "btree" ("session_token");



CREATE INDEX "idx_quote_requests_status" ON "public"."quote_requests" USING "btree" ("status");



CREATE INDEX "idx_quote_requests_user_id" ON "public"."quote_requests" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_quotes_active_unique" ON "public"."quotes" USING "btree" ("campaign_id") WHERE ("is_active" = true);



CREATE INDEX "idx_quotes_campaign_id" ON "public"."quotes" USING "btree" ("campaign_id");



CREATE INDEX "omi_zones_geom_idx" ON "public"."omi_zones" USING "gist" ("geom");



CREATE UNIQUE INDEX "omi_zones_identity_idx" ON "public"."omi_zones" USING "btree" (COALESCE("year", 0), COALESCE("semester", 0), "lower"("municipality_name"), COALESCE("zone_code", ''::"text"), COALESCE("typology", ''::"text"));



CREATE INDEX "omi_zones_municipality_code_idx" ON "public"."omi_zones" USING "btree" ("municipality_code");



CREATE INDEX "omi_zones_municipality_name_idx" ON "public"."omi_zones" USING "btree" ("lower"("municipality_name"));



CREATE INDEX "operational_groups_campaign_id_idx" ON "public"."operational_groups" USING "btree" ("campaign_id");



CREATE UNIQUE INDEX "operational_groups_id_campaign_uidx" ON "public"."operational_groups" USING "btree" ("id", "campaign_id");



CREATE UNIQUE INDEX "operator_assignments_access_token_key" ON "public"."operator_assignments" USING "btree" ("access_token");



CREATE INDEX "operator_assignments_active_scope_idx" ON "public"."operator_assignments" USING "btree" ("operator_id", "campaign_id", "group_id", "zone_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "operator_assignments_campaign_id_idx" ON "public"."operator_assignments" USING "btree" ("campaign_id");



CREATE INDEX "operator_assignments_campaign_idx" ON "public"."operator_assignments" USING "btree" ("campaign_id", "group_id", "status");



CREATE UNIQUE INDEX "operator_assignments_one_current_group_uidx" ON "public"."operator_assignments" USING "btree" ("operator_id", "campaign_id", "group_id") WHERE (("status" = 'active'::"text") AND ("revoked_at" IS NULL));



CREATE INDEX "operator_assignments_operator_id_idx" ON "public"."operator_assignments" USING "btree" ("operator_id");



CREATE INDEX "operator_assignments_operator_idx" ON "public"."operator_assignments" USING "btree" ("operator_id", "status", "starts_at", "ends_at");



CREATE INDEX "operator_assignments_status_idx" ON "public"."operator_assignments" USING "btree" ("status");



CREATE INDEX "operator_assignments_validity_idx" ON "public"."operator_assignments" USING "btree" ("operator_id", "campaign_id", "status", "starts_at", "ends_at");



CREATE INDEX "poi_cache_geom_idx" ON "public"."poi_cache" USING "gist" ("geom");



CREATE INDEX "poi_cache_municipality_code_idx" ON "public"."poi_cache" USING "btree" ("municipality_code");



CREATE UNIQUE INDEX "poi_cache_provider_external_id_uidx" ON "public"."poi_cache" USING "btree" ("provider", "external_id");



CREATE INDEX "poi_cache_provider_idx" ON "public"."poi_cache" USING "btree" ("provider");



CREATE INDEX "poi_cache_service_context_idx" ON "public"."poi_cache" USING "btree" ("service_context");



CREATE INDEX "proof_photos_campaign_id_idx" ON "public"."proof_photos" USING "btree" ("campaign_id");



CREATE INDEX "quote_requests_created_at_idx" ON "public"."quote_requests" USING "btree" ("created_at" DESC);



CREATE INDEX "smart_pairing_slots_data_idx" ON "public"."smart_pairing_slots" USING "btree" ("data");



CREATE INDEX "smart_pairing_slots_stato_idx" ON "public"."smart_pairing_slots" USING "btree" ("stato");



CREATE UNIQUE INDEX "territorial_profile_indicators_unique_geo_year_source" ON "public"."territorial_profile_indicators" USING "btree" ("geography_type", "geography_ref", "reference_year", "source");



CREATE UNIQUE INDEX "transport_routes_source_route_id_uidx" ON "public"."transport_routes" USING "btree" ("source", "route_id");



CREATE INDEX "transport_stop_routes_source_route_id_idx" ON "public"."transport_stop_routes" USING "btree" ("source", "route_id");



CREATE INDEX "transport_stop_routes_source_stop_id_idx" ON "public"."transport_stop_routes" USING "btree" ("source", "stop_id");



CREATE INDEX "transport_stops_geom_gix" ON "public"."transport_stops" USING "gist" ("geom");



CREATE UNIQUE INDEX "transport_stops_source_stop_id_uidx" ON "public"."transport_stops" USING "btree" ("source", "stop_id");



CREATE UNIQUE INDEX "uq_assignment_event_log_one_confirmation" ON "public"."assignment_event_log" USING "btree" ("assignment_id") WHERE ("event_type" = 'assignment_program_confirmed'::"text");



CREATE UNIQUE INDEX "uq_oaz_assignment_municipality" ON "public"."operator_assignment_zones" USING "btree" ("assignment_id", "municipality_name") WHERE ("zone_id" IS NULL);



CREATE UNIQUE INDEX "uq_oaz_assignment_zone" ON "public"."operator_assignment_zones" USING "btree" ("assignment_id", "zone_id") WHERE ("zone_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "address_points_sync_geom" BEFORE INSERT OR UPDATE OF "lat", "lng" ON "public"."address_points" FOR EACH ROW EXECUTE FUNCTION "public"."sync_address_points_geom"();



CREATE OR REPLACE TRIGGER "address_points_touch_updated_at" BEFORE UPDATE ON "public"."address_points" FOR EACH ROW EXECUTE FUNCTION "public"."touch_address_points_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_coverage_adjustments_sync_zone_cache" AFTER INSERT OR UPDATE ON "public"."campaign_coverage_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."campaign_coverage_adjustments_sync_trigger"();



CREATE OR REPLACE TRIGGER "economic_indicators_touch_updated_at" BEFORE UPDATE ON "public"."economic_indicators" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "gps_tracking_points_set_geom" BEFORE INSERT OR UPDATE OF "lat", "lng" ON "public"."gps_tracking_points" FOR EACH ROW EXECUTE FUNCTION "public"."set_gps_tracking_point_geom"();



CREATE OR REPLACE TRIGGER "gtfs_stops_sync_geom" BEFORE INSERT OR UPDATE OF "stop_lat", "stop_lng" ON "public"."gtfs_stops" FOR EACH ROW EXECUTE FUNCTION "public"."sync_gtfs_stop_geom"();



CREATE OR REPLACE TRIGGER "operator_assignments_set_audit_fields" BEFORE INSERT OR UPDATE ON "public"."operator_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_operator_security_audit_fields"();



CREATE OR REPLACE TRIGGER "operator_profiles_set_updated_at" BEFORE UPDATE ON "public"."operator_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_operator_security_audit_fields"();



CREATE OR REPLACE TRIGGER "poi_cache_sync_geom" BEFORE INSERT OR UPDATE ON "public"."poi_cache" FOR EACH ROW EXECUTE FUNCTION "public"."sync_poi_cache_geom"();



CREATE OR REPLACE TRIGGER "protect_campaign_admin_action_log_snapshots" BEFORE UPDATE OF "campaign_id_snapshot", "campaign_title_snapshot" ON "public"."campaign_admin_action_log" FOR EACH ROW EXECUTE FUNCTION "public"."protect_campaign_admin_action_log_snapshots"();



CREATE OR REPLACE TRIGGER "protect_campaign_zone_progress_history_snapshots" BEFORE UPDATE OF "campaign_id_snapshot", "campaign_zone_id_snapshot", "zone_name_snapshot" ON "public"."campaign_zone_progress_history" FOR EACH ROW EXECUTE FUNCTION "public"."protect_campaign_zone_progress_history_snapshots"();



CREATE OR REPLACE TRIGGER "protect_profile_authorization_fields" BEFORE UPDATE OF "role" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_authorization_fields"();



CREATE OR REPLACE TRIGGER "set_campaign_coverage_adjustment_zone_guard" BEFORE INSERT OR UPDATE OF "zone_id", "campaign_id" ON "public"."campaign_coverage_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."set_campaign_coverage_adjustment_zone_guard"();



CREATE OR REPLACE TRIGGER "set_campaign_coverage_adjustments_updated_at" BEFORE UPDATE ON "public"."campaign_coverage_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_campaign_zone_progress_campaign_id" BEFORE INSERT OR UPDATE OF "campaign_zone_id", "campaign_id" ON "public"."campaign_zone_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_campaign_zone_progress_campaign_id"();



CREATE OR REPLACE TRIGGER "set_campaign_zone_progress_effective_percent_legacy" BEFORE INSERT OR UPDATE ON "public"."campaign_zone_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_campaign_zone_progress_effective_percent_legacy"();



CREATE OR REPLACE TRIGGER "set_campaign_zone_progress_updated_at" BEFORE UPDATE ON "public"."campaign_zone_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_campaign_zones_updated_at" BEFORE UPDATE ON "public"."campaign_zones" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_campaigns_updated_at" BEFORE UPDATE ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_causale" BEFORE INSERT ON "public"."campagne" FOR EACH ROW EXECUTE FUNCTION "public"."genera_causale"();



CREATE OR REPLACE TRIGGER "set_geo_municipalities_updated_at" BEFORE UPDATE ON "public"."geo_municipalities" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_geo_postal_areas_updated_at" BEFORE UPDATE ON "public"."geo_postal_areas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_quote_requests_updated_at" BEFORE UPDATE ON "public"."quote_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sp_slots_updated_at_trigger" BEFORE UPDATE ON "public"."smart_pairing_slots" FOR EACH ROW EXECUTE FUNCTION "public"."update_sp_slots_updated_at"();



CREATE OR REPLACE TRIGGER "transport_routes_touch_updated_at" BEFORE UPDATE ON "public"."transport_routes" FOR EACH ROW EXECUTE FUNCTION "public"."touch_transport_updated_at"();



CREATE OR REPLACE TRIGGER "transport_stops_touch_updated_at" BEFORE UPDATE ON "public"."transport_stops" FOR EACH ROW EXECUTE FUNCTION "public"."touch_transport_updated_at"();



CREATE OR REPLACE TRIGGER "trg_causale" BEFORE INSERT ON "public"."campagne" FOR EACH ROW EXECUTE FUNCTION "public"."genera_causale_bonifico"();



CREATE OR REPLACE TRIGGER "trg_classify_building" BEFORE INSERT OR UPDATE ON "public"."osm_buildings" FOR EACH ROW EXECUTE FUNCTION "public"."classify_building"();



CREATE OR REPLACE TRIGGER "trg_map_sectors_updated_at" BEFORE UPDATE ON "public"."map_sectors" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "validate_delivery_session_assignment" BEFORE INSERT OR UPDATE OF "assignment_id", "driver_id", "campaign_id", "group_id" ON "public"."delivery_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."validate_delivery_session_assignment"();



ALTER TABLE ONLY "public"."admin_coverage_corrections"
    ADD CONSTRAINT "admin_coverage_corrections_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."operational_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_reports"
    ADD CONSTRAINT "ai_reports_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_reports"
    ADD CONSTRAINT "ai_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_reports"
    ADD CONSTRAINT "ai_reports_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."campaign_zones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_territorial_chat_cache"
    ADD CONSTRAINT "ai_territorial_chat_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_territory_summaries"
    ADD CONSTRAINT "ai_territory_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assigned_zones"
    ADD CONSTRAINT "assigned_zones_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."operational_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignment_event_log"
    ADD CONSTRAINT "assignment_event_log_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."operator_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_event_log"
    ADD CONSTRAINT "assignment_event_log_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_event_log"
    ADD CONSTRAINT "assignment_event_log_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."operator_profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campagne"
    ADD CONSTRAINT "campagne_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clienti"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_admin_action_log"
    ADD CONSTRAINT "campaign_admin_action_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_admin_action_log"
    ADD CONSTRAINT "campaign_admin_action_log_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_analysis"
    ADD CONSTRAINT "campaign_analysis_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_analysis"
    ADD CONSTRAINT "campaign_analysis_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."campaign_zones"("id");



ALTER TABLE ONLY "public"."campaign_assets"
    ADD CONSTRAINT "campaign_assets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_assets"
    ADD CONSTRAINT "campaign_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_coverage_adjustments"
    ADD CONSTRAINT "campaign_coverage_adjustments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_coverage_adjustments"
    ADD CONSTRAINT "campaign_coverage_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."campaign_coverage_adjustments_log"
    ADD CONSTRAINT "campaign_coverage_adjustments_log_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "public"."campaign_coverage_adjustments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_coverage_adjustments_log"
    ADD CONSTRAINT "campaign_coverage_adjustments_log_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_coverage_adjustments_log"
    ADD CONSTRAINT "campaign_coverage_adjustments_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_coverage_adjustments"
    ADD CONSTRAINT "campaign_coverage_adjustments_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_coverage_adjustments"
    ADD CONSTRAINT "campaign_coverage_adjustments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_coverage_adjustments"
    ADD CONSTRAINT "campaign_coverage_adjustments_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."campaign_zones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_pois"
    ADD CONSTRAINT "campaign_pois_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_pois"
    ADD CONSTRAINT "campaign_pois_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."campaign_zones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_zone_progress"
    ADD CONSTRAINT "campaign_zone_progress_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_zone_progress_history"
    ADD CONSTRAINT "campaign_zone_progress_history_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_zone_progress_history"
    ADD CONSTRAINT "campaign_zone_progress_history_campaign_zone_id_fkey" FOREIGN KEY ("campaign_zone_id") REFERENCES "public"."campaign_zones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_zone_progress_history"
    ADD CONSTRAINT "campaign_zone_progress_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_zone_progress_history"
    ADD CONSTRAINT "campaign_zone_progress_history_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "public"."campaign_zone_progress"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_zone_progress"
    ADD CONSTRAINT "campaign_zone_progress_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_zone_progress"
    ADD CONSTRAINT "campaign_zone_progress_zone_fkey" FOREIGN KEY ("campaign_zone_id") REFERENCES "public"."campaign_zones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_zone_snapshots"
    ADD CONSTRAINT "campaign_zone_snapshots_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_zone_snapshots"
    ADD CONSTRAINT "campaign_zone_snapshots_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."campaign_zones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_zones"
    ADD CONSTRAINT "campaign_zones_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_zones"
    ADD CONSTRAINT "campaign_zones_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."operational_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."clienti"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."clienti_referenti"
    ADD CONSTRAINT "clienti_referenti_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clienti"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_session_coverage"
    ADD CONSTRAINT "delivery_session_coverage_campaign_zone_id_fkey" FOREIGN KEY ("campaign_zone_id") REFERENCES "public"."campaign_zones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_session_coverage"
    ADD CONSTRAINT "delivery_session_coverage_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."delivery_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_sessions"
    ADD CONSTRAINT "delivery_sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."operator_assignments"("id");



ALTER TABLE ONLY "public"."delivery_sessions"
    ADD CONSTRAINT "delivery_sessions_campaign_zone_id_fkey" FOREIGN KEY ("campaign_zone_id") REFERENCES "public"."campaign_zones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_sessions"
    ADD CONSTRAINT "delivery_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."operational_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gps_tracking_points"
    ADD CONSTRAINT "gps_tracking_points_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."delivery_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_groups"
    ADD CONSTRAINT "operational_groups_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."operator_assignment_zones"
    ADD CONSTRAINT "operator_assignment_zones_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."operator_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operator_assignment_zones"
    ADD CONSTRAINT "operator_assignment_zones_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."campaign_zones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operator_assignments"
    ADD CONSTRAINT "operator_assignments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."operator_assignments"
    ADD CONSTRAINT "operator_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."operator_assignments"
    ADD CONSTRAINT "operator_assignments_group_campaign_fkey" FOREIGN KEY ("group_id", "campaign_id") REFERENCES "public"."operational_groups"("id", "campaign_id");



ALTER TABLE ONLY "public"."operator_assignments"
    ADD CONSTRAINT "operator_assignments_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."operator_profiles"("user_id");



ALTER TABLE ONLY "public"."operator_profiles"
    ADD CONSTRAINT "operator_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proof_photos"
    ADD CONSTRAINT "proof_photos_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."delivery_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quote_requests"
    ADD CONSTRAINT "quote_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."smart_pairing_waitlist"
    ADD CONSTRAINT "smart_pairing_waitlist_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clienti"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tracking_gps"
    ADD CONSTRAINT "tracking_gps_campagna_id_fkey" FOREIGN KEY ("campagna_id") REFERENCES "public"."campagne"("id") ON DELETE CASCADE;



CREATE POLICY "Allow public read demographic indicators" ON "public"."demographic_indicators" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public insert poi_cache" ON "public"."poi_cache" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public read" ON "public"."map_sectors" FOR SELECT USING (true);



CREATE POLICY "Public read istat" ON "public"."istat_census_sections" FOR SELECT USING (true);



CREATE POLICY "Public read poi_cache" ON "public"."poi_cache" FOR SELECT USING (true);



CREATE POLICY "Public read slots" ON "public"."smart_pairing_slots" FOR SELECT USING (true);



CREATE POLICY "Public update poi_cache" ON "public"."poi_cache" FOR UPDATE USING (true);



CREATE POLICY "Service role all" ON "public"."smart_pairing_slots" USING (true) WITH CHECK (true);



CREATE POLICY "Service upsert istat" ON "public"."istat_census_sections" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users can only insert their own territorial chat cache" ON "public"."ai_territorial_chat_cache" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can only see their own territorial chat cache" ON "public"."ai_territorial_chat_cache" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."address_points" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "address_points_read_public" ON "public"."address_points" FOR SELECT USING (true);



ALTER TABLE "public"."admin_coverage_corrections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_coverage_corrections_admin_all" ON "public"."admin_coverage_corrections" TO "authenticated" USING ("public"."gps_is_admin"()) WITH CHECK ("public"."gps_is_admin"());



CREATE POLICY "admin_coverage_corrections_select_authorized" ON "public"."admin_coverage_corrections" FOR SELECT TO "authenticated" USING (("public"."gps_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "admin_coverage_corrections"."campaign_id") AND ("c"."user_id" = "auth"."uid"()))))));



CREATE POLICY "admin_select_assignment_event_log" ON "public"."assignment_event_log" FOR SELECT TO "authenticated" USING ("public"."gps_is_admin"());



ALTER TABLE "public"."ai_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_reports_own_insert" ON "public"."ai_reports" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "ai_reports"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "ai_reports_own_select" ON "public"."ai_reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "ai_reports"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."ai_territorial_chat_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_territory_summaries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_territory_summaries_own_insert" ON "public"."ai_territory_summaries" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "ai_territory_summaries_own_select" ON "public"."ai_territory_summaries" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."assigned_zones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assigned_zones_admin_all" ON "public"."assigned_zones" TO "authenticated" USING ("public"."gps_is_admin"()) WITH CHECK ("public"."gps_is_admin"());



CREATE POLICY "assigned_zones_select_authorized" ON "public"."assigned_zones" FOR SELECT TO "authenticated" USING (("public"."gps_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "assigned_zones"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."operator_assignments" "a"
  WHERE (("a"."campaign_id" = "assigned_zones"."campaign_id") AND ("a"."group_id" = "assigned_zones"."group_id") AND ("a"."operator_id" = "auth"."uid"()))))));



ALTER TABLE "public"."assignment_event_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_select_admin" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."availability_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campagne" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campagne_own" ON "public"."campagne" USING (("cliente_id" IN ( SELECT "clienti"."id"
   FROM "public"."clienti"
  WHERE ("clienti"."email" = ("auth"."jwt"() ->> 'email'::"text")))));



ALTER TABLE "public"."campaign_admin_action_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_admin_action_log_select_admin" ON "public"."campaign_admin_action_log" FOR SELECT TO "authenticated" USING ("public"."gps_is_admin"());



ALTER TABLE "public"."campaign_analysis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_analysis_own_insert" ON "public"."campaign_analysis" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_analysis"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "campaign_analysis_own_select" ON "public"."campaign_analysis" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_analysis"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."campaign_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_assets_own_insert" ON "public"."campaign_assets" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_assets"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "campaign_assets_own_select" ON "public"."campaign_assets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_assets"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."campaign_coverage_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_coverage_adjustments_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_coverage_adjustments_log_select_admin" ON "public"."campaign_coverage_adjustments_log" FOR SELECT TO "authenticated" USING ("public"."gps_is_admin"());



CREATE POLICY "campaign_coverage_adjustments_select_admin" ON "public"."campaign_coverage_adjustments" FOR SELECT TO "authenticated" USING ("public"."gps_is_admin"());



CREATE POLICY "campaign_coverage_adjustments_select_customer" ON "public"."campaign_coverage_adjustments" FOR SELECT TO "authenticated" USING ((("revoked_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_coverage_adjustments"."campaign_id") AND ("c"."user_id" = "auth"."uid"()))))));



CREATE POLICY "campaign_coverage_adjustments_select_driver" ON "public"."campaign_coverage_adjustments" FOR SELECT TO "authenticated" USING ((("revoked_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."operator_assignments" "a"
  WHERE (("a"."campaign_id" = "campaign_coverage_adjustments"."campaign_id") AND ("a"."operator_id" = "auth"."uid"()) AND ("a"."status" = 'active'::"text") AND ("a"."revoked_at" IS NULL))))));



ALTER TABLE "public"."campaign_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_events_own_insert" ON "public"."campaign_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_events"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "campaign_events_own_select" ON "public"."campaign_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_events"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."campaign_pois" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_pois_own_insert" ON "public"."campaign_pois" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_pois"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "campaign_pois_own_select" ON "public"."campaign_pois" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_pois"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "campaign_pois_own_update" ON "public"."campaign_pois" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_pois"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."campaign_zone_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_zone_progress_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_zone_progress_history_select_admin" ON "public"."campaign_zone_progress_history" FOR SELECT TO "authenticated" USING ("public"."gps_is_admin"());



CREATE POLICY "campaign_zone_progress_select_admin" ON "public"."campaign_zone_progress" FOR SELECT TO "authenticated" USING ("public"."gps_is_admin"());



CREATE POLICY "campaign_zone_progress_select_customer" ON "public"."campaign_zone_progress" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_zone_progress"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."campaign_zone_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_zone_snapshots_insert" ON "public"."campaign_zone_snapshots" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_zone_snapshots"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "campaign_zone_snapshots_select" ON "public"."campaign_zone_snapshots" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_zone_snapshots"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."campaign_zones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_zones_admin_select" ON "public"."campaign_zones" FOR SELECT TO "authenticated" USING (( SELECT "public"."gps_is_admin"() AS "gps_is_admin"));



CREATE POLICY "campaign_zones_admin_update" ON "public"."campaign_zones" FOR UPDATE TO "authenticated" USING (( SELECT "public"."gps_is_admin"() AS "gps_is_admin")) WITH CHECK (( SELECT "public"."gps_is_admin"() AS "gps_is_admin"));



CREATE POLICY "campaign_zones_own_insert" ON "public"."campaign_zones" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_zones"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "campaign_zones_own_select" ON "public"."campaign_zones" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_zones"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "campaign_zones_own_update" ON "public"."campaign_zones" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "campaign_zones"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaigns_admin_all" ON "public"."campaigns" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "campaigns_own_insert" ON "public"."campaigns" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "campaigns_own_select" ON "public"."campaigns" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "campaigns_own_update" ON "public"."campaigns" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."clienti" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clienti_admin_all" ON "public"."clienti" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "clienti_own" ON "public"."clienti" USING (("email" = ("auth"."jwt"() ->> 'email'::"text")));



ALTER TABLE "public"."clienti_referenti" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clienti_referenti_admin_all" ON "public"."clienti_referenti" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."dbgt_accesso_esterno" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dbgt_accesso_numero_civico" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dbgt_import_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dbgt_limiti_comunali" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dbgt_numero_civico" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dbgt_toponimo_nome" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dbgt_toponimo_stradale" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_session_coverage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_session_coverage_select_policy" ON "public"."delivery_session_coverage" FOR SELECT USING (("public"."jwt_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."delivery_sessions" "s"
  WHERE (("s"."id" = "delivery_session_coverage"."session_id") AND ("s"."driver_id" = "auth"."uid"()))))));



ALTER TABLE "public"."delivery_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_sessions_insert_driver" ON "public"."delivery_sessions" FOR INSERT TO "authenticated" WITH CHECK ((("driver_id" = "auth"."uid"()) AND ("assignment_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."operator_assignments" "a"
  WHERE (("a"."id" = "delivery_sessions"."assignment_id") AND ("a"."operator_id" = "auth"."uid"()) AND ("a"."campaign_id" = "delivery_sessions"."campaign_id") AND ("a"."status" = 'active'::"text") AND (("a"."starts_at" IS NULL) OR ("a"."starts_at" <= "now"())) AND (("a"."ends_at" IS NULL) OR ("a"."ends_at" > "now"())))))));



CREATE POLICY "delivery_sessions_select_authorized" ON "public"."delivery_sessions" FOR SELECT TO "authenticated" USING (("public"."gps_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "delivery_sessions"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))) OR (("driver_id" = "auth"."uid"()) AND ("assignment_id" IS NOT NULL) AND "public"."gps_assignment_is_valid"("assignment_id", "driver_id", "campaign_id", "group_id", "now"()))));



CREATE POLICY "delivery_sessions_select_policy" ON "public"."delivery_sessions" FOR SELECT TO "authenticated" USING (("public"."jwt_is_admin"() OR ("driver_id" = "auth"."uid"()) OR "public"."current_user_owns_campaign"("campaign_id")));



CREATE POLICY "delivery_sessions_update_driver" ON "public"."delivery_sessions" FOR UPDATE TO "authenticated" USING (("public"."jwt_is_admin"() OR ("driver_id" = "auth"."uid"()))) WITH CHECK (("public"."jwt_is_admin"() OR (("driver_id" = "auth"."uid"()) AND ("assignment_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."operator_assignments" "a"
  WHERE (("a"."id" = "delivery_sessions"."assignment_id") AND ("a"."operator_id" = "auth"."uid"()) AND ("a"."campaign_id" = "delivery_sessions"."campaign_id") AND ("a"."status" = 'active'::"text") AND (("a"."starts_at" IS NULL) OR ("a"."starts_at" <= "now"())) AND (("a"."ends_at" IS NULL) OR ("a"."ends_at" > "now"()))))))));



ALTER TABLE "public"."demographic_indicators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documenti" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documenti_admin_all" ON "public"."documenti" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "driver_select_own_assignment_event_log" ON "public"."assignment_event_log" FOR SELECT TO "authenticated" USING (("operator_id" = "auth"."uid"()));



ALTER TABLE "public"."economic_indicators" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "economic_indicators_read_public" ON "public"."economic_indicators" FOR SELECT USING (true);



ALTER TABLE "public"."geo_municipalities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."geo_nil_milano" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "geo_nil_milano_read_public" ON "public"."geo_nil_milano" FOR SELECT USING (true);



ALTER TABLE "public"."geo_postal_areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gps_operator_audit_admin_select" ON "public"."gps_operator_audit_log" FOR SELECT TO "authenticated" USING ("public"."gps_is_admin"());



ALTER TABLE "public"."gps_operator_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gps_tracking_points" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gps_tracking_points_insert_driver" ON "public"."gps_tracking_points" FOR INSERT TO "authenticated" WITH CHECK ((("driver_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."delivery_sessions" "s"
     JOIN "public"."operator_assignments" "a" ON (("a"."id" = "s"."assignment_id")))
  WHERE (("s"."id" = "gps_tracking_points"."session_id") AND ("s"."campaign_id" = "gps_tracking_points"."campaign_id") AND ("s"."driver_id" = "auth"."uid"()) AND ("s"."status" = ANY (ARRAY['started'::"text", 'paused'::"text"])) AND ("a"."operator_id" = "auth"."uid"()) AND ("a"."campaign_id" = "gps_tracking_points"."campaign_id") AND ("a"."status" = 'active'::"text") AND (("a"."starts_at" IS NULL) OR ("a"."starts_at" <= "now"())) AND (("a"."ends_at" IS NULL) OR ("a"."ends_at" > "now"())))))));



CREATE POLICY "gps_tracking_points_select_authorized" ON "public"."gps_tracking_points" FOR SELECT TO "authenticated" USING (("public"."gps_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "gps_tracking_points"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."delivery_sessions" "s"
  WHERE (("s"."id" = "gps_tracking_points"."session_id") AND ("s"."campaign_id" = "gps_tracking_points"."campaign_id") AND ("s"."driver_id" = "auth"."uid"()) AND ("s"."assignment_id" IS NOT NULL) AND "public"."gps_assignment_is_valid"("s"."assignment_id", "s"."driver_id", "s"."campaign_id", "s"."group_id", "now"()))))));



CREATE POLICY "gps_tracking_points_select_policy" ON "public"."gps_tracking_points" FOR SELECT TO "authenticated" USING (("public"."jwt_is_admin"() OR ("driver_id" = "auth"."uid"()) OR "public"."current_user_owns_campaign"("campaign_id")));



ALTER TABLE "public"."gtfs_routes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gtfs_routes_read_public" ON "public"."gtfs_routes" FOR SELECT USING (true);



ALTER TABLE "public"."gtfs_stop_times" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gtfs_stop_times_read_public" ON "public"."gtfs_stop_times" FOR SELECT USING (true);



ALTER TABLE "public"."gtfs_stops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gtfs_stops_read_public" ON "public"."gtfs_stops" FOR SELECT USING (true);



ALTER TABLE "public"."impostazioni" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "impostazioni_admin_all" ON "public"."impostazioni" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."istat_census_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."map_sectors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "oaz_admin_all" ON "public"."operator_assignment_zones" USING ("public"."jwt_is_admin"()) WITH CHECK ("public"."jwt_is_admin"());



CREATE POLICY "oaz_operator_read_own" ON "public"."operator_assignment_zones" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."operator_assignments" "oa"
  WHERE (("oa"."id" = "operator_assignment_zones"."assignment_id") AND ("oa"."operator_id" = "auth"."uid"())))));



ALTER TABLE "public"."omi_zones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "omi_zones_read_public" ON "public"."omi_zones" FOR SELECT USING (true);



ALTER TABLE "public"."operational_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operational_groups_admin_all" ON "public"."operational_groups" TO "authenticated" USING ("public"."gps_is_admin"()) WITH CHECK ("public"."gps_is_admin"());



CREATE POLICY "operational_groups_select_authorized" ON "public"."operational_groups" FOR SELECT TO "authenticated" USING (("public"."gps_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "operational_groups"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."operator_assignments" "a"
  WHERE (("a"."group_id" = "operational_groups"."id") AND ("a"."operator_id" = "auth"."uid"()))))));



ALTER TABLE "public"."operator_assignment_zones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operator_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operator_assignments_admin_all" ON "public"."operator_assignments" TO "authenticated" USING ("public"."gps_is_admin"()) WITH CHECK ("public"."gps_is_admin"());



CREATE POLICY "operator_assignments_delete_admin" ON "public"."operator_assignments" FOR DELETE TO "authenticated" USING ("public"."jwt_is_admin"());



CREATE POLICY "operator_assignments_insert_admin" ON "public"."operator_assignments" FOR INSERT TO "authenticated" WITH CHECK ("public"."jwt_is_admin"());



CREATE POLICY "operator_assignments_own_select" ON "public"."operator_assignments" FOR SELECT TO "authenticated" USING (("operator_id" = "auth"."uid"()));



CREATE POLICY "operator_assignments_select_policy" ON "public"."operator_assignments" FOR SELECT TO "authenticated" USING (("public"."jwt_is_admin"() OR ("operator_id" = "auth"."uid"())));



CREATE POLICY "operator_assignments_update_admin" ON "public"."operator_assignments" FOR UPDATE TO "authenticated" USING ("public"."jwt_is_admin"()) WITH CHECK ("public"."jwt_is_admin"());



ALTER TABLE "public"."operator_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operator_profiles_admin_all" ON "public"."operator_profiles" TO "authenticated" USING ("public"."gps_is_admin"()) WITH CHECK ("public"."gps_is_admin"());



CREATE POLICY "operator_profiles_own_select" ON "public"."operator_profiles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."poi_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "poi_cache_read_public" ON "public"."poi_cache" FOR SELECT USING (true);



ALTER TABLE "public"."poi_search_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "poi_search_logs_service_role_only" ON "public"."poi_search_logs" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_own_insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_own_select" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_own_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."proof_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "proof_photos_insert_authorized" ON "public"."proof_photos" FOR INSERT TO "authenticated" WITH CHECK (("public"."gps_is_admin"() OR (("driver_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."delivery_sessions" "s"
  WHERE (("s"."id" = "proof_photos"."session_id") AND ("s"."campaign_id" = "proof_photos"."campaign_id") AND ("s"."driver_id" = "auth"."uid"()) AND ("s"."assignment_id" IS NOT NULL) AND "public"."gps_assignment_is_valid"("s"."assignment_id", "s"."driver_id", "s"."campaign_id", "s"."group_id", "now"())))))));



CREATE POLICY "proof_photos_insert_driver" ON "public"."proof_photos" FOR INSERT TO "authenticated" WITH CHECK ((("driver_id" = "auth"."uid"()) AND ("session_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."delivery_sessions" "s"
     JOIN "public"."operator_assignments" "a" ON (("a"."id" = "s"."assignment_id")))
  WHERE (("s"."id" = "proof_photos"."session_id") AND ("s"."campaign_id" = "proof_photos"."campaign_id") AND ("s"."driver_id" = "auth"."uid"()) AND ("s"."status" = ANY (ARRAY['started'::"text", 'paused'::"text"])) AND ("a"."operator_id" = "auth"."uid"()) AND ("a"."campaign_id" = "proof_photos"."campaign_id") AND ("a"."status" = 'active'::"text") AND (("a"."starts_at" IS NULL) OR ("a"."starts_at" <= "now"())) AND (("a"."ends_at" IS NULL) OR ("a"."ends_at" > "now"())))))));



CREATE POLICY "proof_photos_select_authorized" ON "public"."proof_photos" FOR SELECT TO "authenticated" USING (("public"."gps_is_admin"() OR (("approved_at" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "proof_photos"."campaign_id") AND ("c"."user_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."delivery_sessions" "s"
  WHERE (("s"."id" = "proof_photos"."session_id") AND ("s"."campaign_id" = "proof_photos"."campaign_id") AND ("s"."driver_id" = "auth"."uid"()) AND ("s"."assignment_id" IS NOT NULL) AND "public"."gps_assignment_is_valid"("s"."assignment_id", "s"."driver_id", "s"."campaign_id", "s"."group_id", "now"()))))));



CREATE POLICY "proof_photos_select_policy" ON "public"."proof_photos" FOR SELECT TO "authenticated" USING (("public"."jwt_is_admin"() OR ("driver_id" = "auth"."uid"()) OR "public"."current_user_owns_campaign"("campaign_id")));



ALTER TABLE "public"."quote_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quote_requests_admin_all" ON "public"."quote_requests" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."quotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotes_own_insert" ON "public"."quotes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "quotes"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "quotes_own_select" ON "public"."quotes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "quotes"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "quotes_own_update" ON "public"."quotes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "quotes"."campaign_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."smart_pairing_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."smart_pairing_waitlist" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "smart_pairing_waitlist_insert_anon" ON "public"."smart_pairing_waitlist" FOR INSERT TO "anon" WITH CHECK ((("cliente_id" IS NULL) AND ("nome" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "nome")) >= 2) AND ("email" IS NOT NULL) AND (POSITION(('@'::"text") IN ("email")) > 1) AND ("gestita" = false)));



CREATE POLICY "smart_pairing_waitlist_insert_authenticated" ON "public"."smart_pairing_waitlist" FOR INSERT TO "authenticated" WITH CHECK ((("nome" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "nome")) >= 2) AND ("email" IS NOT NULL) AND (POSITION(('@'::"text") IN ("email")) > 1) AND ("gestita" = false) AND (("cliente_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."clienti"
  WHERE (("clienti"."id" = "smart_pairing_waitlist"."cliente_id") AND ("clienti"."email" = ("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."territorial_profile_indicators" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "territorial_profile_indicators_select_anon" ON "public"."territorial_profile_indicators" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."tracking_gps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tracking_own" ON "public"."tracking_gps" FOR SELECT USING (("campagna_id" IN ( SELECT "c"."id"
   FROM ("public"."campagne" "c"
     JOIN "public"."clienti" "cl" ON (("cl"."id" = "c"."cliente_id")))
  WHERE ("cl"."email" = ("auth"."jwt"() ->> 'email'::"text")))));



ALTER TABLE "public"."transport_routes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transport_routes_read_public" ON "public"."transport_routes" FOR SELECT USING (true);



ALTER TABLE "public"."transport_stop_routes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transport_stop_routes_read_public" ON "public"."transport_stop_routes" FOR SELECT USING (true);



ALTER TABLE "public"."transport_stops" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transport_stops_read_public" ON "public"."transport_stops" FOR SELECT USING (true);



CREATE POLICY "waitlist_own" ON "public"."smart_pairing_waitlist" FOR SELECT USING (("email" = ("auth"."jwt"() ->> 'email'::"text")));



ALTER TABLE "public"."zone_admin" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zone_public_read" ON "public"."zone_admin" FOR SELECT USING (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_archive_campaign"("p_campaign_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_archive_campaign"("p_campaign_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_archive_campaign"("p_campaign_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_cancel_campaign"("p_campaign_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_cancel_campaign"("p_campaign_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_cancel_campaign"("p_campaign_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON TABLE "public"."campaign_zone_progress" TO "service_role";
GRANT SELECT ON TABLE "public"."campaign_zone_progress" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_clear_zone_manual_progress"("p_campaign_zone_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_clear_zone_manual_progress"("p_campaign_zone_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_clear_zone_manual_progress"("p_campaign_zone_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON TABLE "public"."campaign_coverage_adjustments" TO "service_role";
GRANT SELECT ON TABLE "public"."campaign_coverage_adjustments" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_create_coverage_adjustment"("p_campaign_id" "uuid", "p_zone_id" "uuid", "p_adjustment_type" "text", "p_geometry_geojson" "jsonb", "p_reason" "text", "p_notes" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_coverage_adjustment"("p_campaign_id" "uuid", "p_zone_id" "uuid", "p_adjustment_type" "text", "p_geometry_geojson" "jsonb", "p_reason" "text", "p_notes" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_coverage_adjustment"("p_campaign_id" "uuid", "p_zone_id" "uuid", "p_adjustment_type" "text", "p_geometry_geojson" "jsonb", "p_reason" "text", "p_notes" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."operator_assignments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."operator_assignments" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_create_operator_assignment"("p_campaign_id" "uuid", "p_operator_id" "uuid", "p_group_id" "uuid", "p_zone_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_metadata" "jsonb", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_operator_assignment"("p_campaign_id" "uuid", "p_operator_id" "uuid", "p_group_id" "uuid", "p_zone_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_metadata" "jsonb", "p_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_create_operator_assignment"("p_campaign_id" "uuid", "p_operator_id" "uuid", "p_group_id" "uuid", "p_zone_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_metadata" "jsonb", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_daily_report_telemetry"("p_session_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_daily_report_telemetry"("p_session_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_daily_report_telemetry"("p_session_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_hard_delete_campaign"("p_campaign_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_hard_delete_campaign"("p_campaign_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_hard_delete_campaign"("p_campaign_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_campaign_assignments"("p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_campaign_assignments"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_campaign_assignments"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_campaign_assignments"("p_campaign_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_operators"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_operators"() TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_list_operators"() TO "authenticated";



GRANT ALL ON TABLE "public"."campaign_admin_action_log" TO "service_role";
GRANT SELECT ON TABLE "public"."campaign_admin_action_log" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_log_campaign_action"("p_campaign_id" "uuid", "p_action" "text", "p_previous_state" "text", "p_new_state" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_log_campaign_action"("p_campaign_id" "uuid", "p_action" "text", "p_previous_state" "text", "p_new_state" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_reopen_campaign"("p_campaign_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_reopen_campaign"("p_campaign_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_reopen_campaign"("p_campaign_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON TABLE "public"."assignment_event_log" TO "anon";
GRANT ALL ON TABLE "public"."assignment_event_log" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_event_log" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_revoke_assignment_program"("p_assignment_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_revoke_assignment_program"("p_assignment_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_revoke_assignment_program"("p_assignment_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_revoke_coverage_adjustment"("p_adjustment_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_revoke_coverage_adjustment"("p_adjustment_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_revoke_coverage_adjustment"("p_adjustment_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_revoke_operator_assignment"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_revoke_operator_assignment"("p_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_revoke_operator_assignment"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_revoke_payment_confirmation"("p_campaign_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_revoke_payment_confirmation"("p_campaign_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_revoke_payment_confirmation"("p_campaign_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON TABLE "public"."operator_assignment_zones" TO "authenticated";
GRANT ALL ON TABLE "public"."operator_assignment_zones" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_assignment_zones"("p_assignment_id" "uuid", "p_zones" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_assignment_zones"("p_assignment_id" "uuid", "p_zones" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_set_assignment_zones"("p_assignment_id" "uuid", "p_zones" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_set_zone_manual_progress"("p_campaign_zone_id" "uuid", "p_adjustment_type" "text", "p_manual_percent" numeric, "p_inaccessible_percent" numeric, "p_reason" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_zone_manual_progress"("p_campaign_zone_id" "uuid", "p_adjustment_type" "text", "p_manual_percent" numeric, "p_inaccessible_percent" numeric, "p_reason" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_zone_manual_progress"("p_campaign_zone_id" "uuid", "p_adjustment_type" "text", "p_manual_percent" numeric, "p_inaccessible_percent" numeric, "p_reason" "text", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_coverage_adjustment"("p_adjustment_id" "uuid", "p_adjustment_type" "text", "p_geometry_geojson" "jsonb", "p_reason" "text", "p_notes" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_coverage_adjustment"("p_adjustment_id" "uuid", "p_adjustment_type" "text", "p_geometry_geojson" "jsonb", "p_reason" "text", "p_notes" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_coverage_adjustment"("p_adjustment_id" "uuid", "p_adjustment_type" "text", "p_geometry_geojson" "jsonb", "p_reason" "text", "p_notes" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_operator_assignment"("p_id" "uuid", "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_operator_assignment"("p_id" "uuid", "p_patch" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_update_operator_assignment"("p_id" "uuid", "p_patch" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."calculate_campaign_final_coverage"("p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_campaign_final_coverage"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_campaign_final_coverage"("p_campaign_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_zone_final_coverage"("p_campaign_zone_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_zone_final_coverage"("p_campaign_zone_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_zone_final_coverage"("p_campaign_zone_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."campaign_coverage_adjustments_sync_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."campaign_coverage_adjustments_sync_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."campaign_coverage_adjustments_sync_trigger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_public_campaign"("p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_public_campaign"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_public_campaign"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."classify_building"() TO "anon";
GRANT ALL ON FUNCTION "public"."classify_building"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."classify_building"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_owns_campaign"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_owns_campaign"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_owns_campaign"("p_campaign_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."final_distribution_report_telemetry"("p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."final_distribution_report_telemetry"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."final_distribution_report_telemetry"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."genera_causale"() TO "anon";
GRANT ALL ON FUNCTION "public"."genera_causale"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."genera_causale"() TO "service_role";



GRANT ALL ON FUNCTION "public"."genera_causale_bonifico"() TO "anon";
GRANT ALL ON FUNCTION "public"."genera_causale_bonifico"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."genera_causale_bonifico"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_active_driver_session"("p_assignment_id" "uuid", "p_access_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_active_driver_session"("p_assignment_id" "uuid", "p_access_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_driver_session"("p_assignment_id" "uuid", "p_access_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_driver_session"("p_assignment_id" "uuid", "p_access_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_address_points_bbox"("p_lat_min" double precision, "p_lat_max" double precision, "p_lng_min" double precision, "p_lng_max" double precision, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_address_points_bbox"("p_lat_min" double precision, "p_lat_max" double precision, "p_lng_min" double precision, "p_lng_max" double precision, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_address_points_bbox"("p_lat_min" double precision, "p_lat_max" double precision, "p_lng_min" double precision, "p_lng_max" double precision, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_address_points_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_address_points_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_address_points_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_address_points_osm_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "max_rows" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_address_points_osm_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "max_rows" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_address_points_osm_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "max_rows" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_address_points_radius_summary"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "max_rows" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_address_points_radius_summary"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "max_rows" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_address_points_radius_summary"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "max_rows" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_aggregates_in_radius"("center_lat" numeric, "center_lng" numeric, "radius_km" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_aggregates_in_radius"("center_lat" numeric, "center_lng" numeric, "radius_km" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_aggregates_in_radius"("center_lat" numeric, "center_lng" numeric, "radius_km" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_building_distribution_in_radius"("p_center_lat" numeric, "p_center_lng" numeric, "p_radius_km" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_building_distribution_in_radius"("p_center_lat" numeric, "p_center_lng" numeric, "p_radius_km" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_building_distribution_in_radius"("p_center_lat" numeric, "p_center_lng" numeric, "p_radius_km" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_campaign_coverage_adjustments"("p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_campaign_coverage_adjustments"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campaign_coverage_adjustments"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_campaign_kpis"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_campaign_kpis"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campaign_kpis"("p_campaign_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_campaign_zone_progress"("p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_campaign_zone_progress"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campaign_zone_progress"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_comuni_breakdown_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_comuni_breakdown_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_comuni_breakdown_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_demographics_in_radius"("p_center_lat" numeric, "p_center_lng" numeric, "p_radius_km" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_demographics_in_radius"("p_center_lat" numeric, "p_center_lng" numeric, "p_radius_km" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_demographics_in_radius"("p_center_lat" numeric, "p_center_lng" numeric, "p_radius_km" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_driver_assignment"("p_assignment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_driver_assignment"("p_assignment_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_driver_assignment"("p_assignment_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_gtfs_stops_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_gtfs_stops_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_gtfs_stops_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision, "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_map_sectors"("p_service_type" "text", "p_center_lat" double precision, "p_center_lng" double precision, "p_radius_km" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_map_sectors"("p_service_type" "text", "p_center_lat" double precision, "p_center_lng" double precision, "p_radius_km" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_map_sectors"("p_service_type" "text", "p_center_lat" double precision, "p_center_lng" double precision, "p_radius_km" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_map_sectors"("p_service_type" "text", "p_center_lat" double precision, "p_center_lng" double precision, "p_radius_km" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_nil_breakdown_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_nil_breakdown_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_nil_breakdown_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_omi_zones_by_municipality"("p_municipality_name" "text", "p_municipality_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_omi_zones_by_municipality"("p_municipality_name" "text", "p_municipality_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_omi_zones_by_municipality"("p_municipality_name" "text", "p_municipality_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_omi_zones_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_omi_zones_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_omi_zones_in_radius"("p_lat" double precision, "p_lng" double precision, "p_radius_km" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_omi_zones_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "target_year" integer, "target_semester" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_omi_zones_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "target_year" integer, "target_semester" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_omi_zones_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision, "target_year" integer, "target_semester" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_postal_areas_analysis"("postal_codes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_postal_areas_analysis"("postal_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_postal_areas_analysis"("postal_codes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_driver_assignment"("p_assignment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_driver_assignment"("p_assignment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_driver_assignment"("p_assignment_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_driver_assignment"("p_assignment_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_sections_in_radius"("center_lat" numeric, "center_lng" numeric, "radius_km" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_sections_in_radius"("center_lat" numeric, "center_lng" numeric, "radius_km" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sections_in_radius"("center_lat" numeric, "center_lng" numeric, "radius_km" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_transport_stops_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_transport_stops_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_transport_stops_in_radius"("center_lat" double precision, "center_lng" double precision, "radius_km" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."gps_assignment_is_valid"("p_assignment_id" "uuid", "p_operator_id" "uuid", "p_campaign_id" "uuid", "p_group_id" "uuid", "p_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gps_assignment_is_valid"("p_assignment_id" "uuid", "p_operator_id" "uuid", "p_campaign_id" "uuid", "p_group_id" "uuid", "p_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gps_assignment_is_valid"("p_assignment_id" "uuid", "p_operator_id" "uuid", "p_campaign_id" "uuid", "p_group_id" "uuid", "p_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."gps_calculate_zone_coverage"("p_session_id" "uuid", "p_buffer_meters" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."gps_calculate_zone_coverage"("p_session_id" "uuid", "p_buffer_meters" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gps_calculate_zone_coverage"("p_session_id" "uuid", "p_buffer_meters" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."gps_get_operator_campaign"("p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gps_get_operator_campaign"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gps_get_operator_campaign"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."delivery_sessions" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."delivery_sessions" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."gps_heartbeat_session"("p_session_id" "uuid", "p_access_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gps_heartbeat_session"("p_session_id" "uuid", "p_access_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."gps_heartbeat_session"("p_session_id" "uuid", "p_access_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gps_heartbeat_session"("p_session_id" "uuid", "p_access_token" "text") TO "service_role";



GRANT ALL ON TABLE "public"."gps_tracking_points" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."gps_tracking_points" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."gps_insert_point"("p_session_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_speed" double precision, "p_heading" double precision, "p_recorded_at" timestamp with time zone, "p_access_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gps_insert_point"("p_session_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_speed" double precision, "p_heading" double precision, "p_recorded_at" timestamp with time zone, "p_access_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."gps_insert_point"("p_session_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_speed" double precision, "p_heading" double precision, "p_recorded_at" timestamp with time zone, "p_access_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gps_insert_point"("p_session_id" "uuid", "p_lat" double precision, "p_lng" double precision, "p_accuracy" double precision, "p_speed" double precision, "p_heading" double precision, "p_recorded_at" timestamp with time zone, "p_access_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."gps_is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gps_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gps_is_admin"() TO "service_role";



GRANT ALL ON TABLE "public"."proof_photos" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."proof_photos" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."gps_register_proof_photo"("p_session_id" "uuid", "p_storage_path" "text", "p_lat" double precision, "p_lng" double precision, "p_note" "text", "p_taken_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gps_register_proof_photo"("p_session_id" "uuid", "p_storage_path" "text", "p_lat" double precision, "p_lng" double precision, "p_note" "text", "p_taken_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gps_register_proof_photo"("p_session_id" "uuid", "p_storage_path" "text", "p_lat" double precision, "p_lng" double precision, "p_note" "text", "p_taken_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."gps_start_session"("p_assignment_id" "uuid", "p_device_id" "text", "p_campaign_zone_id" "uuid", "p_access_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gps_start_session"("p_assignment_id" "uuid", "p_device_id" "text", "p_campaign_zone_id" "uuid", "p_access_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."gps_start_session"("p_assignment_id" "uuid", "p_device_id" "text", "p_campaign_zone_id" "uuid", "p_access_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gps_start_session"("p_assignment_id" "uuid", "p_device_id" "text", "p_campaign_zone_id" "uuid", "p_access_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."gps_transition_session"("p_session_id" "uuid", "p_action" "text", "p_access_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gps_transition_session"("p_session_id" "uuid", "p_action" "text", "p_access_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."gps_transition_session"("p_session_id" "uuid", "p_action" "text", "p_access_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gps_transition_session"("p_session_id" "uuid", "p_action" "text", "p_access_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."gps_transition_zone"("p_campaign_zone_id" "uuid", "p_action" "text", "p_access_token" "text", "p_assignment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gps_transition_zone"("p_campaign_zone_id" "uuid", "p_action" "text", "p_access_token" "text", "p_assignment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gps_transition_zone"("p_campaign_zone_id" "uuid", "p_action" "text", "p_access_token" "text", "p_assignment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gps_transition_zone"("p_campaign_zone_id" "uuid", "p_action" "text", "p_access_token" "text", "p_assignment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."jwt_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."jwt_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."jwt_is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_assignment_zones"("p_assignment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_assignment_zones"("p_assignment_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."list_assignment_zones"("p_assignment_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."log_assignment_event"("p_assignment_id" "uuid", "p_action" "text", "p_access_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_assignment_event"("p_assignment_id" "uuid", "p_action" "text", "p_access_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_assignment_event"("p_assignment_id" "uuid", "p_action" "text", "p_access_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_assignment_event"("p_assignment_id" "uuid", "p_action" "text", "p_access_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."materialize_dbgt_address_points"("p_province" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."protect_campaign_admin_action_log_snapshots"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_campaign_admin_action_log_snapshots"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_campaign_zone_progress_history_snapshots"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_campaign_zone_progress_history_snapshots"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_profile_authorization_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_profile_authorization_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_campaign_coverage_adjustment_zone_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_campaign_coverage_adjustment_zone_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_campaign_coverage_adjustment_zone_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_campaign_zone_progress_campaign_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_campaign_zone_progress_campaign_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_campaign_zone_progress_campaign_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_campaign_zone_progress_effective_percent_legacy"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_campaign_zone_progress_effective_percent_legacy"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_campaign_zone_progress_effective_percent_legacy"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_gps_tracking_point_geom"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_gps_tracking_point_geom"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_gps_tracking_point_geom"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_operator_security_audit_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_operator_security_audit_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_address_points_geom"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_address_points_geom"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_address_points_geom"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_campaign_zone_progress_cache"("p_campaign_zone_id" "uuid", "p_changed_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_campaign_zone_progress_cache"("p_campaign_zone_id" "uuid", "p_changed_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_gtfs_stop_geom"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_gtfs_stop_geom"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_gtfs_stop_geom"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_poi_cache_geom"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_poi_cache_geom"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_poi_cache_geom"() TO "service_role";



GRANT ALL ON FUNCTION "public"."territorial_dataset_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."territorial_dataset_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."territorial_dataset_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_address_points_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_address_points_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_address_points_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_transport_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_transport_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_transport_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_sp_slots_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_sp_slots_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sp_slots_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_address_points_batch"("rows" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."upsert_economic_indicators_batch"("rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_economic_indicators_batch"("rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_gtfs_routes_batch"("rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_gtfs_stop_times_batch"("rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_gtfs_stops_batch"("rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_gtfs_stops_batch"("rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_istat_territorial_batch"("rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_istat_territorial_batch"("rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_nil_milano"("p_nil_code" "text", "p_nil_name" "text", "p_geometry_geojson" "text", "p_source" "text", "p_source_url" "text", "p_valid_from" "date", "p_valid_to" "date") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."upsert_omi_zones_batch"("rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_omi_zones_batch"("rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_delivery_session_assignment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_delivery_session_assignment"() TO "service_role";



GRANT ALL ON TABLE "public"."address_points" TO "anon";
GRANT ALL ON TABLE "public"."address_points" TO "authenticated";
GRANT ALL ON TABLE "public"."address_points" TO "service_role";



GRANT ALL ON TABLE "public"."admin_coverage_corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_coverage_corrections" TO "service_role";



GRANT ALL ON TABLE "public"."ai_reports" TO "anon";
GRANT ALL ON TABLE "public"."ai_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_reports" TO "service_role";



GRANT ALL ON TABLE "public"."ai_territorial_chat_cache" TO "anon";
GRANT ALL ON TABLE "public"."ai_territorial_chat_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_territorial_chat_cache" TO "service_role";



GRANT ALL ON TABLE "public"."ai_territory_summaries" TO "anon";
GRANT ALL ON TABLE "public"."ai_territory_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_territory_summaries" TO "service_role";



GRANT ALL ON TABLE "public"."api_usage" TO "anon";
GRANT ALL ON TABLE "public"."api_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."api_usage" TO "service_role";



GRANT ALL ON SEQUENCE "public"."api_usage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."api_usage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."api_usage_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."assigned_zones" TO "authenticated";
GRANT ALL ON TABLE "public"."assigned_zones" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."audit_log" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."availability_slots" TO "anon";
GRANT ALL ON TABLE "public"."availability_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."availability_slots" TO "service_role";



GRANT ALL ON TABLE "public"."smart_pairing_slots" TO "anon";
GRANT ALL ON TABLE "public"."smart_pairing_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."smart_pairing_slots" TO "service_role";



GRANT ALL ON TABLE "public"."available_slots_with_pairing" TO "anon";
GRANT ALL ON TABLE "public"."available_slots_with_pairing" TO "authenticated";
GRANT ALL ON TABLE "public"."available_slots_with_pairing" TO "service_role";



GRANT ALL ON TABLE "public"."campagne" TO "anon";
GRANT ALL ON TABLE "public"."campagne" TO "authenticated";
GRANT ALL ON TABLE "public"."campagne" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_analysis" TO "anon";
GRANT ALL ON TABLE "public"."campaign_analysis" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_analysis" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_assets" TO "anon";
GRANT ALL ON TABLE "public"."campaign_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_assets" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_coverage_adjustments_log" TO "service_role";
GRANT SELECT ON TABLE "public"."campaign_coverage_adjustments_log" TO "authenticated";



GRANT ALL ON TABLE "public"."campaign_events" TO "anon";
GRANT ALL ON TABLE "public"."campaign_events" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_events" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_pois" TO "anon";
GRANT ALL ON TABLE "public"."campaign_pois" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_pois" TO "service_role";



GRANT ALL ON TABLE "public"."quotes" TO "anon";
GRANT ALL ON TABLE "public"."quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."quotes" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_summary" TO "anon";
GRANT ALL ON TABLE "public"."campaign_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_summary" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_zone_progress_history" TO "service_role";
GRANT SELECT ON TABLE "public"."campaign_zone_progress_history" TO "authenticated";



GRANT ALL ON TABLE "public"."campaign_zone_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."campaign_zone_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_zone_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_zones" TO "anon";
GRANT ALL ON TABLE "public"."campaign_zones" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_zones" TO "service_role";



GRANT ALL ON TABLE "public"."clienti" TO "anon";
GRANT ALL ON TABLE "public"."clienti" TO "authenticated";
GRANT ALL ON TABLE "public"."clienti" TO "service_role";



GRANT ALL ON TABLE "public"."clienti_referenti" TO "anon";
GRANT ALL ON TABLE "public"."clienti_referenti" TO "authenticated";
GRANT ALL ON TABLE "public"."clienti_referenti" TO "service_role";



GRANT ALL ON TABLE "public"."dbgt_accesso_esterno" TO "anon";
GRANT ALL ON TABLE "public"."dbgt_accesso_esterno" TO "authenticated";
GRANT ALL ON TABLE "public"."dbgt_accesso_esterno" TO "service_role";



GRANT ALL ON TABLE "public"."dbgt_accesso_numero_civico" TO "anon";
GRANT ALL ON TABLE "public"."dbgt_accesso_numero_civico" TO "authenticated";
GRANT ALL ON TABLE "public"."dbgt_accesso_numero_civico" TO "service_role";



GRANT ALL ON TABLE "public"."dbgt_import_runs" TO "anon";
GRANT ALL ON TABLE "public"."dbgt_import_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."dbgt_import_runs" TO "service_role";



GRANT ALL ON TABLE "public"."dbgt_limiti_comunali" TO "anon";
GRANT ALL ON TABLE "public"."dbgt_limiti_comunali" TO "authenticated";
GRANT ALL ON TABLE "public"."dbgt_limiti_comunali" TO "service_role";



GRANT ALL ON TABLE "public"."dbgt_numero_civico" TO "anon";
GRANT ALL ON TABLE "public"."dbgt_numero_civico" TO "authenticated";
GRANT ALL ON TABLE "public"."dbgt_numero_civico" TO "service_role";



GRANT ALL ON TABLE "public"."dbgt_toponimo_nome" TO "anon";
GRANT ALL ON TABLE "public"."dbgt_toponimo_nome" TO "authenticated";
GRANT ALL ON TABLE "public"."dbgt_toponimo_nome" TO "service_role";



GRANT ALL ON TABLE "public"."dbgt_toponimo_stradale" TO "anon";
GRANT ALL ON TABLE "public"."dbgt_toponimo_stradale" TO "authenticated";
GRANT ALL ON TABLE "public"."dbgt_toponimo_stradale" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_session_coverage" TO "anon";
GRANT ALL ON TABLE "public"."delivery_session_coverage" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_session_coverage" TO "service_role";



GRANT ALL ON TABLE "public"."demographic_indicators" TO "anon";
GRANT ALL ON TABLE "public"."demographic_indicators" TO "authenticated";
GRANT ALL ON TABLE "public"."demographic_indicators" TO "service_role";



GRANT ALL ON TABLE "public"."documenti" TO "anon";
GRANT ALL ON TABLE "public"."documenti" TO "authenticated";
GRANT ALL ON TABLE "public"."documenti" TO "service_role";



GRANT ALL ON TABLE "public"."economic_indicators" TO "anon";
GRANT ALL ON TABLE "public"."economic_indicators" TO "authenticated";
GRANT ALL ON TABLE "public"."economic_indicators" TO "service_role";



GRANT ALL ON TABLE "public"."geo_municipalities" TO "anon";
GRANT ALL ON TABLE "public"."geo_municipalities" TO "authenticated";
GRANT ALL ON TABLE "public"."geo_municipalities" TO "service_role";



GRANT ALL ON TABLE "public"."geo_nil_milano" TO "anon";
GRANT ALL ON TABLE "public"."geo_nil_milano" TO "authenticated";
GRANT ALL ON TABLE "public"."geo_nil_milano" TO "service_role";



GRANT ALL ON SEQUENCE "public"."geo_nil_milano_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."geo_nil_milano_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."geo_nil_milano_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."geo_postal_areas" TO "anon";
GRANT ALL ON TABLE "public"."geo_postal_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."geo_postal_areas" TO "service_role";



GRANT ALL ON TABLE "public"."gps_operator_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."gps_operator_audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gps_operator_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gps_operator_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gps_operator_audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gtfs_routes" TO "anon";
GRANT ALL ON TABLE "public"."gtfs_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."gtfs_routes" TO "service_role";



GRANT ALL ON TABLE "public"."gtfs_stop_times" TO "anon";
GRANT ALL ON TABLE "public"."gtfs_stop_times" TO "authenticated";
GRANT ALL ON TABLE "public"."gtfs_stop_times" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gtfs_stop_times_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gtfs_stop_times_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gtfs_stop_times_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gtfs_stops" TO "anon";
GRANT ALL ON TABLE "public"."gtfs_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."gtfs_stops" TO "service_role";



GRANT ALL ON TABLE "public"."impostazioni" TO "anon";
GRANT ALL ON TABLE "public"."impostazioni" TO "authenticated";
GRANT ALL ON TABLE "public"."impostazioni" TO "service_role";



GRANT ALL ON TABLE "public"."istat_census_sections" TO "anon";
GRANT ALL ON TABLE "public"."istat_census_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."istat_census_sections" TO "service_role";



GRANT ALL ON SEQUENCE "public"."istat_census_sections_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."istat_census_sections_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."istat_census_sections_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lombardia_comuni_bbox" TO "anon";
GRANT ALL ON TABLE "public"."lombardia_comuni_bbox" TO "authenticated";
GRANT ALL ON TABLE "public"."lombardia_comuni_bbox" TO "service_role";



GRANT ALL ON TABLE "public"."map_sectors" TO "anon";
GRANT ALL ON TABLE "public"."map_sectors" TO "authenticated";
GRANT ALL ON TABLE "public"."map_sectors" TO "service_role";



GRANT ALL ON TABLE "public"."omi_zones" TO "anon";
GRANT ALL ON TABLE "public"."omi_zones" TO "authenticated";
GRANT ALL ON TABLE "public"."omi_zones" TO "service_role";



GRANT ALL ON TABLE "public"."operational_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."operational_groups" TO "service_role";



GRANT ALL ON TABLE "public"."operator_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."operator_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."osm_buildings" TO "anon";
GRANT ALL ON TABLE "public"."osm_buildings" TO "authenticated";
GRANT ALL ON TABLE "public"."osm_buildings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."osm_buildings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."osm_buildings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."osm_buildings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."poi_cache" TO "anon";
GRANT ALL ON TABLE "public"."poi_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."poi_cache" TO "service_role";



GRANT ALL ON SEQUENCE "public"."poi_cache_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."poi_cache_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."poi_cache_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."poi_search_logs" TO "anon";
GRANT ALL ON TABLE "public"."poi_search_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."poi_search_logs" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("full_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("company_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("updated_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."quote_requests" TO "anon";
GRANT ALL ON TABLE "public"."quote_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_requests" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."smart_pairing_waitlist" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."smart_pairing_waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."smart_pairing_waitlist" TO "service_role";



GRANT INSERT("cliente_id") ON TABLE "public"."smart_pairing_waitlist" TO "authenticated";



GRANT INSERT("nome") ON TABLE "public"."smart_pairing_waitlist" TO "anon";
GRANT INSERT("nome") ON TABLE "public"."smart_pairing_waitlist" TO "authenticated";



GRANT INSERT("email") ON TABLE "public"."smart_pairing_waitlist" TO "anon";
GRANT INSERT("email") ON TABLE "public"."smart_pairing_waitlist" TO "authenticated";



GRANT INSERT("whatsapp") ON TABLE "public"."smart_pairing_waitlist" TO "anon";
GRANT INSERT("whatsapp") ON TABLE "public"."smart_pairing_waitlist" TO "authenticated";



GRANT INSERT("comune") ON TABLE "public"."smart_pairing_waitlist" TO "anon";
GRANT INSERT("comune") ON TABLE "public"."smart_pairing_waitlist" TO "authenticated";



GRANT INSERT("servizio") ON TABLE "public"."smart_pairing_waitlist" TO "anon";
GRANT INSERT("servizio") ON TABLE "public"."smart_pairing_waitlist" TO "authenticated";



GRANT INSERT("date_preferite") ON TABLE "public"."smart_pairing_waitlist" TO "anon";
GRANT INSERT("date_preferite") ON TABLE "public"."smart_pairing_waitlist" TO "authenticated";



GRANT INSERT("note") ON TABLE "public"."smart_pairing_waitlist" TO "anon";
GRANT INSERT("note") ON TABLE "public"."smart_pairing_waitlist" TO "authenticated";



GRANT ALL ON TABLE "public"."territorial_profile_indicators" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("id") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("geography_type") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("geography_type") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("geography_ref") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("geography_ref") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("municipality_code") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("municipality_code") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("municipality_name") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("municipality_name") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("reference_year") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("reference_year") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("source") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("source") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("avg_household_size") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("avg_household_size") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("single_households_pct") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("single_households_pct") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("couples_no_children_pct") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("couples_no_children_pct") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("families_with_children_pct") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("families_with_children_pct") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("single_parent_households_pct") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("single_parent_households_pct") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("other_households_pct") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("other_households_pct") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("residential_area_pct") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("residential_area_pct") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("commercial_industrial_area_pct") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("commercial_industrial_area_pct") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("imported_at") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("imported_at") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("updated_at") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("green_agricultural_area_pct") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("green_agricultural_area_pct") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT SELECT("other_infrastructure_water_area_pct") ON TABLE "public"."territorial_profile_indicators" TO "anon";
GRANT SELECT("other_infrastructure_water_area_pct") ON TABLE "public"."territorial_profile_indicators" TO "authenticated";



GRANT ALL ON TABLE "public"."tracking_gps" TO "anon";
GRANT ALL ON TABLE "public"."tracking_gps" TO "authenticated";
GRANT ALL ON TABLE "public"."tracking_gps" TO "service_role";



GRANT ALL ON TABLE "public"."transport_routes" TO "anon";
GRANT ALL ON TABLE "public"."transport_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_routes" TO "service_role";



GRANT ALL ON TABLE "public"."transport_stop_routes" TO "anon";
GRANT ALL ON TABLE "public"."transport_stop_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_stop_routes" TO "service_role";



GRANT ALL ON TABLE "public"."transport_stops" TO "anon";
GRANT ALL ON TABLE "public"."transport_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."transport_stops" TO "service_role";



GRANT ALL ON TABLE "public"."volantinipro_release_migrations" TO "service_role";



GRANT ALL ON TABLE "public"."zone_admin" TO "anon";
GRANT ALL ON TABLE "public"."zone_admin" TO "authenticated";
GRANT ALL ON TABLE "public"."zone_admin" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
