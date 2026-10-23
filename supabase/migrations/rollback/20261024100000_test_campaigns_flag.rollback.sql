-- Rollback of 20261024100000_test_campaigns_flag.sql.
-- Restores is_test from the backup, removes rule, RPC and the two new log actions
-- (log rows with those actions, if any, are removed first: the original check rejects them).

update public.campaigns c set is_test = b.is_test
  from backup_ops.campaigns_is_test_20261024 b where b.id = c.id;

drop function if exists public.admin_set_campaign_test(uuid, boolean, text);
delete from public.campaign_admin_action_log where action in ('campaign_marked_test', 'campaign_unmarked_test');
alter table public.campaign_admin_action_log drop constraint campaign_admin_action_log_action_check;
alter table public.campaign_admin_action_log add constraint campaign_admin_action_log_action_check
  check (action = any (array['campaign_cancelled', 'campaign_archived', 'campaign_reopened',
    'payment_confirmation_revoked', 'program_revoked', 'campaign_hard_deleted']));

drop trigger if exists campaigns_mark_test_account_trg on public.campaigns;
drop function if exists public.campaigns_mark_test_account();
drop function if exists public.is_test_account_email(text);
drop table if exists public.test_account_emails;
-- backup_ops.campaigns_is_test_20261024 is kept on purpose (drop by hand when no longer needed).
