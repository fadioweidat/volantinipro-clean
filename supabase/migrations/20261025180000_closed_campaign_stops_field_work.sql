-- Closed campaigns stop all field work (approved 2026-10-25), for ALL campaigns whose status is
-- archived, cancelled or completed:
-- 1. The driver job page gets error 'campaign_closed' + campaign_status from
--    get_public_driver_assignment and shows "Campagna ...: non ci sono altri lavori da svolgere".
-- 2. The server refuses new GPS points (app, direct insert and Traccar), new GPS sessions or
--    resumed sessions, and new proof photos: trigger on the tables, so no write path depends on the
--    page. Traccar points are dropped silently (the receiver keeps answering 200, no retry storm).
--    Points and sessions were already refused by gps_assignment_is_valid_v2 (campaign must be
--    'in_progress'); this adds the photo path, direct inserts and a clear CAMPAGNA_* code.
--    Not touched: issue_verification_photos (customer complaint checks happen after the campaign)
--    and the legacy tracking_gps (it belongs to the old 'campagne' table, no current campaign).
-- 3. A GPS session still open (started/paused) on a closed campaign is closed: status 'completed',
--    ended_at = its last GPS point (no point: paused_at, else started_at). Done now for the existing
--    ones and automatically when a campaign becomes closed later. Closing a session is always
--    allowed by validate_delivery_session_assignment (it used to block it on such campaigns).
-- Rollback: supabase/migrations/rollback/20261025180000_closed_campaign_stops_field_work.rollback.sql


CREATE OR REPLACE FUNCTION public.validate_delivery_session_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Closing an open session (same owner) is always allowed, also on a campaign no longer in progress.
  if tg_op = 'UPDATE' and new.status in ('completed', 'cancelled') and old.status in ('started', 'paused')
     and new.assignment_id is not distinct from old.assignment_id and new.driver_id is not distinct from old.driver_id
     and new.campaign_id is not distinct from old.campaign_id and new.group_id is not distinct from old.group_id then
    return new;
  end if;

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

create or replace function public.campaign_closed_code(p_campaign_id uuid)
returns text
language sql stable security definer
set search_path to ''
as $fn$
  select case c.status
    when 'archived' then 'CAMPAGNA_ARCHIVIATA'
    when 'cancelled' then 'CAMPAGNA_ANNULLATA'
    when 'completed' then 'CAMPAGNA_COMPLETATA'
  end
  from public.campaigns c
  where c.id = p_campaign_id
$fn$;
revoke all on function public.campaign_closed_code(uuid) from public, anon, authenticated;

create or replace function public.reject_write_on_closed_campaign()
returns trigger
language plpgsql security definer
set search_path to ''
as $fn$
declare
  v_row jsonb := pg_catalog.to_jsonb(new);
  v_code text;
begin
  -- Sessions: an open session (start, resume, heartbeat) is refused; closing always passes.
  if tg_table_name = 'delivery_sessions' and v_row ->> 'status' not in ('started', 'paused') then
    return new;
  end if;
  v_code := public.campaign_closed_code((v_row ->> 'campaign_id')::uuid);
  if v_code is null then
    return new;
  end if;
  if tg_table_name = 'gps_tracking_points' and v_row ->> 'source' = 'traccar' then
    return null;
  end if;
  raise exception '%', v_code using errcode = '42501';
end;
$fn$;
revoke all on function public.reject_write_on_closed_campaign() from public, anon, authenticated;

drop trigger if exists gps_tracking_points_closed_campaign_trg on public.gps_tracking_points;
create trigger gps_tracking_points_closed_campaign_trg
  before insert on public.gps_tracking_points
  for each row execute function public.reject_write_on_closed_campaign();

drop trigger if exists proof_photos_closed_campaign_trg on public.proof_photos;
create trigger proof_photos_closed_campaign_trg
  before insert on public.proof_photos
  for each row execute function public.reject_write_on_closed_campaign();

drop trigger if exists delivery_sessions_closed_campaign_trg on public.delivery_sessions;
create trigger delivery_sessions_closed_campaign_trg
  before insert or update on public.delivery_sessions
  for each row execute function public.reject_write_on_closed_campaign();

-- Close the open sessions of a closed campaign, end = last GPS point.
create or replace function public.close_sessions_of_closed_campaign(p_campaign_id uuid)
returns integer
language plpgsql security definer
set search_path to ''
as $fn$
declare
  v_status text;
  v_count integer;
begin
  select c.status into v_status from public.campaigns c where c.id = p_campaign_id;
  if v_status is null or v_status not in ('archived', 'cancelled', 'completed') then
    return 0;
  end if;
  update public.delivery_sessions s
    set status = 'completed',
        ended_at = coalesce(
          (select pg_catalog.max(p.recorded_at) from public.gps_tracking_points p where p.session_id = s.id),
          s.paused_at, s.started_at),
        metadata = coalesce(s.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
          '_closed_reason', 'campagna chiusa (' || v_status || ')',
          '_closed_previous_status', s.status,
          '_closed_at', pg_catalog.now())
    where s.campaign_id = p_campaign_id and s.status in ('started', 'paused');
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;
revoke all on function public.close_sessions_of_closed_campaign(uuid) from public, anon, authenticated;

create or replace function public.campaigns_close_sessions_on_close()
returns trigger
language plpgsql security definer
set search_path to ''
as $fn$
begin
  perform public.close_sessions_of_closed_campaign(new.id);
  return null;
end;
$fn$;
revoke all on function public.campaigns_close_sessions_on_close() from public, anon, authenticated;

drop trigger if exists campaigns_close_sessions_on_close_trg on public.campaigns;
create trigger campaigns_close_sessions_on_close_trg
  after update of status on public.campaigns
  for each row
  when (new.status in ('archived', 'cancelled', 'completed') and old.status is distinct from new.status)
  execute function public.campaigns_close_sessions_on_close();

-- Copy of the sessions closed now (restored by the rollback), then close them.
create schema if not exists backup_ops;
revoke all on schema backup_ops from public, anon, authenticated;
create table backup_ops.delivery_sessions_20261025 as
  select s.id, s.status, s.ended_at, s.metadata
  from public.delivery_sessions s
  join public.campaigns c on c.id = s.campaign_id
  where s.status in ('started', 'paused') and c.status in ('archived', 'cancelled', 'completed');
revoke all on table backup_ops.delivery_sessions_20261025 from public, anon, authenticated;

select public.close_sessions_of_closed_campaign(x.campaign_id)
from (select distinct s.campaign_id from public.delivery_sessions s
      join public.campaigns c on c.id = s.campaign_id
      where s.status in ('started', 'paused') and c.status in ('archived', 'cancelled', 'completed')) x;

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
  v_campaign_status text;
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

  -- Closed campaign: no more work on it, whatever the assignment status.
  select c.status into v_campaign_status from public.campaigns c where c.id = v_assignment.campaign_id;
  if v_campaign_status in ('archived', 'cancelled', 'completed') then
    return jsonb_build_object(
      'id', v_assignment.id,
      'status', v_assignment.status,
      'campaign_status', v_campaign_status,
      'starts_at', v_assignment.starts_at,
      'ends_at', v_assignment.ends_at,
      'operator_label', v_assignment.participant_label,
      'error', 'campaign_closed'
    );
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
