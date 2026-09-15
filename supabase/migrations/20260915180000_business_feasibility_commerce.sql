-- TICKET "BUSINESS FEASIBILITY €49 COMMERCE BACKEND". Persistent purchase/
-- unlock backend for the Business Feasibility product ("Fattibilita della
-- mia attivita"), fully isolated from the existing Campaign Feasibility
-- commerce domain (feasibility_analyses/feasibility_purchases/
-- feasibility_reports/feasibility_commerce_events, feasibility-commerce edge
-- function) — that domain is NOT modified, renamed or repurposed here.
--
-- Same isolation principle stated by the sibling migration: never updates
-- campaign pricing/payment or suppliers. Additive only, no DROP/TRUNCATE/
-- DELETE, explicit transaction, reversible by dropping the 3 new tables +
-- their functions (documented at the bottom).
begin;

-- ---------------------------------------------------------------------------
-- 1. business_feasibility_analyses — immutable normalized snapshot (§3-B).
-- The client (already fully deterministic/client-side today, no server
-- round trip) submits the computed snapshot at purchase time; this table
-- stores it verbatim, keyed by owner + content hash so resubmitting the same
-- analysis never creates a duplicate row. No secrets, no admin/operator data.
-- ---------------------------------------------------------------------------
create table public.business_feasibility_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  content_sha256 text not null check(length(content_sha256)=64),
  business_inputs jsonb not null default '{}'::jsonb,
  territorial_results jsonb not null default '{}'::jsonb,
  financial_inputs jsonb not null default '{}'::jsonb,
  financial_outputs jsonb not null default '{}'::jsonb,
  verdict text not null,
  data_source_metadata jsonb not null default '{}'::jsonb,
  engine_version text not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(owner_id, content_sha256)
);
comment on table public.business_feasibility_analyses is 'Immutable Business Feasibility report snapshot at the moment a purchase was requested. Isolated from feasibility_analyses (Campaign Feasibility, untouched).';

-- ---------------------------------------------------------------------------
-- 2. business_feasibility_purchases (§2) — one €49 purchase per (owner,
-- analysis). Status lifecycle: pending -> paid -> revoked (never back).
-- ---------------------------------------------------------------------------
create table public.business_feasibility_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  business_analysis_id uuid not null references public.business_feasibility_analyses(id) on delete restrict,
  status text not null default 'pending' check(status in ('pending','paid','revoked')),
  amount_cents integer not null default 4900 check(amount_cents=4900),
  currency text not null default 'EUR' check(currency='EUR'),
  payment_reference text not null check(length(payment_reference)>0),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  verified_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  unique(owner_id, business_analysis_id),
  unique(owner_id, request_id),
  unique(id, owner_id),
  check((status='paid') = (paid_at is not null and verified_by is not null)),
  check((status='revoked') = (revoked_at is not null and revoked_by is not null))
);
comment on table public.business_feasibility_purchases is 'One EUR49 one-time purchase per Business Feasibility analysis. Status flips only via SECURITY DEFINER RPCs below, never directly by a browser-held role.';

