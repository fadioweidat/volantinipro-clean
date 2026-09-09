-- Phase 3: isolated commerce. Never updates campaign pricing/payment or suppliers.
begin;

create function public.feasibility_commerce_config() returns jsonb
language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object('price_cents',4900,'credit_cents',3000,'validity_days',30,
    'currency','EUR','pricing_version','feasibility-2026-09-v1','terms_version','2026-09-v1',
    'message_limit',20,'narrative_limit',2,'daily_analysis_limit',5);
$$;

create table public.feasibility_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete restrict,
  access_hash text not null unique check(length(access_hash)=64),
  normalized_inputs jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  message_count integer not null default 0 check(message_count between 0 and 20),
  narrative_attempt_count integer not null default 0 check(narrative_attempt_count between 0 and 2),
  frozen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.feasibility_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  analysis_id uuid not null unique references public.feasibility_analyses(id) on delete restrict,
  option text not null check(option in ('study_only','study_campaign')),
  amount_cents integer not null check(amount_cents > 0),
  currency text not null check(currency='EUR'),
  pricing_version text not null, terms_version text not null, terms_snapshot jsonb not null,
  status text not null default 'awaiting_payment' check(status in ('awaiting_payment','paid','cancelled')),
  request_id uuid not null,
  payment_method text not null default 'manual' check(payment_method='manual'),
  payment_reference text, verified_by uuid references auth.users(id),
  paid_at timestamptz, invoice_reference text,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  unique(owner_id,request_id), unique(id,owner_id),
  check((status='paid') = (paid_at is not null)),
  check(status <> 'paid' or (verified_by is not null and length(payment_reference)>0))
);
create table public.feasibility_reports (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null unique references public.feasibility_analyses(id) on delete restrict,
  owner_id uuid references auth.users(id) on delete restrict,
  purchase_id uuid unique,
  linked_campaign_id uuid references public.campaigns(id) on delete restrict,
  engine_version text not null, prompt_version text not null,
  report_version text not null, pricing_version text not null,
  inputs_snapshot jsonb not null, outputs_snapshot jsonb not null,
  narrative_snapshot jsonb, classification text not null check(classification in ('GO','GO WITH CONDITIONS','HIGH RISK')),
  unusual_margin boolean not null default false,
  snapshot_sha256 text not null check(length(snapshot_sha256)=64),
  pdf_status text not null default 'browser_export', pdf_path text,
  created_at timestamptz not null default now(),
  foreign key(purchase_id,owner_id) references public.feasibility_purchases(id,owner_id) on delete restrict
);
create table public.feasibility_credits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  purchase_id uuid not null unique,
  face_value_cents integer not null check(face_value_cents>0),
  issued_at timestamptz not null, expires_at timestamptz not null,
  status text not null default 'available' check(status in ('available','applied','expired')),
  foreign key(purchase_id,owner_id) references public.feasibility_purchases(id,owner_id) on delete restrict,
  unique(id,owner_id), check(expires_at>issued_at)
);
create table public.feasibility_credit_applications (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null unique,
  owner_id uuid not null references auth.users(id) on delete restrict,
  campaign_id uuid not null unique references public.campaigns(id) on delete restrict,
  gross_amount_snapshot_cents bigint not null check(gross_amount_snapshot_cents>=0),
  applied_amount_cents integer not null check(applied_amount_cents>0),
  amount_due_snapshot_cents bigint not null check(amount_due_snapshot_cents>=0),
  settlement_status text not null check(settlement_status in ('credit_applied','settled_by_credit')),
  verified_confirmation_at timestamptz not null,
  applied_at timestamptz not null default now(),
  request_id uuid not null unique,
  foreign key(credit_id,owner_id) references public.feasibility_credits(id,owner_id) on delete restrict,
  check(gross_amount_snapshot_cents=applied_amount_cents+amount_due_snapshot_cents),
  check((settlement_status='settled_by_credit') = (amount_due_snapshot_cents=0))
);
create table public.feasibility_commerce_events (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.feasibility_analyses(id) on delete restrict,
  purchase_id uuid references public.feasibility_purchases(id) on delete restrict,
  report_id uuid references public.feasibility_reports(id) on delete restrict,
  credit_id uuid references public.feasibility_credits(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete restrict,
  event_type text not null,
  request_id uuid unique,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index feasibility_analyses_owner_idx on public.feasibility_analyses(owner_id,created_at);
create index feasibility_purchases_owner_idx on public.feasibility_purchases(owner_id,created_at);
create index feasibility_reports_owner_idx on public.feasibility_reports(owner_id,created_at);
create index feasibility_credits_owner_idx on public.feasibility_credits(owner_id,expires_at);
create index feasibility_events_purchase_idx on public.feasibility_commerce_events(purchase_id,created_at);

alter table public.feasibility_analyses enable row level security;
alter table public.feasibility_purchases enable row level security;
alter table public.feasibility_reports enable row level security;
alter table public.feasibility_credits enable row level security;
alter table public.feasibility_credit_applications enable row level security;
alter table public.feasibility_commerce_events enable row level security;
revoke all on public.feasibility_analyses, public.feasibility_purchases, public.feasibility_reports,
 public.feasibility_credits, public.feasibility_credit_applications, public.feasibility_commerce_events from anon, authenticated;
grant select on public.feasibility_analyses, public.feasibility_purchases, public.feasibility_reports,
 public.feasibility_credits, public.feasibility_credit_applications to authenticated;
grant all on public.feasibility_analyses, public.feasibility_purchases, public.feasibility_reports,
 public.feasibility_credits, public.feasibility_credit_applications, public.feasibility_commerce_events to service_role;

create policy feasibility_analysis_owner on public.feasibility_analyses for select to authenticated
 using(owner_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='client'));
create policy feasibility_purchase_owner on public.feasibility_purchases for select to authenticated
 using(owner_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='client'));
