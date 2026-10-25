-- Rollback of 20261025140000_test_campaign_rule.sql: removes rule, list, RPC and the two log actions.
-- Campaign flags are not touched (they were set by the 2026-10-25 cleanup, which has its own rollback).
-- Log rows with the two new actions, if any, are removed first: the original check rejects them.

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
