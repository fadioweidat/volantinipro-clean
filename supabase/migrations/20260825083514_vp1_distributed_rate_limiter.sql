-- RECONSTRUCTED FILE — see "INVESTIGATE 5 REMOTE-ONLY SUPABASE MIGRATIONS"
-- reconciliation ticket (2026-09-15). This version (20260825083514, name
-- "vp1_distributed_rate_limiter" per supabase_migrations.schema_migrations)
-- was applied directly to production without ever being committed as a
-- file in this repo. No corresponding file existed at any point in git
-- history (verified: `git log --all -S` for every distinctive identifier
-- below returns zero hits), so this is NOT a restored original — it is a
-- reconstruction from the CURRENT live schema (introspected read-only via
-- pg_get_functiondef/pg_get_constraintdef/information_schema), written so
-- that `supabase db push` treats this version as already-satisfied and
-- migration history stays consistent going forward.
--
-- Read-only introspection confirmed no application code (customer/admin
-- frontend, any supabase/functions/*) calls vp1_consume_rate_limit or
-- vp1_consume_rate_limit_v2 — this schema is live but currently unused by
-- the app. It is left in place rather than removed: removing infrastructure
-- is out of scope for a history-reconciliation migration.
begin;

create schema if not exists security_infrastructure;

create table if not exists security_infrastructure.rate_limit_buckets (
  client_key_sha256 text not null check (client_key_sha256 ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  expires_at timestamptz not null,
  constraint rate_limit_buckets_pkey primary key (client_key_sha256, window_started_at)
);
alter table security_infrastructure.rate_limit_buckets enable row level security;
-- No policies, no anon/authenticated grants, no schema USAGE grant to
-- anon/authenticated: matches live exactly (only SECURITY DEFINER RPCs,
-- executable only by service_role, ever touch this table).
revoke all on schema security_infrastructure from anon, authenticated;
revoke all on security_infrastructure.rate_limit_buckets from public, anon, authenticated;

create or replace function public.vp1_consume_rate_limit(
  p_client_key_sha256 text, p_limit integer default 120, p_window_seconds integer default 60
) returns table(allowed boolean, request_count integer, retry_after_seconds integer, window_started_at timestamptz)
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'security_infrastructure'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_count integer;
begin
  if p_client_key_sha256 is null or p_client_key_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid client key';
  end if;
  if p_limit < 1 or p_limit > 10000 then
    raise exception using errcode = '22023', message = 'invalid rate limit';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception using errcode = '22023', message = 'invalid rate window';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  v_window_end := v_window_start + make_interval(secs => p_window_seconds);

  insert into security_infrastructure.rate_limit_buckets as bucket (
    client_key_sha256, window_started_at, request_count, expires_at
  ) values (
    p_client_key_sha256, v_window_start, 1, v_window_end
  )
  on conflict on constraint rate_limit_buckets_pkey
  do update set
    request_count = bucket.request_count + 1,
    expires_at = greatest(bucket.expires_at, excluded.expires_at)
  returning bucket.request_count into v_count;

  if v_count = 1 then
    delete from security_infrastructure.rate_limit_buckets
    where expires_at < v_now - interval '5 minutes';
  end if;

  return query select
    v_count <= p_limit,
    v_count,
    case when v_count <= p_limit then 0
      else greatest(1, ceil(extract(epoch from (v_window_end - v_now)))::integer)
    end,
    v_window_start;
end;
$function$;

revoke all on function public.vp1_consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.vp1_consume_rate_limit(text, integer, integer) to service_role;

commit;