create policy feasibility_report_paid_owner on public.feasibility_reports for select to authenticated
 using(owner_id=auth.uid() and exists(select 1 from public.feasibility_purchases p where p.id=purchase_id and p.owner_id=auth.uid() and p.status='paid'));
create policy feasibility_credit_owner on public.feasibility_credits for select to authenticated
 using(owner_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='client'));
create policy feasibility_application_owner on public.feasibility_credit_applications for select to authenticated
 using(owner_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='client'));
-- Admin access is through the verified server endpoint, never a browser-written role.

create function public.feasibility_protect_snapshot() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.feasibility_purchases where id=old.purchase_id and status='paid') then
   raise exception 'PAID_REPORT_IMMUTABLE';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
create trigger feasibility_snapshot_immutable before update or delete on public.feasibility_reports
 for each row execute function public.feasibility_protect_snapshot();

-- All write RPCs are service-role only. Actor IDs come from auth.getUser(), not request bodies.
create function public.feasibility_reserve_call(p_hash text,p_actor uuid,p_kind text,p_request uuid)
returns public.feasibility_analyses language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.feasibility_analyses; cfg jsonb:=public.feasibility_commerce_config();
begin
 if p_kind not in ('collect','narrative') or length(p_hash)<>64 then raise exception 'INVALID_REQUEST'; end if;
 if p_actor is not null and not exists(select 1 from public.profiles where id=p_actor and role='client') then raise exception 'CLIENT_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_actor::text,p_hash),0));
 select * into a from public.feasibility_analyses where access_hash=p_hash for update;
 if not found then
   if p_actor is not null and (select count(*) from public.feasibility_analyses where owner_id=p_actor and created_at>now()-interval '1 day') >= (cfg->>'daily_analysis_limit')::int then raise exception 'DAILY_LIMIT'; end if;
   insert into public.feasibility_analyses(access_hash,owner_id) values(p_hash,p_actor) returning * into a;
 end if;
 if a.owner_id is not null and a.owner_id is distinct from p_actor then raise exception 'NOT_FOUND'; end if;
 if a.frozen then raise exception 'ANALYSIS_FROZEN'; end if;
 if exists(select 1 from public.feasibility_commerce_events where request_id=p_request) then raise exception 'REQUEST_ALREADY_USED'; end if;
 if p_kind='collect' and a.message_count >= (cfg->>'message_limit')::int then raise exception 'MESSAGE_LIMIT'; end if;
 if p_kind='narrative' and a.narrative_attempt_count >= (cfg->>'narrative_limit')::int then raise exception 'NARRATIVE_LIMIT'; end if;
 update public.feasibility_analyses set message_count=message_count+case when p_kind='collect' then 1 else 0 end,
 narrative_attempt_count=narrative_attempt_count+case when p_kind='narrative' then 1 else 0 end,updated_at=now() where id=a.id returning * into a;
 insert into public.feasibility_commerce_events(analysis_id,actor_id,event_type,request_id) values(a.id,p_actor,'ai_'||p_kind||'_reserved',p_request);
 return a;
