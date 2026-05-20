create or replace function public.upsert_omi_zones_batch(rows jsonb)
returns integer
language plpgsql
security definer
as $$
declare
  item jsonb;
  affected integer := 0;
  geometry_text text;
  geom_value geometry(MultiPolygon, 4326);
begin
  for item in select * from jsonb_array_elements(coalesce(rows, '[]'::jsonb))
  loop
    geom_value := null;
    geometry_text := nullif(coalesce(item->>'geometry_geojson', item->>'geom_geojson', item->>'geometry'), '');

    if geometry_text is not null then
      begin
        geom_value := st_multi(st_setsrid(st_geomfromgeojson(geometry_text), 4326))::geometry(MultiPolygon, 4326);
      exception
        when others then
          geom_value := null;
      end;
    end if;

    insert into public.omi_zones (
      source,
      year,
      semester,
      municipality_name,
      municipality_code,
      zone_code,
      zone_name,
      min_value,
      max_value,
      typology,
      currency,
      geom,
      raw_payload
    )
    values (
      coalesce(nullif(item->>'source', ''), 'Agenzia Entrate - OMI'),
      nullif(item->>'year', '')::integer,
      nullif(item->>'semester', '')::integer,
      nullif(coalesce(item->>'municipality_name', item->>'comune'), ''),
      nullif(coalesce(item->>'municipality_code', item->>'codice_comune'), ''),
      nullif(coalesce(item->>'zone_code', item->>'zona'), ''),
      nullif(coalesce(item->>'zone_name', item->>'nome_zona'), ''),
      nullif(coalesce(item->>'min_value', item->>'valore_minimo'), '')::numeric,
      nullif(coalesce(item->>'max_value', item->>'valore_massimo'), '')::numeric,
      nullif(coalesce(item->>'typology', item->>'tipologia'), ''),
      coalesce(nullif(item->>'currency', ''), 'EUR/mq'),
      geom_value,
      item
    )
    on conflict (
      (coalesce(year, 0)),
      (coalesce(semester, 0)),
      (lower(municipality_name)),
      (coalesce(zone_code, '')),
      (coalesce(typology, ''))
    )
    do update set
      source = excluded.source,
      municipality_code = excluded.municipality_code,
      zone_name = excluded.zone_name,
      min_value = excluded.min_value,
      max_value = excluded.max_value,
      currency = excluded.currency,
      geom = coalesce(excluded.geom, public.omi_zones.geom),
      raw_payload = excluded.raw_payload,
      updated_at = now();

    affected := affected + 1;
  end loop;
  return affected;
end;
$$;
