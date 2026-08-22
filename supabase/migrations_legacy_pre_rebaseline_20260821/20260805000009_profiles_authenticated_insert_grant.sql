-- RLS still applies; this privilege only lets authenticated users reach the
-- profiles_own_insert policy added by the preceding migration.
grant insert on table public.profiles to authenticated;
