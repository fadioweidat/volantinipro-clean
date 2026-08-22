-- Allinea public.territorial_profile_indicators (già eseguita in una
-- versione precedente di questo schema, tabella attualmente vuota) ai 4
-- bucket DUSAF finali confermati in FASE 4:
--   residential_area_pct
--   commercial_industrial_area_pct
--   green_agricultural_area_pct   (rinominata da mixed_green_area_pct)
--   other_infrastructure_water_area_pct  (nuova, quinto bucket confermato)
--
-- Rimuove commercial_area_pct/industrial_area_pct: confermato sul file
-- DUSAF7.dbf reale che la legenda non li distingue mai (COD_TOT=12111 è
-- un'unica classe) — colonne mai state popolate, tabella vuota, nessuna
-- perdita di dati reali.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, DROP COLUMN IF EXISTS,
-- DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT. Nessun dato inserito.

alter table public.territorial_profile_indicators
  add column if not exists green_agricultural_area_pct numeric,
  add column if not exists other_infrastructure_water_area_pct numeric;

-- Migra eventuali valori già presenti in mixed_green_area_pct (se la
-- colonna esiste da una versione precedente) prima di rimuoverla — la
-- tabella risulta vuota alla stesura di questo file, quindi è un UPDATE
-- su 0 righe, non un'operazione a rischio.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'territorial_profile_indicators'
      and column_name = 'mixed_green_area_pct'
  ) then
    update public.territorial_profile_indicators
      set green_agricultural_area_pct = mixed_green_area_pct
      where green_agricultural_area_pct is null and mixed_green_area_pct is not null;
  end if;
end $$;

alter table public.territorial_profile_indicators drop column if exists mixed_green_area_pct;
alter table public.territorial_profile_indicators drop column if exists commercial_area_pct;
alter table public.territorial_profile_indicators drop column if exists industrial_area_pct;

alter table public.territorial_profile_indicators drop constraint if exists territorial_profile_indicators_pct_range_check;
alter table public.territorial_profile_indicators add constraint territorial_profile_indicators_pct_range_check check (
  (single_households_pct is null or (single_households_pct >= 0 and single_households_pct <= 100)) and
  (couples_no_children_pct is null or (couples_no_children_pct >= 0 and couples_no_children_pct <= 100)) and
  (families_with_children_pct is null or (families_with_children_pct >= 0 and families_with_children_pct <= 100)) and
  (single_parent_households_pct is null or (single_parent_households_pct >= 0 and single_parent_households_pct <= 100)) and
  (other_households_pct is null or (other_households_pct >= 0 and other_households_pct <= 100)) and
  (residential_area_pct is null or (residential_area_pct >= 0 and residential_area_pct <= 100)) and
  (commercial_industrial_area_pct is null or (commercial_industrial_area_pct >= 0 and commercial_industrial_area_pct <= 100)) and
  (green_agricultural_area_pct is null or (green_agricultural_area_pct >= 0 and green_agricultural_area_pct <= 100)) and
  (other_infrastructure_water_area_pct is null or (other_infrastructure_water_area_pct >= 0 and other_infrastructure_water_area_pct <= 100))
);

-- Verifica finale (solo lettura):
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'territorial_profile_indicators'
order by ordinal_position;
