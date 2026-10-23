-- Close the test campaigns left "in distribuzione" (approved 2026-10-24). Nothing is deleted.
-- Targets: the 58 campaigns listed below that are in_progress AND is_test (set by 20261024100000).
-- For each one, in order:
--   1. open GPS sessions (started/paused, no end) -> cancelled, ended_at = last GPS point of the
--      session (or its pause/update/start time when it has no points);
--   2. active driver assignments -> revoked (like admin_revoke_operator_assignment);
--   3. campaign -> cancelled then archived, both logged in campaign_admin_action_log with the
--      reason "dati di prova" (the log keeps the in_progress -> cancelled -> archived history,
--      so admin_reopen_campaign can still reopen it).
-- Copies of every touched row are saved in backup_ops.*_20261024b.
-- Rollback: supabase/migrations/rollback/20261024101000_close_test_campaigns.rollback.sql

create schema if not exists backup_ops;
revoke all on schema backup_ops from public;
revoke all on schema backup_ops from anon, authenticated;

create temporary table close_targets on commit drop as
  select c.id from public.campaigns c
  where c.id = any (array[
    '59a27968-3e3d-4bc0-9635-74d9235e1463',
    '9276b544-6d46-472b-9a45-200856833c70',
    'ed799ad1-adf1-4f2a-9518-899642e411dd',
    '24b9f727-077e-42f0-a8c2-55f265f63e15',
    '6b6da72d-9178-4997-b63d-6f1b84f69aa1',
    '210c6a53-f201-45a0-909a-4351eecc0885',
    'fb49d2f4-edf1-4f5f-bb20-f07f9a2773b1',
    '7e25324e-63ce-4ada-a009-58c6f9877566',
    '2ebe7f0b-687e-419b-baf3-24df60866353',
    '2376f6fb-fe62-4e6f-952d-95bf3eb3ad22',
    '33adf782-5f57-49ac-bbe7-622c115be805',
    '3c846a51-a3e4-4d4a-b914-6fb1fe57b2fe',
    '6735e4fc-de4d-41d6-b24c-e26ff2b1affd',
    'daaed99b-24e2-4572-baf9-2c60cd606090',
    '5b5e068c-723e-4bb1-9469-8d2cc0cea092',
    '7b334fa1-b80d-4c3c-80f1-9b39f1a3b3aa',
    'fa4c50b6-13b7-4509-bf17-f35165738a50',
    '33345221-5323-49e3-8656-ef5bda3e69ed',
    '2553e31b-8a9b-4232-a163-7cd7b16c5ba6',
    '7406e420-9999-409c-88a9-e15a81353e35',
    '119f43d3-4b23-4674-bcef-08b7479e92ac',
    '4894d988-0498-49ff-b0d2-50079cdda646',
    '68f4222f-efc5-43c1-babf-2f62ec8e7ea1',
    '110e8d71-cbc3-4653-8c95-64c0acbca360',
    '2cdb9266-3e5f-40b8-844d-c85c36620fcc',
    '2f40a2f3-17ab-4513-b32f-e7f8b61178e2',
    'e3b6d95f-6cff-4fd3-9506-af192641dfe4',
    'f09445d5-7538-48e7-aa7d-35b21b91780f',
    'c54077d0-4aff-4c47-bea5-17cd403b4a2c',
    '868bf3b7-9587-4f3f-bae4-853eae886f01',
    '2df41ba1-aa0c-401c-8f59-ec9d3aae15d8',
    'a2b6e00f-1399-4a25-9bee-0d12d63f474c',
    'dcee6d22-dc1b-43d7-a0ff-369330439164',
    '6adc7b7a-6b0a-4b29-b9a7-841c3302dcb4',
    'db5fd900-1e49-458b-9916-ebaef4990c1b',
    '2e64339d-6c51-4160-93c2-d4b4cd04e654',
    '0301e51a-aa04-441a-91de-1d2d8ae3fc6b',
    '39101518-0b97-4487-9866-c401b68481f9',
    '3ad4f8aa-8d83-4db1-8db0-a8565324bf37',
    '7d57e1ab-ec39-4c8a-9768-124084ef1d2f',
    '0340e2e0-4a05-4bce-a1a7-0295fc5a42b6',
    '2a568c6d-6e9d-40cf-8621-5436528e873c',
    'a9e8cdef-88e0-4cb5-9271-f335cabe54eb',
    'c633cf19-c14b-412c-802d-26a405a07932',
    'd07cdeea-655d-48f6-8269-fdf897b4f515',
    '8bb10172-b8c5-4198-b628-c4d12f4ce1ff',
    'dc5a5357-453c-46bc-9d1b-48a592ef6152',
    'f76a9055-76d1-4aad-b8f6-03337cca2112',
    '9f99eb7e-76f7-4fee-af44-76ed9e04bf5a',
    '7816679c-a3c1-4665-9540-f5c890e52e4d',
    '84b5aef0-eb35-4097-8aff-ca129c76aca7',
    '50a8befc-adaf-4e06-ab7a-334c92f31f9c',
    '810ad5f5-bd2a-4481-b212-d713d883f819',
    'f3b337af-153c-4f41-8523-997bf35333f2',
    'aed50d1c-37d8-46f1-b8ae-e1e693d18ba4',
    '87df2760-f1f2-4c5d-b2c6-c3b7d222b347',
    '1f1706f5-2c68-4921-a02a-eaaeb9c62e59',
    'df9c4bc9-3f8a-4db6-8507-609451f17953'
  ]::uuid[])
    and c.status = 'in_progress' and c.is_test;