-- ---------------------------------------------------------------------------
-- 3. business_feasibility_commerce_events — append-only audit trail,
-- mirroring feasibility_commerce_events' immutability trigger pattern.
-- ---------------------------------------------------------------------------
create table public.business_feasibility_commerce_events (
  id uuid primary key default gen_random_uuid(),
  business_analysis_id uuid references public.business_feasibility_analyses(id) on delete restrict,
  purchase_id uuid references public.business_feasibility_purchases(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete restrict,
  event_type text not null,
  request_id uuid unique,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.business_feasibility_commerce_events is 'Append-only audit trail for Business Feasibility purchase/verify/revoke actions. Admin reads happen only through the verified feasibility-business-commerce edge function, never a browser-written role.';

create index business_feasibility_analyses_owner_idx on public.business_feasibility_analyses(owner_id,created_at);
create index business_feasibility_purchases_owner_idx on public.business_feasibility_purchases(owner_id,created_at);
create index business_feasibility_purchases_status_idx on public.business_feasibility_purchases(status,created_at);
create index business_feasibility_events_purchase_idx on public.business_feasibility_commerce_events(purchase_id,created_at);

alter table public.business_feasibility_analyses enable row level security;
alter table public.business_feasibility_purchases enable row level security;
alter table public.business_feasibility_commerce_events enable row level security;

-- No table grants at all for anon (§10: "Anon: no purchase/report access").
-- authenticated gets SELECT only — every write happens through the
-- SECURITY DEFINER RPCs below (service_role), so a customer JWT can never
-- flip status to 'paid' by itself (§10: "can never update status to paid").
revoke all on public.business_feasibility_analyses, public.business_feasibility_purchases,
 public.business_feasibility_commerce_events from anon, authenticated;
grant select on public.business_feasibility_analyses, public.business_feasibility_purchases to authenticated;
grant all on public.business_feasibility_analyses, public.business_feasibility_purchases,
 public.business_feasibility_commerce_events to service_role;

-- Customer: can view own snapshots/purchases only, and only 'client' role
-- accounts (mirrors feasibility_analysis_owner / feasibility_purchase_owner
-- exactly). No policy at all for business_feasibility_commerce_events:
-- admin reads it only via the service-role edge function action.
create policy business_feasibility_analysis_owner on public.business_feasibility_analyses for select to authenticated
 using(owner_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='client'));
create policy business_feasibility_purchase_owner on public.business_feasibility_purchases for select to authenticated
 using(owner_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='client'));
-- No INSERT/UPDATE/DELETE policy for authenticated on any of the 3 tables:
-- deliberate — every write is server-side (service_role) via the RPCs below.
-- No supplier/operator/driver access anywhere: the only SELECT policies
-- above require role='client'; admin access is server-side only (§10).

-- ---------------------------------------------------------------------------
-- 4. RPCs — service-role only, security definer, actor ids from auth, never
-- from the request body (same convention as feasibility_create_purchase /
-- feasibility_verify_payment).
-- ---------------------------------------------------------------------------

-- Idempotent purchase creation (§5). Same owner + same normalized snapshot
-- (content_sha256) never creates a second analysis row (ON CONFLICT DO
-- UPDATE ... RETURNING is the standard Postgres idiom to fetch the existing
-- row on conflict). Same owner + same analysis never creates a second
-- purchase row (unique(owner_id,business_analysis_id) + early return).
create function public.business_feasibility_create_purchase(
  p_actor uuid, p_business_inputs jsonb, p_territorial jsonb, p_financial_inputs jsonb,
  p_financial_outputs jsonb, p_verdict text, p_source_metadata jsonb, p_engine_version text,
  p_generated_at timestamptz, p_content_sha256 text, p_request uuid
) returns public.business_feasibility_purchases
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.business_feasibility_analyses; p public.business_feasibility_purchases; ref text;
begin
 if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and role='client') then raise exception 'CLIENT_REQUIRED'; end if;
 if length(p_content_sha256)<>64 or p_verdict is null or length(trim(p_verdict))=0 or p_engine_version is null or p_generated_at is null then raise exception 'INVALID_REQUEST'; end if;
 insert into public.business_feasibility_analyses(owner_id,content_sha256,business_inputs,territorial_results,financial_inputs,financial_outputs,verdict,data_source_metadata,engine_version,generated_at)
 values(p_actor,p_content_sha256,coalesce(p_business_inputs,'{}'::jsonb),coalesce(p_territorial,'{}'::jsonb),coalesce(p_financial_inputs,'{}'::jsonb),coalesce(p_financial_outputs,'{}'::jsonb),p_verdict,coalesce(p_source_metadata,'{}'::jsonb),p_engine_version,p_generated_at)
 on conflict(owner_id,content_sha256) do update set id=business_feasibility_analyses.id
 returning * into a;
 select * into p from public.business_feasibility_purchases where owner_id=p_actor and business_analysis_id=a.id;
 if found then return p; end if;
 if exists(select 1 from public.business_feasibility_commerce_events where request_id=p_request) then raise exception 'REQUEST_ALREADY_USED'; end if;
 ref := 'BF49-'||upper(substr(replace(a.id::text,'-',''),1,10));
 insert into public.business_feasibility_purchases(owner_id,business_analysis_id,payment_reference,request_id)
 values(p_actor,a.id,ref,p_request) returning * into p;
 insert into public.business_feasibility_commerce_events(business_analysis_id,purchase_id,actor_id,event_type,request_id)
 values(a.id,p.id,p_actor,'purchase_created',p_request);
 return p;
