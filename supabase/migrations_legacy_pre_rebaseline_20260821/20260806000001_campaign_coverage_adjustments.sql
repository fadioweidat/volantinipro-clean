begin;

-- GPS-MANUAL-COVERAGE-1 — Admin manual coverage corrections.
--
-- Model: real GPS track + admin manual corrections + inaccessible zones =
-- final operational coverage. The original GPS track (gps_tracking_points,
-- delivery_sessions, delivery_session_coverage) is never written to by this
-- migration — corrections live in a separate table and are purely additive.
--
-- Follows the exact conventions already established by
-- 202607230001_campaign_zone_progress.sql (RLS + SECURITY DEFINER RPC-only
-- write access, audit history table, gps_is_admin() as the admin gate) so
-- this stays consistent with the rest of the GPS feature set rather than
-- introducing a parallel pattern.

create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists public.campaign_coverage_adjustments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  zone_id uuid references public.campaign_zones(id) on delete cascade,
  adjustment_type text not null,
  geometry public.geometry(Polygon, 4326) not null,
  reason text not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoke_reason text,

  constraint campaign_coverage_adjustments_type_check
    check (adjustment_type in ('manual_covered', 'partially_covered', 'inaccessible')),
  constraint campaign_coverage_adjustments_reason_required
    check (nullif(btrim(reason), '') is not null),
  constraint campaign_coverage_adjustments_geometry_valid
    check (public.ST_IsValid(geometry) and not public.ST_IsEmpty(geometry)),
  constraint campaign_coverage_adjustments_revocation_check
    check (
      (revoked_at is null and revoked_by is null)
      or (revoked_at is not null and revoked_by is not null and nullif(btrim(revoke_reason), '') is not null)
    )
);

-- La zona, se indicata, deve appartenere alla stessa campagna della correzione.
create or replace function public.set_campaign_coverage_adjustment_zone_guard()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_zone_campaign_id uuid;
begin
  if new.zone_id is not null then
    select z.campaign_id into v_zone_campaign_id
    from public.campaign_zones z
    where z.id = new.zone_id;

    if v_zone_campaign_id is null then
      raise exception 'ZONA_NON_TROVATA' using errcode = 'P0002';
    end if;

    if v_zone_campaign_id <> new.campaign_id then
      raise exception 'ZONA_CAMPAGNA_INCOERENTE' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_campaign_coverage_adjustment_zone_guard
  on public.campaign_coverage_adjustments;

create trigger set_campaign_coverage_adjustment_zone_guard
before insert or update of zone_id, campaign_id
on public.campaign_coverage_adjustments
for each row
execute function public.set_campaign_coverage_adjustment_zone_guard();

drop trigger if exists set_campaign_coverage_adjustments_updated_at
  on public.campaign_coverage_adjustments;

create trigger set_campaign_coverage_adjustments_updated_at
before update on public.campaign_coverage_adjustments
for each row
execute function public.set_updated_at();

create index if not exists campaign_coverage_adjustments_campaign_id_idx
  on public.campaign_coverage_adjustments (campaign_id);

create index if not exists campaign_coverage_adjustments_zone_id_idx
  on public.campaign_coverage_adjustments (zone_id);

create index if not exists campaign_coverage_adjustments_geometry_gix
  on public.campaign_coverage_adjustments using gist (geometry);

create index if not exists campaign_coverage_adjustments_active_idx
  on public.campaign_coverage_adjustments (campaign_id)
  where revoked_at is null;

-- Audit log append-only, stesso schema logico di campaign_zone_progress_history:
-- una riga per ogni creazione/modifica/revoca, mai aggiornata o cancellata.
create table if not exists public.campaign_coverage_adjustments_log (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid references public.campaign_coverage_adjustments(id) on delete set null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  zone_id uuid,
  event_type text not null,
  adjustment_type text not null,
  reason text not null,
  notes text,
  geometry_geojson jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint campaign_coverage_adjustments_log_event_type_check
    check (event_type in ('created', 'updated', 'revoked')),
  constraint campaign_coverage_adjustments_log_reason_required
    check (nullif(btrim(reason), '') is not null)
);

