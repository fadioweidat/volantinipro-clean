-- GPS — SBLOCCO DISPOSITIVO (admin-only).
--
-- PROPOSTA, NON APPLICATA in questo turno.
--
-- PERCHE' SERVE
-- Con la device-ownership (20260829140000) una delivery_session e' legata al
-- device che l'ha avviata. Se quel dispositivo si perde / si rompe / cambia
-- browser, l'operatore resta bloccato: il nuovo device riceve DEVICE_MISMATCH.
-- Serve un'azione amministrativa esplicita per "liberare" la sessione da quel
-- device senza toccare nulla di storico.
--
-- COSA FA
-- gps_admin_unlock_device(p_session_id) — admin-only:
--   * azzera delivery_sessions.device_id (NULL) => alla prossima apertura del
--     link il nuovo device si lega alla sessione (device_id IS NULL => nessun
--     mismatch, vedi 20260829140000).
--   * NON cambia status/started_at/ended_at/assignment.
--   * NON cancella gps_tracking_points ne' sessioni.
--   * scrive una riga in gps_operator_audit_log (azione 'device_unlocked').
--
-- Idempotente: se device_id e' gia' NULL, ritorna la riga senza errore.
-- Fail closed: solo status 'started'/'paused' (una sessione chiusa non ha
-- bisogno di sblocco device).
--
-- NON tocca: pricing, stampa, Resend, pagamenti, Smart Pairing, geofence,
-- coverage, RLS, grant, dati GPS. Nessun cron/trigger.

begin;

create or replace function public.gps_admin_unlock_device(
  p_session_id uuid,
  p_reason text default null
) returns public.delivery_sessions
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.delivery_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'OPERATORE_NON_AUTENTICATO' using errcode = '42501';
  end if;
  if not public.gps_is_admin() then
    raise exception 'SOLO_ADMIN' using errcode = '42501';
  end if;

  select * into v_session
  from public.delivery_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSIONE_NON_TROVATA' using errcode = 'P0002';
  end if;
  if v_session.status not in ('started', 'paused') then
    raise exception 'SESSIONE_NON_ATTIVA: status=%', v_session.status using errcode = '22023';
  end if;

  update public.delivery_sessions
    set device_id = null,
        updated_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'device_unlocked_by', v_uid,
          'device_unlocked_at', now(),
          'device_unlocked_reason', nullif(btrim(coalesce(p_reason, '')), ''),
          'device_unlocked_previous', v_session.device_id
        )
    where id = p_session_id
    returning * into v_session;

  insert into public.gps_operator_audit_log (
    operator_id, action, campaign_id, assignment_id, session_id
  ) values (
    v_uid, 'device_unlocked', v_session.campaign_id, v_session.assignment_id, v_session.id
  );

  return v_session;
end;
$$;

alter function public.gps_admin_unlock_device(uuid, text) owner to postgres;

revoke all on function public.gps_admin_unlock_device(uuid, text) from public, anon, authenticated;
grant execute on function public.gps_admin_unlock_device(uuid, text) to authenticated;
-- L'enforcement admin resta dentro la funzione (gps_is_admin(), profiles.role
-- riletto server-side) come per tutte le altre RPC GPS admin-aware.

commit;
