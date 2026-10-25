-- Rollback of 20261025170000_group_join_closed_campaign.sql: the production definition of
-- driver_group_join read on 2026-10-25, before the campaign-status check.

CREATE OR REPLACE FUNCTION public.driver_group_join(p_group_token text, p_device_id text, p_display_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

delete from supabase_migrations.schema_migrations where version = '20261025170000';
