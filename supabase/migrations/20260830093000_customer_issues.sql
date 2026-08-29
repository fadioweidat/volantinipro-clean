-- SEGNALAZIONI CLIENTE -> AUTISTA — tabelle + RLS.
--
-- PROPOSTA, NON APPLICATA in questo turno.
--
--   customer_issues            — la segnalazione (via/civico/motivo), con
--                                routing automatico verso l'assignment/driver
--                                responsabile della zona, fallback admin_queue.
--   issue_verification_photos  — foto di VERIFICA, tabella SEPARATA da
--                                proof_photos: non entra mai nella gallery
--                                generale. Geolocalizzazione obbligatoria.
--   issue_events               — eventi in-app (created/assigned/resolved).
--
-- RLS: Cliente vede/crea solo sulle proprie campagne; Driver vede/aggiorna
-- solo le issue di una propria assignment; Admin tutto. Nessuna policy
-- permissiva generica. Nessun access_token in nessuna colonna.

begin;

-- ---------------------------------------------------------------------------
-- customer_issues
-- ---------------------------------------------------------------------------
create table if not exists public.customer_issues (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  created_by uuid not null references auth.users(id),
  municipality text not null,
  street text not null,
  house_number text,
  lat double precision,
  lng double precision,
  reason text not null check (reason in ('non_ricevuto', 'via_non_coperta', 'zona_da_verificare', 'altro')),
  notes text,
  status text not null default 'new' check (status in ('new', 'assigned', 'in_progress', 'resolved', 'not_resolvable')),
  zone_id uuid references public.campaign_zones(id),
  assignment_id uuid references public.operator_assignments(id),
  routed_to text not null default 'admin_queue' check (routed_to in ('driver', 'admin_queue')),
  driver_id uuid,                        -- coalesce(assignment.operator_id, assignment.id)
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid,
  taken_at timestamptz,                  -- quando il Driver ha preso in carico
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists customer_issues_campaign_status_idx on public.customer_issues (campaign_id, status);
create index if not exists customer_issues_assignment_idx on public.customer_issues (assignment_id) where assignment_id is not null;

alter table public.customer_issues enable row level security;
alter table public.customer_issues force row level security;

-- Cliente proprietario della campagna: legge e crea (created_by = se stesso).
create policy customer_issues_owner_select on public.customer_issues for select to authenticated
  using (public.current_user_owns_campaign(campaign_id));
create policy customer_issues_owner_insert on public.customer_issues for insert to authenticated
  with check (public.current_user_owns_campaign(campaign_id) and created_by = auth.uid());

-- Admin: tutto.
create policy customer_issues_admin_all on public.customer_issues for all to authenticated
  using (public.gps_is_admin()) with check (public.gps_is_admin());

-- Driver autenticato: SELECT/UPDATE solo le issue di una propria assignment.
-- (Il driver token-mode passa comunque da RPC SECURITY DEFINER.)
create policy customer_issues_driver_select on public.customer_issues for select to authenticated
  using (exists (
    select 1 from public.operator_assignments a
    where a.id = customer_issues.assignment_id and a.operator_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- issue_verification_photos — SEPARATA da proof_photos
-- ---------------------------------------------------------------------------
create table if not exists public.issue_verification_photos (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.customer_issues(id),
  campaign_id uuid not null references public.campaigns(id),
  assignment_id uuid references public.operator_assignments(id),
  driver_id uuid,
  storage_path text not null,            -- bucket 'proof-photos', prefisso campaign/<cid>/issue/<issue_id>/photo/
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  address_label text,
  note text,
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists ivp_issue_idx on public.issue_verification_photos (issue_id);

alter table public.issue_verification_photos enable row level security;
alter table public.issue_verification_photos force row level security;

create policy ivp_admin_all on public.issue_verification_photos for all to authenticated
  using (public.gps_is_admin()) with check (public.gps_is_admin());

-- Cliente: legge solo le foto delle issue delle proprie campagne.
create policy ivp_customer_select on public.issue_verification_photos for select to authenticated
  using (exists (
    select 1 from public.customer_issues i
    where i.id = issue_verification_photos.issue_id and public.current_user_owns_campaign(i.campaign_id)
  ));

-- Driver autenticato: legge solo le foto delle issue di una propria assignment.
create policy ivp_driver_select on public.issue_verification_photos for select to authenticated
  using (exists (
    select 1 from public.operator_assignments a
    where a.id = issue_verification_photos.assignment_id and a.operator_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- issue_events — notifiche in-app (nessun push/SMS/WhatsApp)
-- ---------------------------------------------------------------------------
create table if not exists public.issue_events (
  id bigint generated always as identity primary key,
  issue_id uuid not null references public.customer_issues(id),
  event_type text not null check (event_type in (
    'CUSTOMER_ISSUE_CREATED', 'DRIVER_ISSUE_ASSIGNED', 'DRIVER_ISSUE_RESOLVED', 'CUSTOMER_ISSUE_RESOLVED'
  )),
  actor uuid,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists issue_events_issue_idx on public.issue_events (issue_id, created_at);

alter table public.issue_events enable row level security;
alter table public.issue_events force row level security;

create policy issue_events_admin_all on public.issue_events for all to authenticated
  using (public.gps_is_admin()) with check (public.gps_is_admin());
create policy issue_events_customer_select on public.issue_events for select to authenticated
  using (exists (
    select 1 from public.customer_issues i
    where i.id = issue_events.issue_id and public.current_user_owns_campaign(i.campaign_id)
  ));
create policy issue_events_driver_select on public.issue_events for select to authenticated
  using (exists (
    select 1 from public.customer_issues i
    join public.operator_assignments a on a.id = i.assignment_id
    where i.id = issue_events.issue_id and a.operator_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Storage: le foto di verifica vivono nel bucket privato 'proof-photos' ma
-- sotto un prefisso DEDICATO campaign/<cid>/issue/<iid>/photo/ (mai
-- .../session/...), cosi' non si mischiano coi POD normali. L'upload e'
-- consentito ad anon/authenticated SOLO su quel prefisso; l'autorizzazione
-- reale (issue <-> assignment <-> token) e' in driver_register_issue_photo,
-- che rifiuta di registrare oggetti non collegati a una issue valida. Gli
-- oggetti orfani non vengono mai referenziati/serviti.
drop policy if exists issue_photos_storage_insert on storage.objects;
create policy issue_photos_storage_insert on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'proof-photos'
    and name like 'campaign/%/issue/%/photo/%'
    and name not like '%..%'
  );
drop policy if exists issue_photos_storage_select on storage.objects;
create policy issue_photos_storage_select on storage.objects for select to authenticated
  using (
    bucket_id = 'proof-photos'
    and name like 'campaign/%/issue/%/photo/%'
    and exists (
      select 1 from public.issue_verification_photos p
      where p.storage_path = storage.objects.name
        and (public.gps_is_admin()
          or exists (select 1 from public.customer_issues i
             where i.id = p.issue_id and public.current_user_owns_campaign(i.campaign_id))
          or exists (select 1 from public.operator_assignments a
             where a.id = p.assignment_id and a.operator_id = auth.uid()))
    )
  );

-- updated_at trigger riusa il pattern generico gia' presente se esiste;
-- altrimenti semplice.
create or replace function public.customer_issues_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists customer_issues_set_updated_at on public.customer_issues;
create trigger customer_issues_set_updated_at before update on public.customer_issues
  for each row execute function public.customer_issues_touch_updated_at();

commit;
