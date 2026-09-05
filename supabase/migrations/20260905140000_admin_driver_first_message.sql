-- TICKET — FIX FIRST MESSAGE ADMIN -> DRIVER.
--
-- ROOT CAUSE (confermata su schema/RPC esistenti, migration 20260905131000):
-- la conversazione driver_admin viene creata SOLO da hub_get_or_create_
-- driver_conversation, chiamata finora solo dentro driver_send_message e
-- driver_list_messages (lato Driver). admin_send_message richiede un
-- p_conversation_id GIA' esistente — se il Driver non ha mai scritto, non
-- esiste alcuna conversazione da passare, quindi l'Admin non ha modo di
-- iniziarla. admin_list_conversations, allo stesso modo, elenca solo righe
-- gia' presenti in conversations: un Driver realmente assegnato ma senza
-- conversazione non compare mai nel tab "Driver".
--
-- FIX additivo, nessuna tabella/funzione esistente rimossa:
--   admin_list_driver_directory() — TUTTI gli assignment reali (non solo
--     quelli con gia' una conversazione), con l'eventuale conversazione
--     agganciata via LEFT JOIN.
--   admin_send_driver_message(p_assignment_id, p_text) — get-or-create la
--     conversazione (stessa funzione gia' usata lato Driver) + invia il
--     messaggio come Admin. Funziona identico sia per il primo messaggio
--     sia per i successivi (idempotente), un solo path per l'Admin.
--
-- Nessuna modifica a: GPS, geofence, segnalazioni, Customer messaging,
-- modification requests, pricing, Payments, driver token flow, Admin
-- Magic Link.

begin;

create or replace function public.admin_list_driver_directory()
returns jsonb
  language plpgsql stable security definer set search_path to ''
as $function$
begin
  if not public.gps_is_admin() then raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'assignment_id', a.id,
      'campaign_id', a.campaign_id,
      'campaign_name', camp.campaign_name,
      'zone_name', z.zone_name,
      'assignment_status', a.status,
      'operator_name', coalesce(op.display_name, a.participant_label, a.operator_id::text, a.id::text),
      'conversation_id', c.id,
      'unread_count', coalesce((
        select count(*) from public.conversation_messages m
        where m.conversation_id = c.id and m.recipient_role = 'admin' and m.seen_at is null
      ), 0),
      'last_message', (
        select jsonb_build_object('text', m2.text, 'sender_role', m2.sender_role, 'created_at', m2.created_at)
        from public.conversation_messages m2 where m2.conversation_id = c.id order by m2.created_at desc limit 1
      ),
      'updated_at', coalesce(c.updated_at, a.created_at)
    ) order by coalesce(c.updated_at, a.created_at) desc)
    from public.operator_assignments a
    left join public.campaigns camp on camp.id = a.campaign_id
    left join public.campaign_zones z on z.id = a.zone_id
    left join public.operator_profiles op on op.user_id = a.operator_id
    left join public.conversations c on c.kind = 'driver_admin' and c.assignment_id = a.id
    where a.revoked_at is null
  ), '[]'::jsonb);
end;
$function$;
revoke execute on function public.admin_list_driver_directory() from public, anon;
grant execute on function public.admin_list_driver_directory() to authenticated;

create or replace function public.admin_send_driver_message(p_assignment_id uuid, p_text text)
returns public.conversation_messages
  language plpgsql security definer set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_conv_id uuid;
  v_msg public.conversation_messages%rowtype;
begin
  if not public.gps_is_admin() then raise exception 'ADMIN_NON_AUTORIZZATO' using errcode = '42501'; end if;
  if nullif(btrim(p_text), '') is null then raise exception 'TESTO_VUOTO' using errcode = '22023'; end if;
  -- L'assignment deve essere reale: nessuna chat verso un ID inventato.
  if not exists (select 1 from public.operator_assignments where id = p_assignment_id) then
    raise exception 'ASSEGNAZIONE_NON_VALIDA' using errcode = '22023';
  end if;
  v_conv_id := public.hub_get_or_create_driver_conversation(p_assignment_id);
  insert into public.conversation_messages (conversation_id, sender_role, sender_id, recipient_role, text)
    values (v_conv_id, 'admin', v_uid, 'driver', btrim(p_text))
    returning * into v_msg;
  update public.conversations set updated_at = now() where id = v_conv_id;
  return v_msg;
end;
$function$;
revoke execute on function public.admin_send_driver_message(uuid, text) from public, anon;
grant execute on function public.admin_send_driver_message(uuid, text) to authenticated;

commit;
