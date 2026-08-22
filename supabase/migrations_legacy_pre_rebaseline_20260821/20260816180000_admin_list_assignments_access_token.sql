begin;

-- FASE FINALE DRIVER TOKEN — link Admin completi (2026-08-16).
--
-- CampaignAssignments.jsx (Admin, gia' gated da jwt_is_admin() dentro questa
-- stessa funzione) genera link/messaggi WhatsApp per il Driver tramite
-- admin_list_campaign_assignments, che pero' non restituiva access_token —
-- l'unico campo mancante per completare il link pubblico
-- (?access=...) da questa vista. Nessun'altra colonna aggiunta, nessun
-- cambio di permessi: resta admin-only, esattamente come prima.
drop function if exists public.admin_list_campaign_assignments(uuid);

create function public.admin_list_campaign_assignments(p_campaign_id uuid)
returns table (
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
  access_token text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.jwt_is_admin() then
    raise exception 'Accesso negato: richiesto ruolo admin.'
      using errcode = '42501';
  end if;
  if p_campaign_id is null then
    raise exception 'campaign_id obbligatorio.' using errcode = '22023';
  end if;

  return query
    select
      oa.id,
      oa.campaign_id,
      oa.operator_id,
      coalesce(op.display_name, oa.operator_id::text) as operator_name,
      p.phone                                          as operator_phone,
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
      oa.access_token
    from public.operator_assignments oa
    left join public.operator_profiles op on op.user_id = oa.operator_id
    left join public.profiles p            on p.id      = oa.operator_id
    where oa.campaign_id = p_campaign_id
    order by oa.created_at desc;
end;
$$;

revoke all on function public.admin_list_campaign_assignments(uuid) from public;
grant execute on function public.admin_list_campaign_assignments(uuid) to authenticated, service_role;

commit;
