-- BUG: Altri operatori non visibili sulla mappa gruppo.
--
-- ROOT CAUSE:
-- 1) get_driver_group_tracking selezionava unicamente da `public.delivery_sessions s`:
--    se un participant (OP 1, OP 2, ...) appartiene al gruppo ma non ha ancora
--    avviato una sessione, non appariva affatto nel payload RPC.
-- 2) driver_group_join creava l'assignment del participant ma non copiava le zone
--    del gruppo in `operator_assignment_zones`, impedendo all'operatore di avviare
--    la sessione GPS e lasciandolo a 0 zone.
-- 3) Nel frontend, groupOthers/groupLines ignorava chi non aveva ancora una sessione,
--    invece di mostrare lo stato "non ancora avviato".
--
-- FIX:
-- 1) get_driver_group_tracking include TUTTI i membri attivi del gruppo (con o senza sessione).
--    Chi non ha ancora avviato compare con status='not_started', id=null, display_label corretta.
-- 2) driver_group_join popola operator_assignment_zones ereditando le zone del gruppo.
-- 3) Backfill per participant esistenti privi di righe in operator_assignment_zones.
-- 4) get_public_driver_assignment fa fallback sulle zone del gruppo se operator_assignment_zones fosse vuoto.

begin;

-- 1. Backfill operator_assignment_zones per participant esistenti
insert into public.operator_assignment_zones (assignment_id, zone_id, municipality_name, quantity)
select a.id, oaz.zone_id, oaz.municipality_name, oaz.quantity
from public.operator_assignments a
join public.operator_assignments orig on orig.group_id = a.group_id and orig.group_access_link_id is null
join public.operator_assignment_zones oaz on oaz.assignment_id = orig.id
where a.group_access_link_id is not null
  and not exists (select 1 from public.operator_assignment_zones existing where existing.assignment_id = a.id);

-- Se l'assignment originaria non aveva righe in operator_assignment_zones, popola da campaign_zones
insert into public.operator_assignment_zones (assignment_id, zone_id, municipality_name, quantity)
select a.id, cz.id, cz.zone_name, coalesce(cz.quantity_assigned, 0)
from public.operator_assignments a
join public.campaign_zones cz on cz.campaign_id = a.campaign_id and (cz.group_id = a.group_id or cz.group_id is null)
where a.group_access_link_id is not null
  and not exists (select 1 from public.operator_assignment_zones existing where existing.assignment_id = a.id);

