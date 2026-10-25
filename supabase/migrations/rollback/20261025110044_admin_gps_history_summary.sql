-- ATTENZIONE: termina con ROLLBACK = prova a vuoto.
-- Per ripristinare davvero sostituire ROLLBACK con COMMIT.
-- Revert the frontend to its previous deployment FIRST.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
drop function public.gps_admin_session_summaries(timestamptz,timestamptz,text);
drop function gps_monitor_private.summaries(timestamptz,timestamptz,text);
drop function gps_monitor_private.session_stats(uuid);
drop schema gps_monitor_private;
rollback;
