-- SEGNALAZIONI CLIENTE -> AUTISTA — RPC.
--
-- PROPOSTA, NON APPLICATA in questo turno.
--
-- Tutte SECURITY DEFINER, search_path '', autorizzazione riletta server-side
-- (gps_is_admin / current_user_owns_campaign / access_token dell'assignment).
-- Nessun access_token viene mai restituito o persistito.

begin;

-- ---------------------------------------------------------------------------
-- customer_create_issue — routing automatico, fallback admin_queue.
-- ---------------------------------------------------------------------------
create or replace function public.customer_create_issue(
  p_campaign_id uuid, p_municipality text, p_street text, p_house_number text,
  p_lat double precision, p_lng double precision, p_reason text, p_notes text default null
) returns public.customer_issues
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_zone_id uuid;
  v_group_id uuid;
  v_cands uuid[];
  v_assignment public.operator_assignments%rowtype;
  v_routed text := 'admin_queue';
  v_status text := 'new';
  v_driver_id uuid;
  v_issue public.customer_issues%rowtype;
begin
  if v_uid is null then raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501'; end if;
  if not public.current_user_owns_campaign(p_campaign_id) then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;
  if nullif(btrim(p_municipality), '') is null or nullif(btrim(p_street), '') is null then
    raise exception 'INDIRIZZO_INCOMPLETO' using errcode = '22023';
  end if;
  if p_reason not in ('non_ricevuto', 'via_non_coperta', 'zona_da_verificare', 'altro') then
    raise exception 'MOTIVO_NON_VALIDO' using errcode = '22023';
  end if;

  -- Zona: point-in-polygon sulle geometrie reali delle zone della campagna.
  if p_lat is not null and p_lng is not null then
    select z.id, z.group_id into v_zone_id, v_group_id
    from public.campaign_zones z
    where z.campaign_id = p_campaign_id and z.geometry is not null
      and public.ST_Contains(z.geometry, public.ST_SetSRID(public.ST_MakePoint(p_lng, p_lat), 4326))
    order by z.priority nulls last
    limit 1;
  end if;

  -- Candidati: assignment attivi, in finestra, che coprono quella zona
  -- (via operator_assignment_zones, oppure zone_id diretta, oppure gruppo).
  if v_zone_id is not null then
    select array_agg(distinct a.id) into v_cands
    from public.operator_assignments a
    left join public.operator_assignment_zones oaz on oaz.assignment_id = a.id
    where a.campaign_id = p_campaign_id
      and a.status = 'active' and a.revoked_at is null
      and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
      and (oaz.zone_id = v_zone_id or a.zone_id = v_zone_id
           or (v_group_id is not null and a.group_id = v_group_id));
  end if;

  -- Instrada SOLO se il candidato e' UNO E UNO SOLO. Mai al driver sbagliato.
  if v_cands is not null and array_length(v_cands, 1) = 1 then
    select * into v_assignment from public.operator_assignments where id = v_cands[1];
    v_routed := 'driver';
    v_status := 'assigned';
    v_driver_id := coalesce(v_assignment.operator_id, v_assignment.id);
  end if;

  insert into public.customer_issues
    (campaign_id, created_by, municipality, street, house_number, lat, lng, reason, notes,
     status, zone_id, assignment_id, routed_to, driver_id)
  values (p_campaign_id, v_uid, btrim(p_municipality), btrim(p_street), nullif(btrim(p_house_number), ''),
     p_lat, p_lng, p_reason, nullif(btrim(p_notes), ''),
     v_status, v_zone_id,
     case when v_routed = 'driver' then v_assignment.id else null end,
     v_routed, v_driver_id)
  returning * into v_issue;

  insert into public.issue_events (issue_id, event_type, actor, context)
  values (v_issue.id, 'CUSTOMER_ISSUE_CREATED', v_uid,
    jsonb_build_object('routed_to', v_routed, 'zone_id', v_zone_id));
  if v_routed = 'driver' then
    insert into public.issue_events (issue_id, event_type, actor, context)
    values (v_issue.id, 'DRIVER_ISSUE_ASSIGNED', v_uid,
      jsonb_build_object('assignment_id', v_assignment.id));
  end if;

  return v_issue;
end;
$function$;
revoke execute on function public.customer_create_issue(uuid, text, text, text, double precision, double precision, text, text) from public, anon;
grant execute on function public.customer_create_issue(uuid, text, text, text, double precision, double precision, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_customer_issues — per la Dashboard Cliente (owner). Include eventi +
-- foto di verifica (solo storage_path: la signed url la fa il client).
-- ---------------------------------------------------------------------------
create or replace function public.get_customer_issues(p_campaign_id uuid)
returns jsonb
  language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501'; end if;
  if not (public.gps_is_admin() or public.current_user_owns_campaign(p_campaign_id)) then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'municipality', i.municipality, 'street', i.street, 'house_number', i.house_number,
      'reason', i.reason, 'notes', i.notes, 'status', i.status,
      'created_at', i.created_at, 'resolved_at', i.resolved_at, 'resolution_note', i.resolution_note,
      'photos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'storage_path', p.storage_path, 'lat', p.lat, 'lng', p.lng,
          'accuracy', p.accuracy, 'address_label', p.address_label, 'note', p.note, 'taken_at', p.taken_at
        ) order by p.taken_at)
        from public.issue_verification_photos p where p.issue_id = i.id
      ), '[]'::jsonb)
    ) order by i.created_at desc)
    from public.customer_issues i
    where i.campaign_id = p_campaign_id
  ), '[]'::jsonb);