end; $$;

create function public.feasibility_store_report(p_hash text,p_actor uuid,p_payload jsonb,p_preview jsonb,p_sha text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.feasibility_analyses; r uuid;
begin
 select * into a from public.feasibility_analyses where access_hash=p_hash for update;
 if not found or a.frozen or (a.owner_id is not null and a.owner_id is distinct from p_actor) then raise exception 'NOT_FOUND_OR_FROZEN'; end if;
 if a.narrative_attempt_count<1 then raise exception 'GENERATION_NOT_RESERVED'; end if;
 insert into public.feasibility_reports(analysis_id,owner_id,engine_version,prompt_version,report_version,pricing_version,
 inputs_snapshot,outputs_snapshot,narrative_snapshot,classification,unusual_margin,snapshot_sha256)
 values(a.id,a.owner_id,p_payload->>'engineVersion',p_payload->>'promptVersion',p_payload->>'reportVersion',p_payload->>'pricingVersion',
 p_payload->'inputs',p_payload->'outputs',p_payload->'narrative',p_payload->'outputs'->>'classification',coalesce((p_payload->>'unusualMargin')::boolean,false),p_sha)
 on conflict(analysis_id) do update set inputs_snapshot=excluded.inputs_snapshot,outputs_snapshot=excluded.outputs_snapshot,
 narrative_snapshot=excluded.narrative_snapshot,classification=excluded.classification,unusual_margin=excluded.unusual_margin,
 snapshot_sha256=excluded.snapshot_sha256,created_at=now() returning id into r;
 update public.feasibility_analyses set normalized_inputs=p_payload->'inputs',preview=p_preview,updated_at=now() where id=a.id;
 return r;
end; $$;

create function public.feasibility_create_purchase(p_actor uuid,p_hash text,p_option text,p_request uuid,p_test boolean default false)
returns public.feasibility_purchases language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.feasibility_analyses; p public.feasibility_purchases; cfg jsonb:=public.feasibility_commerce_config();
begin
 if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and role='client') then raise exception 'CLIENT_REQUIRED'; end if;
 if p_option not in ('study_only','study_campaign') then raise exception 'INVALID_OPTION'; end if;
 select * into a from public.feasibility_analyses where access_hash=p_hash for update;
 if not found or (a.owner_id is not null and a.owner_id<>p_actor) then raise exception 'NOT_FOUND'; end if;
 select * into p from public.feasibility_purchases where analysis_id=a.id;
 if found then
   if p.owner_id<>p_actor or p.option<>p_option then raise exception 'PURCHASE_ALREADY_EXISTS'; end if;
   return p;
 end if;
 if not exists(select 1 from public.feasibility_reports where analysis_id=a.id) then raise exception 'REPORT_REQUIRED'; end if;
 update public.feasibility_analyses set owner_id=p_actor,frozen=true,updated_at=now() where id=a.id;
 insert into public.feasibility_purchases(owner_id,analysis_id,option,amount_cents,currency,pricing_version,terms_version,terms_snapshot,request_id,is_test)
 values(p_actor,a.id,p_option,(cfg->>'price_cents')::int,cfg->>'currency',cfg->>'pricing_version',cfg->>'terms_version',cfg,p_request,p_test) returning * into p;
 update public.feasibility_reports set owner_id=p_actor,purchase_id=p.id where analysis_id=a.id;
 insert into public.feasibility_commerce_events(analysis_id,purchase_id,actor_id,event_type,request_id) values(a.id,p.id,p_actor,'purchase_created',p_request);
 return p;
