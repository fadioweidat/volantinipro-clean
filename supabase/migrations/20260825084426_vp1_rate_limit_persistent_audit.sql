-- RECONSTRUCTED FILE — see "INVESTIGATE 5 REMOTE-ONLY SUPABASE MIGRATIONS"
-- reconciliation ticket (2026-09-15). Same situation as
-- 20260825083514_vp1_distributed_rate_limiter.sql: applied directly to
-- production (name "vp1_rate_limit_persistent_audit" per
-- supabase_migrations.schema_migrations), never committed as a file,
-- reconstructed here from the current live schema (read-only introspection),
-- not a byte-exact historical replay.
--
-- Adds an audit table for rate-limited requests and a v2 RPC that also
-- validates request_id/action and writes to it. Still unused by any
-- current application code (verified).
begin;

create table if not exists security_infrastructure.rate_limit_audit (
  event_id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  request_id text not null check (request_id ~ '^[A-Za-z0-9._:-]{8,128}$'),
  action text not null check (action ~ '^[a-z][a-z0-9_]{0,63}$'),
  event text not null check (event = 'rate_limited'),
  client_key_sha256 text not null check (client_key_sha256 ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null,
  retry_after_seconds integer not null
);
alter table security_infrastructure.rate_limit_audit enable row level security;
revoke all on security_infrastructure.rate_limit_audit from public, anon, authenticated;

create or replace function public.vp1_consume_rate_limit_v2(
  p_client_key_sha256 text, p_request_id text, p_action text,
  p_limit integer default 120, p_window_seconds integer default 60
) returns table(allowed boolean, request_count integer, retry_after_seconds integer, window_started_at timestamptz)
language plpgsql security definer set search_path to 'pg_catalog', 'public', 'security_infrastructure'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_count integer;
  v_retry_after integer;
begin
  if p_client_key_sha256 is null or p_client_key_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid client key';
  end if;
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9._:-]{8,128}$' then
    raise exception using errcode = '22023', message = 'invalid request id';
  end if;
  if p_action is null or p_action !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception using errcode = '22023', message = 'invalid action';
  end if;
  if p_limit < 1 or p_limit > 10000 then
    raise exception using errcode = '22023', message = 'invalid rate limit';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception using errcode = '22023', message = 'invalid rate window';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
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

  v_retry_after := case
    when v_count <= p_limit then 0
    else greatest(1, ceil(extract(epoch from (v_window_end - v_now)))::integer)
  end;

  if v_count > p_limit then
    insert into security_infrastructure.rate_limit_audit (
      request_id,
      action,
      event,
      client_key_sha256,
      window_started_at,
      request_count,
      retry_after_seconds
    ) values (
      p_request_id,
      p_action,
      'rate_limited',
      p_client_key_sha256,
      v_window_start,
      v_count,
      v_retry_after
    );
  end if;

  if v_count = 1 then
    delete from security_infrastructure.rate_limit_buckets
    where expires_at < v_now - interval '5 minutes';
    delete from security_infrastructure.rate_limit_audit
    where occurred_at < v_now - interval '7 days';
  end if;

  return query select v_count <= p_limit, v_count, v_retry_after, v_window_start;
end;
$function$;

revoke all on function public.vp1_consume_rate_limit_v2(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.vp1_consume_rate_limit_v2(text, text, text, integer, integer) to service_role;

commit;