-- 2. Aggiornamento driver_group_join con ereditarieta' zone
create or replace function public.driver_group_join(
  p_group_token text,
  p_device_id text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_hash text;
  v_link public.driver_group_access_links%rowtype;
  v_participant public.driver_group_participants%rowtype;
  v_assignment public.operator_assignments%rowtype;
  v_name text;
  v_count integer;
  v_next integer;
begin
  if p_group_token is null or length(btrim(p_group_token)) < 16 then
    raise exception 'GROUP_TOKEN_NON_VALIDO' using errcode = '42501';
  end if;
  if p_device_id is null or length(btrim(p_device_id)) < 8 then
    raise exception 'DEVICE_ID_NON_VALIDO' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(btrim(p_group_token), 'sha256'), 'hex');

  select * into v_link
  from public.driver_group_access_links
  where token_hash = v_hash
  for update;

  if not found then
    raise exception 'GROUP_LINK_NON_TROVATO' using errcode = '42501';
  end if;
  if v_link.status <> 'active' then
    raise exception 'GROUP_LINK_REVOCATO' using errcode = '42501';
  end if;
  if v_link.expires_at is not null and v_link.expires_at <= now() then
    raise exception 'GROUP_LINK_SCADUTO' using errcode = '42501';
  end if;

  -- Same device -> same participant and same OP label.
  select * into v_participant
  from public.driver_group_participants
  where group_access_link_id = v_link.id
    and device_installation_id = btrim(p_device_id);

  if found then
    if v_participant.status <> 'active' then
      raise exception 'PARTECIPANTE_REVOCATO' using errcode = '42501';
    end if;
    update public.driver_group_participants
      set last_seen_at = now()
      where id = v_participant.id;
    select * into v_assignment
    from public.operator_assignments
    where id = v_participant.assignment_id;

    return jsonb_build_object(
      'participant_id', v_participant.id,
      'assignment_id', v_assignment.id,
      'access_token', v_assignment.access_token,
      'display_name', v_participant.display_name,
      'campaign_id', v_link.campaign_id,
      'group_id', v_link.group_id,
      'reused', true
    );
  end if;

  if v_link.max_participants is not null then
    select count(*) into v_count
    from public.driver_group_participants
    where group_access_link_id = v_link.id
      and status = 'active';
    if v_count >= v_link.max_participants then
      raise exception 'GROUP_LINK_PIENO' using errcode = '42501';
    end if;
  end if;

  -- Stable anonymous label: OP 1, OP 2, ...
  select coalesce(max(
    case
      when upper(display_name) ~ '^OP [0-9]+$'
      then nullif(substring(upper(display_name) from '^OP ([0-9]+)$'), '')::integer
      else null
    end
  ), 0) + 1
  into v_next
  from public.driver_group_participants
  where group_access_link_id = v_link.id;

  v_name := 'OP ' || v_next::text;

  insert into public.operator_assignments (
    operator_id, campaign_id, group_id, status, starts_at,
    group_access_link_id, device_installation_id, participant_label, metadata
  ) values (
    null, v_link.campaign_id, v_link.group_id, 'active', now(),
    v_link.id, btrim(p_device_id), v_name,
    jsonb_build_object('source', 'driver_group_access', 'operator_label', v_name)
  ) returning * into v_assignment;

  -- Eredita zone assegnate al gruppo
  insert into public.operator_assignment_zones (assignment_id, zone_id, municipality_name, quantity)
  select v_assignment.id, oaz.zone_id, oaz.municipality_name, oaz.quantity
  from public.operator_assignment_zones oaz
  join public.operator_assignments orig on orig.id = oaz.assignment_id
  where orig.group_id = v_link.group_id and orig.group_access_link_id is null;

  if not exists (select 1 from public.operator_assignment_zones where assignment_id = v_assignment.id) then
    insert into public.operator_assignment_zones (assignment_id, zone_id, municipality_name, quantity)
    select v_assignment.id, cz.id, cz.zone_name, coalesce(cz.quantity_assigned, 0)
    from public.campaign_zones cz
    where cz.campaign_id = v_link.campaign_id
      and (cz.group_id = v_link.group_id or cz.group_id is null);
  end if;

  insert into public.driver_group_participants (
    group_access_link_id, campaign_id, group_id, assignment_id,
    device_installation_id, display_name, last_seen_at
  ) values (
    v_link.id, v_link.campaign_id, v_link.group_id, v_assignment.id,
    btrim(p_device_id), v_name, now()
  ) returning * into v_participant;

  insert into public.gps_operator_audit_log
    (operator_id, action, campaign_id, assignment_id, context)
  values (
    v_assignment.id, 'group_participant_joined', v_link.campaign_id, v_assignment.id,
    jsonb_build_object(
      'group_access_link_id', v_link.id,
      'participant_id', v_participant.id,
      'operator_label', v_name
    )
  );

  return jsonb_build_object(
    'participant_id', v_participant.id,
    'assignment_id', v_assignment.id,
    'access_token', v_assignment.access_token,
    'display_name', v_name,
    'campaign_id', v_link.campaign_id,
    'group_id', v_link.group_id,
    'reused', false
  );
end;
$$;
alter function public.driver_group_join(text, text, text) owner to postgres;
revoke all on function public.driver_group_join(text, text, text) from public;
grant execute on function public.driver_group_join(text, text, text) to anon, authenticated;

-- 3. Aggiornamento get_public_driver_assignment con fallback su zone gruppo
create or replace function public.get_public_driver_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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
$$;
alter function public.get_public_driver_assignment(uuid) owner to postgres;
revoke all on function public.get_public_driver_assignment(uuid) from public;
grant all on function public.get_public_driver_assignment(uuid) to anon, authenticated, service_role;

-- 4. Aggiornamento get_driver_group_tracking: tutti i membri del gruppo
create or replace function public.get_driver_group_tracking(
  p_assignment_id uuid, p_access_token text default null
) returns jsonb
  language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_identity uuid;
  v_sessions jsonb;
  v_points jsonb;
