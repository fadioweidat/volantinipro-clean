-- 20261009150000_campaigns_owner_write_lockdown.sql
--
-- Phase 3B.4-D6. Production (read-only audit, 2026-10-09) lets any signed-in
-- customer write public.campaigns directly through PostgREST:
--   * campaigns_own_insert  (INSERT TO authenticated WITH CHECK auth.uid() = user_id)
--     creates campaigns with any total_amount / status / metadata;
--   * campaigns_own_update  (UPDATE TO authenticated USING/CHECK auth.uid() = user_id)
--     lets the owner rewrite total_amount, status ('approved'),
--     metadata.payment_status ('pagato') or the whole metadata JSON;
--   * anon and authenticated hold every table privilege (arwdDxtm), including
--     TRUNCATE, which RLS does not filter.
-- The only guard trigger (campaigns_marketplace_assignment_guard) covers
-- supplier_id and the marketplace statuses only.
--
-- No legitimate customer flow writes campaigns as the authenticated role:
--   * submission: submit-campaign-request (service_role);
--   * claim / accept quote / supplier quote / admin transitions: SECURITY
--     DEFINER RPCs owned by postgres;
--   * admin pages: authenticated + campaigns_admin_all (kept).
--
-- Fix (minimal; reversible):
--   1. drop the two owner write policies (SELECT policies are unchanged);
--   2. revoke the write and RLS-bypassing privileges from anon (which has no
--      campaigns policy), and TRUNCATE/REFERENCES/TRIGGER/MAINTAIN from
--      authenticated (admins keep SELECT/INSERT/UPDATE/DELETE through
--      campaigns_admin_all);
--   3. defence in depth: a SECURITY INVOKER guard trigger rejects any
--      INSERT/UPDATE/DELETE executed directly as anon/authenticated unless the
--      caller passes the same admin test as campaigns_admin_all. Statements
--      executed inside SECURITY DEFINER RPCs run as their owner (postgres), and
--      service_role/postgres are not affected.
-- No data, column, other policy, other table or existing trigger is touched.
-- Idempotent. Rollback:
-- supabase/migrations/rollback/20261009150000_campaigns_owner_write_lockdown.rollback.sql

drop policy if exists "campaigns_own_insert" on public.campaigns;
drop policy if exists "campaigns_own_update" on public.campaigns;

revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.campaigns from anon;
revoke truncate, references, trigger, maintain
  on table public.campaigns from authenticated;

create or replace function public.campaigns_client_write_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Same admin predicate as policy campaigns_admin_all.
  if current_user in ('anon', 'authenticated')
     and not exists (
       select 1 from public.profiles
       where profiles.id = auth.uid()
         and profiles.role = any (array['admin', 'super_admin'])
     ) then
    raise exception 'CAMPAIGN_WRITE_SERVER_ONLY' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.campaigns_client_write_guard() from public, anon, authenticated;

drop trigger if exists campaigns_client_write_guard_trg on public.campaigns;
create trigger campaigns_client_write_guard_trg
  before insert or update or delete on public.campaigns
  for each row execute function public.campaigns_client_write_guard();