end;
$function$;
revoke execute on function public.get_customer_issues(uuid) from public, anon;
grant execute on function public.get_customer_issues(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- driver_list_issues — auth (operator_id) OPPURE token (assignment.access_token)
-- ---------------------------------------------------------------------------
create or replace function public.driver_list_issues(p_assignment_id uuid, p_access_token text default null)
returns jsonb
  language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
begin
  if v_uid is not null then
    select * into v_assignment from public.operator_assignments where id = p_assignment_id and operator_id = v_uid;
  else
    if p_access_token is null then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;
    select * into v_assignment from public.operator_assignments where id = p_assignment_id and access_token = p_access_token;
  end if;
  if not found then raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'municipality', i.municipality, 'street', i.street, 'house_number', i.house_number,
      'lat', i.lat, 'lng', i.lng, 'reason', i.reason, 'notes', i.notes, 'status', i.status,
      'created_at', i.created_at, 'taken_at', i.taken_at, 'resolved_at', i.resolved_at, 'resolution_note', i.resolution_note
    ) order by (i.status = 'resolved' or i.status = 'not_resolvable'), i.created_at desc)
    from public.customer_issues i
    where i.assignment_id = p_assignment_id
  ), '[]'::jsonb);
end;
$function$;
grant execute on function public.driver_list_issues(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- driver_transition_issue — take / resolve / not_resolvable
-- ---------------------------------------------------------------------------
create or replace function public.driver_transition_issue(
  p_issue_id uuid, p_action text, p_note text default null,
  p_assignment_id uuid default null, p_access_token text default null
) returns public.customer_issues
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_issue public.customer_issues%rowtype;
  v_assignment public.operator_assignments%rowtype;
  v_identity uuid;
begin
  if p_action not in ('take', 'resolve', 'not_resolvable') then
    raise exception 'AZIONE_NON_VALIDA' using errcode = '22023';
  end if;

  select * into v_issue from public.customer_issues where id = p_issue_id for update;
  if not found then raise exception 'SEGNALAZIONE_NON_TROVATA' using errcode = 'P0002'; end if;
  if v_issue.assignment_id is null then raise exception 'SEGNALAZIONE_NON_ASSEGNATA' using errcode = '42501'; end if;

  if v_uid is not null then
    select * into v_assignment from public.operator_assignments where id = v_issue.assignment_id and operator_id = v_uid;
  else
    if p_access_token is null or p_assignment_id is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select * into v_assignment from public.operator_assignments
    where id = v_issue.assignment_id and id = p_assignment_id and access_token = p_access_token;
  end if;
  if not found then raise exception 'SEGNALAZIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;
  v_identity := coalesce(v_assignment.operator_id, v_assignment.id);

  if p_action = 'take' then
    update public.customer_issues
      set status = 'in_progress', taken_at = coalesce(taken_at, now())
      where id = p_issue_id returning * into v_issue;
  elsif p_action = 'resolve' then
    update public.customer_issues
      set status = 'resolved', resolution_note = nullif(btrim(p_note), ''),
          resolved_at = now(), resolved_by = v_identity
      where id = p_issue_id returning * into v_issue;
    insert into public.issue_events (issue_id, event_type, actor, context)
    values (p_issue_id, 'DRIVER_ISSUE_RESOLVED', v_identity, jsonb_build_object('note', nullif(btrim(p_note), '')));
    insert into public.issue_events (issue_id, event_type, actor, context)
    values (p_issue_id, 'CUSTOMER_ISSUE_RESOLVED', v_identity, '{}'::jsonb);
  else
    update public.customer_issues
      set status = 'not_resolvable', resolution_note = nullif(btrim(p_note), ''),
          resolved_at = now(), resolved_by = v_identity
      where id = p_issue_id returning * into v_issue;
    insert into public.issue_events (issue_id, event_type, actor, context)
    values (p_issue_id, 'DRIVER_ISSUE_RESOLVED', v_identity, jsonb_build_object('not_resolvable', true, 'note', nullif(btrim(p_note), '')));
  end if;

  return v_issue;
end;
$function$;
grant execute on function public.driver_transition_issue(uuid, text, text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- driver_register_issue_photo — foto di verifica, coordinate OBBLIGATORIE,
-- tabella separata da proof_photos.
-- ---------------------------------------------------------------------------
create or replace function public.driver_register_issue_photo(
  p_issue_id uuid, p_storage_path text, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null, p_address_label text default null, p_note text default null,
  p_assignment_id uuid default null, p_access_token text default null
) returns public.issue_verification_photos
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_issue public.customer_issues%rowtype;
  v_assignment public.operator_assignments%rowtype;
  v_identity uuid;
  v_prefix text;
  v_photo public.issue_verification_photos%rowtype;
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'COORDINATE_OBBLIGATORIE' using errcode = '22023';
  end if;

  select * into v_issue from public.customer_issues where id = p_issue_id;
  if not found then raise exception 'SEGNALAZIONE_NON_TROVATA' using errcode = 'P0002'; end if;
  if v_issue.assignment_id is null then raise exception 'SEGNALAZIONE_NON_ASSEGNATA' using errcode = '42501'; end if;

  if v_uid is not null then
    select * into v_assignment from public.operator_assignments where id = v_issue.assignment_id and operator_id = v_uid;
  else
    if p_access_token is null or p_assignment_id is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select * into v_assignment from public.operator_assignments
    where id = v_issue.assignment_id and id = p_assignment_id and access_token = p_access_token;
  end if;
  if not found then raise exception 'SEGNALAZIONE_NON_AUTORIZZATA' using errcode = '42501'; end if;
  v_identity := coalesce(v_assignment.operator_id, v_assignment.id);

  v_prefix := 'campaign/' || v_issue.campaign_id::text || '/issue/' || v_issue.id::text || '/photo/';
  if p_storage_path not like (v_prefix || '%') or p_storage_path like '%..%' then
    raise exception 'PERCORSO_FOTO_NON_VALIDO' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'proof-photos' and o.name = p_storage_path) then
    raise exception 'OGGETTO_FOTO_NON_TROVATO' using errcode = 'P0002';
  end if;

  insert into public.issue_verification_photos
    (issue_id, campaign_id, assignment_id, driver_id, storage_path, lat, lng, accuracy, address_label, note)
  values (p_issue_id, v_issue.campaign_id, v_assignment.id, v_identity, p_storage_path, p_lat, p_lng,
    p_accuracy, nullif(btrim(p_address_label), ''), nullif(btrim(p_note), ''))
  returning * into v_photo;

  return v_photo;
end;
$function$;
grant execute on function public.driver_register_issue_photo(uuid, text, double precision, double precision, double precision, text, text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin: lista + routing manuale (fallback / override).
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_issues(p_campaign_id uuid default null)
returns jsonb
  language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not public.gps_is_admin() then raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'campaign_id', i.campaign_id, 'municipality', i.municipality, 'street', i.street,
      'house_number', i.house_number, 'reason', i.reason, 'status', i.status, 'routed_to', i.routed_to,
      'assignment_id', i.assignment_id, 'zone_id', i.zone_id, 'created_at', i.created_at,
      'taken_at', i.taken_at, 'resolved_at', i.resolved_at,
      'open_seconds', extract(epoch from (coalesce(i.resolved_at, now()) - i.created_at))::bigint
    ) order by (i.status in ('resolved', 'not_resolvable')), i.created_at desc)
    from public.customer_issues i
    where p_campaign_id is null or i.campaign_id = p_campaign_id
  ), '[]'::jsonb);