create table backup_ops.campaigns_20261024b as
  select c.id, c.status, c.updated_at, pg_catalog.now() as saved_at
  from public.campaigns c where c.id in (select id from close_targets);

create table backup_ops.delivery_sessions_20261024b as
  select s.id, s.status, s.ended_at, s.updated_at, s.metadata, pg_catalog.now() as saved_at
  from public.delivery_sessions s
  where s.campaign_id in (select id from close_targets)
    and s.status in ('started', 'paused') and s.ended_at is null;

create table backup_ops.operator_assignments_20261024b as
  select a.id, a.status, a.revoked_at, a.updated_at, a.metadata, pg_catalog.now() as saved_at
  from public.operator_assignments a
  where a.campaign_id in (select id from close_targets)
    and a.status = 'active';

-- 1. Sessions.
update public.delivery_sessions s
   set status = 'cancelled',
       ended_at = coalesce(
         (select pg_catalog.max(p.recorded_at) from public.gps_tracking_points p where p.session_id = s.id),
         s.paused_at, s.updated_at, s.started_at),
       metadata = coalesce(s.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
         'closed_by', 'migration 20261024101000', 'closed_reason', 'dati di prova')
 where s.id in (select id from backup_ops.delivery_sessions_20261024b);

-- 2. Assignments.
update public.operator_assignments a
   set status = 'revoked',
       revoked_at = pg_catalog.now(),
       metadata = coalesce(a.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
         '_revoked_at', pg_catalog.now()::text, '_revoked_reason', 'dati di prova',
         '_revoked_by_migration', '20261024101000')
 where a.id in (select id from backup_ops.operator_assignments_20261024b);

-- 3. Campaigns: log first (snapshots read the current title), then the final status.
create table backup_ops.campaign_action_log_ids_20261024b (id uuid primary key);

with logged as (
  insert into public.campaign_admin_action_log (
    campaign_id, campaign_id_snapshot, campaign_title_snapshot, action, previous_state, new_state, reason, actor_id)
  select c.id, c.id, coalesce(nullif(pg_catalog.btrim(c.title), ''), c.campaign_name, c.id::text),
         x.action, x.prev, x.next, 'dati di prova', null
  from public.campaigns c
  join close_targets t on t.id = c.id
  cross join (values (1, 'campaign_cancelled', 'in_progress', 'cancelled'),
                     (2, 'campaign_archived', 'cancelled', 'archived')) as x(ord, action, prev, next)
  order by c.id, x.ord
  returning id
)
insert into backup_ops.campaign_action_log_ids_20261024b (id) select id from logged;

update public.campaigns c
   set status = 'archived'
 where c.id in (select id from close_targets);

revoke all on all tables in schema backup_ops from public, anon, authenticated;
