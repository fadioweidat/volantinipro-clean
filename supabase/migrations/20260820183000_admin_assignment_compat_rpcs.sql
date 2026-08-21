begin;

-- ============================================================
-- Compatibility RPCs required by current Admin frontend.
-- Rewritten against the modern operator_profiles /
-- operator_assignments schema.
-- ============================================================

-- ------------------------------------------------------------
-- 1. admin_list_operators
-- ------------------------------------------------------------
create or replace function public.admin_list_operators()
returns table (
  id uuid,
  display_name text,
  phone text,
  status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.gps_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;

  return query
  select
    op.user_id as id,
    op.display_name,
    p.phone,
    case
      when op.active and op.disabled_at is null then 'active'
      else 'disabled'
    end as status
  from public.operator_profiles op
  left join public.profiles p
    on p.id = op.user_id
  where op.active
    and op.disabled_at is null
  order by op.display_name asc nulls last, op.created_at desc;
end;
$$;

revoke all on function public.admin_list_operators() from public, anon;
grant execute on function public.admin_list_operators()
  to authenticated, service_role;


-- ------------------------------------------------------------
-- 2. admin_update_operator_assignment
-- ------------------------------------------------------------
create or replace function public.admin_update_operator_assignment(
  p_id uuid,
  p_patch jsonb
)
returns public.operator_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.operator_assignments;
  v_current public.operator_assignments;
  v_starts timestamptz;
  v_ends timestamptz;
begin
  if not public.gps_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'id obbligatorio.'
      using errcode = '22023';
  end if;

  select *
  into v_current
  from public.operator_assignments
  where id = p_id
  for update;

  if not found then
    raise exception 'Assegnazione non trovata.'
      using errcode = 'P0002';
  end if;

  v_starts :=
    case
      when p_patch ? 'starts_at'
        then nullif(p_patch->>'starts_at', '')::timestamptz
      else v_current.starts_at
    end;

  v_ends :=
    case
      when p_patch ? 'ends_at'
        then nullif(p_patch->>'ends_at', '')::timestamptz
      else v_current.ends_at
    end;

  if v_ends is not null
     and v_starts is not null
     and v_ends <= v_starts then
    raise exception 'ends_at deve essere successivo a starts_at.'
      using errcode = '22023';
  end if;

  update public.operator_assignments
  set
    group_id =
      case
        when p_patch ? 'group_id'
          then (p_patch->>'group_id')::uuid
        else group_id
      end,

    starts_at = v_starts,
    ends_at = v_ends,

    metadata =
      case
        when p_patch ? 'metadata'
          then coalesce(metadata, '{}'::jsonb)
               || coalesce(p_patch->'metadata', '{}'::jsonb)
        else metadata
      end,

    updated_at = now()

  where id = p_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_update_operator_assignment(uuid, jsonb)
  from public, anon;

grant execute on function public.admin_update_operator_assignment(uuid, jsonb)
  to authenticated, service_role;


-- ------------------------------------------------------------
-- 3. admin_revoke_operator_assignment
-- ------------------------------------------------------------
create or replace function public.admin_revoke_operator_assignment(
  p_id uuid
)
returns public.operator_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.operator_assignments;
begin
  if not public.gps_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'id obbligatorio.'
      using errcode = '22023';
  end if;

  update public.operator_assignments
  set
    status = 'revoked',
    revoked_at = now(),
    updated_at = now(),
    metadata =
      coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'revoked_by', auth.uid(),
        'revoked_at', now()::text
      )
  where id = p_id
    and status not in ('revoked', 'completed')
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Assegnazione non trovata o già revocata/completata.'
      using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function public.admin_revoke_operator_assignment(uuid)
  from public, anon;

grant execute on function public.admin_revoke_operator_assignment(uuid)
  to authenticated, service_role;

commit;