end;
$function$;
revoke execute on function public.admin_list_issues(uuid) from public, anon;
grant execute on function public.admin_list_issues(uuid) to authenticated;

create or replace function public.admin_route_issue(p_issue_id uuid, p_assignment_id uuid)
returns public.customer_issues
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_issue public.customer_issues%rowtype;
  v_assignment public.operator_assignments%rowtype;
begin
  if not public.gps_is_admin() then raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501'; end if;
  select * into v_issue from public.customer_issues where id = p_issue_id for update;
  if not found then raise exception 'SEGNALAZIONE_NON_TROVATA' using errcode = 'P0002'; end if;
  select * into v_assignment from public.operator_assignments where id = p_assignment_id and campaign_id = v_issue.campaign_id;
  if not found then raise exception 'ASSEGNAZIONE_NON_VALIDA' using errcode = '22023'; end if;

  update public.customer_issues
    set assignment_id = v_assignment.id, driver_id = coalesce(v_assignment.operator_id, v_assignment.id),
        routed_to = 'driver', status = case when status = 'new' then 'assigned' else status end
    where id = p_issue_id returning * into v_issue;
  insert into public.issue_events (issue_id, event_type, actor, context)
  values (p_issue_id, 'DRIVER_ISSUE_ASSIGNED', v_uid, jsonb_build_object('assignment_id', v_assignment.id, 'by_admin', true));
  return v_issue;
end;
$function$;
revoke execute on function public.admin_route_issue(uuid, uuid) from public, anon;
grant execute on function public.admin_route_issue(uuid, uuid) to authenticated;

commit;
