-- Rollback for 20261017120000_search_municipalities.sql.
-- The client falls back to Nominatim automatically when the function is missing.
drop function if exists public.search_municipalities(text);
