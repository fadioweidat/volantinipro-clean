begin;

-- Edge Functions use service_role only after validating the caller JWT.
-- RLS bypass still requires explicit SQL table privileges on a clean replay.
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.campaigns to service_role;
grant select, insert, update, delete on table public.ai_territorial_chat_cache to service_role;

commit;
