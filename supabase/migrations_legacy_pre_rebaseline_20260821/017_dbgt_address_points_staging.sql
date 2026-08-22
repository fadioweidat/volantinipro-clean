create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists public.dbgt_import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'dbgt_lombardia',
  province text,
  package_name text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  stats jsonb not null default '{}'::jsonb
);

create table if not exists public.dbgt_limiti_comunali (
  source_id text primary key,
  codice_comune text,
  comune text,
  sigla_provincia text,
  provincia text,
  download_url text,
  anno_ril_agg text,
  geom geometry(MultiPolygon, 4326),
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dbgt_toponimo_stradale (
  source_id text primary key,
  codice_comune_ref text,
  codice text,
  tipo_toponimo text,
  fonte text,
  scala text,
  cod_cons text,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dbgt_toponimo_nome (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  lingua text,
  nome text,
  cod_cons text,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (source_id, lingua, nome)
);

create table if not exists public.dbgt_numero_civico (
  source_id text primary key,
  numero text,
  subalterno text,
  toponimo_id text,
  fonte text,
  scala text,
  cod_cons text,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dbgt_accesso_esterno (
  source_id text primary key,
  fonte text,
  scala text,
  cod_cons text,
  geom geometry(Point, 4326),
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dbgt_accesso_numero_civico (
  id uuid primary key default gen_random_uuid(),
  accesso_id text not null,
  civico_id text not null,
  cod_cons text,
  raw_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (accesso_id, civico_id)
);

create index if not exists dbgt_limiti_comunali_geom_gix
  on public.dbgt_limiti_comunali using gist (geom);

create index if not exists dbgt_limiti_comunali_province_idx
  on public.dbgt_limiti_comunali (sigla_provincia);

create index if not exists dbgt_toponimo_stradale_comune_ref_idx
  on public.dbgt_toponimo_stradale (codice_comune_ref);

create index if not exists dbgt_toponimo_nome_source_idx
  on public.dbgt_toponimo_nome (source_id);

create index if not exists dbgt_numero_civico_toponimo_idx
  on public.dbgt_numero_civico (toponimo_id);

create index if not exists dbgt_accesso_esterno_geom_gix
  on public.dbgt_accesso_esterno using gist (geom);

create index if not exists dbgt_accesso_numero_accesso_idx
  on public.dbgt_accesso_numero_civico (accesso_id);

create index if not exists dbgt_accesso_numero_civico_idx
  on public.dbgt_accesso_numero_civico (civico_id);

create or replace function public.materialize_dbgt_address_points(p_province text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  updated_count integer := 0;
  disabled_osm_count integer := 0;
begin
  with materialized as (
    select distinct on (a.source_id, nc.source_id)
      'dbgt_lombardia'::text as source,
      concat(a.source_id, ':', nc.source_id) as source_id,
      coalesce(lc.comune, '') as comune,
      nullif(regexp_replace(coalesce(lc.codice_comune, ''), '^03', ''), '') as codice_comune,
      tn.nome as via,
      trim(concat_ws('/', nullif(nc.numero, ''), nullif(nc.subalterno, ''))) as numero_civico,
      st_y(a.geom)::double precision as lat,
      st_x(a.geom)::double precision as lng,
      a.geom,
      1.00::numeric(3,2) as confidence,
      jsonb_build_object(
        'accesso', a.raw_payload,
        'civico', nc.raw_payload,
        'toponimo', ts.raw_payload,
        'toponimo_nome', tn.raw_payload,
        'comune', lc.raw_payload
      ) as raw_tags
    from public.dbgt_accesso_numero_civico rel
    join public.dbgt_accesso_esterno a
      on a.source_id = rel.accesso_id
    join public.dbgt_numero_civico nc
      on nc.source_id = rel.civico_id
    left join public.dbgt_toponimo_stradale ts
      on ts.source_id = nc.toponimo_id
    left join lateral (
      select n.*
      from public.dbgt_toponimo_nome n
      where n.source_id = ts.source_id
      order by case when n.lingua in ('10', 'ita', 'IT', 'it') then 0 else 1 end, n.nome
      limit 1
    ) tn on true
    left join lateral (
      select c.*
      from public.dbgt_limiti_comunali c
      where c.geom is not null
        and a.geom is not null
        and st_intersects(c.geom, a.geom)
      order by st_area(c.geom::geography) asc
      limit 1
    ) lc on true
    where a.geom is not null
      and nullif(nc.numero, '') is not null
      and (p_province is null or lower(coalesce(lc.sigla_provincia, '')) = lower(p_province))
  ),
  upserted as (
    insert into public.address_points (
      source,
      source_id,
      comune,
      codice_comune,
      via,
      numero_civico,
      lat,
      lng,
      geom,
      confidence,
      raw_tags
    )
    select
      source,
      source_id,
      comune,
      codice_comune,
      via,
      numero_civico,
      lat,
      lng,
      geom,
      confidence,
      raw_tags
    from materialized
    where comune <> ''
    on conflict (source, source_id) where source_id is not null do update set
      comune = excluded.comune,
      codice_comune = excluded.codice_comune,
      via = excluded.via,
      numero_civico = excluded.numero_civico,
      lat = excluded.lat,
      lng = excluded.lng,
      geom = excluded.geom,
      confidence = excluded.confidence,
      raw_tags = excluded.raw_tags,
      updated_at = now()
    returning (xmax = 0) as inserted
  )
  select
    count(*) filter (where inserted),
    count(*) filter (where not inserted)
  into inserted_count, updated_count
  from upserted;

  update public.address_points osm
  set raw_tags = coalesce(osm.raw_tags, '{}'::jsonb) || jsonb_build_object('deduped_by', 'dbgt_lombardia')
  from public.address_points dbgt
  where osm.source = 'osm'
    and dbgt.source = 'dbgt_lombardia'
    and lower(coalesce(osm.comune, '')) = lower(coalesce(dbgt.comune, ''))
    and lower(coalesce(osm.via, '')) = lower(coalesce(dbgt.via, ''))
    and lower(coalesce(osm.numero_civico, '')) = lower(coalesce(dbgt.numero_civico, ''))
    and st_dwithin(osm.geom::geography, dbgt.geom::geography, 15);

  get diagnostics disabled_osm_count = row_count;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'osm_deduped', disabled_osm_count
  );
end;
$$;
