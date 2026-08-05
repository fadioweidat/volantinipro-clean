begin;

create or replace function public.gps_insert_point(
  p_session_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null::double precision,
  p_speed double precision default null::double precision,
  p_heading double precision default null::double precision,
  p_recorded_at timestamptz default now()
) returns public.gps_tracking_points
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_point public.gps_tracking_points%rowtype;
  v_recorded_at timestamptz := coalesce(p_recorded_at, now());
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
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

  -- Serializza soltanto lo stesso campione della stessa sessione. Non elimina
  -- dati storici e impedisce il race osservato con callback watchPosition
  -- concorrenti (anche da mount React distinti).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws('|', v_session.id::text, v_recorded_at::text, p_lat::text, p_lng::text),
      0
    )
  );

  select * into v_point
  from public.gps_tracking_points p
  where p.session_id = v_session.id
    and p.recorded_at = v_recorded_at
    and p.lat = p_lat
    and p.lng = p_lng
  order by p.created_at asc nulls last, p.id
  limit 1;

  if found then
    return v_point;
  end if;

  insert into public.gps_tracking_points (
    campaign_id, session_id, driver_id, lat, lng,
    accuracy, speed, heading, recorded_at
  ) values (
    v_session.campaign_id, v_session.id, v_uid, p_lat, p_lng,
    p_accuracy, p_speed, p_heading, v_recorded_at
  ) returning * into v_point;

  return v_point;
end;
$$;

revoke all on function public.gps_insert_point(uuid, double precision, double precision, double precision, double precision, double precision, timestamptz) from public;
grant execute on function public.gps_insert_point(uuid, double precision, double precision, double precision, double precision, double precision, timestamptz) to authenticated, service_role;

commit;