end; $$;

create function public.feasibility_verify_payment(p_actor uuid,p_purchase uuid,p_reference text,p_request uuid)
returns public.feasibility_purchases language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.feasibility_purchases; credit_id uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
 if length(trim(p_reference))<3 or length(p_reference)>200 then raise exception 'RECEIPT_REFERENCE_REQUIRED'; end if;
 select * into p from public.feasibility_purchases where id=p_purchase for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p.status='paid' then return p; end if;
 if p.status<>'awaiting_payment' then raise exception 'INVALID_PAYMENT_STATE'; end if;
 if p.is_test and p_reference not like 'TEST:%' then raise exception 'TEST_REFERENCE_REQUIRED'; end if;
 update public.feasibility_purchases set status='paid',paid_at=now(),verified_by=p_actor,payment_reference=trim(p_reference) where id=p.id returning * into p;
 if p.option='study_campaign' then
   insert into public.feasibility_credits(owner_id,purchase_id,face_value_cents,issued_at,expires_at)
   values(p.owner_id,p.id,(p.terms_snapshot->>'credit_cents')::int,p.paid_at,p.paid_at+make_interval(days=>(p.terms_snapshot->>'validity_days')::int)) returning id into credit_id;
 end if;
 insert into public.feasibility_commerce_events(purchase_id,credit_id,actor_id,event_type,request_id)
 values(p.id,credit_id,p_actor,case when p.is_test then 'test_payment_verified' else 'payment_verified' end,p_request);
 return p;
end; $$;

-- Audit events are append-only even for service clients.
create function public.feasibility_immutable_event() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'IMMUTABLE_COMMERCE_EVENT'; end; $$;
create trigger feasibility_event_immutable before update or delete on public.feasibility_commerce_events
for each row execute function public.feasibility_immutable_event();
create index feasibility_event_campaign_idx on public.feasibility_commerce_events((safe_metadata->>'campaign_id'),created_at);

-- Captured for mismatch detection, never used alone as economic proof.
create function public.feasibility_campaign_fingerprint(c public.campaigns) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object('owner_id',c.user_id,'total_amount',c.total_amount,'estimated_price',c.estimated_price,
 'total_budget',c.total_budget,'created_at',c.created_at,'source',c.source,'status',c.status);
$$;

