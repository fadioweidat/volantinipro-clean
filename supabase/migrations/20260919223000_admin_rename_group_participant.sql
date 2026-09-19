-- Admin rename for shared-link participants.
-- Keeps assignment/session/GPS identity unchanged; updates only the safe operational label.
begin;

create or replace function public.admin_rename_group_participant(
  p_assignment_id uuid,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_participant public.driver_group_participants%rowtype;
  v_name text;
begin
  if v_uid is null or not public.gps_is_admin() then
    raise exception 'SOLO_ADMIN' using errcode = '42501';
  end if;
  if p_assignment_id is null then
    raise exception 'ASSEGNAZIONE_OBBLIGATORIA' using errcode = '22023';
  end if;

  v_name := left(btrim(coalesce(p_display_name, '')), 40);
  if length(v_name) < 1 then
    raise exception 'NOME_OPERATIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select * into v_assignment
  from public.operator_assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'ASSEGNAZIONE_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_assignment.group_access_link_id is null then
    raise exception 'NON_PARTECIPANTE_LINK_GRUPPO' using errcode = '22023';
  end if;
  if v_assignment.status = 'revoked' then
    raise exception 'PARTECIPANTE_REVOCATO' using errcode = '22023';
  end if;

  select * into v_participant
  from public.driver_group_participants
  where assignment_id = p_assignment_id
    and group_access_link_id = v_assignment.group_access_link_id
  for update;

  if not found then
    raise exception 'PARTECIPANTE_NON_TROVATO' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.driver_group_participants p
    where p.group_access_link_id = v_assignment.group_access_link_id
      and p.assignment_id <> p_assignment_id
      and p.status = 'active'
      and lower(btrim(p.display_name)) = lower(v_name)
  ) then
    raise exception 'NOME_OPERATIVO_GIA_USATO' using errcode = '23505';
  end if;

  update public.driver_group_participants
  set display_name = v_name,
      last_seen_at = coalesce(last_seen_at, now())
  where id = v_participant.id
  returning * into v_participant;

  update public.operator_assignments
  set participant_label = v_name,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'operator_label', v_name,
        'operator_label_updated_by', v_uid,
        'operator_label_updated_at', now()
      ),
      updated_at = now()
  where id = p_assignment_id
  returning * into v_assignment;

  insert into public.gps_operator_audit_log
    (operator_id, action, campaign_id, assignment_id, context)
  values (
    v_uid,
    'group_participant_renamed',
    v_assignment.campaign_id,
    v_assignment.id,
    jsonb_build_object(
      'participant_id', v_participant.id,
      'display_name', v_name
    )
  );

  return jsonb_build_object(
    'assignment_id', v_assignment.id,
    'participant_id', v_participant.id,
    'display_name', v_name,
    'campaign_id', v_assignment.campaign_id,
    'group_id', v_assignment.group_id
  );
end;
$$;

grant execute on function public.admin_rename_group_participant(uuid, text) to authenticated;

commit;
