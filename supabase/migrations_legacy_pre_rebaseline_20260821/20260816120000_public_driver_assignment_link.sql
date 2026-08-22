begin;

-- ROLLBACK DRIVER AUTH — link WhatsApp diretto senza login (2026-08-16).
--
-- Il Driver non fa più login (niente Magic Link/OTP): il link WhatsApp
-- generato dall'Admin è /driver/assignment/{assignmentId} e deve mostrare
-- subito il programma a chiunque apra quel link, senza sessione Supabase.
-- L'UUID dell'assignment (non enumerabile, generato da gen_random_uuid()
-- su operator_assignments) è l'unico segreto: questa funzione legge SOLO la
-- riga richiesta dal chiamante, mai un elenco.
--
-- Espone solo i campi operativi necessari alla pagina Driver: titolo
-- campagna, stato, date, metadata (già usato lato client per comuni/qty/note
-- — stesso campo che l'operatore autenticato vedeva già) e le zone
-- strutturate con quantità/priorità/stato. NON espone operator_id, group_id,
-- prezzi/margini, altri clienti/campagne/operatori.
--
-- A differenza di get_driver_assignment/list_assignment_zones (SEZIONE 7/8
-- in 20260806150009_admin_driver_assignment_flow.sql), che richiedono
-- auth.uid() e restano invariate per qualunque altro consumer autenticato,
-- questa funzione è una lettura pubblica dedicata: nessuna delle due
-- funzioni esistenti viene modificata o ri-concessa ad anon.
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

  -- Denial server-side (non solo lato client): un'assegnazione revocata,
  -- completata, scaduta o non ancora iniziata non deve restituire dati
  -- operativi (zone/quantita'/note) a chi chiama la RPC direttamente con
  -- l'UUID, anche se il frontend (useDriverAssignment.js, INVARIATO) fa gia'
  -- lo stesso controllo sui campi status/starts_at/ends_at restituiti qui
  -- sotto. status/starts_at/ends_at restano SEMPRE presenti nella risposta
  -- (anche quando negata) perche' quel controllo client-side esistente ne
  -- dipende per mostrare il messaggio corretto — non e' stato toccato.
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
    'zones', v_zones
  );
end;
$$;

-- anon incluso deliberatamente: è l'unico modo per soddisfare "link
-- WhatsApp diretto senza login". Nessuna funzione di listato viene concessa
-- ad anon: solo questa lettura per-id.
revoke all on function public.get_public_driver_assignment(uuid) from public, authenticated;
grant execute on function public.get_public_driver_assignment(uuid) to anon, authenticated;

commit;