create index if not exists campaign_coverage_adjustments_log_campaign_idx
  on public.campaign_coverage_adjustments_log (campaign_id, created_at desc);

create index if not exists campaign_coverage_adjustments_log_adjustment_idx
  on public.campaign_coverage_adjustments_log (adjustment_id, created_at desc);

alter table public.campaign_coverage_adjustments enable row level security;
alter table public.campaign_coverage_adjustments force row level security;

alter table public.campaign_coverage_adjustments_log enable row level security;
alter table public.campaign_coverage_adjustments_log force row level security;

-- Nessuna scrittura diretta da client: solo le RPC SECURITY DEFINER sotto
-- possono inserire/aggiornare, dopo aver verificato gps_is_admin() con
-- auth.uid() lato server — mai un ruolo passato dal frontend.
revoke all on table public.campaign_coverage_adjustments from anon;
revoke all on table public.campaign_coverage_adjustments from authenticated;
revoke all on table public.campaign_coverage_adjustments_log from anon;
revoke all on table public.campaign_coverage_adjustments_log from authenticated;

grant select on table public.campaign_coverage_adjustments to authenticated;
grant select on table public.campaign_coverage_adjustments_log to authenticated;

drop policy if exists campaign_coverage_adjustments_select_admin
  on public.campaign_coverage_adjustments;
create policy campaign_coverage_adjustments_select_admin
on public.campaign_coverage_adjustments
for select
to authenticated
using (public.gps_is_admin());

drop policy if exists campaign_coverage_adjustments_select_customer
  on public.campaign_coverage_adjustments;
