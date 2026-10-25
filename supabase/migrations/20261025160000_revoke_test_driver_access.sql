-- Driver access on the archived test campaigns (approved 2026-10-25).
-- The 2026-10-25 cleanup archived the test campaigns but left their driver jobs open: 56 active
-- assignments still opened in the driver app, and 6 active group links would let a driver join
-- again and get a NEW active assignment (driver_group_join does not look at the campaign status).
-- This migration revokes, only on campaigns with is_test = true and status = 'archived':
--   1. active operator_assignments  -> 'revoked' (the driver page shows the job as revoked)
--   2. active driver_group_access_links -> 'revoked' (no new joins)
--   3. active driver_group_participants -> 'revoked'
-- The previous values of every touched row are copied first into backup_ops.*_20261025.
-- No row is deleted. Campaigns, sessions and GPS points are not touched.
-- Rollback: supabase/migrations/rollback/20261025160000_revoke_test_driver_access.rollback.sql

create schema if not exists backup_ops;
revoke all on schema backup_ops from public, anon, authenticated;

create table backup_ops.operator_assignments_20261025 as
  select a.id, a.status, a.revoked_at, a.updated_at, a.metadata
  from public.operator_assignments a
  join public.campaigns c on c.id = a.campaign_id
  where a.status = 'active' and c.is_test and c.status = 'archived';

create table backup_ops.driver_group_access_links_20261025 as
  select l.id, l.status, l.revoked_at, l.metadata
  from public.driver_group_access_links l
  join public.campaigns c on c.id = l.campaign_id
  where l.status = 'active' and c.is_test and c.status = 'archived';

create table backup_ops.driver_group_participants_20261025 as
  select p.id, p.status
  from public.driver_group_participants p
  join public.campaigns c on c.id = p.campaign_id
  where p.status = 'active' and c.is_test and c.status = 'archived';

revoke all on all tables in schema backup_ops from public, anon, authenticated;

update public.operator_assignments a
  set status = 'revoked',
      revoked_at = pg_catalog.now(),
      metadata = coalesce(a.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        '_revoked_reason', 'dati di prova (campagna archiviata)',
        '_revoked_by_migration', '20261025160000')
  from backup_ops.operator_assignments_20261025 b
  where a.id = b.id and a.status = 'active';

update public.driver_group_access_links l
  set status = 'revoked',
      revoked_at = coalesce(l.revoked_at, pg_catalog.now()),
      metadata = coalesce(l.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        '_revoked_reason', 'dati di prova (campagna archiviata)',
        '_revoked_by_migration', '20261025160000')
  from backup_ops.driver_group_access_links_20261025 b
  where l.id = b.id and l.status = 'active';

update public.driver_group_participants p
  set status = 'revoked'
  from backup_ops.driver_group_participants_20261025 b
  where p.id = b.id and p.status = 'active';
