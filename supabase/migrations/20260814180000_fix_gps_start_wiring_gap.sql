begin;

-- FIX AUDIT-DRIVER-GPS-START-403: due bug di wiring pre-esistenti (non nel
-- motore GPS, non in admin_*_confirm_owner_check appena corretta) che
-- rendevano public.gps_start_session sempre 403 (ASSEGNAZIONE_NON_AUTORIZZATA
-- o ZONA_NON_AUTORIZZATA) per QUALSIASI campagna reale creata dal flusso
-- Admin standard, non solo per i dati di test di questo audit.
--
-- BUG 1: public.gps_assignment_is_valid (motore GPS, NON modificata qui)
-- richiede c.status = 'in_progress'. Nessun punto del codice reale (Admin
-- frontend, Edge Function, o le RPC admin_* di assegnazione) transiziona mai
-- una campagna a 'in_progress' — l'unico punto che lo fa e' una select
-- manuale in un form Admin (NewCampaign.jsx), mai automatico. Risultato:
-- gps_start_session falliva sempre al primo controllo, per ogni campagna,
-- indipendentemente da gruppo/zone. Fix: admin_create_operator_assignment
-- (gia' esistente, stessa migration family ADMIN-DRIVER-LINK-2) promuove la
-- campagna da 'approved'/'pending_review' a 'in_progress' quando viene creata
-- la prima assegnazione operativa reale — esattamente il momento in cui,
-- concettualmente, il lavoro passa da "preventivo confermato" a "in corso".
-- Non tocca stati terminali/gestiti manualmente (completed/cancelled/problem/
-- draft).
--
-- BUG 2: gps_start_session e gps_get_operator_campaign (motore GPS, NON
-- modificate qui) autorizzano l'accesso a una zona solo se
-- campaign_zones.group_id = operator_assignments.group_id. Ma
-- admin_set_assignment_zones (gia' esistente, stessa migration family) scrive
-- solo in operator_assignment_zones (tabella ponte): non ha MAI aggiornato
-- campaign_zones.group_id. Per ogni zona creata dal flusso Admin standard,
-- campaign_zones.group_id restava NULL per sempre, quindi la verifica di
-- ownership della zona nel motore GPS non poteva mai avere successo. Fix:
-- admin_set_assignment_zones stampa campaign_zones.group_id = il group_id
-- reale dell'assegnazione per ogni zona referenziata da zone_id (le zone a
-- testo libero senza zone_id, gia' fuori dal modello GPS strutturato, restano
-- invariate).

create or replace function public.admin_create_operator_assignment(
  p_campaign_id  uuid,
  p_operator_id  uuid,
  p_group_id     uuid    default null,
  p_zone_id      uuid    default null,
  p_starts_at    timestamptz default null,
  p_ends_at      timestamptz default null,
  p_metadata     jsonb   default '{}'::jsonb,
  p_notes        text    default null
) returns public.operator_assignments
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_admin_id  uuid;
  v_result    public.operator_assignments;
  v_meta      jsonb;
  v_overlap   boolean;
  v_group_id  uuid;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;

  if p_campaign_id is null then
    raise exception 'campaign_id obbligatorio.' using errcode = '22023';
  end if;
  if p_operator_id is null then
    raise exception 'operator_id obbligatorio.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campaigns where id = p_campaign_id) then
    raise exception 'Campagna non trovata (id: %).', p_campaign_id
      using errcode = '02000';
  end if;

  if p_ends_at is not null and p_starts_at is not null
     and p_ends_at <= p_starts_at then
    raise exception 'ends_at deve essere strettamente successivo a starts_at.'
      using errcode = '22023';
  end if;

  if p_group_id is not null then
    if not exists (
      select 1 from public.operational_groups
      where id = p_group_id and campaign_id = p_campaign_id
    ) then
      raise exception 'Gruppo operativo non trovato per questa campagna (id: %).', p_group_id
        using errcode = '02000';
    end if;
    v_group_id := p_group_id;
  else
    select id into v_group_id
    from public.operational_groups
    where campaign_id = p_campaign_id
    order by created_at asc nulls last
    limit 1;

    if v_group_id is null then
      insert into public.operational_groups (id, campaign_id, name)
      values (gen_random_uuid(), p_campaign_id, 'Generale')
      returning id into v_group_id;
    end if;
  end if;

  if not exists (
    select 1 from public.operator_profiles
    where user_id = p_operator_id
      and active = true
      and disabled_at is null
  ) then
    raise exception 'Operatore non trovato, non attivo o disabilitato (id: %).',
      p_operator_id using errcode = '22023';
  end if;

  select exists (
    select 1 from public.operator_assignments a
    where a.operator_id = p_operator_id
      and a.campaign_id = p_campaign_id
      and a.status = 'active'
      and (a.ends_at is null or a.ends_at > coalesce(p_starts_at, now()))
      and (p_ends_at is null or a.starts_at < p_ends_at)
  ) into v_overlap;

  if v_overlap then
    raise exception 'Esiste già un''assegnazione attiva sovrapposta per questo operatore su questa campagna.'
      using errcode = '23505';
  end if;

  v_admin_id := auth.uid();

  v_meta := coalesce(p_metadata, '{}'::jsonb);
  if p_notes is not null then
    v_meta := v_meta || jsonb_build_object('notes', p_notes);
  end if;
  v_meta := v_meta || jsonb_build_object(
    '_created_by_admin', v_admin_id,
    '_created_at_iso',   now()::text
  );

  insert into public.operator_assignments (
    campaign_id, operator_id, group_id, zone_id,
    status, starts_at, ends_at,
    created_by, metadata, created_at, updated_at
  ) values (
    p_campaign_id, p_operator_id, v_group_id, p_zone_id,
    'active', p_starts_at, p_ends_at,
    v_admin_id, v_meta, now(), now()
  )
  returning * into v_result;

  -- Promozione dello stato campagna: dal preventivo confermato/pagato
  -- all'operativita' reale, solo alla prima assegnazione. Non tocca stati
  -- terminali o gestiti manualmente altrove.
  update public.campaigns
  set status = 'in_progress', updated_at = now()
  where id = p_campaign_id
    and status in ('approved', 'pending_review');

  begin
    insert into public.audit_log (
      actor_id, action, resource_type, resource_id,
      success, metadata
    ) values (
      v_admin_id,
      'admin_create_operator_assignment',
      'operator_assignments',
      v_result.id::text,
      true,
      jsonb_build_object(
        'campaign_id',  p_campaign_id,
        'operator_id',  p_operator_id,
        'group_id',     p_group_id,
        'zone_id',      p_zone_id,
        'starts_at',    p_starts_at,
        'ends_at',      p_ends_at
      )
    );
  exception when others then
    raise notice 'audit_log insert skipped: %', sqlerrm;
  end;

  return v_result;
end;
$$;

revoke all on function public.admin_create_operator_assignment(uuid, uuid, uuid, uuid, timestamptz, timestamptz, jsonb, text) from public;
grant execute on function public.admin_create_operator_assignment(uuid, uuid, uuid, uuid, timestamptz, timestamptz, jsonb, text) to authenticated, service_role;

create or replace function public.admin_set_assignment_zones(p_assignment_id uuid, p_zones jsonb)
  returns setof public.operator_assignment_zones
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_elem      jsonb;
  v_row       public.operator_assignment_zones;
  v_name      text;
  v_qty       integer;
  v_zone_id   uuid;
  v_group_id  uuid;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;
  if p_assignment_id is null then
    raise exception 'assignment_id obbligatorio.' using errcode = '22023';
  end if;
  if p_zones is null or jsonb_typeof(p_zones) <> 'array' then
    raise exception 'p_zones deve essere un array JSON.' using errcode = '22023';
  end if;

  select group_id into v_group_id
  from public.operator_assignments where id = p_assignment_id;

  if v_group_id is null then
    raise exception 'Assegnazione non trovata (id: %).', p_assignment_id
      using errcode = '02000';
  end if;

  delete from public.operator_assignment_zones
  where assignment_id = p_assignment_id;

  for v_elem in select * from jsonb_array_elements(p_zones)
  loop
    v_name := trim(v_elem->>'municipality_name');
    if v_name is null or char_length(v_name) = 0 then
      raise exception 'Ogni zona deve avere municipality_name non vuoto.'
        using errcode = '22023';
    end if;

    if v_elem ? 'quantity' and v_elem->>'quantity' is not null then
      v_qty := (v_elem->>'quantity')::integer;
      if v_qty < 0 then
        raise exception 'quantity non può essere negativa (zona: %).',
          v_name using errcode = '22023';
      end if;
    else
      v_qty := null;
    end if;

    v_zone_id := nullif(v_elem->>'zone_id', '')::uuid;

    insert into public.operator_assignment_zones (
      assignment_id, zone_id, municipality_name, municipality_code, quantity
    ) values (
      p_assignment_id,
      v_zone_id,
      v_name,
      v_elem->>'municipality_code',
      v_qty
    )
    returning * into v_row;

    -- Ponte mancante: il motore GPS (gps_start_session/gps_get_operator_campaign)
    -- autorizza le zone via campaign_zones.group_id = operator_assignments.group_id,
    -- ma questa RPC non lo scriveva mai. Solo per zone reali (zone_id non
    -- null, gia' collegate a public.campaign_zones); zone a testo libero
    -- senza zone_id restano fuori dal modello GPS strutturato, invariate.
    if v_zone_id is not null then
      update public.campaign_zones
      set group_id = v_group_id, updated_at = now()
      where id = v_zone_id;
    end if;

    return next v_row;
  end loop;

  return;
end;
$$;

revoke all on function public.admin_set_assignment_zones(uuid, jsonb) from public;
grant execute on function public.admin_set_assignment_zones(uuid, jsonb) to authenticated, service_role;

commit;