create policy campaign_coverage_adjustments_select_customer
on public.campaign_coverage_adjustments
for select
to authenticated
using (
  revoked_at is null
  and exists (
    select 1 from public.campaigns c
    where c.id = campaign_coverage_adjustments.campaign_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists campaign_coverage_adjustments_select_driver
  on public.campaign_coverage_adjustments;
create policy campaign_coverage_adjustments_select_driver
on public.campaign_coverage_adjustments
for select
to authenticated
using (
  revoked_at is null
  and exists (
    select 1 from public.operator_assignments a
    where a.campaign_id = campaign_coverage_adjustments.campaign_id
      and a.operator_id = auth.uid()
      and a.status = 'active'
      and a.revoked_at is null
  )
);

drop policy if exists campaign_coverage_adjustments_log_select_admin
  on public.campaign_coverage_adjustments_log;
create policy campaign_coverage_adjustments_log_select_admin
on public.campaign_coverage_adjustments_log
for select
to authenticated
using (public.gps_is_admin());

-- ============================================================
-- RPC: creazione correzione manuale (solo Admin).
-- ============================================================
create or replace function public.admin_create_coverage_adjustment(
  p_campaign_id uuid,
  p_zone_id uuid,
  p_adjustment_type text,
  p_geometry_geojson jsonb,
  p_reason text,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.campaign_coverage_adjustments
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_geom public.geometry;
  v_new public.campaign_coverage_adjustments%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;

  if p_adjustment_type not in ('manual_covered', 'partially_covered', 'inaccessible') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDO' using errcode = '22023';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  if p_geometry_geojson is null then
    raise exception 'GEOMETRIA_OBBLIGATORIA' using errcode = '22023';
  end if;

  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'CAMPAGNA_NON_TROVATA' using errcode = 'P0002';
  end if;

  v_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(p_geometry_geojson::text), 4326));

  if v_geom is null or public.ST_IsEmpty(v_geom) or public.GeometryType(v_geom) not in ('POLYGON', 'MULTIPOLYGON') then
    raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
  end if;

  -- Una MultiPolygon valida (es. da un dissolve) viene ridotta al primo
  -- poligono solo se composta da un unico membro; altrimenti va rifiutata,
  -- la colonna e' tipizzata Polygon singolo per riga.
  if public.GeometryType(v_geom) = 'MULTIPOLYGON' then
    if public.ST_NumGeometries(v_geom) <> 1 then
      raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
    end if;
    v_geom := public.ST_GeometryN(v_geom, 1);
  end if;

  insert into public.campaign_coverage_adjustments (
    campaign_id, zone_id, adjustment_type, geometry, reason, notes, metadata, created_by
  ) values (
    p_campaign_id, p_zone_id, p_adjustment_type, v_geom, btrim(p_reason), nullif(btrim(p_notes), ''), coalesce(p_metadata, '{}'::jsonb), v_uid
  )
  returning * into v_new;

  insert into public.campaign_coverage_adjustments_log (
    adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by
  ) values (
    v_new.id, v_new.campaign_id, v_new.zone_id, 'created', v_new.adjustment_type, v_new.reason, v_new.notes,
    public.ST_AsGeoJSON(v_new.geometry)::jsonb, v_uid
  );

  return v_new;
end;
$$;

-- ============================================================
-- RPC: modifica correzione esistente non revocata (solo Admin).
-- ============================================================
create or replace function public.admin_update_coverage_adjustment(
  p_adjustment_id uuid,
  p_adjustment_type text,
  p_geometry_geojson jsonb,
  p_reason text,
  p_notes text default null,
  p_metadata jsonb default null
)
returns public.campaign_coverage_adjustments
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_geom public.geometry;
  v_old public.campaign_coverage_adjustments%rowtype;
  v_new public.campaign_coverage_adjustments%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;

  if p_adjustment_type not in ('manual_covered', 'partially_covered', 'inaccessible') then
    raise exception 'TIPO_CORREZIONE_NON_VALIDO' using errcode = '22023';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select * into v_old
  from public.campaign_coverage_adjustments
  where id = p_adjustment_id
  for update;

  if not found then
    raise exception 'CORREZIONE_NON_TROVATA' using errcode = 'P0002';
  end if;

  if v_old.revoked_at is not null then
    raise exception 'CORREZIONE_GIA_REVOCATA' using errcode = '22023';
  end if;

  if p_geometry_geojson is not null then
    v_geom := public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(p_geometry_geojson::text), 4326));
    if v_geom is null or public.ST_IsEmpty(v_geom) or public.GeometryType(v_geom) not in ('POLYGON', 'MULTIPOLYGON') then
      raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
    end if;
    if public.GeometryType(v_geom) = 'MULTIPOLYGON' then
      if public.ST_NumGeometries(v_geom) <> 1 then
        raise exception 'GEOMETRIA_NON_VALIDA' using errcode = '22023';
      end if;
      v_geom := public.ST_GeometryN(v_geom, 1);
    end if;
  else
    v_geom := v_old.geometry;
  end if;

  update public.campaign_coverage_adjustments
  set adjustment_type = p_adjustment_type,
      geometry = v_geom,
      reason = btrim(p_reason),
      notes = nullif(btrim(p_notes), ''),
      metadata = coalesce(p_metadata, metadata),
      updated_by = v_uid,
      updated_at = now()
  where id = p_adjustment_id
  returning * into v_new;

  insert into public.campaign_coverage_adjustments_log (
    adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by
  ) values (
    v_new.id, v_new.campaign_id, v_new.zone_id, 'updated', v_new.adjustment_type, v_new.reason, v_new.notes,
    public.ST_AsGeoJSON(v_new.geometry)::jsonb, v_uid
  );

  return v_new;
end;
$$;

-- ============================================================
-- RPC: revoca correzione (solo Admin). La riga resta, mai cancellata:
-- diventa storico ("grigio, solo nello storico Admin").
-- ============================================================
create or replace function public.admin_revoke_coverage_adjustment(
  p_adjustment_id uuid,
  p_reason text
)
returns public.campaign_coverage_adjustments
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.campaign_coverage_adjustments%rowtype;
  v_new public.campaign_coverage_adjustments%rowtype;
