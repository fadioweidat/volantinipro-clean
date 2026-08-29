-- DRIVER GROUP ACCESS — 1 link operativo per gruppo, N identita' isolate.
--
-- PROPOSTA, NON APPLICATA in questo turno.
--
-- MODELLO (scelta "schema additivo + RPC _v3")
--   * driver_group_access_links: il link condiviso (token hashato) creato
--     dall'Admin per un (campaign_id, group_id).
--   * driver_group_participants: una riga per (link, device_installation_id) —
--     stesso device che riapre = stesso participant, mai un duplicato.
--   * operator_assignments: operator_id diventa NULLABLE + 3 colonne additive
--     (group_access_link_id, device_installation_id, participant_label). Un
--     participant ottiene una SUA operator_assignments anonima (operator_id
--     NULL) con il proprio access_token personale. I link personali esistenti
--     (operator_id valorizzato) restano identici.
--   * driver_group_join(group_token, device_id, display_name): UNICA RPC che
--     accetta il token di gruppo. Valida il link, applica max_participants /
--     scadenza, crea-o-riusa il participant + la sua assignment, ritorna il
--     token PERSONALE. Dopo il join il browser usa SOLO il token personale
--     con le RPC _v3 (vedi 20260829180000): il group token NON puo' mai
--     controllare una delivery_session.
--   * gps_assignment_is_valid_v2: come la v1 ma LEFT JOIN a operator_profiles
--     (per le assignment anonime senza operatore). Usata SOLO dalle _v3; la
--     gps_assignment_is_valid originale (usata da v1/v2) NON viene toccata.
--
-- BACKWARD COMPATIBILITY: nessun DROP, nessuna modifica a v1/v2, ai link
-- personali, alle RPC Driver esistenti. Solo aggiunte.
--
-- NON tocca: pricing, stampa, Resend, pagamenti, customer dashboard/reports,
-- coverage aggregata, geofence, auth cliente/admin. Nessun cron/trigger.

begin;

-- ---------------------------------------------------------------------------
-- 1. operator_assignments — additivo
-- ---------------------------------------------------------------------------
alter table public.operator_assignments alter column operator_id drop not null;
alter table public.operator_assignments add column if not exists group_access_link_id uuid;
alter table public.operator_assignments add column if not exists device_installation_id text;
alter table public.operator_assignments add column if not exists participant_label text;
-- Un'assignment e' o "personale" (operator_id valorizzato) o "participant di
-- gruppo" (group_access_link_id + device_installation_id valorizzati). Mai
-- entrambi NULL.
alter table public.operator_assignments
  add constraint operator_assignments_identity_present_chk
  check (operator_id is not null or (group_access_link_id is not null and device_installation_id is not null))
  not valid;

-- ---------------------------------------------------------------------------
-- 2. driver_group_access_links
-- ---------------------------------------------------------------------------
-- La FK composita (group_id, campaign_id) qui sotto richiede un vincolo unico
-- su operational_groups(id, campaign_id). id e' gia' PRIMARY KEY (quindi la
-- coppia e' gia' univoca) e campaign_id e' NOT NULL: aggiungerlo e' additivo e
-- immediato. Guardia idempotente.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.operational_groups'::regclass
      and conname = 'operational_groups_id_campaign_key'
  ) then
    alter table public.operational_groups
      add constraint operational_groups_id_campaign_key unique (id, campaign_id);
  end if;
end $$;

create table if not exists public.driver_group_access_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  group_id uuid not null references public.operational_groups(id),
  token_hash text not null unique,                 -- sha256 hex del token grezzo, MAI il token raw
  status text not null default 'active' check (status in ('active','revoked')),
  max_participants integer check (max_participants is null or max_participants > 0),
  expires_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint driver_group_access_links_group_matches_campaign
    foreign key (group_id, campaign_id) references public.operational_groups(id, campaign_id)
);
create index if not exists driver_group_access_links_campaign_group_idx
  on public.driver_group_access_links (campaign_id, group_id);

alter table public.driver_group_access_links enable row level security;
alter table public.driver_group_access_links force row level security;
-- Solo Admin legge/gestisce direttamente la tabella. Il Driver non la tocca
-- mai via PostgREST: passa esclusivamente da driver_group_join (SECURITY
-- DEFINER), che risolve il link dall'hash senza esporre la riga.
create policy driver_group_access_links_admin_all on public.driver_group_access_links
  to authenticated using (public.gps_is_admin()) with check (public.gps_is_admin());

