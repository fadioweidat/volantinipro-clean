-- Public comune autocomplete for the homepage calculator and Preventivo Rapido.
--
-- geo_municipalities has RLS enabled and no anon SELECT policy (by design: it
-- also holds geometries and demographic totals). Instead of opening the table,
-- this function exposes ONLY name, province and centroid for a prefix search.
--
-- Contract:
--   * prefix: trimmed; fewer than 2 characters -> no rows; longer than 60 -> cut.
--   * case-insensitive and accent-insensitive (translate(), no extension needed).
--   * % and _ in the input are escaped: they match literally, never as wildcards.
--   * at most 10 rows; exact name match first, then shorter names, then A-Z.
--   * SECURITY DEFINER with an empty search_path: every object is schema-qualified.
--   * EXECUTE only for anon and authenticated (revoked from PUBLIC).
-- No writes, no change to existing tables, policies or grants.

create or replace function public.search_municipalities(prefix text)
returns table (
  municipality_name text,
  province_code text,
  province_name text,
  centroid_lat numeric,
  centroid_lng numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select left(btrim(coalesce(prefix, '')), 60) as raw
  ),
  normalized as (
    select
      translate(lower(raw),
        'àáâãäåèéêëìíîïòóôõöùúûüýÿç',
        'aaaaaaeeeeiiiiooooouuuuyyc') as q
    from input
    where char_length(raw) >= 2
  ),
  pattern as (
    select
      q,
      replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' as like_pattern
    from normalized
  ),
  matches as (
    select distinct on (lower(m.municipality_name), m.province_code)
      m.municipality_name,
      m.province_code,
      m.province_name,
      m.centroid_lat,
      m.centroid_lng,
      translate(lower(m.municipality_name),
        'àáâãäåèéêëìíîïòóôõöùúûüýÿç',
        'aaaaaaeeeeiiiiooooouuuuyyc') as normalized_name
    from public.geo_municipalities m
    cross join pattern p
    where m.centroid_lat is not null
      and m.centroid_lng is not null
      and translate(lower(m.municipality_name),
        'àáâãäåèéêëìíîïòóôõöùúûüýÿç',
        'aaaaaaeeeeiiiiooooouuuuyyc') like p.like_pattern escape '\'
    order by lower(m.municipality_name), m.province_code, m.updated_at desc nulls last
  )
  select x.municipality_name, x.province_code, x.province_name, x.centroid_lat, x.centroid_lng
  from matches x
  cross join pattern p
  order by (x.normalized_name = p.q) desc, char_length(x.municipality_name), x.municipality_name
  limit 10;
$$;

revoke all on function public.search_municipalities(text) from public;
-- Supabase default privileges also grant new functions to service_role: keep EXECUTE to the two public roles only.
revoke all on function public.search_municipalities(text) from service_role;
grant execute on function public.search_municipalities(text) to anon, authenticated;

comment on function public.search_municipalities(text) is
  'Comune autocomplete (prefix, case/accent-insensitive, max 10). Returns only name, province and centroid. Read-only.';