begin
  if not public.gps_is_admin() then
    raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'MOTIVO_OBBLIGATORIO' using errcode = '22023';
  end if;

  select * into v_old
  from public.campaign_coverage_adjustments
  where id = p_adjustment_id
  for update;

  if not found then
    raise exception 'CORREZIONE_NON_TROVATA' using errcode = 'P0002';
  end if;

  if v_old.revoked_at is not null then
    raise exception 'CORREZIONE_GIA_REVOCATA' using errcode = '22023';
  end if;

  update public.campaign_coverage_adjustments
  set revoked_at = now(),
      revoked_by = v_uid,
      revoke_reason = btrim(p_reason),
      updated_by = v_uid,
      updated_at = now()
  where id = p_adjustment_id
  returning * into v_new;

  insert into public.campaign_coverage_adjustments_log (
    adjustment_id, campaign_id, zone_id, event_type, adjustment_type, reason, notes, geometry_geojson, changed_by
  ) values (
    v_new.id, v_new.campaign_id, v_new.zone_id, 'revoked', v_new.adjustment_type, btrim(p_reason), v_new.notes,
    public.ST_AsGeoJSON(v_new.geometry)::jsonb, v_uid
  );

  return v_new;
end;
$$;

-- ============================================================
-- RPC: lettura correzioni per una campagna, filtrata per ruolo.
-- Cliente/Driver: solo correzioni attive (non revocate), senza note interne
-- ne' identita' Admin. Admin: tutto, incluse quelle revocate (storico).
-- ============================================================
create or replace function public.get_campaign_coverage_adjustments(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_is_driver boolean := false;
  v_result jsonb;
begin
  if v_uid is null and not v_is_admin then
    raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and c.user_id = v_uid
  ) into v_is_owner;

  if not v_is_admin and not v_is_owner then
    select exists (
      select 1 from public.operator_assignments a
      where a.campaign_id = p_campaign_id
        and a.operator_id = v_uid
        and a.status = 'active'
        and a.revoked_at is null
    ) into v_is_driver;
  end if;

  if not v_is_admin and not v_is_owner and not v_is_driver then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    case
      when v_is_admin then
        jsonb_build_object(
          'id', a.id,
          'campaign_id', a.campaign_id,
          'zone_id', a.zone_id,
          'adjustment_type', a.adjustment_type,
          'geometry', public.ST_AsGeoJSON(a.geometry)::jsonb,
          'reason', a.reason,
          'notes', a.notes,
          'metadata', a.metadata,
          'created_by', a.created_by,
          'created_at', a.created_at,
          'updated_at', a.updated_at,
          'updated_by', a.updated_by,
          'revoked_at', a.revoked_at,
          'revoked_by', a.revoked_by,
          'revoke_reason', a.revoke_reason
        )
      else
        jsonb_build_object(
          'id', a.id,
          'campaign_id', a.campaign_id,
          'zone_id', a.zone_id,
          'adjustment_type', a.adjustment_type,
          'geometry', public.ST_AsGeoJSON(a.geometry)::jsonb,
          'updated_at', a.updated_at
        )
    end
    order by a.created_at
  ), '[]'::jsonb)
  into v_result
  from public.campaign_coverage_adjustments a
  where a.campaign_id = p_campaign_id
    and (v_is_admin or a.revoked_at is null);

  return v_result;
end;
$$;

