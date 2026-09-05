-- TICKET — CUSTOMER CONTROL CENTER + ADMIN HUB + DRIVER MESSAGING.
--
-- Nuovo sottosistema additivo: nessuna tabella/RPC GPS, geofence, copertura,
-- Map Studio, pricing, Payments, Supplier Marketplace, auth Admin o driver
-- token access viene toccata da questa migration.
--
-- Modello: due sole tipologie di conversazione, mai una terza.
--   customer_admin -> una per campagna (get-or-create).
--   driver_admin   -> una per assignment (get-or-create).
-- Cliente<->Driver diretto e' STRUTTURALMENTE impossibile: nessuna riga di
-- conversations puo' avere kind diverso da questi due valori, e nessuna RPC
-- permette di specificare un destinatario diverso da 'admin' per
-- Cliente/Driver (vedi CHECK sender_role/recipient_role sotto).
--
-- Stesso pattern di autorizzazione gia' consolidato per customer_issues:
-- Cliente -> auth.uid() + current_user_owns_campaign; Driver -> auth.uid()
-- OPPURE access_token dell'assignment (mai Magic Link/OTP); Admin ->
-- gps_is_admin(). Tutte le scritture/letture passano da RPC SECURITY
-- DEFINER; le tabelle restano protette da RLS "force" per difesa in
-- profondita', ma il frontend non le interroga mai direttamente.

begin;

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('customer_admin', 'driver_admin')),
  campaign_id uuid references public.campaigns(id),
  assignment_id uuid references public.operator_assignments(id),
  customer_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un solo canale per campagna e uno per assignment: evita conversazioni
  -- duplicate create da race condition su get-or-create concorrenti.
  constraint conversations_customer_admin_shape check (
    (kind = 'customer_admin' and campaign_id is not null and customer_id is not null and assignment_id is null)
    or (kind = 'driver_admin' and assignment_id is not null and campaign_id is null and customer_id is null)
  )
);
create unique index if not exists conversations_customer_admin_unique on public.conversations (campaign_id) where kind = 'customer_admin';
create unique index if not exists conversations_driver_admin_unique on public.conversations (assignment_id) where kind = 'driver_admin';

alter table public.conversations enable row level security;
alter table public.conversations force row level security;

create policy conversations_customer_select on public.conversations for select to authenticated
  using (kind = 'customer_admin' and customer_id = auth.uid());
create policy conversations_driver_select on public.conversations for select to authenticated
  using (kind = 'driver_admin' and exists (
    select 1 from public.operator_assignments a where a.id = conversations.assignment_id and a.operator_id = auth.uid()
  ));
create policy conversations_admin_all on public.conversations for all to authenticated
  using (public.gps_is_admin()) with check (public.gps_is_admin());

-- ---------------------------------------------------------------------------
-- conversation_messages
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  sender_role text not null check (sender_role in ('customer', 'driver', 'admin')),
  sender_id uuid,
  recipient_role text not null check (recipient_role in ('customer', 'driver', 'admin')),
  text text not null check (nullif(btrim(text), '') is not null),
  channel text not null default 'in_app' check (channel in ('in_app', 'whatsapp')),
  external_message_id text,
  issue_id uuid references public.customer_issues(id),
  modification_request_id uuid,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  -- Regola strutturale "Cliente<->Driver VIETATO": ogni riga e' o
  -- customer<->admin o driver<->admin, mai customer<->driver in nessuna
  -- direzione, indipendentemente da cosa la RPC provi a passare.
  constraint conversation_messages_no_direct_customer_driver check (
    (sender_role = 'customer' and recipient_role = 'admin')
    or (sender_role = 'driver' and recipient_role = 'admin')
    or (sender_role = 'admin' and recipient_role in ('customer', 'driver'))
  )
);
create index if not exists conversation_messages_conv_idx on public.conversation_messages (conversation_id, created_at);

alter table public.conversation_messages enable row level security;
alter table public.conversation_messages force row level security;

create policy conversation_messages_customer_select on public.conversation_messages for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_messages.conversation_id and c.kind = 'customer_admin' and c.customer_id = auth.uid()
  ));
create policy conversation_messages_driver_select on public.conversation_messages for select to authenticated
  using (exists (
    select 1 from public.conversations c
    join public.operator_assignments a on a.id = c.assignment_id
    where c.id = conversation_messages.conversation_id and c.kind = 'driver_admin' and a.operator_id = auth.uid()
  ));
create policy conversation_messages_admin_all on public.conversation_messages for all to authenticated
  using (public.gps_is_admin()) with check (public.gps_is_admin());

-- ---------------------------------------------------------------------------
-- campaign_modification_requests
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_modification_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  customer_id uuid not null references auth.users(id),
  type text not null check (type in ('quantita', 'zona', 'servizio', 'data', 'extra', 'stampa', 'grafica', 'altro')),
  current_value jsonb not null default '{}'::jsonb,
  requested_value jsonb not null default '{}'::jsonb,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied', 'cancelled')),
  admin_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cmr_campaign_status_idx on public.campaign_modification_requests (campaign_id, status);

alter table public.campaign_modification_requests enable row level security;
alter table public.campaign_modification_requests force row level security;

create policy cmr_customer_select on public.campaign_modification_requests for select to authenticated
  using (customer_id = auth.uid());
create policy cmr_customer_insert on public.campaign_modification_requests for insert to authenticated
  with check (customer_id = auth.uid() and public.current_user_owns_campaign(campaign_id));
create policy cmr_admin_all on public.campaign_modification_requests for all to authenticated
  using (public.gps_is_admin()) with check (public.gps_is_admin());

-- FK differita: conversation_messages.modification_request_id (la tabella
-- sopra non esisteva ancora quando conversation_messages e' stata creata).
alter table public.conversation_messages
  add constraint conversation_messages_modification_request_fk
  foreign key (modification_request_id) references public.campaign_modification_requests(id);

create or replace function public.hub_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.hub_touch_updated_at();
drop trigger if exists cmr_set_updated_at on public.campaign_modification_requests;
create trigger cmr_set_updated_at before update on public.campaign_modification_requests
  for each row execute function public.hub_touch_updated_at();

commit;
