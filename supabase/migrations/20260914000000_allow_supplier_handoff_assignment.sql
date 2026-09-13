-- ============================================================================
-- MIGRATION: Allow Supplier-Only Handoff in operator_assignments
-- Version: 20260914000000
-- ============================================================================

BEGIN;

-- 1. Relax check constraint: allow assignment when operator_id is null IF supplier handoff metadata is present
ALTER TABLE public.operator_assignments
  DROP CONSTRAINT IF EXISTS operator_assignments_identity_present_chk;

ALTER TABLE public.operator_assignments
  ADD CONSTRAINT operator_assignments_identity_present_chk
  CHECK (
    -- Direct operator assignment
    operator_id IS NOT NULL
    OR
    -- Anonymous group link device participant
    (group_access_link_id IS NOT NULL AND device_installation_id IS NOT NULL)
    OR
    -- Supplier handoff (registered or manual)
    (
      metadata->>'supplier_mode' IN ('manual', 'registered')
      OR metadata ? 'manual_supplier'
      OR metadata->>'supplier_id' IS NOT NULL
    )
  )
  NOT VALID;

-- 2. Update admin_create_operator_assignment RPC: allow p_operator_id = NULL for supplier handoff
CREATE OR REPLACE FUNCTION public.admin_create_operator_assignment(
  p_campaign_id uuid,
  p_operator_id uuid DEFAULT NULL::uuid,
  p_group_id uuid DEFAULT NULL::uuid,
  p_zone_id uuid DEFAULT NULL::uuid,
  p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL::text
) RETURNS public.operator_assignments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_admin_id  uuid;
  v_result    public.operator_assignments;
  v_meta      jsonb;
  v_group_id  uuid;
  v_is_supplier boolean;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;

  if p_campaign_id is null then
    raise exception 'campaign_id obbligatorio.' using errcode = '22023';
  end if;

  v_is_supplier := (
    (p_metadata->>'supplier_mode' in ('manual', 'registered')) or
    (p_metadata ? 'manual_supplier') or
    (p_metadata->>'supplier_id' is not null)
  );

  -- Se NON è un affidamento a fornitore, l'operatore è obbligatorio
  if p_operator_id is null and not v_is_supplier then
    raise exception 'operator_id obbligatorio per assegnazioni dirette.' using errcode = '22023';
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

  -- Risoluzione gruppo operativo
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
      values (gen_random_uuid(), p_campaign_id, coalesce(p_metadata->>'supplier_name', 'Fornitore'))
      returning id into v_group_id;
    end if;
  end if;

  -- Validazione profilo operatore SOLO se p_operator_id è fornito
  if p_operator_id is not null then
    if not exists (
      select 1 from public.operator_profiles
      where user_id = p_operator_id
        and active = true
        and disabled_at is null
    ) then
      raise exception 'Operatore non trovato, non attivo o disabilitato (id: %).',
        p_operator_id using errcode = '22023';
    end if;
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

  -- Promozione stato campagna se applicabile
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
        'group_id',     v_group_id,
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

-- 3. Update admin_update_operator_assignment RPC: allow transition from operator_id = NULL to real operator
CREATE OR REPLACE FUNCTION public.admin_update_operator_assignment(
  p_id uuid,
  p_patch jsonb
) RETURNS public.operator_assignments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_admin_id  uuid;
  v_result    public.operator_assignments;
  v_starts    timestamptz;
  v_ends      timestamptz;
  v_curr_op   uuid;
  v_target_op uuid;
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'id obbligatorio.' using errcode = '22023';
  end if;
  if p_patch is null then
    raise exception 'patch non può essere null.' using errcode = '22023';
  end if;

  if p_patch ? 'campaign_id' then
    raise exception 'campaign_id è immutabile dopo la creazione.'
      using errcode = '22023';
  end if;

  select operator_id, starts_at, ends_at
  into v_curr_op, v_starts, v_ends
  from public.operator_assignments
  where id = p_id;

  if not found then
    raise exception 'Assegnazione non trovata (id: %).', p_id
      using errcode = '02000';
  end if;

  -- Se p_patch contiene operator_id:
  -- Consentito se v_curr_op era NULL (transizione supplier handoff -> operatore reale)
  if p_patch ? 'operator_id' then
    v_target_op := (p_patch->>'operator_id')::uuid;
    if v_curr_op is not null and v_curr_op is distinct from v_target_op then
      raise exception 'operator_id è immutabile dopo l''assegnazione iniziale a un operatore.'
        using errcode = '22023';
    end if;

    if v_target_op is not null then
      if not exists (
        select 1 from public.operator_profiles
        where user_id = v_target_op
          and active = true
          and disabled_at is null
      ) then
        raise exception 'Operatore non trovato, non attivo o disabilitato (id: %).',
          v_target_op using errcode = '22023';
      end if;
    end if;
  else
    v_target_op := v_curr_op;
  end if;

  v_starts := coalesce((p_patch->>'starts_at')::timestamptz, v_starts);
  v_ends   := coalesce((p_patch->>'ends_at')::timestamptz,   v_ends);

  if v_ends is not null and v_starts is not null and v_ends <= v_starts then
    raise exception 'ends_at deve essere strettamente successivo a starts_at.'
      using errcode = '22023';
  end if;

  v_admin_id := auth.uid();

  update public.operator_assignments set
    operator_id = v_target_op,
    starts_at   = v_starts,
    ends_at     = v_ends,
    group_id    = coalesce((p_patch->>'group_id')::uuid, group_id),
    zone_id     = coalesce((p_patch->>'zone_id')::uuid,  zone_id),
    metadata    = case
                    when p_patch ? 'metadata'
                    then metadata || (p_patch->'metadata')
                    else metadata
                  end
                  || jsonb_build_object(
                       '_last_updated_by', v_admin_id,
                       '_last_updated_at', now()::text
                     ),
    updated_at  = now()
  where id = p_id
  returning * into v_result;

  begin
    insert into public.audit_log (
      actor_id, action, resource_type, resource_id, success, metadata
    ) values (
      v_admin_id,
      'admin_update_operator_assignment',
      'operator_assignments',
      v_result.id::text,
      true,
      p_patch
    );
  exception when others then
    raise notice 'audit_log insert skipped: %', sqlerrm;
  end;

  return v_result;
end;
$$;

COMMIT;