-- ---------------------------------------------------------------------------
-- 3. driver_group_participants
-- ---------------------------------------------------------------------------
create table if not exists public.driver_group_participants (
  id uuid primary key default gen_random_uuid(),
  group_access_link_id uuid not null references public.driver_group_access_links(id),
  campaign_id uuid not null,
  group_id uuid not null,
  assignment_id uuid not null references public.operator_assignments(id),
  device_installation_id text not null,
  display_name text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (group_access_link_id, device_installation_id)   -- stesso device = stesso participant
);
create index if not exists driver_group_participants_campaign_group_idx
  on public.driver_group_participants (campaign_id, group_id);

alter table public.driver_group_participants enable row level security;
alter table public.driver_group_participants force row level security;
create policy driver_group_participants_admin_all on public.driver_group_participants
  to authenticated using (public.gps_is_admin()) with check (public.gps_is_admin());

-- ---------------------------------------------------------------------------
-- 4. gps_assignment_is_valid_v2 — accetta anche assignment anonime (participant)
-- ---------------------------------------------------------------------------
create or replace function public.gps_assignment_is_valid_v2(
  p_assignment_id uuid, p_identity uuid, p_campaign_id uuid, p_group_id uuid,
  p_at timestamptz default now()
) returns boolean
  language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1
    from public.operator_assignments a
    left join public.operator_profiles o on o.user_id = a.operator_id
    join public.campaigns c on c.id = a.campaign_id
    join public.operational_groups g on g.id = a.group_id and g.campaign_id = a.campaign_id
    where a.id = p_assignment_id
      and coalesce(a.operator_id, a.id) = p_identity
      and a.campaign_id = p_campaign_id
      and a.group_id = p_group_id
      and a.status = 'active'
      and a.revoked_at is null
      and a.starts_at <= p_at
      and (a.ends_at is null or a.ends_at > p_at)
      -- assignment personale: l'operatore deve essere attivo. Participant di
      -- gruppo (operator_id NULL): nessun operator_profiles da verificare.
      and (a.operator_id is null or (o.active and o.disabled_at is null))
      and c.status = 'in_progress'
  );
$$;
alter function public.gps_assignment_is_valid_v2(uuid, uuid, uuid, uuid, timestamptz) owner to postgres;
revoke all on function public.gps_assignment_is_valid_v2(uuid, uuid, uuid, uuid, timestamptz) from public;
grant execute on function public.gps_assignment_is_valid_v2(uuid, uuid, uuid, uuid, timestamptz) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. driver_group_join — UNICA RPC che accetta il group token
-- ---------------------------------------------------------------------------
create or replace function public.driver_group_join(
  p_group_token text,
  p_device_id text,
  p_display_name text
) returns jsonb
  language plpgsql security definer set search_path to ''
