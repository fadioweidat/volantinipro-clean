-- Migration: 20260918180000_fix_get_public_driver_assignment_territory.sql
-- Purpose: Add canonical territory fields (polygon_geojson, territory_type, parent_municipality, address_label)
-- to get_public_driver_assignment zone projections for driver app map & geofence integrity.
-- Security: SECURITY DEFINER, search_path public,pg_temp, preserves anon/authenticated/service_role grants.

CREATE OR REPLACE FUNCTION "public"."get_public_driver_assignment"("p_assignment_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_assignment public.operator_assignments%rowtype;
  v_campaign_title text;
  v_campaign_city text;
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

  select c.title, c.city into v_campaign_title, v_campaign_city
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
      'radius_m', cz.radius_m,
      'polygon_geojson', cz.polygon_geojson,
      'territory_type', case
        when cz.radius_m is not null and cz.radius_m > 0 then 'radius'
        when cz.polygon_geojson is not null then 'polygon'
        else 'comune'
      end,
      'parent_municipality', v_campaign_city,
      'address_label', cz.address_label
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

REVOKE ALL ON FUNCTION "public"."get_public_driver_assignment"("p_assignment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_driver_assignment"("p_assignment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_driver_assignment"("p_assignment_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_public_driver_assignment"("p_assignment_id" "uuid") TO "authenticated";
