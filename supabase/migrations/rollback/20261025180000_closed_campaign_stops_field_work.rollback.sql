-- Rollback of 20261025180000_closed_campaign_stops_field_work.sql: removes the triggers and
-- helpers, restores the production definitions (2026-10-25) of validate_delivery_session_assignment
-- and get_public_driver_assignment, and reopens the sessions this migration closed (copy in
-- backup_ops.delivery_sessions_20261025). Sessions closed LATER by the campaign trigger are not
-- reopened (their previous status is in metadata._closed_previous_status). backup_ops is kept.

drop trigger if exists campaigns_close_sessions_on_close_trg on public.campaigns;
drop trigger if exists delivery_sessions_closed_campaign_trg on public.delivery_sessions;
drop trigger if exists proof_photos_closed_campaign_trg on public.proof_photos;
drop trigger if exists gps_tracking_points_closed_campaign_trg on public.gps_tracking_points;
drop function if exists public.campaigns_close_sessions_on_close();
drop function if exists public.close_sessions_of_closed_campaign(uuid);
drop function if exists public.reject_write_on_closed_campaign();
drop function if exists public.campaign_closed_code(uuid);

CREATE OR REPLACE FUNCTION public.validate_delivery_session_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.assignment_id is null then
    return new;
  end if;

  if not public.gps_assignment_is_valid_v2(
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
$function$;

CREATE OR REPLACE FUNCTION public.get_public_driver_assignment(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      'operator_label', v_assignment.participant_label,
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

  -- Prima tenta da operator_assignment_zones
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(cz.id, oaz.zone_id),
      'zone_name', coalesce(oaz.municipality_name, cz.zone_name),
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

  -- Fallback difensivo su campaign_zones del gruppo se operator_assignment_zones fosse vuoto
  if v_zones = '[]'::jsonb and v_assignment.group_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', cz.id,
        'zone_name', cz.zone_name,
        'priority', coalesce(cz.priority, 999),
        'quantity', cz.quantity_assigned,
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
      ) order by coalesce(cz.priority, 999), cz.zone_name), '[]'::jsonb)
    into v_zones
    from public.campaign_zones cz
    where cz.campaign_id = v_assignment.campaign_id
      and (cz.group_id = v_assignment.group_id or cz.group_id is null);
  end if;

  return jsonb_build_object(
    'id', v_assignment.id,
    'campaign_id', v_assignment.campaign_id,
    'campaign_title', v_campaign_title,
    'status', v_assignment.status,
    'starts_at', v_assignment.starts_at,
    'ends_at', v_assignment.ends_at,
    'operator_label', v_assignment.participant_label,
    'metadata', v_assignment.metadata,
    'zones', v_zones,
    'confirmed_at', v_confirmed_at
  );
end;
$function$;

alter table public.delivery_sessions disable trigger validate_delivery_session_assignment;
update public.delivery_sessions s
  set status = b.status, ended_at = b.ended_at, metadata = b.metadata
  from backup_ops.delivery_sessions_20261025 b
  where s.id = b.id;
alter table public.delivery_sessions enable trigger validate_delivery_session_assignment;

delete from supabase_migrations.schema_migrations where version = '20261025180000';
