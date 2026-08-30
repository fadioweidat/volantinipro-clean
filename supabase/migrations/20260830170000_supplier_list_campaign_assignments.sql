-- Marketplace Fornitore — read path per le assegnazioni operatore GIA' esistenti
-- sulle campagne del Supplier autenticato.
--
-- GAP colmato: la Dashboard Supplier ("Lavori assegnati") non aveva modo di
-- ricostruire, dopo un refresh completo, quali operatori sono gia' assegnati.
-- `operator_assignments_select_policy` (baseline) concede la SELECT solo a
-- `jwt_is_admin() OR operator_id = auth.uid()`: un Supplier non e' ne' l'uno
-- ne' l'altro. Nessuna RPC/vista equivalente esiste (verificato:
-- supplier_list_assigned_campaigns non espone gli operatori;
-- supplier_list_own_operators non ha il legame campagna).
--
-- Questa RPC e' SOLO in lettura, SECURITY DEFINER, search_path bloccato,
-- REVOKE da public/anon, GRANT solo authenticated. L'isolamento e' garantito
-- dal JOIN `campaigns c on c.supplier_id = auth.uid()`: nessun campaign_id
-- arriva dal client, quindi un Supplier vede SOLO le assegnazioni delle
-- proprie campagne. Un Cliente autenticato (nessuna campagna come supplier)
-- riceve zero righe; un anonimo riceve NON_AUTENTICATO.
--
-- Payload minimo: nessun supplier_id di terzi, nessun dato personale
-- dell'operatore oltre display_name, nessun access_token/metadata/pricing/
-- identita' cliente/GPS.

create or replace function public.supplier_list_campaign_assignments()
returns table (
  campaign_id uuid,
  assignment_id uuid,
  operator_id uuid,
  operator_display_name text,
  assignment_status text,
  group_id uuid,
  group_name text,
  created_at timestamptz,
  updated_at timestamptz
)
  language plpgsql
  stable
  security definer
  set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NON_AUTENTICATO' using errcode = '42501';
  end if;

  return query
  select
    a.campaign_id,
    a.id,
    a.operator_id,
    op.display_name,
    a.status,
    a.group_id,
    og.name,
    a.created_at,
    a.updated_at
  from public.operator_assignments a
  join public.campaigns c
    on c.id = a.campaign_id
   and c.supplier_id = v_uid          -- isolamento: SOLO campagne del Supplier
  left join public.operator_profiles op
    on op.user_id = a.operator_id
  left join public.operational_groups og
    on og.id = a.group_id
  order by a.campaign_id, a.created_at;
end;
$$;

alter function public.supplier_list_campaign_assignments() owner to postgres;
revoke all on function public.supplier_list_campaign_assignments() from public, anon;
grant execute on function public.supplier_list_campaign_assignments() to authenticated;
