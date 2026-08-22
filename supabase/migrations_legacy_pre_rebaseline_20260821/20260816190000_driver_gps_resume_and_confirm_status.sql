begin;

-- FASE FINALE DRIVER TOKEN — resume GPS + stato conferma dopo reload (2026-08-16).
--
-- 1) get_active_driver_session: legge SOLO la sessione GPS attiva/in pausa
--    di UNA specifica assignment (mai un elenco globale di delivery_sessions,
--    mai altre assignment) — autorizzata da auth.uid() (percorso
--    autenticato invariato) oppure da access_token (link Driver pubblico),
--    stesso identico pattern di risoluzione gia' usato in
--    20260816160000_driver_gps_access_token.sql per le RPC di scrittura.
create function public.get_active_driver_session(
  p_assignment_id uuid,
  p_access_token text default null
) returns jsonb
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
  as $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
begin
  if p_assignment_id is null then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;

  if v_uid is null then
    if p_access_token is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
    select operator_id into v_uid
    from public.operator_assignments
    where id = p_assignment_id and access_token = p_access_token;
    if v_uid is null then
      raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
    end if;
  else
    if not exists (
      select 1 from public.operator_assignments
      where id = p_assignment_id and operator_id = v_uid
    ) then
      raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
    end if;
  end if;

  select * into v_session
  from public.delivery_sessions s
  where s.assignment_id = p_assignment_id
    and s.driver_id = v_uid
    and s.status in ('started', 'paused')
  order by s.started_at desc nulls last, s.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('session', null);
  end if;

  return jsonb_build_object('session', to_jsonb(v_session));
end;
$$;

revoke all on function public.get_active_driver_session(uuid, text) from public;
grant execute on function public.get_active_driver_session(uuid, text) to anon, authenticated, service_role;

-- 2) get_public_driver_assignment: aggiunge confirmed_at (solo la data
--    dell'evento assignment_program_confirmed, non l'intero event log) cosi'
--    "✓ Programma confermato" resta visibile dopo un reload della pagina
--    Driver — stessa RPC pubblica gia' esistente (assignment_id come
--    segreto, invariato), nessun parametro nuovo, nessun dato aggiuntivo
--    sensibile esposto.
create or replace function public.get_public_driver_assignment(
  p_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.operator_assignments%rowtype;
  v_campaign_title text;
  v_zones jsonb;
  v_available boolean;
  v_confirmed_at timestamptz;
begin
  if p_assignment_id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_assignment
  from public.operator_assignments
  where id = p_assignment_id;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  v_available := v_assignment.status not in ('revoked', 'completed')
    and (v_assignment.starts_at is null or v_assignment.starts_at <= now())
    and (v_assignment.ends_at is null or v_assignment.ends_at > now());

  if not v_available then
    return jsonb_build_object(
      'id', v_assignment.id,
      'status', v_assignment.status,
      'starts_at', v_assignment.starts_at,
      'ends_at', v_assignment.ends_at,
      'error', 'unavailable'
    );
  end if;

  select c.title into v_campaign_title
  from public.campaigns c
  where c.id = v_assignment.campaign_id;

  select ael.created_at into v_confirmed_at
  from public.assignment_event_log ael
  where ael.assignment_id = p_assignment_id
    and ael.event_type = 'assignment_program_confirmed'
  order by ael.created_at asc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(cz.id, oaz.zone_id),
      'zone_name', oaz.municipality_name,
      'priority', coalesce(cz.priority, 999),
      'quantity', coalesce(oaz.quantity, cz.quantity_assigned),
      'status', coalesce(cz.status, 'Da iniziare'),
      'notes', cz.notes,
      'center_lat', cz.center_lat,
      'center_lng', cz.center_lng,
      'radius_m', cz.radius_m
    ) order by coalesce(cz.priority, 999), oaz.municipality_name), '[]'::jsonb)
  into v_zones
  from public.operator_assignment_zones oaz
  left join public.campaign_zones cz on cz.id = oaz.zone_id
  where oaz.assignment_id = p_assignment_id;

  return jsonb_build_object(
    'id', v_assignment.id,
    'campaign_id', v_assignment.campaign_id,
    'campaign_title', v_campaign_title,
    'status', v_assignment.status,
    'starts_at', v_assignment.starts_at,
    'ends_at', v_assignment.ends_at,
    'metadata', v_assignment.metadata,
    'zones', v_zones,
    'confirmed_at', v_confirmed_at
  );
end;
$$;

revoke all on function public.get_public_driver_assignment(uuid) from public, authenticated;
grant execute on function public.get_public_driver_assignment(uuid) to anon, authenticated;

commit;