end; $$;

-- Admin-only: marks a purchase paid. Never trusts customer input for the
-- status flip (§8) — the confirmation text is audited in the event, not
-- written into the customer-facing, stable payment_reference (§16/test M).
create function public.business_feasibility_verify_payment(p_actor uuid,p_purchase uuid,p_confirmation text,p_request uuid)
returns public.business_feasibility_purchases
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.business_feasibility_purchases;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
 if length(trim(coalesce(p_confirmation,'')))<3 or length(p_confirmation)>200 then raise exception 'RECEIPT_CONFIRMATION_REQUIRED'; end if;
 select * into p from public.business_feasibility_purchases where id=p_purchase for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p.status='paid' then return p; end if; -- idempotent (§8: "idempotent if already paid")
 if p.status='revoked' then raise exception 'INVALID_PAYMENT_STATE'; end if;
 update public.business_feasibility_purchases set status='paid',paid_at=now(),verified_by=p_actor,updated_at=now() where id=p.id returning * into p;
 insert into public.business_feasibility_commerce_events(business_analysis_id,purchase_id,actor_id,event_type,request_id,safe_metadata)
 values(p.business_analysis_id,p.id,p_actor,'payment_verified',p_request,jsonb_build_object('confirmation',trim(p_confirmation)));
 return p;
end; $$;

-- Admin-only revocation (§9). Idempotent; a paid report becomes unavailable
-- afterwards purely because get_report/RLS re-check current status.
create function public.business_feasibility_revoke(p_actor uuid,p_purchase uuid,p_reason text,p_request uuid)
returns public.business_feasibility_purchases
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.business_feasibility_purchases;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
 select * into p from public.business_feasibility_purchases where id=p_purchase for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p.status='revoked' then return p; end if;
 update public.business_feasibility_purchases set status='revoked',revoked_at=now(),revoked_by=p_actor,updated_at=now() where id=p.id returning * into p;
 insert into public.business_feasibility_commerce_events(business_analysis_id,purchase_id,actor_id,event_type,request_id,safe_metadata)
 values(p.business_analysis_id,p.id,p_actor,'purchase_revoked',p_request,jsonb_build_object('reason',coalesce(trim(p_reason),'')));
 return p;
end; $$;

revoke all on function public.business_feasibility_create_purchase(uuid,jsonb,jsonb,jsonb,jsonb,text,jsonb,text,timestamptz,text,uuid),
 public.business_feasibility_verify_payment(uuid,uuid,text,uuid), public.business_feasibility_revoke(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.business_feasibility_create_purchase(uuid,jsonb,jsonb,jsonb,jsonb,text,jsonb,text,timestamptz,text,uuid),
 public.business_feasibility_verify_payment(uuid,uuid,text,uuid), public.business_feasibility_revoke(uuid,uuid,text,uuid) to service_role;

-- Append-only audit events, even for service clients (mirrors
-- feasibility_immutable_event()).
create function public.business_feasibility_immutable_event() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception 'IMMUTABLE_COMMERCE_EVENT'; end; $$;
create trigger business_feasibility_event_immutable before update or delete on public.business_feasibility_commerce_events
for each row execute function public.business_feasibility_immutable_event();

commit;

-- Rollback (manual, documented — no down-migration file in this repo):
--   drop trigger business_feasibility_event_immutable on public.business_feasibility_commerce_events;
--   drop function public.business_feasibility_immutable_event();
--   drop function public.business_feasibility_revoke(uuid,uuid,text,uuid);
--   drop function public.business_feasibility_verify_payment(uuid,uuid,text,uuid);
--   drop function public.business_feasibility_create_purchase(uuid,jsonb,jsonb,jsonb,jsonb,text,jsonb,text,timestamptz,text,uuid);
--   drop table public.business_feasibility_commerce_events;
--   drop table public.business_feasibility_purchases;
--   drop table public.business_feasibility_analyses;
-- None of this touches feasibility_analyses/feasibility_purchases/
-- feasibility_reports/feasibility_commerce_events or any campaign/GPS/
-- supplier/Step2 table.
