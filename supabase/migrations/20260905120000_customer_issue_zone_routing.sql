-- TICKET — FIX END-TO-END SEGNALAZIONI CLIENTE -> DRIVER APP.
--
-- ROOT CAUSE (confermato via query dal vivo su customer_issues in produzione,
-- una sola riga reale "milano - via oroboni 10", lat/lng NULL,
-- routed_to='admin_queue', assignment_id NULL): customer_create_issue
-- instrada al driver SOLO tramite point-in-polygon su p_lat/p_lng, ma il
-- form Cliente (CampaignTracking.jsx) non ha mai raccolto/inviato
-- coordinate — quindi OGNI segnalazione reale finiva in admin_queue, mai
-- da un driver, indipendentemente da quanti operator_assignment attivi
-- coprissero davvero quella zona.
--
-- FIX: la Dashboard Cliente mostra le zone REALI della campagna (stessa
-- fonte gia' usata dalla mappa tracking, campaign_zones) in un menu a
-- tendina; il cliente sceglie la zona invece di digitare un indirizzo
-- libero da geocodificare. Il routing verso l'assignment corretto resta
-- IDENTICO (candidato unico attivo in finestra), solo la sorgente della
-- zona cambia: p_zone_id diretto quando fornito, altrimenti resta il
-- point-in-polygon esistente su lat/lng (retrocompatibile, non rimosso).
--
-- Aggiunge anche lo stato 'seen' (Fase 2/4/7 del ticket: "Presa visione"
-- distinta da "Sto verificando"/in_progress) cosi' il Cliente vede una
-- progressione reale invece del solo "inviata/risolta" di prima.

begin;

-- ---------------------------------------------------------------------------
-- Stato 'seen' + seen_at — additivo, nessuna riga esistente cambia stato.
-- ---------------------------------------------------------------------------
alter table public.customer_issues drop constraint if exists customer_issues_status_check;
alter table public.customer_issues add constraint customer_issues_status_check
  check (status in ('new', 'assigned', 'seen', 'in_progress', 'resolved', 'not_resolvable'));
alter table public.customer_issues add column if not exists seen_at timestamptz;

-- ---------------------------------------------------------------------------
-- customer_create_issue — nuovo parametro p_zone_id (in coda, default null:
-- retrocompatibile con qualunque chiamante esistente). Se fornito, instrada
-- su quella zona direttamente; altrimenti resta il point-in-polygon su
-- p_lat/p_lng gia' esistente. La regola "instrada SOLO se il candidato e'
-- UNO E UNO SOLO" e tutti i controlli di autorizzazione restano invariati.
-- ---------------------------------------------------------------------------
drop function if exists public.customer_create_issue(uuid, text, text, text, double precision, double precision, text, text);

create or replace function public.customer_create_issue(
  p_campaign_id uuid, p_municipality text, p_street text, p_house_number text,
  p_lat double precision, p_lng double precision, p_reason text, p_notes text default null,
  p_zone_id uuid default null
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

  -- Zona: scelta esplicita dal Cliente (menu a tendina, zone reali della
  -- campagna) quando disponibile — nessuna geocodifica di indirizzi liberi.
  if p_zone_id is not null then
    select z.id, z.group_id into v_zone_id, v_group_id
    from public.campaign_zones z
    where z.id = p_zone_id and z.campaign_id = p_campaign_id;
    if not found then
      raise exception 'ZONA_NON_VALIDA' using errcode = '22023';
    end if;
  elsif p_lat is not null and p_lng is not null then
    -- Fallback storico: point-in-polygon sulle geometrie reali delle zone
    -- della campagna (invariato).
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
revoke execute on function public.customer_create_issue(uuid, text, text, text, double precision, double precision, text, text, uuid) from public, anon;
grant execute on function public.customer_create_issue(uuid, text, text, text, double precision, double precision, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_customer_issues — aggiunge routed_to e seen_at (il Cliente deve poter
-- distinguere "in attesa di assegnazione operatore" da "assegnato, in
-- attesa di presa visione": Fase 3/7 del ticket, "NON mentire al cliente").
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
      'reason', i.reason, 'notes', i.notes, 'status', i.status, 'routed_to', i.routed_to,
      'created_at', i.created_at, 'seen_at', i.seen_at, 'resolved_at', i.resolved_at, 'resolution_note', i.resolution_note,
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
-- driver_transition_issue — nuova azione 'seen' ("Presa visione", Fase 4/7),
-- distinta da 'take' ("Sto verificando"/in_progress). Stesso controllo di
-- autorizzazione (auth o access_token dell'assignment), invariato.
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
  if p_action not in ('seen', 'take', 'resolve', 'not_resolvable') then
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

  if p_action = 'seen' then
    update public.customer_issues
      set status = case when status in ('new', 'assigned') then 'seen' else status end,
          seen_at = coalesce(seen_at, now())
      where id = p_issue_id returning * into v_issue;
    insert into public.issue_events (issue_id, event_type, actor, context)
    values (p_issue_id, 'DRIVER_ISSUE_ASSIGNED', v_identity, jsonb_build_object('seen', true));
  elsif p_action = 'take' then
    update public.customer_issues
      set status = 'in_progress', seen_at = coalesce(seen_at, now()), taken_at = coalesce(taken_at, now())
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
-- driver_list_issues — espone seen_at al Driver (per coerenza con lo stato).
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
      'created_at', i.created_at, 'seen_at', i.seen_at, 'taken_at', i.taken_at, 'resolved_at', i.resolved_at, 'resolution_note', i.resolution_note
    ) order by (i.status = 'resolved' or i.status = 'not_resolvable'), i.created_at desc)
    from public.customer_issues i
    where i.assignment_id = p_assignment_id
  ), '[]'::jsonb);
end;
$function$;
grant execute on function public.driver_list_issues(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_issues — espone seen_at per la timeline Admin (Fase 8).
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
      'seen_at', i.seen_at, 'taken_at', i.taken_at, 'resolved_at', i.resolved_at,
      'open_seconds', extract(epoch from (coalesce(i.resolved_at, now()) - i.created_at))::bigint
    ) order by (i.status in ('resolved', 'not_resolvable')), i.created_at desc)
    from public.customer_issues i
    where p_campaign_id is null or i.campaign_id = p_campaign_id
  ), '[]'::jsonb);
end;
$function$;
revoke execute on function public.admin_list_issues(uuid) from public, anon;
grant execute on function public.admin_list_issues(uuid) to authenticated;

commit;
