-- Rollback of 20261025160000_revoke_test_driver_access.sql: puts back the exact previous values
-- of the revoked assignments, group links and participants from backup_ops.*_20261025.
-- Only rows still revoked by that migration are restored (a later admin change is left alone).
-- The backup tables are kept; drop them by hand only after Fadi's OK.

update public.operator_assignments a
  set status = b.status, revoked_at = b.revoked_at, metadata = b.metadata
  from backup_ops.operator_assignments_20261025 b
  where a.id = b.id and a.status = 'revoked'
    and a.metadata ->> '_revoked_by_migration' = '20261025160000';

update public.driver_group_access_links l
  set status = b.status, revoked_at = b.revoked_at, metadata = b.metadata
  from backup_ops.driver_group_access_links_20261025 b
  where l.id = b.id and l.status = 'revoked'
    and l.metadata ->> '_revoked_by_migration' = '20261025160000';

update public.driver_group_participants p
  set status = b.status
  from backup_ops.driver_group_participants_20261025 b
  where p.id = b.id and p.status = 'revoked';

delete from supabase_migrations.schema_migrations where version = '20261025160000';
