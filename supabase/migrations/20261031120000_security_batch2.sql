-- Chiusure di sicurezza. Ripristino: db-backups/2026-10-31-security-batch2/rollback.sql

-- Un token revocato non apre piu' messaggi e segnalazioni.
CREATE OR REPLACE FUNCTION public.hub_resolve_driver_assignment(p_assignment_id uuid, p_access_token text DEFAULT NULL::text)
 RETURNS operator_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_assignment public.operator_assignments%rowtype;
begin
  if p_assignment_id is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  -- 1. Contratto primario: validazione tramite access_token dell'assegnazione
  if p_access_token is not null and btrim(p_access_token) <> '' then
    select * into v_assignment
    from public.operator_assignments
    where id = p_assignment_id and access_token = btrim(p_access_token);

    if found then
      if v_assignment.revoked_at is not null or v_assignment.status = 'revoked' then
        raise exception 'ASSEGNAZIONE_REVOCATA' using errcode = '42501';
      end if;
      return v_assignment;
    end if;
  end if;

  -- 2. Fallback per operatore autenticato (auth.uid() == operator_id)
  if v_uid is not null then
    select * into v_assignment
    from public.operator_assignments
    where id = p_assignment_id and operator_id = v_uid;

    if found then
      if v_assignment.revoked_at is not null or v_assignment.status = 'revoked' then
        raise exception 'ASSEGNAZIONE_REVOCATA' using errcode = '42501';
      end if;
      return v_assignment;
    end if;
  end if;

  -- 3. Nessuna credenziale valida o token non corrispondente
  raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
end;
$function$;

-- Regole admin: ruolo e email autorizzata, stessa verifica ovunque.
drop policy if exists "analytics_daily_rollup_admin_read" on public.analytics_daily_rollup;
create policy "analytics_daily_rollup_admin_read" on public.analytics_daily_rollup for select to authenticated using ((select public.gps_is_admin()));
drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin" on public.audit_log for select to authenticated using ((select public.gps_is_admin()));
drop policy if exists "campaigns_admin_all" on public.campaigns;
create policy "campaigns_admin_all" on public.campaigns for all to authenticated using ((select public.gps_is_admin())) with check ((select public.gps_is_admin()));
drop policy if exists "clienti_admin_all" on public.clienti;
create policy "clienti_admin_all" on public.clienti for all to authenticated using ((select public.gps_is_admin())) with check ((select public.gps_is_admin()));
drop policy if exists "clienti_referenti_admin_all" on public.clienti_referenti;
create policy "clienti_referenti_admin_all" on public.clienti_referenti for all to authenticated using ((select public.gps_is_admin())) with check ((select public.gps_is_admin()));
drop policy if exists "documenti_admin_all" on public.documenti;
create policy "documenti_admin_all" on public.documenti for all to authenticated using ((select public.gps_is_admin())) with check ((select public.gps_is_admin()));
drop policy if exists "error_log_admin_all" on public.error_log;
create policy "error_log_admin_all" on public.error_log for all to authenticated using ((select public.gps_is_admin())) with check ((select public.gps_is_admin()));
drop policy if exists "impostazioni_admin_all" on public.impostazioni;
create policy "impostazioni_admin_all" on public.impostazioni for all to authenticated using ((select public.gps_is_admin())) with check ((select public.gps_is_admin()));
drop policy if exists "platform_health_checks_admin_all" on public.platform_health_checks;
create policy "platform_health_checks_admin_all" on public.platform_health_checks for all to authenticated using ((select public.gps_is_admin())) with check ((select public.gps_is_admin()));
drop policy if exists "platform_incidents_admin_all" on public.platform_incidents;
create policy "platform_incidents_admin_all" on public.platform_incidents for all to authenticated using ((select public.gps_is_admin())) with check ((select public.gps_is_admin()));
drop policy if exists "quote_requests_admin_all" on public.quote_requests;
create policy "quote_requests_admin_all" on public.quote_requests for all to authenticated using ((select public.gps_is_admin())) with check ((select public.gps_is_admin()));
drop policy if exists "site_events_admin_all" on public.site_events;
create policy "site_events_admin_all" on public.site_events for all to authenticated using ((select public.gps_is_admin())) with check ((select public.gps_is_admin()));

-- greatest e coalesce non sono funzioni di pg_catalog: i cron fallivano a ogni esecuzione.
CREATE OR REPLACE FUNCTION public.analytics_prune(p_raw_days integer DEFAULT 90, p_rollup_months integer DEFAULT 13)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from public.site_events
  where created_at < now() - (greatest(p_raw_days, 1) || ' days')::interval;
  delete from public.analytics_daily_rollup
  where day < (now() at time zone 'Europe/Rome')::date - (greatest(p_rollup_months, 1) * 31);
end;
$function$;

