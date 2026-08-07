-- =============================================================================
-- 20260806150009_admin_driver_assignment_flow.sql
--
-- ADMIN-DRIVER-LINK-2 — RC2-FIX-1 — Riscrittura completa
--
-- Sostituisce integralmente la versione precedente di questo stesso file
-- (mai committata, mai applicata ad alcun database, scartata dopo audit
-- forense RC2-FORENSIC-AND-FREEZE-1). Quella versione presupponeva uno
-- schema di operator_profiles (colonne id/phone/status/metadata) copiato
-- dalla migrazione locale di sviluppo 034_operator_profiles.sql, mai
-- verificato contro il vero schema remoto — 3 RPC su 7 fallivano con un
-- errore Postgres reale e riproducibile.
--
-- Questa versione usa ESCLUSIVAMENTE colonne verificate realmente presenti
-- sul database remoto (query dirette pg_catalog/information_schema,
-- 2026-08-06, sola lettura):
--
--   operator_profiles: user_id (non "id"), display_name, active (boolean,
--     non "status" testuale), disabled_at, created_at, updated_at.
--     NESSUNA colonna phone/metadata su questa tabella.
--   profiles: id (= auth.users.id), full_name, phone, company_name, role,
--     created_at, updated_at. Il telefono/nome operatore, quando serve,
--     viene letto da qui via LEFT JOIN su profiles.id = operator_profiles.user_id
--     (ogni utente autenticato ha una riga profiles creata automaticamente
--     dal trigger handle_new_user() sul bootstrap del progetto). Se assente,
--     la RPC restituisce null — il client mostra "dato non disponibile",
--     mai un valore inventato.
--   operator_assignments: id, operator_id, campaign_id, group_id, status,
--     starts_at, ends_at, revoked_at, created_by, created_at, updated_at,
--     zone_id, metadata.
--   audit_log: id, created_at, actor_id, actor_email, action, resource_type,
--     resource_id (text, non uuid), metadata, success (not null),
--     error_message, user_agent. NESSUNA colonna admin_id — la versione
--     precedente vi scriveva "admin_id", inesistente, fallendo sempre.
--   delivery_sessions: ..., driver_id, driver_name, driver_phone, device_id,
--     assignment_id, campaign_zone_id, status, started_at, paused_at,
--     ended_at, metadata.
--
-- SICUREZZA
--   - Tutte le RPC di scrittura/lettura sensibile: SECURITY DEFINER,
--     SET search_path = public, pg_temp
--   - Controllo admin: public.jwt_is_admin() — server-side, non bypassabile
--   - GRANT EXECUTE solo a 'authenticated' — mai a 'anon' o 'public'
--   - operator_id e campaign_id immutabili dopo creazione (rifiutati nel patch)
--   - Nessuna scrittura diretta nel ledger public.volantinipro_release_migrations
--     da questa migrazione — il ledger resta di competenza esclusiva del runner
--     (scripts/deploy-production-migrations.mjs). La versione precedente
--     violava questo principio con un blocco di "self-registration" che
--     falliva sempre silenziosamente per mismatch di colonne — rimosso.
--
-- IDEMPOTENZA
--   - CREATE OR REPLACE per tutte le funzioni
--   - CREATE TABLE IF NOT EXISTS per operator_assignment_zones
--   - CREATE INDEX IF NOT EXISTS
--   - CREATE POLICY: DROP IF EXISTS + CREATE
--   - Seconda applicazione: nessun errore, nessun effetto aggiuntivo
--
-- VERSIONE
--   Successiva a 20260806150008. Non collide con nessuna delle versioni
--   nel ledger remoto. Non usa naming legacy (0NN_). Non dipende dal
--   contenuto del file locale supabase/migrations/037_admin_assignment_rpc.sql
--   (che resta locale, non incluso in questa catena production-safe).
--
-- RPC esposte
--   admin_list_operators()
--   admin_list_campaign_assignments(p_campaign_id)
--   admin_create_operator_assignment(...)
--   admin_update_operator_assignment(p_id, p_patch)
--   admin_revoke_operator_assignment(p_id)
--   get_driver_assignment(p_assignment_id)          -- nuova: lettura driver via RPC
--   list_assignment_zones(p_assignment_id)           -- nuova: lettura zone (admin o driver proprietario)
--   admin_set_assignment_zones(p_assignment_id, p_zones)
--
-- TABELLA NUOVA
--   operator_assignment_zones — ponte strutturato (id, assignment_id, zone_id
--   nullable, municipality_code nullable, municipality_name, quantity, created_at)
--
-- SEMANTICA REVOCA (Fase 7 del ticket RC2-FIX-1)
--   Implementata modificando (CREATE OR REPLACE, comportamento invariato per
--   il caso non-revocato) la funzione GPS esistente gps_transition_session:
--   una volta che operator_assignments.status = 'revoked', l'operatore
--   proprietario può ancora eseguire SOLO 'complete'/'cancel' sulla propria
--   sessione già aperta (per poterla chiudere pulitamente) — 'pause' e
--   'resume' sono rifiutati con errore dedicato ASSEGNAZIONE_REVOCATA.
--   Le nuove sessioni erano già bloccate in precedenza da
--   gps_assignment_is_valid() (verificato, nessuna modifica necessaria lì).
--   admin_revoke_operator_assignment marca operator_assignments.metadata
--   con '_revoked_pending_stop: true' se al momento della revoca esiste una
--   sessione 'started'/'paused' collegata — visibile all'Admin.
--
-- VERIFICA POST-MIGRAZIONE (da eseguire manualmente dopo --apply)
--   select exists (select 1 from information_schema.tables
--     where table_name = 'operator_assignment_zones');  -- deve essere true
--
--   select count(*) from public.operator_assignment_zones;  -- deve essere 0
--
--   select proname from pg_proc
--   where proname in (
--     'admin_list_operators', 'admin_list_campaign_assignments',
--     'admin_create_operator_assignment', 'admin_update_operator_assignment',
--     'admin_revoke_operator_assignment', 'get_driver_assignment',
--     'list_assignment_zones', 'admin_set_assignment_zones'
--   );  -- deve restituire 8 righe
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- SEZIONE 0 — Estensione whitelist audit_log.action
-- audit_log.action ha un CHECK constraint con una whitelist chiusa di valori
-- (verificato 2026-08-06: 22 valori esistenti, nessun jolly/pattern aperto).
-- Le 3 nuove azioni di questa migrazione vanno aggiunte esplicitamente,
-- altrimenti ogni INSERT in audit_log fallirebbe silenziosamente (catturato
-- dal blocco "exception when others" di ciascuna RPC, ma senza audit trail
-- reale — inaccettabile per RPC che modificano dati sensibili). Idempotente:
-- DROP + ADD ricrea sempre lo stesso vincolo esteso, mai un errore se già
-- applicato in precedenza.
-- ---------------------------------------------------------------------------

alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action = any (array[
    'login_requested','login_succeeded','login_failed',
    'campaign_saved','campaign_save_failed',
    'waitlist_submitted','waitlist_submit_failed',
    'waitlist_marked_handled','waitlist_mark_handled_failed',
    'admin_access_granted','admin_access_denied','admin_access_no_session',
    'crm_client_updated','crm_referente_created','crm_referente_updated','crm_referente_deleted',
    'dms_document_uploaded','dms_document_upload_failed',
    'dms_document_deleted','dms_document_delete_failed',
    'config_setting_updated','config_setting_update_failed',
    'ai_anomaly_scan_performed',
    'admin_create_operator_assignment',
    'admin_update_operator_assignment',
    'admin_revoke_operator_assignment'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- SEZIONE 1 — Tabella ponte: operator_assignment_zones
-- ---------------------------------------------------------------------------

create table if not exists public.operator_assignment_zones (
  id                  uuid        primary key default gen_random_uuid(),
  assignment_id       uuid        not null
                        references public.operator_assignments(id) on delete cascade,
  zone_id             uuid        null
                        references public.campaign_zones(id) on delete set null,
  municipality_code   text        null,
  municipality_name   text        not null check (char_length(municipality_name) between 1 and 200),
  quantity            integer     null check (quantity is null or quantity >= 0),
  created_at          timestamptz not null default now()
);

create index if not exists idx_oaz_assignment_id
  on public.operator_assignment_zones(assignment_id);

create index if not exists idx_oaz_zone_id
  on public.operator_assignment_zones(zone_id)
  where zone_id is not null;

-- Evita righe duplicate per lo stesso comune sulla stessa assegnazione
-- quando zone_id è nullo (testo libero); quando zone_id è presente, la FK
-- + questo indice unico parziale evitano doppioni sulla stessa zona.
create unique index if not exists uq_oaz_assignment_municipality
  on public.operator_assignment_zones(assignment_id, municipality_name)
  where zone_id is null;

create unique index if not exists uq_oaz_assignment_zone
  on public.operator_assignment_zones(assignment_id, zone_id)
  where zone_id is not null;

comment on table public.operator_assignment_zones is
  'Ponte strutturato fra operator_assignments e zone/comuni. '
  'Creato da ADMIN-DRIVER-LINK-2 (20260806150009, riscritta in RC2-FIX-1).';

alter table public.operator_assignment_zones enable row level security;
alter table public.operator_assignment_zones force row level security;

drop policy if exists "oaz_operator_read_own" on public.operator_assignment_zones;
create policy "oaz_operator_read_own"
  on public.operator_assignment_zones
  for select
  using (
    exists (
      select 1 from public.operator_assignments oa
      where oa.id = operator_assignment_zones.assignment_id
        and oa.operator_id = auth.uid()
    )
  );

drop policy if exists "oaz_admin_all" on public.operator_assignment_zones;
create policy "oaz_admin_all"
  on public.operator_assignment_zones
  for all
  using (public.jwt_is_admin())
  with check (public.jwt_is_admin());

revoke all on table public.operator_assignment_zones from public, anon;
grant select on table public.operator_assignment_zones to authenticated;

-- ---------------------------------------------------------------------------
-- SEZIONE 2 — admin_list_operators
-- Colonne reali: operator_profiles.user_id/display_name/active/disabled_at.
-- Telefono/nome completo (quando disponibili) da profiles via LEFT JOIN.
-- ---------------------------------------------------------------------------

-- Il contratto di output usa "id" (alias di operator_profiles.user_id) e
-- "status" (testo derivato da active/disabled_at) deliberatamente: sono
-- alias del contratto pubblico della RPC, non colonne inventate sulla
-- tabella — la query interna usa esclusivamente le colonne reali verificate
-- (user_id, active, disabled_at). Questo mantiene compatibile il frontend
-- (AssignWork.jsx/CampaignAssignments.jsx, già scritti per "op.id"/"op.status")
-- senza introdurre alcuna assunzione falsa sullo schema fisico.
create or replace function public.admin_list_operators()
returns table (
  id            uuid,
  display_name  text,
  phone         text,
  status        text,
  active        boolean,
  created_at    timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;

  return query
    select
      op.user_id as id,
      op.display_name,
      p.phone,
      case when op.active and op.disabled_at is null then 'active' else 'inactive' end as status,
      op.active,
      op.created_at
    from public.operator_profiles op
    left join public.profiles p on p.id = op.user_id
    where op.active = true
      and op.disabled_at is null
    order by op.display_name asc nulls last, op.created_at desc;
end;
$$;

revoke all on function public.admin_list_operators() from public, anon, authenticated;
grant  execute on function public.admin_list_operators() to authenticated;

-- ---------------------------------------------------------------------------
-- SEZIONE 3 — admin_list_campaign_assignments
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_campaign_assignments(
  p_campaign_id uuid
)
returns table (
  id              uuid,
  campaign_id     uuid,
  operator_id     uuid,
  operator_name   text,
  operator_phone  text,
  group_id        uuid,
  zone_id         uuid,
  status          text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  revoked_at      timestamptz,
  metadata        jsonb,
  created_by      uuid,
  created_at      timestamptz,
  updated_at      timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;
  if p_campaign_id is null then
    raise exception 'campaign_id obbligatorio.' using errcode = '22023';
  end if;

  return query
    select
      oa.id,
      oa.campaign_id,
      oa.operator_id,
      coalesce(op.display_name, oa.operator_id::text) as operator_name,
      p.phone                                          as operator_phone,
      oa.group_id,
      oa.zone_id,
      oa.status,
      oa.starts_at,
      oa.ends_at,
      oa.revoked_at,
      oa.metadata,
      oa.created_by,
      oa.created_at,
      oa.updated_at
    from public.operator_assignments oa
    left join public.operator_profiles op on op.user_id = oa.operator_id
    left join public.profiles p            on p.id      = oa.operator_id
    where oa.campaign_id = p_campaign_id
    order by oa.created_at desc;
end;
$$;

revoke all on function public.admin_list_campaign_assignments(uuid) from public, anon, authenticated;
grant  execute on function public.admin_list_campaign_assignments(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- SEZIONE 4 — admin_create_operator_assignment
-- Validazioni reali: campaign_id esiste, operator_id valido e attivo
-- (operator_profiles.user_id + active = true), starts_at < ends_at,
-- nessuna sovrapposizione con un'assegnazione attiva esistente dello
-- stesso operatore sulla stessa campagna (intervallo semi-aperto).
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_operator_assignment(
  p_campaign_id  uuid,
  p_operator_id  uuid,
  p_group_id     uuid        default null,
  p_zone_id      uuid        default null,
  p_starts_at    timestamptz default null,
  p_ends_at      timestamptz default null,
  p_metadata     jsonb       default '{}',
  p_notes        text        default null
)
returns public.operator_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id  uuid;
  v_result    public.operator_assignments;
  v_meta      jsonb;
  v_overlap   boolean;
  v_group_id  uuid;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;

  if p_campaign_id is null then
    raise exception 'campaign_id obbligatorio.' using errcode = '22023';
  end if;
  if p_operator_id is null then
    raise exception 'operator_id obbligatorio.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'Campagna non trovata (id: %).', p_campaign_id
      using errcode = '02000';
  end if;

  if p_ends_at is not null and p_starts_at is not null
     and p_ends_at <= p_starts_at then
    raise exception 'ends_at deve essere strettamente successivo a starts_at.'
      using errcode = '22023';
  end if;

  -- operator_assignments.group_id e' NOT NULL sullo schema reale (verificato
  -- 2026-08-06) ed e' richiesto dalla catena GPS esistente
  -- (gps_assignment_is_valid fa JOIN su operational_groups). Il frontend
  -- (AssignWork.jsx) presenta il gruppo come campo facoltativo: quando
  -- p_group_id non e' fornito, si riusa il primo gruppo gia' esistente per
  -- la campagna oppure, se nessuno esiste, se ne crea uno di default
  -- ("Generale") — idempotente per campagna (si riusa se gia' creato in una
  -- chiamata precedente). Se p_group_id e' fornito esplicitamente, deve
  -- appartenere alla stessa campagna.
  if p_group_id is not null then
    if not exists (
      select 1 from public.operational_groups
      where id = p_group_id and campaign_id = p_campaign_id
    ) then
      raise exception 'Gruppo operativo non trovato per questa campagna (id: %).', p_group_id
        using errcode = '02000';
    end if;
    v_group_id := p_group_id;
  else
    select id into v_group_id
    from public.operational_groups
    where campaign_id = p_campaign_id
    order by created_at asc nulls last
    limit 1;

    if v_group_id is null then
      insert into public.operational_groups (id, campaign_id, name)
      values (gen_random_uuid(), p_campaign_id, 'Generale')
      returning id into v_group_id;
    end if;
  end if;

  -- Operatore valido = riga in operator_profiles con active = true, non disabilitato
  if not exists (
    select 1 from public.operator_profiles
    where user_id = p_operator_id
      and active = true
      and disabled_at is null
  ) then
    raise exception 'Operatore non trovato, non attivo o disabilitato (id: %).',
      p_operator_id using errcode = '22023';
  end if;

  -- Nessuna sovrapposizione con un'assegnazione attiva esistente dello
  -- stesso operatore sulla stessa campagna. Intervallo semi-aperto
  -- [starts_at, ends_at); ends_at null = aperto (nessun limite superiore).
  select exists (
    select 1 from public.operator_assignments a
    where a.operator_id = p_operator_id
      and a.campaign_id = p_campaign_id
      and a.status = 'active'
      and (a.ends_at is null or a.ends_at > coalesce(p_starts_at, now()))
      and (p_ends_at is null or a.starts_at < p_ends_at)
  ) into v_overlap;

  if v_overlap then
    raise exception 'Esiste già un''assegnazione attiva sovrapposta per questo operatore su questa campagna.'
      using errcode = '23505';
  end if;

  v_admin_id := auth.uid();

  v_meta := coalesce(p_metadata, '{}'::jsonb);
  if p_notes is not null then
    v_meta := v_meta || jsonb_build_object('notes', p_notes);
  end if;
  v_meta := v_meta || jsonb_build_object(
    '_created_by_admin', v_admin_id,
    '_created_at_iso',   now()::text
  );

  insert into public.operator_assignments (
    campaign_id, operator_id, group_id, zone_id,
    status, starts_at, ends_at,
    created_by, metadata, created_at, updated_at
  ) values (
    p_campaign_id, p_operator_id, v_group_id, p_zone_id,
    'active', p_starts_at, p_ends_at,
    v_admin_id, v_meta, now(), now()
  )
  returning * into v_result;

  begin
    insert into public.audit_log (
      actor_id, action, resource_type, resource_id,
      success, metadata
    ) values (
      v_admin_id,
      'admin_create_operator_assignment',
      'operator_assignments',
      v_result.id::text,
      true,
      jsonb_build_object(
        'campaign_id',  p_campaign_id,
        'operator_id',  p_operator_id,
        'group_id',     p_group_id,
        'zone_id',      p_zone_id,
        'starts_at',    p_starts_at,
        'ends_at',      p_ends_at
      )
    );
  exception when others then
    raise notice 'audit_log insert skipped: %', sqlerrm;
  end;

  return v_result;
end;
$$;

revoke all on function public.admin_create_operator_assignment(uuid,uuid,uuid,uuid,timestamptz,timestamptz,jsonb,text) from public, anon, authenticated;
grant  execute on function public.admin_create_operator_assignment(uuid,uuid,uuid,uuid,timestamptz,timestamptz,jsonb,text) to authenticated;

-- ---------------------------------------------------------------------------
-- SEZIONE 5 — admin_update_operator_assignment
-- operator_id e campaign_id immutabili (rifiutati esplicitamente nel patch).
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_operator_assignment(
  p_id    uuid,
  p_patch jsonb
)
returns public.operator_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id  uuid;
  v_result    public.operator_assignments;
  v_starts    timestamptz;
  v_ends      timestamptz;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'id obbligatorio.' using errcode = '22023';
  end if;
  if p_patch is null then
    raise exception 'patch non può essere null.' using errcode = '22023';
  end if;

  if p_patch ? 'operator_id' or p_patch ? 'campaign_id' then
    raise exception 'operator_id e campaign_id sono immutabili dopo la creazione.'
      using errcode = '22023';
  end if;

  select
    coalesce((p_patch->>'starts_at')::timestamptz, starts_at),
    coalesce((p_patch->>'ends_at')::timestamptz,   ends_at)
  into v_starts, v_ends
  from public.operator_assignments
  where id = p_id;

  if not found then
    raise exception 'Assegnazione non trovata (id: %).', p_id
      using errcode = '02000';
  end if;

  if v_ends is not null and v_starts is not null and v_ends <= v_starts then
    raise exception 'ends_at deve essere strettamente successivo a starts_at.'
      using errcode = '22023';
  end if;

  v_admin_id := auth.uid();

  update public.operator_assignments set
    starts_at  = coalesce((p_patch->>'starts_at')::timestamptz, starts_at),
    ends_at    = coalesce((p_patch->>'ends_at')::timestamptz,   ends_at),
    group_id   = coalesce((p_patch->>'group_id')::uuid,         group_id),
    zone_id    = coalesce((p_patch->>'zone_id')::uuid,          zone_id),
    metadata   = case
                   when p_patch ? 'metadata'
                   then metadata || (p_patch->'metadata')
                   else metadata
                 end
                 || jsonb_build_object(
                      '_last_updated_by', v_admin_id,
                      '_last_updated_at', now()::text
                    ),
    updated_at = now()
  where id = p_id
  returning * into v_result;

  begin
    insert into public.audit_log (
      actor_id, action, resource_type, resource_id, success, metadata
    ) values (
      v_admin_id, 'admin_update_operator_assignment',
      'operator_assignments', p_id::text, true, p_patch
    );
  exception when others then
    raise notice 'audit_log insert skipped: %', sqlerrm;
  end;

  return v_result;
end;
$$;

revoke all on function public.admin_update_operator_assignment(uuid,jsonb) from public, anon, authenticated;
grant  execute on function public.admin_update_operator_assignment(uuid,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- SEZIONE 6 — admin_revoke_operator_assignment
-- Marca revoked_pending_stop nel metadata se esiste una sessione GPS
-- ancora 'started'/'paused' collegata (visibile all'Admin).
-- ---------------------------------------------------------------------------

create or replace function public.admin_revoke_operator_assignment(
  p_id uuid
)
returns public.operator_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id  uuid;
  v_result    public.operator_assignments;
  v_had_active_session boolean := false;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'id obbligatorio.' using errcode = '22023';
  end if;

  v_admin_id := auth.uid();

  if not exists (
    select 1 from public.operator_assignments
    where id = p_id
      and status not in ('revoked', 'completed')
  ) then
    raise exception
      'Assegnazione non trovata, già revocata o completata (id: %).', p_id
      using errcode = '02000';
  end if;

  select exists (
    select 1 from public.delivery_sessions ds
    where ds.assignment_id = p_id
      and ds.status in ('started', 'paused')
  ) into v_had_active_session;

  update public.operator_assignments set
    status     = 'revoked',
    revoked_at = now(),
    updated_at = now(),
    metadata   = metadata || jsonb_build_object(
      '_revoked_by',            v_admin_id,
      '_revoked_at',            now()::text,
      '_revoked_pending_stop',  v_had_active_session
    )
  where id = p_id
    and status not in ('revoked', 'completed')
  returning * into v_result;

  begin
    insert into public.audit_log (
      actor_id, action, resource_type, resource_id, success, metadata
    ) values (
      v_admin_id, 'admin_revoke_operator_assignment',
      'operator_assignments', p_id::text, true,
      jsonb_build_object(
        '_revoked_at',           now()::text,
        '_revoked_pending_stop', v_had_active_session
      )
    );
  exception when others then
    raise notice 'audit_log insert skipped: %', sqlerrm;
  end;

  return v_result;
end;
$$;

revoke all on function public.admin_revoke_operator_assignment(uuid) from public, anon, authenticated;
grant  execute on function public.admin_revoke_operator_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- SEZIONE 7 — get_driver_assignment
-- Lettura via RPC (in alternativa alla select diretta già protetta da RLS)
-- per uniformità con il resto della catena e per arricchire il risultato
-- con titolo campagna. Ammessa solo per l'operatore proprietario o l'admin.
-- ---------------------------------------------------------------------------

create or replace function public.get_driver_assignment(
  p_assignment_id uuid
)
returns table (
  id            uuid,
  campaign_id   uuid,
  campaign_title text,
  operator_id   uuid,
  group_id      uuid,
  zone_id       uuid,
  status        text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  revoked_at    timestamptz,
  metadata      jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Non autenticato.' using errcode = '42501';
  end if;
  if p_assignment_id is null then
    raise exception 'assignment_id obbligatorio.' using errcode = '22023';
  end if;

  if not public.jwt_is_admin() then
    if not exists (
      select 1 from public.operator_assignments oa2
      where oa2.id = p_assignment_id and oa2.operator_id = v_uid
    ) then
      raise exception 'Accesso negato.' using errcode = '42501';
    end if;
  end if;

  return query
    select
      oa.id, oa.campaign_id, c.title, oa.operator_id, oa.group_id, oa.zone_id,
      oa.status, oa.starts_at, oa.ends_at, oa.revoked_at, oa.metadata
    from public.operator_assignments oa
    left join public.campaigns c on c.id = oa.campaign_id
    where oa.id = p_assignment_id;
end;
$$;

revoke all on function public.get_driver_assignment(uuid) from public, anon, authenticated;
grant  execute on function public.get_driver_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- SEZIONE 8 — list_assignment_zones / admin_set_assignment_zones
-- ---------------------------------------------------------------------------

create or replace function public.list_assignment_zones(
  p_assignment_id uuid
)
returns setof public.operator_assignment_zones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.jwt_is_admin() then
    if not exists (
      select 1 from public.operator_assignments
      where id = p_assignment_id and operator_id = auth.uid()
    ) then
      raise exception 'Accesso negato.' using errcode = '42501';
    end if;
  end if;

  return query
    select * from public.operator_assignment_zones
    where assignment_id = p_assignment_id
    order by created_at asc;
end;
$$;

revoke all on function public.list_assignment_zones(uuid) from public, anon, authenticated;
grant  execute on function public.list_assignment_zones(uuid) to authenticated;

create or replace function public.admin_set_assignment_zones(
  p_assignment_id uuid,
  p_zones jsonb
)
returns setof public.operator_assignment_zones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elem   jsonb;
  v_row    public.operator_assignment_zones;
  v_name   text;
  v_qty    integer;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;
  if p_assignment_id is null then
    raise exception 'assignment_id obbligatorio.' using errcode = '22023';
  end if;
  if p_zones is null or jsonb_typeof(p_zones) <> 'array' then
    raise exception 'p_zones deve essere un array JSON.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.operator_assignments where id = p_assignment_id
  ) then
    raise exception 'Assegnazione non trovata (id: %).', p_assignment_id
      using errcode = '02000';
  end if;

  delete from public.operator_assignment_zones
  where assignment_id = p_assignment_id;

  for v_elem in select * from jsonb_array_elements(p_zones)
  loop
    v_name := trim(v_elem->>'municipality_name');
    if v_name is null or char_length(v_name) = 0 then
      raise exception 'Ogni zona deve avere municipality_name non vuoto.'
        using errcode = '22023';
    end if;

    if v_elem ? 'quantity' and v_elem->>'quantity' is not null then
      v_qty := (v_elem->>'quantity')::integer;
      if v_qty < 0 then
        raise exception 'quantity non può essere negativa (zona: %).',
          v_name using errcode = '22023';
      end if;
    else
      v_qty := null;
    end if;

    insert into public.operator_assignment_zones (
      assignment_id, zone_id, municipality_name, municipality_code, quantity
    ) values (
      p_assignment_id,
      (v_elem->>'zone_id')::uuid,
      v_name,
      v_elem->>'municipality_code',
      v_qty
    )
    returning * into v_row;

    return next v_row;
  end loop;

  return;
end;
$$;

revoke all on function public.admin_set_assignment_zones(uuid,jsonb) from public, anon, authenticated;
grant  execute on function public.admin_set_assignment_zones(uuid,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- SEZIONE 9 — Semantica revoca: gps_transition_session
-- CREATE OR REPLACE che preserva esattamente il comportamento esistente
-- per assegnazioni non revocate (verificato via pg_get_functiondef prima
-- della modifica) e aggiunge la sola eccezione: se l'assegnazione è
-- revocata, il driver proprietario può ancora eseguire 'complete'/'cancel'
-- sulla propria sessione già aperta, ma non 'pause'/'resume'.
-- gps_start_session NON viene toccata: già blocca correttamente le nuove
-- sessioni su assegnazioni revocate tramite gps_assignment_is_valid()
-- (verificato: quella funzione controlla già status = 'active' and
-- revoked_at is null — nessuna modifica necessaria lì).
-- ---------------------------------------------------------------------------

create or replace function public.gps_transition_session(p_session_id uuid, p_action text)
returns delivery_sessions
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
  v_is_admin boolean := public.gps_is_admin();
  v_assignment_status text;
  v_revoked_at timestamptz;
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select * into v_session
  from public.delivery_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSIONE_NON_TROVATA' using errcode = 'P0002';
  end if;

  if not v_is_admin then
    if v_session.driver_id <> v_uid or v_session.assignment_id is null then
      raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
    end if;

    if not public.gps_assignment_is_valid(
      v_session.assignment_id, v_uid, v_session.campaign_id,
      v_session.group_id, now()
    ) then
      select status, revoked_at into v_assignment_status, v_revoked_at
      from public.operator_assignments
      where id = v_session.assignment_id;

      if v_assignment_status = 'revoked' or v_revoked_at is not null then
        if p_action not in ('complete', 'cancel') then
          raise exception 'ASSEGNAZIONE_REVOCATA: solo il termine della sessione è consentito.'
            using errcode = '42501';
        end if
        -- else: fallthrough consentito, l'assegnazione è revocata ma
        -- l'azione richiesta è la sola terminazione ammessa.
        ;
      else
        raise exception 'SESSIONE_NON_AUTORIZZATA' using errcode = '42501';
      end if;
    end if;
  end if;

  if p_action = 'pause' and v_session.status = 'started' then
    update public.delivery_sessions
      set status = 'paused', paused_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'resume' and v_session.status = 'paused' then
    update public.delivery_sessions
      set status = 'started', paused_at = null, updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'complete' and v_session.status in ('started', 'paused') then
    update public.delivery_sessions
      set status = 'completed', ended_at = now(), updated_at = now()
      where id = p_session_id returning * into v_session;
  elsif p_action = 'cancel' and v_session.status in ('started', 'paused') then
    update public.delivery_sessions
      set status = 'cancelled',
          ended_at = coalesce(ended_at, now()),
          updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'closed_by_admin', v_is_admin,
             'closed_at', now(),
             'previous_status', v_session.status,
             'reason', 'stale_session_recovery'
          )
      where id = p_session_id returning * into v_session;
  else
    raise exception 'TRANSIZIONE_SESSIONE_NON_VALIDA' using errcode = '22023';
  end if;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id
  ) values (
    v_uid, 'session_' || p_action, v_session.campaign_id,
    v_session.assignment_id, v_session.id
  );

  return v_session;
end;
$function$;

commit;
