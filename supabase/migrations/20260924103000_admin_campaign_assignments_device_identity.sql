create or replace function public.admin_list_campaign_assignments_v2(p_campaign_id uuid)
returns table(
  id uuid,
  campaign_id uuid,
  operator_id uuid,
  operator_name text,
  operator_phone text,
  group_id uuid,
  zone_id uuid,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  access_token text,
  participant_label text,
  device_installation_id text,
  group_access_link_id uuid
)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.' using errcode='42501';
  end if;
  if p_campaign_id is null then
    raise exception 'campaign_id obbligatorio.' using errcode='22023';
  end if;

  return query
  select
    oa.id,
    oa.campaign_id,
    oa.operator_id,
    coalesce(op.display_name, oa.participant_label, oa.operator_id::text) as operator_name,
    p.phone as operator_phone,
    oa.group_id,
    oa.zone_id,
    oa.status,
    oa.starts_at,
    oa.ends_at,
    oa.revoked_at,
    oa.metadata,
    oa.created_by,
    oa.created_at,
    oa.updated_at,
    oa.access_token,
    oa.participant_label,
    oa.device_installation_id,
    oa.group_access_link_id
  from public.operator_assignments oa
  left join public.operator_profiles op on op.user_id=oa.operator_id
  left join public.profiles p on p.id=oa.operator_id
  where oa.campaign_id=p_campaign_id
  order by oa.created_at desc;
end;
$$;

revoke all on function public.admin_list_campaign_assignments_v2(uuid) from public;
grant execute on function public.admin_list_campaign_assignments_v2(uuid) to authenticated, service_role;