create function public.feasibility_verify_eligibility(p_actor uuid,p_campaign uuid,p_owner uuid,p_gross bigint,p_confirmed timestamptz,p_reference text,p_request uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.campaigns; a public.feasibility_credit_applications; e uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
 if p_gross is null or p_gross<=0 or p_gross>9007199254740991 or p_confirmed is null or p_confirmed>now() or length(coalesce(p_reference,''))>200 then raise exception 'INVALID_VERIFICATION'; end if;
 select * into c from public.campaigns where id=p_campaign for update;
 if not found or c.user_id is distinct from p_owner or not exists(select 1 from public.profiles where id=p_owner and role='client') then raise exception 'NOT_FOUND'; end if;
 if c.total_amount is null or round(c.total_amount*100)::bigint<>p_gross then raise exception 'REVIEW_REQUIRED'; end if;
 select * into a from public.feasibility_credit_applications where campaign_id=p_campaign;
 if found and (a.owner_id<>p_owner or a.gross_amount_snapshot_cents<>p_gross or a.verified_confirmation_at<>p_confirmed) then raise exception 'APPLIED_SNAPSHOT_IMMUTABLE'; end if;
 insert into public.feasibility_commerce_events(actor_id,event_type,request_id,safe_metadata)
 values(p_actor,'campaign_credit_eligibility_verified',p_request,jsonb_build_object(
 'campaign_id',p_campaign,'owner_id',p_owner,'verified_gross_amount_cents',p_gross,'verified_confirmation_at',p_confirmed,
 'verified_at',now(),'verified_by',p_actor,'document_reference',nullif(trim(p_reference),''),'verification_version','admin-v1',
 'campaign_fingerprint',public.feasibility_campaign_fingerprint(c),'payable_verified',true)) returning id into e;
 return e;
end; $$;

create function public.feasibility_apply_credit(p_actor uuid,p_credit uuid,p_campaign uuid,p_request uuid)
returns public.feasibility_credit_applications language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.feasibility_credits; campaign public.campaigns; proof public.feasibility_commerce_events; gross bigint; amount integer; application public.feasibility_credit_applications; confirmed timestamptz;
begin
 if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and role='client') then raise exception 'CLIENT_REQUIRED'; end if;
 select * into c from public.feasibility_credits where id=p_credit and owner_id=p_actor for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if c.status<>'available' then raise exception 'CREDIT_ALREADY_USED'; end if;
 if now()>=c.expires_at then raise exception 'CREDIT_EXPIRED'; end if;
 if not exists(select 1 from public.feasibility_purchases where id=c.purchase_id and owner_id=p_actor and status='paid') then raise exception 'PAID_PURCHASE_REQUIRED'; end if;
 select * into campaign from public.campaigns where id=p_campaign and user_id=p_actor for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into proof from public.feasibility_commerce_events where event_type='campaign_credit_eligibility_verified'
 and safe_metadata->>'campaign_id'=p_campaign::text order by created_at desc,id desc limit 1;
 if not found then raise exception 'ELIGIBILITY_VERIFICATION_REQUIRED'; end if;
 if proof.safe_metadata->>'owner_id'<>p_actor::text or proof.safe_metadata->'campaign_fingerprint' is distinct from public.feasibility_campaign_fingerprint(campaign) then raise exception 'REVIEW_REQUIRED'; end if;
 confirmed:=(proof.safe_metadata->>'verified_confirmation_at')::timestamptz;
 if confirmed<c.issued_at or confirmed>=c.expires_at then raise exception 'CAMPAIGN_NOT_ELIGIBLE'; end if;
 if exists(select 1 from public.feasibility_purchases where id=c.purchase_id and is_test)
 and not exists(select 1 from auth.users where id=p_actor and raw_app_meta_data->>'feasibility_synthetic_test'='true') then raise exception 'TEST_CAMPAIGN_REQUIRED'; end if;
 gross:=(proof.safe_metadata->>'verified_gross_amount_cents')::bigint;
 amount:=least(c.face_value_cents,gross)::int;
 insert into public.feasibility_credit_applications(credit_id,owner_id,campaign_id,gross_amount_snapshot_cents,applied_amount_cents,amount_due_snapshot_cents,settlement_status,verified_confirmation_at,request_id)
 values(c.id,p_actor,campaign.id,gross,amount,gross-amount,case when gross=amount then 'settled_by_credit' else 'credit_applied' end,confirmed,p_request) returning * into application;
 update public.feasibility_credits set status='applied' where id=c.id;
 insert into public.feasibility_commerce_events(purchase_id,credit_id,actor_id,event_type,request_id,safe_metadata)
 values(c.purchase_id,c.id,p_actor,application.settlement_status,p_request,jsonb_build_object('campaign_id',p_campaign,'application_id',application.id,'eligibility_event_id',proof.id,'amount_cents',amount));
 return application;
end; $$;