-- ============================================================
-- RPC: copertura operativa finale, separata per fonte.
--
-- gps_coverage_pct            = area coperta dalla traccia GPS reale / area totale zone
-- manual_coverage_pct         = area coperta dalle correzioni Admin attive
--                                (manual_covered/partially_covered), al netto
--                                di quanto gia' coperto dal GPS (no doppio conteggio)
-- inaccessible_area_pct       = area segnata "inaccessible" / area totale zone
-- final_operational_coverage_pct
--                              = (area GPS unione area manuale) / (area totale - area inaccessibile)
--
-- Le geometrie sovrapposte (piu' poligoni Admin, GPS+manuale) vengono unite
-- con ST_Union prima di calcolare qualunque area, cosi' l'overlap non viene
-- mai contato due volte.
-- ============================================================
create or replace function public.calculate_campaign_final_coverage(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.gps_is_admin();
  v_is_owner boolean := false;
  v_total_geom public.geometry;
  v_gps_geom public.geometry;
  v_manual_geom public.geometry;
  v_inaccessible_geom public.geometry;
  v_manual_incremental_geom public.geometry;
  v_effective_covered_geom public.geometry;
  v_total_area numeric := 0;
  v_gps_area numeric := 0;
  v_manual_area numeric := 0;
  v_inaccessible_area numeric := 0;
  v_effective_area numeric := 0;
  v_effective_total_area numeric := 0;
begin
  if v_uid is null and not v_is_admin then
    raise exception 'UTENTE_NON_AUTENTICATO' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and c.user_id = v_uid
  ) into v_is_owner;

  if not v_is_admin and not v_is_owner then
    raise exception 'CAMPAGNA_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  -- Territorio totale reale della campagna: unione delle geometrie di tutte
  -- le zone (poligono disegnato, o buffer del centro/raggio come fallback,
  -- stessa logica di gps_calculate_zone_coverage).
  select public.ST_UnaryUnion(public.ST_Collect(geom))
  into v_total_geom
  from (
    select
      case
        when z.polygon_geojson is not null then
          public.ST_MakeValid(public.ST_SetSRID(public.ST_GeomFromGeoJSON(z.polygon_geojson::text), 4326))
        when z.center_lat is not null and z.center_lng is not null and z.radius_m is not null then
          public.ST_MakeValid(public.ST_Buffer(public.ST_SetSRID(public.ST_MakePoint(z.center_lng, z.center_lat), 4326)::public.geography, z.radius_m)::public.geometry)
        else null
      end as geom
    from public.campaign_zones z
    where z.campaign_id = p_campaign_id
  ) zones
  where geom is not null;

  if v_total_geom is null then
    return pg_catalog.jsonb_build_object(
      'campaign_id', p_campaign_id,
      'calculation_status', 'zone_geometry_missing',
      'gps_coverage_pct', null,
      'manual_coverage_pct', null,
      'inaccessible_area_pct', null,
      'final_operational_coverage_pct', null
    );
  end if;

  v_total_area := public.ST_Area(v_total_geom::public.geography);

  -- Traccia GPS reale: buffer (30m) di tutte le tracce valide di tutte le
  -- sessioni della campagna, unite, intersecate col territorio totale.
  -- Sola lettura di gps_tracking_points: nessuna scrittura, nessun punto
  -- modificato o cancellato da questa funzione.
  select public.ST_Intersection(
    public.ST_UnaryUnion(public.ST_Buffer(public.ST_MakeLine(geom order by recorded_at)::public.geography, 30)::public.geometry),
    v_total_geom
  )
  into v_gps_geom
  from public.gps_tracking_points
  where session_id in (
    select id from public.delivery_sessions where campaign_id = p_campaign_id
  )
  and lat != 0 and lng != 0
  and (accuracy is null or accuracy <= 65)
  having count(*) >= 2;

  if v_gps_geom is not null and not public.ST_IsEmpty(v_gps_geom) then
    v_gps_area := public.ST_Area(v_gps_geom::public.geography);
  else
    v_gps_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    v_gps_area := 0;
  end if;

  -- Correzioni manuali Admin attive (non revocate): unite fra loro, poi
  -- intersecate col territorio, poi la parte gia' coperta dal GPS viene
  -- sottratta per evitare il doppio conteggio.
  select public.ST_UnaryUnion(public.ST_Collect(geometry))
  into v_manual_geom
  from public.campaign_coverage_adjustments
  where campaign_id = p_campaign_id
    and revoked_at is null
    and adjustment_type in ('manual_covered', 'partially_covered');

  if v_manual_geom is not null and not public.ST_IsEmpty(v_manual_geom) then
    v_manual_geom := public.ST_Intersection(public.ST_MakeValid(v_manual_geom), v_total_geom);
    v_manual_incremental_geom := public.ST_Difference(v_manual_geom, v_gps_geom);
    v_manual_area := public.ST_Area(v_manual_incremental_geom::public.geography);
  else
    v_manual_geom := public.ST_GeomFromText('POLYGON EMPTY', 4326);
    v_manual_incremental_geom := v_manual_geom;
    v_manual_area := 0;
  end if;

  -- Aree non accessibili: unite fra loro, intersecate col territorio.
  -- Distinte dalla copertura: riducono il denominatore, non contano ne'
  -- a favore ne' contro la percentuale coperta.
  select public.ST_UnaryUnion(public.ST_Collect(geometry))
  into v_inaccessible_geom
  from public.campaign_coverage_adjustments
  where campaign_id = p_campaign_id
    and revoked_at is null
    and adjustment_type = 'inaccessible';

  if v_inaccessible_geom is not null and not public.ST_IsEmpty(v_inaccessible_geom) then
    v_inaccessible_geom := public.ST_Intersection(public.ST_MakeValid(v_inaccessible_geom), v_total_geom);
    v_inaccessible_area := public.ST_Area(v_inaccessible_geom::public.geography);
  else
    v_inaccessible_area := 0;
  end if;

  -- Copertura effettiva = GPS unione (manuale al netto del GPS).
  v_effective_covered_geom := public.ST_UnaryUnion(public.ST_Collect(array[v_gps_geom, v_manual_incremental_geom]));
  if v_effective_covered_geom is not null and not public.ST_IsEmpty(v_effective_covered_geom) then
    v_effective_area := public.ST_Area(v_effective_covered_geom::public.geography);
  else
    v_effective_area := 0;
  end if;

  v_effective_total_area := greatest(v_total_area - v_inaccessible_area, 0);

  return pg_catalog.jsonb_build_object(
    'campaign_id', p_campaign_id,
    'calculation_status', 'ready',
    'total_area_m2', pg_catalog.round(v_total_area, 2),
    'gps_area_m2', pg_catalog.round(v_gps_area, 2),
    'manual_area_m2', pg_catalog.round(v_manual_area, 2),
    'inaccessible_area_m2', pg_catalog.round(v_inaccessible_area, 2),
    'gps_coverage_pct',
      case when v_total_area > 0 then least(greatest(round((v_gps_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'manual_coverage_pct',
      case when v_total_area > 0 then least(greatest(round((v_manual_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'inaccessible_area_pct',
      case when v_total_area > 0 then least(greatest(round((v_inaccessible_area / v_total_area) * 100, 2), 0), 100) else 0 end,
    'final_operational_coverage_pct',
      case when v_effective_total_area > 0 then least(greatest(round((v_effective_area / v_effective_total_area) * 100, 2), 0), 100) else 0 end,
    -- Geometrie in GeoJSON solo per il rendering della mappa (blu traccia reale
    -- gia' disponibile lato client dai punti GPS; qui solo l'area GPS coperta
    -- come poligono, per il livello "verde trasparente" richiesto in UI).
    'gps_coverage_geometry', case when v_gps_area > 0 then public.ST_AsGeoJSON(v_gps_geom)::jsonb else null end,
    'total_territory_geometry', public.ST_AsGeoJSON(v_total_geom)::jsonb
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'campaign_id', p_campaign_id,
    'calculation_status', 'calculation_failed',
    'reason_not_calculable', SQLERRM
  );
end;
$$;

revoke all on function public.admin_create_coverage_adjustment(uuid, uuid, text, jsonb, text, text, jsonb) from public;
revoke all on function public.admin_update_coverage_adjustment(uuid, text, jsonb, text, text, jsonb) from public;
revoke all on function public.admin_revoke_coverage_adjustment(uuid, text) from public;
revoke all on function public.get_campaign_coverage_adjustments(uuid) from public;
revoke all on function public.calculate_campaign_final_coverage(uuid) from public;

revoke all on function public.admin_create_coverage_adjustment(uuid, uuid, text, jsonb, text, text, jsonb) from anon;
revoke all on function public.admin_update_coverage_adjustment(uuid, text, jsonb, text, text, jsonb) from anon;
revoke all on function public.admin_revoke_coverage_adjustment(uuid, text) from anon;
revoke all on function public.get_campaign_coverage_adjustments(uuid) from anon;
revoke all on function public.calculate_campaign_final_coverage(uuid) from anon;

grant execute on function public.admin_create_coverage_adjustment(uuid, uuid, text, jsonb, text, text, jsonb) to authenticated, service_role;
grant execute on function public.admin_update_coverage_adjustment(uuid, text, jsonb, text, text, jsonb) to authenticated, service_role;
grant execute on function public.admin_revoke_coverage_adjustment(uuid, text) to authenticated, service_role;
grant execute on function public.get_campaign_coverage_adjustments(uuid) to authenticated, service_role;
grant execute on function public.calculate_campaign_final_coverage(uuid) to authenticated, service_role;

commit;
