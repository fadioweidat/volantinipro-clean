-- Rollback of 20261024101000_close_test_campaigns.sql: puts campaigns, sessions and assignments
-- back exactly as saved, and removes the log rows written by the migration.

update public.campaigns c set status = b.status
  from backup_ops.campaigns_20261024b b where b.id = c.id;

update public.delivery_sessions s
   set status = b.status, ended_at = b.ended_at, metadata = b.metadata
  from backup_ops.delivery_sessions_20261024b b where b.id = s.id;

update public.operator_assignments a
   set status = b.status, revoked_at = b.revoked_at, metadata = b.metadata
  from backup_ops.operator_assignments_20261024b b where b.id = a.id;

delete from public.campaign_admin_action_log l
 using backup_ops.campaign_action_log_ids_20261024b b where b.id = l.id;
-- backup_ops.*_20261024b tables are kept on purpose (drop by hand when no longer needed).