CREATE OR REPLACE FUNCTION public.analytics_run_daily_rollup(p_day date DEFAULT (((now() AT TIME ZONE 'Europe/Rome'::text))::date - 1))
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from timestamptz := (p_day::timestamp at time zone 'Europe/Rome');
  v_to timestamptz := ((p_day + 1)::timestamp at time zone 'Europe/Rome');
begin
  delete from public.analytics_daily_rollup where day = p_day;

  with ev as (
    select * from public.site_events where created_at >= v_from and created_at < v_to
  )
  insert into public.analytics_daily_rollup (day, dimension, key, visitors, sessions, page_views, events, quotes_started, quotes_completed)
  -- overview
  select p_day, 'overview', 'all',
    pg_catalog.count(distinct anonymous_session_id),
    pg_catalog.count(*) filter (where event_name = 'session_started'),
    pg_catalog.count(*) filter (where event_name = 'page_view'),
    pg_catalog.count(*),
    pg_catalog.count(*) filter (where event_name = 'quote_started'),
    pg_catalog.count(*) filter (where event_name = 'quote_completed')
  from ev
  union all
  -- country / region / city
  select p_day, 'country', country, pg_catalog.count(distinct anonymous_session_id), 0, 0, pg_catalog.count(*), 0, 0
  from ev where country is not null group by country
  union all
  select p_day, 'region', region, pg_catalog.count(distinct anonymous_session_id), 0, 0, pg_catalog.count(*), 0, 0
  from ev where region is not null group by region
  union all
  select p_day, 'city', city, pg_catalog.count(distinct anonymous_session_id), 0, 0, pg_catalog.count(*), 0, 0
  from ev where city is not null group by city
  union all
  -- source (semplificata: utm_source | referrer_type | direct)
  select p_day, 'source', coalesce(nullif(utm_source, ''), nullif(referrer_type, ''), 'direct'),
    pg_catalog.count(distinct anonymous_session_id), 0, 0, pg_catalog.count(*), 0, 0
  from ev group by 3
  union all
  -- page
  select p_day, 'page', path, 0, 0, pg_catalog.count(*) filter (where event_name = 'page_view'), pg_catalog.count(*), 0, 0
  from ev where path is not null and event_name = 'page_view' group by path
  union all
  -- device
  select p_day, 'device', device_type, pg_catalog.count(distinct anonymous_session_id), 0, 0, pg_catalog.count(*), 0, 0
  from ev where device_type is not null group by device_type
  union all
  -- funnel step (sessioni distinte che raggiungono lo stadio)
  select p_day, 'funnel_step', s.stage, 0, pg_catalog.count(distinct s.sid), 0, 0, 0, 0
  from (
    select 'homepage'::text as stage, coalesce(session_id, anonymous_session_id) as sid from ev
      where event_name = 'page_view' and pg_catalog.lower(coalesce(path,'')) in ('/', '', '/index.html', '/home')
    union all
    select 'quote', coalesce(session_id, anonymous_session_id) from ev
      where event_name = 'quote_started'
         or (event_name = 'page_view' and (pg_catalog.lower(path) like '/preventivo%' or pg_catalog.lower(path) like '/configuratore%'))
         or (event_name = 'quote_step_reached' and (metadata->>'step') = '1')
    union all
    select 'municipality', coalesce(session_id, anonymous_session_id) from ev where event_name = 'municipality_selected'
    union all
    select 'quantity', coalesce(session_id, anonymous_session_id) from ev where event_name = 'quantity_selected'
    union all
    select 'step3', coalesce(session_id, anonymous_session_id) from ev where event_name = 'quote_step_reached' and (metadata->>'step') = '3'
    union all
    select 'step4', coalesce(session_id, anonymous_session_id) from ev where event_name = 'quote_step_reached' and (metadata->>'step') = '4'
    union all
    select 'completed', coalesce(session_id, anonymous_session_id) from ev where event_name = 'quote_completed'
  ) s
  where s.sid is not null
  group by s.stage
  union all
  -- domanda commerciale
  select p_day, 'municipality', metadata->>'municipality', pg_catalog.count(distinct anonymous_session_id), 0, 0, pg_catalog.count(*), 0, 0
  from ev where event_name = 'municipality_selected' and metadata->>'municipality' is not null group by metadata->>'municipality'
  union all
  select p_day, 'service', metadata->>'service', 0, 0, 0, pg_catalog.count(*), 0, 0
  from ev where metadata->>'service' is not null group by metadata->>'service'
  union all
  select p_day, 'quantity_bucket', metadata->>'quantity_bucket', 0, 0, 0, pg_catalog.count(*), 0, 0
  from ev where metadata->>'quantity_bucket' is not null group by metadata->>'quantity_bucket';
end;
$function$;

revoke execute on function public.analytics_prune(integer, integer) from public, anon, authenticated;
revoke execute on function public.analytics_run_daily_rollup(date) from public, anon, authenticated;