create function public.feasibility_campaign_settlement(p_campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c public.campaigns; a public.feasibility_credit_applications; proof public.feasibility_commerce_events; state text; due bigint;
begin
 select * into c from public.campaigns where id=p_campaign_id;
 if not found or (auth.role()<>'service_role' and (auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and (role='admin' or (role='client' and c.user_id=auth.uid()))))) then raise exception 'NOT_FOUND'; end if;
 select * into a from public.feasibility_credit_applications where campaign_id=c.id;
 -- No credit: this adapter makes no assertion about legacy payments.
 if not found then return jsonb_build_object('campaign_id',c.id,'settlement_status','not_applicable','application_id',null); end if;
 select * into proof from public.feasibility_commerce_events where event_type='campaign_credit_eligibility_verified'
 and safe_metadata->>'campaign_id'=c.id::text order by created_at desc,id desc limit 1;
 state:=case when proof.id is null or proof.safe_metadata->'campaign_fingerprint' is distinct from public.feasibility_campaign_fingerprint(c)
 or c.user_id is distinct from a.owner_id then 'review_required'
 when a.amount_due_snapshot_cents=0 then 'settled_by_credit'
 when exists(select 1 from public.feasibility_commerce_events where event_type='campaign_residual_payment_verified' and safe_metadata->>'application_id'=a.id::text) then 'settled_by_verified_receipt'
 else 'awaiting_payment' end;
 due:=case when state='review_required' then null when state in ('settled_by_credit','settled_by_verified_receipt') then 0 else a.amount_due_snapshot_cents end;
 return jsonb_build_object('campaign_id',c.id,'original_total_cents',a.gross_amount_snapshot_cents,'credit_cents',a.applied_amount_cents,'amount_due_cents',due,'settlement_status',state,'application_id',a.id);
end; $$;

create function public.feasibility_verify_residual(p_actor uuid,p_campaign uuid,p_amount bigint,p_reference text,p_request uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.feasibility_credit_applications; s jsonb; e uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
 if length(trim(coalesce(p_reference,'')))<3 or length(p_reference)>200 then raise exception 'RECEIPT_REFERENCE_REQUIRED'; end if;
 perform 1 from public.campaigns where id=p_campaign for update;
 select * into a from public.feasibility_credit_applications where campaign_id=p_campaign for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 s:=public.feasibility_campaign_settlement(p_campaign);
 if s->>'settlement_status'<>'awaiting_payment' or p_amount is null or p_amount<=0 or p_amount<>a.amount_due_snapshot_cents then raise exception 'REVIEW_REQUIRED'; end if;
 insert into public.feasibility_commerce_events(actor_id,event_type,request_id,safe_metadata)
 values(p_actor,'campaign_residual_payment_verified',p_request,jsonb_build_object('campaign_id',p_campaign,'application_id',a.id,
 'amount_cents',p_amount,'reference',trim(p_reference),'verified_by',p_actor,'verified_at',now(),'verification_version','admin-v1')) returning id into e;
 return e;
end; $$;

revoke all on function public.feasibility_reserve_call(text,uuid,text,uuid), public.feasibility_store_report(text,uuid,jsonb,jsonb,text),
 public.feasibility_create_purchase(uuid,text,text,uuid,boolean), public.feasibility_verify_payment(uuid,uuid,text,uuid),
 public.feasibility_apply_credit(uuid,uuid,uuid,uuid), public.feasibility_campaign_settlement(uuid), public.feasibility_verify_eligibility(uuid,uuid,uuid,bigint,timestamptz,text,uuid), public.feasibility_verify_residual(uuid,uuid,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.feasibility_reserve_call(text,uuid,text,uuid), public.feasibility_store_report(text,uuid,jsonb,jsonb,text),
 public.feasibility_create_purchase(uuid,text,text,uuid,boolean), public.feasibility_verify_payment(uuid,uuid,text,uuid),
 public.feasibility_apply_credit(uuid,uuid,uuid,uuid), public.feasibility_verify_eligibility(uuid,uuid,uuid,bigint,timestamptz,text,uuid), public.feasibility_verify_residual(uuid,uuid,bigint,text,uuid) to service_role;
grant execute on function public.feasibility_campaign_settlement(uuid) to authenticated,service_role;
grant execute on function public.feasibility_commerce_config() to anon,authenticated,service_role;
comment on table public.feasibility_credit_applications is 'Canonical isolated settlement. settled_by_credit means no amount payable, not a received bank transfer.';
commit;