as $$
declare
  v_hash text;
  v_link public.driver_group_access_links%rowtype;
  v_participant public.driver_group_participants%rowtype;
  v_assignment public.operator_assignments%rowtype;
  v_name text;
  v_base text;
  v_count integer;
  v_suffix integer;
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

  -- Stesso device -> stesso participant (mai un duplicato).
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
    select * into v_assignment from public.operator_assignments where id = v_participant.assignment_id;
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

  -- Nuovo participant: limite opzionale.
  if v_link.max_participants is not null then
    select count(*) into v_count
    from public.driver_group_participants
    where group_access_link_id = v_link.id and status = 'active';
    if v_count >= v_link.max_participants then
      raise exception 'GROUP_LINK_PIENO' using errcode = '42501';
    end if;
  end if;

  v_base := btrim(coalesce(p_display_name, ''));
  if length(v_base) < 1 then
    raise exception 'NOME_OPERATIVO_OBBLIGATORIO' using errcode = '22023';
  end if;
  v_base := left(v_base, 40);

  -- Disambiguazione non tecnica per nomi uguali sullo stesso link.
  v_name := v_base;
  v_suffix := 1;
  while exists (
    select 1 from public.driver_group_participants
    where group_access_link_id = v_link.id and status = 'active'
      and lower(display_name) = lower(v_name)
  ) loop
    v_suffix := v_suffix + 1;
    v_name := v_base || ' ' || v_suffix;
  end loop;

  -- Assignment anonima del participant (operator_id NULL). access_token
  -- generato dal DEFAULT della colonna = token PERSONALE.
  insert into public.operator_assignments (
    operator_id, campaign_id, group_id, status, starts_at,
    group_access_link_id, device_installation_id, participant_label, metadata
  ) values (
    null, v_link.campaign_id, v_link.group_id, 'active', now(),
    v_link.id, btrim(p_device_id), v_name,
    jsonb_build_object('source', 'driver_group_access')
  ) returning * into v_assignment;

  insert into public.driver_group_participants (
    group_access_link_id, campaign_id, group_id, assignment_id,
    device_installation_id, display_name, last_seen_at
  ) values (
    v_link.id, v_link.campaign_id, v_link.group_id, v_assignment.id,
    btrim(p_device_id), v_name, now()
  ) returning * into v_participant;

  insert into public.gps_operator_audit_log (operator_id, action, campaign_id, assignment_id, context)
  values (
    v_assignment.id, 'group_participant_joined', v_link.campaign_id, v_assignment.id,
    jsonb_build_object('group_access_link_id', v_link.id, 'participant_id', v_participant.id)
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
-- Il link di gruppo e' aperto da un device NON loggato (come il link
-- personale): stesso pattern di grant di gps_start_session.
grant execute on function public.driver_group_join(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Admin — genera / revoca / rigenera il group access link
-- ---------------------------------------------------------------------------
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
  if not exists (
    select 1 from public.operational_groups
    where id = p_group_id and campaign_id = p_campaign_id
  ) then
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

create or replace function public.admin_revoke_group_access_link(p_id uuid)
returns public.driver_group_access_links
  language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.driver_group_access_links%rowtype;
begin
  if v_uid is null or not public.gps_is_admin() then
    raise exception 'SOLO_ADMIN' using errcode = '42501';
  end if;
  update public.driver_group_access_links
    set status = 'revoked', revoked_at = coalesce(revoked_at, now())
    where id = p_id
    returning * into v_row;
  if not found then
    raise exception 'GROUP_LINK_NON_TROVATO' using errcode = 'P0002';
  end if;
  -- La revoca impedisce NUOVI join. NON tocca participant/assignment/sessioni
  -- gia' attivi: l'Admin li gestisce separatamente.
  return v_row;
end;
$$;
alter function public.admin_revoke_group_access_link(uuid) owner to postgres;
revoke all on function public.admin_revoke_group_access_link(uuid) from public, anon;
grant execute on function public.admin_revoke_group_access_link(uuid) to authenticated;

-- Lettura Admin dello stato link (senza token, mai il raw).
create or replace function public.admin_get_group_access_link(p_campaign_id uuid, p_group_id uuid)
returns jsonb
  language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.driver_group_access_links%rowtype;
  v_participants integer;
begin
  if v_uid is null or not public.gps_is_admin() then
    raise exception 'SOLO_ADMIN' using errcode = '42501';
  end if;
  select * into v_row from public.driver_group_access_links
  where campaign_id = p_campaign_id and group_id = p_group_id and status = 'active'
  order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('exists', false);
  end if;
  select count(*) into v_participants
  from public.driver_group_participants
  where group_access_link_id = v_row.id and status = 'active';
  return jsonb_build_object(
    'exists', true, 'id', v_row.id, 'status', v_row.status,
    'max_participants', v_row.max_participants, 'expires_at', v_row.expires_at,
    'participants', v_participants, 'created_at', v_row.created_at
  );
end;
$$;
alter function public.admin_get_group_access_link(uuid, uuid) owner to postgres;
revoke all on function public.admin_get_group_access_link(uuid, uuid) from public, anon;
grant execute on function public.admin_get_group_access_link(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Funzioni esistenti resE participant-aware (operator_id ora nullable).
--    CREATE OR REPLACE, stessa firma. Per un'assignment personale il
--    comportamento e' identico (coalesce(operator_id, id) = operator_id).
-- ---------------------------------------------------------------------------

-- log_assignment_event: assignment_event_log.operator_id e' NOT NULL. Per un
-- participant (operator_id NULL) l'INSERT falliva -> "Conferma programma"
-- rotta. Usa l'identita' coalesce(operator_id, id) nei controlli e negli
-- insert, cosi' il campo resta valorizzato.
create or replace function public.log_assignment_event(
  p_assignment_id uuid, p_action text, p_access_token text default null
) returns void
  language plpgsql security definer set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
  v_is_admin boolean := public.gps_is_admin();
  v_identity uuid;
begin
  if p_action not in (
    'assignment_program_sent', 'assignment_program_opened',
    'assignment_program_confirmed', 'assignment_program_revoked'
  ) then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_assignment from public.operator_assignments where id = p_assignment_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  v_identity := coalesce(v_assignment.operator_id, v_assignment.id);

  if v_uid is null then
    if p_access_token is null or v_assignment.access_token <> p_access_token then
      raise exception 'UNAUTHORIZED';
    end if;
    v_uid := v_identity;
  end if;

  if p_action = 'assignment_program_sent' and not v_is_admin then raise exception 'UNAUTHORIZED'; end if;
  if p_action = 'assignment_program_opened' and v_identity <> v_uid then raise exception 'UNAUTHORIZED'; end if;

  if p_action = 'assignment_program_confirmed' then
    if v_identity <> v_uid then raise exception 'UNAUTHORIZED'; end if;
    if v_assignment.status <> 'active'
       or (v_assignment.starts_at is not null and v_assignment.starts_at > now())
       or (v_assignment.ends_at is not null and v_assignment.ends_at <= now()) then
      raise exception 'ASSIGNMENT_NOT_ACTIVE';
    end if;
    if not exists (
      select 1 from public.assignment_event_log opened
      where opened.assignment_id = p_assignment_id
        and opened.event_type = 'assignment_program_opened'
    ) then raise exception 'PROGRAM_NOT_OPENED'; end if;
    insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
    values (p_assignment_id, v_identity, v_assignment.campaign_id, p_action)
    on conflict do nothing;
    return;
  end if;

  if p_action = 'assignment_program_revoked' then
    if not v_is_admin then raise exception 'UNAUTHORIZED'; end if;
    insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
    values (p_assignment_id, v_identity, v_assignment.campaign_id, p_action);
    return;
  end if;

  if exists (
    select 1 from public.assignment_event_log
    where assignment_id = p_assignment_id and event_type = p_action
      and created_at > now() - interval '5 minutes'
  ) then return; end if;

  insert into public.assignment_event_log (assignment_id, operator_id, campaign_id, event_type)
  values (p_assignment_id, v_identity, v_assignment.campaign_id, p_action);
end;
$$;
alter function public.log_assignment_event(uuid, text, text) owner to postgres;

-- admin_list_campaign_assignments: mostra participant_label quando
-- operator_id e' NULL (participant di gruppo), altrimenti display_name.
create or replace function public.admin_list_campaign_assignments(p_campaign_id uuid)
returns table(id uuid, campaign_id uuid, operator_id uuid, operator_name text, operator_phone text,
  group_id uuid, zone_id uuid, status text, starts_at timestamptz, ends_at timestamptz,
  revoked_at timestamptz, metadata jsonb, created_by uuid, created_at timestamptz,
  updated_at timestamptz, access_token text)
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.' using errcode = '42501';
  end if;
  if p_campaign_id is null then
    raise exception 'campaign_id obbligatorio.' using errcode = '22023';
  end if;
  return query
    select oa.id, oa.campaign_id, oa.operator_id,
      coalesce(op.display_name, oa.participant_label, oa.operator_id::text) as operator_name,
      p.phone as operator_phone,
      oa.group_id, oa.zone_id, oa.status, oa.starts_at, oa.ends_at, oa.revoked_at,
      oa.metadata, oa.created_by, oa.created_at, oa.updated_at, oa.access_token
    from public.operator_assignments oa
    left join public.operator_profiles op on op.user_id = oa.operator_id
    left join public.profiles p on p.id = oa.operator_id
    where oa.campaign_id = p_campaign_id
    order by oa.created_at desc;
end;
$$;
alter function public.admin_list_campaign_assignments(uuid) owner to postgres;

commit;
