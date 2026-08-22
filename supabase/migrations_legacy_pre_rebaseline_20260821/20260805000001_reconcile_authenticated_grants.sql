begin;

-- RLS policies do not grant table privileges by themselves. Keep grants
-- limited to the operations already allowed by the policies in this chain.
grant select, insert, update on table public.clienti to authenticated;
grant select, insert, update on table public.campagne to authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.campaigns to authenticated;
grant select on table public.campaign_zones to authenticated;

grant select, insert, update, delete on table public.operational_groups to authenticated;
grant select, insert, update, delete on table public.operator_profiles to authenticated;
grant select, insert, update, delete on table public.operator_assignments to authenticated;

grant select, insert, update on table public.delivery_sessions to authenticated;
grant select, insert on table public.gps_tracking_points to authenticated;
grant select, insert on table public.proof_photos to authenticated;
grant select on table public.gps_operator_audit_log to authenticated;
grant select on table public.delivery_session_coverage to authenticated;

grant select on table public.campaign_zone_progress to authenticated;
grant select on table public.campaign_zone_progress_history to authenticated;
grant select, insert on table public.ai_territorial_chat_cache to authenticated;

commit;