begin
  if p_assignment_id is null then raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;

  if v_uid is null then
    if p_access_token is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    select * into v_assignment from public.operator_assignments
      where id = p_assignment_id and access_token = p_access_token;
    if not found then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    v_identity := coalesce(v_assignment.operator_id, v_assignment.id);
  else
    select * into v_assignment from public.operator_assignments
      where id = p_assignment_id and operator_id = v_uid;
    if not found then raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;
    v_identity := v_uid;
  end if;

  if not public.gps_assignment_is_valid_v2(
    v_assignment.id, v_identity, v_assignment.campaign_id, v_assignment.group_id, now()
  ) then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if v_assignment.group_id is null then
    return jsonb_build_object('sessions', '[]'::jsonb, 'points', '[]'::jsonb);
  end if;

  with active_sessions as (
    select distinct on (coalesce(s.assignment_id, s.driver_id, s.id))
      s.id,
      s.assignment_id,
      s.driver_id,
      s.status,
      s.started_at,
      s.paused_at,
      s.ended_at,
      s.created_at
    from public.delivery_sessions s
    where s.campaign_id = v_assignment.campaign_id
      and s.group_id = v_assignment.group_id
      and s.status in ('started', 'paused', 'completed')
    order by coalesce(s.assignment_id, s.driver_id, s.id),
      case when s.status in ('started', 'paused') then 0 else 1 end,
      s.started_at desc nulls last,
      s.created_at desc
  ),
  all_members as (
    select
      a.id as assignment_id,
      coalesce(a.operator_id, a.id) as identity_id,
      coalesce(
        nullif(btrim(a.participant_label), ''),
        nullif(btrim(p.display_name), ''),
        case when a.group_access_link_id is null then 'Caposquadra' else null end
      ) as raw_label,
      a.created_at as joined_at,
      (coalesce(a.operator_id, a.id) = v_identity or a.id = v_assignment.id) as is_self
    from public.operator_assignments a
    left join public.driver_group_participants p on p.assignment_id = a.id and p.status = 'active'
    where a.campaign_id = v_assignment.campaign_id
      and a.group_id = v_assignment.group_id
      and a.status = 'active'
      and a.revoked_at is null
  ),
  combined as (
    select
      s.id as session_id,
      coalesce(m.assignment_id, s.assignment_id) as assignment_id,
      coalesce(s.status, 'not_started') as status,
      s.started_at,
      s.paused_at,
      s.ended_at,
      coalesce(m.is_self, (s.driver_id = v_identity)) as is_self,
      m.raw_label,
      m.joined_at,
      s.created_at as session_created_at
    from all_members m
    left join active_sessions s on s.assignment_id = m.assignment_id
  ),
  numbered as (
    select
      c.*,
      row_number() over (order by c.is_self desc, c.started_at asc nulls last, c.joined_at asc nulls last) as auto_num
    from combined c
  ),
  ordered as (
    select
      n.session_id,
      n.assignment_id,
      n.status,
      n.started_at,
      n.paused_at,
      n.ended_at,
      n.is_self,
      case
        when n.is_self then 'Tu'
        when n.raw_label is not null then n.raw_label
        else 'Operatore ' || n.auto_num
      end as final_label,
      n.auto_num
    from numbered n
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.session_id,
      'assignment_id', o.assignment_id,
      'status', o.status,
      'started_at', o.started_at,
      'paused_at', o.paused_at,
      'ended_at', o.ended_at,
      'is_self', o.is_self,
      'display_label', o.final_label
    ) order by o.auto_num), '[]'::jsonb)
  into v_sessions from ordered o;

  select coalesce(jsonb_agg(jsonb_build_object(
      'session_id', p.session_id, 'lat', p.lat, 'lng', p.lng,
      'recorded_at', p.recorded_at, 'accuracy', p.accuracy
    ) order by p.recorded_at asc), '[]'::jsonb)
  into v_points from public.gps_tracking_points p
  where p.session_id in (
    select s.id from public.delivery_sessions s
    where s.campaign_id = v_assignment.campaign_id
      and s.group_id = v_assignment.group_id
      and s.status in ('started', 'paused', 'completed')
  );

  return jsonb_build_object('sessions', v_sessions, 'points', v_points);
end;
$$;
alter function public.get_driver_group_tracking(uuid, text) owner to postgres;
revoke all on function public.get_driver_group_tracking(uuid, text) from public;
grant execute on function public.get_driver_group_tracking(uuid, text) to anon, authenticated;

commit;
