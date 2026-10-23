-- Test data separation (approved 2026-10-24).
-- 1. is_test on the 104 test campaigns that lacked it (list reviewed with Fadi:
--    db-backups/2026-10-24-test-data/elenco-campagne-da-segnare.md). Previous values saved in
--    backup_ops.campaigns_is_test_20261024 (schema not exposed to the API).
-- 2. Automatic rule for new campaigns of test accounts: e-mail patterns (qa/test/e2e, example.*,
--    .invalid, .test) plus the explicit list public.test_account_emails. Fadi's main account
--    fenice.sp@gmail.com is NOT a test account.
-- 3. admin_set_campaign_test: the admin "Segna come prova" button (reason required, logged).
-- Rollback: supabase/migrations/rollback/20261024100000_test_campaigns_flag.rollback.sql

create schema if not exists backup_ops;
revoke all on schema backup_ops from public;
revoke all on schema backup_ops from anon, authenticated;

create table backup_ops.campaigns_is_test_20261024 as
  select c.id, c.is_test, pg_catalog.now() as saved_at
  from public.campaigns c
  where c.id = any (array[
    '59a27968-3e3d-4bc0-9635-74d9235e1463',
    '8d603c54-d271-4b39-9b8a-89f4f9d9beb6',
    '12e2613a-7848-4a64-a007-122a44031b97',
    '36b1f646-b57d-4259-8001-3b11ed71953a',
    'ededb26f-6a37-4251-88b0-60bc93267097',
    'c41c005f-63bf-44f0-b503-f3cc8edae55d',
    '0c8c98bc-f917-4b28-9cd5-d3dda3271566',
    '14d4021e-ac5f-4cbe-a582-5759c320cd1b',
    '9276b544-6d46-472b-9a45-200856833c70',
    'ed799ad1-adf1-4f2a-9518-899642e411dd',
    '24b9f727-077e-42f0-a8c2-55f265f63e15',
    '6b6da72d-9178-4997-b63d-6f1b84f69aa1',
    '210c6a53-f201-45a0-909a-4351eecc0885',
    '1bde3d39-3d88-4907-9bf5-48529765f742',
    'fb49d2f4-edf1-4f5f-bb20-f07f9a2773b1',
    'e0630c06-7c0f-4884-8c73-ccca7c7f6973',
    '1eea0372-25d2-4899-95ea-e36d7dc7444e',
    'a52d1d2d-9275-4183-8481-8fe4ca50fa22',
    'e1ae7a8c-1e8d-4e98-870e-407c3f49fc68',
    'b7234aa8-854f-44ba-a06c-5093aa331c80',
    '520e0dba-61b9-4c78-b587-3d7006e86fa4',
    'd95beccd-6ef0-40b3-839e-aecec4c3526a',
    '11558fb4-338b-468c-aac1-043b0c7e80f3',
    '7e25324e-63ce-4ada-a009-58c6f9877566',
    '38152950-19e5-4141-84c4-a45741cbcba5',
    '2ebe7f0b-687e-419b-baf3-24df60866353',
    '2376f6fb-fe62-4e6f-952d-95bf3eb3ad22',
    'dcedac4f-a993-4fa4-b8f5-835729769f39',
    'caabb1a4-a9bd-47c7-9755-78975ac45858',
    '33adf782-5f57-49ac-bbe7-622c115be805',
    'f909cd01-3606-4253-9b61-d57df01fc2a1',
    '3c846a51-a3e4-4d4a-b914-6fb1fe57b2fe',
    '6735e4fc-de4d-41d6-b24c-e26ff2b1affd',
    'e158d7c9-9a0a-4738-a738-28a7226ff573',
    'b3001dd9-5bcc-4da8-b648-a7014b565694',
    'bb12129e-3f27-45ab-8dd6-8d87101ea2d5',
    'daaed99b-24e2-4572-baf9-2c60cd606090',
    '5b5e068c-723e-4bb1-9469-8d2cc0cea092',
    '7b334fa1-b80d-4c3c-80f1-9b39f1a3b3aa',
    'c64d7fba-6209-4e31-88e5-7c703821d844',
    'f7319671-0ae2-4a88-ae17-8e4049be3f34',
    'fa4c50b6-13b7-4509-bf17-f35165738a50',
    '77f9cd0b-afe7-4aa1-983e-a3f7f61c82e6',
    '33345221-5323-49e3-8656-ef5bda3e69ed',
    '2553e31b-8a9b-4232-a163-7cd7b16c5ba6',
    '7406e420-9999-409c-88a9-e15a81353e35',
    '832583f7-fec6-4887-98de-cf98bbe542a8',
    'b8b3213e-e130-4d4d-853f-31735abfbffe',
    '11ea5272-bcf4-4019-a0a7-bfce14a49008',
    '119f43d3-4b23-4674-bcef-08b7479e92ac',
    '4894d988-0498-49ff-b0d2-50079cdda646',
    '9bd147c3-6031-4fc3-8b36-8d66d7ebf5aa',
    '68f4222f-efc5-43c1-babf-2f62ec8e7ea1',
    '110e8d71-cbc3-4653-8c95-64c0acbca360',
    '2cdb9266-3e5f-40b8-844d-c85c36620fcc',
    '2f40a2f3-17ab-4513-b32f-e7f8b61178e2',
    'e3b6d95f-6cff-4fd3-9506-af192641dfe4',
    'f09445d5-7538-48e7-aa7d-35b21b91780f',
    '6fe9c848-4ae1-4fd7-a352-deb4a9d92cc4',
    'c54077d0-4aff-4c47-bea5-17cd403b4a2c',
    '9dc3e5fd-21bf-4293-a322-3a516546cfed',
    'ce64dca3-1283-4842-9e61-5705d9d07284',
    '868bf3b7-9587-4f3f-bae4-853eae886f01',
    '2df41ba1-aa0c-401c-8f59-ec9d3aae15d8',
    'a2b6e00f-1399-4a25-9bee-0d12d63f474c',
    '10cff471-3ed9-47e2-8501-69f14cdbf03f',
    'de271512-1841-450b-aa28-d00b8e5f76ff',
    'dcee6d22-dc1b-43d7-a0ff-369330439164',
    '6adc7b7a-6b0a-4b29-b9a7-841c3302dcb4',
    'db5fd900-1e49-458b-9916-ebaef4990c1b',
    '2e64339d-6c51-4160-93c2-d4b4cd04e654',
    '0301e51a-aa04-441a-91de-1d2d8ae3fc6b',
    '39101518-0b97-4487-9866-c401b68481f9',
    '3ad4f8aa-8d83-4db1-8db0-a8565324bf37',
    'f4070e2e-18a2-44a0-88f1-435b2e581f63',
    'ba4e39fe-d624-4852-aaa8-4b8e50a5de20',
    '7d57e1ab-ec39-4c8a-9768-124084ef1d2f',
    '2b91bc15-6376-491b-9e7d-f356a7322aea',
    '0340e2e0-4a05-4bce-a1a7-0295fc5a42b6',
    '2a568c6d-6e9d-40cf-8621-5436528e873c',
    'a9e8cdef-88e0-4cb5-9271-f335cabe54eb',
    'c633cf19-c14b-412c-802d-26a405a07932',
    'd07cdeea-655d-48f6-8269-fdf897b4f515',
    '8bb10172-b8c5-4198-b628-c4d12f4ce1ff',
    '9a19892f-6dbd-42ba-87d4-69734755a9a6',
    'dc5a5357-453c-46bc-9d1b-48a592ef6152',
    'f0dade8e-20a5-4cfe-98ac-2a7667ab136d',
    'f76a9055-76d1-4aad-b8f6-03337cca2112',
    '9f99eb7e-76f7-4fee-af44-76ed9e04bf5a',
    '7816679c-a3c1-4665-9540-f5c890e52e4d',
    'd94a7cfd-c9a0-4d89-8cb9-1986954d7f44',
    '84b5aef0-eb35-4097-8aff-ca129c76aca7',
    '50a8befc-adaf-4e06-ab7a-334c92f31f9c',
    '810ad5f5-bd2a-4481-b212-d713d883f819',
    'f3b337af-153c-4f41-8523-997bf35333f2',
    '0b81c17e-eb01-4e50-af36-5e1b4dfc46e8',
    'aed50d1c-37d8-46f1-b8ae-e1e693d18ba4',
    '54b07684-cfe5-4691-8ae1-351fb011ae35',
    '87df2760-f1f2-4c5d-b2c6-c3b7d222b347',
    '1f1706f5-2c68-4921-a02a-eaaeb9c62e59',
    'df9c4bc9-3f8a-4db6-8507-609451f17953',
    '8f09cfb9-14fd-4a6e-83ec-f053fc989333',
    '9cbaad74-8365-4059-9051-e5326e11b4eb',
    'ab8d74a4-5d69-4769-9b38-8de4d7c7dab8'
  ]::uuid[]);

update public.campaigns c
   set is_test = true
 where c.id in (select b.id from backup_ops.campaigns_is_test_20261024 b)
   and not c.is_test;

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
  ('info@volantinipro.it', 'campagne di prova'),
  ('marco.bianchi@volantinipro.it', 'campagne di prova')
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
