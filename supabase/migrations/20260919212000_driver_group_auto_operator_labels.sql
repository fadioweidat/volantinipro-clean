-- Automatic anonymous operator labels (OP 1, OP 2, ...) for shared Driver group links.
-- Keeps the existing RPC signature for backward compatibility; p_display_name is
-- accepted but no longer required for new joins.
begin;

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

  -- Row lock serializes concurrent joins on the same shared link, preventing
  -- two phones from receiving the same OP number.
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

  -- Stable anonymous label. Never reuse an old number on this group link,
  -- including revoked/historical participants.
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

-- Add the safe operational label to the existing public assignment payload.
-- Existing fields and callers remain unchanged.
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
    'operator_label', v_assignment.participant_label,
    'metadata', v_assignment.metadata,
    'zones', v_zones,
    'confirmed_at', v_confirmed_at
  );
end;
$$;

commit;
