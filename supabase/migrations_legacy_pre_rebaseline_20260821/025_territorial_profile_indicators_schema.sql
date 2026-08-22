-- PROPOSTA DI SCHEMA — NON ESEGUITA, NON collegata a nessun import.
-- Richiesta: sostituire in Step2 i valori hardcoded di "Composizione nuclei"
-- (31/28/41 fissi) e "Destinazione area" (76/24/45 in base al solo tipo di
-- servizio) con dati reali per comune. Questa tabella è il contenitore
-- proposto; NON viene popolata da questo file — l'import (fonte ISTAT per
-- la composizione nuclei, DUSAF Lombardia per la destinazione d'uso) resta
-- sospeso finché non saranno disponibili i file reali (CSV ISTAT, shapefile
-- DUSAF, shapefile confini comunali) — vedi supabase/TERRITORIAL_PROFILE_IMPORT_PLAN.md.
--
-- Categorie nuclei familiari: 5 bucket MUTUAMENTE ESCLUSIVI (confermato),
-- la somma deve arrivare a ~100%: Single, Coppie senza figli, Famiglie con
-- figli, Monoparentali, Altro (residuo per nuclei/famiglie non altrimenti
-- classificabili, es. famiglie con 2+ nuclei — garantisce che la somma
-- arrivi a 100% senza forzare ogni caso reale in una delle prime 4).
--
-- Destinazione d'uso suolo — CONFERMATO sul file DUSAF7 reale (ispezionato
-- byte per byte, non da documentazione): la legenda NON distingue
-- commerciale da industriale. Codice COD_TOT=12111 = "Insediamenti
-- industriali, artigianali, commerciali", un'unica classe. Rimosse quindi
-- le colonne commercial_area_pct/industrial_area_pct separate (mai
-- popolabili con questa fonte): resta solo commercial_industrial_area_pct
-- (etichetta UI "Commerciale / produttivo").
--
-- 4 categorie DUSAF finali confermate (Residenziale, Commerciale/
-- produttivo, Verde/agricolo, Altro/infrastrutture/acqua) — le percentuali
-- si calcolano sul 100% dell'area comunale intersecata: acqua,
-- infrastrutture, ferrovie, strade, cave, cantieri e aree non
-- classificabili NON vengono escluse dal denominatore, confluiscono nel
-- quarto bucket other_infrastructure_water_area_pct. Vedi
-- TERRITORIAL_PROFILE_IMPORT_PLAN.md sezione 4 per il mapping esatto dei
-- codici COD_TOT verso ciascun bucket.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE
-- POLICY, DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT. Nessun dato inserito.

create table if not exists public.territorial_profile_indicators (
  id uuid primary key default gen_random_uuid(),
  geography_type text not null,
  geography_ref text not null,
  municipality_code text,
  municipality_name text,
  reference_year integer not null,

  -- Fonte dichiarata per riga: distingue quali colonne sono realmente
  -- popolate da quale dataset (una riga può avere dati ISTAT ma non DUSAF,
  -- o viceversa, in fasi di import successive).
  source text not null,

  -- Composizione nuclei familiari (fonte: ISTAT Censimento Permanente).
  -- 5 categorie mutuamente esclusive: la somma deve arrivare a ~100%.
  avg_household_size numeric,
  single_households_pct numeric,
  couples_no_children_pct numeric,
  families_with_children_pct numeric,
  single_parent_households_pct numeric,
  other_households_pct numeric,

  -- Destinazione d'uso del suolo (fonte: DUSAF Regione Lombardia).
  -- 4 categorie, percentuali calcolate sul 100% dell'area comunale
  -- intersecata (nessuna esclusione dal denominatore).
  residential_area_pct numeric,
  commercial_industrial_area_pct numeric,
  mixed_green_area_pct numeric,
  other_infrastructure_water_area_pct numeric,

  -- Payload grezzo della riga sorgente, per audit/debug e per non perdere
  -- campi non ancora mappati in colonne dedicate.
  raw_payload jsonb,

  imported_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists territorial_profile_indicators_unique_geo_year_source
  on public.territorial_profile_indicators (geography_type, geography_ref, reference_year, source);

alter table public.territorial_profile_indicators drop constraint if exists territorial_profile_indicators_pct_range_check;
alter table public.territorial_profile_indicators add constraint territorial_profile_indicators_pct_range_check check (
  (single_households_pct is null or (single_households_pct >= 0 and single_households_pct <= 100)) and
  (couples_no_children_pct is null or (couples_no_children_pct >= 0 and couples_no_children_pct <= 100)) and
  (families_with_children_pct is null or (families_with_children_pct >= 0 and families_with_children_pct <= 100)) and
  (single_parent_households_pct is null or (single_parent_households_pct >= 0 and single_parent_households_pct <= 100)) and
  (other_households_pct is null or (other_households_pct >= 0 and other_households_pct <= 100)) and
  (residential_area_pct is null or (residential_area_pct >= 0 and residential_area_pct <= 100)) and
  (commercial_industrial_area_pct is null or (commercial_industrial_area_pct >= 0 and commercial_industrial_area_pct <= 100)) and
  (mixed_green_area_pct is null or (mixed_green_area_pct >= 0 and mixed_green_area_pct <= 100)) and
  (other_infrastructure_water_area_pct is null or (other_infrastructure_water_area_pct >= 0 and other_infrastructure_water_area_pct <= 100))
);

alter table public.territorial_profile_indicators enable row level security;

-- Lettura pubblica in sola select (stesso pattern di demographic_indicators,
-- che oggi risponde ad anon in lettura per alimentare Step2 lato client).
drop policy if exists territorial_profile_indicators_select_anon on public.territorial_profile_indicators;
create policy territorial_profile_indicators_select_anon
  on public.territorial_profile_indicators for select
  to anon, authenticated
  using (true);

-- Scrittura riservata: solo import da service_role (mai da frontend/anon).
drop policy if exists territorial_profile_indicators_admin_write on public.territorial_profile_indicators;
create policy territorial_profile_indicators_admin_write
  on public.territorial_profile_indicators for all
  to authenticated
  using (public.jwt_is_admin())
  with check (public.jwt_is_admin());

-- Verifica finale (solo lettura, nessun dato inserito):
select to_regclass('public.territorial_profile_indicators') as territorial_profile_indicators_creata;
