-- Conteggi per provincia
select
  lc.sigla_provincia,
  count(*) as civici_dbgt
from public.address_points ap
left join public.dbgt_limiti_comunali lc
  on lc.codice_comune = ('03' || ap.codice_comune)
where ap.source = 'dbgt_lombardia'
group by lc.sigla_provincia
order by lc.sigla_provincia;

-- Conteggi per comune
select
  codice_comune,
  comune,
  count(*) as civici_dbgt
from public.address_points
where source = 'dbgt_lombardia'
group by codice_comune, comune
order by civici_dbgt desc;

-- Confronto DBGT vs OSM
select
  comune,
  count(*) filter (where source = 'dbgt_lombardia') as dbgt,
  count(*) filter (where source = 'osm') as osm
from public.address_points
where source in ('dbgt_lombardia', 'osm')
group by comune
order by dbgt desc nulls last, osm desc nulls last;

-- Civici staging senza geometria accesso
select count(*) as civici_senza_geometria
from public.dbgt_accesso_numero_civico rel
left join public.dbgt_accesso_esterno a on a.source_id = rel.accesso_id
where a.geom is null;

-- Civici staging senza toponimo
select count(*) as civici_senza_toponimo
from public.dbgt_numero_civico nc
left join public.dbgt_toponimo_stradale ts on ts.source_id = nc.toponimo_id
left join public.dbgt_toponimo_nome tn on tn.source_id = ts.source_id
where tn.nome is null;

-- Duplicati OSM marcati come coperti da DBGT
select comune, count(*) as osm_deduplicati
from public.address_points
where source = 'osm'
  and raw_tags->>'deduped_by' = 'dbgt_lombardia'
group by comune
order by osm_deduplicati desc;
