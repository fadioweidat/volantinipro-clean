-- Test data separation (approved 2026-10-24/25). The existing test campaigns were already flagged
-- by the approved cleanup of 2026-10-25 (docs/GPS_TEST_CLEANUP_20261025.md, 103 campaigns) plus the
-- info@volantinipro.it campaign (2026-10-25): this migration only adds what keeps it that way.
-- 1. Automatic rule for NEW campaigns of test accounts: e-mail patterns (qa/test/e2e, example.*,
--    .invalid, .test) plus the explicit list public.test_account_emails. Not Fadi's main account
--    fenice.sp@gmail.com, not info@volantinipro.it.
-- 2. admin_set_campaign_test: the admin "Segna come prova" / "Non è una prova" action (reason
--    required, logged in campaign_admin_action_log).
-- No existing row is modified.
-- Rollback: supabase/migrations/rollback/20261025140000_test_campaign_rule.rollback.sql

-- Explicit test accounts (lower-case e-mails); patterns live in is_test_account_email().
create table if not exists public.test_account_emails (
  email text primary key check (email = pg_catalog.lower(pg_catalog.btrim(email))),
  note text,
  created_at timestamptz not null default pg_catalog.now()
);
alter table public.test_account_emails enable row level security;
revoke all on table public.test_account_emails from anon, authenticated;
grant select on table public.test_account_emails to authenticated;
create policy test_account_emails_select_admin on public.test_account_emails
  for select to authenticated using (public.gps_is_admin());

insert into public.test_account_emails (email, note) values
  ('demo@volantinipro.it', 'account demo'),
  ('admin-1785913811466@volantinipro.it', 'admin di prova generato dai test'),
  ('marco.bianchi@volantinipro.it', 'campagne di prova (pulizia 2026-10-25)'),
  ('infopostini@gmail.com', 'fornitore di prova LGT / Hassan (pulizia 2026-10-25)')
on conflict (email) do nothing;

create or replace function public.is_test_account_email(p_email text)
returns boolean
language sql stable security definer
set search_path to ''
as $fn$
  select coalesce(
    pg_catalog.lower(pg_catalog.btrim(p_email)) ~ '(^(qa|test)([._+-]|[0-9])[^@]*@|^(qa|test)@|e2e[^@]*@|@example\.(com|org|net)$|\.(invalid|test)$)'
    or exists (select 1 from public.test_account_emails t where t.email = pg_catalog.lower(pg_catalog.btrim(p_email))),
    false)
$fn$;
revoke all on function public.is_test_account_email(text) from public, anon, authenticated;

create or replace function public.campaigns_mark_test_account()
returns trigger
language plpgsql security definer
set search_path to ''
as $fn$
begin
  if not coalesce(new.is_test, false) and (
       public.is_test_account_email(new.client_email)
       or exists (select 1 from auth.users u where u.id = new.user_id and public.is_test_account_email(u.email))
     ) then
    new.is_test := true;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object('is_test_reason', 'test_account');
  end if;
  return new;
end;
$fn$;
revoke all on function public.campaigns_mark_test_account() from public, anon, authenticated;

drop trigger if exists campaigns_mark_test_account_trg on public.campaigns;
create trigger campaigns_mark_test_account_trg
  before insert on public.campaigns
  for each row execute function public.campaigns_mark_test_account();

-- "Segna come prova" / "Non è una prova" from the admin, logged like the other admin actions.
alter table public.campaign_admin_action_log drop constraint campaign_admin_action_log_action_check;
alter table public.campaign_admin_action_log add constraint campaign_admin_action_log_action_check
  check (action = any (array['campaign_cancelled', 'campaign_archived', 'campaign_reopened',
    'payment_confirmation_revoked', 'program_revoked', 'campaign_hard_deleted',
    'campaign_marked_test', 'campaign_unmarked_test']));

create or replace function public.admin_set_campaign_test(p_campaign_id uuid, p_is_test boolean, p_reason text)
returns public.campaigns
language plpgsql security definer
set search_path to ''
as $fn$
declare
  v_old public.campaigns%rowtype;
  v_new public.campaigns%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if p_is_test is null then
    raise exception 'VALORE_OBBLIGATORIO' using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;
  select * into v_old from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_old.is_test = p_is_test then
    return v_old;
  end if;
  update public.campaigns set is_test = p_is_test where id = p_campaign_id returning * into v_new;
  perform public.admin_log_campaign_action(
    p_campaign_id,
    case when p_is_test then 'campaign_marked_test' else 'campaign_unmarked_test' end,
    case when v_old.is_test then 'test' else 'real' end,
    case when p_is_test then 'test' else 'real' end,
    p_reason);
  return v_new;
end;
$fn$;
revoke all on function public.admin_set_campaign_test(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_campaign_test(uuid, boolean, text) to authenticated;
