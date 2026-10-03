-- Shared assignment lock preserves authorization/revocation consistency while
-- allowing assignment_event_log FK checks. Group lock serializes link writers.
begin;
-- A targeted invariant, not a performance index. Existing duplicates abort
-- this migration; never silently revoke somebody's shared link.
create unique index driver_group_access_links_one_active
  on public.driver_group_access_links(campaign_id, group_id) where status = 'active';

create or replace function public.driver_get_or_create_group_access_link(
  p_assignment_id uuid,
  p_access_token text
) returns jsonb
  language plpgsql security definer set search_path to ''
as $$
declare
  v_assignment public.operator_assignments%rowtype;
  v_link public.driver_group_access_links%rowtype;
  v_token text;
  v_secret text;
  v_link_id uuid;
begin
  if p_assignment_id is null or p_access_token is null or length(btrim(p_access_token)) = 0 then
    raise exception 'PARAMETRI_MANCANTI' using errcode = '22023';
  end if;

  select * into v_assignment
  from public.operator_assignments
  where id = p_assignment_id and access_token = p_access_token
  for share;

  if not found then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;
  if v_assignment.status <> 'active' or v_assignment.revoked_at is not null then
    raise exception 'ASSEGNAZIONE_NON_ATTIVA' using errcode = '42501';
  end if;
  if v_assignment.starts_at is not null and v_assignment.starts_at > now() then
    raise exception 'ASSEGNAZIONE_NON_ATTIVA' using errcode = '42501';
  end if;
  if v_assignment.ends_at is not null and v_assignment.ends_at <= now() then
    raise exception 'ASSEGNAZIONE_NON_ATTIVA' using errcode = '42501';
  end if;
  -- Distinzione caposquadra/originaria vs. participant OP: un participant
  -- creato da driver_group_join ha SEMPRE group_access_link_id valorizzato.
  -- Non puo' mai amministrare/rigenerare il link del proprio gruppo.
  if v_assignment.group_access_link_id is not null then
    raise exception 'PARTECIPANTE_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if v_assignment.group_id is null then
    raise exception 'GRUPPO_NON_DISPONIBILE' using errcode = '22023';
  end if;

  -- Fast path: readers share the existing link lock; no exclusive group lock.
  select * into v_link from public.driver_group_access_links
    where campaign_id = v_assignment.campaign_id and group_id = v_assignment.group_id
      and status = 'active'
    order by created_at desc limit 1 for share;
  if not found then
    -- Generate the candidate before entering the group critical section.
    v_link_id := gen_random_uuid();
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    v_token := encode(extensions.hmac(v_link_id::text, v_secret, 'sha256'), 'hex');
    -- Same parent lock as Admin regeneration; compatible with FK KEY SHARE.
    perform 1 from public.operational_groups
      where id = v_assignment.group_id and campaign_id = v_assignment.campaign_id
      for no key update;
    if not found then
      raise exception 'GRUPPO_NON_DISPONIBILE' using errcode = '22023';
    end if;
    -- Another assignment may have created a link while we waited.
    select * into v_link from public.driver_group_access_links
      where campaign_id = v_assignment.campaign_id and group_id = v_assignment.group_id
        and status = 'active'
      order by created_at desc limit 1 for share;
  end if;

  if found then
    if v_link.driver_secret is not null then
      v_token := encode(extensions.hmac(v_link.id::text, v_link.driver_secret, 'sha256'), 'hex');
      return jsonb_build_object(
        'token', v_token, 'link_id', v_link.id, 'created', false, 'recoverable', true,
        'campaign_id', v_link.campaign_id, 'group_id', v_link.group_id
      );
    end if;
    -- Link attivo preesistente (percorso Admin storico, token random non
    -- derivabile): mai rigenerato/revocato automaticamente da qui.
    return jsonb_build_object(
      'token', null, 'link_id', v_link.id, 'created', false, 'recoverable', false,
      'campaign_id', v_link.campaign_id, 'group_id', v_link.group_id
    );
  end if;

  -- Candidate token is already prepared; only insert + audit remain.
  insert into public.driver_group_access_links (
    id, campaign_id, group_id, token_hash, driver_secret, created_by, metadata
  ) values (
    v_link_id, v_assignment.campaign_id, v_assignment.group_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_secret, null,
    jsonb_build_object('source', 'driver_self_service', 'created_by_assignment', v_assignment.id)
  ) returning * into v_link;

  insert into public.gps_operator_audit_log (operator_id, action, campaign_id, assignment_id, context)
  values (
    coalesce(v_assignment.operator_id, v_assignment.id), 'driver_group_link_created',
    v_assignment.campaign_id, v_assignment.id,
    jsonb_build_object('group_access_link_id', v_link.id)
  );

  return jsonb_build_object(
    'token', v_token, 'link_id', v_link.id, 'created', true, 'recoverable', true,
    'campaign_id', v_assignment.campaign_id, 'group_id', v_assignment.group_id
  );
end;
$$;
alter function public.driver_get_or_create_group_access_link(uuid, text) owner to postgres;
revoke all on function public.driver_get_or_create_group_access_link(uuid, text) from public;
-- Stesso pattern di grant di driver_group_join: link Driver pubblico, nessun
-- login richiesto, autorizzazione tramite assignment_id + access_token.
grant execute on function public.driver_get_or_create_group_access_link(uuid, text) to anon, authenticated;


create or replace function public.admin_create_group_access_link(
  p_campaign_id uuid,
  p_group_id uuid,
  p_max_participants integer default null,
  p_expires_at timestamptz default null
) returns jsonb
  language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_row public.driver_group_access_links%rowtype;
begin
  if v_uid is null or not public.gps_is_admin() then
    raise exception 'SOLO_ADMIN' using errcode = '42501';
  end if;
  perform 1 from public.operational_groups
    where id = p_group_id and campaign_id = p_campaign_id
    for no key update;
  if not found then
    raise exception 'GRUPPO_NON_VALIDO' using errcode = '22023';
  end if;

  -- Un solo link ATTIVO per (campaign, group): rigenerare revoca il precedente.
  update public.driver_group_access_links
    set status = 'revoked', revoked_at = now()
    where campaign_id = p_campaign_id and group_id = p_group_id and status = 'active';

  v_token := encode(extensions.gen_random_bytes(24), 'hex');   -- 48 hex chars

  insert into public.driver_group_access_links (
    campaign_id, group_id, token_hash, max_participants, expires_at, created_by
  ) values (
    p_campaign_id, p_group_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    p_max_participants, p_expires_at, v_uid
  ) returning * into v_row;

  -- Il token RAW e' restituito UNA sola volta, mai piu' rileggibile dal DB.
  return jsonb_build_object(
    'id', v_row.id, 'token', v_token, 'status', v_row.status,
    'max_participants', v_row.max_participants, 'expires_at', v_row.expires_at,
    'campaign_id', v_row.campaign_id, 'group_id', v_row.group_id
  );
end;
$$;
alter function public.admin_create_group_access_link(uuid, uuid, integer, timestamptz) owner to postgres;
revoke all on function public.admin_create_group_access_link(uuid, uuid, integer, timestamptz) from public, anon;
grant execute on function public.admin_create_group_access_link(uuid, uuid, integer, timestamptz) to authenticated;


commit;
